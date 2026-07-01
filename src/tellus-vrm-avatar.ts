// Rigged VRM robot avatars (asset-store VRMs + retargetable VRMA clips) that upgrade the
// procedural TV-head robots from world-builders.ts IN PLACE. The sync entry points
// (createVisitorMesh/createRemoteVisitorMesh) stay untouched — attachVrmAvatar() is the async
// upgrade: it loads a deterministic-per-visitor VRM, hides the procedural body parts (NEVER the
// TV screen — P2P video keeps riding `group.userData.tvScreenRef`), mounts the rigged robot under
// the same group and floats the TV + presence ring above its head. ANY failure leaves the
// procedural avatar untouched (zero regression); localStorage "tellus.classicAvatar"="1" skips
// VRM entirely.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  MToonMaterialLoaderPlugin,
  VRMLoaderPlugin,
  VRMUtils,
  type VRM,
} from "@pixiv/three-vrm";
import { MToonNodeMaterial } from "@pixiv/three-vrm/nodes";
import {
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
  createVRMAnimationClip,
  type VRMAnimation,
} from "@pixiv/three-vrm-animation";
import { runtimeConfig } from "./tellus-runtime-config";
import {
  animationMetadataHasBlockingIssue,
  normalizeAnimationIntent,
  type AssetAnimationMetadata,
} from "./tellus-animation-intents";
import { tellusAssetLibraryUrl } from "./tellus-urls-identity";

// ── Asset-store ids (the ONLY thing to touch when new avatars/clips land) ──────────────────────
// All are plain GETs on the header-free /api/assets proxy (no session header on purpose).
export const AVATAR_IDS: readonly string[] = [
  "6a211f7d90ef2a93f06a262b", // Bluebot
  "6a211fb8cf0cffae65faf147", // Blue
  "6a211fda90ef2a93f06a2640", // Blue Atlantean
];

export type RigClipName = "idle" | "walk" | "jump" | "wave";

// There is no jump VRMA in the store yet — when one lands, set CLIP_IDS.jump and the rig uses it
// automatically (until then airborne holds the walk clip mid-stride; see enterAirborne()).
export const CLIP_IDS: Record<RigClipName, string | undefined> = {
  idle: "6a20d88a90ef2a93f06a2037", // Idle
  walk: "6a20d93d90ef2a93f06a2049", // Walking
  jump: undefined,
  wave: "6a20d72890ef2a93f06a2027", // Stand Up and Wave
};

// Locomotion tuning. Speeds are world units/sec (player walk speed is ~13–19 depending on world
// scale); hysteresis keeps remote avatars (fed by ~300ms presence deltas) from flickering.
const WALK_ENTER_SPEED = 1.6;
const WALK_EXIT_SPEED = 0.7;
const WALK_CLIP_REFERENCE_SPEED = 7;
const WALK_TIMESCALE_MIN = 0.7;
const WALK_TIMESCALE_MAX = 1.9;
const TELEPORT_SPEED = 50; // presence jumps faster than this are teleports, not walking
const REMOTE_SPEED_HOLD_MS = 700; // keep walking this long past the last presence delta
const REMOTE_AIRBORNE_MS = 450; // vertical presence spike → brief airborne
const REMOTE_AIRBORNE_DY = 1.05;
// The VRM body takes this share of the procedural robot's body height; the TV + ring float above,
// so the overall silhouette height stays ≈ the old avatar.
const VRM_BODY_HEIGHT_RATIO = 0.72;

// ── User avatar scale (the picker "Size" slider) ────────────────────────────────────────────────
// VISUAL-ONLY: scales the avatar silhouette (mounted model / classic TV-head body + TV/ring
// offsets) inside the visitor group — physics, collision and movement are deliberately untouched.
// The whole group is NOT scaled (its world position is written every frame by the position code,
// and other children — selection helpers etc. — must not inherit the scale); instead every avatar
// node keeps a captured scale-1 baseline (position + scale) and the user factor multiplies both,
// so the silhouette scales coherently around the feet at the group origin. Bounds mirror the
// server-side clamp on presence.avatarScale.
export const AVATAR_SCALE_MIN = 0.1;
export const AVATAR_SCALE_MAX = 8;

/** Clamp to the legal user-scale range; anything non-finite / non-positive means "unset" → 1. */
export function clampAvatarScale(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return THREE.MathUtils.clamp(value, AVATAR_SCALE_MIN, AVATAR_SCALE_MAX);
}

interface AvatarScaleState {
  current: number;
  target: number;
  /** Scale-1 baseline per managed node — recaptured whenever layout code (mount/restore) re-seats
   * everything at base scale. */
  bases: Map<THREE.Object3D, { position: THREE.Vector3; scale: THREE.Vector3 }>;
}

function avatarScaleState(group: THREE.Group): AvatarScaleState {
  let state = group.userData.avatarScaleState as AvatarScaleState | undefined;
  if (!state) {
    state = { current: 1, target: 1, bases: new Map() };
    group.userData.avatarScaleState = state;
  }
  return state;
}

function applyAvatarScaleFactor(group: THREE.Group, factor: number): void {
  const state = avatarScaleState(group);
  for (const [node, base] of state.bases) {
    if (node.parent !== group) continue; // disposed/replaced nodes simply drop out
    node.position.copy(base.position).multiplyScalar(factor);
    node.scale.copy(base.scale).multiplyScalar(factor);
  }
}

/** Every group child the user scale manages: classic body parts, TV box + screen, presence ring
 * and (when mounted) the rigged model. */
function avatarScaledNodes(group: THREE.Group): THREE.Object3D[] {
  const nodes: THREE.Object3D[] = [
    ...((group.userData.robotBodyParts as THREE.Object3D[] | undefined) ?? []),
  ];
  for (const key of ["tvBoxRef", "tvScreenRef", "markerRef", "avatarMountedModel"] as const) {
    const node = group.userData[key] as THREE.Object3D | undefined;
    if (node) nodes.push(node);
  }
  return nodes;
}

/** Re-seat layout code runs at scale 1 — call this FIRST so measurements (and the once-only
 * classic-layout capture) see the true baseline, then rebaseAvatarScale() afterwards. */
function resetAvatarScaleToBase(group: THREE.Group): void {
  applyAvatarScaleFactor(group, 1);
}

/** Recapture the scale-1 baseline AFTER mount/restore seated everything, then re-apply the
 * group's current user scale on top. */
function rebaseAvatarScale(group: THREE.Group): void {
  const state = avatarScaleState(group);
  state.bases.clear();
  for (const node of avatarScaledNodes(group)) {
    state.bases.set(node, { position: node.position.clone(), scale: node.scale.clone() });
  }
  applyAvatarScaleFactor(group, state.current);
}

/** The currently APPLIED user scale (mid-lerp value — what the silhouette/eye height shows now). */
export function getAvatarUserScale(group: THREE.Group): number {
  return (group.userData.avatarScaleState as AvatarScaleState | undefined)?.current ?? 1;
}

/** Set the user-scale target. `immediate` snaps (initial spawn); otherwise tickAvatarScale()
 * eases toward it (~0.3s) so live remote changes don't pop. */
export function setAvatarUserScale(group: THREE.Group, scale: number, immediate = false): void {
  const state = avatarScaleState(group);
  state.target = clampAvatarScale(scale);
  if (immediate || state.bases.size === 0) {
    state.current = state.target;
    applyAvatarScaleFactor(group, state.current);
  }
}

const AVATAR_SCALE_LERP_RATE = 12; // exponential approach — visually settled in ~0.3s

/** Per-frame ease toward the target scale. No-op (zero cost) once settled. */
export function tickAvatarScale(group: THREE.Group, dt: number): void {
  const state = group.userData.avatarScaleState as AvatarScaleState | undefined;
  if (!state || state.current === state.target) return;
  const blend = 1 - Math.exp(-AVATAR_SCALE_LERP_RATE * dt);
  let next = state.current + (state.target - state.current) * blend;
  if (Math.abs(next - state.target) < 0.001 * state.target) next = state.target;
  state.current = next;
  applyAvatarScaleFactor(group, next);
}

// The rig contract main.tsx drives — implemented by BOTH the VRM robots (here) and the animated
// GLB animals (tellus-avatar-catalog.ts), so the main.tsx code paths never fork on avatar kind.
export interface AvatarRig {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<RigClipName, THREE.AnimationAction | undefined>;
  /** Crossfade to a clip (no-op when the clip is missing or already current). */
  play(name: RigClipName, fadeSec?: number): void;
  /** Play an emote clip ONCE over locomotion, then resume walk/idle. VRM rigs resolve against
   * the retargeted VRMA set ("wave", …); GLB rigs against their embedded clips by name; an
   * unknown clip is ignored. */
  playEmote(name: string): void;
  /** Horizontal speed in world units/sec — drives walk/idle (with hysteresis + clip timescale). */
  setMoving(speed: number): void;
  setAirborne(airborne: boolean): void;
  /** Feed a remote presence target — derives speed/airborne from successive update deltas. */
  notePresenceUpdate(x: number, y: number, z: number, nowMs: number): void;
  /** Advance mixer (+ VRM spring bones on the VRM path). Call once per frame. */
  update(dt: number): void;
  dispose(): void;
}

export function classicAvatarRequested(): boolean {
  try {
    return window.localStorage.getItem("tellus.classicAvatar") === "1";
  } catch {
    return false;
  }
}

export function assetDownloadUrl(id: string): string {
  return tellusAssetLibraryUrl(`/api/assets/download/${encodeURIComponent(id)}`);
}

/** Stable FNV-1a hash → each visitorId (players AND agent:* ids) always gets the same robot. */
export function pickAvatarId(visitorId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < visitorId.length; i++) {
    h ^= visitorId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return AVATAR_IDS[(h >>> 0) % AVATAR_IDS.length];
}

// ── Loaders + caches ────────────────────────────────────────────────────────────────────────────
// VRM binaries are cached as ArrayBuffers (parse per avatar instance — skinned scenes can't be
// shared); parsed VRMAnimations are cached per clip URL (retarget per avatar is cheap).
const vrmBufferCache = new Map<string, Promise<ArrayBuffer>>();
const vrmaCache = new Map<string, Promise<VRMAnimation>>();
const assetVrmMetadataCache = new Map<string, Promise<boolean | undefined>>();
let warnedVrmLoadFailure = false;

function makeVrmLoader(rendererIsWebGPU: boolean): GLTFLoader {
  const loader = new GLTFLoader();
  loader.register(
    (parser) =>
      new VRMLoaderPlugin(
        parser,
        // MToon's WebGL shader doesn't compile under WebGPURenderer — swap in the node-material
        // implementation there (three-vrm ships it for exactly this; standard PBR VRMs are
        // unaffected either way).
        rendererIsWebGPU
          ? {
              mtoonMaterialPlugin: new MToonMaterialLoaderPlugin(parser, {
                materialType: MToonNodeMaterial,
              }),
            }
          : undefined,
      ),
  );
  loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
  return loader;
}

function fetchAssetBuffer(url: string): Promise<ArrayBuffer> {
  let pending = vrmBufferCache.get(url);
  if (!pending) {
    pending = (async () => {
      // Deliberately a bare fetch: /api/assets/* is the header-free proxy path.
      const response = await fetch(url);
      if (!response.ok) throw new Error(`asset fetch ${response.status}`);
      return response.arrayBuffer();
    })();
    pending.catch(() => vrmBufferCache.delete(url)); // failed fetches retry next time
    vrmBufferCache.set(url, pending);
  }
  return pending;
}

function assetStoreIdFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, window.location.href);
  } catch {
    return null;
  }
  const match = /\/api\/(?:assets\/)?(?:model|download)\/([^/?#]+)/i.exec(parsed.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

function fetchAssetIsVrm(id: string): Promise<boolean | undefined> {
  let pending = assetVrmMetadataCache.get(id);
  if (!pending) {
    pending = (async () => {
      if (!runtimeConfig.worldApiBase) return undefined;
      const response = await fetch(tellusAssetLibraryUrl(`/api/assets/model/${encodeURIComponent(id)}`), {
        cache: "force-cache",
      });
      if (!response.ok) return undefined;
      const parsed = (await response.json()) as unknown;
      const model =
        parsed && typeof parsed === "object" && "model" in parsed
          ? (parsed as { model?: unknown }).model
          : parsed;
      if (!model || typeof model !== "object") return undefined;
      const record = model as Record<string, unknown>;
      const format = typeof record.file_format === "string" ? record.file_format.toLowerCase() : "";
      return (
        format === "vrm" ||
        record.has_vrm_variant === true ||
        record.has_optimized_vrm_variant === true
      );
    })();
    pending.catch(() => assetVrmMetadataCache.delete(id));
    assetVrmMetadataCache.set(id, pending);
  }
  return pending;
}

async function shouldAttemptVrmObjectLoad(url: string): Promise<boolean> {
  // Only attempt the (expensive) VRM download+parse when the asset metadata EXPLICITLY says it's a
  // VRM. Previously this returned true on `undefined` too (metadata missing / non-store URL / fetch
  // failed), so every generated asset got a full GLB download + VRM parseAsync BEFORE the regular
  // load — a double-parse storm that pinned the main thread at 0 FPS and prevented avatar + movement
  // (the player/agent avatars use a separate loader, attachGlbAvatar — they're unaffected by this).
  const assetId = assetStoreIdFromUrl(url);
  if (!assetId) return false;
  const isVrm = await fetchAssetIsVrm(assetId).catch(() => undefined);
  return isVrm === true;
}

export async function loadVrm(url: string, rendererIsWebGPU: boolean): Promise<VRM> {
  const buffer = await fetchAssetBuffer(url);
  const gltf = await makeVrmLoader(rendererIsWebGPU).parseAsync(buffer, "");
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error("file is not a VRM");
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm); // VRM0 → face the same way as VRM1 (+Z, the group's forward)
  if (vrm.lookAt) {
    // createVRMAnimationClip wants this proxy; creating it up front avoids a per-clip warning.
    const lookAtProxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
    lookAtProxy.name = "VRMLookAtQuaternionProxy";
    vrm.scene.add(lookAtProxy);
  }
  vrm.scene.traverse((obj) => {
    // Animated skinned meshes sweep outside their rest-pose bounds — never frustum-cull them.
    obj.frustumCulled = false;
  });
  return vrm;
}

function loadVrmaAnimation(url: string, rendererIsWebGPU: boolean): Promise<VRMAnimation> {
  let pending = vrmaCache.get(url);
  if (!pending) {
    pending = (async () => {
      const buffer = await fetchAssetBuffer(url);
      const gltf = await makeVrmLoader(rendererIsWebGPU).parseAsync(buffer, "");
      const animations = gltf.userData.vrmAnimations as VRMAnimation[] | undefined;
      if (!animations?.length) throw new Error("file has no VRM animation");
      return animations[0];
    })();
    pending.catch(() => vrmaCache.delete(url));
    vrmaCache.set(url, pending);
  }
  return pending;
}

async function loadOptionalClip(
  id: string | undefined,
  rendererIsWebGPU: boolean,
): Promise<VRMAnimation | undefined> {
  if (!id) return undefined;
  try {
    return await loadVrmaAnimation(assetDownloadUrl(id), rendererIsWebGPU);
  } catch {
    return undefined; // a missing optional clip never blocks the avatar
  }
}

// ── VRMA animation catalogue ────────────────────────────────────────────────────────────────────
// The full set of one-shot emotes any humanoid VRM rig can play, keyed by human-readable name. The AI
// pilots its avatar with play_animation(name), so `name` is the contract — not a store id.
//
// Source of truth is the store's GET /api/vrma feed ({ clips: [{ id, name, downloadUrl }] }), fetched
// once and cached. Until that endpoint ships it 404s harmlessly and we fall back to the built-in
// CLIP_IDS names (idle/walk/jump/wave). When it lands, the catalogue lights up automatically — no rig
// changes — and every VRM avatar can play every clip the store serves.
export interface VrmaCatalogEntry {
  /** Human-readable clip name — what play_animation receives and the HUD shows. */
  name: string;
  /** Download URL for the .vrma binary (fed straight to loadVrmaAnimation). */
  url: string;
  /** Optional provenance ("mixamo", "uploaded", …) the store may attach. */
  source?: string;
  metadata?: AssetAnimationMetadata;
}

// name (lowercased) → entry. Seeded from the built-in clips so the rig works before /api/vrma exists.
export type VrmaCategoryId = "core" | "gesture" | "dance" | "action" | "sport" | "locomotion" | "pose" | "other";

export interface VrmaCategorySummary {
  id: VrmaCategoryId;
  label: string;
  count: number;
  examples: string[];
}

const VRMA_CATEGORY_LABELS: Record<VrmaCategoryId, string> = {
  core: "Core",
  gesture: "Gestures",
  dance: "Dance",
  action: "Action",
  sport: "Sports",
  locomotion: "Movement",
  pose: "Poses",
  other: "Other",
};

const RECOMMENDED_VRMA_PATTERNS: readonly RegExp[] = [
  /^idle$/i,
  /^walk(?:ing)?$/i,
  /^jump$/i,
  /^wave$/i,
  /stand up and wave/i,
  /greeting/i,
  /acknowledg/i,
  /head nod/i,
  /^bow$/i,
  /happy hand gesture/i,
  /^ballet$/i,
  /hip hop dance/i,
  /breakdance ready/i,
];

function vrmaCategoryForName(name: string): VrmaCategoryId {
  const n = name.trim().toLowerCase();
  if (/^(idle|walk|walking|jump|wave)$/.test(n) || /stand up and wave/.test(n)) return "core";
  if (/dance|ballet|breakdance|hip hop|flair|uprock|freeze|twerk|cartwheel/.test(n)) return "dance";
  if (/wave|greet|bow|nod|shake|gesture|beckon|kiss|acknowledg|dismiss|happy hand|angry gesture/.test(n)) {
    return "gesture";
  }
  if (/walk|run|jump|idle|crawl|climb|fly|flying|float|locomotion/.test(n)) return "locomotion";
  if (/kick|punch|stab|block|gun|attack|dagger|ninja|slash|fight|combat/.test(n)) return "action";
  if (/golf|fish|sport|throw|catch|basket|soccer|tennis|baseball/.test(n)) return "sport";
  if (/pose|kneel|lay|lying|crouch|stand|look|sitting|lean/.test(n)) return "pose";
  return "other";
}

const vrmaCategoryFromEntry = (entry: VrmaCatalogEntry): VrmaCategoryId => {
  const category = entry.metadata?.category?.trim().toLowerCase();
  if (
    category === "core" ||
    category === "gesture" ||
    category === "dance" ||
    category === "action" ||
    category === "sport" ||
    category === "locomotion" ||
    category === "pose" ||
    category === "other"
  ) {
    return category;
  }
  const intents = entry.metadata?.intents ?? [];
  if (intents.includes("dance")) return "dance";
  if (intents.some((intent) => intent === "walk" || intent === "run" || intent === "fly" || intent === "swim")) {
    return "locomotion";
  }
  if (intents.some((intent) => intent === "throw" || intent === "attack")) return "action";
  if (intents.some((intent) => intent === "sit" || intent === "stand" || intent === "idle")) return "pose";
  if (intents.includes("wave")) return "gesture";
  return vrmaCategoryForName(entry.name);
};

const stringArrayFromUnknown = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : undefined;

const numberFromUnknown = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const stringFromUnknown = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const parseVrmaAnimationMetadata = (
  c: Record<string, unknown>,
  name: string,
  id: string,
): AssetAnimationMetadata => {
  const intents = stringArrayFromUnknown(c.intents ?? c.intent_tags ?? c.intentTags)
    ?.map((intent) => normalizeAnimationIntent(intent))
    .filter((intent): intent is NonNullable<typeof intent> => intent !== null);
  const qualityRaw = c.quality;
  const quality =
    qualityRaw && typeof qualityRaw === "object" && !Array.isArray(qualityRaw)
      ? {
          score: numberFromUnknown((qualityRaw as Record<string, unknown>).score),
          issues: stringArrayFromUnknown((qualityRaw as Record<string, unknown>).issues),
        }
      : undefined;
  return {
    id,
    assetId: stringFromUnknown(c.assetId ?? c.asset_id ?? c.modelId ?? c.model_id) ?? id,
    name,
    aliases: stringArrayFromUnknown(c.aliases ?? c.tags ?? c.keywords),
    format: stringFromUnknown(c.format ?? c.fileFormat ?? c.file_format) ?? "vrma",
    actorKind: "avatar",
    skeletonProfile: stringFromUnknown(c.skeletonProfile ?? c.skeleton_profile) ?? "vrm-humanoid",
    intents,
    category: stringFromUnknown(c.category),
    loop: typeof c.loop === "boolean" ? c.loop : typeof c.loops === "boolean" ? c.loops : undefined,
    durationSeconds: numberFromUnknown(c.durationSeconds ?? c.duration_seconds ?? c.duration),
    rootMotion: stringFromUnknown(c.rootMotion ?? c.root_motion),
    speedMetersPerSecond: numberFromUnknown(c.speedMetersPerSecond ?? c.speed_meters_per_second ?? c.speed),
    direction: stringFromUnknown(c.direction),
    gait: stringFromUnknown(c.gait),
    quality,
    searchText: stringFromUnknown(c.searchText ?? c.search_text),
  };
};

const builtinVrmaCatalog = (): Map<string, VrmaCatalogEntry> => {
  const map = new Map<string, VrmaCatalogEntry>();
  for (const [name, id] of Object.entries(CLIP_IDS)) {
    if (id) map.set(name.toLowerCase(), { name, url: assetDownloadUrl(id), source: "builtin" });
  }
  return map;
};

let vrmaCatalogPromise: Promise<Map<string, VrmaCatalogEntry>> | undefined;
// Resolved clip-name snapshot for synchronous readers (emoteClipNamesSync); null until first load.
let vrmaCatalogSnapshot: string[] | null = null;
let vrmaCatalogEntriesSnapshot: VrmaCatalogEntry[] | null = null;

function vrmaFeedUrl(): string | null {
  if (!runtimeConfig.worldApiBase) return null;
  // The store serves the catalogue at /api/vrma; Tellus reaches the store through its header-free
  // proxy, which prefixes store paths with /api/assets (same convention as assetDownloadUrl's
  // /api/assets/download/{id}). Live shape (3d.flobots.xyz/api/vrma):
  //   { animations: [ { id, name, download_url: "/api/download/{id}", source, ... } ] }
  return tellusAssetLibraryUrl("/api/assets/vrma");
}

/** Fetch + cache the VRMA catalogue. Always resolves (never rejects): the built-in clips are the
 * floor, store clips merge on top, and a fetch failure just leaves the floor in place. */
export function loadVrmaCatalog(): Promise<Map<string, VrmaCatalogEntry>> {
  if (vrmaCatalogPromise) return vrmaCatalogPromise;
  vrmaCatalogPromise = (async () => {
    const catalog = builtinVrmaCatalog();
    const feed = vrmaFeedUrl();
    if (!feed) return catalog;
    try {
      const response = await fetch(feed, { cache: "no-store" });
      if (!response.ok) return catalog;
      const parsed = (await response.json()) as unknown;
      // Live shape: { animations: [...] }. Accept `clips` / a bare array too for resilience.
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as { animations?: unknown }).animations)
          ? (parsed as { animations: unknown[] }).animations
          : Array.isArray((parsed as { clips?: unknown }).clips)
            ? (parsed as { clips: unknown[] }).clips
            : [];
      for (const raw of list) {
        if (!raw || typeof raw !== "object") continue;
        const c = raw as Record<string, unknown>;
        const name = typeof c.name === "string" ? c.name.trim() : "";
        if (!name) continue;
        // The feed's download_url is a RELATIVE store path (/api/download/{id}) that won't resolve
        // cross-origin, so derive the fetch URL from the id via the proven /api/assets proxy
        // (assetDownloadUrl) — the same path the built-in clips already load through. Only fall back
        // to an explicit URL when it's absolute and no id is present.
        const id =
          typeof c.id === "string" ? c.id : typeof c.model_id === "string" ? c.model_id : "";
        const explicit =
          typeof c.downloadUrl === "string"
            ? c.downloadUrl
            : typeof c.download_url === "string"
              ? c.download_url
              : "";
        const url = id
          ? assetDownloadUrl(id)
          : explicit.startsWith("http")
            ? explicit
            : "";
        if (!url) continue;
        catalog.set(name.toLowerCase(), {
          name,
          url,
          source: typeof c.source === "string" ? c.source : "store",
          metadata: parseVrmaAnimationMetadata(c, name, id || name),
        });
      }
    } catch {
      // network/parse failure → keep the built-in floor
    }
    vrmaCatalogEntriesSnapshot = Array.from(catalog.values());
    vrmaCatalogSnapshot = vrmaCatalogEntriesSnapshot.map((e) => e.name);
    return catalog;
  })();
  vrmaCatalogPromise.catch(() => {
    vrmaCatalogPromise = undefined; // allow a later retry if the whole thing somehow threw
  });
  return vrmaCatalogPromise;
}

/** Resolve a clip NAME to a catalogue entry (case-insensitive, loose substring fallback). */
export async function resolveVrmaCatalogEntry(
  name: string,
): Promise<VrmaCatalogEntry | undefined> {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  const catalog = await loadVrmaCatalog();
  const direct = catalog.get(wanted);
  if (direct) return direct;
  for (const [key, entry] of catalog) {
    if (key.includes(wanted) || wanted.includes(key)) return entry;
  }
  return undefined;
}

/** The full emote vocabulary (clip names) — drives list_avatars / the Animation HUD. Resolves to the
 * built-in names synchronously-ish; the store feed enriches it once fetched. */
export async function emoteClipNames(): Promise<string[]> {
  const catalog = await loadVrmaCatalog();
  return Array.from(catalog.values(), (e) => e.name);
}

/** Synchronous best-effort emote vocabulary: the latest resolved catalogue, or the built-in floor
 * until the store feed lands. Triggers a (cached) catalogue fetch so the snapshot fills in. */
export function emoteClipNamesSync(): string[] {
  if (vrmaCatalogSnapshot) return vrmaCatalogSnapshot.slice();
  void loadVrmaCatalog(); // warms the snapshot for next call
  return Array.from(builtinVrmaCatalog().values(), (e) => e.name);
}

// ── The shared rig state machine (idle ⇄ walk, + airborne hold) ────────────────────────────────
// Subclasses provide the actions (VRMA-retargeted clips for VRM robots; embedded GLB clips for the
// animals) and any per-frame extra work via afterMixerUpdate (VRM spring bones).
function vrmaEntriesSync(): VrmaCatalogEntry[] {
  if (vrmaCatalogEntriesSnapshot) return vrmaCatalogEntriesSnapshot.slice();
  void loadVrmaCatalog();
  return Array.from(builtinVrmaCatalog().values());
}

export function recommendedEmoteClipNamesSync(limit = 14): string[] {
  const entries = vrmaEntriesSync();
  const selected: string[] = [];
  const seen = new Set<string>();
  const add = (entry: VrmaCatalogEntry | undefined) => {
    if (!entry || selected.length >= limit) return;
    if (animationMetadataHasBlockingIssue(entry.metadata)) return;
    const key = entry.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    selected.push(entry.name);
  };
  for (const pattern of RECOMMENDED_VRMA_PATTERNS) {
    add(entries.find((entry) => pattern.test(entry.name)));
  }
  for (const category of ["core", "gesture", "dance", "locomotion"] as const) {
    for (const entry of entries) {
      if (selected.length >= limit) break;
      if (!animationMetadataHasBlockingIssue(entry.metadata) && vrmaCategoryFromEntry(entry) === category) add(entry);
    }
  }
  return selected;
}

export function emoteClipNamesByCategorySync(category: VrmaCategoryId, limit = 50): string[] {
  return vrmaEntriesSync()
    .filter((entry) => !animationMetadataHasBlockingIssue(entry.metadata) && vrmaCategoryFromEntry(entry) === category)
    .slice(0, limit)
    .map((entry) => entry.name);
}

export function vrmaCategorySummarySync(): VrmaCategorySummary[] {
  const buckets = new Map<VrmaCategoryId, string[]>();
  for (const entry of vrmaEntriesSync()) {
    if (animationMetadataHasBlockingIssue(entry.metadata)) continue;
    const category = vrmaCategoryFromEntry(entry);
    const list = buckets.get(category) ?? [];
    list.push(entry.name);
    buckets.set(category, list);
  }
  return (Object.keys(VRMA_CATEGORY_LABELS) as VrmaCategoryId[])
    .map((id) => {
      const names = buckets.get(id) ?? [];
      return { id, label: VRMA_CATEGORY_LABELS[id], count: names.length, examples: names.slice(0, 8) };
    })
    .filter((summary) => summary.count > 0);
}

export abstract class LocomotionAvatarRig implements AvatarRig {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<RigClipName, THREE.AnimationAction | undefined>;

  protected current: RigClipName | undefined;
  protected airborne = false;
  protected smoothedSpeed = 0;
  protected walking = false;
  // Remote-presence inference (only used when notePresenceUpdate is being fed).
  private remoteDriven = false;
  private lastTarget = new THREE.Vector3();
  private lastTargetAtMs = 0;
  private remoteSpeed = 0;
  private remoteSpeedUntilMs = 0;
  private remoteAirborneUntilMs = 0;
  // One-shot emote overlay: while set, locomotion transitions only RECORD their target (play()
  // early-returns) and the resume happens when the mixer fires "finished" for this action.
  private emoteAction: THREE.AnimationAction | undefined;
  protected disposed = false;

  protected constructor(root: THREE.Group, mixer: THREE.AnimationMixer) {
    this.root = root;
    this.mixer = mixer;
    this.actions = { idle: undefined, walk: undefined, jump: undefined, wave: undefined };
    this.mixer.addEventListener("finished", this.onEmoteFinished);
  }

  play(name: RigClipName, fadeSec = 0.25): void {
    const next = this.actions[name];
    if (!next || this.current === name) return;
    if (this.emoteAction) {
      // Mid-emote: remember where locomotion wants to be; the emote's finish resumes there.
      this.current = name;
      return;
    }
    const prev = this.current ? this.actions[this.current] : undefined;
    next.reset();
    next.setEffectiveWeight(1);
    if (fadeSec > 0 && prev) {
      prev.fadeOut(fadeSec);
      next.fadeIn(fadeSec);
    } else {
      prev?.stop();
    }
    next.play();
    this.current = name;
  }

  setMoving(speed: number): void {
    if (this.disposed) return;
    // Light smoothing + enter/exit hysteresis so frame jitter / presence cadence can't flicker.
    this.smoothedSpeed += (speed - this.smoothedSpeed) * 0.3;
    const wasWalking = this.walking;
    this.walking = wasWalking
      ? this.smoothedSpeed > WALK_EXIT_SPEED
      : this.smoothedSpeed > WALK_ENTER_SPEED;
    if (!this.airborne && this.walking !== wasWalking) {
      this.play(this.walking ? "walk" : "idle");
    }
  }

  setAirborne(airborne: boolean): void {
    if (this.disposed || airborne === this.airborne) return;
    this.airborne = airborne;
    if (airborne) this.enterAirborne();
    else this.exitAirborne();
  }

  playEmote(name: string): void {
    if (this.disposed) return;
    const action = this.resolveEmoteAction(name);
    if (!action) return; // unknown clip → ignore
    // A newer emote replaces a running one mid-flight.
    if (this.emoteAction && this.emoteAction !== action) this.emoteAction.fadeOut(0.15);
    const prev = this.current ? this.actions[this.current] : undefined;
    if (prev && prev !== action) prev.fadeOut(0.2);
    this.emoteAction = action;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true; // hold the last pose so the resume crossfade has a source
    action.setEffectiveWeight(1);
    action.timeScale = 1;
    action.fadeIn(0.15);
    action.play();
  }

  /** Resolve an emote name to a playable action. Base: the rig clip set ("wave", "jump", …) by
   * exact then loose name match. GLB rigs override to search their embedded clips first. */
  protected resolveEmoteAction(name: string): THREE.AnimationAction | undefined {
    const wanted = name.trim().toLowerCase();
    if (!wanted) return undefined;
    const direct = this.actions[wanted as RigClipName];
    if (direct) return direct;
    for (const key of Object.keys(this.actions) as RigClipName[]) {
      const action = this.actions[key];
      if (action && (wanted.includes(key) || key.includes(wanted))) return action;
    }
    return undefined;
  }

  private readonly onEmoteFinished = (event: { action: THREE.AnimationAction }) => {
    if (this.disposed || !this.emoteAction || event.action !== this.emoteAction) return;
    const action = this.emoteAction;
    this.emoteAction = undefined;
    action.fadeOut(0.2);
    // Resume whatever locomotion currently calls for (current was only recorded while emoting).
    this.current = undefined;
    if (this.airborne) this.enterAirborne();
    else this.play(this.walking ? "walk" : "idle", 0.2);
  };

  notePresenceUpdate(x: number, y: number, z: number, nowMs: number): void {
    if (this.disposed) return;
    if (this.remoteDriven && this.lastTargetAtMs > 0) {
      const dtSec = Math.max(0.05, (nowMs - this.lastTargetAtMs) / 1000);
      const dx = x - this.lastTarget.x;
      const dy = y - this.lastTarget.y;
      const dz = z - this.lastTarget.z;
      const hSpeed = Math.hypot(dx, dz) / dtSec;
      if (hSpeed < TELEPORT_SPEED) {
        this.remoteSpeed = hSpeed;
        this.remoteSpeedUntilMs = nowMs + REMOTE_SPEED_HOLD_MS;
        if (Math.abs(dy) > REMOTE_AIRBORNE_DY) {
          this.remoteAirborneUntilMs = nowMs + REMOTE_AIRBORNE_MS;
        }
      } else {
        this.remoteSpeed = 0;
        this.remoteSpeedUntilMs = 0;
      }
    }
    this.remoteDriven = true;
    this.lastTarget.set(x, y, z);
    this.lastTargetAtMs = nowMs;
  }

  update(dt: number): void {
    if (this.disposed) return;
    if (this.remoteDriven) {
      const now = performance.now();
      this.setAirborne(now < this.remoteAirborneUntilMs);
      this.setMoving(now < this.remoteSpeedUntilMs ? this.remoteSpeed : 0);
    }
    const walk = this.actions.walk;
    if (walk && this.current === "walk" && !this.airborne) {
      walk.timeScale = THREE.MathUtils.clamp(
        this.smoothedSpeed / WALK_CLIP_REFERENCE_SPEED,
        WALK_TIMESCALE_MIN,
        WALK_TIMESCALE_MAX,
      );
    }
    this.mixer.update(dt);
    this.afterMixerUpdate(dt);
  }

  /** Per-frame hook after the mixer advanced (VRM spring bones / normalized→raw copy). */
  protected afterMixerUpdate(_dt: number): void {}

  abstract dispose(): void;

  // No jump clip: hold the walk clip mid-stride while airborne (reads as a leap); falls back
  // to idle if even the walk clip is missing. A real jump clip takes over as soon as one exists.
  protected enterAirborne(): void {
    if (this.actions.jump) {
      this.play("jump", 0.1);
      return;
    }
    const walk = this.actions.walk;
    if (walk) {
      this.play("walk", 0.12);
      walk.time = walk.getClip().duration * 0.3; // mid-stride pose
      walk.paused = true;
      walk.timeScale = 1;
    } else {
      this.play("idle", 0.12);
    }
  }

  protected exitAirborne(): void {
    const walk = this.actions.walk;
    if (walk) walk.paused = false;
    // Land into whatever locomotion currently calls for.
    this.play(this.walking ? "walk" : "idle", 0.15);
  }
}

// ── The VRM robot rig: VRMA clips retargeted onto the loaded VRM ───────────────────────────────
class VrmAvatarRig extends LocomotionAvatarRig {
  private readonly vrm: VRM;
  private readonly rendererIsWebGPU: boolean;
  // Emote clips loaded on demand from the VRMA catalogue, retargeted onto THIS vrm, keyed by clip
  // name (lowercased). idle/walk/jump/wave live in `this.actions`; everything else streams in here on
  // first play so any VRM can play any catalogue clip without preloading the whole set per avatar.
  private readonly dynamicEmotes = new Map<string, THREE.AnimationAction>();
  // Names currently being loaded — dedupes concurrent play requests for the same clip.
  private readonly loadingEmotes = new Set<string>();

  constructor(
    root: THREE.Group,
    vrm: VRM,
    clips: Partial<Record<RigClipName, VRMAnimation>>,
    rendererIsWebGPU: boolean,
  ) {
    super(root, new THREE.AnimationMixer(vrm.scene));
    this.vrm = vrm;
    this.rendererIsWebGPU = rendererIsWebGPU;
    for (const name of ["idle", "walk", "jump", "wave"] as const) {
      const animation = clips[name];
      if (!animation) continue;
      const clip = createVRMAnimationClip(animation, vrm);
      clip.name = name;
      this.actions[name] = this.mixer.clipAction(clip);
    }
    this.play("idle", 0);
  }

  // Resolve against the locomotion set first (base), then any dynamically-loaded catalogue emote.
  protected override resolveEmoteAction(name: string): THREE.AnimationAction | undefined {
    const base = super.resolveEmoteAction(name);
    if (base) return base;
    return this.dynamicEmotes.get(name.trim().toLowerCase());
  }

  // Play ANY catalogue clip by name. Already-loaded clips (locomotion or previously-streamed emotes)
  // play immediately via the base. An unknown name is loaded from the VRMA catalogue, retargeted onto
  // this VRM, cached, then played — so the first use has a small load delay and every use after is
  // instant (the VRMA binary is also shared across avatars via vrmaCache).
  override playEmote(name: string): void {
    if (this.disposed) return;
    if (this.resolveEmoteAction(name)) {
      super.playEmote(name);
      return;
    }
    const key = name.trim().toLowerCase();
    if (!key || this.loadingEmotes.has(key)) return;
    this.loadingEmotes.add(key);
    void (async () => {
      try {
        const entry = await resolveVrmaCatalogEntry(name);
        if (!entry || this.disposed) return;
        const animation = await loadVrmaAnimation(entry.url, this.rendererIsWebGPU);
        if (this.disposed) return;
        if (!this.dynamicEmotes.has(key)) {
          const clip = createVRMAnimationClip(animation, this.vrm);
          clip.name = entry.name;
          this.dynamicEmotes.set(key, this.mixer.clipAction(clip));
        }
        // Re-issue now that the action exists (only if no newer emote has taken over since).
        super.playEmote(name);
      } catch {
        // Unknown/failed clip → leave the avatar as-is (matches the base "ignore unknown" contract).
      } finally {
        this.loadingEmotes.delete(key);
      }
    })();
  }

  protected override afterMixerUpdate(dt: number): void {
    this.vrm.update(dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.vrm.scene);
    this.vrm.scene.parent?.remove(this.vrm.scene);
    VRMUtils.deepDispose(this.vrm.scene);
  }
}

// ── Placed VRM "things": animate a world OBJECT that happens to be a VRM ────────────────────────
// The auton/Atlantean store models are VRMs (skin + VRMC_vrm, ZERO embedded clips). Placed through
// the plain GLTFLoader path they render static; here they instead mount as a real VRM rig and loop a
// retargeted VRMA idle clip (or whatever clip the per-thing Animation HUD picks). This is the same
// VRM load + VRMA retarget the avatars use — minus the locomotion state machine an object never needs.

// The VRMA catalog clips a placed VRM thing can loop. Names mirror the asset-store clips; the HUD
// dropdown lists these for a VRM thing (vs the embedded clip names for a plain GLB thing).
export const VRMA_OBJECT_CLIP_IDS: Record<string, string> = {
  idle: "6a20d88a90ef2a93f06a2037", // Idle
  walk: "6a20d93d90ef2a93f06a2049", // Walking
  wave: "6a20d72890ef2a93f06a2027", // Stand Up and Wave
};

export const vrmaObjectClipNames = (): string[] => Object.keys(VRMA_OBJECT_CLIP_IDS);

/** A lightweight rig for a placed VRM OBJECT: a mixer over the VRM + the retargeted VRMA clips,
 * looping one clip (idle by default). No locomotion — placed things don't walk. update(dt) advances
 * the mixer AND the VRM spring bones (mirrors VrmAvatarRig.afterMixerUpdate). */
export class VrmObjectRig {
  readonly scene: THREE.Object3D;
  private readonly vrm: VRM;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | undefined;
  private disposed = false;

  constructor(vrm: VRM, clips: Record<string, VRMAnimation>) {
    this.vrm = vrm;
    this.scene = vrm.scene;
    this.mixer = new THREE.AnimationMixer(vrm.scene);
    for (const [name, animation] of Object.entries(clips)) {
      const clip = createVRMAnimationClip(animation, vrm);
      clip.name = name;
      this.actions.set(name, this.mixer.clipAction(clip));
    }
  }

  /** Names of the retargeted clips available to loop (drives the HUD dropdown for VRM things). */
  clipNames(): string[] {
    return [...this.actions.keys()];
  }

  hasClips(): boolean {
    return this.actions.size > 0;
  }

  /** Loop one clip by name (exact, then loose match). Empty/unknown → the idle (or first) clip. */
  play(name?: string, fadeSec = 0.25): void {
    if (this.disposed) return;
    const wanted = name?.trim().toLowerCase();
    let next: THREE.AnimationAction | undefined;
    if (wanted) {
      next =
        this.actions.get(wanted) ??
        [...this.actions.entries()].find(
          ([key]) => key.includes(wanted) || wanted.includes(key),
        )?.[1];
    }
    next ??= this.actions.get("idle") ?? this.actions.values().next().value;
    if (!next || next === this.current) return;
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.setEffectiveWeight(1);
    if (fadeSec > 0 && this.current) {
      this.current.fadeOut(fadeSec);
      next.fadeIn(fadeSec);
    }
    next.play();
    this.current = next;
  }

  update(dt: number): void {
    if (this.disposed) return;
    this.mixer.update(dt);
    this.vrm.update(dt);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.vrm.scene);
    VRMUtils.deepDispose(this.vrm.scene);
  }
}

/**
 * Try to load `url` as a VRM object. Resolves a {scene, vrm, clips} bundle when the asset really is a
 * VRM (so the caller can mount it as a rig); resolves null for a plain GLB (caller stays on the
 * existing GLTFLoader path). Store metadata is checked first so regular asset GLBs don't pay for a
 * full VRM-sniff binary download. Never throws for a non-VRM — only a genuine fetch/parse error
 * rejects.
 */
export async function tryLoadVrmObject(
  url: string,
  rendererIsWebGPU: boolean,
): Promise<{ scene: THREE.Object3D; vrm: VRM; clips: Record<string, VRMAnimation> } | null> {
  if (!runtimeConfig.worldApiBase && !url.startsWith("http")) return null;
  if (!(await shouldAttemptVrmObjectLoad(url))) return null;
  const buffer = await fetchAssetBuffer(url);
  // Sniff the glTF JSON for the VRM extension before a full VRM parse (a non-VRM GLB has neither).
  if (!bufferDeclaresVrm(buffer)) return null;
  const gltf = await makeVrmLoader(rendererIsWebGPU).parseAsync(buffer, "");
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) return null;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  if (vrm.lookAt) {
    const lookAtProxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
    lookAtProxy.name = "VRMLookAtQuaternionProxy";
    vrm.scene.add(lookAtProxy);
  }
  vrm.scene.traverse((obj) => {
    obj.frustumCulled = false; // animated skinned meshes sweep outside their rest-pose bounds
  });
  const clipEntries = await Promise.all(
    Object.entries(VRMA_OBJECT_CLIP_IDS).map(async ([name, id]) => {
      const animation = await loadOptionalClip(id, rendererIsWebGPU);
      return animation ? ([name, animation] as const) : null;
    }),
  );
  const clips: Record<string, VRMAnimation> = {};
  for (const entry of clipEntries) if (entry) clips[entry[0]] = entry[1];
  return { scene: vrm.scene, vrm, clips };
}

// A VRM GLB declares the VRM extension in its glTF JSON chunk (VRMC_vrm for VRM1, "VRM" for VRM0).
// Scan the first JSON chunk's bytes for the marker — far cheaper than a full VRM parse, and lets a
// plain GLB skip the VRM path entirely.
function bufferDeclaresVrm(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer);
  // glTF binary: 12-byte header, then chunks (uint32 length, uint32 type, data). The first chunk is
  // JSON (type 0x4E4F534A "JSON"). Scan just that chunk; fall back to scanning a capped prefix.
  let scanStart = 0;
  let scanEnd = Math.min(bytes.length, 1 << 20); // cap at 1 MiB so a huge buffer stays cheap
  if (bytes.length >= 20 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46) {
    const view = new DataView(buffer);
    const jsonLength = view.getUint32(12, true);
    scanStart = 20;
    scanEnd = Math.min(bytes.length, 20 + jsonLength);
  }
  // "VRMC_vrm" / "VRM" appear as ASCII keys in the JSON extensions map.
  const needleVrmc = [0x56, 0x52, 0x4d, 0x43, 0x5f, 0x76, 0x72, 0x6d]; // VRMC_vrm
  const needleVrm = [0x22, 0x56, 0x52, 0x4d, 0x22]; // "VRM"
  const matchAt = (needle: number[], at: number): boolean => {
    for (let k = 0; k < needle.length; k++) if (bytes[at + k] !== needle[k]) return false;
    return true;
  };
  for (let i = scanStart; i < scanEnd; i++) {
    if (matchAt(needleVrmc, i) || matchAt(needleVrm, i)) return true;
  }
  return false;
}

// ── Mounting: swap the procedural body for a rigged model inside the existing group ────────────
function localTopOf(parts: THREE.Object3D[]): number {
  let top = 0;
  for (const part of parts) {
    if (!(part instanceof THREE.Mesh)) continue;
    const geometry = part.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) continue;
    top = Math.max(top, box.max.y * part.scale.y + part.position.y);
  }
  return top;
}

interface ClassicTvLayout {
  tvY: number;
  screenY: number;
  markerY: number;
}

// Capture the procedural TV/screen/marker heights ONCE (before any mount floats them above a rigged
// model) so restoreProceduralAvatar can put the classic robot back exactly when the user swaps.
function rememberClassicLayout(group: THREE.Group): void {
  if (group.userData.classicTvLayout) return;
  const tvBox = group.userData.tvBoxRef as THREE.Object3D | undefined;
  const screen = group.userData.tvScreenRef as THREE.Mesh | undefined;
  const marker = group.userData.markerRef as THREE.Object3D | undefined;
  group.userData.classicTvLayout = {
    tvY: tvBox?.position.y ?? 2.5,
    screenY: screen?.position.y ?? 2.5,
    markerY: marker?.position.y ?? 3.0,
  } satisfies ClassicTvLayout;
}

/** Un-hide the procedural TV-head robot and re-seat the TV/screen/marker at their classic heights.
 * Safe to call on a group that was never upgraded. (Rig disposal already removed the mounted model.) */
export function restoreProceduralAvatar(group: THREE.Group): void {
  // Back to the scale-1 layout first (rig disposal already removed any mounted model); the classic
  // positions below are baseline values and the user scale re-applies via rebaseAvatarScale.
  resetAvatarScaleToBase(group);
  delete group.userData.avatarMountedModel;
  const layout = group.userData.classicTvLayout as ClassicTvLayout | undefined;
  if (layout) {
    const tvBox = group.userData.tvBoxRef as THREE.Object3D | undefined;
    const screen = group.userData.tvScreenRef as THREE.Mesh | undefined;
    const marker = group.userData.markerRef as THREE.Object3D | undefined;
    if (tvBox) tvBox.position.y = layout.tvY;
    if (screen) screen.position.y = layout.screenY;
    if (marker) marker.position.y = layout.markerY;
  }
  const bodyParts = (group.userData.robotBodyParts as THREE.Object3D[] | undefined) ?? [];
  for (const part of bodyParts) part.visible = true;
  rebaseAvatarScale(group);
}

/**
 * Mount a rigged model (VRM robot or GLB animal) inside a procedural-avatar group: scale it to
 * `heightRatio` of the robot's feet→TV-top height, ground its feet on the group origin, hide the
 * procedural body parts and float the TV + presence ring above it (the TV screen stays live —
 * P2P video keeps riding `group.userData.tvScreenRef`). `headLocalY` (computed AFTER the model is
 * added, in group-local space) lets the VRM path float the TV above the actual head bone.
 */
export function mountModelOnAvatar(
  group: THREE.Group,
  model: THREE.Object3D,
  heightRatio: number,
  headLocalY?: () => number | undefined,
): void {
  // Measure + seat everything at scale 1 (a live user scale would skew bodyTop and the once-only
  // classic-layout capture); rebaseAvatarScale at the end re-applies the user factor on the new
  // layout — so a slider move never needs a rig rebuild, and a rebuild keeps the slider value.
  resetAvatarScaleToBase(group);
  rememberClassicLayout(group);
  const bodyParts = (group.userData.robotBodyParts as THREE.Object3D[] | undefined) ?? [];
  const tvBox = group.userData.tvBoxRef as THREE.Object3D | undefined;
  const screen = group.userData.tvScreenRef as THREE.Mesh | undefined;
  const marker = group.userData.markerRef as THREE.Object3D | undefined;

  // Measure the procedural robot (feet→TV-top) so the upgraded avatar keeps a comparable height.
  const bodyTop = Math.max(1, localTopOf(tvBox ? [...bodyParts, tvBox] : bodyParts));

  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const rawHeight = Math.max(0.01, bounds.max.y - bounds.min.y);
  const targetHeight = bodyTop * heightRatio;
  const scale = targetHeight / rawHeight;
  model.scale.setScalar(scale);
  // Feet on the group origin, body centered over it (animals' rest pose can be offset on x/z).
  model.position.set(
    -((bounds.min.x + bounds.max.x) / 2) * scale,
    -bounds.min.y * scale,
    -((bounds.min.z + bounds.max.z) / 2) * scale,
  );

  group.add(model);
  group.updateMatrixWorld(true);

  // Float the TV (and its screen — P2P video keeps working untouched) above the model's head.
  let headTopY = targetHeight;
  const headY = headLocalY?.();
  if (headY !== undefined) headTopY = Math.max(headTopY, headY + 0.35);
  const tvCenterY = headTopY + 0.5;
  if (tvBox) tvBox.position.y = tvCenterY;
  if (screen) screen.position.y = tvCenterY; // keeps its +Z offset flush on the TV front
  if (marker) marker.position.y = tvCenterY + 0.65;

  for (const part of bodyParts) part.visible = false;
  group.userData.avatarMountedModel = model;
  rebaseAvatarScale(group);
}

function mountVrmOnAvatar(group: THREE.Group, vrm: VRM): void {
  mountModelOnAvatar(group, vrm.scene, VRM_BODY_HEIGHT_RATIO, () => {
    const head = vrm.humanoid?.getNormalizedBoneNode("head");
    if (!head) return undefined;
    const headPos = head.getWorldPosition(new THREE.Vector3());
    group.worldToLocal(headPos);
    return headPos.y;
    });
}

export function vrmaMetadataForNameSync(name: string): AssetAnimationMetadata | undefined {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  return vrmaEntriesSync().find((entry) => entry.name.trim().toLowerCase() === wanted)?.metadata;
}

/**
 * Upgrade a procedural TV-head avatar group to a rigged VRM robot. Resolves null (procedural
 * avatar untouched) when: the classic escape hatch is set (deterministic picks only — an explicit
 * `storeId` from the avatar picker overrides it), no API base is configured, or anything about
 * the load fails. idle+walk clips are required; wave/jump are best-effort.
 */
export async function attachVrmAvatar(
  group: THREE.Group,
  visitorId: string,
  rendererIsWebGPU: boolean,
  storeId?: string,
  stillWanted?: () => boolean,
): Promise<AvatarRig | null> {
  if (!storeId && classicAvatarRequested()) return null;
  if (!runtimeConfig.worldApiBase) return null;
  // Warm the emote catalogue in the background so the first play_animation isn't waiting on a cold
  // fetch (resolves to the built-in clips immediately if /api/vrma isn't live yet).
  void loadVrmaCatalog();
  try {
    const [vrm, idle, walk, jump, wave] = await Promise.all([
      loadVrm(assetDownloadUrl(storeId ?? pickAvatarId(visitorId)), rendererIsWebGPU),
      loadOptionalClip(CLIP_IDS.idle, rendererIsWebGPU),
      loadOptionalClip(CLIP_IDS.walk, rendererIsWebGPU),
      loadOptionalClip(CLIP_IDS.jump, rendererIsWebGPU),
      loadOptionalClip(CLIP_IDS.wave, rendererIsWebGPU),
    ]);
    if (!idle || !walk) {
      VRMUtils.deepDispose(vrm.scene);
      throw new Error("idle/walk animation clips unavailable");
    }
    // A newer selection (or a prune) superseded this load while it was in flight — never mount a
    // stale model over the current one (mounting also repositions the floating TV).
    if (stillWanted && !stillWanted()) {
      VRMUtils.deepDispose(vrm.scene);
      return null;
    }
    mountVrmOnAvatar(group, vrm);
    return new VrmAvatarRig(group, vrm, { idle, walk, jump, wave }, rendererIsWebGPU);
  } catch (error) {
    if (!warnedVrmLoadFailure) {
      warnedVrmLoadFailure = true;
      console.warn(
        "[avatar] VRM avatar load failed — keeping the classic TV-head robot",
        error,
      );
    }
    return null;
  }
}
