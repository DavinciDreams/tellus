import * as THREE from "three";
import type { TerrainPaintKind } from "./tellus-types";
import {
  resolveEcologyCommunity,
  resolveEcologySample,
  type EcologySample,
} from "./tellus-ecology";
import {
  defaultPlantEnvironment,
  hybridizePlantGenomes,
  procPlantPresetIds,
  procPlantPresets,
  type ProcPlantEnvironment,
  type ProcPlantGenome,
} from "./tellus-procplants";

export interface ProcPlantBiomePatch {
  version: 1;
  seed: number;
  primary: string;
  secondary?: string;
  hybrid: number;
  density: number;
  scale: number;
  environment: ProcPlantEnvironment;
  treeBackend?: ProcPlantTreeBackend;
}

export interface ProcPlantTreeBackend {
  kind: "lsystem";
  species: string;
  leafScaleMultiplier?: number;
  maxLeaves?: number;
  maxStems?: number;
  maxBranchDepth?: number;
  foliageMass?: number;
  foliageClusterDensity?: number;
  foliageTipBias?: number;
  foliageSpread?: number;
}

export interface ProcPlantPlaceableCatalogEntry {
  id: string;
  presetId: string;
  label: string;
  emoji: string;
  kind: "tree" | "flower" | "object";
  scatterCount: number;
  scatterRadius: number;
  scale: number;
}

const labelForPreset = (id: string): string =>
  id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const placeableKindForGenome = (genome: ProcPlantGenome): ProcPlantPlaceableCatalogEntry["kind"] => {
  if (genome.habit === "tree" || genome.habit === "conifer" || genome.habit === "palm" || genome.habit === "shrub") return "tree";
  if (genome.habit === "flower") return "flower";
  return "object";
};

const emojiForGenome = (genome: ProcPlantGenome): string => {
  switch (genome.habit) {
    case "conifer":
      return "🌲";
    case "palm":
    case "tropical":
      return "🌴";
    case "flower":
      return "🌸";
    case "grass":
      return "🌱";
    case "fern":
    case "vine":
      return "🌿";
    case "shrub":
      return "🌳";
    default:
      return "🌿";
  }
};

export const PROCPLANT_PLACEABLE_CATALOG: ProcPlantPlaceableCatalogEntry[] = procPlantPresetIds.map((presetId) => {
  const genome = procPlantPresets[presetId];
  const kind = placeableKindForGenome(genome);
  return {
    id: `procplant-${presetId.toLowerCase()}`,
    presetId,
    label: labelForPreset(presetId),
    emoji: emojiForGenome(genome),
    kind,
    scatterCount: kind === "tree" ? 4 : kind === "flower" ? 12 : 10,
    scatterRadius: kind === "tree" ? 20 : 11,
    scale: kind === "tree" ? 1.35 : kind === "flower" ? 1.0 : 0.95,
  };
});

export const procPlantPlaceableById = (id: string): ProcPlantPlaceableCatalogEntry | undefined => {
  const normalized = id.trim().toLowerCase();
  return PROCPLANT_PLACEABLE_CATALOG.find(
    (entry) => entry.id === normalized || entry.presetId.toLowerCase() === normalized,
  );
};

type ProcPlantBiomeCandidate = Omit<ProcPlantBiomePatch, "version" | "seed"> & {
  weight: number;
};

const candidate = (
  primary: string,
  options: Partial<ProcPlantBiomeCandidate> = {},
): ProcPlantBiomeCandidate => ({
  primary,
  secondary: options.secondary,
  hybrid: options.hybrid ?? 0,
  density: options.density ?? 0.45,
  scale: options.scale ?? 1,
  weight: options.weight ?? 1,
  treeBackend: options.treeBackend,
  environment: {
    light: options.environment?.light ?? 0.78,
    moisture: options.environment?.moisture ?? 0.55,
    crowding: options.environment?.crowding ?? 0.32,
    biomeWarmth: options.environment?.biomeWarmth ?? 0.65,
  },
});

const PAINT_BIOMES: Record<TerrainPaintKind, ProcPlantBiomeCandidate[]> = {
  meadow: [
    candidate("meadowFlower", { secondary: "phiFern", hybrid: 0.18, density: 0.72, scale: 1.05, weight: 4, environment: { light: 0.78, moisture: 0.62, crowding: 0.36, biomeWarmth: 0.68 } }),
    candidate("cloverGroundcover", { density: 0.78, scale: 1.05, weight: 3, environment: { light: 0.72, moisture: 0.58, crowding: 0.52, biomeWarmth: 0.64 } }),
    candidate("understoryShrub", { density: 0.22, scale: 2.2, weight: 1, environment: { light: 0.64, moisture: 0.55, crowding: 0.34, biomeWarmth: 0.62 } }),
    candidate("hillCherry", { density: 0.16, scale: 5.4, weight: 1, treeBackend: { kind: "lsystem", species: "hillCherry", leafScaleMultiplier: 2.0, maxLeaves: 170, maxStems: 42, maxBranchDepth: 2 }, environment: { light: 0.76, moisture: 0.56, crowding: 0.28, biomeWarmth: 0.66 } }),
  ],
  flowers: [
    candidate("daylilyFlower", { secondary: "foxgloveSpike", hybrid: 0.2, density: 0.78, scale: 1.05, weight: 3, environment: { light: 0.82, moisture: 0.66, crowding: 0.42, biomeWarmth: 0.72 } }),
    candidate("foxgloveSpike", { density: 0.58, scale: 1.25, weight: 2, environment: { light: 0.74, moisture: 0.7, crowding: 0.38, biomeWarmth: 0.66 } }),
    candidate("laceUmbel", { density: 0.46, scale: 1.15, weight: 1, environment: { light: 0.8, moisture: 0.58, crowding: 0.3, biomeWarmth: 0.7 } }),
    candidate("hillCherry", { density: 0.14, scale: 4.8, weight: 1, treeBackend: { kind: "lsystem", species: "hillCherry", leafScaleMultiplier: 2.1, maxLeaves: 180, maxStems: 46, maxBranchDepth: 2 }, environment: { light: 0.78, moisture: 0.62, crowding: 0.32, biomeWarmth: 0.68 } }),
  ],
  grass: [
    candidate("furGrass", { secondary: "meadowFlower", hybrid: 0.08, density: 0.82, scale: 1.15, weight: 4, environment: { light: 0.76, moisture: 0.55, crowding: 0.45, biomeWarmth: 0.64 } }),
    candidate("reedSedge", { density: 0.34, scale: 1.25, weight: 1, environment: { light: 0.7, moisture: 0.72, crowding: 0.36, biomeWarmth: 0.62 } }),
    candidate("understoryShrub", { density: 0.2, scale: 2.0, weight: 1, environment: { light: 0.66, moisture: 0.5, crowding: 0.34, biomeWarmth: 0.62 } }),
    candidate("oakCanopy", { density: 0.18, scale: 6.2, weight: 1, treeBackend: { kind: "lsystem", species: "cambridgeOak", leafScaleMultiplier: 1.8, maxLeaves: 190, maxStems: 48, maxBranchDepth: 2 }, environment: { light: 0.7, moisture: 0.5, crowding: 0.32, biomeWarmth: 0.58 } }),
    candidate("birchGrove", { density: 0.16, scale: 5.8, weight: 1, treeBackend: { kind: "lsystem", species: "silverBirch", leafScaleMultiplier: 2.9, maxLeaves: 170, maxStems: 40, maxBranchDepth: 2 }, environment: { light: 0.72, moisture: 0.52, crowding: 0.28, biomeWarmth: 0.5 } }),
  ],
  beach: [
    candidate("foldedPalm", { secondary: "furGrass", hybrid: 0.04, density: 0.3, scale: 3.2, weight: 2, environment: { light: 0.92, moisture: 0.36, crowding: 0.18, biomeWarmth: 0.9 } }),
    candidate("reedSedge", { density: 0.25, scale: 1.1, weight: 2, environment: { light: 0.86, moisture: 0.5, crowding: 0.2, biomeWarmth: 0.78 } }),
    candidate("desertRosette", { density: 0.16, scale: 1.25, weight: 1, environment: { light: 0.94, moisture: 0.22, crowding: 0.12, biomeWarmth: 0.86 } }),
  ],
  dirt: [
    candidate("desertRosette", { secondary: "vincaVine", hybrid: 0.1, density: 0.38, scale: 1.25, weight: 2, environment: { light: 0.8, moisture: 0.38, crowding: 0.24, biomeWarmth: 0.7 } }),
    candidate("roseBush", { density: 0.24, scale: 1.8, weight: 1, environment: { light: 0.74, moisture: 0.46, crowding: 0.3, biomeWarmth: 0.68 } }),
    candidate("understoryShrub", { density: 0.3, scale: 2.1, weight: 2, environment: { light: 0.68, moisture: 0.42, crowding: 0.34, biomeWarmth: 0.64 } }),
    candidate("acaciaUmbrella", { density: 0.14, scale: 5.8, weight: 1, treeBackend: { kind: "lsystem", species: "sassafras", leafScaleMultiplier: 2.0, maxLeaves: 150, maxStems: 42, maxBranchDepth: 2 }, environment: { light: 0.82, moisture: 0.34, crowding: 0.2, biomeWarmth: 0.76 } }),
  ],
  rock: [
    candidate("agaveSucculent", { secondary: "desertRosette", hybrid: 0.08, density: 0.22, scale: 1.3, weight: 3, environment: { light: 0.86, moisture: 0.24, crowding: 0.12, biomeWarmth: 0.62 } }),
    candidate("phiFern", { density: 0.1, scale: 0.85, weight: 1, environment: { light: 0.54, moisture: 0.34, crowding: 0.18, biomeWarmth: 0.5 } }),
  ],
  snow: [
    candidate("alpineFir", { density: 0.2, scale: 6.1, weight: 3, treeBackend: { kind: "lsystem", species: "balsamFir", leafScaleMultiplier: 2.8, maxLeaves: 180, maxStems: 44, maxBranchDepth: 2 }, environment: { light: 0.66, moisture: 0.44, crowding: 0.16, biomeWarmth: 0.14 } }),
    candidate("blueSpruce", { secondary: "furGrass", hybrid: 0.04, density: 0.22, scale: 3.2, weight: 2, environment: { light: 0.68, moisture: 0.42, crowding: 0.18, biomeWarmth: 0.16 } }),
    candidate("redwoodSpire", { density: 0.12, scale: 7.0, weight: 1, treeBackend: { kind: "lsystem", species: "douglasFir", leafScaleMultiplier: 2.4, maxLeaves: 180, maxStems: 44, maxBranchDepth: 2 }, environment: { light: 0.64, moisture: 0.48, crowding: 0.14, biomeWarmth: 0.2 } }),
    candidate("furGrass", { density: 0.16, scale: 0.8, weight: 1, environment: { light: 0.62, moisture: 0.34, crowding: 0.12, biomeWarmth: 0.18 } }),
  ],
  stone: [
    candidate("phiFern", { secondary: "furGrass", hybrid: 0.04, density: 0.12, scale: 0.8, weight: 2, environment: { light: 0.58, moisture: 0.36, crowding: 0.2, biomeWarmth: 0.52 } }),
    candidate("vincaVine", { density: 0.08, scale: 0.9, weight: 1, environment: { light: 0.48, moisture: 0.42, crowding: 0.24, biomeWarmth: 0.56 } }),
  ],
  brick: [
    candidate("vincaVine", { density: 0.08, scale: 0.85, weight: 2, environment: { light: 0.52, moisture: 0.32, crowding: 0.14, biomeWarmth: 0.55 } }),
    candidate("phiFern", { density: 0.06, scale: 0.72, weight: 1, environment: { light: 0.58, moisture: 0.3, crowding: 0.14, biomeWarmth: 0.55 } }),
  ],
};

const TREE_BACKEND_BY_PRESET: Partial<Record<string, ProcPlantTreeBackend>> = {
  oakCanopy: { kind: "lsystem", species: "cambridgeOak", leafScaleMultiplier: 1.8, maxLeaves: 190, maxStems: 48, maxBranchDepth: 2 },
  birchGrove: { kind: "lsystem", species: "silverBirch", leafScaleMultiplier: 2.9, maxLeaves: 170, maxStems: 40, maxBranchDepth: 2 },
  acaciaUmbrella: { kind: "lsystem", species: "sassafras", leafScaleMultiplier: 2.0, maxLeaves: 150, maxStems: 42, maxBranchDepth: 2, foliageMass: 0.58, foliageSpread: 0.28 },
  alpineFir: { kind: "lsystem", species: "balsamFir", leafScaleMultiplier: 2.8, maxLeaves: 180, maxStems: 44, maxBranchDepth: 2 },
  redwoodSpire: { kind: "lsystem", species: "douglasFir", leafScaleMultiplier: 2.4, maxLeaves: 180, maxStems: 44, maxBranchDepth: 2, foliageMass: 0.9, foliageTipBias: 0.34 },
};

const patchFromEcologyPreset = (
  presetId: string,
  sample: EcologySample,
  weight: number,
): ProcPlantBiomeCandidate => {
  const treeBackend = TREE_BACKEND_BY_PRESET[presetId];
  const isTree = Boolean(treeBackend);
  const dryStress = 1 - sample.moisture;
  const windStress = sample.wind;
  return candidate(presetId, {
    weight,
    density: THREE.MathUtils.clamp((isTree ? 0.18 : 0.58) * (0.62 + sample.moisture * 0.58) * (1 - sample.salinity * 0.22), 0.06, 0.88),
    scale: THREE.MathUtils.clamp((isTree ? 5.8 : 1.05) * (1 - dryStress * 0.18) * (1 - windStress * 0.12), isTree ? 2.8 : 0.62, isTree ? 8.4 : 2.3),
    treeBackend,
    environment: {
      light: sample.light,
      moisture: sample.moisture,
      crowding: THREE.MathUtils.clamp(sample.biomeWeights["tropical-rain-forest"] ?? sample.biomeWeights["temperate-rain-forest"] ?? 0.32, 0.16, 0.82),
      biomeWarmth: sample.warmth,
    },
  });
};

const pickCandidate = (
  candidates: ProcPlantBiomeCandidate[],
  seed: number,
): ProcPlantBiomeCandidate | undefined => {
  const total = candidates.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return candidates[0];
  let h = seed >>> 0;
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  let roll = ((h >>> 0) / 4294967296) * total;
  for (const item of candidates) {
    roll -= Math.max(0, item.weight);
    if (roll <= 0) return item;
  }
  return candidates[candidates.length - 1];
};

export const biomePatchForPaint = (
  paint: TerrainPaintKind | null,
  seed: number,
): ProcPlantBiomePatch | null => {
  if (!paint) return null;
  const base = pickCandidate(PAINT_BIOMES[paint] ?? [], seed);
  if (!base) return null;
  return { version: 1, seed, ...base };
};

export const biomePatchForEcology = (
  ecology: EcologySample,
  seed: number,
): ProcPlantBiomePatch | null => {
  const community = resolveEcologyCommunity(ecology, 6);
  const candidates = community.map((entry) => patchFromEcologyPreset(entry.presetId, ecology, entry.score));
  const fallback = ecology.terrainPaint ? PAINT_BIOMES[ecology.terrainPaint] ?? [] : [];
  const base = pickCandidate(candidates.length > 0 ? candidates : fallback, seed);
  if (!base) return null;
  return { version: 1, seed, ...base };
};

export const biomePatchForPaintEcology = (
  paint: TerrainPaintKind | null,
  seed: number,
): ProcPlantBiomePatch | null =>
  biomePatchForEcology(
    resolveEcologySample({
      seed,
      x: 0,
      z: 0,
      height: paint === "snow" ? 30 : paint === "beach" ? 0.8 : 4,
      slope: paint === "rock" ? 0.72 : 0.12,
      terrainPaint: paint,
    }),
    seed,
  ) ?? biomePatchForPaint(paint, seed);

export const genomeForBiomePatch = (patch: ProcPlantBiomePatch): ProcPlantGenome => {
  const primary = procPlantPresets[patch.primary] ?? procPlantPresets.furGrass;
  const secondary = patch.secondary ? procPlantPresets[patch.secondary] : undefined;
  if (!secondary || patch.hybrid <= 0) return primary;
  return hybridizePlantGenomes(primary, secondary, patch.hybrid, patch.seed);
};

export const environmentForBiomePatch = (patch: ProcPlantBiomePatch): ProcPlantEnvironment => ({
  ...defaultPlantEnvironment(),
  ...patch.environment,
});

export const treeBackendForBiomePatch = (patch: ProcPlantBiomePatch): ProcPlantTreeBackend | null =>
  patch.treeBackend ?? null;
