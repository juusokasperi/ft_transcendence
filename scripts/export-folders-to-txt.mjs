#!/usr/bin/env node
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCRIPT = 'export-folders-to-txt';
const ROOT = path.resolve(__dirname, '..');
const START = Date.now();
const OUTPUT_DIR = path.join(ROOT, 'scripts', 'output');

// Default targets (override with --dirs)
const DEFAULT_DIRS = [
  'apps/allocator',
  'apps/backend',
  'apps/chat',
  'apps/backend',
  'apps/frontend/src',
  'apps/frontend/tests',
  'apps/game-gateway',
  'apps/game-server',
  'apps/matchmaking',
  'apps/scorer',
  'log-management',
  'monitoring',
  'packages/pong/game-logic',
  'packages/pong/render',
  'packages/pong/shared',
  'apps/frontend/src/pages/pong/local'
];

const MAX_FILE_BYTES = 1024 * 1024; // 1MB guard
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
const TEXT_EXTS = new Set([
  '.md',
  '.txt',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.yml',
  '.yaml',
  '.css',
  '.scss',
  '.html',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.rs',
]);

function getArg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

function isProbablyText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTS.has(ext)) return true;
  const base = path.basename(filePath).toLowerCase();
  if (base === 'license' || base === 'readme' || base.endsWith('.env')) return true;
  return false;
}

const sanitizeOutName = (relPath) =>
  relPath.replace(/^[./\\]+/, '').replace(/[\\/]+/g, '__') + '.txt';

async function* walk(dirAbs) {
  let entries;
  try {
    entries = await fsp.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    const full = path.join(dirAbs, e.name);
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name)) yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

async function exportFolder(relDir) {
  const absDir = path.join(ROOT, relDir);
  let stat;
  try {
    stat = await fsp.stat(absDir);
  } catch {
    stat = null;
  }
  const outFile = path.join(OUTPUT_DIR, sanitizeOutName(relDir));
  let chunks = [];
  if (!stat || !stat.isDirectory()) {
    chunks.push(`# ${rel(relDir)}`, '', 'Directory not found or not a directory.', '');
  } else {
    chunks.push(`# ${rel(relDir)}`, '');
    const files = [];
    for await (const f of walk(absDir)) files.push(f);
    files.sort((a, b) => a.localeCompare(b));
    for (const file of files) {
      let block = '';
      try {
        const s = await fsp.stat(file);
        if (s.size > MAX_FILE_BYTES)
          block = `===== BEGIN ${rel(file)} (SKIPPED: > ${MAX_FILE_BYTES} bytes) =====\n`;
        else if (!isProbablyText(file))
          block = `===== BEGIN ${rel(file)} (SKIPPED: non-text) =====\n`;
        else {
          const content = await fsp.readFile(file, 'utf8');
          block = `===== BEGIN ${rel(file)} =====\n${content}\n===== END ${rel(file)} =====\n`;
        }
      } catch (e) {
        block = `===== BEGIN ${rel(file)} (ERROR) =====\n<ERROR: ${e.message}>\n`;
      }
      chunks.push(block, '');
    }
  }
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  await fsp.writeFile(outFile, chunks.join('\n'), 'utf8');
  return outFile;
}

async function main() {
  const dirsArg = getArg('--dirs', '');
  const targets = dirsArg ? dirsArg.split(/\s+/).filter(Boolean) : DEFAULT_DIRS.slice();
  const outputs = [];
  for (const d of targets) {
    outputs.push(await exportFolder(d));
  }
  const secs = ((Date.now() - START) / 1000).toFixed(2);
  const first = outputs.length ? rel(outputs[0]) : path.join('scripts', 'output');
  const more = Math.max(0, outputs.length - 1);
  const dest = more ? `${first} (+${more} more)` : first;
  console.log(
    `${SCRIPT}:\n  dirs: ${targets.length}\n  wrote: ${outputs.length} file(s) → ${dest}\n  time: ${secs}s`,
  );
}

main().catch((err) => {
  console.error('[error]', SCRIPT + ':', err);
  process.exitCode = 1;
});
