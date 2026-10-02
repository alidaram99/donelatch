import { writeFileSync } from 'node:fs';

export function saveSettings(target, settings) {
  writeFileSync(target, JSON.stringify(settings));
  return { saved: true };
}
