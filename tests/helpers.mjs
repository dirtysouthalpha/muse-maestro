import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PLUGIN_DIRS = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name.startsWith('maestro-'))
  .map((d) => d.name)
  .sort();

export function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}
