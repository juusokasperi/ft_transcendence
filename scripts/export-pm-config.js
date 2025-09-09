#!/usr/bin/env node
/**
 * export-pm-config.js
 *
 * 1) Snapshot all relevant config/PM/CI files to scripts/output/pkg-mgmt-snapshot
 * 2) Export grouped .txt files (workflows, package-management, docker, makefiles,
 *    devcontainer, dotconfig, vscode, husky, nginx, miscellaneous) into scripts/output
 *
 * Safe by default:
 *  - Skips node_modules, .git, dist, build, .cache, .next, and root scripts/
 *  - Includes .env.example, but excludes .env unless --include-env is passed
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { once } = require("events");

// ---------------- Args ----------------
const argv = process.argv.slice(2);
let SNAPSHOT_DIR = "scripts/output/pkg-mgmt-snapshot";
let OUT_DIR = "scripts/output";
let INCLUDE_ENV = false;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--snapshot" && i + 1 < argv.length) SNAPSHOT_DIR = argv[++i];
  else if (a === "--out" && i + 1 < argv.length) OUT_DIR = argv[++i];
  else if (a === "--include-env") INCLUDE_ENV = true;
}

const START_DIR = process.cwd();
const SNAPSHOT_ROOT = path.resolve(SNAPSHOT_DIR);
const OUT_ROOT = path.resolve(OUT_DIR);

// ---------------- Helpers ----------------
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".cache", ".next"]);
const SKIP_ROOT_DIRS = new Set(["scripts"]); // skip top-level scripts/

const OUT_DIR_WITH_SEP = SNAPSHOT_ROOT + path.sep;
function isInsideOutDir(absPath) {
  return absPath === SNAPSHOT_ROOT || absPath.startsWith(OUT_DIR_WITH_SEP);
}
function toPosix(p) { return p.split(path.sep).join("/"); }
function relFromSnapshot(abs) { return toPosix(path.relative(SNAPSHOT_ROOT, abs)); }
async function ensureDir(p) { await fsp.mkdir(p, { recursive: true }); }
async function exists(p) { try { await fsp.stat(p); return true; } catch { return false; } }

// quick text writer with backpressure
async function writeAsync(stream, data) { if (!stream.write(data)) await once(stream, "drain"); }

async function* readDirSorted(absDir) {
  const entries = await fsp.readdir(absDir, { withFileTypes: true }).catch(() => []);
  const dirs = [], files = [];
  for (const e of entries) (e.isDirectory() ? dirs : files).push(e);
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  yield* dirs;
  yield* files;
}

async function* walkProject(dirAbs) {
  const entries = await fsp.readdir(dirAbs, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    const abs = path.join(dirAbs, e.name);
    if (isInsideOutDir(abs)) continue;
    const atRoot = path.dirname(abs) === START_DIR;

    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (atRoot && SKIP_ROOT_DIRS.has(e.name)) continue;
      yield* walkProject(abs);
    } else if (e.isFile()) {
      const rel = path.relative(START_DIR, abs);
      if (rel === "scripts" || rel.startsWith(`scripts${path.sep}`)) continue;
      yield abs;
    }
  }
}

async function copyFileToSnapshot(absProjectPath) {
  const rel = path.relative(START_DIR, absProjectPath);
  const dst = path.join(SNAPSHOT_ROOT, rel);
  await ensureDir(path.dirname(dst));
  await fsp.copyFile(absProjectPath, dst).catch(() => {});
}

function headerFor(rel, size) {
  const line = "=".repeat(80);
  return `${line}\nFILE: ./${rel} (${size} bytes)\n${line}\n\n`;
}

async function appendFileToStream(abs, out) {
  const rs = fs.createReadStream(abs, { encoding: "utf8", highWaterMark: 64 * 1024 });
  for await (const chunk of rs) {
    if (!out.write(chunk)) await once(out, "drain");
  }
  if (!out.write("\n")) await once(out, "drain");
}

// ---------------- Classifiers ----------------
function isWorkflow(rel) { return rel.startsWith(".github/workflows/") && /\.(ya?ml)$/i.test(rel); }
function isDockerFile(base) { return /^Dockerfile(\..+)?$/.test(base); }
function isCompose(rel) { return /(^|\/)docker-compose(\..+)?\.ya?ml$/i.test(rel); }
function isNginx(rel) { return rel.startsWith("nginx/") || /nginx/i.test(rel) && rel.endsWith(".conf"); }

function isPackageJson(base) { return base === "package.json"; }
function isWorkspace(rel) { return /(^|\/)pnpm-workspace\.ya?ml$/i.test(rel); }
function isLockfile(base) { return ["package-lock.json","pnpm-lock.yaml","yarn.lock"].includes(base); }
function isPMConfig(base) { return [".npmrc",".pnpmrc",".yarnrc",".yarnrc.yml"].includes(base); }
function isNodePin(base) { return [".nvmrc",".node-version"].includes(base); }
function isGitignore(base) { return base === ".gitignore"; }

function isMakefile(base) { return base === "Makefile"; }
function isDevcontainer(rel) { return rel.startsWith(".devcontainer/"); }
function isDotConfig(rel) { return rel.startsWith(".config/"); }
function isVscode(rel) { return rel.startsWith(".vscode/"); }
function isHusky(rel) { return rel.startsWith(".husky/"); }

function isEnvExample(rel) { return rel.endsWith(".env.example") || path.posix.basename(rel) === ".env.example"; }
function isEnvReal(rel) { return path.posix.basename(rel) === ".env"; }

// common tool configs that matter for PM/CI
function isToolConfig(rel, base) {
  const toolNames = [
    // TypeScript / bundlers / lint / format
    "tsconfig.json","typedoc.json","vite.config.ts","vite.config.js",
    "eslint.config.js","eslint.config.cjs",".eslintrc",".eslintrc.js",".eslintrc.cjs",".eslintrc.json",".eslintrc.yml",
    "prettier.config.cjs","prettier.config.js",".prettier.json",".prettierc",".prettierignore",
    "tailwind.config.js","tailwind.config.cjs","tailwind.config.ts",
    ".dependency-cruiser.mjs",".editorconfig"
  ];
  if (toolNames.includes(base)) return true;
  // keep all under .config/** already captured via isDotConfig
  // keep vite/tailwind multi-name patterns
  if (/^vite\.config\.(js|cjs|mjs|ts)$/.test(base)) return true;
  if (/^tailwind\.config\.(js|cjs|mjs|ts)$/.test(base)) return true;
  return false;
}

function classify(rel) {
  const base = path.posix.basename(rel);
  if (isWorkflow(rel)) return "workflows";
  if (isDockerFile(base) || isCompose(rel)) return "docker";
  if (isNginx(rel)) return "nginx";
  if (isMakefile(base)) return "makefiles";
  if (isDevcontainer(rel)) return "devcontainer";
  if (isDotConfig(rel)) return "dotconfig";
  if (isVscode(rel)) return "vscode";
  if (isHusky(rel)) return "husky";

  // package-management group
  if (
    isPackageJson(base) ||
    isWorkspace(rel) ||
    isLockfile(base) ||
    isPMConfig(base) ||
    isNodePin(base) ||
    isGitignore(base) ||
    isToolConfig(rel, base)
  ) return "packageMgmt";

  // env
  if (isEnvExample(rel)) return "envsamples";
  if (INCLUDE_ENV && isEnvReal(rel)) return "envreal";

  return "misc";
}

// ---------------- Step 1: build snapshot ----------------
async function buildSnapshot() {
  await fsp.rm(SNAPSHOT_ROOT, { recursive: true, force: true }).catch(() => {});
  await ensureDir(SNAPSHOT_ROOT);

  const selected = [];
  for await (const abs of walkProject(START_DIR)) {
    const rel = toPosix(path.relative(START_DIR, abs));
    const base = path.posix.basename(rel);

    const cat = classify(rel);
    // Always include everything except real .env when INCLUDE_ENV is false
    if (cat === "envreal" && !INCLUDE_ENV) continue;

    // Only snapshot "relevant" categories; misc still goes in snapshot so we can inspect if needed
    const include =
      ["workflows","docker","nginx","makefiles","devcontainer","dotconfig","vscode","husky","packageMgmt","envsamples","envreal","misc"].includes(cat);

    if (!include) continue;
    await copyFileToSnapshot(abs);
    selected.push({ abs, rel, cat });
  }
  return selected;
}

// ---------------- Step 2: export grouped .txt ----------------
async function exportGroupedTxt() {
  await ensureDir(OUT_ROOT);

  const groups = {
    workflows: [], packageMgmt: [], docker: [], makefiles: [],
    devcontainer: [], dotconfig: [], vscode: [], husky: [],
    nginx: [], envsamples: [], envreal: [], misc: []
  };

  // Walk snapshot (not the project) to guarantee consistency
  async function* walkSnapshot(dirAbs) {
    for await (const e of readDirSorted(dirAbs)) {
      const abs = path.join(dirAbs, e.name);
      if (e.isDirectory()) yield* walkSnapshot(abs);
      else if (e.isFile()) yield abs;
    }
  }
  for await (const abs of walkSnapshot(SNAPSHOT_ROOT)) {
    const rel = relFromSnapshot(abs);
    const cat = classify(rel);
    // filter .env if not asked (shouldn't exist due to buildSnapshot guard; keep anyway)
    if (cat === "envreal" && !INCLUDE_ENV) continue;
    if (!groups[cat]) groups.misc.push({ abs, rel }); else groups[cat].push({ abs, rel });
  }

  const filespecs = [
    ["workflows.txt", "workflows"],
    ["package-management.txt", "packageMgmt"],
    ["docker.txt", "docker"],
    ["nginx.txt", "nginx"],
    ["makefiles.txt", "makefiles"],
    ["devcontainer.txt", "devcontainer"],
    ["dotconfig.txt", "dotconfig"],
    ["vscode.txt", "vscode"],
    ["husky.txt", "husky"],
    ["env-samples.txt", "envsamples"],
    ...(INCLUDE_ENV ? [["env-real.txt", "envreal"]] : []),
    ["miscellaneous.txt", "misc"],
  ];

  for (const [outfile, key] of filespecs) {
    const items = groups[key].sort((a, b) => a.rel.localeCompare(b.rel));
    const outPath = path.join(OUT_ROOT, outfile);
    const out = fs.createWriteStream(outPath, { encoding: "utf8" });

    const header = [
      `===== ${outfile.toUpperCase()} =====`,
      `Snapshot root (./): ${toPosix(SNAPSHOT_ROOT)}`,
      `Exported: ${new Date().toISOString()}`,
      `Files: ${items.length}`,
      "",
    ].join("\n");
    await writeAsync(out, header);

    for (const { abs, rel } of items) {
      const st = await fsp.stat(abs).catch(() => null);
      const size = st ? st.size : 0;
      await writeAsync(out, headerFor(rel, size));
      await appendFileToStream(abs, out);
    }

    out.end();
    await once(out, "finish");
    console.log(`Wrote ${outfile} (${items.length} files).`);
  }

  console.log(`All exports -> ${toPosix(OUT_ROOT)}`);
}

// ---------------- Main ----------------
(async function main() {
  console.log(`Building snapshot at ${toPosix(SNAPSHOT_ROOT)} (include .env: ${INCLUDE_ENV})`);
  await buildSnapshot();
  console.log("Snapshot built. Exporting grouped .txt…");
  await exportGroupedTxt();
})().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
