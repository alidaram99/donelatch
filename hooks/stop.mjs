#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { lstat } from 'node:fs/promises';

const vendors = new Set(['claude', 'codex', 'gemini', 'cursor']);
const cliPath = fileURLToPath(new URL('../bin/receipts.mjs', import.meta.url)).replaceAll('\\', '/');

/** Translate a verification result without changing it or manufacturing a receipt. */
export function hookResponse(vendor, input, verification) {
  if (!vendors.has(vendor)) throw new Error(`Unsupported hook vendor: ${vendor}`);
  if (vendor === 'cursor' && input.status !== 'completed') return {};
  if (verification.ok === true) return {};
  if (verification.configured === false) {
    const message = 'DoneLatch: NOT CONFIGURED for this project. No receipt was checked or accepted. '
      + 'Initialize receipts.yml if you want acceptance evidence here.';
    return vendor === 'cursor' ? {} : { systemMessage: message };
  }

  const details = Array.isArray(verification.reasons)
    ? verification.reasons.filter((value) => typeof value === 'string').join('; ').slice(0, 1400)
    : 'The current state has no verified receipt.';
  const reason = `DoneLatch: UNVERIFIED. ${details || 'The current state has no verified receipt.'} `
    + `After your last edit, run node "${cliPath}" run, then node "${cliPath}" faultcheck, `
    + `then node "${cliPath}" verify-done. If blocked, report the remaining failure rather than claiming acceptance.`;
  const retried = input.stop_hook_active === true
    || (vendor === 'cursor' && Number(input.loop_count ?? 0) >= 1);

  if (retried) {
    const message = `DoneLatch: UNVERIFIED after one continuation. ${details} `
      + 'Automatic retries have stopped. This is not an accepted outcome; receipts verify-done still fails.';
    // Cursor stop supports no user-message field. stderr is visible in the Hooks output channel.
    return vendor === 'cursor' ? {} : { systemMessage: message };
  }
  if (vendor === 'cursor') return { followup_message: reason };
  return { decision: vendor === 'gemini' ? 'deny' : 'block', reason };
}

async function exists(location) {
  try { await lstat(location); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

/** Find configuration upward without crossing the nearest repository boundary. */
export async function resolveProjectRoot(cwd, pinnedRoot) {
  const start = pinnedRoot ?? cwd;
  if (typeof start !== 'string' || !path.isAbsolute(start)) {
    throw new Error('Host must provide an absolute project working directory.');
  }
  let root = path.resolve(start);
  for (let depth = 0; depth < 64; depth += 1) {
    if (await exists(path.join(root, 'receipts.yml'))) return { root, configured: true };
    if (pinnedRoot !== undefined || await exists(path.join(root, '.git'))) {
      return { root, configured: false };
    }
    const parent = path.dirname(root);
    if (parent === root) return { root, configured: false };
    root = parent;
  }
  throw new Error('Project-root discovery exceeded 64 ancestors; set DONELATCH_PROJECT_ROOT.');
}

async function readInput(stream) {
  let input = '';
  for await (const chunk of stream) {
    input += chunk.toString();
    if (Buffer.byteLength(input, 'utf8') > 128 * 1024) throw new Error('Hook input exceeds 128 KiB.');
  }
  const value = JSON.parse(input);
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Hook input must be a JSON object.');
  }
  return value;
}

/** Exported for plugin launchers; stdout contains exactly one JSON object. */
export async function runHook(vendor, dependencies = {}) {
  const output = dependencies.output ?? process.stdout;
  const error = dependencies.error ?? process.stderr;
  if (!vendors.has(vendor)) {
    error.write(`DoneLatch: unsupported hook vendor ${String(vendor)}.\n`);
    process.exitCode = 1;
    return;
  }
  let input = dependencies.input ?? {};
  let verification;
  try {
    input = dependencies.input ?? await readInput(process.stdin);
    if (vendor === 'cursor' && input.status !== 'completed') {
      output.write('{}\n');
      return;
    }
    let root = process.env.DONELATCH_PROJECT_ROOT || input.cwd || (vendor === 'cursor' && process.env.CURSOR_PROJECT_DIR)
      || (vendor === 'claude' && process.env.CLAUDE_PROJECT_DIR);
    if (!root && vendor === 'cursor' && Array.isArray(input.workspace_roots)) {
      if (input.workspace_roots.length !== 1) throw new Error('Choose one configured project in a multi-root workspace.');
      root = input.workspace_roots[0];
    }
    if (typeof root !== 'string' || !path.isAbsolute(root)) {
      throw new Error('Host must provide an absolute project working directory.');
    }
    const resolveRoot = dependencies.resolveRoot ?? resolveProjectRoot;
    const project = await resolveRoot(root, process.env.DONELATCH_PROJECT_ROOT);
    if (project.configured === false) {
      verification = { ok: false, configured: false, reasons: ['No receipts.yml in this project.'] };
    } else {
      const verify = dependencies.verify ?? (await import('../bundle/verify.mjs')).verifyDone;
      verification = await verify(project.root, { configPath: 'receipts.yml' });
    }
    if (!verification || typeof verification.ok !== 'boolean') {
      throw new Error('Verifier returned an invalid result.');
    }
  } catch (failure) {
    verification = { ok: false, reasons: [`Verification error: ${failure.message}`] };
  }

  const response = hookResponse(vendor, input, verification);
  if (verification.ok !== true) {
    const warning = response.systemMessage
      ?? (verification.configured === false
        ? 'DoneLatch: NOT CONFIGURED for this project. No receipt was checked or accepted.'
        : `DoneLatch: UNVERIFIED. ${(verification.reasons ?? []).join('; ')}`);
    error.write(`${warning}\n`);
  }
  output.write(`${JSON.stringify(response)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await runHook(process.argv[2]);
}
