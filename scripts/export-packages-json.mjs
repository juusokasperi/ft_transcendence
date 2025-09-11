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

const IGNORE_DIRS = new Set(['node_modules','.git','.turbo','.cache','dist','build','coverage','tmp','temp']);
const TARGET_NAME = 'package.json';

async function *walk(dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name)) yield* walk(full);
    } else if (e.isFile() && e.name === TARGET_NAME) {
      yield full;
    }
  }
}

function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

async function main() {
  const files = [];
  for await (const p of walk(SEARCH_ROOT)) files.push(p);
  files.sort((a,b) => a.localeCompare(b));
  const header = [
    '# package.json snapshot',
    `# Root: ${rel(SEARCH_ROOT).length ? rel(SEARCH_ROOT) : '.'}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total files: ${files.length}`,
    ''
  ].join('\n');
  const chunks = [header];
  for (const file of files) {
    let content = '';
    try { content = await fs.readFile(file, 'utf8'); }
    catch (e) { content = `<ERROR: failed to read file: ${e.message}>`; }
    const relpath = rel(file);
    chunks.push(`===== BEGIN ${relpath} =====`, content.trimEnd(), `===== END ${relpath} =====`, '');
  }
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(OUT_FILE, chunks.join('\n'), 'utf8');

  const secs = ((Date.now()-START)/1000).toFixed(2);
  console.log(`${SCRIPT}:\n  found: ${files.length} package.json\n  wrote: ${rel(OUT_FILE)}\n  time: ${secs}s`);
}

main().catch((err) => { console.error('[error]', SCRIPT+':', err); process.exitCode = 1; });
