import * as THREE from "three";
import type { TerrainPaintKind } from "./tellus-types";
import {
  ECOLOGY_BIOMES,
  resolveEcologyCommunity,
  resolveEcologySample,
  type EcologyBiomeId,
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
  assetStoreModelId?: string;
  assetModelUrl?: string;
}

export const ASSET_BACKED_PROCPLANT_MODEL_IDS = [
  "3e610d94-51a5-4257-9899-34f5c8eaa0bb",
  "78f6d91e-7382-4760-903c-c1b73b9c38cd",
  "cae23ae2-7392-4ace-baec-cfaf09423ae8",
  "2b64b91a-cc16-4b03-afef-7f09cbf3a0cc",
  "c2c100e2-df7c-4da7-96e3-b4dbe33645d9",
  "73fd0d30-9023-4c85-922c-7e56e6cd10e8",
  "f75adff3-7810-44ac-9c86-e183c19eb616",
  "124d6b49-4d5e-4b05-bc81-848ef6f7377a",
] as const;

export const ASSET_BACKED_PROCPLANT_MODEL_ID_SET = new Set<string>(ASSET_BACKED_PROCPLANT_MODEL_IDS);

const ADULT_TREE_SCALE_BY_PRESET: Partial<Record<string, number>> = {
  oakCanopy: 13.5,
  birchGrove: 11.5,
  acaciaUmbrella: 9.5,
  mangroveRoots: 8.8,
  blueSpruce: 10.5,
  alpineFir: 14.5,
  redwoodSpire: 17.5,
  foldedPalm: 8.4,
};

const ADULT_TREE_SCALE_BY_SPECIES: Partial<Record<string, number>> = {
  balsamfir: 14.5,
  cambridgeoak: 13.5,
  douglasfir: 17.5,
  hillcherry: 8.4,
  silverbirch: 11.5,
  sassafras: 9.5,
  blacktupelo: 11,
};

const ASSET_BACKED_PROCPLANT_REPLACEMENTS: Partial<Record<string, {
  assetStoreModelId: string;
  scale?: number;
}>> = {
  furGrass: { assetStoreModelId: "3e610d94-51a5-4257-9899-34f5c8eaa0bb", scale: 1.15 },
  meadowFlower: { assetStoreModelId: "78f6d91e-7382-4760-903c-c1b73b9c38cd", scale: 1.1 },
  foxgloveSpike: { assetStoreModelId: "cae23ae2-7392-4ace-baec-cfaf09423ae8", scale: 1.25 },
  phiFern: { assetStoreModelId: "2b64b91a-cc16-4b03-afef-7f09cbf3a0cc", scale: 1.15 },
  fanPalmUnderstory: { assetStoreModelId: "c2c100e2-df7c-4da7-96e3-b4dbe33645d9", scale: 3.4 },
  agaveSucculent: { assetStoreModelId: "73fd0d30-9023-4c85-922c-7e56e6cd10e8", scale: 1.45 },
  reedSedge: { assetStoreModelId: "f75adff3-7810-44ac-9c86-e183c19eb616", scale: 1.15 },
  understoryShrub: { assetStoreModelId: "124d6b49-4d5e-4b05-bc81-848ef6f7377a", scale: 2.1 },
};

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

export const adultScaleForProcPlantPreset = (presetId: string): number => {
  const genome = procPlantPresets[presetId];
  if (!genome) return 1;
  const authored = ADULT_TREE_SCALE_BY_PRESET[presetId];
  if (authored !== undefined) return authored;
  const kind = placeableKindForGenome(genome);
  if (kind !== "tree") return genome.habit === "flower" ? 1.0 : 0.95;
  if (genome.habit === "conifer") return 12;
  if (genome.habit === "palm" || genome.habit === "tropical") return 8.4;
  return 10.5;
};

const adultScaleForTreeBackend = (
  primary: string,
  backend?: ProcPlantTreeBackend,
  requested?: number,
): number => {
  const preset = ADULT_TREE_SCALE_BY_PRESET[primary];
  const species = backend?.species ? ADULT_TREE_SCALE_BY_SPECIES[backend.species.toLowerCase()] : undefined;
  const adult = preset ?? species;
  if (adult === undefined) return requested ?? 1;
  return Math.max(requested ?? adult, adult);
};

export const PROCPLANT_PLACEABLE_CATALOG: ProcPlantPlaceableCatalogEntry[] = procPlantPresetIds.map((presetId) => {
  const genome = procPlantPresets[presetId];
  const kind = placeableKindForGenome(genome);
  const replacement = ASSET_BACKED_PROCPLANT_REPLACEMENTS[presetId];
  return {
    id: `procplant-${presetId.toLowerCase()}`,
    presetId,
    label: labelForPreset(presetId),
    emoji: emojiForGenome(genome),
    kind,
    scatterCount: kind === "tree" ? 4 : kind === "flower" ? 12 : 10,
    scatterRadius: kind === "tree" ? 30 : 11,
    scale: replacement?.scale ?? adultScaleForProcPlantPreset(presetId),
    assetStoreModelId: replacement?.assetStoreModelId,
    assetModelUrl: replacement
      ? `/api/assets/model/${encodeURIComponent(replacement.assetStoreModelId)}/game-optimized`
      : undefined,
  };
});

export const procPlantPlaceableById = (id: string): ProcPlantPlaceableCatalogEntry | undefined => {
  const normalized = id.trim().toLowerCase();
  return PROCPLANT_PLACEABLE_CATALOG.find(
    (entry) => entry.id === normalized || entry.presetId.toLowerCase() === normalized,
  );
};

export type ProcPlantBiomeCandidate = Omit<ProcPlantBiomePatch, "version" | "seed"> & {
  weight: number;
};

const TEXTURED_TREE_REPLACED_AUTO_PRESETS = new Set(["foldedPalm"]);

const candidate = (
  primary: string,
  options: Partial<ProcPlantBiomeCandidate> = {},
): ProcPlantBiomeCandidate => {
  const genome = procPlantPresets[primary];
  const isTree = Boolean(genome && placeableKindForGenome(genome) === "tree");
  return {
    primary,
    secondary: options.secondary,
    hybrid: options.hybrid ?? 0,
    density: isTree ? (options.density ?? 0.45) * 0.38 : options.density ?? 0.45,
    scale: isTree ? adultScaleForTreeBackend(primary, options.treeBackend, options.scale) : options.scale ?? 1,
    weight: options.weight ?? 1,
    treeBackend: options.treeBackend,
    environment: {
      light: options.environment?.light ?? 0.78,
      moisture: options.environment?.moisture ?? 0.55,
      crowding: options.environment?.crowding ?? 0.32,
      biomeWarmth: options.environment?.biomeWarmth ?? 0.65,
    },
  };
};

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
    candidate("oakCanopy", { density: 0.18, scale: 6.2, weight: 1, treeBackend: { kind: "lsystem", species: "cambridgeOak", leafScaleMultiplier: 2.9, maxLeaves: 220, maxStems: 48, maxBranchDepth: 2 }, environment: { light: 0.7, moisture: 0.5, crowding: 0.32, biomeWarmth: 0.58 } }),
    candidate("birchGrove", { density: 0.16, scale: 5.8, weight: 1, treeBackend: { kind: "lsystem", species: "silverBirch", leafScaleMultiplier: 3.9, maxLeaves: 195, maxStems: 40, maxBranchDepth: 2 }, environment: { light: 0.72, moisture: 0.52, crowding: 0.28, biomeWarmth: 0.5 } }),
  ],
  beach: [
    candidate("reedSedge", { density: 0.25, scale: 1.1, weight: 2, environment: { light: 0.86, moisture: 0.5, crowding: 0.2, biomeWarmth: 0.78 } }),
    candidate("desertRosette", { density: 0.16, scale: 1.25, weight: 1, environment: { light: 0.94, moisture: 0.22, crowding: 0.12, biomeWarmth: 0.86 } }),
  ],
  dirt: [
    candidate("desertRosette", { secondary: "vincaVine", hybrid: 0.1, density: 0.38, scale: 1.25, weight: 2, environment: { light: 0.8, moisture: 0.38, crowding: 0.24, biomeWarmth: 0.7 } }),
    candidate("roseBush", { density: 0.24, scale: 1.8, weight: 1, environment: { light: 0.74, moisture: 0.46, crowding: 0.3, biomeWarmth: 0.68 } }),
    candidate("understoryShrub", { density: 0.3, scale: 2.1, weight: 2, environment: { light: 0.68, moisture: 0.42, crowding: 0.34, biomeWarmth: 0.64 } }),
    candidate("acaciaUmbrella", { density: 0.14, scale: 5.8, weight: 1, treeBackend: { kind: "lsystem", species: "sassafras", leafScaleMultiplier: 3.25, maxLeaves: 180, maxStems: 42, maxBranchDepth: 2 }, environment: { light: 0.82, moisture: 0.34, crowding: 0.2, biomeWarmth: 0.76 } }),
  ],
  "forest-floor": [
    candidate("understoryShrub", { secondary: "phiFern", hybrid: 0.22, density: 0.48, scale: 2.2, weight: 3, environment: { light: 0.42, moisture: 0.66, crowding: 0.62, biomeWarmth: 0.48 } }),
    candidate("phiFern", { density: 0.52, scale: 1.0, weight: 2, environment: { light: 0.38, moisture: 0.74, crowding: 0.58, biomeWarmth: 0.46 } }),
    candidate("oakCanopy", { density: 0.18, scale: 6.5, weight: 1, treeBackend: { kind: "lsystem", species: "cambridgeOak", leafScaleMultiplier: 2.8, maxLeaves: 210, maxStems: 46, maxBranchDepth: 2 }, environment: { light: 0.46, moisture: 0.58, crowding: 0.56, biomeWarmth: 0.5 } }),
  ],
  "desert-sand": [
    candidate("desertRosette", { secondary: "agaveSucculent", hybrid: 0.16, density: 0.24, scale: 1.25, weight: 3, environment: { light: 0.96, moisture: 0.14, crowding: 0.1, biomeWarmth: 0.92 } }),
    candidate("agaveSucculent", { density: 0.18, scale: 1.4, weight: 2, environment: { light: 0.96, moisture: 0.12, crowding: 0.1, biomeWarmth: 0.9 } }),
    candidate("acaciaUmbrella", { density: 0.1, scale: 5.8, weight: 1, treeBackend: { kind: "lsystem", species: "sassafras", leafScaleMultiplier: 3.05, maxLeaves: 145, maxStems: 34, maxBranchDepth: 2 }, environment: { light: 0.92, moisture: 0.18, crowding: 0.12, biomeWarmth: 0.88 } }),
  ],
  rock: [
    candidate("agaveSucculent", { secondary: "desertRosette", hybrid: 0.08, density: 0.22, scale: 1.3, weight: 3, environment: { light: 0.86, moisture: 0.24, crowding: 0.12, biomeWarmth: 0.62 } }),
    candidate("phiFern", { density: 0.1, scale: 0.85, weight: 1, environment: { light: 0.54, moisture: 0.34, crowding: 0.18, biomeWarmth: 0.5 } }),
  ],
  snow: [
    candidate("alpineFir", { density: 0.2, scale: 6.1, weight: 3, treeBackend: { kind: "lsystem", species: "balsamFir", leafScaleMultiplier: 4.35, maxLeaves: 210, maxStems: 44, maxBranchDepth: 2 }, environment: { light: 0.66, moisture: 0.44, crowding: 0.16, biomeWarmth: 0.14 } }),
    candidate("blueSpruce", { secondary: "furGrass", hybrid: 0.04, density: 0.22, scale: 3.2, weight: 2, environment: { light: 0.68, moisture: 0.42, crowding: 0.18, biomeWarmth: 0.16 } }),
    candidate("redwoodSpire", { density: 0.12, scale: 7.0, weight: 1, treeBackend: { kind: "lsystem", species: "douglasFir", leafScaleMultiplier: 3.9, maxLeaves: 205, maxStems: 44, maxBranchDepth: 2 }, environment: { light: 0.64, moisture: 0.48, crowding: 0.14, biomeWarmth: 0.2 } }),
    candidate("furGrass", { density: 0.16, scale: 0.8, weight: 1, environment: { light: 0.62, moisture: 0.34, crowding: 0.12, biomeWarmth: 0.18 } }),
  ],
  stone: [],
  gravel: [
    candidate("alpineFir", { density: 0.14, scale: 4.8, weight: 3, treeBackend: { kind: "lsystem", species: "balsamFir", leafScaleMultiplier: 4.1, maxLeaves: 165, maxStems: 36, maxBranchDepth: 2 }, environment: { light: 0.72, moisture: 0.3, crowding: 0.12, biomeWarmth: 0.34 } }),
    candidate("furGrass", { density: 0.1, scale: 0.75, weight: 2, environment: { light: 0.7, moisture: 0.28, crowding: 0.1, biomeWarmth: 0.52 } }),
  ],
  "jungle-moss": [
    candidate("phiFern", { secondary: "vincaVine", hybrid: 0.3, density: 0.74, scale: 1.2, weight: 3, environment: { light: 0.35, moisture: 0.92, crowding: 0.76, biomeWarmth: 0.84 } }),
    candidate("understoryShrub", { density: 0.42, scale: 2.4, weight: 2, environment: { light: 0.38, moisture: 0.86, crowding: 0.72, biomeWarmth: 0.82 } }),
  ],
  brick: [],
};

const TREE_BACKEND_BY_PRESET: Partial<Record<string, ProcPlantTreeBackend>> = {
  oakCanopy: { kind: "lsystem", species: "cambridgeOak", leafScaleMultiplier: 2.9, maxLeaves: 220, maxStems: 48, maxBranchDepth: 2 },
  birchGrove: { kind: "lsystem", species: "silverBirch", leafScaleMultiplier: 3.9, maxLeaves: 195, maxStems: 40, maxBranchDepth: 2 },
  acaciaUmbrella: { kind: "lsystem", species: "sassafras", leafScaleMultiplier: 3.25, maxLeaves: 180, maxStems: 42, maxBranchDepth: 2, foliageMass: 0.7, foliageSpread: 0.32 },
  blueSpruce: { kind: "lsystem", species: "smallPine", leafScaleMultiplier: 4.2, maxLeaves: 205, maxStems: 54, maxBranchDepth: 2, foliageMass: 1.18, foliageTipBias: 0.28, foliageSpread: 0.14 },
  alpineFir: { kind: "lsystem", species: "balsamFir", leafScaleMultiplier: 4.35, maxLeaves: 210, maxStems: 44, maxBranchDepth: 2 },
  redwoodSpire: { kind: "lsystem", species: "douglasFir", leafScaleMultiplier: 3.9, maxLeaves: 205, maxStems: 44, maxBranchDepth: 2, foliageMass: 1.02, foliageTipBias: 0.32 },
};

export const ECOLOGY_TERRAIN_PAINT_MAP: Record<EcologyBiomeId, TerrainPaintKind> = {
  "tropical-rain-forest": "jungle-moss",
  "temperate-rain-forest": "forest-floor",
  grassland: "grass",
  desert: "desert-sand",
  coastal: "beach",
  taiga: "dirt",
  estuary: "flowers",
  tundra: "gravel",
  "arctic-alpine": "snow",
  savanna: "meadow",
};

const patchFromCandidate = (candidate: ProcPlantBiomeCandidate, seed: number): ProcPlantBiomePatch => ({
  version: 1,
  seed,
  ...candidate,
});

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
    density: THREE.MathUtils.clamp((isTree ? 0.07 : 0.58) * (0.62 + sample.moisture * 0.58) * (1 - sample.salinity * 0.22), isTree ? 0.025 : 0.06, isTree ? 0.18 : 0.88),
    scale: THREE.MathUtils.clamp(adultScaleForProcPlantPreset(presetId) * (1 - dryStress * 0.18) * (1 - windStress * 0.12), isTree ? 6.5 : 0.62, isTree ? 20 : 2.3),
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
  const base = pickCandidate(
    (PAINT_BIOMES[paint] ?? []).filter((entry) => !TEXTURED_TREE_REPLACED_AUTO_PRESETS.has(entry.primary)),
    seed,
  );
  if (!base) return null;
  return patchFromCandidate(base, seed);
};

export const biomePatchesForPaint = (
  paint: TerrainPaintKind | null,
  seed: number,
): ProcPlantBiomePatch[] =>
  paint
    ? (PAINT_BIOMES[paint] ?? [])
        .filter((entry) => !TEXTURED_TREE_REPLACED_AUTO_PRESETS.has(entry.primary))
        .map((entry, index) => patchFromCandidate(entry, seed ^ ((index + 1) * 0x9e3779b1)))
    : [];

export const biomePatchForEcology = (
  ecology: EcologySample,
  seed: number,
): ProcPlantBiomePatch | null => {
  const community = resolveEcologyCommunity(ecology, 6);
  const candidates = community
    .filter((entry) => !TEXTURED_TREE_REPLACED_AUTO_PRESETS.has(entry.presetId))
    .map((entry) => patchFromEcologyPreset(entry.presetId, ecology, entry.score));
  const fallback = ecology.terrainPaint
    ? (PAINT_BIOMES[ecology.terrainPaint] ?? []).filter((entry) => !TEXTURED_TREE_REPLACED_AUTO_PRESETS.has(entry.primary))
    : [];
  const base = pickCandidate(candidates.length > 0 ? candidates : fallback, seed);
  if (!base) return null;
  return patchFromCandidate(base, seed);
};

export const biomePatchesForEcology = (
  ecology: EcologySample,
  seed: number,
  limit = 8,
): ProcPlantBiomePatch[] => {
  const community = resolveEcologyCommunity(ecology, limit);
  const candidates = community
    .filter((entry) => !TEXTURED_TREE_REPLACED_AUTO_PRESETS.has(entry.presetId))
    .map((entry) => patchFromEcologyPreset(entry.presetId, ecology, entry.score));
  const fallback = ecology.terrainPaint
    ? (PAINT_BIOMES[ecology.terrainPaint] ?? []).filter((entry) => !TEXTURED_TREE_REPLACED_AUTO_PRESETS.has(entry.primary))
    : [];
  return (candidates.length > 0 ? candidates : fallback).map((entry, index) =>
    patchFromCandidate(entry, seed ^ ((index + 1) * 0x85ebca6b)),
  );
};

export const biomePatchesForEcologyBiome = (
  biome: EcologyBiomeId,
  seed: number,
  limit = 8,
): ProcPlantBiomePatch[] =>
  biomePatchesForEcology(
    resolveEcologySample({
      seed,
      x: 0,
      z: 0,
      height: biome === "arctic-alpine" || biome === "taiga" || biome === "tundra" ? 32 : biome === "coastal" || biome === "estuary" ? 1.2 : 8,
      slope: biome === "arctic-alpine" ? 0.62 : biome === "desert" ? 0.2 : 0.12,
      terrainPaint: ECOLOGY_TERRAIN_PAINT_MAP[biome],
      biomeCell: { cx: 0, cz: 0, biome, intensity: 1 },
    }),
    seed,
    limit,
  );

export const ECOLOGY_BIOME_OPTIONS = ECOLOGY_BIOMES;

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
