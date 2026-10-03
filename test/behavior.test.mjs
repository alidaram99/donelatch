import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, utimes, rename, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { verify as verifySignature, generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initProject, runChecks, faultcheck, verifyDone, inspectConfiguration, approveReviewedConfiguration } from '../src/index.mjs';

const previousTrustDir = process.env.DONELATCH_TRUST_DIR;
const isolatedTrustDir = await mkdtemp(join(tmpdir(), 'donelatch-behavior-trust-'));
process.env.DONELATCH_TRUST_DIR = isolatedTrustDir;
after(async () => {
  if (previousTrustDir === undefined) delete process.env.DONELATCH_TRUST_DIR;
  else process.env.DONELATCH_TRUST_DIR = previousTrustDir;
  await rm(isolatedTrustDir, { recursive: true, force: true });
});

const productRoot = fileURLToPath(new URL('..', import.meta.url));
const cli = join(productRoot, 'bin', 'receipts.mjs');

async function fixture(t, { weak = false, faults } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'donelatch-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'checks'));
  await mkdir(join(root, 'runtime'));
  await writeFile(join(root, 'src', 'store.mjs'), `import { writeFileSync } from 'node:fs';
export function saveSettings(target, value) {
  writeFileSync(target, JSON.stringify(value));
  return true;
}
`);
  await writeFile(join(root, 'checks', 'read.mjs'), `import { readFileSync } from 'node:fs';
try {
  const value = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (value.theme !== 'dark') throw new Error('Saved settings differ from the requested value');
} catch (error) {
  console.error('ASSERT_PERSISTENCE', error.code === 'ENOENT' ? 'The expected saved settings file is missing' : error.message);
  process.exitCode = 1;
}
`);
  await writeFile(join(root, 'checks', 'persist.mjs'), `import assert from 'node:assert/strict';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { saveSettings } from '../src/store.mjs';
const target = resolve('runtime/settings.json');
mkdirSync('runtime', { recursive: true });
if (existsSync('runtime/fail')) {
  console.error('ASSERT_BASELINE_FAILURE');
  process.exit(1);
}
rmSync(target, { force: true });
assert.equal(saveSettings(target, { theme: 'dark' }), true);
if (process.env.DONELATCH_TEST_WEAK === '1') process.exit(0);
${weak ? "console.log('Weak check: function returned true');" : `const child = spawnSync(process.execPath, [resolve('checks/read.mjs'), target], { encoding: 'utf8' });
if (child.status !== 0) {
  console.error(child.stderr || 'Reader process failed');
  process.exitCode = 1;
} else console.log('Persistence checked in a fresh process');`}
`);
  const config = {
    version: 1,
    checks: [{ id: 'persist', command: 'node', args: ['checks/persist.mjs'], timeoutMs: 3000, failureExitCodes: [1], failureMarker: 'ASSERT_PERSISTENCE' }],
    faults: faults ?? [{ id: 'skip-write', file: 'src/store.mjs', find: 'writeFileSync(target, JSON.stringify(value));', replace: '// deliberately skip persistence', checkIds: ['persist'] }],
    exclude: ['runtime'],
  };
  await writeConfig(root, config);
  return { root, config };
}

async function writeConfig(root, config, { approve = true } = {}) {
  // JSON is a YAML 1.2 subset. This avoids testing a second handwritten YAML parser.
  await writeFile(join(root, 'receipts.yml'), JSON.stringify(config, null, 2));
  if (approve) {
    const review = await inspectConfiguration(root);
    await approveReviewedConfiguration(root, { reviewedHash: review.configurationHash });
  }
}

async function accept(root) {
  const fault = await faultcheck(root);
  assert.equal(fault.status, 'passed', `Faultcheck receipt:\n${JSON.stringify(fault, null, 2)}`);
  const run = await runChecks(root);
  assert.equal(run.status, 'passed', `Acceptance run receipt:\n${JSON.stringify(run, null, 2)}`);
  const gate = await verifyDone(root);
  assert.equal(gate.ok, true, gate.reasons.join('\n'));
}

async function invalidResult(operation) {
  let result;
  try {
    result = await operation();
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.equal(error instanceof TypeError || error instanceof ReferenceError || error instanceof SyntaxError, false, 'A programming exception is not a validated domain error');
    return;
  }
  assert.ok(['invalid', 'changed'].includes(result.status), JSON.stringify(result));
}

test('init creates acceptance configuration and never runs a project command implicitly', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'donelatch-init-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await initProject(root);
  assert.match(await readFile(join(root, 'receipts.yml'), 'utf8'), /checks/);
  assert.equal((await verifyDone(root)).ok, false);
});

test('passing a weak test cannot establish done when its persistence fault survives', async (t) => {
  const { root } = await fixture(t, { weak: true });
  assert.equal((await runChecks(root)).status, 'passed');
  assert.equal((await verifyDone(root)).ok, false, 'A run alone is not acceptance evidence');
  const faults = await faultcheck(root);
  assert.equal(faults.status, 'weak', `Weak-check receipt:\n${JSON.stringify(faults, null, 2)}`);
  assert.equal(faults.mutations[0].status, 'survived', `Weak-check receipt:\n${JSON.stringify(faults, null, 2)}`);
  assert.equal((await verifyDone(root)).ok, false);
});

test('independent persistence assertion catches a skipped write; source remains unchanged', async (t) => {
  const { root } = await fixture(t);
  const before = await readFile(join(root, 'src/store.mjs'));
  const beforeStat = await stat(join(root, 'src/store.mjs'));
  await accept(root);
  assert.deepEqual(await readFile(join(root, 'src/store.mjs')), before);
  assert.equal((await stat(join(root, 'src/store.mjs'))).mtimeMs, beforeStat.mtimeMs);
});

test('each declared mutant is checked from an unmodified copy', async (t) => {
  const faults = [
    { id: 'skip-write', file: 'src/store.mjs', find: 'writeFileSync(target, JSON.stringify(value));', replace: '// skip write', checkIds: ['persist'] },
    { id: 'wrong-value', file: 'src/store.mjs', find: 'JSON.stringify(value)', replace: "JSON.stringify({ theme: 'light' })", checkIds: ['persist'] },
  ];
  const { root } = await fixture(t, { faults });
  const report = await faultcheck(root);
  assert.equal(report.status, 'passed');
  assert.deepEqual(report.mutations.map((item) => [item.id, item.status]), [['skip-write', 'detected'], ['wrong-value', 'detected']]);
  assert.equal((await runChecks(root)).status, 'passed');
  assert.equal((await verifyDone(root)).ok, true);
});

test('literal replacements preserve dollar metacharacters as literal bytes', async (t) => {
  const { root, config } = await fixture(t);
  await writeFile(join(root, 'src/literal.mjs'), 'export const tag = "ok";\n');
  await writeFile(join(root, 'checks/literal.mjs'), `import { tag } from '../src/literal.mjs';
if (tag !== 'ok') {
  console.error('ASSERT_LITERAL: the stored tag changed');
  process.exitCode = 1;
}
`);
  config.checks = [{ id: 'literal', command: 'node', args: ['checks/literal.mjs'], timeoutMs: 3000, failureExitCodes: [1], failureMarker: 'ASSERT_LITERAL' }];
  config.faults = [{ id: 'literal-dollar', file: 'src/literal.mjs', find: '"ok"', replace: '"$&"', checkIds: ['literal'] }];
  await writeConfig(root, config);
  const result = await faultcheck(root);
  assert.equal(result.status, 'passed', JSON.stringify(result.mutations));
  assert.equal(result.mutations[0].status, 'detected');
  assert.equal(await readFile(join(root, 'src/literal.mjs'), 'utf8'), 'export const tag = "ok";\n');
});

test('content change is rejected even when the original modification time is restored', async (t) => {
  const { root } = await fixture(t);
  const file = join(root, 'src/store.mjs');
  const exactlyRepresentableTime = new Date('2025-01-01T00:00:00.000Z');
  await utimes(file, exactlyRepresentableTime, exactlyRepresentableTime);
  const originalNanoseconds = (await stat(file, { bigint: true })).mtimeNs;
  await accept(root);
  const original = await stat(file);
  await writeFile(file, (await readFile(file, 'utf8')) + '\n// edited after acceptance\n');
  await utimes(file, original.atime, original.mtime);
  assert.equal((await stat(file, { bigint: true })).mtimeNs, originalNanoseconds, 'Timestamp must actually match, so the test exercises content hashing');
  assert.equal((await verifyDone(root)).ok, false);
});

for (const operation of ['delete', 'rename', 'add', 'touch']) {
  test(`${operation} of project input invalidates prior acceptance`, async (t) => {
    const { root } = await fixture(t);
    await accept(root);
    const file = join(root, 'src/store.mjs');
    if (operation === 'delete') await rm(file);
    if (operation === 'rename') await rename(file, join(root, 'src/renamed.mjs'));
    if (operation === 'add') await writeFile(join(root, 'src/new.mjs'), 'export const added = true;\n');
    if (operation === 'touch') {
      const value = await stat(file);
      await utimes(file, value.atime, new Date(Date.now() + 5000));
    }
    assert.equal((await verifyDone(root)).ok, false);
  });
}

test('changing acceptance commands or mutations invalidates the recorded evidence', async (t) => {
  const { root, config } = await fixture(t);
  await accept(root);
  config.faults[0].replace = '// new negative control';
  await writeConfig(root, config, { approve: false });
  assert.equal((await verifyDone(root)).ok, false);
});

test('excluded generated artifacts do not stale accepted evidence', async (t) => {
  const { root } = await fixture(t);
  await accept(root);
  await writeFile(join(root, 'runtime/another-output.txt'), 'generated output');
  assert.equal((await verifyDone(root)).ok, true);
});

test('excluding runtime does not also exclude a differently named neighboring directory', async (t) => {
  const { root } = await fixture(t);
  await accept(root);
  await mkdir(join(root, 'runtime-neighbor'));
  await writeFile(join(root, 'runtime-neighbor/source.mjs'), 'export const watched = true;\n');
  assert.equal((await verifyDone(root)).ok, false);
});

test('a later failed run supersedes an older passing run for the same source state', async (t) => {
  const { root } = await fixture(t);
  await accept(root);
  await writeFile(join(root, 'runtime/fail'), 'force a real check failure');
  assert.equal((await runChecks(root)).status, 'failed');
  assert.equal((await verifyDone(root)).ok, false);
});

test('a later weak faultcheck supersedes an older passing faultcheck for the same source state', async (t) => {
  const { root } = await fixture(t);
  await accept(root);
  const original = process.env.DONELATCH_TEST_WEAK;
  try {
    process.env.DONELATCH_TEST_WEAK = '1';
    assert.equal((await faultcheck(root)).status, 'weak');
    assert.equal((await verifyDone(root)).ok, false);
  } finally {
    if (original === undefined) delete process.env.DONELATCH_TEST_WEAK;
    else process.env.DONELATCH_TEST_WEAK = original;
  }
});

test('a check that edits project input cannot produce a passing acceptance receipt', async (t) => {
  const { root, config } = await fixture(t);
  await writeFile(join(root, 'checks/change.mjs'), `import { appendFileSync } from 'node:fs';
appendFileSync('src/store.mjs', '\\n// edited by the check\\n');
`);
  config.checks[0].args = ['checks/change.mjs'];
  await writeConfig(root, config);
  assert.equal((await runChecks(root)).status, 'changed');
  assert.equal((await verifyDone(root)).ok, false);
});

test('a temp baseline that edits watched source cannot certify a mutation', async (t) => {
  const { root, config } = await fixture(t);
  const file = join(root, 'src/store.mjs');
  const before = await readFile(file, 'utf8');
  await writeFile(join(root, 'checks/change.mjs'), `import { appendFileSync } from 'node:fs';
appendFileSync('src/store.mjs', '\\n// changed during the temporary baseline\\n');
`);
  config.checks[0].args = ['checks/change.mjs'];
  await writeConfig(root, config);
  await invalidResult(() => faultcheck(root));
  assert.equal(await readFile(file, 'utf8'), before);
});

test('a parser error caused by mutation is invalid evidence, not a detected behavioral defect', async (t) => {
  const faults = [{ id: 'syntax-error', file: 'src/store.mjs', find: 'return true;', replace: 'return (;', checkIds: ['persist'] }];
  const { root } = await fixture(t, { faults });
  const result = await faultcheck(root);
  assert.equal(result.status, 'invalid');
  assert.equal(result.mutations[0].status, 'invalid');
  assert.equal((await verifyDone(root)).ok, false);
});

test('a mutant timeout never counts as detecting an injected fault', async (t) => {
  const { root, config } = await fixture(t);
  await writeFile(join(root, 'src/delay.mjs'), 'export const delay = false;\n');
  await writeFile(join(root, 'checks/delay.mjs'), `import { delay } from '../src/delay.mjs';
if (delay) setTimeout(() => console.log('late'), 5000);
`);
  config.checks = [{ id: 'delay', command: 'node', args: ['checks/delay.mjs'], timeoutMs: 200, failureExitCodes: [1], failureMarker: 'ASSERT_DELAY' }];
  config.faults = [{ id: 'hang', file: 'src/delay.mjs', find: 'delay = false', replace: 'delay = true', checkIds: ['delay'] }];
  await writeConfig(root, config);
  const result = await faultcheck(root);
  assert.equal(result.status, 'invalid');
  assert.equal(result.mutations[0].status, 'invalid');
});

test('a failure marker already printed by a passing baseline is not valid detection evidence', async (t) => {
  const { root, config } = await fixture(t);
  await writeFile(join(root, 'src/flag.mjs'), 'export const broken = false;\n');
  await writeFile(join(root, 'checks/flag.mjs'), `import { broken } from '../src/flag.mjs';
console.log('ASSERT_FLAG');
if (broken) throw new Error('An unrelated operational error');
`);
  config.checks = [{ id: 'flag', command: 'node', args: ['checks/flag.mjs'], timeoutMs: 3000, failureExitCodes: [1], failureMarker: 'ASSERT_FLAG' }];
  config.faults = [{ id: 'unrelated-error', file: 'src/flag.mjs', find: 'broken = false', replace: 'broken = true', checkIds: ['flag'] }];
  await writeConfig(root, config);
  await invalidResult(() => faultcheck(root));
  assert.equal((await verifyDone(root)).ok, false);
});

test('a failing baseline cannot certify a mutation', async (t) => {
  const { root, config } = await fixture(t);
  await writeFile(join(root, 'checks/failing-baseline.mjs'), "console.error('ASSERT_PERSISTENCE: deliberately failed baseline'); process.exit(1);\n");
  config.checks[0].args = ['checks/failing-baseline.mjs'];
  await writeConfig(root, config);
  await invalidResult(() => faultcheck(root));
  assert.equal((await verifyDone(root)).ok, false);
});

test('missing command does not produce acceptable fault evidence', async (t) => {
  const { root, config } = await fixture(t);
  config.checks[0].command = 'donelatch-command-that-does-not-exist';
  await writeConfig(root, config);
  await invalidResult(() => faultcheck(root));
  assert.equal((await verifyDone(root)).ok, false);
});

for (const mode of ['none', 'multiple']) {
  test(`a literal mutation with ${mode} matching locations is rejected`, async (t) => {
    const { root, config } = await fixture(t);
    if (mode === 'none') config.faults[0].find = 'not present in this file';
    else {
      config.faults[0].find = 'value';
      config.faults[0].replace = 'other';
    }
    await writeConfig(root, config);
    await invalidResult(() => faultcheck(root));
    assert.equal((await verifyDone(root)).ok, false);
  });
}

test('mutation path traversal is rejected without changing the outside file', async (t) => {
  const { root, config } = await fixture(t);
  const outside = resolve(root, '..', `${root.split(/[\\/]/).at(-1)}-outside.txt`);
  t.after(() => rm(outside, { force: true }));
  await writeFile(outside, 'original outside bytes');
  config.faults[0].file = `../${outside.split(/[\\/]/).at(-1)}`;
  config.faults[0].find = 'original';
  config.faults[0].replace = 'tampered';
  await writeConfig(root, config, { approve: false });
  await invalidResult(() => faultcheck(root));
  assert.equal(await readFile(outside, 'utf8'), 'original outside bytes');
});

test('symlinked source directories cannot be mutated through the copy', async (t) => {
  const { root, config } = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'donelatch-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'linked.mjs'), 'export const value = true;\n');
  try {
    await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip(`Host cannot create a symlink: ${error.code}`);
    throw error;
  }
  config.faults[0] = { id: 'linked', file: 'linked/linked.mjs', find: 'true', replace: 'false', checkIds: ['persist'] };
  await writeConfig(root, config);
  await invalidResult(() => faultcheck(root));
  assert.equal(await readFile(join(outside, 'linked.mjs'), 'utf8'), 'export const value = true;\n');
});

test('a symlinked receipt directory cannot write keys or logs outside the project', async (t) => {
  const { root } = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'donelatch-keys-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  try {
    await symlink(outside, join(root, '.receipts'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip(`Host cannot create a symlink: ${error.code}`);
    throw error;
  }
  await invalidResult(() => runChecks(root));
  const { readdir } = await import('node:fs/promises');
  assert.deepEqual(await readdir(outside), [], 'Receipt keys/logs escaped through a junction');
});

test('a hardlinked receipt log cannot append evidence to an outside file', async (t) => {
  const { root } = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'donelatch-hardlink-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const target = join(outside, 'outside-log.jsonl');
  await writeFile(target, '');
  await mkdir(join(root, '.receipts'));
  try {
    await link(target, join(root, '.receipts/log.jsonl'));
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP', 'EXDEV'].includes(error.code)) return t.skip(`Host cannot create this hardlink: ${error.code}`);
    throw error;
  }
  await invalidResult(() => runChecks(root));
  assert.equal(await readFile(target, 'utf8'), '', 'Appending a receipt changed an outside hardlink target');
});

test('acceptance is bound to git HEAD, not just unchanged working files', async (t) => {
  const { root } = await fixture(t);
  const git = (args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
    assert.equal(result.status, 0, result.stderr);
  };
  git(['init', '--quiet']);
  git(['-c', 'user.name=DoneLatch tests', '-c', 'user.email=tests@example.invalid', 'commit', '--allow-empty', '-m', 'Initial fixture']);
  await accept(root);
  git(['-c', 'user.name=DoneLatch tests', '-c', 'user.email=tests@example.invalid', 'commit', '--allow-empty', '-m', 'Different HEAD, identical files']);
  assert.equal((await verifyDone(root)).ok, false);
});

test('malformed or tampered receipt log is rejected', async (t) => {
  const { root } = await fixture(t);
  await accept(root);
  const log = join(root, '.receipts/log.jsonl');
  await writeFile(log, (await readFile(log, 'utf8')) + '{not valid json}\n');
  const result = await verifyDone(root);
  assert.equal(result.ok, false);
  assert.ok(result.reasons.length > 0);
});

test('receipts contain Ed25519 signatures verifiable independently of DoneLatch', async (t) => {
  const { root } = await fixture(t);
  await accept(root);
  const publicKey = await readFile(join(root, '.receipts/public-key.pem'), 'utf8');
  const receipts = (await readFile(join(root, '.receipts/log.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0].previousHash, null);
  assert.equal(receipts[1].previousHash, receipts[0].hash);
  for (const receipt of receipts) {
    assert.equal(verifySignature(null, Buffer.from(receipt.hash), publicKey, Buffer.from(receipt.signature, 'base64')), true);
    assert.equal(verifySignature(null, Buffer.from(receipt.hash + '-changed'), publicKey, Buffer.from(receipt.signature, 'base64')), false);
    assert.ok(receipt.subject.files.some((file) => file.path === 'src/store.mjs'));
    assert.ok(receipt.finishedAt >= receipt.startedAt);
  }
});

for (const attack of ['payload', 'signature', 'chain-order', 'replace-key-pair']) {
  test(`${attack} tampering cannot preserve accepted receipt evidence`, async (t) => {
    const { root } = await fixture(t);
    await accept(root);
    const log = join(root, '.receipts/log.jsonl');
    const receipts = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
    if (attack === 'payload') receipts[0].subject.files[0].sha256 = '0'.repeat(64);
    if (attack === 'signature') receipts[1].signature = Buffer.alloc(64).toString('base64');
    if (attack === 'chain-order') receipts.reverse();
    if (attack === 'replace-key-pair') {
      const pair = generateKeyPairSync('ed25519');
      await writeFile(join(root, '.receipts/private-key.pem'), pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
      await writeFile(join(root, '.receipts/public-key.pem'), pair.publicKey.export({ type: 'spki', format: 'pem' }));
    } else await writeFile(log, receipts.map((receipt) => JSON.stringify(receipt)).join('\n') + '\n');
    const result = await verifyDone(root);
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((reason) => /signature|hash|chain|identity|verify/i.test(reason)));
  });
}

test('CLI reports acceptance and uses the gate-failure exit code after a source edit', async (t) => {
  const { root } = await fixture(t);
  await accept(root);
  let result = spawnSync(process.execPath, [cli, 'verify-done', '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
  await writeFile(join(root, 'src/new-input.mjs'), 'export const changed = true;\n');
  result = spawnSync(process.execPath, [cli, 'verify-done', '--root', root, '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, false);
});

test('empty checks and unknown CLI arguments fail closed', async (t) => {
  const { root, config } = await fixture(t);
  config.checks = [];
  await writeConfig(root, config, { approve: false });
  await invalidResult(() => runChecks(root));
  for (const args of [['imaginary-command'], ['run', '--imaginary-option'], ['verify-done', '--root']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 2, `Expected a CLI argument error: ${args.join(' ')}\n${result.stderr}`);
  }
});

test('Windows path aliases cannot mutate receipt state or bypass an excluded directory', async (t) => {
  const { root, config } = await fixture(t);
  const originalFault = { ...config.faults[0] };
  const aliases = process.platform === 'win32' ? ['RECEIPTS.YML', '.RECEIPTS/log.jsonl'] : ['.RECEIPTS/log.jsonl'];
  for (const file of aliases) {
    config.faults[0] = { ...originalFault, file };
    await writeConfig(root, config, { approve: false });
    await assert.rejects(() => faultcheck(root), /Fault may not target config, keys, git metadata or dependencies/);
  }
  if (process.platform === 'win32') {
    config.faults[0] = originalFault;
    config.exclude = ['Runtime'];
    await writeConfig(root, config);
    await accept(root);
    await writeFile(join(root, 'runtime/case-insensitive-output.txt'), 'generated output');
    assert.equal((await verifyDone(root)).ok, true, 'Windows directory exclusions must match case-insensitively');
  }
});

test('done is refused during a running operation and accepted again after its lock is removed', async (t) => {
  const { root } = await fixture(t);
  await accept(root);
  const lock = join(root, '.receipts/operation.lock');
  await writeFile(lock, String(process.pid));
  const blocked = await verifyDone(root);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasons.some((reason) => /operation|running|progress/i.test(reason)));
  await rm(lock);
  assert.equal((await verifyDone(root)).ok, true);
});

test('faultcheck works when the operating-system temp directory has a noncanonical alias', async (t) => {
  const { root } = await fixture(t);
  const container = await mkdtemp(join(tmpdir(), 'donelatch-temp-alias-'));
  t.after(() => rm(container, { recursive: true, force: true }));
  const actual = join(container, 'actual-temp');
  const alias = join(container, 'aliased-temp');
  await mkdir(actual);
  try {
    await symlink(actual, alias, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip(`Host cannot create a temp alias: ${error.code}`);
    throw error;
  }
  const variables = process.platform === 'win32' ? ['TEMP', 'TMP'] : ['TMPDIR'];
  const previous = Object.fromEntries(variables.map((name) => [name, process.env[name]]));
  try {
    for (const name of variables) process.env[name] = alias;
    assert.equal(tmpdir(), alias, 'Fixture must use the noncanonical temp path');
    await accept(root);
    const { readdir } = await import('node:fs/promises');
    assert.deepEqual(await readdir(actual), [], 'Owned temporary directories should be cleaned through their canonical paths');
  } finally {
    for (const name of variables) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
