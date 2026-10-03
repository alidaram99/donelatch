import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, copyFile, appendFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks, faultcheck, verifyDone, inspectConfiguration, approveReviewedConfiguration } from '../src/index.mjs';

const demo = fileURLToPath(new URL('../demo/', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'donelatch-demo-'));
const trustDir = await mkdtemp(join(tmpdir(), 'donelatch-demo-trust-'));
const options = { trustDir };
async function approveOwnedFixture() {
  const review = await inspectConfiguration(root, options);
  await approveReviewedConfiguration(root, { ...options, reviewedHash: review.configurationHash });
}

try {
  await cp(demo, root, { recursive: true });
  await mkdir(join(root, 'runtime'), { recursive: true });
  const original = await readFile(join(root, 'src/store.mjs'), 'utf8');

  await copyFile(join(root, 'weak.receipts.yml'), join(root, 'receipts.yml'));
  await approveOwnedFixture();
  const weakRun = await runChecks(root, options);
  const weakFault = await faultcheck(root, options);
  const weakGate = await verifyDone(root, options);
  assert.equal(weakRun.status, 'passed');
  assert.equal(weakFault.status, 'weak');
  assert.equal(weakFault.mutations[0].status, 'survived');
  assert.equal(weakGate.ok, false);
  console.log('WEAK CHECK: baseline passed; skipped persisted write survived; DONE REFUSED.');

  await copyFile(join(root, 'strong.receipts.yml'), join(root, 'receipts.yml'));
  await approveOwnedFixture();
  const strongFault = await faultcheck(root, options);
  const strongRun = await runChecks(root, options);
  const strongGate = await verifyDone(root, options);
  assert.equal(strongFault.status, 'passed');
  assert.equal(strongFault.mutations[0].status, 'detected');
  assert.equal(strongRun.status, 'passed');
  assert.equal(strongGate.ok, true, strongGate.reasons.join('\n'));
  assert.equal(await readFile(join(root, 'src/store.mjs'), 'utf8'), original);
  console.log('STRONG CHECK: skipped persisted write detected; fresh baseline passed; DONE ACCEPTED.');

  await appendFile(join(root, 'src/store.mjs'), '\n// source changed after acceptance\n');
  const staleGate = await verifyDone(root, options);
  assert.equal(staleGate.ok, false);
  console.log('AFTER EDIT: earlier receipts are stale; DONE REFUSED.');
  console.log('Fault injection left the source unchanged; only the deliberate stale-edit step changed the disposable demo.');
  console.log('Demo approvals cover only shipped disposable fixtures in an isolated temporary trust store; user approvals are unchanged.');
} finally {
  await rm(root, { recursive: true, force: true });
  await rm(trustDir, { recursive: true, force: true });
}
