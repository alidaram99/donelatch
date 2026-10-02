import { createHash } from 'node:crypto';
import { readdir, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathKey } from './config.mjs';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export async function snapshot(root, loaded) {
  const files = [];
  let totalBytes = 0;
  const excluded = relative => loaded.excludes.some(p => pathKey(relative) === pathKey(p) || pathKey(relative).startsWith(`${pathKey(p)}/`));
  async function walk(directory, prefix = '') {
    const entries = (await readdir(directory, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (excluded(relative)) continue;
      const absolute = path.join(directory, entry.name);
      const stat = await lstat(absolute, { bigint: true });
      if (stat.isSymbolicLink()) throw new Error(`Symlink/junction in watched scope: ${relative}`);
      if (stat.isDirectory()) { await walk(absolute, relative); continue; }
      if (!stat.isFile()) throw new Error(`Unsupported special file: ${relative}`);
      if (files.length >= 20_000 || stat.size > 50n * 1024n * 1024n) throw new Error('Watched scope exceeds file/size limit');
      const bytes = await readFile(absolute);
      totalBytes += bytes.length;
      if (totalBytes > 200 * 1024 * 1024) throw new Error('Watched scope exceeds 200 MB');
      files.push({ path: relative, sha256: digest(bytes), mtimeNs: stat.mtimeNs.toString(), size: bytes.length, mode: Number(stat.mode) });
    }
  }
  await walk(root);
  const gitArgs=['--no-optional-locks','-c','core.fsmonitor=false','-C',root];
  const git = spawnSync('git', [...gitArgs, 'rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  const gitHead = git.status === 0 ? git.stdout.trim() : null;
  const status = gitHead ? spawnSync('git', [...gitArgs, 'status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }) : null;
  const changedFiles = status?.status === 0 ? status.stdout.split(/\r?\n/).filter(Boolean).map(line => line.slice(3)) : [];
  const subject = { gitHead, configHash: digest(loaded.config), files };
  return { ...subject, stateHash: digest(subject), changedFiles, maxMtimeMs: Math.max(0, ...files.map(f => Number(BigInt(f.mtimeNs) / 1_000_000n))) };
}
