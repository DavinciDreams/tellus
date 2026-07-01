import {
  biomePatchesForEcologyBiome,
  biomePatchesForPaint,
  environmentForBiomePatch,
  genomeForBiomePatch,
  type ProcPlantBiomePatch,
} from "./tellus-procplant-biomes";
import type { EcologyBiomeId } from "./tellus-ecology";
import {
  defaultPlantEnvironment,
  procPlantPresets,
  type ProcPlantEnvironment,
  type ProcPlantGenome,
} from "./tellus-procplants";
import type { TerrainPaintKind } from "./tellus-types";

export type TellusBiomeMixSource = "ecology" | "terrain-paint" | "custom";

export interface TellusBiomeMixEntry {
  id: string;
  label: string;
  source: "preset" | "mutation";
  presetId?: string;
  genome?: ProcPlantGenome;
  weight: number;
  density: number;
  scale: number;
  environment: ProcPlantEnvironment;
  seed: number;
  enabled: boolean;
}

export interface TellusBiomeMixDefinition {
  version: 1;
  id: string;
  label: string;
  source: TellusBiomeMixSource;
  ecologyBiome?: EcologyBiomeId;
  terrainPaint?: TerrainPaintKind;
  seed: number;
  density: number;
  diversity: number;
  targetVerticesPerChunk: number;
  entries: TellusBiomeMixEntry[];
}

export interface ProcPlantLabExport {
  version?: number;
  savedAt?: string;
  state?: {
    primary?: string;
    secondary?: string;
    hybrid?: number;
    seed?: number;
    density?: number;
    light?: number;
    moisture?: number;
    crowding?: number;
    warmth?: number;
  };
  genome?: ProcPlantGenome;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const labelForProcPlantId = (id: string): string =>
  id
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "biome";

const environmentFromExport = (payload: ProcPlantLabExport): ProcPlantEnvironment => ({
  ...defaultPlantEnvironment(),
  light: payload.state?.light ?? defaultPlantEnvironment().light,
  moisture: payload.state?.moisture ?? defaultPlantEnvironment().moisture,
  crowding: payload.state?.crowding ?? defaultPlantEnvironment().crowding,
  biomeWarmth: payload.state?.warmth ?? defaultPlantEnvironment().biomeWarmth,
});

export const genomeForMixEntry = (entry: TellusBiomeMixEntry): ProcPlantGenome => {
  if (entry.genome) return entry.genome;
  if (entry.presetId && procPlantPresets[entry.presetId]) return procPlantPresets[entry.presetId];
  return procPlantPresets.furGrass;
};

export const entryFromBiomePatch = (
  patch: ProcPlantBiomePatch,
  index: number,
): TellusBiomeMixEntry => ({
  id: `${patch.primary}-${index + 1}`,
  label: labelForProcPlantId(patch.primary),
  source: "preset",
  presetId: patch.primary,
  weight: Math.max(0.01, "weight" in patch ? Number(patch.weight) || 1 : 1),
  density: patch.density,
  scale: patch.scale,
  environment: environmentForBiomePatch(patch),
  seed: patch.seed,
  enabled: true,
});

export const makeEcologyBiomeMix = (
  biome: EcologyBiomeId,
  seed = 612072,
): TellusBiomeMixDefinition => ({
  version: 1,
  id: `ecology-${slug(biome)}`,
  label: labelForProcPlantId(biome),
  source: "ecology",
  ecologyBiome: biome,
  seed,
  density: 0.72,
  diversity: 0.82,
  targetVerticesPerChunk: 250000,
  entries: biomePatchesForEcologyBiome(biome, seed, 8).map(entryFromBiomePatch),
});

export const makeTerrainPaintBiomeMix = (
  paint: TerrainPaintKind,
  seed = 612072,
): TellusBiomeMixDefinition => ({
  version: 1,
  id: `terrain-${slug(paint)}`,
  label: labelForProcPlantId(paint),
  source: "terrain-paint",
  terrainPaint: paint,
  seed,
  density: 0.65,
  diversity: 0.72,
  targetVerticesPerChunk: 250000,
  entries: biomePatchesForPaint(paint, seed).map(entryFromBiomePatch),
});

export const entryFromProcPlantLabExport = (
  raw: unknown,
  filename = "procplant-mutation.json",
): TellusBiomeMixEntry | null => {
  if (!isRecord(raw) || !isRecord(raw.genome)) return null;
  const payload = raw as ProcPlantLabExport;
  const genome = payload.genome as ProcPlantGenome;
  const seed = Math.max(1, Math.floor(payload.state?.seed ?? Date.now() % 0xffffffff));
  const id = slug(`${genome.id || filename}-${seed}`);
  return {
    id,
    label: labelForProcPlantId(genome.id || filename.replace(/\.json$/i, "")),
    source: "mutation",
    genome,
    weight: 1,
    density: Math.max(0.05, Math.min(1, payload.state?.density ?? 0.45)),
    scale: genome.habit === "tree" || genome.habit === "conifer" || genome.habit === "palm" ? 8 : 1,
    environment: environmentFromExport(payload),
    seed,
    enabled: true,
  };
};

export const normalizeBiomeMixDefinition = (raw: unknown): TellusBiomeMixDefinition | null => {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.entries)) return null;
  const entries = raw.entries
    .map((entry): TellusBiomeMixEntry | null => {
      if (!isRecord(entry)) return null;
      const source = entry.source === "mutation" ? "mutation" : "preset";
      const presetId = typeof entry.presetId === "string" ? entry.presetId : undefined;
      const genome = isRecord(entry.genome) ? (entry.genome as unknown as ProcPlantGenome) : undefined;
      if (!genome && (!presetId || !procPlantPresets[presetId])) return null;
      return {
        id: typeof entry.id === "string" ? entry.id : slug(presetId ?? genome?.id ?? "entry"),
        label: typeof entry.label === "string" ? entry.label : labelForProcPlantId(presetId ?? genome?.id ?? "Plant"),
        source,
        presetId,
        genome,
        weight: typeof entry.weight === "number" ? entry.weight : 1,
        density: typeof entry.density === "number" ? entry.density : 0.45,
        scale: typeof entry.scale === "number" ? entry.scale : 1,
        environment: isRecord(entry.environment)
          ? { ...defaultPlantEnvironment(), ...(entry.environment as Partial<ProcPlantEnvironment>) }
          : defaultPlantEnvironment(),
        seed: typeof entry.seed === "number" ? entry.seed : 1,
        enabled: entry.enabled !== false,
      };
    })
    .filter((entry): entry is TellusBiomeMixEntry => Boolean(entry));
  if (entries.length === 0) return null;
  return {
    version: 1,
    id: typeof raw.id === "string" ? raw.id : "custom-biome",
    label: typeof raw.label === "string" ? raw.label : "Custom Biome",
    source: raw.source === "terrain-paint" || raw.source === "ecology" ? raw.source : "custom",
    ecologyBiome: typeof raw.ecologyBiome === "string" ? (raw.ecologyBiome as EcologyBiomeId) : undefined,
    terrainPaint: typeof raw.terrainPaint === "string" ? (raw.terrainPaint as TerrainPaintKind) : undefined,
    seed: typeof raw.seed === "number" ? raw.seed : 1,
    density: typeof raw.density === "number" ? raw.density : 0.65,
    diversity: typeof raw.diversity === "number" ? raw.diversity : 0.75,
    targetVerticesPerChunk: typeof raw.targetVerticesPerChunk === "number" ? raw.targetVerticesPerChunk : 250000,
    entries,
  };
};
