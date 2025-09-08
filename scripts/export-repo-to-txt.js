#!/usr/bin/env node
if (typeof process === "undefined" || !process.version) {
  console.error("Error: Node.js is required to run this script.");
  process.exit(1);
}
/**
 * Export the whole repo into one TXT file, ignoring any "node_modules" dirs.
 * - Streams to avoid huge memory
 * - Skips its own output file if inside the tree
 * - Skips likely-binary files (null-byte sniff)
 *
 * Usage:
 *   node scripts/export-repo-to-txt.js [OUTPUT_FILE] [START_DIR]
 * Defaults:
 *   OUTPUT_FILE = ./all_repo_code.txt
 *   START_DIR   = process.cwd()
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { once } = require("events");

const OUT_FILE = path.resolve(process.argv[2] || "all_repo_code.txt");
const START_DIR = path.resolve(process.argv[3] || process.cwd());
const IGNORE_DIR_NAME = "node_modules";

function toPosix(p) { return p.split(path.sep).join("/"); }

async function isLikelyBinary(filePath) {
  const fd = await fsp.open(filePath, "r").catch(() => null);
  if (fd === null) {
    return true;
  }
  try {
    const buf = Buffer.alloc(8192);
    const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
    for (let i = 0; i < bytesRead; i++) if (buf[i] === 0) return true;
    return false;
  } finally { await fd.close().catch(() => {}); }
}

async function getStatSafe(p) { try { return await fsp.stat(p); } catch { return null; } }

function headerFor(rel, size) {
  const line = "-".repeat(80);
  return `${line}
FILE: ${rel} (${size} bytes)
ABS:  ${toPosix(path.resolve(rel))}
${line}\n`;
}

async function walkDir(dir, onFile) {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === IGNORE_DIR_NAME) continue;
    const abs = path.join(dir, entry.name);
    if (abs === OUT_FILE) continue;
    if (entry.isDirectory()) await walkDir(abs, onFile);
    else if (entry.isFile()) await onFile(abs);
  }
}

async function main() {
  await fsp.mkdir(path.dirname(OUT_FILE), { recursive: true });

  const out = fs.createWriteStream(OUT_FILE, { encoding: "utf8" });
  out.setMaxListeners(0); // avoid MaxListenersExceededWarning with many files
  out.on("error", (e) => {
    console.error("Output stream error:", e);
    process.exit(1);
  });

  async function writeChunk(text) {
    if (!out.write(text)) await once(out, "drain");
  }

  const start = Date.now();
  let files = 0, bytes = 0, skippedBinary = 0;

  await writeChunk(
    `===== REPO EXPORT =====
Start dir: ${toPosix(START_DIR)}
Generated: ${new Date().toISOString()}

`
  );

  await walkDir(START_DIR, async (abs) => {
    const rel = toPosix(path.relative(START_DIR, abs));
    const st = await getStatSafe(abs);
    if (!st) return;

    if (await isLikelyBinary(abs)) { skippedBinary++; return; }

    await writeChunk("\n" + headerFor(rel, st.size) + "\n");

    // Stream file -> out without ending out; wait for this read to finish
    await new Promise((resolve, reject) => {
      const rs = fs.createReadStream(abs, { encoding: "utf8" });
      rs.on("error", reject);
      rs.on("end", resolve);
      rs.pipe(out, { end: false });
    });

    await writeChunk("\n");
    files++;
    bytes += st.size;
  });

  await writeChunk(
    `\n===== SUMMARY =====
Files included:   ${files}
Binary skipped:   ${skippedBinary}
Approx bytes in:  ${bytes}
Duration:         ${Date.now() - start} ms

`
  );

  out.end();
  await once(out, "finish");
  console.log(
    `Exported ${files} files from ${toPosix(START_DIR)} to ${toPosix(OUT_FILE)} (skipped ${skippedBinary} binary-looking files).`
  );
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
