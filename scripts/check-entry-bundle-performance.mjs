import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const entryPath = resolve(process.env.TELLUS_ENTRY_HTML ?? "dist/index.html");
const maxRawBytes = Number(process.env.TELLUS_ENTRY_MAX_RAW_BYTES ?? 3_800_000);
const maxGzipBytes = Number(process.env.TELLUS_ENTRY_MAX_GZIP_BYTES ?? 1_100_000);
const html = await readFile(entryPath, "utf8");

const assetPaths = new Set();
for (const match of html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)="([^"]+)"/g)) {
  const assetPath = match[1];
  if (assetPath.startsWith("/assets/")) assetPaths.add(assetPath.slice(1));
}

const assets = [];
for (const assetPath of assetPaths) {
  const bytes = await readFile(resolve("dist", assetPath));
  assets.push({
    path: assetPath,
    rawBytes: bytes.byteLength,
    gzipBytes: gzipSync(bytes).byteLength,
  });
}

const rawBytes = assets.reduce((sum, asset) => sum + asset.rawBytes, 0);
const gzipBytes = assets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
const failures = [
  rawBytes > maxRawBytes && `initial raw assets ${rawBytes} > ${maxRawBytes} bytes`,
  gzipBytes > maxGzipBytes && `initial gzip assets ${gzipBytes} > ${maxGzipBytes} bytes`,
  assets.some((asset) => asset.path.includes("vendor-cesium")) &&
    "the primary Tellus entry must not preload the Cesium-only runtime",
].filter(Boolean);

const result = {
  entry: entryPath,
  budgets: { maxRawBytes, maxGzipBytes },
  totals: { rawBytes, gzipBytes },
  assets: assets.sort((a, b) => b.rawBytes - a.rawBytes),
  passed: failures.length === 0,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exitCode = 1;
