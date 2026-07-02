import * as THREE from "three";
import type { EcologySample } from "./tellus-ecology";
import type { TerrainPaintKind } from "./tellus-types";
import {
  biomePatchForEcology,
  biomePatchForPaint,
  treeBackendForBiomePatch,
  type ProcPlantBiomePatch,
} from "./tellus-procplant-biomes";
import type { TellusBiomeMixDefinition, TellusBiomeMixEntry } from "./tellus-biome-mix";

export interface ProcPlantPlacementPlanOptions {
  cx: number;
  cz: number;
  chunkSize: number;
  seed: number;
  maxPlants: number;
  densityMultiplier: number;
  lodDensity: number;
  sampleHeight: (x: number, z: number) => number | null;
  samplePaint: (x: number, z: number) => TerrainPaintKind | null;
  sampleEcology: (x: number, z: number, height: number, paint: TerrainPaintKind | null, seed: number) => EcologySample;
  estimateSlope: (x: number, z: number, height: number) => number;
  isExcluded?: (x: number, z: number, height: number) => boolean;
  inBounds: (x: number, z: number) => boolean;
  minGroundHeight: number;
  biomeMix?: TellusBiomeMixDefinition | null;
}

export interface ProcPlantPlannedPlacement {
  x: number;
  z: number;
  height: number;
  patch?: ProcPlantBiomePatch;
  entry?: TellusBiomeMixEntry;
  seed: number;
  growthScale: number;
  crownRadius: number;
}

interface CandidatePlacement {
  x: number;
  z: number;
  height: number;
  patch?: ProcPlantBiomePatch;
  entry?: TellusBiomeMixEntry;
  seed: number;
  desiredRadius: number;
  minRadius: number;
  priority: number;
}

const mulberry32 = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const hashString = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const hash2 = (x: number, z: number, seed: number): number => {
  let h = seed >>> 0;
  h = Math.imul(h ^ x, 2246822519);
  h = Math.imul(h ^ z, 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const smooth = (t: number): number => t * t * (3 - 2 * t);

const valueNoise2D = (x: number, z: number, seed: number): number => {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const tx = smooth(x - xi);
  const tz = smooth(z - zi);
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), tz);
};

const isTreePatch = (patch: ProcPlantBiomePatch): boolean =>
  patch.scale >= 2.4 || Boolean(treeBackendForBiomePatch(patch));

const isTreeEntry = (entry: TellusBiomeMixEntry): boolean =>
  entry.scale >= 2.4 || entry.genome?.habit === "tree" || entry.genome?.habit === "conifer" || entry.genome?.habit === "palm";

const desiredCrownRadius = (patch: ProcPlantBiomePatch): number => {
  if (isTreePatch(patch)) return THREE.MathUtils.clamp(patch.scale * 0.42, 1.35, 8.5);
  return THREE.MathUtils.clamp(patch.scale * 0.48, 0.28, 1.45);
};

const minSurvivalRadius = (patch: ProcPlantBiomePatch): number =>
  isTreePatch(patch)
    ? THREE.MathUtils.clamp(desiredCrownRadius(patch) * 0.32, 0.85, 2.4)
    : THREE.MathUtils.clamp(desiredCrownRadius(patch) * 0.28, 0.12, 0.42);

const desiredEntryRadius = (entry: TellusBiomeMixEntry): number => {
  if (isTreeEntry(entry)) return THREE.MathUtils.clamp(entry.scale * 0.42, 1.35, 8.5);
  return THREE.MathUtils.clamp(entry.scale * 0.48, 0.28, 1.45);
};

const minEntrySurvivalRadius = (entry: TellusBiomeMixEntry): number =>
  isTreeEntry(entry)
    ? THREE.MathUtils.clamp(desiredEntryRadius(entry) * 0.32, 0.85, 2.4)
    : THREE.MathUtils.clamp(desiredEntryRadius(entry) * 0.28, 0.12, 0.42);

const clusterInfluence = (patch: ProcPlantBiomePatch, x: number, z: number, seed: number): number => {
  const speciesSeed = hashString(patch.primary) ^ seed;
  const broad = valueNoise2D(x / 58, z / 58, speciesSeed);
  const fine = valueNoise2D(x / 23, z / 23, speciesSeed ^ 0x9e3779b1);
  return THREE.MathUtils.clamp(0.55 + broad * 0.65 + fine * 0.22, 0.38, 1.35);
};

const entryClusterInfluence = (entry: TellusBiomeMixEntry, x: number, z: number, seed: number): number => {
  const speciesSeed = hashString(entry.presetId ?? entry.genome?.id ?? entry.id) ^ seed;
  const broad = valueNoise2D(x / 58, z / 58, speciesSeed);
  const fine = valueNoise2D(x / 23, z / 23, speciesSeed ^ 0x9e3779b1);
  return THREE.MathUtils.clamp(0.55 + broad * 0.65 + fine * 0.22, 0.38, 1.35);
};

const terrainFit = (ecology: EcologySample, patch: ProcPlantBiomePatch, slope: number): number => {
  const tree = isTreePatch(patch);
  const moistureFit = 1 - Math.abs(ecology.moisture - patch.environment.moisture) * 0.55;
  const warmthFit = 1 - Math.abs(ecology.warmth - patch.environment.biomeWarmth) * 0.45;
  const lightFit = 1 - Math.abs(ecology.light - patch.environment.light) * 0.32;
  const slopeFit = tree ? 1 - slope * 0.7 : 1 - Math.max(0, slope - 0.72) * 0.35;
  return THREE.MathUtils.clamp(moistureFit * warmthFit * lightFit * slopeFit, 0, 1.25);
};

const entryTerrainFit = (ecology: EcologySample, entry: TellusBiomeMixEntry, slope: number): number => {
  const tree = isTreeEntry(entry);
  const moistureFit = 1 - Math.abs(ecology.moisture - entry.environment.moisture) * 0.55;
  const warmthFit = 1 - Math.abs(ecology.warmth - entry.environment.biomeWarmth) * 0.45;
  const lightFit = 1 - Math.abs(ecology.light - entry.environment.light) * 0.32;
  const slopeFit = tree ? 1 - slope * 0.7 : 1 - Math.max(0, slope - 0.72) * 0.35;
  return THREE.MathUtils.clamp(moistureFit * warmthFit * lightFit * slopeFit, 0, 1.25);
};

const chooseBiomeMixEntry = (
  mix: TellusBiomeMixDefinition | null | undefined,
  paint: TerrainPaintKind | null,
  ecology: EcologySample,
  slope: number,
  x: number,
  z: number,
  seed: number,
): { entry: TellusBiomeMixEntry; survival: number } | null => {
  if (!mix || !mix.targetTerrainPaint || paint !== mix.targetTerrainPaint) return null;
  const entries = mix?.entries.filter((entry) => entry.enabled !== false && entry.density > 0 && entry.weight > 0) ?? [];
  if (entries.length === 0) return null;
  const weighted = entries.map((entry) => {
    const fit = entryTerrainFit(ecology, entry, slope);
    const cluster = entryClusterInfluence(entry, x, z, seed);
    return {
      entry,
      score: Math.max(0, entry.weight) * Math.max(0.01, entry.density) * fit * cluster,
      fit,
      cluster,
    };
  });
  const total = weighted.reduce((sum, item) => sum + item.score, 0);
  if (total <= 0) return null;
  let roll = hash2(Math.floor(x * 10), Math.floor(z * 10), seed ^ 0x7f4a7c15) * total;
  for (const item of weighted) {
    roll -= item.score;
    if (roll <= 0) {
      return {
        entry: item.entry,
        survival: THREE.MathUtils.clamp((mix?.density ?? 1) * item.entry.density * item.fit * item.cluster, 0, 1.2),
      };
    }
  }
  const last = weighted[weighted.length - 1]!;
  return {
    entry: last.entry,
    survival: THREE.MathUtils.clamp((mix?.density ?? 1) * last.entry.density * last.fit * last.cluster, 0, 1.2),
  };
};

const desiredCandidateRadius = (candidate: CandidatePlacement): number =>
  candidate.entry ? desiredEntryRadius(candidate.entry) : desiredCrownRadius(candidate.patch!);

const viableCandidates = (candidates: CandidatePlacement[]): CandidatePlacement[] => {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const kept: CandidatePlacement[] = [];
  for (const candidate of sorted) {
    let limit = candidate.desiredRadius;
    const nearest = [...candidates]
      .filter((other) => other !== candidate)
      .map((other) => Math.hypot(candidate.x - other.x, candidate.z - other.z))
      .sort((a, b) => a - b)
      .slice(0, 5);
    for (const distance of nearest) {
      limit = Math.min(limit, distance * 0.5);
    }
    for (const accepted of kept) {
      const distance = Math.hypot(candidate.x - accepted.x, candidate.z - accepted.z);
      limit = Math.min(limit, distance - accepted.minRadius * 0.82);
    }
    if (limit < candidate.minRadius) continue;
    kept.push({ ...candidate, desiredRadius: Math.max(candidate.minRadius, limit) });
  }
  return kept;
};

export const planProcPlantPlacements = (
  options: ProcPlantPlacementPlanOptions,
): ProcPlantPlannedPlacement[] => {
  if (options.maxPlants <= 0 || options.densityMultiplier <= 0) return [];
  const rng = mulberry32(options.seed);
  const x0 = options.cx * options.chunkSize;
  const z0 = options.cz * options.chunkSize;
  const seedSlots = Math.max(options.maxPlants * 6, 9);
  const grid = Math.ceil(Math.sqrt(seedSlots));
  const spacing = options.chunkSize / grid;
  const candidates: CandidatePlacement[] = [];

  for (let gx = 0; gx < grid; gx++) {
    for (let gz = 0; gz < grid; gz++) {
      const placementSeed = options.seed ^ Math.imul(gx + 1, 0x85ebca6b) ^ Math.imul(gz + 1, 0xc2b2ae35);
      const localRng = mulberry32(placementSeed);
      const x = x0 + (gx + 0.5 + (localRng() - 0.5) * 0.72) * spacing;
      const z = z0 + (gz + 0.5 + (localRng() - 0.5) * 0.72) * spacing;
      if (!options.inBounds(x, z)) continue;
      const height = options.sampleHeight(x, z);
      if (height === null || height < options.minGroundHeight) continue;
      if (options.isExcluded?.(x, z, height)) continue;
      const paint = options.samplePaint(x, z);
      if (paint === "stone" || paint === "brick") continue;
      const slope = options.estimateSlope(x, z, height);
      const ecology = options.sampleEcology(x, z, height, paint, placementSeed);
      const mixChoice = chooseBiomeMixEntry(options.biomeMix, paint, ecology, slope, x, z, placementSeed);
      const patch = mixChoice ? undefined : biomePatchForEcology(ecology, placementSeed) ?? biomePatchForPaint(paint, placementSeed) ?? undefined;
      if (!mixChoice && !patch) continue;
      const density = patch ? patch.density * options.densityMultiplier * options.lodDensity : 0;
      const fit = patch ? terrainFit(ecology, patch, slope) : 1;
      const cluster = patch ? clusterInfluence(patch, x, z, options.seed) : 1;
      const survival = mixChoice
        ? THREE.MathUtils.clamp(mixChoice.survival * options.densityMultiplier * options.lodDensity, 0, 1.2)
        : THREE.MathUtils.clamp(density * fit * cluster, 0, 1.2);
      if (rng() > survival) continue;
      const entry = mixChoice?.entry;
      const desiredRadius = entry ? desiredEntryRadius(entry) : desiredCrownRadius(patch!);
      candidates.push({
        x,
        z,
        height,
        patch,
        entry,
        seed: placementSeed,
        desiredRadius,
        minRadius: entry ? minEntrySurvivalRadius(entry) : minSurvivalRadius(patch!),
        priority: survival * (0.82 + localRng() * 0.36),
      });
    }
  }

  let kept = viableCandidates(candidates);
  kept = viableCandidates(kept).slice(0, options.maxPlants);
  return kept.map((candidate) => ({
    x: candidate.x,
    z: candidate.z,
    height: candidate.height,
    patch: candidate.patch,
    entry: candidate.entry,
    seed: candidate.seed,
    crownRadius: candidate.desiredRadius,
    growthScale: THREE.MathUtils.clamp(
      candidate.desiredRadius / Math.max(0.001, desiredCandidateRadius(candidate)),
      0.62,
      1.12,
    ),
  }));
};
