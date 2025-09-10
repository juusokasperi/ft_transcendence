#!/usr/bin/env node
/**
 * Export selected folders into .txt snapshots (concatenated text files).
 * Output goes to scripts/output/<sanitized-path>.txt
 *
 * Defaults cover:
 * - apps/api
 * - apps/web
 * - infra
 * - log-management
 * - packages/game-logic
 * - packages/protocol
 * - packages/render-babylon
 * - packages/shared
 *
 * Usage:
 *   node scripts/export-folders-to-txt.js
 *   node scripts/export-folders-to-txt.js --out scripts/output --dirs apps/api packages/shared
 */

import { promises as fsp } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Config (sensible defaults; keep it simple) ----------------------------
const DEFAULT_DIRS = [
  "apps/api",
  "apps/web",
  "infra",
  "log-management",
  "packages/game-logic",
  "packages/protocol",
  "packages/render-babylon",
  "packages/shared",
];

const OUTPUT_DIR_DEFAULT = path.resolve(__dirname, "output");

// Skip obvious heavy or generated folders anywhere in the tree
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".cache",
  ".next",
  ".vite",
  "coverage",
  ".turbo",
]);

// Treat these file extensions as text. (Deliberately small + safe.)
const TEXT_EXTS = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs",
  ".json", ".json5", ".jsonc",
  ".md", ".mdx", ".txt",
  ".css", ".scss",
  ".html", ".htm",
  ".yml", ".yaml",
  ".env", ".env.example",
  ".ini", ".cfg", ".conf",
  ".gitignore", ".gitattributes", ".editorconfig",
  ".dockerfile", "dockerfile",
]);

// Size guard to avoid dumping accidental blobs (adjust if needed)
const MAX_FILE_BYTES = 1024 * 1024; // 1 MB per file

// ---- CLI minimalism --------------------------------------------------------
const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : fallback;
};
const rawDirs = getArg("--dirs", "").trim();
const TARGET_DIRS = rawDirs ? rawDirs.split(/\s+/) : DEFAULT_DIRS;
const OUTPUT_DIR = path.resolve(getArg("--out", OUTPUT_DIR_DEFAULT));

// ---- Helpers ---------------------------------------------------------------
const isProbablyText = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTS.has(ext)) return true;
  // Allow dotfiles with no ext if commonly text-y
  const base = path.basename(filePath).toLowerCase();
  if (TEXT_EXTS.has(base)) return true;
  return false;
};

const sanitizeOutName = (relPath) =>
  relPath.replace(/^[./\\]+/, "").replace(/[\\/]+/g, "__") + ".txt";

async function* walk(dirAbs, repoRootAbs) {
  const entries = await fsp.readdir(dirAbs, { withFileTypes: true });
  // sort for deterministic output (folders first, then files)
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const e of entries) {
    const p = path.join(dirAbs, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR_NAMES.has(e.name)) continue;
      yield* walk(p, repoRootAbs);
    } else if (e.isFile()) {
      yield p;
    }
  }
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function fileToBlock(repoRootAbs, fileAbs) {
  try {
    const stat = await fsp.stat(fileAbs);
    if (stat.size > MAX_FILE_BYTES) {
      return `===== BEGIN ${path.relative(repoRootAbs, fileAbs)} (SKIPPED: > ${MAX_FILE_BYTES} bytes) =====\n\n`;
    }
    if (!isProbablyText(fileAbs)) {
      return `===== BEGIN ${path.relative(repoRootAbs, fileAbs)} (SKIPPED: non-text) =====\n\n`;
    }
    const content = await fsp.readFile(fileAbs, "utf8");
    const rel = path.relative(repoRootAbs, fileAbs).split(path.sep).join("/");
    return `===== BEGIN ${rel} =====\n${content}\n===== END ${rel} =====\n\n`;
  } catch (err) {
    const rel = path.relative(repoRootAbs, fileAbs).split(path.sep).join("/");
    return `===== BEGIN ${rel} (ERROR: ${err.message}) =====\n\n`;
  }
}

async function exportFolder(repoRootAbs, targetRel) {
  const targetAbs = path.resolve(repoRootAbs, targetRel);
  const outName = sanitizeOutName(targetRel);
  const outAbs = path.join(OUTPUT_DIR, outName);

  let blocks = [];
  try {
    const s = await fsp.stat(targetAbs);
    if (!s.isDirectory()) {
      const header = `# ${targetRel}\n\nNot a directory.\n`;
      await fsp.writeFile(outAbs, header, "utf8");
      return;
    }
  } catch {
    const header = `# ${targetRel}\n\nDirectory not found.\n`;
    await fsp.writeFile(outAbs, header, "utf8");
    return;
  }

  // Collect files deterministically
  const files = [];
  for await (const p of walk(targetAbs, repoRootAbs)) files.push(p);
  files.sort((a, b) => a.localeCompare(b));

  // Build output
  const header = [
    `# Snapshot of ${targetRel}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total files: ${files.length}`,
    "",
  ].join("\n");

  blocks.push(header);

  for (const fileAbs of files) {
    blocks.push(await fileToBlock(repoRootAbs, fileAbs));
  }

  await fsp.writeFile(outAbs, blocks.join("\n"), "utf8");
}

async function main() {
  const repoRoot = path.resolve(__dirname, ".."); // assume script lives in scripts/
  await ensureDir(OUTPUT_DIR);
  // optional: keep folder in git if empty
  await fsp.writeFile(path.join(OUTPUT_DIR, ".gitkeep"), "", "utf8").catch(() => {});

  for (const rel of TARGET_DIRS) {
    // Normalize to POSIX-like for repeatability in names
    const cleanRel = rel.replace(/^[./\\]+/, "").split(path.sep).join("/");
    // eslint-disable-next-line no-console
    console.log(`Exporting ${cleanRel} → ${path.relative(repoRoot, path.join(OUTPUT_DIR, sanitizeOutName(cleanRel)))}`);
    await exportFolder(repoRoot, cleanRel);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
