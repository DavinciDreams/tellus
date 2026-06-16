import type { TerrainKind } from "./tellus-types";

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  return fade(clamp((value - edge0) / (edge1 - edge0), 0, 1));
}

function hash2(x: number, z: number, seed = 0): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2(x: number, z: number, seed = 0): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return (ab + (cd - ab) * tz) * 2 - 1;
}

function fbm2(x: number, z: number, octaves: number, seed = 0): number {
  let total = 0;
  let amplitude = 0.55;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise2(x * frequency, z * frequency, seed + i * 101) * amplitude;
    norm += amplitude;
    amplitude *= 0.52;
    frequency *= 2.04;
  }
  return norm > 0 ? total / norm : 0;
}

function ridgeNoise(x: number, z: number, seed = 0): number {
  const n = fbm2(x, z, 5, seed);
  return 1 - Math.abs(n);
}

export function largeWorldBaseHeight(x: number, z: number): number {
  const warpA = fbm2(x * 0.0028 + 91.7, z * 0.0028 - 33.1, 4, 17);
  const warpB = fbm2(x * 0.0028 - 12.4, z * 0.0028 + 70.6, 4, 29);
  const wx = x + warpA * 72;
  const wz = z + warpB * 72;

  const continent = fbm2(wx * 0.00145, wz * 0.00145, 5, 41) * 14;
  const hills = fbm2(wx * 0.0058, wz * 0.0058, 5, 73) * 7.2;
  const detail = fbm2(wx * 0.018, wz * 0.018, 3, 107) * 1.15;

  const mountainSpine = ridgeNoise(wx * 0.0037 + 15, wz * 0.0037 - 8, 131);
  const ridgeMask = smoothstep(0.53, 0.86, mountainSpine);
  const ridgeFold = Math.pow(ridgeMask, 1.7) * 19;
  const brokenRidge = (ridgeNoise(wx * 0.0105 - 40, wz * 0.0105 + 18, 163) - 0.45) * 5.8;

  const broadValley =
    smoothstep(0.1, 0.68, Math.abs(fbm2(wx * 0.0019 - 22, wz * 0.0019 + 11, 4, 191))) * 3.4;
  const terrace = Math.sin((continent + ridgeFold) * 0.42) * smoothstep(7, 22, ridgeFold) * 1.1;

  return 4.2 + continent + hills + detail + ridgeFold + brokenRidge + terrace - broadValley;
}

export function largeWorldSlope(x: number, z: number): number {
  const step = 2.25;
  const h = largeWorldBaseHeight(x, z);
  const dx = largeWorldBaseHeight(x + step, z) - h;
  const dz = largeWorldBaseHeight(x, z + step) - h;
  return Math.hypot(dx, dz) / step;
}

export function largeWorldTerrainKind(
  x: number,
  z: number,
  y = largeWorldBaseHeight(x, z),
): TerrainKind {
  const slope = largeWorldSlope(x, z);
  if (y < -1.2) return "beach";
  if (y > 30) return "snow";
  if (slope > 1.05 || y > 21) return "rock";
  const meadowNoise = fbm2(x * 0.012, z * 0.012, 3, 211);
  if (y > 7 && slope < 0.42 && meadowNoise > 0.28) return "flowers";
  if (slope > 0.68) return "dirt";
  return "meadow";
}
