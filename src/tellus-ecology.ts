import * as THREE from "three";
import { CHUNK_SPAN, SEA_LEVEL, WORLD_RADIUS } from "./tellus-constants";
import type { BuildingMaterialStyle } from "./tellus-proc-buildings";
import {
  resolveProcPlantCommunity,
  type ProcPlantBiomeId,
  type ProcPlantEcologySample,
  type ProcPlantSubstrateKind,
} from "./tellus-procplants";
import type { TerrainPaintKind } from "./tellus-types";
import type { WorldBiomeCell } from "./world-protocol";

export type EcologyBiomeId = ProcPlantBiomeId;
export type SubstrateKind = ProcPlantSubstrateKind;

export interface EcologySample extends ProcPlantEcologySample {
  seed: number;
  terrainPaint: TerrainPaintKind | null;
  biome: EcologyBiomeId;
  biomeWeights: Partial<Record<EcologyBiomeId, number>>;
}

export interface EcologySampleInput {
  seed: number;
  x: number;
  z: number;
  height: number;
  slope?: number;
  terrainPaint?: TerrainPaintKind | null;
  biomeCell?: WorldBiomeCell | null;
}

export const WORLD_BIOME_GRID_SIZE = 24;

export interface WorldBiomeGridContext {
  chunkedWorldChunks?: { w: number; h: number } | null;
  worldRadius?: number;
}

const biomeGridAxis = (value: number, min: number, span: number): number =>
  Math.max(0, Math.min(WORLD_BIOME_GRID_SIZE - 1, Math.floor(((value - min) / span) * WORLD_BIOME_GRID_SIZE)));

export const worldBiomeCellCoordinates = (
  x: number,
  z: number,
  context: WorldBiomeGridContext = {},
): { cx: number; cz: number } => {
  const chunks = context.chunkedWorldChunks;
  if (chunks && chunks.w > 0 && chunks.h > 0) {
    return {
      cx: biomeGridAxis(x, 0, chunks.w * CHUNK_SPAN),
      cz: biomeGridAxis(z, 0, chunks.h * CHUNK_SPAN),
    };
  }
  const radius = Math.max(1, context.worldRadius ?? WORLD_RADIUS);
  return {
    cx: biomeGridAxis(x, -radius, radius * 2),
    cz: biomeGridAxis(z, -radius, radius * 2),
  };
};

export const worldBiomeCellBounds = (
  cx: number,
  cz: number,
  context: WorldBiomeGridContext = {},
): { minX: number; maxX: number; minZ: number; maxZ: number } => {
  const chunks = context.chunkedWorldChunks;
  const minX = chunks ? 0 : -(context.worldRadius ?? WORLD_RADIUS);
  const minZ = chunks ? 0 : -(context.worldRadius ?? WORLD_RADIUS);
  const spanX = chunks ? chunks.w * CHUNK_SPAN : (context.worldRadius ?? WORLD_RADIUS) * 2;
  const spanZ = chunks ? chunks.h * CHUNK_SPAN : (context.worldRadius ?? WORLD_RADIUS) * 2;
  const cellWidth = spanX / WORLD_BIOME_GRID_SIZE;
  const cellDepth = spanZ / WORLD_BIOME_GRID_SIZE;
  return {
    minX: minX + cx * cellWidth,
    maxX: minX + (cx + 1) * cellWidth,
    minZ: minZ + cz * cellDepth,
    maxZ: minZ + (cz + 1) * cellDepth,
  };
};

export const ECOLOGY_BIOMES: EcologyBiomeId[] = [
  "tropical-rain-forest",
  "temperate-rain-forest",
  "desert",
  "tundra",
  "taiga",
  "grassland",
  "savanna",
  "estuary",
  "coastal",
  "arctic-alpine",
];

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

// Each of these paints maps 1:1 to exactly one ecology biome (the reverse of
// ECOLOGY_TERRAIN_PAINT_MAP) — a player who paints one of these is directly declaring the
// biome for that spot, and that declaration must win over a coarser authored/evolved biome-cell
// assignment. Paints without a 1:1 biome (rock, dirt is shared with taiga's authored default,
// stone, brick) intentionally fall through to the authored cell / heuristic weighting instead.
const TERRAIN_PAINT_ECOLOGY_MAP: Partial<Record<TerrainPaintKind, EcologyBiomeId>> = Object.fromEntries(
  (Object.entries(ECOLOGY_TERRAIN_PAINT_MAP) as [EcologyBiomeId, TerrainPaintKind][]).map(
    ([biome, paint]) => [paint, biome],
  ),
);

const clamp01 = (value: number) => THREE.MathUtils.clamp(value, 0, 1);

const hash01 = (x: number, z: number, seed: number): number => {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 0.0001) * 43758.5453;
  return n - Math.floor(n);
};

export const normalizeEcologyBiomeId = (value: string | null | undefined): EcologyBiomeId | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, "-");
  if ((ECOLOGY_BIOMES as string[]).includes(normalized)) return normalized as EcologyBiomeId;
  if (normalized === "wetland" || normalized === "mangrove" || normalized === "marsh") return "estuary";
  if (normalized === "alpine" || normalized === "arctic" || normalized === "mountain") return "arctic-alpine";
  if (normalized === "forest" || normalized === "temperate-forest" || normalized === "rain-forest") return "temperate-rain-forest";
  if (normalized === "tropical-forest" || normalized === "jungle") return "tropical-rain-forest";
  if (normalized === "meadow" || normalized === "prairie" || normalized === "steppe") return "grassland";
  if (normalized === "beach" || normalized === "shore" || normalized === "cove") return "coastal";
  if (normalized === "snow" || normalized === "ice" || normalized === "glacier") return "arctic-alpine";
  if (normalized === "alien" || normalized === "lichen") return "tundra";
  return null;
};

export const substrateForTerrainPaint = (paint: TerrainPaintKind | null | undefined): SubstrateKind => {
  switch (paint) {
    case "beach":
      return "sand";
    case "dirt":
      return "clay";
    case "rock":
      return "granite";
    case "snow":
      return "ice";
    case "stone":
      return "limestone";
    case "brick":
      return "clay";
    case "grass":
    case "flowers":
    case "meadow":
    default:
      return "loam";
  }
};

const addWeight = (
  weights: Partial<Record<EcologyBiomeId, number>>,
  biome: EcologyBiomeId,
  amount: number,
) => {
  weights[biome] = (weights[biome] ?? 0) + Math.max(0, amount);
};

export const resolveEcologySample = (input: EcologySampleInput): EcologySample => {
  const elevation = clamp01((input.height - SEA_LEVEL + 4) / 38);
  const slope = clamp01(input.slope ?? 0);
  const paint = input.terrainPaint ?? null;
  const substrate = substrateForTerrainPaint(paint);
  const latitude = Math.abs(Math.sin(input.z / (CHUNK_SPAN * 24)));
  const coastal = paint === "beach" || input.height < SEA_LEVEL + 2.2 ? 1 : 0;
  const noise = hash01(Math.floor(input.x / CHUNK_SPAN), Math.floor(input.z / CHUNK_SPAN), input.seed);
  const warmth = clamp01(0.92 - latitude * 0.62 - elevation * 0.44 + (noise - 0.5) * 0.1);
  const moisture = clamp01(
    (paint === "snow" ? 0.54 : paint === "beach" ? 0.48 : paint === "dirt" ? 0.3 : paint === "rock" ? 0.28 : 0.62) +
      coastal * 0.22 +
      (1 - slope) * 0.12 +
      (hash01(input.x * 0.05, input.z * 0.05, input.seed ^ 0x9e3779b1) - 0.5) * 0.18,
  );
  const seasonality = clamp01(latitude * 0.68 + elevation * 0.32 + (paint === "snow" ? 0.2 : 0));
  const salinity = clamp01(coastal * 0.7 + (paint === "beach" ? 0.2 : 0));
  const wind = clamp01(slope * 0.55 + coastal * 0.28 + elevation * 0.24);
  const light = clamp01(0.78 + slope * 0.1 - moisture * 0.12);
  const weights: Partial<Record<EcologyBiomeId, number>> = {};
  const authoredBiome = normalizeEcologyBiomeId(input.biomeCell?.becoming ?? input.biomeCell?.biome);
  // A paint with a 1:1 biome mapping (snow, jungle-moss, forest-floor, ...) is the player directly
  // declaring the biome for this spot — it must win over a coarser authored/evolved biome-cell
  // assignment, or repainting terrain silently leaves the old biome (and its plant mix) in place.
  const paintedBiome = paint ? TERRAIN_PAINT_ECOLOGY_MAP[paint] : undefined;

  if (salinity > 0.35) addWeight(weights, coastal ? "coastal" : "estuary", salinity);
  if (moisture > 0.76 && elevation < 0.32) addWeight(weights, warmth > 0.62 ? "tropical-rain-forest" : "temperate-rain-forest", moisture);
  if (moisture > 0.82 && salinity > 0.2) addWeight(weights, "estuary", moisture * salinity);
  if (warmth < 0.22 && elevation > 0.46) addWeight(weights, "arctic-alpine", (1 - warmth) * elevation);
  if (warmth < 0.34 && moisture > 0.34) addWeight(weights, elevation > 0.58 ? "arctic-alpine" : "taiga", (1 - warmth) * moisture);
  if (warmth < 0.24 && moisture < 0.44) addWeight(weights, "tundra", (1 - warmth) * (1 - moisture));
  if (moisture < 0.24) addWeight(weights, "desert", (1 - moisture) * (warmth > 0.45 ? 1 : 0.72));
  if (warmth > 0.62 && moisture >= 0.24 && moisture < 0.48) addWeight(weights, "savanna", warmth * (1 - moisture));
  if (moisture >= 0.38 && moisture < 0.72) addWeight(weights, "grassland", 0.58 + (1 - slope) * 0.22);
  if (paint === "snow") addWeight(weights, "arctic-alpine", 1);
  if (paint === "rock") addWeight(weights, elevation > 0.45 || warmth < 0.32 ? "arctic-alpine" : "desert", 0.52);
  if (paint === "grass" || paint === "flowers" || paint === "meadow") addWeight(weights, "grassland", 0.55);

  if (paintedBiome) {
    for (const id of ECOLOGY_BIOMES) delete weights[id];
    weights[paintedBiome] = 1;
  } else if (authoredBiome) {
    for (const id of ECOLOGY_BIOMES) delete weights[id];
    weights[authoredBiome] = 1;
  }

  let total = 0;
  let biome: EcologyBiomeId = "grassland";
  let best = -1;
  for (const id of ECOLOGY_BIOMES) {
    const value = weights[id] ?? 0;
    total += value;
    if (value > best) {
      best = value;
      biome = id;
    }
  }
  if (total <= 0) {
    weights.grassland = 1;
    total = 1;
  }
  for (const id of ECOLOGY_BIOMES) {
    if (weights[id] !== undefined) weights[id] = (weights[id] ?? 0) / total;
  }

  return {
    seed: input.seed,
    terrainPaint: paint,
    biome,
    biomeWeights: weights,
    substrate,
    elevation,
    slope,
    warmth,
    moisture,
    seasonality,
    salinity,
    wind,
    light,
  };
};

export const resolveEcologyCommunity = (sample: EcologySample, limit = 6) =>
  resolveProcPlantCommunity(sample, limit);

export const buildingMaterialForEcology = (
  sample: Pick<EcologySample, "biome" | "substrate" | "moisture" | "salinity">,
  recipeId?: string,
): Exclude<BuildingMaterialStyle, "auto"> => {
  if (recipeId === "keep" || recipeId === "castle" || recipeId === "fortress") {
    return sample.substrate === "limestone" ? "stone-ashlar" : "stone-rubble";
  }
  if (sample.biome === "desert") return sample.substrate === "clay" ? "adobe" : "desert-adobe";
  if (sample.biome === "savanna") return "wood-plank";
  if (sample.biome === "tropical-rain-forest") return "wood-plank";
  if (sample.biome === "temperate-rain-forest") return sample.moisture > 0.78 ? "cedar-shingle" : "timber-frame";
  if (sample.biome === "taiga") return "log-siding";
  if (sample.biome === "tundra" || sample.biome === "arctic-alpine") return sample.substrate === "ice" ? "stone-rubble" : "log-siding";
  if (sample.biome === "estuary") return sample.substrate === "clay" || sample.substrate === "silt" ? "brick-cottage" : "wood-plank";
  if (sample.biome === "coastal") {
    if (sample.salinity > 0.5) return "weathered-shingle";
    return sample.substrate === "granite" || sample.substrate === "limestone" || sample.substrate === "shale"
      ? "fieldstone-cottage"
      : "cedar-shingle";
  }
  if (sample.substrate === "limestone") return "cotswold-cottage";
  if (sample.substrate === "granite" || sample.substrate === "shale") return "fieldstone-cottage";
  return "timber-frame";
};
