import {
  biomePatchesForEcologyBiome,
  biomePatchesForPaint,
  ECOLOGY_TERRAIN_PAINT_MAP,
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
import { getSession } from "./tellus-auth";
import { runtimeConfig, worldApiUrl } from "./tellus-runtime-config";
import { tellusUserId } from "./tellus-urls-identity";

export type TellusBiomeMixSource = "ecology" | "terrain-paint" | "custom";

export interface TellusBiomeMixEntry {
  id: string;
  label: string;
  source: "preset" | "mutation" | "asset";
  presetId?: string;
  genome?: ProcPlantGenome;
  asset?: {
    kind: "glb";
    name: string;
    libraryId?: string;
    color?: number;
    runtimeOnly?: boolean;
  };
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
  targetTerrainPaint?: TerrainPaintKind;
  seed: number;
  density: number;
  diversity: number;
  targetVerticesPerChunk: number;
  entries: TellusBiomeMixEntry[];
}

export interface TellusBiomeMixRegistry {
  version: 1;
  worldId: string;
  updatedAt: string;
  mixesByTerrainPaint: Partial<Record<TerrainPaintKind, TellusBiomeMixDefinition>>;
  mixesByEcologyBiome: Partial<Record<EcologyBiomeId, TellusBiomeMixDefinition>>;
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

export const isAssetMixEntry = (
  entry: TellusBiomeMixEntry,
): entry is TellusBiomeMixEntry & { asset: NonNullable<TellusBiomeMixEntry["asset"]> } =>
  entry.source === "asset" && entry.asset?.kind === "glb";

export const biomeMixTargetTerrainPaint = (mix: TellusBiomeMixDefinition): TerrainPaintKind | undefined =>
  mix.targetTerrainPaint ?? mix.terrainPaint ?? (mix.ecologyBiome ? ECOLOGY_TERRAIN_PAINT_MAP[mix.ecologyBiome] : undefined);

export const activeBiomeMixStorageKey = (worldId: string): string =>
  `tellus.activeBiomeMixes.${worldId.trim() || "main"}`;

export const BIOME_MIX_STORAGE_EVENT = "tellus:biomeMixesChanged";

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
  targetTerrainPaint: ECOLOGY_TERRAIN_PAINT_MAP[biome],
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
  targetTerrainPaint: paint,
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
      const source = entry.source === "asset" ? "asset" : entry.source === "mutation" ? "mutation" : "preset";
      const presetId = typeof entry.presetId === "string" ? entry.presetId : undefined;
      const genome = isRecord(entry.genome) ? (entry.genome as unknown as ProcPlantGenome) : undefined;
      const asset = isRecord(entry.asset) && entry.asset.kind === "glb" && typeof entry.asset.name === "string"
        ? {
          kind: "glb" as const,
          name: entry.asset.name,
          libraryId: typeof entry.asset.libraryId === "string" ? entry.asset.libraryId : undefined,
          color: typeof entry.asset.color === "number" ? entry.asset.color : undefined,
          runtimeOnly: entry.asset.runtimeOnly !== false,
        }
        : undefined;
      if (source === "asset" && !asset) return null;
      if (source !== "asset" && !genome && (!presetId || !procPlantPresets[presetId])) return null;
      return {
        id: typeof entry.id === "string" ? entry.id : slug(presetId ?? genome?.id ?? "entry"),
        label: typeof entry.label === "string" ? entry.label : labelForProcPlantId(presetId ?? genome?.id ?? "Plant"),
        source,
        presetId,
        genome,
        asset,
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
  const ecologyBiome = typeof raw.ecologyBiome === "string" ? (raw.ecologyBiome as EcologyBiomeId) : undefined;
  const terrainPaint = typeof raw.terrainPaint === "string" ? (raw.terrainPaint as TerrainPaintKind) : undefined;
  const targetTerrainPaint = typeof raw.targetTerrainPaint === "string"
    ? (raw.targetTerrainPaint as TerrainPaintKind)
    : terrainPaint ?? (ecologyBiome ? ECOLOGY_TERRAIN_PAINT_MAP[ecologyBiome] : undefined);
  return {
    version: 1,
    id: typeof raw.id === "string" ? raw.id : "custom-biome",
    label: typeof raw.label === "string" ? raw.label : "Custom Biome",
    source: raw.source === "terrain-paint" || raw.source === "ecology" ? raw.source : "custom",
    ecologyBiome,
    terrainPaint,
    targetTerrainPaint,
    seed: typeof raw.seed === "number" ? raw.seed : 1,
    density: typeof raw.density === "number" ? raw.density : 0.65,
    diversity: typeof raw.diversity === "number" ? raw.diversity : 0.75,
    targetVerticesPerChunk: typeof raw.targetVerticesPerChunk === "number" ? raw.targetVerticesPerChunk : 250000,
    entries,
  };
};

const normalizeBiomeMixRegistry = (raw: unknown, worldId: string): TellusBiomeMixRegistry => {
  const empty: TellusBiomeMixRegistry = {
    version: 1,
    worldId,
    updatedAt: new Date(0).toISOString(),
    mixesByTerrainPaint: {},
    mixesByEcologyBiome: {},
  };
  if (!isRecord(raw) || raw.version !== 1) return empty;
  const mixesByTerrainPaint: Partial<Record<TerrainPaintKind, TellusBiomeMixDefinition>> = {};
  const terrainRecord = isRecord(raw.mixesByTerrainPaint) ? raw.mixesByTerrainPaint : {};
  for (const [paint, value] of Object.entries(terrainRecord)) {
    const mix = normalizeBiomeMixDefinition(value);
    if (mix) mixesByTerrainPaint[paint as TerrainPaintKind] = mix;
  }
  const mixesByEcologyBiome: Partial<Record<EcologyBiomeId, TellusBiomeMixDefinition>> = {};
  const ecologyRecord = isRecord(raw.mixesByEcologyBiome) ? raw.mixesByEcologyBiome : {};
  for (const [biome, value] of Object.entries(ecologyRecord)) {
    const mix = normalizeBiomeMixDefinition(value);
    if (mix) mixesByEcologyBiome[biome as EcologyBiomeId] = mix;
  }
  return {
    version: 1,
    worldId: typeof raw.worldId === "string" ? raw.worldId : worldId,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
    mixesByTerrainPaint,
    mixesByEcologyBiome,
  };
};

export const loadActiveBiomeMixRegistryForWorld = (worldId: string): TellusBiomeMixRegistry => {
  if (typeof window === "undefined") return normalizeBiomeMixRegistry(null, worldId);
  try {
    const raw = window.localStorage.getItem(activeBiomeMixStorageKey(worldId));
    return normalizeBiomeMixRegistry(raw ? JSON.parse(raw) : null, worldId);
  } catch (error) {
    console.warn("Tellus biome mix load failed", error);
    return normalizeBiomeMixRegistry(null, worldId);
  }
};

export const saveActiveBiomeMixForWorld = (
  worldId: string,
  mix: TellusBiomeMixDefinition,
): TellusBiomeMixRegistry | null => {
  const normalized = normalizeBiomeMixDefinition(mix);
  if (!normalized || typeof window === "undefined") return null;
  const registry = loadActiveBiomeMixRegistryForWorld(worldId);
  const targetPaint = biomeMixTargetTerrainPaint(normalized);
  if (targetPaint) registry.mixesByTerrainPaint[targetPaint] = normalized;
  if (normalized.ecologyBiome) registry.mixesByEcologyBiome[normalized.ecologyBiome] = normalized;
  registry.worldId = worldId;
  registry.updatedAt = new Date().toISOString();
  try {
    window.localStorage.setItem(activeBiomeMixStorageKey(worldId), JSON.stringify(registry));
    window.dispatchEvent(new CustomEvent(BIOME_MIX_STORAGE_EVENT, {
      detail: { worldId, targetPaint, ecologyBiome: normalized.ecologyBiome, mix: normalized },
    }));
    return registry;
  } catch (error) {
    console.warn("Tellus biome mix save failed", error);
    return null;
  }
};

export const applyActiveBiomeMixRegistryForWorld = (
  worldId: string,
  rawRegistry: unknown,
): TellusBiomeMixRegistry => {
  const registry = normalizeBiomeMixRegistry(rawRegistry, worldId);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(activeBiomeMixStorageKey(worldId), JSON.stringify(registry));
      window.dispatchEvent(new CustomEvent(BIOME_MIX_STORAGE_EVENT, {
        detail: { worldId, registry },
      }));
    } catch (error) {
      console.warn("Tellus biome mix cache failed", error);
    }
  }
  return registry;
};

const biomeMixServerHeaders = (): HeadersInit => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const session = getSession();
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  return headers;
};

const biomeMixWorldMetadataUrl = (worldId: string): string =>
  worldApiUrl(`/api/tellus/worlds/${encodeURIComponent(worldId)}?userId=${encodeURIComponent(tellusUserId())}`);

export const loadActiveBiomeMixRegistryFromServer = async (
  worldId: string,
): Promise<TellusBiomeMixRegistry | null> => {
  if (!runtimeConfig.worldApiBase || typeof window === "undefined") return null;
  try {
    const response = await fetch(biomeMixWorldMetadataUrl(worldId), {
      headers: biomeMixServerHeaders(),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const raw = await response.json().catch(() => null) as unknown;
    if (!isRecord(raw)) return null;
    const activeBiomeMixes = raw.activeBiomeMixes ?? raw.active_biome_mixes;
    if (activeBiomeMixes === undefined || activeBiomeMixes === null) return null;
    return applyActiveBiomeMixRegistryForWorld(worldId, activeBiomeMixes);
  } catch (error) {
    console.warn("Tellus biome mix server load failed", error);
    return null;
  }
};

export const saveActiveBiomeMixRegistryToServer = async (
  registry: TellusBiomeMixRegistry,
): Promise<boolean> => {
  if (!runtimeConfig.worldApiBase || typeof window === "undefined") return false;
  try {
    const response = await fetch(biomeMixWorldMetadataUrl(registry.worldId), {
      method: "PATCH",
      headers: biomeMixServerHeaders(),
      body: JSON.stringify({ activeBiomeMixes: registry }),
    });
    return response.ok;
  } catch (error) {
    console.warn("Tellus biome mix server save failed", error);
    return false;
  }
};
