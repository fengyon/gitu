#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const [, , command, ...args] = process.argv;

// ─── split ────────────────────────────────────────────────────────────────────
async function splitFile(filePath, parts) {
  if (!filePath || !parts || parts < 1) {
    console.error("Usage: split <file> <parts>");
    process.exit(1);
  }

  const { size } = await fs.promises.stat(filePath);
  const chunkSize = Math.ceil(size / parts);
  const ext = path.extname(filePath);
  const base = filePath.slice(0, -ext.length || undefined);

  console.log(`📂 File size: ${size} bytes → ${parts} parts (~${chunkSize} bytes each)`);

  for (let i = 0; i < parts; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize - 1, size - 1);
    const outPath = `${base}${ext}-${i + 1}.partial`;

    const readStream = fs.createReadStream(filePath, { start, end });
    const writeStream = fs.createWriteStream(outPath);

    await pipeline(readStream, writeStream);
    console.log(`  ✅ ${outPath}  (${end - start + 1} bytes)`);
  }

  console.log("✨ Split complete.");
}

// ─── merge ────────────────────────────────────────────────────────────────────
async function mergeFile(filePath) {
  if (!filePath) {
    console.error("Usage: merge <file>");
    process.exit(1);
  }

  const dir = path.dirname(filePath);
  const basename = path.basename(filePath);

  // Collect all matching partials, sorted numerically
  const entries = await fs.promises.readdir(dir);
  const partials = entries
    .filter((f) => f.startsWith(basename + "-") && f.endsWith(".partial"))
    .sort((a, b) => {
      const numA = parseInt(a.match(/-(\d+)\.partial$/)?.[1] ?? "0", 10);
      const numB = parseInt(b.match(/-(\d+)\.partial$/)?.[1] ?? "0", 10);
      return numA - numB;
    });

  if (partials.length === 0) {
    console.error(`❌ No partial files found for: ${filePath}`);
    process.exit(1);
  }

  console.log(`🔗 Merging ${partials.length} parts → ${filePath}`);

  const writeStream = fs.createWriteStream(filePath);

  for (const partial of partials) {
    const partPath = path.join(dir, partial);
    const readStream = fs.createReadStream(partPath);

    // pipeline closes the writable on finish by default — use { end: false }
    await new Promise((resolve, reject) => {
      readStream.on("error", reject);
      readStream.on("end", resolve);
      readStream.pipe(writeStream, { end: false });
    });

    const { size } = await fs.promises.stat(partPath);
    console.log(`  ✅ ${partial}  (${size} bytes)`);
  }

  writeStream.end();
  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  const { size } = await fs.promises.stat(filePath);
  console.log(`✨ Merge complete. Output: ${filePath} (${size} bytes)`);
}

// ─── dispatch ─────────────────────────────────────────────────────────────────
switch (command) {
  case "split": {
    const [file, partsStr] = args;
    await splitFile(file, parseInt(partsStr, 10));
    break;
  }
  case "merge": {
    const [file] = args;
    await mergeFile(file);
    break;
  }
  default:
    console.log(`
Usage:
  node file-split-merge.mjs split <file> <parts>   — split file into N parts
  node file-split-merge.mjs merge <file>            — merge parts back into file

Examples:
  node file-split-merge.mjs split video.mp4 5
  node file-split-merge.mjs merge video.mp4
    `.trim());
    process.exit(0);
}
