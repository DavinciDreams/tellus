import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fromFile } from "geotiff";

const CHUNK_SEGMENTS = 64;
const CHUNK_VERTEX_COUNT = CHUNK_SEGMENTS + 1;
const CHUNK_SPAN = 96;

const TERRAIN_PAINT_CODES = {
  meadow: 1,
  beach: 2,
  dirt: 3,
  rock: 4,
  snow: 5,
  flowers: 6,
  stone: 7,
  brick: 8,
  grass: 9,
  gravel: 10,
  "forest-floor": 11,
  "jungle-moss": 12,
  "desert-sand": 13,
};

const DEFAULTS = {
  sourceUrl: "https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n38w120/USGS_13_n38w120.tif",
  sourceBounds: null,
  bbox: [-119.72, 37.69, -119.48, 37.80],
  chunksX: 20,
  metersPerWorldUnitY: 18,
  cliffBoost: 0.42,
  outDir: "public/terrain/yosemite",
  cacheDir: "external/usgs-dem",
  title: "Yosemite Terrain",
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (!key || value === undefined) continue;
    if (key === "source-url") args.sourceUrl = value;
    if (key === "source-bounds") args.sourceBounds = value.split(",").map(Number);
    if (key === "bbox") args.bbox = value.split(",").map(Number);
    if (key === "chunks") args.chunksX = Math.max(1, Math.round(Number(value)));
    if (key === "vertical-meters-per-unit") args.metersPerWorldUnitY = Math.max(1, Number(value));
    if (key === "cliff-boost") args.cliffBoost = Math.max(0, Number(value));
    if (key === "out") args.outDir = value;
    if (key === "cache") args.cacheDir = value;
    if (key === "title") args.title = value;
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function metersForBbox([minLon, minLat, maxLon, maxLat]) {
  const midLat = ((minLat + maxLat) / 2) * Math.PI / 180;
  return {
    width: Math.abs(maxLon - minLon) * 111_320 * Math.cos(midLat),
    height: Math.abs(maxLat - minLat) * 110_540,
  };
}

function assertBboxInsideSource(bbox, sourceBounds) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const [sourceMinLon, sourceMinLat, sourceMaxLon, sourceMaxLat] = sourceBounds;
  const epsilon = 1e-6;
  const outside =
    minLon < sourceMinLon - epsilon ||
    maxLon > sourceMaxLon + epsilon ||
    minLat < sourceMinLat - epsilon ||
    maxLat > sourceMaxLat + epsilon;
  if (!outside) return;
  throw new Error(
    [
      "Requested bbox extends outside the DEM source bounds.",
      `bbox: ${bbox.join(",")}`,
      `source bounds: ${sourceBounds.join(",")}`,
      "Use a bbox inside this tile or add adjacent-tile mosaicking before baking.",
    ].join("\n"),
  );
}

function percentile(values, p) {
  const sorted = Array.from(values).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const i = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[i];
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

async function download(url, target) {
  if (fs.existsSync(target) && fs.statSync(target).size > 0) return;
  console.log(`[yosemite-dem] downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`download failed ${response.status} ${response.statusText}`);
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(target));
}

async function readDem(file) {
  const tiff = await fromFile(file);
  const image = await tiff.getImage();
  const data = await image.readRasters({ interleave: true });
  const bbox = image.getBoundingBox();
  const noData = image.getGDALNoData();
  return {
    data,
    width: image.getWidth(),
    height: image.getHeight(),
    channels: image.getSamplesPerPixel(),
    sourceBounds: [bbox[0], bbox[1], bbox[2], bbox[3]],
    noData: noData === null ? null : Number(noData),
  };
}

function demValueAt(dem, x, y) {
  const ix = Math.max(0, Math.min(dem.width - 1, x));
  const iy = Math.max(0, Math.min(dem.height - 1, y));
  return dem.data[(iy * dem.width + ix) * dem.channels];
}

function sampleDem(dem, sourceBounds, lon, lat) {
  const [minLon, minLat, maxLon, maxLat] = sourceBounds;
  const px = ((lon - minLon) / (maxLon - minLon)) * (dem.width - 1);
  const py = ((maxLat - lat) / (maxLat - minLat)) * (dem.height - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = px - x0;
  const ty = py - y0;
  const a = demValueAt(dem, x0, y0);
  const b = demValueAt(dem, x1, y0);
  const c = demValueAt(dem, x0, y1);
  const d = demValueAt(dem, x1, y1);
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

function paintCodeFor(elevationMeters, referenceMeters, slope) {
  const relative = elevationMeters - referenceMeters;
  if (elevationMeters > 3025 || (elevationMeters > 2860 && slope > 0.35)) return TERRAIN_PAINT_CODES.snow;
  if (slope > 0.72 || (elevationMeters > 2350 && slope > 0.42)) return TERRAIN_PAINT_CODES.rock;
  if (slope > 0.42) return TERRAIN_PAINT_CODES.gravel;
  if (relative < 180) return TERRAIN_PAINT_CODES.meadow;
  if (elevationMeters < 2150) return TERRAIN_PAINT_CODES["forest-floor"];
  if (elevationMeters < 2550) return TERRAIN_PAINT_CODES.dirt;
  return TERRAIN_PAINT_CODES.meadow;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceName = path.basename(new URL(args.sourceUrl).pathname);
  ensureDir(args.cacheDir);
  const sourceFile = path.join(args.cacheDir, sourceName);
  await download(args.sourceUrl, sourceFile);

  console.log(`[yosemite-dem] reading ${sourceFile}`);
  const dem = await readDem(sourceFile);
  const sourceBounds = args.sourceBounds ?? dem.sourceBounds;
  if (!sourceBounds || sourceBounds.length !== 4 || sourceBounds.some((v) => !Number.isFinite(v))) {
    throw new Error("Could not determine DEM source bounds; pass --source-bounds=minLon,minLat,maxLon,maxLat");
  }
  assertBboxInsideSource(args.bbox, sourceBounds);
  console.log(`[yosemite-dem] DEM ${dem.width}x${dem.height}, bounds ${sourceBounds.join(",")}`);
  const meters = metersForBbox(args.bbox);
  const chunksY = Math.max(1, Math.round(args.chunksX * (meters.height / meters.width)));
  const gridW = args.chunksX * CHUNK_SEGMENTS + 1;
  const gridH = chunksY * CHUNK_SEGMENTS + 1;
  const worldW = args.chunksX * CHUNK_SPAN;
  const worldH = chunksY * CHUNK_SPAN;
  const cellMetersX = meters.width / Math.max(1, gridW - 1);
  const cellMetersZ = meters.height / Math.max(1, gridH - 1);
  const elevations = new Float32Array(gridW * gridH);

  const [minLon, minLat, maxLon, maxLat] = args.bbox;
  for (let gz = 0; gz < gridH; gz++) {
    const v = gz / (gridH - 1);
    const lat = maxLat - v * (maxLat - minLat);
    for (let gx = 0; gx < gridW; gx++) {
      const u = gx / (gridW - 1);
      const lon = minLon + u * (maxLon - minLon);
      elevations[gz * gridW + gx] = sampleDem(dem, sourceBounds, lon, lat);
    }
  }

  const referenceMeters = percentile(elevations, 0.035);
  const minMeters = percentile(elevations, 0);
  const maxMeters = percentile(elevations, 1);
  const outDir = args.outDir;
  const chunksDir = path.join(outDir, "chunks");
  fs.rmSync(chunksDir, { recursive: true, force: true });
  ensureDir(chunksDir);

  const manifestChunks = [];
  for (let cz = 0; cz < chunksY; cz++) {
    for (let cx = 0; cx < args.chunksX; cx++) {
      const sculptOffsets = [];
      const paint = [];
      for (let z = 0; z < CHUNK_VERTEX_COUNT; z++) {
        const gz = cz * CHUNK_SEGMENTS + z;
        for (let x = 0; x < CHUNK_VERTEX_COUNT; x++) {
          const gx = cx * CHUNK_SEGMENTS + x;
          const elevation = elevations[gz * gridW + gx];
          const left = elevations[gz * gridW + Math.max(0, gx - 1)];
          const right = elevations[gz * gridW + Math.min(gridW - 1, gx + 1)];
          const up = elevations[Math.max(0, gz - 1) * gridW + gx];
          const down = elevations[Math.min(gridH - 1, gz + 1) * gridW + gx];
          const slope = Math.hypot((right - left) / (cellMetersX * 2), (down - up) / (cellMetersZ * 2));
          const relief = elevation - referenceMeters;
          const cliffRelief = relief * (1 + Math.min(1.2, slope) * args.cliffBoost);
          sculptOffsets.push(round2(cliffRelief / args.metersPerWorldUnitY));
          paint.push(paintCodeFor(elevation, referenceMeters, slope));
        }
      }
      const chunk = {
        cx,
        cz,
        revision: 1,
        segments: CHUNK_SEGMENTS,
        heightMode: "absolute",
        sculptOffsets,
        paint,
      };
      fs.writeFileSync(path.join(chunksDir, `${cx}_${cz}.json`), `${JSON.stringify(chunk)}\n`);
      manifestChunks.push({ cx, cz, revision: 1 });
    }
  }

  const manifest = {
    width: args.chunksX,
    height: chunksY,
    span: CHUNK_SPAN,
    segments: CHUNK_SEGMENTS,
    chunks: manifestChunks,
    source: {
      name: args.title,
      url: args.sourceUrl,
      license: "Public domain (USGS 3DEP)",
      sourceBounds,
      bbox: args.bbox,
      demWidth: dem.width,
      demHeight: dem.height,
      minElevationMeters: round2(minMeters),
      maxElevationMeters: round2(maxMeters),
      referenceElevationMeters: round2(referenceMeters),
      horizontalMeters: {
        width: round2(meters.width),
        height: round2(meters.height),
      },
      metersPerWorldUnitY: args.metersPerWorldUnitY,
      cliffBoost: args.cliffBoost,
      generatedAt: new Date().toISOString(),
    },
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "README.md"), `# ${args.title}\n\nStatic Tellus chunk bake from USGS 3DEP public-domain elevation data.\n\nSource: ${args.sourceUrl}\n\nBBox: ${args.bbox.join(", ")}\n\nChunks: ${args.chunksX} x ${chunksY}\n\nElevation range: ${round2(minMeters)}m to ${round2(maxMeters)}m; reference ${round2(referenceMeters)}m.\n`);
  console.log(`[yosemite-dem] wrote ${args.chunksX}x${chunksY} chunks to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
