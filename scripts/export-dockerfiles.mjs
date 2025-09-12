#!/usr/bin/env node
// scripts/export-dockerfiles.mjs
// Recursively snapshots all Dockerfile.dev files and the docker-compose.yml
// at the (search) root into scripts/output/dockerfiles-and-compose.txt
//
// Usage:
//   node scripts/export-dockerfiles.mjs
//   node scripts/export-dockerfiles.mjs <subdir>  # e.g., apps
//
// Output format follows the other export scripts:
// export-dockerfiles:
//   found: <n>
//   wrote: scripts/output/dockerfiles-and-compose.txt
//   time: <secs>s
//
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT = 'export-dockerfiles';
const ROOT = path.resolve(__dirname, '..');
const SEARCH_ROOT = path.resolve(ROOT, process.argv[2] ?? ROOT);
const OUT_DIR = path.join(ROOT, 'scripts', 'output');
const OUT_FILE = path.join(OUT_DIR, 'dockerfiles-and-compose.txt');
const START = Date.now();

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.cache',
  'dist',
  'build',
  'coverage',
  'tmp',
  'temp',
  'log-management',
]);

function rel(p) {
  return path.relative(SEARCH_ROOT, p).split(path.sep).join('/');
}

async function* walk(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name)) {
        yield* walk(full);
      }
    } else if (e.isFile()) {
      if (e.name === 'Dockerfile.dev') {
        yield full;
      }
    }
  }
}

async function main() {
  const files = [];

  // Add docker-compose.yml at the SEARCH_ROOT, if present
  // Skip docker-compose.yml if the search root *is* the log-management directory
  if (path.basename(SEARCH_ROOT) !== 'log-management') {
    const composePath = path.join(SEARCH_ROOT, 'docker-compose.yml');
    try {
      const st = await fs.stat(composePath);
      if (st.isFile()) files.push(composePath);
    } catch {}
  }

  for await (const p of walk(SEARCH_ROOT)) files.push(p);
  // Sort for deterministic output: docker-compose first (if any), then Dockerfiles by path
  files.sort((a, b) => {
    const aIsCompose = path.basename(a) === 'docker-compose.yml';
    const bIsCompose = path.basename(b) === 'docker-compose.yml';
    if (aIsCompose && !bIsCompose) return -1;
    if (!aIsCompose && bIsCompose) return 1;
    return a.localeCompare(b);
  });

  const header = [
    '# docker snapshot',
    `# Root: ${rel(SEARCH_ROOT) || '.'}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total files: ${files.length}`,
    '',
  ].join('\n');

  const chunks = [header];

  for (const file of files) {
    let content = '';
    try {
      content = await fs.readFile(file, 'utf8');
    } catch (e) {
      content = `<ERROR: failed to read file: ${e.message}>`;
    }
    const relPath = path.isAbsolute(file) ? path.relative(SEARCH_ROOT, file) : file;
    const posixRel = relPath.split(path.sep).join('/');
    chunks.push(
      `===== BEGIN ${posixRel} =====`,
      content.trimEnd(),
      `===== END ${posixRel} =====`,
      '', // spacer
    );
  }

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, chunks.join('\n'), 'utf8');

  const secs = ((Date.now() - START) / 1000).toFixed(2);
  console.log(
    `${SCRIPT}:\n  found: ${files.length}\n  wrote: ${path.relative(ROOT, OUT_FILE)}\n  time: ${secs}s`,
  );
}

main().catch((err) => {
  console.error('[error]', SCRIPT + ':', err);
  process.exitCode = 1;
});
