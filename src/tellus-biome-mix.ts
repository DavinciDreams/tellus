import {
  biomePatchesForEcologyBiome,
  biomePatchesForPaint,
  ECOLOGY_TERRAIN_PAINT_MAP,
  environmentForBiomePatch,
  genomeForBiomePatch,
  type ProcPlantBiomePatch,
} from "./tellus-procplant-biomes";
import * as THREE from "three";
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
export type TellusBiomeAssetLodPreference = "game-optimized" | "lod0" | "lod1" | "lod2" | "lod3" | "impostor";

export interface TellusBiomeMixEntry {
  id: string;
  label: string;
  source: "preset" | "mutation" | "asset" | "ez-tree";
  presetId?: string;
  genome?: ProcPlantGenome;
  ezTree?: {
    preset: string;
    kind: "pine" | "oak" | "aspen" | "ash" | "willow" | "bush";
    barkColor?: number;
    leafColor?: number;
    foliage?: number;
    spread?: number;
    droop?: number;
    gnarliness?: number;
    textures?: boolean;
  };
  asset?: {
    kind: "glb";
    name: string;
    libraryId?: string;
    lodPreference?: TellusBiomeAssetLodPreference;
    color?: number;
    runtimeOnly?: boolean;
    template?: TellusBiomeAssetTemplate;
  };
  weight: number;
  density: number;
  scale: number;
  grassHeight?: number;
  grassSpread?: number;
  grassLean?: number;
  environment: ProcPlantEnvironment;
  seed: number;
  enabled: boolean;
}

export interface TellusBiomeAssetTemplate {
  version: 1;
  vertexCount: number;
  positions: number[];
  normals: number[];
  colors: number[];
  indices: number[];
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

export interface PersistedTellusBiomeMixRegistryV2 {
  version: 2;
  worldId: string;
  updatedAt: string;
  mixes: TellusBiomeMixDefinition[];
  terrainPaintMixIndexes: Partial<Record<TerrainPaintKind, number>>;
  ecologyBiomeMixIndexes: Partial<Record<EcologyBiomeId, number>>;
}

/**
 * A stable description of the biome mix inputs that can change rendered
 * vegetation. Server timestamps and hydrated geometry are deliberately
 * excluded: neither represents a new mix, and comparing them used to make
 * the periodic server refresh rebuild every active procplant chunk.
 */
export const biomeMixRenderSignature = (registry: TellusBiomeMixRegistry): string =>
  JSON.stringify(registry, (key, value) =>
    key === "updatedAt" || key === "template" ? undefined : value
  );

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
  if (entry.ezTree) return genomeFromEzTreeEntry(entry);
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
): TellusBiomeMixEntry => patch.asset
  ? {
      id: `${patch.primary}-${index + 1}`,
      label: labelForProcPlantId(patch.primary),
      source: "asset",
      asset: {
        kind: "glb",
        name: labelForProcPlantId(patch.primary),
        libraryId: patch.asset.libraryId,
        lodPreference: patch.asset.lodPreference,
        color: patch.asset.color,
        runtimeOnly: false,
      },
      weight: Math.max(0.01, "weight" in patch ? Number(patch.weight) || 1 : 1),
      density: patch.density,
      scale: patch.scale,
      environment: environmentForBiomePatch(patch),
      seed: patch.seed,
      enabled: true,
    }
  : {
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
    };

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

const cloneGenome = (genome: ProcPlantGenome): ProcPlantGenome =>
  typeof structuredClone === "function"
    ? structuredClone(genome)
    : JSON.parse(JSON.stringify(genome)) as ProcPlantGenome;

const ezTreeKind = (value: unknown): NonNullable<TellusBiomeMixEntry["ezTree"]>["kind"] => {
  if (
    value === "oak" ||
    value === "aspen" ||
    value === "ash" ||
    value === "willow" ||
    value === "bush"
  ) {
    return value;
  }
  return "pine";
};

const normalizeEzTree = (entry: Record<string, unknown>): TellusBiomeMixEntry["ezTree"] | undefined => {
  if (!isRecord(entry.ezTree) || typeof entry.ezTree.preset !== "string") return undefined;
  return {
    preset: entry.ezTree.preset,
    kind: ezTreeKind(entry.ezTree.kind),
    barkColor: typeof entry.ezTree.barkColor === "number" ? entry.ezTree.barkColor : undefined,
    leafColor: typeof entry.ezTree.leafColor === "number" ? entry.ezTree.leafColor : undefined,
    foliage: typeof entry.ezTree.foliage === "number" ? entry.ezTree.foliage : undefined,
    spread: typeof entry.ezTree.spread === "number" ? entry.ezTree.spread : undefined,
    droop: typeof entry.ezTree.droop === "number" ? entry.ezTree.droop : undefined,
    gnarliness: typeof entry.ezTree.gnarliness === "number" ? entry.ezTree.gnarliness : undefined,
    textures: entry.ezTree.textures !== false,
  };
};

const normalizeAssetLodPreference = (value: unknown): TellusBiomeAssetLodPreference | undefined => {
  if (
    value === "game-optimized" ||
    value === "lod0" ||
    value === "lod1" ||
    value === "lod2" ||
    value === "lod3" ||
    value === "impostor"
  ) {
    return value;
  }
  return undefined;
};

const genomeFromEzTreeEntry = (entry: Pick<TellusBiomeMixEntry, "id" | "label" | "seed" | "ezTree">): ProcPlantGenome => {
  const ezTree = entry.ezTree;
  const kind = ezTree?.kind ?? "pine";
  const baseId = kind === "pine"
    ? "alpineFir"
    : kind === "aspen"
      ? "birchGrove"
      : kind === "willow"
        ? "willowDrapes"
        : kind === "bush"
          ? "raspberryShrub"
          : "oakCanopy";
  const base = cloneGenome(procPlantPresets[baseId] ?? procPlantPresets.oakCanopy);
  const foliage = Math.max(0, ezTree?.foliage ?? 1);
  const spread = Math.max(0.2, ezTree?.spread ?? 1);
  const droop = Math.max(0, ezTree?.droop ?? (kind === "willow" ? 1 : 0));
  const gnarliness = Math.max(0, ezTree?.gnarliness ?? 1);
  base.id = `ezTree-${slug(entry.id || entry.label || ezTree?.preset || kind)}`;
  base.habit = kind === "pine" ? "conifer" : kind === "bush" ? "shrub" : "tree";
  base.weberPenn = undefined;
  base.branchModules = {
    palette: kind === "pine"
      ? "excurrent-conifer"
      : kind === "willow"
        ? "weeping"
        : kind === "bush"
          ? "shrub"
          : "decurrent-broadleaf",
    moduleBudget: Math.round(THREE.MathUtils.clamp(88 * foliage, 28, 220)),
    levels: kind === "bush" ? 3 : 4,
    vigor: THREE.MathUtils.clamp(0.9 + foliage * 0.2, 0.25, 2.2),
    branchDensity: THREE.MathUtils.clamp(kind === "pine" ? 0.95 * foliage : 1.15 * foliage, 0.15, 3),
    branchAngle: THREE.MathUtils.clamp(kind === "pine" ? 0.78 : kind === "willow" ? 0.58 : 1.08, 0.25, 1.75),
    spread: THREE.MathUtils.clamp(spread, 0.25, 2),
    droop: THREE.MathUtils.clamp(droop, 0, 2),
    tropism: kind === "pine" ? 0.72 : 0.48,
    gnarliness: THREE.MathUtils.clamp(0.24 * gnarliness, 0, 1.6),
    collisionBias: 0.45,
    junctionBlend: kind === "pine" ? 0.24 : 0.58,
    foliageSource: kind === "pine" ? "conifer-spray" : "procplants",
    barkColor: ezTree?.barkColor ?? (kind === "pine" ? 0x6a5132 : 0x6b4a2c),
    leafColor: ezTree?.leafColor ?? (kind === "pine" ? 0x5f8461 : kind === "willow" ? 0x7fa05c : 0x6f9a45),
  };
  base.foliage = {
    mass: THREE.MathUtils.clamp(0.7 * foliage, 0.1, 2),
    clusterDensity: THREE.MathUtils.clamp(1.05 * foliage, 0.2, 2.4),
    whorlDensity: THREE.MathUtils.clamp(0.42 * spread, 0, 1.6),
    tipBias: kind === "pine" ? 0.72 : 0.56,
    size: kind === "pine" ? 0.32 : 0.58,
  };
  base.treeRealism = {
    crownSpread: kind === "pine" ? 0.38 * spread : 0.62 * spread,
    crownTaper: kind === "pine" ? 0.82 : 0.36,
    trunkFlare: 0.34,
    trunkBend: kind === "willow" ? 0.22 : 0.14,
    branchGnarl: THREE.MathUtils.clamp(0.18 * gnarliness, 0, 0.9),
    windFlex: 0.48,
    colorVariance: 0.14,
  };
  base.leaf.colorA = ezTree?.leafColor ?? base.leaf.colorA;
  return base;
};

export const normalizeBiomeMixDefinition = (raw: unknown): TellusBiomeMixDefinition | null => {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.entries)) return null;
  const entries = raw.entries
    .map((entry): TellusBiomeMixEntry | null => {
      if (!isRecord(entry)) return null;
      const source = entry.source === "asset"
        ? "asset"
        : entry.source === "ez-tree"
          ? "ez-tree"
          : entry.source === "mutation"
            ? "mutation"
            : "preset";
      const presetId = typeof entry.presetId === "string" ? entry.presetId : undefined;
      const genome = isRecord(entry.genome) ? (entry.genome as unknown as ProcPlantGenome) : undefined;
      const ezTree = normalizeEzTree(entry);
      const asset = isRecord(entry.asset) && entry.asset.kind === "glb" && typeof entry.asset.name === "string"
        ? (() => {
          return {
          kind: "glb" as const,
          name: entry.asset.name,
          libraryId: typeof entry.asset.libraryId === "string" ? entry.asset.libraryId : undefined,
          lodPreference: normalizeAssetLodPreference(entry.asset.lodPreference),
          color: typeof entry.asset.color === "number" ? entry.asset.color : undefined,
          runtimeOnly: entry.asset.runtimeOnly !== false,
          template: normalizeBiomeAssetTemplate(entry.asset.template),
          };
        })()
        : undefined;
      if (source === "asset" && !asset) return null;
      if (source === "ez-tree" && !ezTree && !genome) return null;
      if (source !== "asset" && source !== "ez-tree" && !genome && (!presetId || !procPlantPresets[presetId])) return null;
      const normalizedGenome = genome ?? (source === "ez-tree" ? genomeFromEzTreeEntry({
        id: typeof entry.id === "string" ? entry.id : "ez-tree",
        label: typeof entry.label === "string" ? entry.label : "EZ Tree",
        seed: typeof entry.seed === "number" ? entry.seed : 1,
        ezTree,
      }) : undefined);
      return {
        id: typeof entry.id === "string" ? entry.id : slug(presetId ?? normalizedGenome?.id ?? ezTree?.preset ?? "entry"),
        label: typeof entry.label === "string" ? entry.label : labelForProcPlantId(presetId ?? normalizedGenome?.id ?? ezTree?.preset ?? "Plant"),
        source,
        presetId,
        genome: normalizedGenome,
        ezTree,
        asset,
        weight: typeof entry.weight === "number" ? entry.weight : 1,
        density: typeof entry.density === "number" ? entry.density : 0.45,
        scale: typeof entry.scale === "number" ? entry.scale : 1,
        grassHeight: typeof entry.grassHeight === "number" ? entry.grassHeight : undefined,
        grassSpread: typeof entry.grassSpread === "number" ? entry.grassSpread : undefined,
        grassLean: typeof entry.grassLean === "number" ? entry.grassLean : undefined,
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

const normalizeNumberArray = (value: unknown, maxLength: number): number[] | undefined => {
  if (!Array.isArray(value) || value.length > maxLength) return undefined;
  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isFinite(item)) return undefined;
    out.push(item);
  }
  return out;
};

const normalizeBiomeAssetTemplate = (value: unknown): TellusBiomeAssetTemplate | undefined => {
  if (!isRecord(value) || value.version !== 1 || typeof value.vertexCount !== "number") return undefined;
  const vertexCount = Math.floor(value.vertexCount);
  if (vertexCount <= 0 || vertexCount > 20000) return undefined;
  const positions = normalizeNumberArray(value.positions, vertexCount * 3);
  const normals = normalizeNumberArray(value.normals, vertexCount * 3);
  const colors = normalizeNumberArray(value.colors, vertexCount * 3);
  const indices = normalizeNumberArray(value.indices, vertexCount * 6);
  if (
    !positions ||
    !normals ||
    !colors ||
    !indices ||
    positions.length !== vertexCount * 3 ||
    normals.length !== vertexCount * 3 ||
    colors.length !== vertexCount * 3 ||
    indices.length === 0
  ) {
    return undefined;
  }
  return { version: 1, vertexCount, positions, normals, colors, indices };
};

export const compactBiomeMixDefinitionForPersistence = (
  raw: TellusBiomeMixDefinition,
): TellusBiomeMixDefinition | null => {
  const normalized = normalizeBiomeMixDefinition(raw);
  if (!normalized) return null;
  const entries = normalized.entries
    .filter((entry) => !isAssetMixEntry(entry) || entry.asset.runtimeOnly !== true)
    .map((entry) => isAssetMixEntry(entry)
      ? { ...entry, asset: { ...entry.asset, template: undefined, runtimeOnly: false } }
      : entry);
  return entries.length > 0 ? { ...normalized, entries } : null;
};

export const serializeBiomeMixRegistryForPersistence = (
  registry: TellusBiomeMixRegistry,
): PersistedTellusBiomeMixRegistryV2 => {
  const mixes: TellusBiomeMixDefinition[] = [];
  const indexesBySignature = new Map<string, number>();
  const addMix = (mix: TellusBiomeMixDefinition | undefined): number | undefined => {
    if (!mix) return undefined;
    const compact = compactBiomeMixDefinitionForPersistence(mix);
    if (!compact) return undefined;
    const signature = JSON.stringify(compact);
    const existing = indexesBySignature.get(signature);
    if (existing !== undefined) return existing;
    const index = mixes.length;
    mixes.push(compact);
    indexesBySignature.set(signature, index);
    return index;
  };
  const terrainPaintMixIndexes: PersistedTellusBiomeMixRegistryV2["terrainPaintMixIndexes"] = {};
  for (const [paint, mix] of Object.entries(registry.mixesByTerrainPaint)) {
    const index = addMix(mix);
    if (index !== undefined) terrainPaintMixIndexes[paint as TerrainPaintKind] = index;
  }
  const ecologyBiomeMixIndexes: PersistedTellusBiomeMixRegistryV2["ecologyBiomeMixIndexes"] = {};
  for (const [biome, mix] of Object.entries(registry.mixesByEcologyBiome)) {
    const index = addMix(mix);
    if (index !== undefined) ecologyBiomeMixIndexes[biome as EcologyBiomeId] = index;
  }
  return {
    version: 2,
    worldId: registry.worldId,
    updatedAt: registry.updatedAt,
    mixes,
    terrainPaintMixIndexes,
    ecologyBiomeMixIndexes,
  };
};

export const normalizeBiomeMixRegistry = (raw: unknown, worldId: string): TellusBiomeMixRegistry => {
  const empty: TellusBiomeMixRegistry = {
    version: 1,
    worldId,
    updatedAt: new Date(0).toISOString(),
    mixesByTerrainPaint: {},
    mixesByEcologyBiome: {},
  };
  if (!isRecord(raw) || (raw.version !== 1 && raw.version !== 2)) return empty;
  if (raw.version === 2) {
    const mixes = Array.isArray(raw.mixes)
      ? raw.mixes.map(normalizeBiomeMixDefinition)
      : [];
    const mixesByTerrainPaint: TellusBiomeMixRegistry["mixesByTerrainPaint"] = {};
    const terrainIndexes = isRecord(raw.terrainPaintMixIndexes) ? raw.terrainPaintMixIndexes : {};
    for (const [paint, value] of Object.entries(terrainIndexes)) {
      const mix = typeof value === "number" ? mixes[value] : null;
      if (mix) mixesByTerrainPaint[paint as TerrainPaintKind] = mix;
    }
    const mixesByEcologyBiome: TellusBiomeMixRegistry["mixesByEcologyBiome"] = {};
    const ecologyIndexes = isRecord(raw.ecologyBiomeMixIndexes) ? raw.ecologyBiomeMixIndexes : {};
    for (const [biome, value] of Object.entries(ecologyIndexes)) {
      const mix = typeof value === "number" ? mixes[value] : null;
      if (mix) mixesByEcologyBiome[biome as EcologyBiomeId] = mix;
    }
    return {
      version: 1,
      worldId: typeof raw.worldId === "string" ? raw.worldId : worldId,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
      mixesByTerrainPaint,
      mixesByEcologyBiome,
    };
  }
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
  const normalized = compactBiomeMixDefinitionForPersistence(mix);
  if (!normalized || typeof window === "undefined") return null;
  const registry = loadActiveBiomeMixRegistryForWorld(worldId);
  const targetPaint = biomeMixTargetTerrainPaint(normalized);
  if (targetPaint) registry.mixesByTerrainPaint[targetPaint] = normalized;
  if (normalized.ecologyBiome) registry.mixesByEcologyBiome[normalized.ecologyBiome] = normalized;
  registry.worldId = worldId;
  registry.updatedAt = new Date().toISOString();
  try {
    window.localStorage.setItem(
      activeBiomeMixStorageKey(worldId),
      JSON.stringify(serializeBiomeMixRegistryForPersistence(registry)),
    );
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
      window.localStorage.setItem(
        activeBiomeMixStorageKey(worldId),
        JSON.stringify(serializeBiomeMixRegistryForPersistence(registry)),
      );
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
      body: JSON.stringify({ activeBiomeMixes: serializeBiomeMixRegistryForPersistence(registry) }),
    });
    return response.ok;
  } catch (error) {
    console.warn("Tellus biome mix server save failed", error);
    return false;
  }
};
