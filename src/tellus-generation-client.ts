import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type {
  AssetForgePipelineStart,
  AssetForgePipelineStatus,
  AssetLibraryModel,
  AssetLibraryResponse,
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
  const raw =
    record.animationClips ??
    record.animation_clips ??
    record.animations ??
    record.animation_metadata ??
    record.animationMetadata;
  if (!Array.isArray(raw)) return undefined;
  const clips = raw
    .map(parseAnimationMetadata)
    .filter((clip): clip is AssetAnimationMetadata => clip !== null);
  return clips.length > 0 ? clips : undefined;
};

export async function browseAssetLibrary(
  search: string,
  page: number,
  sort: AssetBrowseSort = "newest",
  perPage = 24,
  category = "",
): Promise<AssetBrowseResult> {
  if (!runtimeConfig.worldApiBase) return { models: [], hasNext: false, total: 0 };
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage), sort });
  // A typed search overrides the category seed; otherwise filter by the store's real asset_category
  // (flora / fauna / building / environment / material) for precise, on-topic results.
  if (search.trim()) params.set("search", search.trim());
  else if (category.trim()) params.set("category", category.trim());
  const response = await fetch(tellusAssetLibraryUrl(`/api/assets/models/browse?${params.toString()}`), {
    cache: "no-store",
  });
  if (!response.ok) return { models: [], hasNext: false, total: 0 };
  const parsed = await readJsonResponse<{
    has_next?: boolean;
    total?: number;
    models?: Array<Record<string, unknown>>;
  }>(response);
  const models: AssetLibraryModel[] = (Array.isArray(parsed.models) ? parsed.models : [])
    .filter(
      (m): m is Record<string, unknown> & { id: string; name: string } =>
        typeof m.id === "string" && typeof m.name === "string",
    )
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.name,
      file_format: typeof m.file_format === "string" ? m.file_format : undefined,
      download_count: typeof m.download_count === "number" ? m.download_count : undefined,
      hasThumbnail: m.has_thumbnail === true,
      hasGameOptimized: m.has_game_optimized === true,
      // The store's `viewable` flag means conversion finished and a renderable view URL exists.
      // Cards omitting it (older store builds) are treated as viewable to avoid hiding everything.
      viewable: m.viewable !== false,
      tags: Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === "string") : undefined,
      animationClips: parseAnimationMetadataList(m),
      source: "asset-library" as const,
    }))
    // Keep the catalog in sync with what the store can actually serve: drop cards the store can't
    // render, so a click never tries to load a GLB that 404s (the "don't serve assets that aren't
    // there" guarantee).
    .filter((m) => m.viewable);
  return {
    models,
    hasNext: parsed.has_next === true,
    total: typeof parsed.total === "number" ? parsed.total : models.length,
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
