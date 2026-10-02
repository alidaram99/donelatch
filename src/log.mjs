import { generateKeyPairSync, createPublicKey, sign, verify } from 'node:crypto';
import { mkdir, open, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { safePath } from './config.mjs';
import { canonical, digest } from './state.mjs';

export async function withLock(root, operation) {
  const folder = await safePath(root, '.receipts', { allowMissing: true });
  await mkdir(folder, { recursive: true });
  const ignore = await safePath(root, '.receipts/.gitignore', { allowMissing: true, ordinaryFile: true });
  try { await writeFile(ignore, '*\n', { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  const lock = await safePath(root, '.receipts/operation.lock', { allowMissing: true, ordinaryFile: true });
  let handle;
  try { handle = await open(lock, 'wx', 0o600); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another DoneLatch operation is running (or stale .receipts/operation.lock); do not run checks concurrently');
    throw error;
  }
  try { await handle.writeFile(String(process.pid)); return await operation(); }
  finally { await handle.close(); await unlink(lock).catch(() => {}); }
}
async function keys(root, create = false) {
  const privatePath = await safePath(root, '.receipts/private-key.pem', { allowMissing: create, ordinaryFile: true });
  const publicPath = await safePath(root, '.receipts/public-key.pem', { allowMissing: create, ordinaryFile: true });
  try {
    const [privateKey, publicKey] = await Promise.all([readFile(privatePath, 'utf8'), readFile(publicPath, 'utf8')]);
    if (createPublicKey(privateKey).export({ type:'spki', format:'pem' }) !== publicKey) throw new Error('Receipt signing key pair does not match');
    return { privateKey, publicKey };
  } catch (error) {
    if (!create || error.code !== 'ENOENT') throw error;
    const logPath = await safePath(root, '.receipts/log.jsonl', { allowMissing:true, ordinaryFile: true });
    try { if ((await readFile(logPath,'utf8')).trim()) throw new Error('Existing receipt log without key: refusing to replace signing identity'); } catch (e) { if(e.code !== 'ENOENT') throw e; }
    const generated = generateKeyPairSync('ed25519');
    const privateKey = generated.privateKey.export({ type:'pkcs8', format:'pem' });
    const publicKey = generated.publicKey.export({ type:'spki', format:'pem' });
    await writeFile(privatePath, privateKey, { mode:0o600, flag:'wx' });
    await writeFile(publicPath, publicKey, { mode:0o600, flag:'wx' });
    return { privateKey, publicKey };
  }
}
export async function readLog(root, { create = false } = {}) {
  const keyPair = await keys(root, create);
  const logPath = await safePath(root, '.receipts/log.jsonl', { allowMissing:create, ordinaryFile: true });
  let text;
  try { text = await readFile(logPath, 'utf8'); } catch (error) { if(create && error.code === 'ENOENT') return { receipts:[], ...keyPair }; throw error; }
  if (Buffer.byteLength(text) > 20 * 1024 * 1024) throw new Error('Receipt log exceeds 20 MB; archive with an externally retained anchor');
  const receipts=[];
  let previousHash=null;
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    let record;
    try { record=JSON.parse(line); } catch { throw new Error('Malformed receipt log'); }
    const { hash, signature, ...payload } = record;
    if(payload.version !== 1 || !['run','faultcheck'].includes(payload.kind) || payload.previousHash !== previousHash || hash !== digest(payload) || typeof signature !== 'string' || !verify(null,Buffer.from(hash),keyPair.publicKey,Buffer.from(signature,'base64'))) throw new Error('Receipt signature/hash-chain verification failed');
    if(payload.publicKeyHash !== digest(keyPair.publicKey)) throw new Error('Receipt signing identity mismatch');
    receipts.push(record);
    previousHash=hash;
  }
  return { receipts, ...keyPair };
}
export async function appendReceipt(root, data) {
  const { receipts, privateKey, publicKey } = await readLog(root,{create:true});
  const payload = { version:1, ...data, publicKeyHash:digest(publicKey), previousHash:receipts.at(-1)?.hash ?? null };
  const hash = digest(payload);
  const record = { ...payload, hash, signature:sign(null,Buffer.from(hash),privateKey).toString('base64') };
  const logPath = await safePath(root,'.receipts/log.jsonl',{allowMissing:true, ordinaryFile: true});
  const handle=await open(logPath,'a',0o600);
  try { await handle.write(`${canonical(record)}\n`); await handle.sync(); } finally { await handle.close(); }
  return record;
}
