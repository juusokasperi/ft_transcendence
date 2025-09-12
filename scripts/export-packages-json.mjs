#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT = 'export-packages-json';
const ROOT = path.resolve(__dirname, '..');
const SEARCH_ROOT = path.resolve(ROOT, process.argv[2] ?? ROOT);
const START = Date.now();
const OUT_DIR = path.join(ROOT, 'scripts', 'output');
const OUT_FILE = path.join(OUT_DIR, 'packages-json.txt');

// ignore noisy/build/system dirs
const IGNORE_DIRS = new Set([
  'node_modules','.git','.turbo','.cache','.next','.vite','.svelte-kit',
  'dist','build','coverage','tmp','temp','.pnpm-store','pnpm-store',
  '.vercel','.DS_Store'
]);

const EXTRA_FILES = [
  // pnpm workspace (prefer .yaml; fall back to .yml)
  'pnpm-workspace.yaml',
  'pnpm-workspace.yml',
  // requested tsconfigs for frontend app
  path.join('apps','frontend','.tsconfigs','tsconfig.app.json'),
  path.join('apps','frontend','.tsconfigs','tsconfig.node.json'),
];

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

async function safeRead(p) {
  try {
    return await fs.readFile(p, 'utf8');
  } catch (e) {
    return `<ERROR: failed to read ${rel(p)}: ${e.message}>`;
  }
}

async function walkForPackages(dir, acc) {
  /** @type {import('node:fs').Dirent[]} */
  let ents;
  try { ents = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return; }

  for (const ent of ents) {
    const name = ent.name;
    if (ent.isDirectory()) {
      if (IGNORE_DIRS.has(name)) continue;
      await walkForPackages(path.join(dir, name), acc);
    } else if (name === 'package.json') {
      acc.push(path.join(dir, name));
    }
  }
}

async function main() {
  const header = [
    `# ${SCRIPT}`,
    `# root: ${rel(ROOT) || '.'}`,
    `# search_root: ${rel(SEARCH_ROOT) || '.'}`,
    `# date: ${new Date().toISOString()}`,
    ''
  ].join('\n');

  // 1) collect package.json files
  /** @type {string[]} */
  const pkgFiles = [];
  await walkForPackages(SEARCH_ROOT, pkgFiles);
  pkgFiles.sort((a,b) => rel(a).localeCompare(rel(b)));

  // 2) collect extras (workspace + requested tsconfigs)
  /** @type {{file: string, present: boolean}[]} */
  const extras = [];
  for (const relPath of EXTRA_FILES) {
    const abs = path.join(SEARCH_ROOT, relPath);
    let present = true;
    try { await fs.access(abs); } catch { present = false; }
    extras.push({ file: abs, present });
  }

  const chunks = [header];

  // extras first (keep both yaml variants but only one may exist)
  for (const ex of extras) {
    const content = await safeRead(ex.file);
    const rp = rel(ex.file);
    chunks.push(`===== BEGIN ${rp} =====`, content.trimEnd(), `===== END ${rp} =====`, '');
  }

  // then every package.json
  for (const file of pkgFiles) {
    const content = await safeRead(file);
    const rp = rel(file);
    chunks.push(`===== BEGIN ${rp} =====`, content.trimEnd(), `===== END ${rp} =====`, '');
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, chunks.join('\n'), 'utf8');

  const secs = ((Date.now() - START) / 1000).toFixed(2);
  const foundPkgs = pkgFiles.length;
  const foundExtras = extras.filter(e => e.present).length;
  console.log(`${SCRIPT}:\n  found: ${foundPkgs} package.json, ${foundExtras}/${extras.length} extras\n  wrote: ${rel(OUT_FILE)}\n  time: ${secs}s`);
}

main().catch((err) => {
  console.error('[error]', SCRIPT + ':', err);
  process.exitCode = 1;
});
