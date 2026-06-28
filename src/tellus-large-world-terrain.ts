import type { TerrainKind } from "./tellus-types";
import type { LandShapeConfig, WorldTemplateId } from "./tellus-types";
import type { WorldBiomeCell } from "./world-protocol";
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
import { evoflowTerrainSourceFor } from "./tellus-evoflow-terrains";
import {
  activeEvoflowBiomeCell,
  activeEvoflowBaseTerrainHeight,
  activeEvoflowTerrainKind,
} from "./tellus-terrain";

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

function canyonFoldHeight(cx: number, cz: number, seed: number): number {
  const angle = Math.atan2(cz + seed * 0.7, cx - seed * 0.4);
  const foldedRibs = Math.sin(angle * 5.5 + Math.hypot(cx, cz) * 0.12 + seed) * 1.6;
  const canyonA = gaussian(cx, cz, -18 + seed, -8, 165) * 3.9;
  const canyonB = gaussian(cx, cz, 18, 18 - seed, 240) * 2.7;
  const shelf = Math.sin((cx - cz) * 0.12 + seed) * 0.8;
  return foldedRibs + shelf - canyonA - canyonB;
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

  if (template === "fantasy-garden") {
    const gardenRing = Math.sin(r * 0.2) * 0.42 * smoothstep(12, 44, r);
    const reflectingPond = gaussian(cx, cz, -6, 10, 190) * 1.8;
    const pavilionRise = gaussian(cx, cz, 18, -16, 210) * 2.2;
    const softTerrace = Math.sin((cx + cz) * 0.075) * 0.35;
    return pavilionRise + gardenRing + softTerrace - reflectingPond;
  }

  if (template === "realistic-cove") {
    const cove = gaussian(cx, cz, 10, -18, 310) * 2.3;
    const dune = gaussian(cx, cz, -28, 20, 520) * 1.2;
    const headland = gaussian(cx, cz, 34, 16, 360) * 1.7;
    return dune + headland - cove;
  }

  if (template === "low-poly-meadow") {
    const terrace = Math.floor((fbm2(cx * 0.05, cz * 0.05, 3, 313) + 1) * 3.5) * 0.34;
    const moundA = gaussian(cx, cz, -24, 10, 360) * 1.7;
    const moundB = gaussian(cx, cz, 26, -20, 300) * 1.4;
    return moundA + moundB + terrace;
  }

  if (template === "cartoon-hills") {
    const hillA = gaussian(cx, cz, -26, 16, 310) * 2.6;
    const hillB = gaussian(cx, cz, 24, -16, 290) * 2.4;
    const hillC = gaussian(cx, cz, 8, 30, 340) * 1.8;
    return hillA + hillB + hillC - gaussian(cx, cz, 3, -3, 260) * 1.1;
  }

  if (template === "evoflow-spires") {
    const spireA = Math.pow(gaussian(cx, cz, -18, 14, 150), 0.62) * 5.4;
    const spireB = Math.pow(gaussian(cx, cz, 22, -12, 130), 0.6) * 5.9;
    const spireC = Math.pow(gaussian(cx, cz, 10, 28, 110), 0.58) * 4.4;
    return spireA + spireB + spireC - gaussian(cx, cz, -3, -7, 260) * 1.8;
  }

  if (template === "evoflow-glass-ridge") {
    const angle = Math.atan2(cz - 3, cx + 5);
    const crystalSpine = (1 - smoothstep(5, 28, Math.abs(Math.sin(angle + 0.95) * r))) * 6.2;
    const facets = Math.abs(Math.sin(cx * 0.16) + Math.cos(cz * 0.13)) * 0.9;
    return crystalSpine + facets - gaussian(cx, cz, 20, -18, 210) * 2.2;
  }

  if (template === "evoflow-lichen-basin") {
    const basin = gaussian(cx, cz, 0, 0, 650) * 3.2;
    const rim = smoothstep(27, 54, r) * (1 - smoothstep(55, 70, r)) * 2.8;
    const hummocks = fbm2(cx * 0.065, cz * 0.065, 4, 347) * 0.8;
    return rim + hummocks - basin;
  }

  if (template === "evoflow-copper-terraces") {
    const mesa = gaussian(cx, cz, -10, 4, 580) * 2.9 + gaussian(cx, cz, 24, -22, 420) * 2.1;
    const terrace = Math.sin((mesa + r * 0.055) * 3.1) * 0.75;
    const wash = gaussian(cx, cz, -24, -28, 280) * 2;
    return mesa + terrace - wash;
  }

  if (template === "evoflow-basalt-teeth") {
    const toothA = Math.pow(gaussian(cx, cz, -14, 8, 125), 0.56) * 5.8;
    const toothB = Math.pow(gaussian(cx, cz, 18, -15, 120), 0.54) * 6.1;
    const brokenRidge = ridgeNoise(cx * 0.06 + 4, cz * 0.06 - 7, 359) * 2.5;
    return toothA + toothB + brokenRidge - gaussian(cx, cz, 8, 20, 260) * 2.4;
  }

  if (
    template === "evoflow-coral-canyon" ||
    template === "evoflow-coral-canyon-child" ||
    template === "evoflow-coral-fold"
  ) {
    const seed =
      template === "evoflow-coral-canyon-child" ? 7 : template === "evoflow-coral-fold" ? 13 : 3;
    return canyonFoldHeight(cx, cz, seed);
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

function isEvoflowTemplate(template: WorldTemplateId): boolean {
  return Boolean(evoflowTerrainSourceFor(template));
}

function templateWorldScaleMultiplier(template: WorldTemplateId): number {
  if (isEvoflowTemplate(template)) return 4.5;
  if (template === "ridge") return 5.2;
  if (template === "cartoon-hills") return 3.7;
  if (template === "fantasy-garden") return 5.6;
  if (template === "low-poly-meadow") return 5.4;
  if (template === "lowlands") return 2;
  if (template === "realistic-cove") return 4.7;
  if (template === "wide-island") return 2.4;
  return 1;
}

function chunkedTemplatePoint(
  x: number,
  z: number,
  scaleMultiplier = 1,
): { cx: number; cz: number; r: number } | null {
  if (!getChunkedWorldChunks()) return null;
  const center = chunkedWorldCenter();
  if (!center) return null;
  const scale = worldScaleForId(runtimeConfig.worldId) * scaleMultiplier;
  const cx = (x - center.x) / scale;
  const cz = (z - center.z) / scale;
  return { cx, cz, r: Math.hypot(cx, cz) };
}

function chunkedIslandPoint(x: number, z: number): { cx: number; cz: number; r: number } | null {
  if (usesContinentalChunkedTerrain()) return null;
  const template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
  return chunkedTemplatePoint(x, z, templateWorldScaleMultiplier(template));
}

export function usesContinentalChunkedTerrain(
  worldId = runtimeConfig.worldId,
  template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
): boolean {
  if (!getChunkedWorldChunks()) return false;
  if (template === "tellus") return false;
  if (template === "flight-range") return true;
  const chunkedMatch = /^chunked-(\d+)(?:-(.*))?$/.exec(worldId.trim().toLowerCase());
  if (!chunkedMatch) return false;
  const chunkSize = Number(chunkedMatch[1]);
  if (!Number.isFinite(chunkSize) || chunkSize < 64) return false;
  const suffix = chunkedMatch[2] ?? "";
  return !/\b(main|tellus|island)\b/.test(suffix);
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

  if (isEvoflowTemplate(template)) {
    const rasterHeight = activeEvoflowBaseTerrainHeight(cx, cz, r);
    const washA = Math.abs(Math.sin(cx * 0.085 + fbm2(cx * 0.022, cz * 0.022, 3, 601) * 2.8));
    const washB = Math.abs(Math.sin((cx + cz * 0.45) * 0.06 + fbm2(cx * 0.026 - 4, cz * 0.026 + 9, 3, 607) * 2.4));
    const canyonCuts =
      (1 - smoothstep(0.07, 0.24, washA)) * 5.8 +
      (1 - smoothstep(0.05, 0.2, washB)) * 4.4;
    const mesaSteps =
      Math.floor((fbm2(cx * 0.045 + 8, cz * 0.045 - 5, 4, 613) + 1) * 6) * 1.35 +
      Math.sin(r * 0.18) * 1.1;
    const fallbackCanyon =
      templateProfileHeight(template, cx, cz, r) * 3.4 +
      ridgeNoise(cx * 0.055 - 8, cz * 0.055 + 3, 509) * 4.2 +
      mesaSteps -
      canyonCuts -
      gaussian(cx, cz, -20, -24, 420) * 2.4;
    const networkHeight = rasterHeight ?? fallbackCanyon;
    const sandyFloor = 2.4 + fbm2(cx * 0.045, cz * 0.045, 4, 503) * 1.4;
    const detail = terrainDetailHeight(shape, cx, cz, r) * 0.32;
    return sandyFloor + networkHeight * 1.1 + detail + shape.baseOffset;
  }

  if (template === "ridge") {
    const along = cx * 0.82 + cz * 0.34;
    const across = -cx * 0.34 + cz * 0.82;
    const spineWarp = Math.sin(along * 0.09) * 18 + fbm2(along * 0.04, across * 0.04, 4, 449) * 11;
    const spineDistance = Math.abs(across - spineWarp);
    const core = 1 - smoothstep(3.5, 17, spineDistance);
    const secondaryDistance = Math.abs(across + 26 - spineWarp * 0.5);
    const secondary = 1 - smoothstep(4, 15, secondaryDistance);
    const foothills = 1 - smoothstep(14, 66, spineDistance);
    const serration = ridgeNoise(along * 0.15 + 2, across * 0.11 - 4, 457);
    const peakTrain = Math.pow(Math.max(0, Math.sin(along * 0.28) * 0.75 + serration * 0.9 - 0.28), 1.45);
    const clefts = Math.pow(Math.max(0, ridgeNoise(along * 0.18 - 6, across * 0.18 + 2, 463) - 0.42), 1.3) * 9;
    const summitCaps =
      Math.pow(gaussian(cx, cz, -38, -10, 130), 0.5) * 20 +
      Math.pow(gaussian(cx, cz, -12, 8, 95), 0.48) * 18 +
      Math.pow(gaussian(cx, cz, 18, 14, 105), 0.5) * 22 +
      Math.pow(gaussian(cx, cz, 42, 4, 120), 0.52) * 17;
    const shoulder = gaussian(cx, cz, -24, -18, 520) * 3.6 + gaussian(cx, cz, 28, 22, 640) * 2.8;
    const landMask = 1 - smoothstep(CLASSIC_WORLD_RADIUS * 0.9, CLASSIC_WORLD_RADIUS * 1.08, r);
    return (
      1.4 +
      Math.pow(Math.max(0, core), 1.7) * (28 + serration * 20 + peakTrain * 34 + clefts) +
      Math.pow(Math.max(0, secondary), 1.45) * (11 + ridgeNoise(along * 0.13, across * 0.09, 461) * 8) +
      Math.pow(Math.max(0, foothills), 1.8) * 7 +
      summitCaps +
      shoulder -
      smoothstep(36, 70, spineDistance) * 3.2
    ) * landMask - (1 - landMask) * 2.4;
  }

  if (template === "low-poly-meadow") {
    const landMask = 1 - smoothstep(CLASSIC_WORLD_RADIUS * 0.88, CLASSIC_WORLD_RADIUS * 1.08, r);
    const cellX = Math.floor((cx + 96) / 14);
    const cellZ = Math.floor((cz + 96) / 14);
    const cellHeight = Math.floor(hash2(cellX, cellZ, 701) * 8) * 0.85;
    const diagonalFacets =
      Math.floor((Math.sin((cx + cz) * 0.16) + Math.sin((cx - cz) * 0.13) + 2) * 2.1) * 0.9;
    const broad =
      gaussian(cx, cz, -34, 18, 820) * 13.5 +
      gaussian(cx, cz, 26, -28, 720) * 11.8 +
      gaussian(cx, cz, 18, 34, 560) * 9.2;
    const stepped = Math.floor((fbm2(cx * 0.095, cz * 0.095, 4, 467) + 1) * 9.5) * 1.35;
    const flowerPlateaus = Math.max(0, Math.sin(cx * 0.12) * Math.cos(cz * 0.1)) * 2.2;
    return (3.2 + broad + stepped + diagonalFacets + cellHeight + flowerPlateaus) * landMask - (1 - landMask) * 2.3;
  }

  if (template === "cartoon-hills") {
    const landMask = 1 - smoothstep(CLASSIC_WORLD_RADIUS * 0.86, CLASSIC_WORLD_RADIUS * 1.08, r);
    const hx = cx * 1.55;
    const hz = cz * 1.55;
    const bubbly =
      Math.pow(gaussian(hx, hz, -34, 18, 180), 0.34) * 54 +
      Math.pow(gaussian(hx, hz, 32, -20, 165), 0.32) * 58 +
      Math.pow(gaussian(hx, hz, 8, 36, 155), 0.35) * 44 +
      Math.pow(gaussian(hx, hz, -4, -34, 145), 0.38) * 32;
    const softValleys =
      gaussian(hx, hz, -4, 0, 270) * 24 +
      gaussian(hx, hz, 38, 38, 260) * 13 +
      gaussian(hx, hz, -44, -32, 250) * 10;
    const toySteps = Math.floor((fbm2(hx * 0.055, hz * 0.055, 3, 431) + 1) * 4) * 1.35;
    return (4.8 + bubbly + toySteps - softValleys + terrainDetailHeight(shape, cx, cz, r) * 0.12) * landMask -
      (1 - landMask) * 2.6;
  }

  if (template === "realistic-cove") {
    const coastNoise =
      fbm2(cx * 0.045 + 13, cz * 0.045 - 9, 4, 739) * 3.6 +
      Math.sin(Math.atan2(cz, cx) * 5.5 + r * 0.04) * 1.8;
    const shoreRadius = CLASSIC_WORLD_RADIUS * (0.92 + coastNoise * 0.006);
    const landMask = 1 - smoothstep(shoreRadius, shoreRadius + CLASSIC_WORLD_RADIUS * 0.18, r);
    const angle = Math.atan2(cz, cx);
    const bayMouth = Math.abs(angle + 1.32 + Math.sin(r * 0.035) * 0.12);
    const bayChannel = (1 - smoothstep(0.16, 0.54, bayMouth)) * smoothstep(16, 72, r);
    const inletOffset = Math.abs(cx * 0.58 + (cz + 32) * 0.18);
    const inletTrough = (1 - smoothstep(8, 31, inletOffset)) * smoothstep(-58, -8, cz);
    const coveBasin =
      gaussian(cx, cz, 10, -32, 360) * 10.4 +
      gaussian(cx, cz, -8, -47, 420) * 6.6 +
      bayChannel * 9.2 +
      inletTrough * 5.8;
    const westernHeadland =
      gaussian(cx, cz, -42, -18, 220) * 15.5 +
      gaussian(cx, cz, -32, 8, 360) * 7.2;
    const easternHeadland =
      gaussian(cx, cz, 38, -15, 230) * 13.8 +
      gaussian(cx, cz, 48, 14, 340) * 6.4;
    const backDunes =
      gaussian(cx, cz, -26, 28, 520) * 5.8 +
      gaussian(cx, cz, 18, 34, 500) * 5.2 +
      gaussian(cx, cz, 46, 38, 620) * 3.2;
    const coastalBluffs =
      ridgeNoise(cx * 0.06 - 5, cz * 0.056 + 8, 733) *
      6.6 *
      smoothstep(16, 60, r) *
      (0.55 + smoothstep(-6, 44, cz) * 0.45);
    const scrubUndulation = fbm2(cx * 0.068 - 11, cz * 0.068 + 4, 5, 727) * 2.4;
    const sandFlat = 2.8 + fbm2(cx * 0.038, cz * 0.038, 4, 727) * 1.1;
    return (sandFlat + westernHeadland + easternHeadland + backDunes + coastalBluffs + scrubUndulation - coveBasin) * landMask -
      (1 - landMask) * 2.9;
  }

  if (template === "fantasy-garden") {
    const landMask = 1 - smoothstep(CLASSIC_WORLD_RADIUS * 0.88, CLASSIC_WORLD_RADIUS * 1.08, r);
    const ring = Math.sin(r * 0.34 + Math.atan2(cz, cx) * 5);
    const pathCarve = (1 - smoothstep(0.06, 0.2, Math.abs(ring))) * 2.4;
    const pond = gaussian(cx, cz, -5, 8, 155) * 8.4;
    const flowerBeds =
      Math.pow(gaussian(cx, cz, -32, -8, 180), 0.6) * 5 +
      Math.pow(gaussian(cx, cz, 28, 20, 190), 0.6) * 4.4 +
      Math.pow(gaussian(cx, cz, 8, -34, 170), 0.62) * 4.8;
    const gardenBowls =
      gaussian(cx, cz, -26, 18, 900) * 11.4 +
      gaussian(cx, cz, 28, -14, 720) * 9.2 +
      gaussian(cx, cz, 18, 34, 520) * 6.6;
    const terraces = Math.sin((cx - cz) * 0.1) * 1.5 + Math.sin((cx + cz) * 0.065) * 1.2;
    return (4.6 + gardenBowls + flowerBeds + terraces - pathCarve - pond + terrainDetailHeight(shape, cx, cz, r) * 0.25) * landMask -
      (1 - landMask) * 2.2;
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
  const template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
  const evoflow = isEvoflowTemplate(template);
  const templatePoint = chunkedTemplatePoint(x, z, templateWorldScaleMultiplier(template));
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

  let templateLift = 0;
  if (template === "ridge") {
    const center = chunkedWorldCenter();
    const rx = center ? x - center.x : x;
    const rz = center ? z - center.z : z;
    const along = rx * 0.74 + rz * 0.38;
    const across = -rx * 0.38 + rz * 0.74;
    const spineWarp =
      Math.sin(along * 0.0048) * 92 +
      fbm2(along * 0.0025 + 11, across * 0.0025 - 7, 4, 397) * 80;
    const spineDistance = Math.abs(across - spineWarp);
    const core = 1 - smoothstep(38, 230, spineDistance);
    const foothills = 1 - smoothstep(180, 760, spineDistance);
    const serration = ridgeNoise(along * 0.006 + 19, across * 0.004 - 23, 409);
    const brokenCliffs = ridgeNoise(along * 0.012 - 41, across * 0.008 + 7, 421);
    const valleyCut = smoothstep(250, 680, spineDistance) * 3.8;
    templateLift =
      Math.pow(Math.max(0, core), 1.35) * (24 + serration * 16) +
      Math.pow(Math.max(0, foothills), 1.8) * (8 + brokenCliffs * 5) -
      valleyCut;
  }

  let templateSurface = templateLift;
  if (templatePoint) {
    const shape = resolveLandShapeConfig(template, runtimeConfig.landShape);
    const { cx, cz, r } = templatePoint;
    const centeredMask = evoflow
      ? 1 - smoothstep(CLASSIC_WORLD_RADIUS * 0.92, CLASSIC_WORLD_RADIUS * 1.18, r)
      : 1 - smoothstep(CLASSIC_WORLD_RADIUS * 2.4, CLASSIC_WORLD_RADIUS * 7.5, r);
    const rasterHeight = evoflow ? activeEvoflowBaseTerrainHeight(cx, cz, r) : null;
    const profile = (rasterHeight ?? templateProfileHeight(template, cx, cz, r)) * 1.7;
    const generated = terrainDetailHeight(shape, cx, cz, r) + shape.baseOffset;
    templateSurface += (profile + generated) * centeredMask;
  }

  return 4.2 + continent + hills + detail + ridgeFold + brokenRidge + terrace + templateSurface - broadValley;
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
    if (isEvoflowTemplate(template)) {
      const kind = activeEvoflowTerrainKind(islandPoint.cx, islandPoint.cz, y);
      if (kind && kind !== "water" && kind !== "meadow") return kind;
      if (islandPoint.r > CLASSIC_WORLD_RADIUS * 1.02) return "beach";
      const washA = Math.abs(Math.sin(islandPoint.cx * 0.085 + fbm2(islandPoint.cx * 0.022, islandPoint.cz * 0.022, 3, 601) * 2.8));
      const washB = Math.abs(Math.sin((islandPoint.cx + islandPoint.cz * 0.45) * 0.06 + fbm2(islandPoint.cx * 0.026 - 4, islandPoint.cz * 0.026 + 9, 3, 607) * 2.4));
      if (largeWorldSlope(x, z) > 1.45 || y > 24) return "rock";
      if (washA < 0.18 || washB < 0.14) return "dirt";
      if (template === "evoflow-copper-terraces" || template === "evoflow-coral-fold") return "beach";
      return y < 6.4 ? "beach" : "dirt";
    }
    if (template === "ridge") {
      if (islandPoint.r > CLASSIC_WORLD_RADIUS * 1.04 || y <= SEA_LEVEL + 0.18) return "beach";
      if (y > 54) return "snow";
      if (y > 18 || largeWorldSlope(x, z) > 0.72) return "rock";
      if (y > 8 || largeWorldSlope(x, z) > 0.42) return "dirt";
      return "meadow";
    }
    if (template === "low-poly-meadow") {
      if (islandPoint.r > CLASSIC_WORLD_RADIUS * 1.04 || y <= SEA_LEVEL + 0.18) return "meadow";
      if (largeWorldSlope(x, z) > 2.4 && y > 42) return "rock";
      if (
        Math.abs(Math.sin((islandPoint.cx - islandPoint.cz) * 0.14)) < 0.24 ||
        Math.sin(islandPoint.cx * 0.18) * Math.cos(islandPoint.cz * 0.16) > 0.35
      ) {
        return "flowers";
      }
      return "meadow";
    }
    if (template === "cartoon-hills") {
      if (islandPoint.r > CLASSIC_WORLD_RADIUS * 1.04 || y <= SEA_LEVEL + 0.18) return "beach";
      if (y > 22 || largeWorldSlope(x, z) > 0.62) return "flowers";
      return "meadow";
    }
    if (template === "realistic-cove") {
      const bayAngle = Math.abs(
        Math.atan2(islandPoint.cz, islandPoint.cx) +
          1.32 +
          Math.sin(islandPoint.r * 0.035) * 0.12,
      );
      const bayChannel = (1 - smoothstep(0.16, 0.54, bayAngle)) * smoothstep(16, 72, islandPoint.r);
      const inletOffset = Math.abs(islandPoint.cx * 0.58 + (islandPoint.cz + 32) * 0.18);
      const inletTrough = (1 - smoothstep(8, 31, inletOffset)) * smoothstep(-58, -8, islandPoint.cz);
      const inCove =
        gaussian(islandPoint.cx, islandPoint.cz, 10, -32, 360) > 0.2 ||
        gaussian(islandPoint.cx, islandPoint.cz, -8, -47, 420) > 0.28 ||
        bayChannel > 0.34 ||
        inletTrough > 0.42;
      const headland =
        gaussian(islandPoint.cx, islandPoint.cz, -42, -18, 220) +
        gaussian(islandPoint.cx, islandPoint.cz, -32, 8, 360) * 0.7 +
        gaussian(islandPoint.cx, islandPoint.cz, 38, -15, 230) +
        gaussian(islandPoint.cx, islandPoint.cz, 48, 14, 340) * 0.7;
      const scrub =
        fbm2(islandPoint.cx * 0.065 - 2, islandPoint.cz * 0.065 + 6, 4, 751) +
        smoothstep(-4, 42, islandPoint.cz) * 0.45;
      if (islandPoint.r > CLASSIC_WORLD_RADIUS * 1.04 || y <= SEA_LEVEL - 0.2 || (inCove && y < SEA_LEVEL + 0.5)) {
        return "water";
      }
      if (inCove && y < SEA_LEVEL + 3.8) return "beach";
      if (headland > 0.5 || largeWorldSlope(x, z) > 0.86 || y > 16) return "rock";
      if (islandPoint.r > CLASSIC_WORLD_RADIUS * 0.67 || y < SEA_LEVEL + 5.4) return "beach";
      if (scrub > 0.32) return "dirt";
      return "meadow";
    }
    if (template === "fantasy-garden") {
      if (islandPoint.r > CLASSIC_WORLD_RADIUS * 1.04 || y <= SEA_LEVEL + 0.18) return "beach";
      const pondDistance = Math.hypot(islandPoint.cx + 5, islandPoint.cz - 8);
      if (pondDistance < 12 && y < 2.4) return "water";
      const ring = Math.abs(Math.sin(islandPoint.r * 0.34 + Math.atan2(islandPoint.cz, islandPoint.cx) * 5));
      if (ring < 0.19) return "dirt";
      const bed =
        gaussian(islandPoint.cx, islandPoint.cz, -32, -8, 180) +
        gaussian(islandPoint.cx, islandPoint.cz, 28, 20, 190) +
        gaussian(islandPoint.cx, islandPoint.cz, 8, -34, 170);
      if (bed > 0.42 || y > 12) return "flowers";
      if (largeWorldSlope(x, z) > 0.8) return "dirt";
      return "meadow";
    }
    if (islandPoint.r > CLASSIC_WORLD_RADIUS * 1.04 || y <= SEA_LEVEL + 0.18) return "water";
    if (y <= SEA_LEVEL + 1.55 || islandPoint.r > CLASSIC_WORLD_RADIUS * 0.88) return "beach";
    if (template === "lowlands") {
      const river = lowlandRiverStrength(islandPoint.cx, islandPoint.cz);
      if (river > 0.72 && y < 1.25) return "water";
      if (river > 0.45 && y < 2.15) return "beach";
    }
    const pondDistance = Math.hypot(islandPoint.cx - shape.pond.x, islandPoint.cz - shape.pond.z);
    if (pondDistance < shape.pond.radius && y < 1.9) return "water";
    if (template === "evoflow-copper-terraces") {
      const terraceBand = Math.sin((islandPoint.cx - islandPoint.cz) * 0.11);
      if (largeWorldSlope(x, z) > 0.52 || y > 4.2 || terraceBand > 0.2) return "rock";
      return "dirt";
    }
    if (template === "evoflow-basalt-teeth" && (y > 4.6 || largeWorldSlope(x, z) > 0.62)) {
      return "rock";
    }
    if (template === "evoflow-lichen-basin" && y < 3.2) return "flowers";
    if (template === "evoflow-glass-ridge" && (y > 5.5 || largeWorldSlope(x, z) > 0.72)) {
      return "rock";
    }
    if (y > 13.5) return "snow";
    if (y > 6.8 || largeWorldSlope(x, z) > 1.05) return "rock";
    if (
      template === "evoflow-coral-canyon" ||
      template === "evoflow-coral-canyon-child" ||
      template === "evoflow-coral-fold"
    ) {
      const foldBand = Math.sin((islandPoint.cx + islandPoint.cz) * 0.12);
      if (largeWorldSlope(x, z) > 0.38 || y > 3.4 || foldBand > 0.08) return "rock";
      return "dirt";
    }
    const pathBand = Math.abs(Math.sin(Math.atan2(islandPoint.cz, islandPoint.cx) * 3 + 0.5)) < 0.13;
    if (pathBand && islandPoint.r > 8) return "dirt";
    return "meadow";
  }

  const slope = largeWorldSlope(x, z);
  const template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
  if (isEvoflowTemplate(template)) {
    const point = chunkedTemplatePoint(x, z, 10);
    const kind = point ? activeEvoflowTerrainKind(point.cx, point.cz, y) : null;
    if (kind) return kind;
    if (point && point.r > CLASSIC_WORLD_RADIUS * 1.05) return "beach";
    if (slope > 0.7 || y > 14) return "rock";
    return y < SEA_LEVEL + 0.5 ? "beach" : "dirt";
  }
  if (template === "ridge") {
    if (y > 34) return "snow";
    if (y > 17 || slope > 0.58) return "rock";
    if (y > 9 || slope > 0.42) return "dirt";
  }
  if (y < -1.2) return "beach";
  if (y > 30) return "snow";
  if (slope > 1.05 || y > 21) return "rock";
  const meadowNoise = fbm2(x * 0.012, z * 0.012, 3, 211);
  if (y > 7 && slope < 0.42 && meadowNoise > 0.28) return "flowers";
  if (slope > 0.68) return "dirt";
  return "meadow";
}

export function largeWorldBiomeCellAt(
  x: number,
  z: number,
  y = largeWorldBaseHeight(x, z),
): WorldBiomeCell | null {
  const template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
  if (!isEvoflowTemplate(template)) return null;
  const point = chunkedIslandPoint(x, z);
  if (!point) return null;
  return activeEvoflowBiomeCell(point.cx, point.cz, y);
}
