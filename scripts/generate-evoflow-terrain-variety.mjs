import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const SIZE = 256;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = path.join(ROOT, "public", "evoflow", "terrain_variety");

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const gaussian = (value, center, width) => Math.exp(-((value - center) ** 2) / (2 * width ** 2));

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeValueNoise(seed, gridSize) {
  const random = mulberry32(seed);
  const grid = new Float32Array((gridSize + 1) * (gridSize + 1));
  for (let index = 0; index < grid.length; index += 1) grid[index] = random();

  return (u, v) => {
    const gx = clamp(u) * gridSize;
    const gy = clamp(v) * gridSize;
    const x0 = Math.min(gridSize - 1, Math.floor(gx));
    const y0 = Math.min(gridSize - 1, Math.floor(gy));
    const x1 = x0 + 1;
    const y1 = y0 + 1;
    const tx = smoothstep(0, 1, gx - x0);
    const ty = smoothstep(0, 1, gy - y0);
    const at = (x, y) => grid[y * (gridSize + 1) + x];
    return lerp(lerp(at(x0, y0), at(x1, y0), tx), lerp(at(x0, y1), at(x1, y1), tx), ty);
  };
}

function makeFbm(seed) {
  const layers = [
    { amplitude: 1, sample: makeValueNoise(seed + 11, 4) },
    { amplitude: 0.52, sample: makeValueNoise(seed + 29, 8) },
    { amplitude: 0.27, sample: makeValueNoise(seed + 47, 16) },
    { amplitude: 0.13, sample: makeValueNoise(seed + 71, 32) },
  ];
  const total = layers.reduce((sum, layer) => sum + layer.amplitude, 0);
  return (x, z) => layers.reduce(
    (sum, layer) => sum + layer.sample(x * 0.5 + 0.5, z * 0.5 + 0.5) * layer.amplitude,
    0,
  ) / total;
}

function rotated(x, z, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

function ellipsePeak(x, z, cx, cz, sx, sz, rotation = 0) {
  const point = rotated(x - cx, z - cz, rotation);
  return Math.exp(-((point.x / sx) ** 2 + (point.z / sz) ** 2) * 2.2);
}

const terrainFamilies = [
  {
    id: "world_river_canyon",
    template: "evoflow-coral-canyon-child",
    topology: "river-canyon",
    concept: "a broad upland divided by a winding river canyon and tributary ravines",
    seed: 7319,
    palette: [[24, 73, 84], [55, 101, 82], [126, 127, 82], [196, 176, 126]],
    height(x, z, noise) {
      const riverCenter = -0.32 + 0.15 * Math.sin(z * 2.7 + 0.4) + 0.06 * Math.sin(z * 7.2 - 0.7);
      const tributary = Math.abs(z + 0.38 + 0.35 * Math.sin((x + 0.2) * 2.4));
      const mainDistance = Math.abs(x - riverCenter);
      const valley = smoothstep(0.045, 0.62, mainDistance);
      const tributaryCut = (1 - smoothstep(0.02, 0.2, tributary)) * smoothstep(0.05, 0.9, Math.abs(x));
      return 0.2 + valley * 0.48 - tributaryCut * 0.18 + (noise - 0.5) * 0.22;
    },
  },
  {
    id: "world_alpine_spires",
    template: "evoflow-spires",
    topology: "alpine-spires",
    concept: "an asymmetric alpine range with isolated spires, saddles, and open foothills",
    seed: 11429,
    palette: [[39, 65, 83], [67, 99, 108], [116, 131, 134], [221, 229, 230]],
    height(x, z, noise) {
      const spine = gaussian(z - (0.25 * x - 0.12 * Math.sin(x * 4)), 0, 0.17) * 0.35;
      const peaks = [
        ellipsePeak(x, z, -0.58, -0.3, 0.13, 0.18, -0.35),
        ellipsePeak(x, z, -0.18, 0.05, 0.16, 0.12, 0.2),
        ellipsePeak(x, z, 0.28, 0.18, 0.12, 0.18, 0.55),
        ellipsePeak(x, z, 0.62, 0.42, 0.14, 0.12, 0.1),
      ];
      return 0.14 + spine + Math.max(...peaks) * 0.58 + Math.abs(noise - 0.5) * 0.24;
    },
  },
  {
    id: "world_glass_ridge",
    template: "evoflow-glass-ridge",
    topology: "sweeping-ridge",
    concept: "a long crystalline escarpment sweeping across quiet lowlands",
    seed: 18917,
    palette: [[20, 47, 65], [36, 83, 102], [74, 139, 148], [176, 228, 221]],
    height(x, z, noise) {
      const ridgeCenter = 0.22 * Math.sin(x * 2.5) - 0.18 * x;
      const ridgeDistance = Math.abs(z - ridgeCenter);
      const ridge = Math.exp(-(ridgeDistance ** 2) / 0.018);
      const shelf = smoothstep(-0.25, 0.4, z - ridgeCenter) * 0.16;
      return 0.2 + ridge * 0.58 + shelf + (noise - 0.5) * 0.18;
    },
  },
  {
    id: "world_lichen_caldera",
    template: "evoflow-lichen-basin",
    topology: "breached-caldera",
    concept: "a mossy breached caldera enclosing a sheltered basin and upland rim",
    seed: 24371,
    palette: [[37, 64, 57], [67, 94, 69], [116, 128, 82], [187, 184, 133]],
    height(x, z, noise) {
      const dx = x + 0.08;
      const dz = z - 0.04;
      const radius = Math.hypot(dx / 1.05, dz / 0.82);
      const rim = gaussian(radius, 0.55, 0.095);
      const basin = gaussian(radius, 0.05, 0.34);
      const breach = ellipsePeak(x, z, 0.1, -0.55, 0.16, 0.28, -0.1);
      const centralDome = ellipsePeak(x, z, 0, 0, 0.16, 0.14) * 0.34;
      return 0.31 + rim * 0.56 - basin * 0.2 - breach * 0.34 + centralDome + (noise - 0.5) * 0.16;
    },
  },
  {
    id: "world_copper_mesas",
    template: "evoflow-copper-terraces",
    topology: "stepped-mesas",
    concept: "separated copper mesas with broad buildable tops and winding dry washes",
    seed: 31847,
    palette: [[76, 46, 34], [132, 74, 42], [185, 113, 59], [231, 179, 106]],
    height(x, z, noise) {
      const mesa = Math.max(
        ellipsePeak(x, z, 0, 0, 0.3, 0.24, -0.15),
        ellipsePeak(x, z, -0.48, -0.28, 0.38, 0.26, 0.2),
        ellipsePeak(x, z, 0.35, -0.34, 0.3, 0.2, -0.3) * 0.92,
        ellipsePeak(x, z, 0.28, 0.43, 0.33, 0.25, 0.45) * 0.84,
      );
      const stepped = Math.floor(clamp(mesa) * 5) / 5;
      return 0.15 + stepped * 0.7 + (noise - 0.5) * 0.11;
    },
  },
  {
    id: "world_basalt_badlands",
    template: "evoflow-basalt-teeth",
    topology: "branching-badlands",
    concept: "branching basalt badlands cut by erosion channels and narrow high ridges",
    seed: 40163,
    palette: [[24, 28, 31], [50, 56, 58], [91, 86, 78], [156, 142, 119]],
    height(x, z, noise) {
      const diagonal = rotated(x, z, -0.45);
      const directional = Math.sin(diagonal.x * 8 + Math.sin(diagonal.z * 3.2) * 1.4) * 0.5 + 0.5;
      const branching = 1 - Math.abs(2 * noise - 1);
      const ridges = Math.pow(clamp(branching * 0.72 + directional * 0.28), 2.1);
      const drainage = gaussian(diagonal.z + 0.25 * Math.sin(diagonal.x * 3), 0, 0.065);
      return 0.16 + ridges * 0.72 - drainage * 0.24;
    },
  },
  {
    id: "world_coral_archipelago",
    template: "evoflow-coral-fold",
    topology: "archipelago",
    concept: "an open coral archipelago of uneven islands, lagoons, and sheltered channels",
    seed: 52711,
    palette: [[20, 77, 91], [34, 123, 126], [101, 153, 119], [221, 190, 137]],
    height(x, z, noise) {
      const islands = Math.max(
        ellipsePeak(x, z, -0.45, -0.4, 0.34, 0.25, 0.4),
        ellipsePeak(x, z, 0.12, -0.12, 0.3, 0.38, -0.2),
        ellipsePeak(x, z, 0.55, 0.38, 0.26, 0.2, 0.35),
        ellipsePeak(x, z, -0.48, 0.45, 0.2, 0.3, -0.5),
        ellipsePeak(x, z, 0.62, -0.5, 0.14, 0.18, 0.2),
      );
      return 0.08 + islands * 0.78 + (noise - 0.5) * 0.12 * islands;
    },
  },
];

function normalize(values) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  const span = Math.max(1e-9, max - min);
  return Float32Array.from(values, (value) => (value - min) / span);
}

function sampleHeight(height, x, z) {
  const px = Math.min(SIZE - 1, Math.max(0, x));
  const pz = Math.min(SIZE - 1, Math.max(0, z));
  return height[pz * SIZE + px];
}

function semanticMap(height) {
  const semantic = new Uint8Array(SIZE * SIZE);
  for (let z = 0; z < SIZE; z += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = z * SIZE + x;
      const value = height[index];
      const slope = Math.hypot(
        sampleHeight(height, x + 1, z) - sampleHeight(height, x - 1, z),
        sampleHeight(height, x, z + 1) - sampleHeight(height, x, z - 1),
      );
      semantic[index] = value < 0.24 ? 0 : slope > 0.105 || value > 0.74 ? 3 : value < 0.38 ? 2 : 5;
    }
  }
  return semantic;
}

function previewMap(height, semantic, palette) {
  const preview = new Uint8Array(SIZE * SIZE * 3);
  for (let z = 0; z < SIZE; z += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = z * SIZE + x;
      const value = height[index];
      const scaled = value * (palette.length - 1);
      const low = Math.min(palette.length - 1, Math.floor(scaled));
      const high = Math.min(palette.length - 1, low + 1);
      const mix = scaled - low;
      const shade = 0.78 + clamp(
        sampleHeight(height, x - 1, z - 1) - sampleHeight(height, x + 1, z + 1) + 0.5,
      ) * 0.34;
      const waterShade = semantic[index] === 0 ? 0.76 : 1;
      for (let channel = 0; channel < 3; channel += 1) {
        preview[index * 3 + channel] = Math.round(
          clamp(lerp(palette[low][channel], palette[high][channel], mix) * shade * waterShade, 0, 255),
        );
      }
    }
  }
  return preview;
}

async function writeTerrain(family) {
  const noise = makeFbm(family.seed);
  const rawHeight = new Float32Array(SIZE * SIZE);
  for (let z = 0; z < SIZE; z += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const nx = (x / (SIZE - 1)) * 2 - 1;
      const nz = (z / (SIZE - 1)) * 2 - 1;
      rawHeight[z * SIZE + x] = family.height(nx, nz, noise(nx, nz));
    }
  }

  const height = normalize(rawHeight);
  const heightBytes = Uint8Array.from(height, (value) => Math.round(value * 255));
  const semantic = semanticMap(height);
  const preview = previewMap(height, semantic, family.palette);
  const worldRoot = path.join(OUTPUT_ROOT, family.id);
  const assetsRoot = path.join(worldRoot, "assets");
  await mkdir(assetsRoot, { recursive: true });

  await Promise.all([
    sharp(heightBytes, { raw: { width: SIZE, height: SIZE, channels: 1 } }).png().toFile(path.join(assetsRoot, "height.png")),
    sharp(semantic, { raw: { width: SIZE, height: SIZE, channels: 1 } }).png().toFile(path.join(assetsRoot, "semantic.png")),
    sharp(preview, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toFile(path.join(assetsRoot, "preview.png")),
    writeFile(path.join(worldRoot, "genome.json"), `${JSON.stringify({
      concept: family.concept,
      id: family.id,
      lineage: { generation: 0, operation: "curated-topology" },
      modules: {
        materials: { palette: family.template.replace("evoflow-", "") },
        terrain: { size: SIZE, topology: family.topology },
      },
      schema_version: "0.2.0",
      seed: family.seed,
    }, null, 2)}\n`),
  ]);
  return family;
}

const generated = await Promise.all(terrainFamilies.map(writeTerrain));
console.log(`Generated ${generated.length} terrain families in ${path.relative(ROOT, OUTPUT_ROOT)}`);
for (const family of generated) console.log(`${family.template}: ${family.topology} (${family.id})`);
