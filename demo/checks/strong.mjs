import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { saveSettings } from '../src/store.mjs';

const target = resolve('runtime/settings.json');
mkdirSync('runtime', { recursive: true });
rmSync(target, { force: true });
assert.equal(saveSettings(target, { theme: 'dark' }).saved, true);
const reader = spawnSync(process.execPath, [resolve('checks/read-settings.mjs'), target], { encoding: 'utf8' });
process.stdout.write(reader.stdout || '');
process.stderr.write(reader.stderr || '');
if (reader.error) throw reader.error;
if (reader.status !== 0) process.exitCode = 1;
