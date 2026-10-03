import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile, rm, lstat, symlink, link } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { inspectConfiguration, approveReviewedConfiguration, trustProject, userTrustDirectory } from '../src/trust.mjs';
import { runChecks, faultcheck, verifyDone } from '../src/index.mjs';
import { hookResponse } from '../hooks/stop.mjs';

const cli = fileURLToPath(new URL('../bin/receipts.mjs', import.meta.url));
const hook = fileURLToPath(new URL('../hooks/stop.mjs', import.meta.url));
const vendors = ['claude', 'codex', 'gemini', 'cursor'];

async function fixture(t) {
  const container = await mkdtemp(path.join(os.tmpdir(), 'donelatch-security-trust-'));
  t.after(async () => {
    assert(path.basename(container).startsWith('donelatch-security-trust-'));
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(container));
    assert(!relative.startsWith('..') && !path.isAbsolute(relative));
    await rm(container, { recursive: true, force: true });
  });
  const root = path.join(container, 'project');
  const trustDir = path.join(container, 'human-approvals');
  await mkdir(root);
  await mkdir(path.join(root, '.git'));
  await writeFile(path.join(root, 'value.mjs'), 'export const value = "ok";\n');
  await writeFile(path.join(root, 'check.mjs'), `import { value } from './value.mjs';
if(value !== 'ok') { console.error('ASSERT_TRUST_CONTRACT'); process.exitCode = 1; }
`);
  const config = { version: 1,
    checks: [{ id: 'literal', command: 'node', args: ['check.mjs'], timeoutMs: 3000,
      failureExitCodes: [1], failureMarker: 'ASSERT_TRUST_CONTRACT' }],
    faults: [{ id: 'wrong-value', file: 'value.mjs', find: '"ok"', replace: '"broken"', checkIds: ['literal'] }],
    exclude: [] };
  const raw = JSON.stringify(config, null, 2);
  await writeFile(path.join(root, 'receipts.yml'), raw);
  const options = { trustDir };
  async function approve() {
    const review = await inspectConfiguration(root, options);
    return approveReviewedConfiguration(root, { ...options, reviewedHash: review.configurationHash });
  }
  return { container, root, trustDir, config, raw, options, approve };
}

function invoke(f, vendor, retry = false) {
  const result = spawnSync(process.execPath, [hook, vendor], { cwd: f.root, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, DONELATCH_TRUST_DIR: f.trustDir, DONELATCH_PROJECT_ROOT: f.root },
    input: JSON.stringify({ cwd: f.root, status: 'completed', stop_hook_active: retry, loop_count: retry ? 1 : 0 }) });
  assert.equal(result.status, 0, result.stderr);
  return { json: JSON.parse(result.stdout), stderr: result.stderr };
}

function assertHumanOnly(result, vendor) {
  assert.equal(result.json.decision ?? Boolean(result.json.followup_message),
    vendor === 'cursor' ? true : vendor === 'gemini' ? 'deny' : 'block');
  const message = result.json.reason ?? result.json.followup_message;
  assert.match(message, /a human must run `donelatch trust`/);
  assert.doesNotMatch(`${message}\n${result.stderr}`, /faultcheck|receipts\.mjs|After your last edit/);
}

test('unapproved checks cannot execute; every completed host turn gets a human-only denial, even after retry', async (t) => {
  const f = await fixture(t);
  for (const operation of [runChecks, faultcheck]) await assert.rejects(() => operation(f.root, f.options), /a human must run `donelatch trust`/);
  assert.equal((await verifyDone(f.root, f.options)).trustRequired, true);
  for (const vendor of vendors) for (const retry of [false, true]) assertHumanOnly(invoke(f, vendor, retry), vendor);
});

test('trusted definitions enable normal correction, real execution and accepted receipts; tampered args never execute', async (t) => {
  const f = await fixture(t);
  await f.approve();
  for (const vendor of vendors) {
    const result = invoke(f, vendor);
    assert.match(result.json.reason ?? result.json.followup_message, /faultcheck/);
  }
  assert.equal((await faultcheck(f.root, f.options)).status, 'passed');
  assert.equal((await runChecks(f.root, f.options)).status, 'passed');
  for (const vendor of vendors) assert.deepEqual(invoke(f, vendor).json, {});
  f.config.checks[0].args = ['-e', "require('node:fs').writeFileSync('UNAPPROVED_PAYLOAD_EXECUTED','bad')"];
  await writeFile(path.join(f.root, 'receipts.yml'), JSON.stringify(f.config));
  for (const vendor of vendors) for (const retry of [false, true]) assertHumanOnly(invoke(f, vendor, retry), vendor);
  for (const action of ['run', 'faultcheck', 'verify-done']) {
    const result = spawnSync(process.execPath, [cli, action, '--root', f.root, '--json'], {
      encoding: 'utf8', timeout: 30000, env: { ...process.env, DONELATCH_TRUST_DIR: f.trustDir } });
    assert.notEqual(result.status, 0);
    assert.equal(JSON.parse(result.stdout).ok, false);
  }
  await assert.rejects(() => lstat(path.join(f.root, 'UNAPPROVED_PAYLOAD_EXECUTED')), { code: 'ENOENT' });
});

test('approval pins all execution/acceptance definitions and exact source bytes, not just executable names', async (t) => {
  const f = await fixture(t);
  await f.approve();
  const changes = [
    config => { config.checks[0].command = 'different-executable'; },
    config => { config.checks[0].timeoutMs += 1; },
    config => { config.checks[0].failureMarker += '_DIFFERENT'; },
    config => { config.checks[0].failureExitCodes = [2]; },
    config => { config.faults[0].replace = '"other"'; },
    config => { config.exclude = ['generated']; }
  ];
  for (const change of changes) {
    const config = JSON.parse(f.raw); change(config);
    await writeFile(path.join(f.root, 'receipts.yml'), JSON.stringify(config, null, 2));
    const result = await verifyDone(f.root, f.options);
    assert.equal(result.trustRequired, true);
    for (const vendor of vendors) assertHumanOnly(invoke(f, vendor), vendor);
  }
  await writeFile(path.join(f.root, 'receipts.yml'), `# new configuration comment\n${f.raw}`);
  assert.equal((await verifyDone(f.root, f.options)).trustRequired, true);
  await writeFile(path.join(f.root, 'receipts.yml'), f.raw);
  assert.equal((await verifyDone(f.root, f.options)).trustValidated, true);
});

test('malformed YAML and malformed host input fail closed without suggesting check execution', async (t) => {
  const f = await fixture(t);
  await f.approve();
  await writeFile(path.join(f.root, 'receipts.yml'), '{');
  for (const vendor of vendors) {
    assertHumanOnly(invoke(f, vendor), vendor);
    const result = spawnSync(process.execPath, [hook, vendor], { cwd: f.root, encoding: 'utf8', timeout: 30000,
      input: '{', env: { ...process.env, DONELATCH_TRUST_DIR: f.trustDir, DONELATCH_PROJECT_ROOT: f.root } });
    assertHumanOnly({ json: JSON.parse(result.stdout), stderr: result.stderr }, vendor);
  }
});

test('deleting an approved policy cannot opt out of trust denial, with or without Git metadata', async (t) => {
  for (const git of [true, false]) {
    const f = await fixture(t);
    if (!git) await rm(path.join(f.root, '.git'), { recursive: true });
    await f.approve();
    await rm(path.join(f.root, 'receipts.yml'));
    for (const vendor of vendors) for (const retry of [false, true]) assertHumanOnly(invoke(f, vendor, retry), vendor);
  }
});

test('new nested Git metadata cannot silently opt out of an approved ancestor during automatic discovery', async (t) => {
  const f = await fixture(t);
  await f.approve();
  const nested = path.join(f.root, 'src');
  await mkdir(path.join(nested, '.git'), { recursive: true });
  const env = { ...process.env, DONELATCH_TRUST_DIR: f.trustDir };
  delete env.DONELATCH_PROJECT_ROOT;
  for (const vendor of vendors) {
    const result = spawnSync(process.execPath, [hook, vendor], { cwd: nested, encoding: 'utf8', timeout: 30000, env,
      input: JSON.stringify({ cwd: nested, status: 'completed', stop_hook_active: true, loop_count: 1 }) });
    assert.equal(result.status, 0, result.stderr);
    assertHumanOnly({ json: JSON.parse(result.stdout), stderr: result.stderr }, vendor);
  }
});

test('truly unconfigured non-Git projects remain opt-in skips even when ancestors contain the user trust directory', async (t) => {
  const f = await fixture(t);
  await rm(path.join(f.root, '.git'), { recursive: true });
  await rm(path.join(f.root, 'receipts.yml'));
  const env = { ...process.env, DONELATCH_TRUST_DIR: f.trustDir };
  delete env.DONELATCH_PROJECT_ROOT;
  for (const vendor of vendors) {
    const result = spawnSync(process.execPath, [hook, vendor], { cwd: f.root, encoding: 'utf8', timeout: 30000, env,
      input: JSON.stringify({ cwd: f.root, status: 'completed' }) });
    assert.equal(result.status, 0, result.stderr);
    const response = JSON.parse(result.stdout);
    assert.equal(response.decision, undefined);
    assert.equal(response.followup_message, undefined);
    assert.match(result.stderr, /NOT CONFIGURED/);
    assert.doesNotMatch(result.stderr, /faultcheck/);
  }
});

test('a forged passing verifier result with no validated trust cannot accept any host completion', () => {
  for (const vendor of vendors) assertHumanOnly({ json: hookResponse(vendor, { status: 'completed' }, { ok: true }), stderr: '' }, vendor);
});

test('in-repository or relative approval locations are refused, including a parent repo around the configured subproject', async (t) => {
  const f = await fixture(t);
  await assert.rejects(() => inspectConfiguration(f.root, { trustDir: path.join(f.root, '.receipts', 'approvals') }), /outside the repository/);
  await assert.rejects(() => inspectConfiguration(f.root, { trustDir: 'relative-approvals' }), /absolute user-level/);
  const nested = path.join(f.root, 'nested'); await mkdir(nested);
  await writeFile(path.join(nested, 'receipts.yml'), f.raw);
  await assert.rejects(() => inspectConfiguration(nested, { trustDir: path.join(f.root, 'other-dir') }), /outside the repository/);
});

test('copied project approvals and corrupt approval files do not validate; explicit reviewed approval repairs corrupt JSON', async (t) => {
  const f = await fixture(t);
  const approved = await f.approve();
  const sibling = path.join(f.container, 'other-project'); await mkdir(sibling);
  await writeFile(path.join(sibling, 'receipts.yml'), f.raw);
  const other = await inspectConfiguration(sibling, f.options);
  await writeFile(other.approvalFile, await readFile(approved.approvalFile));
  assert.equal((await verifyDone(sibling, f.options)).trustRequired, true);
  await writeFile(approved.approvalFile, '{');
  assert.equal((await verifyDone(f.root, f.options)).trustRequired, true);
  await f.approve();
  assert.equal((await verifyDone(f.root, f.options)).trustValidated, true);
});

test('linked approval directories and hardlinked approval files cannot redirect reads or writes', async (t) => {
  const f = await fixture(t);
  const alias = path.join(f.container, 'linked-approvals');
  await symlink(f.root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(() => inspectConfiguration(f.root, { trustDir: alias }), /link or non-directory/);
  const approved = await f.approve();
  const outside = path.join(f.container, 'hardlinked-copy.json');
  await link(approved.approvalFile, outside);
  assert.equal((await verifyDone(f.root, f.options)).trustRequired, true);
  await assert.rejects(() => f.approve(), /ordinary unlinked file/);
  assert.equal(await readFile(outside, 'utf8'), await readFile(approved.approvalFile, 'utf8'));
});

test('reviewed hash is checked again before writing; trust CLI refuses piped/JSON/noninteractive approval', async (t) => {
  const f = await fixture(t);
  const review = await inspectConfiguration(f.root, f.options);
  await writeFile(path.join(f.root, 'receipts.yml'), `# changed while reviewing\n${f.raw}`);
  await assert.rejects(() => approveReviewedConfiguration(f.root, { ...f.options, reviewedHash: review.configurationHash }), /changed after review/);
  const result = spawnSync(process.execPath, [cli, 'trust', '--root', f.root], {
    encoding: 'utf8', input: `APPROVE ${review.configurationHash}\n`, timeout: 30000,
    env: { ...process.env, DONELATCH_TRUST_DIR: f.trustDir } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /interactive terminal/);
  await assert.rejects(() => lstat(review.approvalFile), { code: 'ENOENT' });
});

test('interactive trust shows exact escaped definitions, requires full-hash approval and never runs the check', async (t) => {
  const f = await fixture(t);
  f.config.checks[0].args = ['-e', "require('node:fs').writeFileSync('SHOULD_NOT_RUN','bad')", '\u001b[2J\u202ehidden\u061c'];
  await writeFile(path.join(f.root, 'receipts.yml'), JSON.stringify(f.config));
  const input = new PassThrough(); input.isTTY = true;
  const output = new PassThrough(); output.isTTY = true;
  let displayed = '';
  output.on('data', chunk => {
    displayed += chunk;
    const prompt = chunk.toString().match(/Type (APPROVE [a-f0-9]{64}) to trust/);
    if (prompt) queueMicrotask(() => input.write(`${prompt[1]}\n`));
  });
  const result = await trustProject(f.root, { ...f.options, input, output });
  assert.equal(result.ok, true);
  assert.match(displayed, /SHOULD_NOT_RUN/);
  assert.match(displayed, /"shell": false/);
  assert.match(displayed, /\\u001b\[2J\\u202ehidden\\u061c/);
  await assert.rejects(() => lstat(path.join(f.root, 'SHOULD_NOT_RUN')), { code: 'ENOENT' });
  assert.equal((await verifyDone(f.root, f.options)).trustValidated, true);
  if (process.platform !== 'win32') assert.equal((await lstat(result.approvalFile)).mode & 0o777, 0o600);
});

test('interactive cancellation or a configuration edit during review cannot create approval', async (t) => {
  for (const changed of [false, true]) {
    const f = await fixture(t);
    const input = new PassThrough(); input.isTTY = true;
    const output = new PassThrough(); output.isTTY = true;
    output.on('data', chunk => {
      const prompt = chunk.toString().match(/Type (APPROVE [a-f0-9]{64}) to trust/);
      if (!prompt) return;
      queueMicrotask(async () => {
        if (changed) await writeFile(path.join(f.root, 'receipts.yml'), `# edited after display\n${f.raw}`);
        input.write(`${changed ? prompt[1] : 'yes'}\n`);
      });
    });
    await assert.rejects(() => trustProject(f.root, { ...f.options, input, output }), changed ? /changed after review/ : /approval was cancelled/);
    assert.equal((await verifyDone(f.root, f.options)).trustRequired, true);
  }
});

test('each supported OS has a user-level default and only an explicit absolute override is accepted', () => {
  const home = path.join(os.tmpdir(), 'example-user');
  assert.equal(userTrustDirectory({ platform: 'linux', env: {}, home }), path.join(home, '.config', 'donelatch', 'trust'));
  assert.equal(userTrustDirectory({ platform: 'linux', env: { XDG_CONFIG_HOME: path.join(home, 'config') }, home }), path.join(home, 'config', 'donelatch', 'trust'));
  assert.equal(userTrustDirectory({ platform: 'darwin', env: {}, home }), path.join(home, 'Library', 'Application Support', 'DoneLatch', 'trust'));
  assert.equal(userTrustDirectory({ platform: 'win32', env: { APPDATA: path.join(home, 'roaming') }, home }), path.join(home, 'roaming', 'DoneLatch', 'trust'));
});
