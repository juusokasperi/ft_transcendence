#!/usr/bin/env node
// scripts/export-makefile.mjs
// Snapshots the repository root Makefile into scripts/output/makefile.txt
//
// Usage:
//   node scripts/export-makefile.mjs
//
// Output format follows the other export scripts:
// export-makefile:
//   found: <0|1> Makefile
//   wrote: scripts/output/makefile.txt
//   time: <secs>s
//
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT = 'export-makefile';
const ROOT = path.resolve(__dirname, '..');
const START = Date.now();

const OUT_DIR = path.join(ROOT, 'scripts', 'output');
const OUT_FILE = path.join(OUT_DIR, 'makefile.txt');
const rel = (p) => path.relative(ROOT, p);

async function main() {
  // Find the Makefile at the repo root (common casings)
  const candidates = ['Makefile', 'makefile'];
  let makefilePath = null;
  for (const name of candidates) {
    const abs = path.join(ROOT, name);
    try {
      await fs.access(abs);
      makefilePath = abs;
      break;
    } catch {}
  }

  let out = '';
  if (!makefilePath) {
    out = [
      '===== BEGIN Makefile (NOT FOUND) =====',
      '<No Makefile at repository root>',
      '===== END Makefile (NOT FOUND) =====',
      '',
    ].join('\n');
  } else {
    const content = await fs.readFile(makefilePath, 'utf8');
    out = ['===== BEGIN Makefile =====', content.trimEnd(), '===== END Makefile =====', ''].join(
      '\n',
    );
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, out, 'utf8');

  const secs = ((Date.now() - START) / 1000).toFixed(2);
  console.log(
    `${SCRIPT}:\n  found: ${makefilePath ? 1 : 0} Makefile\n  wrote: ${rel(OUT_FILE)}\n  time: ${secs}s`,
  );
}

main().catch((err) => {
  console.error('[error]', SCRIPT + ':', err);
  process.exitCode = 1;
});
