import { readFileSync } from 'node:fs';

try {
  const actual = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (actual.theme !== 'dark') throw new Error('The saved theme is not dark');
  console.log('Fresh reader: persisted theme is dark');
} catch (error) {
  console.error('ASSERT_PERSISTENCE:', error.code === 'ENOENT' ? 'The expected saved settings file is missing' : error.message);
  process.exitCode = 1;
}
