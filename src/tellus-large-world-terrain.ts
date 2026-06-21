import type { TerrainKind } from "./tellus-types";
import type { LandShapeConfig, WorldTemplateId } from "./tellus-types";
import {
  CHUNK_SPAN,
  CLASSIC_WORLD_RADIUS,
  SEA_LEVEL,
  chunkedWorldCenter,
  getChunkedWorldChunks,
  worldScaleForId,
} from "./tellus-constants";
import { runtimeConfig } from "./tellus-runtime-config";
import {
  parseWorldTemplateId,
  resolveLandShapeConfig,
} from "./tellus-world-templates";

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

function gaussian(cx: number, cz: number, x: number, z: number, radius: number): number {
  return Math.exp(-((cx - x) ** 2 + (cz - z) ** 2) / radius);
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

function lowlandRiverStrength(cx: number, cz: number): number {
  const riverCenter = Math.sin((cz + 18) * 0.105) * 15 - 5 + Math.sin(cz * 0.035) * 6;
  const width = 5.5 + smoothstep(-52, 24, cz) * 3.5;
  const distance = Math.abs(cx - riverCenter);
  return 1 - smoothstep(width, width + 5.5, distance);
}

function templateProfileHeight(template: WorldTemplateId, cx: number, cz: number, r: number): number {
  if (template === "wide-island") {
    const eastPeninsula = gaussian(cx, cz, 39, -2, 720) * 3.8;
    const westHeadland = gaussian(cx, cz, -42, 18, 520) * 2.9;
    const northShelf = gaussian(cx, cz, 5, 40, 820) * 2.1;
    const innerLagoon = gaussian(cx, cz, 17, -5, 245) * 2.8;
    const southCove = gaussian(cx, cz, -9, -42, 520) * 1.75;
    const reefShelf =
      Math.sin(Math.atan2(cz, cx) * 5.0 + r * 0.065) * 0.55 * smoothstep(24, 60, r);
    return eastPeninsula + westHeadland + northShelf + reefShelf - innerLagoon - southCove;
  }

  if (template === "lowlands") {
    const river = lowlandRiverStrength(cx, cz);
    const floodplain = river * 2.25;
    const westMeadow = gaussian(cx, cz, -34, 4, 980) * 1.35;
    const eastMeadow = gaussian(cx, cz, 32, -18, 760) * 1.15;
    const shallowBasin = gaussian(cx, cz, 4, 18, 640) * 1.6;
    const levee = Math.max(0, smoothstep(0.18, 0.52, river) - smoothstep(0.66, 0.95, river)) * 0.9;
    return westMeadow + eastMeadow + levee - floodplain - shallowBasin;
  }

  if (template === "ridge") {
    const angle = Math.atan2(cz + 2, cx - 4);
    const spineDistance = Math.abs(Math.sin(angle - 0.72) * r);
    const spine = (1 - smoothstep(8, 34, spineDistance)) * smoothstep(7, 58, r) * 5.4;
    const saddle = gaussian(cx, cz, -12, 9, 165) * 2.1;
    const cirque = gaussian(cx, cz, 23, -20, 260) * 2.7;
    return spine - saddle - cirque;
  }

  const valley = gaussian(cx, cz, -26, -20, 360) * 1.35;
  const foothills = gaussian(cx, cz, 30, 24, 580) * 1.55;
  return foothills - valley;
}

function terrainDetailHeight(shape: LandShapeConfig, cx: number, cz: number, r: number): number {
  const detail = shape.detail;
  if (detail.amplitude <= 0 && detail.ridgeAmplitude <= 0 && detail.terraceAmplitude <= 0) {
    return 0;
  }

  const shoreFade = 1 - smoothstep(
    CLASSIC_WORLD_RADIUS * shape.shore.startRatio,
    CLASSIC_WORLD_RADIUS * 0.98,
    r,
  );
  const pondDistance = Math.hypot(cx - shape.pond.x, cz - shape.pond.z);
  const pondFade = smoothstep(shape.pond.radius * 0.72, shape.pond.radius * 1.65, pondDistance);
  const landMask = shoreFade * pondFade;
  if (landMask <= 0.001) return 0;

  const warpA = fbm2(cx * detail.scale * 0.55 + 31.7, cz * detail.scale * 0.55 - 14.2, 3, 251);
  const warpB = fbm2(cx * detail.scale * 0.55 - 8.1, cz * detail.scale * 0.55 + 27.4, 3, 263);
  const wx = cx + warpA * detail.warp;
  const wz = cz + warpB * detail.warp;

  const macro = fbm2(wx * detail.scale, wz * detail.scale, 5, 277) * detail.amplitude;
  const micro =
    fbm2(wx * detail.scale * 2.7 + 7.5, wz * detail.scale * 2.7 - 19.5, 3, 281) *
    detail.amplitude *
    0.32;
  const ridgeBase = fbm2(wx * detail.scale * 1.45 - 41, wz * detail.scale * 1.45 + 18, 4, 293);
  const ridgeFold = (1 - Math.abs(ridgeBase)) * 2 - 1;
  const ridges = ridgeFold * detail.ridgeAmplitude;
  const terraceBase = macro + ridges * 0.45;
  const terraces = Math.sin(terraceBase * detail.terraceFrequency) * detail.terraceAmplitude;

  return (macro + micro + ridges + terraces) * landMask;
}

function chunkedIslandPoint(x: number, z: number): { cx: number; cz: number; r: number } | null {
  if (!getChunkedWorldChunks()) return null;
  const center = chunkedWorldCenter();
  if (!center) return null;
  const scale = worldScaleForId(runtimeConfig.worldId);
  const cx = (x - center.x) / scale;
  const cz = (z - center.z) / scale;
  return { cx, cz, r: Math.hypot(cx, cz) };
}

function chunkedIslandBaseHeight(x: number, z: number): number | null {
  const point = chunkedIslandPoint(x, z);
  if (!point) return null;
  const template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
  const shape = resolveLandShapeConfig(template, runtimeConfig.landShape);
  const { cx, cz, r } = point;
  if (r > CLASSIC_WORLD_RADIUS * 1.08) {
    return SEA_LEVEL - 0.65 - Math.min(3.8, (r - CLASSIC_WORLD_RADIUS) * 0.035);
  }

  const mountain = Math.max(0, 1 - r / shape.mountain.radius);
  const mound = Math.pow(mountain, shape.mountain.exponent) * shape.mountain.height;
  const shoulder = gaussian(cx, cz, shape.shoulder.x, shape.shoulder.z, shape.shoulder.radius) * shape.shoulder.height;
  const southernRise =
    gaussian(cx, cz, shape.southernRise.x, shape.southernRise.z, shape.southernRise.radius) *
    shape.southernRise.height;
  const ridge =
    Math.sin(cx * 0.22 + cz * 0.08) * shape.ridge.sinScale +
    Math.cos(cz * 0.2 - cx * 0.06) * shape.ridge.cosScale +
    Math.sin((cx + cz) * 0.11) * shape.ridge.diagonalScale;
  const rimStart = CLASSIC_WORLD_RADIUS * shape.shore.startRatio;
  const rimWidth = CLASSIC_WORLD_RADIUS * shape.shore.widthRatio;
  const rimDrop = Math.max(0, (r - rimStart) / rimWidth) * shape.shore.drop;
  const pond = gaussian(cx, cz, shape.pond.x, shape.pond.z, shape.pond.falloff) * shape.pond.depth;
  const profile = templateProfileHeight(template, cx, cz, r);
  const detail = terrainDetailHeight(shape, cx, cz, r);
  return mound + shoulder + southernRise + ridge + profile + detail - rimDrop - pond + shape.baseOffset;
}

function continentalBaseHeight(x: number, z: number): number {
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

export function largeWorldBaseHeight(x: number, z: number): number {
  return chunkedIslandBaseHeight(x, z) ?? continentalBaseHeight(x, z);
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
  const islandPoint = chunkedIslandPoint(x, z);
  if (islandPoint) {
    const template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
    const shape = resolveLandShapeConfig(template, runtimeConfig.landShape);
    if (islandPoint.r > CLASSIC_WORLD_RADIUS * 1.04 || y <= SEA_LEVEL + 0.18) return "water";
    if (y <= SEA_LEVEL + 1.55 || islandPoint.r > CLASSIC_WORLD_RADIUS * 0.88) return "beach";
    if (template === "lowlands") {
      const river = lowlandRiverStrength(islandPoint.cx, islandPoint.cz);
      if (river > 0.72 && y < 1.25) return "water";
      if (river > 0.45 && y < 2.15) return "beach";
    }
    const pondDistance = Math.hypot(islandPoint.cx - shape.pond.x, islandPoint.cz - shape.pond.z);
    if (pondDistance < shape.pond.radius && y < 1.9) return "water";
    if (y > 13.5) return "snow";
    if (y > 6.8 || largeWorldSlope(x, z) > 1.05) return "rock";
    const pathBand = Math.abs(Math.sin(Math.atan2(islandPoint.cz, islandPoint.cx) * 3 + 0.5)) < 0.13;
    if (pathBand && islandPoint.r > 8) return "dirt";
    return "meadow";
  }

  const slope = largeWorldSlope(x, z);
  if (y < -1.2) return "beach";
  if (y > 30) return "snow";
  if (slope > 1.05 || y > 21) return "rock";
  const meadowNoise = fbm2(x * 0.012, z * 0.012, 3, 211);
  if (y > 7 && slope < 0.42 && meadowNoise > 0.28) return "flowers";
  if (slope > 0.68) return "dirt";
  return "meadow";
}
