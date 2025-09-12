#!/usr/bin/env node
// scripts/export-extra-configs.mjs
// Snapshots selected root-level config files into scripts/output/root-configs.txt
//
// Files captured (at repository root):
//   - prettier.config.cjs
//   - .prettierignore
//   - eslint.config.js
//   - typedoc.json
//
// Usage:
//   node scripts/export-root-configs.mjs
//
// Output format follows the other export scripts:
// export-root-configs:
//   found: <n> of 4
//   wrote: scripts/output/root-configs.txt
//   time: <secs>s
//
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT = 'export-root-configs';
const ROOT = path.resolve(__dirname, '..');
const START = Date.now();

const OUT_DIR = path.join(ROOT, 'scripts', 'output');
const OUT_FILE = path.join(OUT_DIR, 'root-configs.txt');
const rel = (p) => path.relative(ROOT, p);

const TARGETS = [
  '.config/prettier/prettier.config.cjs',
  '.config/prettier/.prettierignore',
  '.config/eslint.config.js',
  '.config/typedoc.json',
];

async function main() {
  const chunks = [];
  let found = 0;

  for (const name of TARGETS) {
    const abs = path.join(ROOT, name);
    try {
      const content = await fs.readFile(abs, 'utf8');
      chunks.push(
        `===== BEGIN ${rel(abs)} =====`,
        content.trimEnd(),
        `===== END ${rel(abs)} =====`,
        '',
      );
      found++;
    } catch (e) {
      chunks.push(
        `===== BEGIN ${name} (NOT FOUND) =====`,
        `<${name} not found at repository root>`,
        `===== END ${name} (NOT FOUND) =====`,
        '',
      );
    }
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, chunks.join('\n'), 'utf8');

  const secs = ((Date.now() - START) / 1000).toFixed(2);
  console.log(
    `${SCRIPT}:\n  found: ${found} of ${TARGETS.length}\n  wrote: ${rel(OUT_FILE)}\n  time: ${secs}s`,
  );
}

main().catch((err) => {
  console.error('[error]', SCRIPT + ':', err);
  process.exitCode = 1;
});
