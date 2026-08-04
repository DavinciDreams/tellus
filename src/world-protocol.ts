import {
  animationIntents,
  type AnimationIntent,
  type AssetAnimationMetadata,
} from "./tellus-animation-intents";

export type TerrainPaintKind =
  | "meadow"
  | "grass"
  | "rock"
  | "snow"
  | "beach"
  | "dirt"
  | "forest-floor"
  | "flowers"
  | "gravel"
  | "jungle-moss"
  | "stone"
  | "brick"
  | "desert-sand";
export type TerrainEditMode = "raise" | "lower" | "flatten" | TerrainPaintKind;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TellusTerrainState {
  version: number;
  revision: number;
  terrainSculptOffsets: number[];
  terrainPaint: number[];
  distantIslandSculptOffsets: Record<string, number[]>;
  distantIslandPaint: Record<string, number[]>;
  savedAt: string;
}

export interface WorldPresence {
  visitorId: string;
  name?: string;
  position?: Vec3;
  /** Catalog avatar id chosen by this visitor ("classic", "vrm:<storeId>", "glb:<storeId>");
   * absent/empty = the deterministic per-visitor default pick. */
  avatarId?: string;
  /** Visual avatar size multiplier (server clamps to [0.1, 8]); ABSENT = unset → 1. A mid-rollout
   * server may strip the field — receivers keep their last-known value on absent (the same
   * convention as avatarId/animation). */
  avatarScale?: number;
  /** The logged-in account that owns this connection (absent for anonymous sessions). Used to collapse
   * a single human's multiple live connections (stale tabs / reconnects) into one displayed player. */
  ownerUserId?: string;
  connectedAt: string;
  lastSeenAt: string;
}

export const PRESENCE_DISPLAY_TTL_MS = 120_000;

export interface GenerationJobRequest {
  prompt: string;
  creatorId: string;
  location?: Vec3 | "near-agent" | "near-mountain" | "near-pond";
  scale?: number;
}

export interface WorldGeneratedThing {
  id: string;
  kind: string;
  prompt: string;
  creatorId: string;
  ownerUserId?: string;
  position: Vec3;
  rotationX?: number;
  rotationY: number;
  rotationZ?: number;
  scale: number;
  color: number;
  /** Ground-relative vertical placement. Zero means grounded; missing legacy values normalize to zero. */
  verticalOffset?: number;
  vehicleMode?: "water" | "air" | "ground";
  hasAnimations?: boolean;
  /** Immutable 3D Asset Manager model id. modelUrl is a cached/resolved fetch URL. */
  assetStoreModelId?: string;
  modelUrl?: string;
  pipelineId?: string;
  generationStatus?: "local" | "queued" | "generating" | "ready" | "failed";
  /** Embedded animation clip to loop on the placed model ("" / absent = the default
   * idle-ish heuristic pick). Rides generated.upsert + snapshot/patches like any other field. */
  animation?: string;
  /** Companion ownership. Pets follow their owner and are separate from mounts. */
  petOwnerId?: string;
  /** Optional asset-store enrichment for clip intent/category search. Older gateways omit it. */
  animationClips?: AssetAnimationMetadata[];
  updatedAt: string;
}

export type WildlifeMovementMode = "ground" | "air" | "water";
export type WildlifeBehaviorStateName =
  | "idle"
  | "graze"
  | "wander"
  | "travel"
  | "alert"
  | "flee"
  | "return"
  | "rest"
  | "blocked";
export type WildlifeControllerMode =
  | "individual-command"
  | "herd-command"
  | "ambient"
  | "static";
export type WildlifeCommandIntent =
  | "idle"
  | "graze"
  | "wander"
  | "travel"
  | "flee"
  | "return"
  | "gather";

export interface WildlifeHomeRange {
  kind: "circle";
  center: { x: number; z: number };
  radiusMeters: number;
}

/** Durable opt-in configuration keyed by WorldGeneratedThing.id. */
export interface WildlifeAnimalConfig {
  animalId: string;
  enabled: boolean;
  speciesProfileId: string;
  movementMode: WildlifeMovementMode;
  herdId?: string;
  home?: WildlifeHomeRange;
  seed: number;
  populationEligible?: boolean;
  revision: number;
}

export interface WildlifeAnimalState {
  animalId: string;
  herdId: string;
  state: WildlifeBehaviorStateName;
  animationIntent: AnimationIntent;
  position: Vec3;
  rotationY: number;
  destination?: Vec3;
  threat?: Vec3;
  speedMetersPerSecond: number;
  startedAt: string;
  expiresAt?: string;
  controllerMode: WildlifeControllerMode;
  revision: number;
}

export interface WildlifeHerdState {
  herdId: string;
  speciesProfileId: string;
  movementMode: WildlifeMovementMode;
  memberIds: string[];
  state: WildlifeBehaviorStateName;
  animationIntent: AnimationIntent;
  destination?: Vec3;
  threat?: Vec3;
  home: WildlifeHomeRange;
  populationTarget?: number;
  populationCap: number;
  seed: number;
  revision: number;
  updatedAt: string;
}

export type WildlifeSelector =
  | { animalId: string }
  | { herdId: string }
  | { speciesProfileId: string }
  | { region: { center: Vec3; radiusMeters: number } }
  | { all: true };

export interface WildlifePatchAnimal {
  id: string;
  position: Vec3;
  rotationY: number;
  state: WildlifeBehaviorStateName;
  animationIntent: AnimationIntent;
  speedMetersPerSecond: number;
  revision: number;
}

export interface WildlifePatch {
  type: "wildlife.patch";
  seq: number;
  serverTime: string;
  herdId: string;
  animals: WildlifePatchAnimal[];
}

export interface WildlifeCommandReceipt {
  requestId: string;
  status: "accepted" | "partially-accepted" | "rejected" | "completed" | "expired" | "failed";
  matchedAnimals: number;
  matchedHerds: number;
  rejectedAnimals?: number;
  reasonCode?: string;
  issuedBy: string;
  acceptedAt?: string;
  expiresAt?: string;
}

/** A one-shot emote broadcast: play `animation` ONCE on `visitorId`'s avatar rig, then resume
 * locomotion. Arrives as a live frame: { type: "emote", emote: { visitorId, animation } }. */
export interface EmoteFrame {
  visitorId: string;
  animation: string;
}

export type WorldChatChannel = "world" | "nearby" | "dm";

export interface WorldChatMessage {
  id: string;
  visitorId: string;
  senderName?: string;
  text: string;
  channel: WorldChatChannel;
  recipientId?: string;
  recipientName?: string;
  position?: Vec3;
  createdAt: string;
}

// TELLUS INFINITY — portals (Phase 2; defined now, DARK). NESTED target (frozen wire shape): keeps
// exterior-world, indoor-scene, and future non-world targets extensible without changing the wire. Mirrors
// the Hyades WorldPortal/WorldPortalTarget DTOs (docs/TELLUS_COMPAT_MATRIX.md).
export interface WorldPortalTarget {
  kind: "world" | "interior";
  worldId: string;
  spawn?: Vec3;
  sceneUrl?: string;
  returnPortalId?: string;
}

export interface WorldPortal {
  id: string;
  worldId: string;
  label: string;
  position: Vec3;
  radius: number;
  rotation?: Vec3;
  target: WorldPortalTarget;
  createdBy?: string;
  createdAt?: string;
  anchorThingId?: string;
  /** Local-space offset from the anchor asset origin. Older anchored portals omit this and use position. */
  anchorOffset?: Vec3;
}

export interface WorldProcPlantPlacement {
  id: string;
  presetId: string;
  seed: number;
  position: Vec3;
  scale: number;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type WorldAction =
  | {
      type: "presence.update";
      visitorId: string;
      name?: string;
      position?: Vec3;
      /** Avatar selection broadcast with presence; "" clears (server omits null). */
      avatarId?: string;
      /** Avatar size multiplier broadcast with presence; server clamps [0.1, 8], ≤0 clears. */
      avatarScale?: number;
    }
  | {
      type: "terrain.replace";
      visitorId: string;
      terrain: TellusTerrainState;
    }
  | {
      type: "terrain.sculpt";
      visitorId: string;
      mode: TerrainEditMode;
      center: Vec3;
      radius?: number;
    }
  | {
      type: "generation.request";
      visitorId: string;
      request: GenerationJobRequest;
    }
  | {
      type: "generated.upsert";
      visitorId: string;
      thing: WorldGeneratedThing;
    }
  | {
      type: "generated.delete";
      visitorId: string;
      id: string;
    }
  | {
      type: "world.portal.upsert";
      visitorId: string;
      portal: WorldPortal;
    }
  | {
      type: "world.portal.delete";
      visitorId: string;
      portalId: string;
    }
  | {
      type: "procplant.upsert";
      visitorId: string;
      placement: WorldProcPlantPlacement;
    }
  | {
      type: "procplant.delete";
      visitorId: string;
      id: string;
    }
  | {
      type: "world.chat";
      visitorId: string;
      message: WorldChatMessage;
    }
  | {
      type: "wildlife.configure";
      visitorId: string;
      requestId: string;
      config: WildlifeAnimalConfig;
    }
  | {
      type: "wildlife.command";
      visitorId: string;
      requestId: string;
      selector: WildlifeSelector;
      intent: WildlifeCommandIntent;
      destination?: Vec3;
      from?: Vec3;
      region?: { center: Vec3; radiusMeters: number };
      durationSeconds?: number;
      reason?: string;
    };

export type WorldPatch =
  | {
      type: "world.snapshot";
      worldId: string;
      terrain: TellusTerrainState;
      presence: WorldPresence[];
      generated: WorldGeneratedThing[];
      chat?: WorldChatMessage[];
      queuedGenerationJobs: QueuedGenerationJob[];
      // TELLUS INFINITY: render/gameplay substrate the client provider-selector negotiates on a cold load
      // (classic|chunked|tiles|interior|evoflow). Omitted by legacy backends ⇒ infer from the worldId prefix.
      terrainProviderKind?: string;
      // Portals in this world (Phase 2; omitted while the backend flag is dark).
      portals?: WorldPortal[];
      // Phase 3 interiors: a GLB scene url the client renders instead of terrain (cold-load aware).
      sceneUrl?: string;
      // Phase 4 tiles: a 3D Tileset url the client mounts as the render substrate (gameplay = baked chunks).
      tileSetUrl?: string;
      // Chunked procedural plant placements (manual scatter, persisted/broadcast by Hyades).
      procPlantPlacements?: WorldProcPlantPlacement[];
      wildlifeAnimals?: WildlifeAnimalConfig[];
      wildlifeStates?: WildlifeAnimalState[];
      wildlifeHerds?: WildlifeHerdState[];
    }
  | {
      type: "presence.updated";
      presence: WorldPresence[];
    }
  | {
      type: "terrain.updated";
      terrain: TellusTerrainState;
      actorId: string;
    }
  | {
      type: "generation.queued";
      job: QueuedGenerationJob;
    }
  | {
      type: "generated.updated";
      thing: WorldGeneratedThing;
      actorId: string;
    }
  | {
      type: "generated.deleted";
      id: string;
      actorId: string;
    }
  | {
      type: "procplant.updated";
      placement: WorldProcPlantPlacement;
      actorId: string;
    }
  | {
      type: "procplant.deleted";
      id: string;
      actorId: string;
    }
  | {
      type: "emote";
      emote: EmoteFrame;
    }
  | {
      type: "world.chat";
      message: WorldChatMessage;
    }
  | {
      type: "action.rejected";
      actionType: string;
      reason: string;
    }
  | WildlifePatch
  | {
      type: "wildlife.configured";
      wildlifeAnimals: WildlifeAnimalConfig[];
      actorId?: string;
    }
  | {
      type: "wildlife.command.receipt";
      receipt: WildlifeCommandReceipt;
    }
  | ChunkUpdatedPatch;

export interface ChunkData {
  cx: number;
  cz: number;
  revision: number;
  segments: number; // 64
  sculptOffsets: number[]; // 4225, row-major (z-outer/x-inner); [] when revision 0 (flat)
  paint: number[]; // 4225 ints; code 0 = unpainted
  /** Omitted/offset = sculptOffsets are added to the procedural base. absolute = sculptOffsets are world Y. */
  heightMode?: "offset" | "absolute";
}

export interface ChunkManifestEntry {
  cx: number;
  cz: number;
  revision: number;
}

export interface ChunksManifest {
  width: number;
  height: number;
  span: number; // 96
  segments: number; // 64
  chunks: ChunkManifestEntry[];
  /** Ordered paint-code contract advertised by Hyades; absent on older/static manifests. */
  paintKinds?: string[];
}

export interface ChunkUpdatedPatch {
  type: "chunk.updated";
  chunkX: number;
  chunkZ: number;
  seq: number;
}

export interface QueuedGenerationJob {
  id: string;
  worldId: string;
  request: GenerationJobRequest;
  status: "queued" | "generating" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isVec3(value: unknown): value is Vec3 {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.z === "number" &&
    Number.isFinite(value.z)
  );
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function isNumberArrayRecord(value: unknown): value is Record<string, number[]> {
  return isRecord(value) && Object.values(value).every(isNumberArray);
}

export function isWorldGeneratedThing(value: unknown): value is WorldGeneratedThing {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.kind !== "string" ||
    typeof value.prompt !== "string" ||
    typeof value.creatorId !== "string" ||
    (value.ownerUserId !== undefined && typeof value.ownerUserId !== "string") ||
    !isVec3(value.position) ||
    (value.rotationX !== undefined &&
      (typeof value.rotationX !== "number" ||
        !Number.isFinite(value.rotationX))) ||
    typeof value.rotationY !== "number" ||
    !Number.isFinite(value.rotationY) ||
    (value.rotationZ !== undefined &&
      (typeof value.rotationZ !== "number" ||
        !Number.isFinite(value.rotationZ))) ||
    typeof value.scale !== "number" ||
    !Number.isFinite(value.scale) ||
    typeof value.color !== "number" ||
    !Number.isFinite(value.color) ||
    (value.verticalOffset !== undefined &&
      (typeof value.verticalOffset !== "number" || !Number.isFinite(value.verticalOffset))) ||
    (value.vehicleMode !== undefined &&
      value.vehicleMode !== "water" &&
      value.vehicleMode !== "air" &&
      value.vehicleMode !== "ground") ||
    (value.hasAnimations !== undefined && typeof value.hasAnimations !== "boolean") ||
    typeof value.updatedAt !== "string"
  ) {
    return false;
  }
  return (
    (value.assetStoreModelId === undefined || typeof value.assetStoreModelId === "string") &&
    (value.modelUrl === undefined || typeof value.modelUrl === "string") &&
    (value.pipelineId === undefined || typeof value.pipelineId === "string") &&
    (value.animation === undefined || typeof value.animation === "string") &&
    (value.petOwnerId === undefined || typeof value.petOwnerId === "string") &&
    (value.generationStatus === undefined ||
      value.generationStatus === "local" ||
      value.generationStatus === "queued" ||
      value.generationStatus === "generating" ||
      value.generationStatus === "ready" ||
      value.generationStatus === "failed")
  );
}

export function isTellusTerrainState(value: unknown): value is TellusTerrainState {
  return (
    isRecord(value) &&
    typeof value.version === "number" &&
    typeof value.revision === "number" &&
    isNumberArray(value.terrainSculptOffsets) &&
    isNumberArray(value.terrainPaint) &&
    isNumberArrayRecord(value.distantIslandSculptOffsets) &&
    isNumberArrayRecord(value.distantIslandPaint) &&
    typeof value.savedAt === "string"
  );
}

/** Extract the emote frame from a live WS message ({ type: "emote", emote: {...} }); null when
 * the frame is anything else or malformed. */
export function emoteFromWorldPatch(parsed: unknown): EmoteFrame | null {
  if (!isRecord(parsed) || parsed.type !== "emote" || !isRecord(parsed.emote)) {
    return null;
  }
  const emote = parsed.emote;
  if (
    typeof emote.visitorId !== "string" ||
    emote.visitorId.length === 0 ||
    typeof emote.animation !== "string" ||
    emote.animation.length === 0
  ) {
    return null;
  }
  return { visitorId: emote.visitorId, animation: emote.animation };
}

export function isWorldChatMessage(value: unknown): value is WorldChatMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.visitorId === "string" &&
    value.visitorId.length > 0 &&
    (value.senderName === undefined || typeof value.senderName === "string") &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    (value.channel === "world" || value.channel === "nearby" || value.channel === "dm") &&
    (value.recipientId === undefined || typeof value.recipientId === "string") &&
    (value.recipientName === undefined || typeof value.recipientName === "string") &&
    (value.position === undefined || isVec3(value.position)) &&
    typeof value.createdAt === "string"
  );
}

export function worldChatFromWorldPatch(parsed: unknown): WorldChatMessage[] | null {
  if (!isRecord(parsed)) return null;
  if (parsed.type === "world.snapshot" && Array.isArray(parsed.chat)) {
    return parsed.chat.filter(isWorldChatMessage);
  }
  if (parsed.type === "world.chat" && isWorldChatMessage(parsed.message)) {
    return [parsed.message];
  }
  return null;
}

// ── TELLUS INFINITY portals (Phase 2 frontend) ──
export function isWorldPortal(value: unknown): value is WorldPortal {
  if (!isRecord(value)) return false;
  const t = value.target;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.label === "string" &&
    isVec3(value.position) &&
    typeof value.radius === "number" &&
    isRecord(t) &&
    (t.kind === "world" || t.kind === "interior") &&
    typeof t.worldId === "string" &&
    (t.spawn === undefined || isVec3(t.spawn)) &&
    (t.sceneUrl === undefined || typeof t.sceneUrl === "string")
  );
}

/** Portals carried by world.snapshot (full set) or portal.updated (single). null on anything else. */
export function portalsFromWorldPatch(parsed: unknown): WorldPortal[] | null {
  if (!isRecord(parsed)) return null;
  if (parsed.type === "world.snapshot" && Array.isArray(parsed.portals)) {
    return parsed.portals.filter(isWorldPortal);
  }
  if ((parsed.type === "portal.updated" || parsed.type === "world.portal.updated") && isWorldPortal(parsed.portal)) {
    return [parsed.portal];
  }
  return null;
}

/** A portal.deleted patch's id, or null. */
export function portalDeletedFromWorldPatch(parsed: unknown): string | null {
  if (!isRecord(parsed) || (parsed.type !== "portal.deleted" && parsed.type !== "world.portal.deleted")) return null;
  return typeof parsed.portalId === "string" ? parsed.portalId : null;
}

export function isWorldProcPlantPlacement(value: unknown): value is WorldProcPlantPlacement {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.presetId === "string" &&
    value.presetId.length > 0 &&
    typeof value.seed === "number" &&
    Number.isFinite(value.seed) &&
    isVec3(value.position) &&
    typeof value.scale === "number" &&
    Number.isFinite(value.scale)
  );
}

export function procPlantPlacementsFromWorldPatch(parsed: unknown): WorldProcPlantPlacement[] | null {
  if (!isRecord(parsed)) return null;
  if (parsed.type === "world.snapshot" && Array.isArray(parsed.procPlantPlacements)) {
    return parsed.procPlantPlacements.filter(isWorldProcPlantPlacement);
  }
  if (parsed.type === "procplant.updated" && isWorldProcPlantPlacement(parsed.placement)) {
    return [parsed.placement];
  }
  return null;
}

export function procPlantDeletedFromWorldPatch(parsed: unknown): string | null {
  if (!isRecord(parsed) || parsed.type !== "procplant.deleted") return null;
  return typeof parsed.id === "string" ? parsed.id : null;
}

const wildlifeStates = new Set<WildlifeBehaviorStateName>([
  "idle", "graze", "wander", "travel", "alert", "flee", "return", "rest", "blocked",
]);
const wildlifeMovementModes = new Set<WildlifeMovementMode>(["ground", "air", "water"]);
const wildlifeControllerModes = new Set<WildlifeControllerMode>([
  "individual-command", "herd-command", "ambient", "static",
]);
const wildlifeCommandIntents = new Set<WildlifeCommandIntent>([
  "idle", "graze", "wander", "travel", "flee", "return", "gather",
]);
const animationIntentSet = new Set<string>(animationIntents);

const isWildlifeHomeRange = (value: unknown): value is WildlifeHomeRange =>
  isRecord(value) &&
  value.kind === "circle" &&
  isRecord(value.center) &&
  typeof value.center.x === "number" && Number.isFinite(value.center.x) &&
  typeof value.center.z === "number" && Number.isFinite(value.center.z) &&
  typeof value.radiusMeters === "number" && Number.isFinite(value.radiusMeters) &&
  value.radiusMeters > 0;

export function isWildlifeAnimalConfig(value: unknown): value is WildlifeAnimalConfig {
  return (
    isRecord(value) &&
    typeof value.animalId === "string" && value.animalId.length > 0 &&
    typeof value.enabled === "boolean" &&
    typeof value.speciesProfileId === "string" && value.speciesProfileId.length > 0 &&
    typeof value.movementMode === "string" && wildlifeMovementModes.has(value.movementMode as WildlifeMovementMode) &&
    (value.herdId === undefined || typeof value.herdId === "string") &&
    (value.home === undefined || isWildlifeHomeRange(value.home)) &&
    typeof value.seed === "number" && Number.isFinite(value.seed) &&
    (value.populationEligible === undefined || typeof value.populationEligible === "boolean") &&
    typeof value.revision === "number" && Number.isInteger(value.revision) && value.revision >= 0
  );
}

export function isWildlifeAnimalState(value: unknown): value is WildlifeAnimalState {
  return (
    isRecord(value) &&
    typeof value.animalId === "string" && value.animalId.length > 0 &&
    typeof value.herdId === "string" && value.herdId.length > 0 &&
    typeof value.state === "string" && wildlifeStates.has(value.state as WildlifeBehaviorStateName) &&
    typeof value.animationIntent === "string" && animationIntentSet.has(value.animationIntent) &&
    isVec3(value.position) &&
    typeof value.rotationY === "number" && Number.isFinite(value.rotationY) &&
    (value.destination === undefined || isVec3(value.destination)) &&
    (value.threat === undefined || isVec3(value.threat)) &&
    typeof value.speedMetersPerSecond === "number" && Number.isFinite(value.speedMetersPerSecond) && value.speedMetersPerSecond >= 0 &&
    typeof value.startedAt === "string" &&
    (value.expiresAt === undefined || typeof value.expiresAt === "string") &&
    typeof value.controllerMode === "string" && wildlifeControllerModes.has(value.controllerMode as WildlifeControllerMode) &&
    typeof value.revision === "number" && Number.isInteger(value.revision) && value.revision >= 0
  );
}

export function isWildlifeHerdState(value: unknown): value is WildlifeHerdState {
  return (
    isRecord(value) &&
    typeof value.herdId === "string" && value.herdId.length > 0 &&
    typeof value.speciesProfileId === "string" && value.speciesProfileId.length > 0 &&
    typeof value.movementMode === "string" && wildlifeMovementModes.has(value.movementMode as WildlifeMovementMode) &&
    Array.isArray(value.memberIds) && value.memberIds.every((id) => typeof id === "string" && id.length > 0) &&
    typeof value.state === "string" && wildlifeStates.has(value.state as WildlifeBehaviorStateName) &&
    typeof value.animationIntent === "string" && animationIntentSet.has(value.animationIntent) &&
    (value.destination === undefined || isVec3(value.destination)) &&
    (value.threat === undefined || isVec3(value.threat)) &&
    isWildlifeHomeRange(value.home) &&
    (value.populationTarget === undefined || (typeof value.populationTarget === "number" && Number.isInteger(value.populationTarget) && value.populationTarget >= 0)) &&
    typeof value.populationCap === "number" && Number.isInteger(value.populationCap) && value.populationCap >= 0 &&
    typeof value.seed === "number" && Number.isFinite(value.seed) &&
    typeof value.revision === "number" && Number.isInteger(value.revision) && value.revision >= 0 &&
    typeof value.updatedAt === "string"
  );
}

export function isWildlifePatchAnimal(value: unknown): value is WildlifePatchAnimal {
  return (
    isRecord(value) &&
    typeof value.id === "string" && value.id.length > 0 &&
    isVec3(value.position) &&
    typeof value.rotationY === "number" && Number.isFinite(value.rotationY) &&
    typeof value.state === "string" && wildlifeStates.has(value.state as WildlifeBehaviorStateName) &&
    typeof value.animationIntent === "string" && animationIntentSet.has(value.animationIntent) &&
    typeof value.speedMetersPerSecond === "number" && Number.isFinite(value.speedMetersPerSecond) && value.speedMetersPerSecond >= 0 &&
    typeof value.revision === "number" && Number.isInteger(value.revision) && value.revision >= 0
  );
}

export function wildlifePatchFromWorldPatch(value: unknown): WildlifePatch | null {
  if (
    !isRecord(value) || value.type !== "wildlife.patch" ||
    typeof value.seq !== "number" || !Number.isInteger(value.seq) || value.seq < 0 ||
    typeof value.serverTime !== "string" ||
    typeof value.herdId !== "string" || value.herdId.length === 0 ||
    !Array.isArray(value.animals)
  ) return null;
  const animals = value.animals.filter(isWildlifePatchAnimal);
  if (animals.length !== value.animals.length) return null;
  return { type: "wildlife.patch", seq: value.seq, serverTime: value.serverTime, herdId: value.herdId, animals };
}

export function wildlifeSnapshotFromWorldPatch(value: unknown): {
  animals: WildlifeAnimalConfig[];
  states: WildlifeAnimalState[];
  herds: WildlifeHerdState[];
} | null {
  if (!isRecord(value) || value.type !== "world.snapshot") return null;
  const animals = Array.isArray(value.wildlifeAnimals) ? value.wildlifeAnimals.filter(isWildlifeAnimalConfig) : [];
  const states = Array.isArray(value.wildlifeStates) ? value.wildlifeStates.filter(isWildlifeAnimalState) : [];
  const herds = Array.isArray(value.wildlifeHerds) ? value.wildlifeHerds.filter(isWildlifeHerdState) : [];
  return { animals, states, herds };
}

export function wildlifeConfiguredFromWorldPatch(value: unknown): WildlifeAnimalConfig[] | null {
  if (!isRecord(value) || value.type !== "wildlife.configured" || !Array.isArray(value.wildlifeAnimals)) {
    return null;
  }
  const configs = value.wildlifeAnimals.filter(isWildlifeAnimalConfig);
  return configs.length === value.wildlifeAnimals.length ? configs : null;
}

export function wildlifeCommandReceiptFromWorldPatch(value: unknown): WildlifeCommandReceipt | null {
  if (!isRecord(value) || value.type !== "wildlife.command.receipt" || !isRecord(value.receipt)) {
    return null;
  }
  const receipt = value.receipt;
  const statuses = new Set<WildlifeCommandReceipt["status"]>([
    "accepted", "partially-accepted", "rejected", "completed", "expired", "failed",
  ]);
  if (
    typeof receipt.requestId !== "string" || receipt.requestId.length === 0 ||
    typeof receipt.status !== "string" || !statuses.has(receipt.status as WildlifeCommandReceipt["status"]) ||
    typeof receipt.matchedAnimals !== "number" || !Number.isInteger(receipt.matchedAnimals) || receipt.matchedAnimals < 0 ||
    typeof receipt.matchedHerds !== "number" || !Number.isInteger(receipt.matchedHerds) || receipt.matchedHerds < 0 ||
    (receipt.rejectedAnimals !== undefined &&
      (typeof receipt.rejectedAnimals !== "number" || !Number.isInteger(receipt.rejectedAnimals) || receipt.rejectedAnimals < 0)) ||
    (receipt.reasonCode !== undefined && typeof receipt.reasonCode !== "string") ||
    typeof receipt.issuedBy !== "string" || receipt.issuedBy.length === 0 ||
    (receipt.acceptedAt !== undefined && typeof receipt.acceptedAt !== "string") ||
    (receipt.expiresAt !== undefined && typeof receipt.expiresAt !== "string")
  ) return null;
  return receipt as unknown as WildlifeCommandReceipt;
}

function isWildlifeSelector(value: unknown): value is WildlifeSelector {
  if (!isRecord(value)) return false;
  if (typeof value.animalId === "string") return value.animalId.length > 0;
  if (typeof value.herdId === "string") return value.herdId.length > 0;
  if (typeof value.speciesProfileId === "string") return value.speciesProfileId.length > 0;
  if (value.all === true) return true;
  return isRecord(value.region) && isVec3(value.region.center) &&
    typeof value.region.radiusMeters === "number" && Number.isFinite(value.region.radiusMeters) && value.region.radiusMeters > 0;
}

export interface PortalEntered {
  portalId: string;
  fromWorldId: string;
  toWorldId: string;
  spawn?: Vec3;
  sceneUrl?: string;
}

// ── TELLUS INFINITY biomes (Phase 6 frontend) ──
export interface WorldBiomeCell {
  cx: number;
  cz: number;
  biome: string;
  becoming?: string;
  intensity?: number;
}

export function isWorldBiomeCell(value: unknown): value is WorldBiomeCell {
  return (
    isRecord(value) &&
    typeof value.cx === "number" &&
    typeof value.cz === "number" &&
    typeof value.biome === "string"
  );
}

/** Changed (or seeded) biome cells from a world.biome.patch, or null. Diff-only — merge into the local grid. */
export function biomeCellsFromWorldPatch(parsed: unknown): WorldBiomeCell[] | null {
  if (!isRecord(parsed) || parsed.type !== "world.biome.patch" || !Array.isArray(parsed.biomeCells)) return null;
  return parsed.biomeCells.filter(isWorldBiomeCell);
}

/**
 * Full biome set from the authoritative initial world.snapshot. Diff patches only carry CHANGED cells, so
 * without seeding from the snapshot the client shows no biomes until the next tick fires (up to 10 min).
 * Returns the cells for a snapshot carrying a biomeCells array, else null (reset the local grid on switch).
 */
export function biomeCellsFromSnapshot(parsed: unknown): WorldBiomeCell[] | null {
  if (!isRecord(parsed) || parsed.type !== "world.snapshot" || !Array.isArray(parsed.biomeCells)) return null;
  return parsed.biomeCells.filter(isWorldBiomeCell);
}

/**
 * Collapse a presence roster to one entry per human so a single account never shows as several "players".
 * A logged-in human commonly holds multiple live connections (stale background tabs, or a reconnect that
 * opened a fresh socket) — each carries the same ownerUserId but a distinct visitorId. Keep only the
 * most-recently-seen slot per owner, and DROP the viewer's own other connections entirely (they're
 * rendered locally, never as a remote). Agents (agent:* — own lifecycle) and anonymous entries (no
 * ownerUserId) are never collapsed.
 */
export function dedupePresenceForDisplay(
  presence: WorldPresence[],
  myOwnerUserId: string | null,
  nowMs = Date.now(),
  myVisitorId?: string | null,
): WorldPresence[] {
  const livePresence = presence.filter((r) => isLivePresence(r, nowMs));
  const isAgent = (v: string) => v.startsWith("agent:");
  const newestByOwner = new Map<string, WorldPresence>();
  for (const r of livePresence) {
    if (isAgent(r.visitorId) || !r.ownerUserId) continue;
    const cur = newestByOwner.get(r.ownerUserId);
    if (!cur || (r.lastSeenAt ?? "") > (cur.lastSeenAt ?? "")) newestByOwner.set(r.ownerUserId, r);
  }
  return livePresence.filter((r) => {
    if (myVisitorId && r.visitorId === myVisitorId) return false;
    if (isAgent(r.visitorId) || !r.ownerUserId) return true; // agents + anonymous: keep every slot
    if (myOwnerUserId && r.ownerUserId === myOwnerUserId) return false; // my own other tabs/sockets
    return newestByOwner.get(r.ownerUserId)?.visitorId === r.visitorId; // one slot per other account
  });
}

export function isLivePresence(presence: WorldPresence, nowMs = Date.now()): boolean {
  const lastSeenMs = Date.parse(presence.lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) return true;
  return lastSeenMs >= nowMs - PRESENCE_DISPLAY_TTL_MS;
}

const generatedCloneKey = (thing: Pick<WorldGeneratedThing, "kind" | "prompt">): string =>
  `${thing.kind.trim().toLowerCase()}\u0000${thing.prompt.trim().toLowerCase()}`;

export function repairGeneratedCloneModelLinks(
  things: WorldGeneratedThing[],
  existing: WorldGeneratedThing[] = [],
): { things: WorldGeneratedThing[]; repairedIds: string[] } {
  const donors = new Map<string, WorldGeneratedThing>();
  for (const thing of [...existing, ...things]) {
    if (!thing.modelUrl || thing.generationStatus !== "ready") continue;
    const key = generatedCloneKey(thing);
    if (!donors.has(key)) donors.set(key, thing);
  }
  const repairedIds: string[] = [];
  const repairedThings = things.map((thing) => {
    if (thing.modelUrl || thing.generationStatus !== "failed") return thing;
    const donor = donors.get(generatedCloneKey(thing));
    if (!donor?.modelUrl) return thing;
    repairedIds.push(thing.id);
    return {
      ...thing,
      assetStoreModelId: thing.assetStoreModelId ?? donor.assetStoreModelId,
      modelUrl: donor.modelUrl,
      pipelineId: undefined,
      generationStatus: "ready" as const,
      updatedAt: new Date().toISOString(),
    };
  });
  return { things: repairedThings, repairedIds };
}

/** A world.portal.entered patch — the signal to switch the client to the target world. */
export function portalEnteredFromWorldPatch(parsed: unknown): PortalEntered | null {
  if (!isRecord(parsed) || parsed.type !== "world.portal.entered") return null;
  if (typeof parsed.toWorldId !== "string" || parsed.toWorldId.length === 0) return null;
  return {
    portalId: typeof parsed.portalId === "string" ? parsed.portalId : "",
    fromWorldId: typeof parsed.fromWorldId === "string" ? parsed.fromWorldId : "",
    toWorldId: parsed.toWorldId,
    spawn: isVec3(parsed.spawn) ? parsed.spawn : undefined,
    sceneUrl: typeof parsed.sceneUrl === "string" ? parsed.sceneUrl : undefined,
  };
}

/** Extract a chunk.updated patch from a live WS message; null when anything else or malformed. */
export function chunkUpdatedFromWorldPatch(value: unknown): ChunkUpdatedPatch | null {
  if (!isRecord(value)) return null;
  if (value.type !== "chunk.updated") return null;
  if (typeof value.chunkX !== "number" || typeof value.chunkZ !== "number") return null;
  return {
    type: "chunk.updated",
    chunkX: value.chunkX,
    chunkZ: value.chunkZ,
    seq: typeof value.seq === "number" ? value.seq : 0,
  };
}

export function isWorldAction(value: unknown): value is WorldAction {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.visitorId !== "string") {
    return false;
  }
  if (value.type === "presence.update") {
    return (
      (value.position === undefined || isVec3(value.position)) &&
      (value.avatarId === undefined || typeof value.avatarId === "string") &&
      (value.avatarScale === undefined ||
        (typeof value.avatarScale === "number" && Number.isFinite(value.avatarScale)))
    );
  }
  if (value.type === "terrain.replace") {
    return isTellusTerrainState(value.terrain);
  }
  if (value.type === "terrain.sculpt") {
    return (
      typeof value.mode === "string" &&
      isVec3(value.center) &&
      (value.radius === undefined || (typeof value.radius === "number" && Number.isFinite(value.radius)))
    );
  }
  if (value.type === "generation.request") {
    return isRecord(value.request) && typeof value.request.prompt === "string";
  }
  if (value.type === "generated.upsert") {
    return isWorldGeneratedThing(value.thing);
  }
  if (value.type === "generated.delete") {
    return typeof value.id === "string";
  }
  if (value.type === "world.portal.upsert" || value.type === "portal.upsert") {
    return isWorldPortal(value.portal);
  }
  if (value.type === "world.portal.delete" || value.type === "portal.delete") {
    return typeof value.portalId === "string";
  }
  if (value.type === "procplant.upsert") {
    return isWorldProcPlantPlacement(value.placement);
  }
  if (value.type === "procplant.delete") {
    return typeof value.id === "string";
  }
  if (value.type === "world.chat") {
    return isWorldChatMessage(value.message);
  }
  if (value.type === "wildlife.configure") {
    return (
      typeof value.requestId === "string" && value.requestId.length > 0 &&
      isWildlifeAnimalConfig(value.config)
    );
  }
  if (value.type === "wildlife.command") {
    return (
      typeof value.requestId === "string" && value.requestId.length > 0 &&
      isWildlifeSelector(value.selector) &&
      typeof value.intent === "string" &&
      wildlifeCommandIntents.has(value.intent as WildlifeCommandIntent) &&
      (value.destination === undefined || isVec3(value.destination)) &&
      (value.from === undefined || isVec3(value.from)) &&
      (value.region === undefined ||
        (isRecord(value.region) && isVec3(value.region.center) &&
          typeof value.region.radiusMeters === "number" &&
          Number.isFinite(value.region.radiusMeters) && value.region.radiusMeters > 0)) &&
      (value.durationSeconds === undefined ||
        (typeof value.durationSeconds === "number" &&
          Number.isFinite(value.durationSeconds) && value.durationSeconds > 0)) &&
      (value.reason === undefined || typeof value.reason === "string")
    );
  }
  return false;
}
