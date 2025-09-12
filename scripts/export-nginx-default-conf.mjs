#!/usr/bin/env node
// scripts/export-nginx-default-conf.mjs
// Extracts the single file nginx/default.conf and writes it to scripts/output/nginx-default-conf.txt
// in the same envelope format used by the other export scripts.
//
// Usage:
//   node scripts/export-nginx-default-conf.mjs [<search-root>]
//
// Output format (example):
// ===== BEGIN nginx/default.conf =====
// <file contents>
// ===== END nginx/default.conf =====

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT = 'export-nginx-default-conf';
const ROOT = path.resolve(__dirname, '..');
const SEARCH_ROOT = path.resolve(ROOT, process.argv[2] ?? ROOT);
const START = Date.now();
const OUT_DIR = path.join(ROOT, 'scripts', 'output');
const OUT_FILE = path.join(OUT_DIR, 'nginx-default-conf.txt');

const REL_TARGET = path.join('nginx', 'default.conf');

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

async function main() {
  const chunks = [];
  let found = 0;

  const absTarget = path.join(SEARCH_ROOT, REL_TARGET);
  let content = '';
  try {
    content = await fs.readFile(absTarget, 'utf8');
    found = 1;
  } catch (e) {
    content = `<ERROR: failed to read ${rel(absTarget)}: ${e.message}>`;
  }

  const relPath = rel(absTarget);
  chunks.push(`===== BEGIN ${relPath} =====`, content.trimEnd(), `===== END ${relPath} =====`, '');

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, chunks.join('\n'), 'utf8');

  const secs = ((Date.now() - START) / 1000).toFixed(2);
  console.log(`${SCRIPT}:\n  found: ${found} of 1\n  wrote: ${rel(OUT_FILE)}\n  time: ${secs}s`);
}

main().catch((err) => {
  console.error('[error]', SCRIPT + ':', err);
  process.exitCode = 1;
});
