// The user-facing avatar catalog (rigged VRM robots + animated GLB animals + the classic TV-head)
// behind the toolbelt Avatar picker, plus the GLB rig that drives the animals from their EMBEDDED
// animation clips. Selection persists in localStorage "tellus.avatarId" and broadcasts over /live
// presence (`avatarId`) so other players see your pick; an absent/unknown selection falls back to
// the existing deterministic per-visitor VRM robot. Every animal in the catalog was verified to
// ship at least an idle-ish AND a walk-ish embedded clip (names listed per entry).
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { runtimeConfig } from "./tellus-runtime-config";
import { createGltfLoader } from "./tellus-generation-client";
import { tellusAssetLibraryUrl } from "./tellus-urls-identity";
import {
  type AvatarRig,
  type RigClipName,
  LocomotionAvatarRig,
  assetDownloadUrl,
  attachVrmAvatar,
  clampAvatarScale,
  classicAvatarRequested,
  mountModelOnAvatar,
  pickAvatarId,
} from "./tellus-vrm-avatar";

export interface AvatarCatalogEntry {
  /** Stable catalog id — what persists locally and rides presence: "classic" | "vrm:<storeId>" | "glb:<storeId>". */
  id: string;
  label: string;
  kind: "classic" | "vrm" | "glb";
  /** 3D-asset-store id (absent for "classic"). */
  storeId?: string;
  /** Share of the procedural robot's feet→TV-top height the model body takes (VRM default 0.72;
   * quadruped animals sit lower). */
  heightHint?: number;
  /** Extra Y rotation (radians) for models whose rest pose doesn't face +Z (the group's forward). */
  rotateY?: number;
  /** Whether this entry came from the fixed floor or was discovered from the asset store. */
  source?: "built-in" | "asset-store";
}

// Animals were each loaded and their embedded clips inventoried (2026-06-11); the comment per entry
// is the verified clip list. Only animals with an idle-ish AND walk-ish clip made the catalog.
export const AVATAR_CATALOG: readonly AvatarCatalogEntry[] = [
  { id: "classic", label: "Classic TV-head", kind: "classic" },
  { id: "vrm:6a211f7d90ef2a93f06a262b", label: "Bluebot", kind: "vrm", storeId: "6a211f7d90ef2a93f06a262b" },
  { id: "vrm:6a211fb8cf0cffae65faf147", label: "Blue", kind: "vrm", storeId: "6a211fb8cf0cffae65faf147" },
  { id: "vrm:6a211fda90ef2a93f06a2640", label: "Blue Atlantean", kind: "vrm", storeId: "6a211fda90ef2a93f06a2640" },
  // Autons + Atlanteans (verified 2026-06-11): every VRM below is a VRM 1.0 humanoid with NO
  // embedded animation clips (glTF JSON has no animations[] at all), so they all animate from the
  // standard retargeted VRMA set (Idle/Walking/Wave; airborne = the walk-hold leap).
  { id: "vrm:6a20d54890ef2a93f06a2021", label: "Ancient Auton", kind: "vrm", storeId: "6a20d54890ef2a93f06a2021" },
  { id: "vrm:6a20d9d9cf0cffae65fae7ea", label: "Auton 2", kind: "vrm", storeId: "6a20d9d9cf0cffae65fae7ea" },
  { id: "vrm:6a212300cf0cffae65faf251", label: "Atlantean", kind: "vrm", storeId: "6a212300cf0cffae65faf251" },
  { id: "vrm:6a211e51cf0cffae65faf106", label: "Gold Atlantean 1", kind: "vrm", storeId: "6a211e51cf0cffae65faf106" },
  { id: "vrm:6a211e8090ef2a93f06a25e1", label: "Gold Atlantean 2", kind: "vrm", storeId: "6a211e8090ef2a93f06a25e1" },
  { id: "vrm:6a211eb090ef2a93f06a25f6", label: "Gold Atlantean 3", kind: "vrm", storeId: "6a211eb090ef2a93f06a25f6" },
  { id: "vrm:6a211de0cf0cffae65faf0ed", label: "White Atlantean", kind: "vrm", storeId: "6a211de0cf0cffae65faf0ed" },
  // Shiba: Death, Eating, Gallop, Idle, Idle_2, Idle_2_HeadLow, Idle_HitReact1/2, Walk
  { id: "glb:6a1fdc6cd33fd7d0fec83a2a", label: "Shiba", kind: "glb", storeId: "6a1fdc6cd33fd7d0fec83a2a", heightHint: 0.5 },
  // Husky: Idle_Breathing, Idle_Playing, Run_Loop
  { id: "glb:6a1f936c9941746a2995f3c4", label: "Husky", kind: "glb", storeId: "6a1f936c9941746a2995f3c4", heightHint: 0.52 },
  // Baby Wolf: Bark, Bite, Death, Idle, Jump, Rest Pose, Run, Sit, Walk
  { id: "glb:6a21135290ef2a93f06a2598", label: "Baby Wolf", kind: "glb", storeId: "6a21135290ef2a93f06a2598", heightHint: 0.45 },
  // Baby Fox: Bark, Bite, Fetch, Idle, Idle Alert, Jump, Rest Pose, Run, Sit, Sneak, Walk
  { id: "glb:6a210cd590ef2a93f06a247f", label: "Baby Fox", kind: "glb", storeId: "6a210cd590ef2a93f06a247f", heightHint: 0.42 },
  // Baby Reindeer: Attack_Headbutt/Kick, Gallop, Gallop_Jump, Idle, Idle_2, Idle_Headlow, Idle_HitReact1, Jump_toIdle, Walk
  { id: "glb:6a211103cf0cffae65faeedd", label: "Baby Reindeer", kind: "glb", storeId: "6a211103cf0cffae65faeedd", heightHint: 0.55 },
];

let avatarCatalogSnapshot: readonly AvatarCatalogEntry[] = AVATAR_CATALOG;
let avatarCatalogPromise: Promise<readonly AvatarCatalogEntry[]> | undefined;
const AVATAR_CATALOG_EVENT = "tellus:avatar-catalog";

function publishAvatarCatalog(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AVATAR_CATALOG_EVENT));
}

export function catalogEntryById(id: string): AvatarCatalogEntry | undefined {
  const found = avatarCatalogSnapshot.find((entry) => entry.id === id) ?? AVATAR_CATALOG.find((entry) => entry.id === id);
  if (found) return found;
  if (id.startsWith("vrm:")) {
    const storeId = id.slice(4);
    if (storeId) return { id, label: `VRM ${storeId.slice(0, 8)}`, kind: "vrm", storeId, source: "asset-store" };
  }
  if (id.startsWith("glb:")) {
    const storeId = id.slice(4);
    const vrmEntry = avatarCatalogSnapshot.find((entry) => entry.id === `vrm:${storeId}`);
    if (vrmEntry) return vrmEntry;
    if (storeId) return { id, label: `GLB ${storeId.slice(0, 8)}`, kind: "glb", storeId, heightHint: 0.55, source: "asset-store" };
  }
  return undefined;
}

export function avatarCatalogSync(): readonly AvatarCatalogEntry[] {
  return avatarCatalogSnapshot;
}

export function subscribeAvatarCatalog(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(AVATAR_CATALOG_EVENT, listener);
  return () => window.removeEventListener(AVATAR_CATALOG_EVENT, listener);
}

export function resetAvatarCatalogForTests(): void {
  avatarCatalogSnapshot = AVATAR_CATALOG;
  avatarCatalogPromise = undefined;
}

/** Store thumbnail for a catalog entry (undefined for "classic" — render an initials tile). */
export function avatarThumbnailUrl(entry: AvatarCatalogEntry): string | undefined {
  if (!entry.storeId || !runtimeConfig.worldApiBase) return undefined;
  return tellusAssetLibraryUrl(`/api/assets/model/${encodeURIComponent(entry.storeId)}/thumbnail`);
}

const AVATAR_STORAGE_KEY = "tellus.avatarId";

/** The persisted explicit selection ("" = none → deterministic per-visitor pick). */
export function storedAvatarId(): string {
  try {
    return window.localStorage.getItem(AVATAR_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredAvatarId(id: string): void {
  try {
    if (id) window.localStorage.setItem(AVATAR_STORAGE_KEY, id);
    else window.localStorage.removeItem(AVATAR_STORAGE_KEY);
  } catch {
    /* private mode — selection just won't persist */
  }
}

const AVATAR_SCALE_STORAGE_KEY = "tellus.avatarScale";

/** The persisted avatar-size multiplier (1 = default; clamped to the legal [0.1, 8] range). */
export function storedAvatarScale(): number {
  try {
    const raw = window.localStorage.getItem(AVATAR_SCALE_STORAGE_KEY);
    return raw === null ? 1 : clampAvatarScale(Number(raw));
  } catch {
    return 1;
  }
}

export function setStoredAvatarScale(scale: number): void {
  try {
    const clamped = clampAvatarScale(scale);
    if (clamped === 1) window.localStorage.removeItem(AVATAR_SCALE_STORAGE_KEY);
    else window.localStorage.setItem(AVATAR_SCALE_STORAGE_KEY, String(clamped));
  } catch {
    /* private mode — the size just won't persist */
  }
}

// ── GLB animal loading (embedded clips; meshopt/KTX2-capable shared loader) ─────────────────────
// The parsed GLTF is cached per store id (scene cloned per avatar instance via SkeletonUtils —
// geometry/materials stay shared with the cache for the session, so rig disposal must NOT dispose
// them). Game-optimized is preferred (~95% smaller) with fallback to the original download.
const glbCache = new Map<string, Promise<GLTF>>();

async function fetchAndParseGlb(url: string): Promise<GLTF> {
  // Deliberately a bare fetch: /api/assets/* is the header-free proxy path.
  const response = await fetch(url);
  if (!response.ok) throw new Error(`asset fetch ${response.status}`);
  const buffer = await response.arrayBuffer();
  return createGltfLoader().parseAsync(buffer, "");
}

function loadAnimalGltf(storeId: string): Promise<GLTF> {
  let pending = glbCache.get(storeId);
  if (!pending) {
    pending = (async () => {
      const optimizedUrl = tellusAssetLibraryUrl(`/api/assets/model/${encodeURIComponent(storeId)}/game-optimized`);
      try {
        const gltf = await fetchAndParseGlb(optimizedUrl);
        if (gltf.animations.length > 0) return gltf;
        // An optimized variant that lost its clips is useless as an avatar — fall through.
      } catch {
        /* fall back to the original below */
      }
      return fetchAndParseGlb(assetDownloadUrl(storeId));
    })();
    pending.catch(() => glbCache.delete(storeId)); // failed loads retry next time
    glbCache.set(storeId, pending);
  }
  return pending;
}

interface AssetBrowseModel {
  id?: string;
  model_id?: string;
  asset_id?: string;
  name?: string;
  file_format?: string;
  content_type?: string;
  mime_type?: string;
  has_vrm_variant?: boolean;
  has_optimized_vrm_variant?: boolean;
  tags?: unknown;
}

function parseAssetModels(value: unknown): AssetBrowseModel[] {
  if (Array.isArray(value)) return value as AssetBrowseModel[];
  if (!value || typeof value !== "object") return [];
  const record = value as {
    models?: unknown;
    avatars?: unknown;
    vrms?: unknown;
    animated_models?: unknown;
    animatedModels?: unknown;
    items?: unknown;
    results?: unknown;
    data?: unknown;
  };
  for (const candidate of [
    record.models,
    record.avatars,
    record.vrms,
    record.animated_models,
    record.animatedModels,
    record.items,
    record.results,
    record.data,
  ]) {
    if (Array.isArray(candidate)) return candidate as AssetBrowseModel[];
  }
  return [];
}

async function fetchVrmAvatarCandidates(): Promise<AssetBrowseModel[]> {
  if (!runtimeConfig.worldApiBase) return [];
  const response = await fetch(tellusAssetLibraryUrl("/api/assets/vrm-models"), {
    cache: "no-store",
  });
  if (response.ok) return parseAssetModels(await response.json());

  const params = new URLSearchParams({ search: "vrm", per_page: "80", sort: "newest" });
  const fallback = await fetch(tellusAssetLibraryUrl(`/api/assets/models/browse?${params.toString()}`), {
    cache: "no-store",
  });
  if (!fallback.ok) return [];
  return parseAssetModels(await fallback.json());
}

async function fetchAnimatedAvatarCandidates(): Promise<AssetBrowseModel[]> {
  if (!runtimeConfig.worldApiBase) return [];
  const response = await fetch(tellusAssetLibraryUrl("/api/assets/animated-models"), {
    cache: "no-store",
  });
  if (!response.ok) return [];
  return parseAssetModels(await response.json());
}

function assetName(model: AssetBrowseModel): string {
  return typeof model.name === "string" && model.name.trim() ? model.name.trim() : `Asset ${assetId(model).slice(0, 8)}`;
}

function assetId(model: AssetBrowseModel): string {
  for (const value of [model.id, model.model_id, model.asset_id]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function modelLooksVrm(model: AssetBrowseModel): boolean {
  const format = typeof model.file_format === "string" ? model.file_format.toLowerCase() : "";
  const contentType = typeof model.content_type === "string" ? model.content_type.toLowerCase() : "";
  const mimeType = typeof model.mime_type === "string" ? model.mime_type.toLowerCase() : "";
  const tags = Array.isArray(model.tags)
    ? model.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.toLowerCase())
    : [];
  return (
    format === "vrm" ||
    contentType.includes("vrm") ||
    mimeType.includes("vrm") ||
    model.has_vrm_variant === true ||
    model.has_optimized_vrm_variant === true ||
    tags.includes("vrm")
  );
}

function isDedicatedVrmModel(model: AssetBrowseModel): boolean {
  const format = typeof model.file_format === "string" ? model.file_format.toLowerCase() : "";
  // /vrm-models is already a VRM-specific endpoint; older store builds may omit file_format.
  return !format || modelLooksVrm(model);
}

function isAnimatedGlbModel(model: AssetBrowseModel): boolean {
  const format = typeof model.file_format === "string" ? model.file_format.toLowerCase() : "";
  return !modelLooksVrm(model) && (!format || format === "glb" || format === "gltf");
}

function inferredGlbHeight(model: AssetBrowseModel): number {
  const name = assetName(model).toLowerCase();
  return /dog|fox|wolf|reindeer|cat|horse|animal|quadruped/.test(name) ? 0.5 : 0.72;
}

function dedupeModels(models: readonly AssetBrowseModel[]): AssetBrowseModel[] {
  const seen = new Set<string>();
  const out: AssetBrowseModel[] = [];
  for (const model of models) {
    const id = assetId(model);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(model);
  }
  return out;
}

export function loadAvatarCatalog(): Promise<readonly AvatarCatalogEntry[]> {
  if (!runtimeConfig.worldApiBase) {
    avatarCatalogSnapshot = AVATAR_CATALOG;
    publishAvatarCatalog();
    return Promise.resolve(avatarCatalogSnapshot);
  }
  if (avatarCatalogPromise) return avatarCatalogPromise;
  avatarCatalogPromise = (async () => {
    try {
      const [vrmModels, animatedModels] = await Promise.all([
        fetchVrmAvatarCandidates(),
        fetchAnimatedAvatarCandidates(),
      ]);
      const existing = new Set(AVATAR_CATALOG.map((entry) => entry.id));
      const vrmCandidates = dedupeModels([
        ...vrmModels.filter(isDedicatedVrmModel),
        ...animatedModels.filter(modelLooksVrm),
      ]);
      const vrms = vrmCandidates
        .filter((model) => assetId(model))
        .map((model) => ({
          id: `vrm:${assetId(model)}`,
          label: assetName(model),
          kind: "vrm" as const,
          storeId: assetId(model),
          source: "asset-store" as const,
        }))
        .filter((entry) => !existing.has(entry.id))
        .slice(0, 48);
      const withVrms = new Set([...existing, ...vrms.map((entry) => entry.id)]);
      const animatedGlbs = dedupeModels(animatedModels)
        .filter(isAnimatedGlbModel)
        .filter((model) => assetId(model))
        .map((model) => ({
          id: `glb:${assetId(model)}`,
          label: assetName(model),
          kind: "glb" as const,
          storeId: assetId(model),
          heightHint: inferredGlbHeight(model),
          source: "asset-store" as const,
        }))
        .filter((entry) => !withVrms.has(entry.id))
        .slice(0, 48);
      avatarCatalogSnapshot = [...AVATAR_CATALOG, ...vrms, ...animatedGlbs];
      publishAvatarCatalog();
    } catch {
      avatarCatalogSnapshot = AVATAR_CATALOG;
      publishAvatarCatalog();
    }
    return avatarCatalogSnapshot;
  })();
  avatarCatalogPromise.catch(() => {
    avatarCatalogPromise = undefined;
  });
  return avatarCatalogPromise;
}

// ── Embedded-clip heuristics ────────────────────────────────────────────────────────────────────
// Store animals ship clip sets like Bark/Bite/Death/Idle/Jump/Walk — pick locomotion/idle/jump by
// name, never an action/emote clip. Within a pattern, the shortest name wins ("Idle" beats
// "Idle_HitReact1").
const NON_LOCOMOTION_CLIP = /death|attack|bite|bark|hit|eat|sit|rest|sneak|fetch|swim|fly|roll|spin|dance|play|kick|headbutt|pose/i;

function pickClip(
  clips: readonly THREE.AnimationClip[],
  patterns: readonly RegExp[],
): THREE.AnimationClip | undefined {
  for (const pattern of patterns) {
    const candidates = clips
      .filter((clip) => pattern.test(clip.name) && !NON_LOCOMOTION_CLIP.test(clip.name))
      .sort((a, b) => a.name.length - b.name.length);
    if (candidates.length > 0) return candidates[0];
  }
  return undefined;
}

export interface CategorizedClips {
  idle?: THREE.AnimationClip;
  walk?: THREE.AnimationClip;
  jump?: THREE.AnimationClip;
}

export function categorizeEmbeddedClips(clips: readonly THREE.AnimationClip[]): CategorizedClips {
  return {
    idle: pickClip(clips, [/^idle$/i, /idle.*breath/i, /^idle/i, /idle/i, /breath/i, /stand/i]),
    walk: pickClip(clips, [/^walk$/i, /walk/i, /trot/i, /^run/i, /run/i, /gallop/i, /locomot|move/i]),
    jump: pickClip(clips, [/^jump$/i, /jump$/i, /jump/i, /hop/i]),
  };
}

// ── The GLB rig: embedded clips, same interface/state machine as the VRM robots ────────────────
class GlbAvatarRig extends LocomotionAvatarRig {
  private readonly model: THREE.Object3D;
  private readonly allClips: readonly THREE.AnimationClip[];

  constructor(
    root: THREE.Group,
    model: THREE.Object3D,
    clips: CategorizedClips,
    allClips: readonly THREE.AnimationClip[] = [],
  ) {
    super(root, new THREE.AnimationMixer(model));
    this.model = model;
    this.allClips = allClips;
    for (const name of ["idle", "walk", "jump"] as const) {
      const clip = clips[name];
      if (clip) this.actions[name] = this.mixer.clipAction(clip);
    }
    this.play("idle", 0);
  }

  // Emotes resolve against the FULL embedded clip set (Bark/Sit/Dance/…), exact name first, then
  // a contains-match; locomotion rig clips remain the fallback.
  protected override resolveEmoteAction(name: string): THREE.AnimationAction | undefined {
    const wanted = name.trim().toLowerCase();
    if (!wanted) return undefined;
    const clip =
      this.allClips.find((c) => c.name.toLowerCase() === wanted) ??
      this.allClips.find((c) => c.name.toLowerCase().includes(wanted));
    if (clip) return this.mixer.clipAction(clip);
    return super.resolveEmoteAction(name);
  }

  override play(name: RigClipName, fadeSec = 0.25): void {
    const walk = this.actions.walk;
    if (name === "idle" && !this.actions.idle && walk) {
      // No idle-ish clip: freeze the locomotion clip at t=0 (its stand frame) instead.
      super.play("walk", fadeSec);
      walk.time = 0;
      walk.paused = true;
      return;
    }
    // Leaving a frozen idle (or a held airborne pose handled by the base) — let walk advance again.
    if (name === "walk" && walk?.paused && !this.airborne) walk.paused = false;
    super.play(name, fadeSec);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    // Geometry/materials are shared with the session GLB cache — detach only, never dispose.
    this.model.parent?.remove(this.model);
  }
}

async function attachGlbAvatar(
  group: THREE.Group,
  entry: AvatarCatalogEntry,
  storeId: string,
  stillWanted?: () => boolean,
): Promise<AvatarRig | null> {
  const gltf = await loadAnimalGltf(storeId);
  const clips = categorizeEmbeddedClips(gltf.animations);
  if (!clips.idle && !clips.walk) throw new Error("no idle-ish or walk-ish embedded clip");
  // A newer selection (or a prune) superseded this load while it was in flight — never mount a
  // stale model over the current one (mounting also repositions the floating TV).
  if (stillWanted && !stillWanted()) return null;
  // Skinned scenes can't be shared across instances — SkeletonUtils.clone gives this avatar its
  // own bone graph while reusing the cached geometry/materials.
  const model = skeletonClone(gltf.scene);
  model.rotation.y = entry.rotateY ?? 0; // face +Z, like the robots
  model.traverse((obj) => {
    // Animated skinned meshes sweep outside their rest-pose bounds — never frustum-cull them.
    obj.frustumCulled = false;
  });
  mountModelOnAvatar(group, model, entry.heightHint ?? 0.5);
  return new GlbAvatarRig(group, model, clips, gltf.animations);
}

// ── Unified attach: catalog selection → the right rig ──────────────────────────────────────────
type ResolvedAvatarChoice =
  | { kind: "classic" }
  | { kind: "vrm"; storeId: string }
  | { kind: "glb"; storeId: string; entry: AvatarCatalogEntry };

/** Resolve a requested avatar id ("" = no explicit pick) to what should actually mount. Unknown
 * ids (e.g. a newer client's pick arriving over presence) fall back to the deterministic robot. */
export function resolveAvatarChoice(visitorId: string, requestedId: string): ResolvedAvatarChoice {
  if (requestedId === "classic") return { kind: "classic" };
  const entry = requestedId ? catalogEntryById(requestedId) : undefined;
  if (entry?.kind === "vrm" && entry.storeId) return { kind: "vrm", storeId: entry.storeId };
  if (entry?.kind === "glb" && entry.storeId) return { kind: "glb", storeId: entry.storeId, entry };
  // No/unknown selection → the pre-picker behavior: classic escape hatch, else deterministic VRM.
  if (classicAvatarRequested()) return { kind: "classic" };
  return { kind: "vrm", storeId: pickAvatarId(visitorId) };
}

/**
 * Upgrade a procedural TV-head avatar group per the requested catalog selection. Resolves null for
 * "classic" (procedural avatar stays/was restored by the caller) and on ANY load failure — failure
 * never leaves a half-mounted avatar.
 */
export async function attachAvatarRig(
  group: THREE.Group,
  visitorId: string,
  requestedId: string,
  rendererIsWebGPU: boolean,
  stillWanted?: () => boolean,
): Promise<AvatarRig | null> {
  if (!runtimeConfig.worldApiBase) return null;
  const choice = resolveAvatarChoice(visitorId, requestedId);
  if (choice.kind === "classic") return null;
  if (choice.kind === "vrm") {
    return attachVrmAvatar(group, visitorId, rendererIsWebGPU, choice.storeId, stillWanted);
  }
  try {
    return await attachGlbAvatar(group, choice.entry, choice.storeId, stillWanted);
  } catch (error) {
    console.warn(`[avatar] GLB avatar "${choice.entry.label}" failed — keeping the current look`, error);
    return null;
  }
}
