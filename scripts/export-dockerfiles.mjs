#!/usr/bin/env node
// scripts/export-dockerfiles.mjs
// Recursively snapshots all docker-compose files and Dockerfiles under the (search) root
// into scripts/output/dockerfiles-and-compose.txt
//
// Usage:
//   node scripts/export-dockerfiles.mjs
//   node scripts/export-dockerfiles.mjs <subdir>  # e.g., apps
//
// Output format follows the other export scripts:
// export-dockerfiles:
//   found: <n> (compose:<c>, dockerfiles:<d>)
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
]);

// Match common Compose filenames: compose.yml|yaml, docker-compose.yml|yaml, and their variants
const COMPOSE_RE = /^(?:docker-)?compose(?:\.[\w.-]+)?\.(?:ya?ml)$/i;

// Match Dockerfiles: Dockerfile, Dockerfile.dev, Dockerfile.prod, etc. (case-insensitive)
const DOCKERFILE_RE = /^dockerfile(?:\.[\w.-]+)?$/i;

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
      const name = e.name;
      if (COMPOSE_RE.test(name) || DOCKERFILE_RE.test(name)) {
        yield full;
      }
    }
  }
}

async function main() {
  const composeFiles = [];
  const dockerfiles = [];

  for await (const p of walk(SEARCH_ROOT)) {
    const base = path.basename(p);
    if (COMPOSE_RE.test(base)) composeFiles.push(p);
    else if (DOCKERFILE_RE.test(base)) dockerfiles.push(p);
  }

  // Sort for deterministic output: compose first (by path), then dockerfiles (by path)
  composeFiles.sort((a, b) => a.localeCompare(b));
  dockerfiles.sort((a, b) => a.localeCompare(b));
  const files = [...composeFiles, ...dockerfiles];

  const header = [
    '# docker files snapshot',
    `# Root: ${rel(SEARCH_ROOT) || '.'}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total files: ${files.length} (compose:${composeFiles.length}, dockerfiles:${dockerfiles.length})`,
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
    `${SCRIPT}:\n  found: ${files.length} (compose:${composeFiles.length}, dockerfiles:${dockerfiles.length})\n  wrote: ${path.relative(ROOT, OUT_FILE)}\n  time: ${secs}s`,
  );
}

main().catch((err) => {
  console.error('[error]', SCRIPT + ':', err);
  process.exitCode = 1;
});
