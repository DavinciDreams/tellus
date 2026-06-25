import type { AssetAnimationMetadata } from "./tellus-animation-intents";

export type TerrainPaintKind =
  | "meadow"
  | "grass"
  | "rock"
  | "snow"
  | "beach"
  | "dirt"
  | "flowers"
  | "stone"
  | "brick";
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
      type: "world.chat";
      visitorId: string;
      message: WorldChatMessage;
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
  | ChunkUpdatedPatch;

export interface ChunkData {
  cx: number;
  cz: number;
  revision: number;
  segments: number; // 64
  sculptOffsets: number[]; // 4225, row-major (z-outer/x-inner); [] when revision 0 (flat)
  paint: number[]; // 4225 ints; code 0 = unpainted
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
    return typeof value.mode === "string" && isVec3(value.center);
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
  if (value.type === "world.chat") {
    return isWorldChatMessage(value.message);
  }
  return false;
}
