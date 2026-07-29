import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type {
  AssetForgePipelineStart,
  AssetForgePipelineStatus,
  AssetLodLevelSummary,
  AssetLodSummary,
  AssetLodVariant,
  AssetLibraryModel,
  AssetLibraryResponse,
  AssetMeshStats,
  DirectGenerationProvider,
  DirectGenerationResponse,
  GeneratedAssetManifestEntry,
  GeneratedThing,
  GenerationProvider,
} from "./tellus-types";
import { PIXEL3D_PROVIDER } from "./tellus-constants";
import { extractErrorMessage, readJsonResponse } from "./tellus-utils";
import { runtimeConfig } from "./tellus-runtime-config";
import {
  absoluteAssetForgeUrl,
  assetStoreGameOptimizedModelUrl,
  absoluteTellusApiUrl,
  tellusApiUrl,
  tellusAssetLibraryUrl,
  toAssetId,
} from "./tellus-urls-identity";
import { normalizeAnimationIntent, type AnimationActorKind, type AssetAnimationMetadata } from "./tellus-animation-intents";
import { normalizeAssetImpostorVariant } from "./tellus-asset-impostor";

export const gltfObjectCache = new Map<string, Promise<THREE.Object3D>>();
export const dracoLoader = new DRACOLoader().setDecoderPath(
  "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
);

// KTX2/Basis textures (KHR_texture_basisu) — the asset store's game-optimized GLBs compress their
// textures to KTX2, so without this loader any TEXTURED game-optimized model fails to parse
// (untextured ones only need meshopt). Transcoder wasm is self-hosted under /basis/; the loader
// must learn the GPU's transcode targets once the renderer exists — main.tsx calls
// configureKtx2Support(renderer) right after renderer init (async-aware for WebGPURenderer).
export const ktx2Loader = new KTX2Loader().setTranscoderPath("/basis/");

// Texture-failure tracking: a transient KTX2/texture failure is NON-fatal to GLTFLoader (the model
// resolves with broken materials), which would otherwise poison the per-session model cache — every
// re-placement of that model reuses the broken scene. The loader manager reports failures here and
// loadGeneratedGltfObject declines to cache loads that had one, so the next placement retries fresh.
let lastTextureErrorAt = 0;
export const textureErrorSince = (sinceMs: number): boolean => lastTextureErrorAt > sinceMs;

/** Model URLs whose last load had texture failures — consumers retry these (bounded) so a transient
 * KTX2/worker blip during the initial world-load burst doesn't leave models untextured all session. */
export const textureFailedModelUrls = new Set<string>();
const noteTextureLoadFailure = (url: unknown): void => {
  lastTextureErrorAt = Date.now();
  console.warn("[assets] texture failed to load (will retry on next placement):", String(url).slice(0, 120));
};

const gltfManager = new THREE.LoadingManager();
gltfManager.onError = noteTextureLoadFailure;

{
  const ktx2Manager = new THREE.LoadingManager();
  ktx2Manager.onError = noteTextureLoadFailure;
  ktx2Loader.manager = ktx2Manager;
}

export function configureKtx2Support(renderer: unknown): void {
  try {
    // Plain detectSupport works for BOTH renderers in r183 — main.tsx already awaits renderer.init()
    // on the WebGPU path before calling this.
    ktx2Loader.detectSupport(renderer as THREE.WebGLRenderer);
  } catch (error) {
    console.warn("KTX2 support detection failed — textured game-optimized models may not load", error);
  }
}

export function createGltfLoader(): GLTFLoader {
  return new GLTFLoader(gltfManager)
    .register(() => ({
      // Legacy glTF 1/early-2 material model. Three no longer implements it, but some skybox/store
      // assets still mark it required even though the PBR fallback renders acceptably.
      name: "KHR_materials_pbrSpecularGlossiness",
    }))
    .setDRACOLoader(dracoLoader)
    .setKTX2Loader(ktx2Loader)
    .setMeshoptDecoder(MeshoptDecoder);
}

// Server-side search + pagination over the 3D Asset Manager's browse feed (proxied through Hyades:
// /api/assets/models/browse -> {store}/api/models/browse). Cards carry thumbnail/game-optimized flags.
export interface AssetBrowseResult {
  models: AssetLibraryModel[];
  hasNext: boolean;
  total: number;
}

export type AssetBrowseSort = "newest" | "oldest" | "downloads" | "name";

const stringField = (record: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const numberField = (record: Record<string, unknown>, ...keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

const booleanField = (record: Record<string, unknown>, ...keys: string[]): boolean | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
};

const numberArrayField = (record: Record<string, unknown>, ...keys: string[]): number[] | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const numbers = value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
      if (numbers.length > 0) return numbers;
    }
  }
  return undefined;
};

const stringArrayField = (record: Record<string, unknown>, ...keys: string[]): string[] | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      if (strings.length > 0) return strings.map((item) => item.trim());
    }
  }
  return undefined;
};

const parseMeshStats = (raw: unknown): AssetMeshStats | undefined => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const stats: AssetMeshStats = {
    primitives: numberField(record, "primitives", "primitive_count", "primitiveCount"),
    triangles: numberField(record, "triangles", "triangle_count", "triangleCount"),
    vertices: numberField(record, "vertices", "vertex_count", "vertexCount"),
  };
  return Object.values(stats).some((value) => value !== undefined) ? stats : undefined;
};

const parseLodLevelSummary = (raw: unknown): AssetLodLevelSummary | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const level = numberField(record, "level");
  if (level === undefined) return null;
  return {
    level,
    recommended_use: stringField(record, "recommended_use", "recommendedUse"),
    size: numberField(record, "size"),
    size_mb: numberField(record, "size_mb", "sizeMb"),
    triangles: numberField(record, "triangles", "triangle_count", "triangleCount"),
    vertices: numberField(record, "vertices", "vertex_count", "vertexCount"),
  };
};

const parseLodSummary = (raw: unknown): AssetLodSummary | undefined => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const levelsRaw = record.levels;
  const levels = Array.isArray(levelsRaw)
    ? levelsRaw.map(parseLodLevelSummary).filter((level): level is AssetLodLevelSummary => level !== null)
    : undefined;
  const summary: AssetLodSummary = {
    cheapest_level: numberField(record, "cheapest_level", "cheapestLevel"),
    cheapest_size: numberField(record, "cheapest_size", "cheapestSize"),
    cheapest_size_mb: numberField(record, "cheapest_size_mb", "cheapestSizeMb"),
    cheapest_triangles: numberField(record, "cheapest_triangles", "cheapestTriangles"),
    cheapest_vertices: numberField(record, "cheapest_vertices", "cheapestVertices"),
    levels: levels && levels.length > 0 ? levels : undefined,
    missing_levels: numberArrayField(record, "missing_levels", "missingLevels"),
    ready: booleanField(record, "ready"),
    recommended_use: stringField(record, "recommended_use", "recommendedUse"),
    status: stringField(record, "status"),
  };
  return Object.values(summary).some((value) => value !== undefined) ? summary : undefined;
};

const parseLodVariant = (raw: unknown): AssetLodVariant | null => {
  const base = parseLodLevelSummary(raw);
  if (!base) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const record = raw as Record<string, unknown>;
  return {
    ...base,
    file_format: stringField(record, "file_format", "fileFormat"),
    status: stringField(record, "status"),
    url: stringField(record, "url"),
    download_url: stringField(record, "download_url", "downloadUrl"),
    mesh_stats: parseMeshStats(record.mesh_stats ?? record.meshStats),
  };
};

const parseLodVariants = (raw: unknown): AssetLodVariant[] | undefined => {
  if (!Array.isArray(raw)) return undefined;
  const variants = raw.map(parseLodVariant).filter((variant): variant is AssetLodVariant => variant !== null);
  return variants.length > 0 ? variants : undefined;
};

const parseAnimationMetadata = (raw: unknown): AssetAnimationMetadata | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const name = stringField(record, "name", "clipName", "clip_name", "animation", "animationName");
  if (!name) return null;
  const actorKindRaw = stringField(record, "actorKind", "actor_kind");
  const actorKind = (
    actorKindRaw && ["avatar", "agent", "animal", "mount", "vehicle", "object"].includes(actorKindRaw)
      ? actorKindRaw
      : undefined
  ) as AnimationActorKind | undefined;
  const intents = stringArrayField(record, "intents", "intent_tags", "intentTags")
    ?.map((intent) => normalizeAnimationIntent(intent))
    .filter((intent): intent is NonNullable<typeof intent> => intent !== null);
  const qualityRaw = record.quality;
  const quality =
    qualityRaw && typeof qualityRaw === "object" && !Array.isArray(qualityRaw)
      ? {
          score: numberField(qualityRaw as Record<string, unknown>, "score"),
          issues: stringArrayField(qualityRaw as Record<string, unknown>, "issues"),
        }
      : undefined;
  return {
    id: stringField(record, "id", "clipId", "clip_id"),
    assetId: stringField(record, "assetId", "asset_id", "modelId", "model_id"),
    name,
    aliases: stringArrayField(record, "aliases", "tags", "keywords"),
    format: stringField(record, "format", "fileFormat", "file_format"),
    actorKind,
    skeletonProfile: stringField(record, "skeletonProfile", "skeleton_profile"),
    intents,
    category: stringField(record, "category"),
    loop: booleanField(record, "loop", "loops", "isLoop", "is_loop"),
    durationSeconds: numberField(record, "durationSeconds", "duration_seconds", "duration"),
    rootMotion: stringField(record, "rootMotion", "root_motion"),
    speedMetersPerSecond: numberField(record, "speedMetersPerSecond", "speed_meters_per_second", "speed"),
    direction: stringField(record, "direction"),
    gait: stringField(record, "gait"),
    quality,
    searchText: stringField(record, "searchText", "search_text"),
  };
};

const parseAnimationMetadataList = (record: Record<string, unknown>): AssetAnimationMetadata[] | undefined => {
  const runtimeMetadata = record.runtime_metadata ?? record.runtimeMetadata;
  const runtimeRecord = runtimeMetadata && typeof runtimeMetadata === "object" && !Array.isArray(runtimeMetadata)
    ? runtimeMetadata as Record<string, unknown>
    : undefined;
  const raw =
    record.animationClips ??
    record.animation_clips ??
    record.animations ??
    record.animation_metadata ??
    record.animationMetadata ??
    runtimeRecord?.animations ??
    runtimeRecord?.animation_clips;
  if (!Array.isArray(raw)) return undefined;
  const clips = raw
    .map(parseAnimationMetadata)
    .filter((clip): clip is AssetAnimationMetadata => clip !== null);
  return clips.length > 0 ? clips : undefined;
};

const parseAssetLibraryModels = (rawModels: unknown): AssetLibraryModel[] => {
  const models: AssetLibraryModel[] = [];
  for (const m of Array.isArray(rawModels) ? rawModels : []) {
    if (!m || typeof m !== "object" || Array.isArray(m)) continue;
    const record = m as Record<string, unknown>;
    const id = stringField(record, "id", "model_id", "modelId", "asset_id", "assetId");
    const name = stringField(record, "name", "title");
    if (!id || !name) continue;
    const model: AssetLibraryModel = {
        id,
        name,
        description: stringField(record, "description", "summary") ?? name,
        assetCategory: stringField(record, "asset_category", "assetCategory", "category"),
        file_format: stringField(record, "file_format", "fileFormat", "format"),
        file_size: numberField(record, "file_size", "fileSize", "size"),
        effective_file_size: numberField(record, "effective_file_size", "effectiveFileSize"),
        download_count: numberField(record, "download_count", "downloadCount", "downloads"),
        assetStoreModelId: stringField(record, "assetStoreModelId", "asset_store_model_id", "model_id", "modelId"),
        hasThumbnail: booleanField(record, "has_thumbnail", "hasThumbnail"),
        hasGameOptimized: booleanField(record, "has_game_optimized", "hasGameOptimized"),
        // The store's `viewable` flag means conversion finished and a renderable view URL exists.
        // Cards omitting it (older or direct endpoint builds) are treated as viewable to avoid hiding
        // endpoint-backed result sets.
        viewable: record.viewable !== false,
        tags: stringArrayField(record, "tags", "keywords"),
        assetTypes: stringArrayField(record, "asset_types", "assetTypes"),
        animationClips: parseAnimationMetadataList(record),
        effectiveMeshStats: parseMeshStats(record.effective_mesh_stats ?? record.effectiveMeshStats),
        lodReady: booleanField(record, "lod_ready", "lodReady"),
        lodStatus: stringField(record, "lod_status", "lodStatus"),
        lodAvailableLevels: numberArrayField(record, "lod_available_levels", "lodAvailableLevels"),
        lodSummary: parseLodSummary(record.lod_summary ?? record.lodSummary),
        lodVariants: parseLodVariants(record.lod_variants ?? record.lodVariants),
        hasImpostor: booleanField(record, "has_impostor", "hasImpostor"),
        impostor: normalizeAssetImpostorVariant(record.impostor),
        source: "asset-library" as const,
      };
    if (model.viewable !== false) models.push(model);
  }
  return models;
};

const assetModelsFromResponse = (parsed: unknown): unknown => {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  const record = parsed as Record<string, unknown>;
  const models =
    record.models ??
    record.animated_models ??
    record.animatedModels ??
    record.items ??
    record.results ??
    record.data;
  if (models && typeof models === "object" && !Array.isArray(models)) {
    return assetModelsFromResponse(models);
  }
  return models ?? [];
};

async function fetchAssetBrowsePage(
  searchTerm: string,
  page: number,
  sort: AssetBrowseSort,
  perPage: number,
  category: string,
): Promise<AssetBrowseResult> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage), sort });
  // A typed search overrides the category seed; otherwise filter by the store's real
  // asset_category values for precise, on-topic results.
  if (searchTerm) params.set("search", searchTerm);
  else if (category) params.set("category", category);
  const response = await fetch(tellusAssetLibraryUrl(`/api/assets/models/browse?${params.toString()}`), {
    cache: "no-store",
  });
  if (!response.ok) return { models: [], hasNext: false, total: 0 };
  const parsed = await readJsonResponse<{
    has_next?: boolean;
    hasNext?: boolean;
    total?: number;
    count?: number;
    models?: Array<Record<string, unknown>>;
    items?: Array<Record<string, unknown>>;
    results?: Array<Record<string, unknown>>;
    data?: unknown;
  }>(response);
  const models = parseAssetLibraryModels(assetModelsFromResponse(parsed));
  return {
    models,
    hasNext: parsed.has_next === true || parsed.hasNext === true,
    total:
      typeof parsed.total === "number"
        ? parsed.total
        : typeof parsed.count === "number"
          ? parsed.count
          : models.length,
  };
}

async function fetchAnimatedAssetLibraryModels(
  searchTerm: string,
  page: number,
  perPage: number,
  sort: AssetBrowseSort,
): Promise<AssetBrowseResult> {
  const rawModels: unknown[] = [];
  for (let sourcePage = 1; sourcePage <= 10; sourcePage++) {
    const params = new URLSearchParams({ page: String(sourcePage), per_page: "100" });
    const response = await fetch(tellusAssetLibraryUrl(`/api/assets/animated-models?${params.toString()}`), {
      cache: "no-store",
    });
    if (!response.ok) break;
    const parsed = await readJsonResponse<Record<string, unknown>>(response);
    const pageModels = assetModelsFromResponse(parsed);
    if (Array.isArray(pageModels)) rawModels.push(...pageModels);
    const pagination = parsed.pagination;
    const hasNext = pagination && typeof pagination === "object" && !Array.isArray(pagination)
      ? (pagination as Record<string, unknown>).has_next === true
      : false;
    if (!hasNext) break;
  }
  const needle = searchTerm.toLowerCase();
  const allModels = parseAssetLibraryModels(rawModels).filter((model) => {
    const format = model.file_format?.toLowerCase();
    if (format && format !== "glb" && format !== "gltf") return false;
    if (model.assetCategory && model.assetCategory !== "fauna") return false;
    if (!model.animationClips?.length) return false;
    if (!needle) return true;
    const haystack = [model.name, model.description, ...(model.tags ?? [])].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
  if (sort === "name") allModels.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "downloads") {
    allModels.sort((a, b) => (b.download_count ?? 0) - (a.download_count ?? 0));
  }
  const start = Math.max(0, page - 1) * perPage;
  return {
    models: allModels.slice(start, start + perPage),
    hasNext: start + perPage < allModels.length,
    total: allModels.length,
  };
}

export async function browseAssetLibrary(
  search: string,
  page: number,
  sort: AssetBrowseSort = "newest",
  perPage = 24,
  category = "",
): Promise<AssetBrowseResult> {
  if (!runtimeConfig.worldApiBase) return { models: [], hasNext: false, total: 0 };
  const searchTerm = search.trim();
  if (category.trim() === "animated") {
    return fetchAnimatedAssetLibraryModels(searchTerm, page, perPage, sort);
  }
  const categories =
    !searchTerm && category.trim() === "furniture"
      ? ["furniture", "props"]
      : !searchTerm && category.trim()
        ? [category.trim()]
        : [""];
  const pages = await Promise.all(
    categories.map((assetCategory) => fetchAssetBrowsePage(searchTerm, page, sort, perPage, assetCategory)),
  );
  const modelsById = new Map<string, AssetLibraryModel>();
  for (const pageResult of pages) {
    for (const model of pageResult.models) {
      if (!modelsById.has(model.id)) modelsById.set(model.id, model);
    }
  }
  return {
    models: [...modelsById.values()],
    hasNext: pages.some((pageResult) => pageResult.hasNext),
    total: pages.reduce((sum, pageResult) => sum + pageResult.total, 0),
  };
}

export async function loadAssetLibraryModels(): Promise<AssetLibraryModel[]> {
  const [libraryModels, generatedEntries] = await Promise.all([
    (async () => {
      if (!runtimeConfig.worldApiBase) return [];
      const response = await fetch(tellusAssetLibraryUrl("/api/assets/models?per_page=24"), {
        cache: "no-store",
      });
      if (!response.ok) return [];
      const parsed = await readJsonResponse<AssetLibraryResponse>(response);
      return Array.isArray(parsed.models)
        ? parsed.models
            .filter(
              (model): model is AssetLibraryModel =>
                typeof model.id === "string" && typeof model.name === "string",
            )
            .map((model) => ({ ...model, source: "asset-library" as const }))
            .map((model) => ({ ...model, animationClips: parseAnimationMetadataList(model as unknown as Record<string, unknown>) }))
        : [];
    })(),
    generatedAssetManifestEntries().catch(() => []),
  ]);
  const generatedModels = generatedEntries
    .map((entry): AssetLibraryModel | null => {
      if (typeof entry.id !== "string" || typeof entry.modelUrl !== "string") {
        return null;
      }
      const assetStoreModelId =
        typeof entry.assetStoreModelId === "string" && entry.assetStoreModelId.trim()
          ? entry.assetStoreModelId.trim()
          : undefined;
      const modelUrl = assetStoreModelId
        ? assetStoreGameOptimizedModelUrl(assetStoreModelId)
        : entry.modelUrl;
      const prompt =
        typeof entry.prompt === "string" && entry.prompt.trim()
          ? entry.prompt.trim()
          : "generated asset";
      return {
        id: `generated:${entry.id}`,
        name: prompt,
        description: prompt,
        file_format: "glb",
        assetStoreModelId,
        modelUrl: absoluteTellusApiUrl(modelUrl),
        source: "generated",
      };
    })
    .filter((model): model is AssetLibraryModel => model !== null);
  const seen = new Set<string>();
  return [...generatedModels, ...libraryModels].filter((model) => {
    const key = model.modelUrl ?? model.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let generatedAssetManifestCache:
  | {
      loadedAt: number;
      entries: GeneratedAssetManifestEntry[];
      byId: Map<string, string>;
      assetIdsById: Map<string, string>;
    }
  | undefined;

export async function generatedAssetManifestEntries(): Promise<GeneratedAssetManifestEntry[]> {
  const now = Date.now();
  if (generatedAssetManifestCache && now - generatedAssetManifestCache.loadedAt < 5000) {
    return generatedAssetManifestCache.entries;
  }
  const response = await fetch(tellusApiUrl("/generated-assets/manifest.json"), {
    cache: "no-store",
  });
  if (!response.ok) {
    generatedAssetManifestCache = {
      loadedAt: now,
      entries: [],
      byId: new Map<string, string>(),
      assetIdsById: new Map<string, string>(),
    };
    return [];
  }
  const parsed = (await response.json()) as unknown;
  const entries = Array.isArray(parsed)
    ? (parsed as GeneratedAssetManifestEntry[]).filter(
        (entry) =>
          typeof entry.id === "string" &&
          typeof entry.modelUrl === "string",
      )
    : [];
  const byId = new Map<string, string>();
  const assetIdsById = new Map<string, string>();
  for (const entry of entries) {
    const id = entry.id as string;
    const assetStoreModelId =
      typeof entry.assetStoreModelId === "string" && entry.assetStoreModelId.trim()
        ? entry.assetStoreModelId.trim()
        : undefined;
    if (assetStoreModelId) {
      assetIdsById.set(id, assetStoreModelId);
      byId.set(id, assetStoreGameOptimizedModelUrl(assetStoreModelId));
    } else {
      byId.set(id, absoluteTellusApiUrl(entry.modelUrl as string));
    }
  }
  generatedAssetManifestCache = { loadedAt: now, entries, byId, assetIdsById };
  return entries;
}

export async function generatedAssetManifestModelUrls(): Promise<Map<string, string>> {
  await generatedAssetManifestEntries();
  const byId = generatedAssetManifestCache?.byId ?? new Map<string, string>();
  return byId;
}

export async function generatedAssetManifestAssetIds(): Promise<Map<string, string>> {
  await generatedAssetManifestEntries();
  return generatedAssetManifestCache?.assetIdsById ?? new Map<string, string>();
}

export function clearGeneratedAssetManifestCacheForTests(): void {
  generatedAssetManifestCache = undefined;
}

export async function startPixel3DGeneration(
  thing: GeneratedThing,
  signal?: AbortSignal,
): Promise<AssetForgePipelineStart> {
  if (!runtimeConfig.assetForgeApiBase) {
    throw new Error("VITE_ASSET_FORGE_API_BASE is not configured");
  }

  const assetId = toAssetId(thing.prompt, thing.kind);
  const response = await fetch(`${runtimeConfig.assetForgeApiBase}/api/generation/pipeline`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assetId,
      name: thing.prompt.slice(0, 72),
      description: thing.prompt,
      type: thing.kind === "animal" ? "character" : "environment",
      subtype: thing.kind,
      generationType: thing.kind === "animal" ? "avatar" : "model",
      quality: "standard",
      enableRigging: thing.kind === "animal",
      enableRetexturing: false,
      enableSprites: false,
      customPrompts: {
        gameStyle:
          "A tropical island paradise WebGPU floating-world, assets for Tellus should be on white background with only one object each, stylized, game-ready low-poly proportions.",
      },
      metadata: {
        provider: PIXEL3D_PROVIDER,
        useGPT5Enhancement: false,
      },
    }),
  });

  return readJsonResponse<AssetForgePipelineStart>(response);
}

export async function waitForPixel3DModelUrl(
  pipelineId: string,
  signal?: AbortSignal,
): Promise<string> {
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    await new Promise((resolve) => window.setTimeout(resolve, 4000));
    signal?.throwIfAborted();
    const response = await fetch(
      `${runtimeConfig.assetForgeApiBase}/api/generation/pipeline/${pipelineId}`,
      { signal },
    );
    const status = await readJsonResponse<AssetForgePipelineStatus>(response);
    if (status.status === "failed") {
      throw new Error(status.error ?? `Pipeline ${pipelineId} failed`);
    }
    if (status.status === "completed" && status.finalAsset?.modelUrl) {
      return absoluteAssetForgeUrl(status.finalAsset.modelUrl);
    }
  }
  throw new Error(`Pipeline ${pipelineId} timed out`);
}

export function hasExternalGenerationProvider(provider = runtimeConfig.generationProvider): boolean {
  if (provider === "asset-forge") {
    return Boolean(runtimeConfig.assetForgeApiBase);
  }
  return (
    provider === "instantmesh-gradio" ||
    provider === "pixal3d-gradio" ||
    provider === "anigen-gradio"
  );
}

export function isMissingApiRouteError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /\b(404|405)\b/.test(error.message) || error.message.includes("endpoint unavailable");
}

export function generationProviderForThing(thing: GeneratedThing): GenerationProvider {
  if (
    runtimeConfig.generationProvider === "local" ||
    runtimeConfig.generationProvider === "asset-forge"
  ) {
    return runtimeConfig.generationProvider;
  }
  return thing.creatorId === "visitor"
    ? runtimeConfig.playerGenerationProvider
    : runtimeConfig.agentGenerationProvider;
}

export async function startDirectInstantMeshGeneration(
  thing: GeneratedThing,
  provider: DirectGenerationProvider,
  signal?: AbortSignal,
  imageUrl?: string,
): Promise<DirectGenerationResponse> {
  const response = await fetch(tellusApiUrl("/api/generate-3d"), {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: thing.id,
      prompt: thing.prompt,
      kind: thing.kind,
      provider,
      imageUrl: imageUrl?.trim() || undefined,
      instantMeshBaseUrl:
        provider === "instantmesh-gradio"
          ? runtimeConfig.instantMeshTargets[runtimeConfig.instantMeshTarget]
          : undefined,
    }),
  });
  const contentType = response.headers.get("Content-Type") ?? "";
  if ((response.status === 404 || response.status === 405) && !contentType.includes("application/json")) {
    throw new Error("Direct generation endpoint unavailable");
  }
  return readJsonResponse<DirectGenerationResponse>(response);
}

export async function waitForDirectGeneration(
  initial: DirectGenerationResponse,
  signal?: AbortSignal,
  onStatus?: (status: DirectGenerationResponse["status"]) => void,
): Promise<DirectGenerationResponse> {
  if (initial.modelUrl && initial.status !== "failed") return initial;
  const deadline = Date.now() + 22 * 60 * 1000;
  let lastStatus = initial.status;
  // The job runs server-side; a transient poll error (network blip, a pod roll, a momentary CF/route hiccup)
  // must NOT fail the whole generation — keep waiting and only give up after many CONSECUTIVE failures. This
  // was the "generation failed on the UI but actually uploaded" bug: one dropped poll aborted the wait.
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = 12; // ~48s of solid failures before giving up
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    await new Promise((resolve) => window.setTimeout(resolve, 4000));
    signal?.throwIfAborted();
    let status: DirectGenerationResponse;
    try {
      const response = await fetch(
        tellusApiUrl(`/api/generate-3d?jobId=${encodeURIComponent(initial.jobId)}`),
        { signal },
      );
      const contentType = response.headers.get("Content-Type") ?? "";
      if ((response.status === 404 || response.status === 405) && !contentType.includes("application/json")) {
        if (++consecutiveErrors > maxConsecutiveErrors) {
          throw new Error("Direct generation endpoint unavailable");
        }
        continue;
      }
      status = await readJsonResponse<DirectGenerationResponse>(response);
      consecutiveErrors = 0;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (++consecutiveErrors > maxConsecutiveErrors) throw error;
      continue; // transient — the job is still running; poll again
    }
    if (status.status === "failed") {
      throw new Error(status.error ?? `Generation job ${initial.jobId} failed`);
    }
    if (status.status && status.status !== lastStatus) {
      lastStatus = status.status;
      onStatus?.(status.status);
    }
    if (status.modelUrl) return status;
  }
  throw new Error(`Generation job ${initial.jobId} timed out`);
}

export function cancelDirectGeneration(jobId?: string): void {
  if (!jobId) return;
  void fetch(tellusApiUrl(`/api/generate-3d?jobId=${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    keepalive: true,
  }).catch(() => undefined);
}
