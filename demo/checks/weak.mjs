import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { saveSettings } from '../src/store.mjs';

const target = resolve('runtime/settings.json');
mkdirSync('runtime', { recursive: true });
rmSync(target, { force: true });
assert.equal(saveSettings(target, { theme: 'dark' }).saved, true);
console.log('Weak test passed: the function returned saved: true');
