import path from 'node:path';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { parseDocument } from 'yaml';

export const DEFAULT_EXCLUDES = ['.git', '.receipts', 'node_modules'];
export const pathKey = value => process.platform === 'win32' ? value.toLowerCase() : value;
export function fail(message) { throw new Error(message); }
export function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export function relativePath(value, label = 'path') {
  if (typeof value !== 'string' || !value || value.includes('\0') || path.isAbsolute(value) || /^[A-Za-z]:/.test(value)) fail(`${label} must be a relative path`);
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').some(p => p === '..' || p === '' || p === '.' || p.includes(':') || /[. ]$/.test(p) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) fail(`${label} contains unsafe path components`);
  return normalized;
}
export async function safePath(root, relative, { allowMissing = false, ordinaryFile = false } = {}) {
  relative = relativePath(relative);
  const absolute = path.resolve(root, relative);
  if (!inside(root, absolute)) fail('Path escapes project root');
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    let stat;
    try { stat = await lstat(current); } catch (error) {
      if (allowMissing && error.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) fail(`Symlink/junction is unsupported: ${relative}`);
    if (ordinaryFile && current === absolute && (!stat.isFile() || stat.nlink > 1)) fail(`Protected path must be an ordinary unlinked file: ${relative}`);
  }
  return absolute;
}
export async function projectRoot(root) {
  root = path.resolve(root);
  if ((await lstat(root)).isSymbolicLink()) fail('Project root may not be a symlink/junction');
  return realpath(root);
}
function keysOnly(object, allowed, label) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) fail(`${label} must be an object`);
  for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`Unknown ${label} field: ${key}`);
}
export async function loadConfig(root, configPath = 'receipts.yml') {
  const configFile = await safePath(root, configPath);
  const text = await readFile(configFile, 'utf8');
  if (Buffer.byteLength(text) > 256_000) fail('Config exceeds 256 KB');
  const document = parseDocument(text, { uniqueKeys: true, maxAliasCount: 0 });
  if (document.errors.length) fail(`Invalid YAML: ${document.errors[0].message}`);
  const config = document.toJS({ maxAliasCount: 0 });
  keysOnly(config, ['version', 'checks', 'faults', 'exclude'], 'config');
  if (config.version !== 1) fail('Config version must be 1');
  if (!Array.isArray(config.checks) || config.checks.length < 1 || config.checks.length > 16) fail('Configure 1–16 acceptance checks');
  if (!Array.isArray(config.faults) || config.faults.length < 1 || config.faults.length > 16) fail('Configure 1–16 explicit faults; no proof of fault sensitivity without a fault');
  const ids = new Set();
  for (const check of config.checks) {
    keysOnly(check, ['id', 'command', 'args', 'timeoutMs', 'failureExitCodes', 'failureMarker'], 'check');
    if (typeof check.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(check.id) || ids.has(check.id)) fail('Checks need unique lowercase ids');
    ids.add(check.id);
    if (typeof check.command !== 'string' || !check.command || check.command.includes('\0') || /[\r\n]/.test(check.command)) fail('Check command must be a single executable; use args, not a shell string');
    if (!Array.isArray(check.args) || check.args.length > 128 || check.args.some(x => typeof x !== 'string' || x.includes('\0'))) fail('Check args must be an array of strings');
    check.timeoutMs ??= 30_000;
    if (!Number.isInteger(check.timeoutMs) || check.timeoutMs < 50 || check.timeoutMs > 120_000) fail('timeoutMs must be 50–120000');
    if (!Array.isArray(check.failureExitCodes) || check.failureExitCodes.length < 1 || check.failureExitCodes.some(n => !Number.isInteger(n) || n < 1 || n > 125)) fail('failureExitCodes must contain explicit assertion exit codes 1–125');
    if (typeof check.failureMarker !== 'string' || check.failureMarker.length < 4 || check.failureMarker.length > 256 || /[\r\n\0]/.test(check.failureMarker)) fail('failureMarker must be a literal assertion marker (4–256 characters)');
  }
  const faultIds = new Set();
  for (const fault of config.faults) {
    keysOnly(fault, ['id', 'file', 'find', 'replace', 'checkIds'], 'fault');
    if (typeof fault.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(fault.id) || faultIds.has(fault.id)) fail('Faults need unique lowercase ids');
    faultIds.add(fault.id);
    fault.file = relativePath(fault.file, 'fault.file');
    if (fault.file.split('/').some(p => ['.git','.receipts','node_modules'].includes(p.toLowerCase())) || pathKey(fault.file) === pathKey(relativePath(configPath))) fail('Fault may not target config, keys, git metadata or dependencies');
    if (typeof fault.find !== 'string' || !fault.find || Buffer.byteLength(fault.find) > 64_000 || typeof fault.replace !== 'string' || Buffer.byteLength(fault.replace) > 64_000 || fault.find === fault.replace) fail('Fault needs distinct literal find/replace strings, at most 64 KB');
    if (!Array.isArray(fault.checkIds) || fault.checkIds.length < 1 || new Set(fault.checkIds).size !== fault.checkIds.length || fault.checkIds.some(id => !ids.has(id))) fail('Fault checkIds must name configured acceptance checks');
  }
  config.exclude ??= [];
  if (!Array.isArray(config.exclude) || config.exclude.length > 64) fail('exclude must be an array of directory/path prefixes');
  config.exclude = config.exclude.map(p => relativePath(p, 'exclude'));
  const excludes = [...new Set([...DEFAULT_EXCLUDES, ...config.exclude])];
  const matchesExclude = relative => excludes.some(p => pathKey(relative) === pathKey(p) || pathKey(relative).startsWith(`${pathKey(p)}/`));
  if (matchesExclude(relativePath(configPath)) || config.faults.some(f => matchesExclude(f.file))) fail('Acceptance config and fault targets must be inside the watched scope');
  return { config, configPath: relativePath(configPath), excludes };
}
