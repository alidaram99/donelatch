import path from 'node:path';
import os from 'node:os';
import { lstat, realpath, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { projectRoot, loadConfig, inside, pathKey, relativePath } from './config.mjs';
import { digest } from './state.mjs';

export const HUMAN_TRUST_REQUIRED = 'Check configuration changed or is not approved; a human must run `donelatch trust` in this project. Do not run project checks or approve configuration from the agent.';

export class TrustError extends Error {
  constructor(detail) {
    super(`${HUMAN_TRUST_REQUIRED}${detail ? ` (${detail})` : ''}`);
    this.name = 'TrustError';
  }
}

export function userTrustDirectory({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  if (env.DONELATCH_TRUST_DIR) return env.DONELATCH_TRUST_DIR;
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'DoneLatch', 'trust');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'DoneLatch', 'trust');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'donelatch', 'trust');
}

async function repositoryBoundary(root) {
  let current = root;
  for (let depth = 0; depth < 64; depth++) {
    try { await lstat(path.join(current, '.git')); return current; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(current);
    if (parent === current) return root;
    current = parent;
  }
  throw new TrustError('Repository boundary is too deep to resolve safely');
}

// Resolve existing parents without following symlinks/junctions. Missing leaves
// are allowed for a first approval; short Windows aliases are canonicalized.
async function safeDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) {
    throw new TrustError('Trust directory must be an absolute user-level path');
  }
  const absolute = path.resolve(directory);
  const base = path.parse(absolute).root;
  let current = base;
  let existingAncestor = base;
  const missingParts = [];
  let missing = false;
  for (const part of path.relative(base, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (!missing) {
      let stat;
      try { stat = await lstat(current); }
      catch (error) { if (error.code !== 'ENOENT') throw error; missing = true; }
      if (stat) {
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new TrustError('Trust directory contains a link or non-directory');
        existingAncestor = current;
        continue;
      }
    }
    missingParts.push(part);
  }
  // Resolving only the deepest existing ancestor avoids unnecessary traversal
  // of separately permission-restricted profile parents in an agent sandbox.
  return path.join(await realpath(existingAncestor), ...missingParts);
}

export function configurationFingerprint(loaded) {
  // Pin exact file bytes AND parsed behavior/defaults, including mutations,
  // exclusions, assertion markers, exit codes and timeouts, not just commands.
  return digest({ version: 1, configPath: pathKey(loaded.configPath), sourceHash: loaded.sourceHash, definitions: loaded.config });
}

async function trustLocation(root, loaded, options = {}) {
  const boundary = await repositoryBoundary(root);
  const directory = await safeDirectory(options.trustDir ?? userTrustDirectory());
  if (inside(boundary, directory)) throw new TrustError('Trust approvals must be outside the repository/project');
  const projectId = digest({ projectRoot: pathKey(root), configPath: pathKey(loaded.configPath) });
  return { directory, file: path.join(directory, `${projectId}.json`), projectId };
}

async function approvalFileStat(file) {
  let stat;
  try { stat = await lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 16_384) {
    throw new TrustError('Approval must be a small ordinary unlinked file');
  }
  return stat;
}

async function existingApproval(file) {
  if (!await approvalFileStat(file)) return null;
  let approval;
  try { approval = JSON.parse(await readFile(file, 'utf8')); }
  catch { throw new TrustError('Approval file is invalid'); }
  if (!approval || Array.isArray(approval) || approval.version !== 1 ||
      typeof approval.projectRoot !== 'string' || typeof approval.configPath !== 'string' ||
      !/^[a-f0-9]{64}$/.test(approval.configurationHash ?? '')) {
    throw new TrustError('Approval record is invalid');
  }
  return approval;
}

export async function assertTrustedConfiguration(root, loaded, options = {}) {
  const location = await trustLocation(root, loaded, options);
  const approval = await existingApproval(location.file);
  const configurationHash = configurationFingerprint(loaded);
  if (!approval || pathKey(approval.projectRoot) !== pathKey(root) ||
      pathKey(approval.configPath) !== pathKey(loaded.configPath) || approval.configurationHash !== configurationHash) {
    throw new TrustError();
  }
  return { trusted: true, configurationHash, approvalFile: location.file };
}

// Presence, not valid content: deleting a once-approved policy must not turn a
// guarded project into an opt-out. Corrupt/link-backed approvals fail closed.
export async function hasConfigurationApproval(root, options = {}) {
  let ancestorDirectory;
  if (options.ancestorOnly) {
    ancestorDirectory = await safeDirectory(options.trustDir ?? userTrustDirectory());
    // Such an ancestor could never have received a legitimate outside-project
    // approval. Do not confuse that absence with an unsafe selected project.
    if (inside(path.resolve(root), ancestorDirectory)) return false;
  }
  root = await projectRoot(root);
  // The host can supply a Windows 8.3 alias. Canonicalize it before the
  // containment check too, so RUNNER~1 does not become a false trust refusal.
  if (options.ancestorOnly && inside(root, ancestorDirectory)) return false;
  const configPath = relativePath(options.configPath ?? 'receipts.yml');
  const location = await trustLocation(root, { configPath }, options);
  return Boolean(await approvalFileStat(location.file));
}

export async function inspectConfiguration(root, options = {}) {
  root = await projectRoot(root);
  const loaded = await loadConfig(root, options.configPath);
  const location = await trustLocation(root, loaded, options);
  return { root, configPath: loaded.configPath, configurationHash: configurationFingerprint(loaded),
    approvalFile: location.file, definitions: loaded.config, excludes: loaded.excludes };
}

// Low-level library primitive for an explicitly reviewed hash. The CLI below is
// interactive; this function is also used for owned test/demo fixtures. This is
// not human authentication against other code running as the same OS user.
export async function approveReviewedConfiguration(root, options = {}) {
  const review = await inspectConfiguration(root, options);
  if (!/^[a-f0-9]{64}$/.test(options.reviewedHash ?? '') || options.reviewedHash !== review.configurationHash) {
    throw new TrustError('Configuration changed after review; review the current configuration again');
  }
  const directory = path.dirname(review.approvalFile);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const current = await inspectConfiguration(root, options);
  if (current.configurationHash !== review.configurationHash || current.approvalFile !== review.approvalFile) {
    throw new TrustError('Configuration or approval location changed during review');
  }
  await approvalFileStat(review.approvalFile); // A human can repair invalid JSON, never a linked/special file.
  const record = { version: 1, projectRoot: review.root, configPath: review.configPath,
    configurationHash: review.configurationHash, approvedAt: new Date().toISOString() };
  const temporary = path.join(directory, `.${randomBytes(16).toString('hex')}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, review.approvalFile);
  } finally {
    await rm(temporary, { force: true });
  }
  return { ok: true, configurationHash: review.configurationHash, approvalFile: review.approvalFile };
}

export async function trustProject(root, options = {}) {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  if (input.isTTY !== true || output.isTTY !== true || options.json) {
    throw new TrustError('Human approval requires an interactive terminal; no --yes or JSON approval mode is supported');
  }
  const review = await inspectConfiguration(root, options);
  output.write('DoneLatch HUMAN REVIEW — no checks will run during approval.\n');
  // JSON escaping prevents terminal control sequences from hiding arguments.
  output.write(`${JSON.stringify({ projectRoot: review.root, configPath: review.configPath,
    execution: { cwd: review.root, shell: false, environment: 'inherits your current environment',
      faultChecks: 'same approved commands run in temporary copies; not a sandbox' },
    definitions: review.definitions, effectiveExcludes: review.excludes,
    configurationHash: review.configurationHash, approvalFile: review.approvalFile }, null, 2)
    .replace(/[\p{Bidi_Control}\u007f-\u009f]/gu,
      (character) => `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`)}\n`);
  output.write('Review the executable, every argument, referenced scripts and their side effects.\n');
  const terminal = createInterface({ input, output });
  let answer;
  try { answer = await terminal.question(`Type APPROVE ${review.configurationHash} to trust these exact definitions: `); }
  finally { terminal.close(); }
  if (answer !== `APPROVE ${review.configurationHash}`) throw new TrustError('Human approval was cancelled');
  return approveReviewedConfiguration(review.root, { ...options, reviewedHash: review.configurationHash });
}
