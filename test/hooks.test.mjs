import test from 'node:test';
import assert from 'node:assert/strict';
import { hookResponse, runHook, resolveProjectRoot } from '../hooks/stop.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const invalid = { ok: false, reasons: ['No receipt after last edit.'] };

for (const vendor of ['claude', 'codex', 'gemini', 'cursor']) {
  test(`${vendor}: accepts only the verifier's true result`, () => {
    assert.deepEqual(hookResponse(vendor, { status: 'completed' }, { ok: true }), {});
    const output = hookResponse(vendor, { status: 'completed' }, invalid);
    assert.equal(output.decision ?? Boolean(output.followup_message),
      vendor === 'cursor' ? true : vendor === 'gemini' ? 'deny' : 'block');
    assert.match(output.reason ?? output.followup_message, /UNVERIFIED/);
    assert.match(output.reason ?? output.followup_message, /faultcheck/);
  });
  test(`${vendor}: a retry cap never creates a successful result`, () => {
    const output = hookResponse(vendor,
      { status: 'completed', stop_hook_active: true, loop_count: 1 }, invalid);
    assert.equal(output.decision, undefined);
    assert.equal(output.followup_message, undefined);
    if (vendor !== 'cursor') assert.match(output.systemMessage, /not an accepted outcome/);
  });
}

test('Cursor aborted/error loops do not launch another turn', () => {
  assert.deepEqual(hookResponse('cursor', { status: 'aborted' }, invalid), {});
  assert.deepEqual(hookResponse('cursor', { status: 'error' }, invalid), {});
});

test('a verifier failure emits one JSON decision and a stderr warning', async () => {
  let stdout = '';
  let stderr = '';
  await runHook('codex', {
    input: { cwd: process.cwd(), stop_hook_active: false },
    resolveRoot: async (root) => ({ root, configured: true }),
    verify: async () => { throw new Error('Broken configuration'); },
    output: { write: (text) => { stdout += text; } },
    error: { write: (text) => { stderr += text; } }
  });
  const result = JSON.parse(stdout);
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /Broken configuration/);
  assert.match(stderr, /UNVERIFIED/);
  assert.equal(stdout.trim().split('\n').length, 1);
});

test('Cursor retry failure is visible on stderr despite no supported message field', async () => {
  let stdout = '';
  let stderr = '';
  await runHook('cursor', {
    input: { cwd: process.cwd(), status: 'completed', loop_count: 1 },
    resolveRoot: async (root) => ({ root, configured: true }),
    verify: async () => invalid,
    output: { write: (text) => { stdout += text; } },
    error: { write: (text) => { stderr += text; } }
  });
  assert.deepEqual(JSON.parse(stdout), {});
  assert.match(stderr, /UNVERIFIED/);
});

async function fixture(t) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'donelatch-hook-test-'));
  t.after(async () => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(folder));
    assert(!relative.startsWith('..') && !path.isAbsolute(relative));
    assert(path.basename(folder).startsWith('donelatch-hook-test-'));
    await rm(folder, { recursive: true, force: true });
  });
  return folder;
}

test('discovers acceptance configuration from a project subdirectory', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.git'));
  await mkdir(path.join(root, 'src', 'nested'), { recursive: true });
  await writeFile(path.join(root, 'receipts.yml'), 'version: 1\n');
  assert.deepEqual(await resolveProjectRoot(path.join(root, 'src', 'nested')), { root, configured: true });
});

test('does not cross the closest repository boundary to inherit parent acceptance', async (t) => {
  const outer = await fixture(t);
  await writeFile(path.join(outer, 'receipts.yml'), 'version: 1\n');
  const inner = path.join(outer, 'other-project');
  await mkdir(path.join(inner, '.git'), { recursive: true });
  await mkdir(path.join(inner, 'src'));
  assert.deepEqual(await resolveProjectRoot(path.join(inner, 'src')), { root: inner, configured: false });
});

test('an explicit root never silently inherits an ancestor configuration', async (t) => {
  const outer = await fixture(t);
  await writeFile(path.join(outer, 'receipts.yml'), 'version: 1\n');
  const inner = path.join(outer, 'pinned-project');
  await mkdir(inner);
  assert.deepEqual(await resolveProjectRoot(outer, inner), { root: inner, configured: false });
});

test('unconfigured projects are visibly skipped without invoking a verifier', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.git'));
  let stdout = '';
  let called = false;
  await runHook('claude', {
    input: { cwd: root },
    verify: async () => { called = true; return { ok: true }; },
    output: { write: (text) => { stdout += text; } },
    error: { write: () => {} }
  });
  assert.equal(called, false);
  const message = JSON.parse(stdout).systemMessage;
  assert.match(message, /NOT CONFIGURED/);
  assert.match(message, /No receipt was checked or accepted/);
});

test('a missing host directory never verifies the plugin directory by accident', async () => {
  let stdout = '';
  let called = false;
  const previous = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
  try {
    await runHook('codex', {
      input: { stop_hook_active: false },
      verify: async () => { called = true; return { ok: true }; },
      output: { write: (text) => { stdout += text; } },
      error: { write: () => {} }
    });
    assert.equal(called, false);
    assert.equal(JSON.parse(stdout).decision, 'block');
  } finally {
    if (previous !== undefined) process.env.CLAUDE_PROJECT_DIR = previous;
  }
});

test('Cursor workspace identity does not inherit another vendor project environment', async (t) => {
  const target = await fixture(t);
  const other = await fixture(t);
  await writeFile(path.join(target, 'receipts.yml'), 'version: 1\n');
  await writeFile(path.join(other, 'receipts.yml'), 'version: 1\n');
  const previousClaude = process.env.CLAUDE_PROJECT_DIR;
  const previousCursor = process.env.CURSOR_PROJECT_DIR;
  process.env.CLAUDE_PROJECT_DIR = other;
  delete process.env.CURSOR_PROJECT_DIR;
  let verifiedRoot;
  try {
    await runHook('cursor', {
      input: { status: 'completed', workspace_roots: [target] },
      verify: async (root) => { verifiedRoot = root; return { ok: true }; },
      output: { write: () => {} },
      error: { write: () => {} }
    });
    assert.equal(verifiedRoot, target);
  } finally {
    if (previousClaude === undefined) delete process.env.CLAUDE_PROJECT_DIR;
    else process.env.CLAUDE_PROJECT_DIR = previousClaude;
    if (previousCursor !== undefined) process.env.CURSOR_PROJECT_DIR = previousCursor;
  }
});

test('spawned release hooks accept real receipts and reject a later source edit', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'value.mjs'), 'export const value = "ok";\n');
  await writeFile(path.join(root, 'check.mjs'), `import { value } from './value.mjs';
if (value !== 'ok') { console.error('ASSERT_LITERAL: wrong value'); process.exitCode = 1; }
`);
  await writeFile(path.join(root, 'receipts.yml'), JSON.stringify({
    version: 1,
    checks: [{ id: 'literal', command: 'node', args: ['check.mjs'], failureExitCodes: [1], failureMarker: 'ASSERT_LITERAL' }],
    faults: [{ id: 'wrong-value', file: 'value.mjs', find: '"ok"', replace: '"broken"', checkIds: ['literal'] }],
    exclude: []
  }));
  const { runChecks, faultcheck, verifyDone } = await import('../bundle/core.mjs');
  assert.equal((await runChecks(root)).status, 'passed');
  assert.equal((await faultcheck(root)).status, 'passed');
  assert.equal((await verifyDone(root)).ok, true);
  const entrypoint = fileURLToPath(new URL('../hooks/stop.mjs', import.meta.url));
  function invoke(vendor, retry = false) {
    const result = spawnSync(process.execPath, [entrypoint, vendor], {
      cwd: root,
      input: JSON.stringify({ cwd: root, status: 'completed', loop_count: retry ? 1 : 0, stop_hook_active: retry }),
      encoding: 'utf8',
      timeout: 30000,
      env: { ...process.env, DONELATCH_PROJECT_ROOT: root }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim().split('\n').length, 1);
    return { json: JSON.parse(result.stdout), stderr: result.stderr };
  }
  for (const vendor of ['claude', 'codex', 'gemini', 'cursor']) {
    assert.deepEqual(invoke(vendor).json, {});
  }
  await writeFile(path.join(root, 'value.mjs'), 'export const value = "ok";\n// new unverified edit\n');
  for (const vendor of ['claude', 'codex', 'gemini', 'cursor']) {
    const result = invoke(vendor);
    assert.equal(result.json.decision ?? Boolean(result.json.followup_message),
      vendor === 'cursor' ? true : vendor === 'gemini' ? 'deny' : 'block');
    assert.match(result.stderr, /UNVERIFIED/);
    const retry = invoke(vendor, true);
    assert.equal(retry.json.decision, undefined);
    assert.equal(retry.json.followup_message, undefined);
    assert.match(retry.stderr, /UNVERIFIED/);
  }
  assert.equal((await verifyDone(root)).ok, false, 'Allowing the host to stop after the retry cap must not accept the state.');
});
