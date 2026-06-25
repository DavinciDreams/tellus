import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Box,
  Building2,
  CircleHelp,
  Globe2,
  Map as MapIcon,
  MessageCircle,
  Mic,
  MicOff,
  Minus,
  Mountain,
  PawPrint,
  Pencil,
  PersonStanding,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  Ship,
  Sprout,
  Trash2,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Waves,
  X,
} from "lucide-react";
import * as THREE from "three";
import { TilesRenderer } from "3d-tiles-renderer";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { createVegetation } from "./tellus-vegetation";
import { PROCEDURAL_CATALOG } from "./tellus-veg-archetypes";
import { makeProceduralModelUrl, makeProceduralBuildingModelUrl, sanitizeProceduralModelUrl, parseProceduralModelUrl, MIRROR_ARCHETYPE_ID, MAX_LIVE_MIRRORS, liveMirrorCount, resetLiveMirrors } from "./tellus-procedural-assets";
import {
  BUILDING_LIGHTING_OPTIONS,
  BUILDING_MATERIAL_OPTIONS,
  PROCEDURAL_BUILDING_CATALOG,
  makeProceduralBuildingArchetypeId,
  type BuildingLightingStyle,
  type BuildingMaterialStyle,
  type ProceduralBuildingType,
} from "./tellus-proc-buildings";
import { createAmbientPhysics, resolveObstacles, type ObstacleCircle } from "./tellus-physics";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  MeshBasicNodeMaterial,
  WebGPURenderer,
} from "three/webgpu";
import {
  color,
  linearDepth,
  mx_worley_noise_float,
  positionWorld,
  screenUV,
  time,
  vec2,
  viewportDepthTexture,
  viewportLinearDepth,
  viewportSharedTexture,
} from "three/tsl";
import {
  WebRtcMesh,
  enumerateMediaDevices,
  type MeshStats,
} from "./webrtc-mesh";
import {
  applyStaticToScreen,
  applyVideoToScreen,
  setTvHeadActive,
  createRemoteVisitorMesh,
  createVisitorMesh,
  tickSharedStatic,
} from "./world-builders";
import {
  AVATAR_SCALE_MAX,
  AVATAR_SCALE_MIN,
  clampAvatarScale,
  emoteClipNamesByCategorySync,
  getAvatarUserScale,
  recommendedEmoteClipNamesSync,
  restoreProceduralAvatar,
  setAvatarUserScale,
  tickAvatarScale,
  vrmaCategorySummarySync,
  type VrmaCategoryId,
  VrmObjectRig,
  type AvatarRig,
} from "./tellus-vrm-avatar";
import {
  attachAvatarRig,
  avatarCatalogSync,
  loadAvatarCatalog,
  setStoredAvatarId,
  setStoredAvatarScale,
  storedAvatarId,
  storedAvatarScale,
  subscribeAvatarCatalog,
  type AvatarCatalogEntry,
} from "./tellus-avatar-catalog";
import {
  type TellusTerrainState,
  type WorldGeneratedThing,
  type WorldPresence,
  type WorldPatch,
  emoteFromWorldPatch,
  chunkUpdatedFromWorldPatch,
  worldChatFromWorldPatch,
  portalsFromWorldPatch,
  portalDeletedFromWorldPatch,
  portalEnteredFromWorldPatch,
  biomeCellsFromWorldPatch,
  biomeCellsFromSnapshot,
  dedupePresenceForDisplay,
  isLivePresence,
  repairGeneratedCloneModelLinks,
  type WorldBiomeCell,
  isTellusTerrainState,
  isWorldGeneratedThing,
  type WorldChatChannel,
  type WorldChatMessage,
  type WorldPortal,
  type PortalEntered,
} from "./world-protocol";
import { createChunkRenderer, type ChunkRenderer } from "./tellus-chunk-renderer";
import type { AgentId, TerrainKind, TerrainPaintKind, TerrainEditMode, GenerationProvider, DirectGenerationProvider, RoleGenerationProvider, InstantMeshTarget, GeneratedKind, ToolName, AssetPanelTab, ToolMenu, Vec3, GeneratedThing, AssetLibraryModel, AssetLibraryResponse, DistantIslandSpec, TellusLog, GenerateRequest, InteractRequest, TellusSnapshot, TellusWorldApi, TellusRuntimeConfig, AssetForgePipelineStart, AssetForgePipelineStatus, DirectGenerationResponse, GeneratedAssetManifestEntry, SpeechRecognitionConstructor, SpeechRecognitionLike, VehicleMode, MaterialWithTextureMaps, WorldTemplateId, LandShapeOverrides, DayNightMode, LightingMood, WaterSettings, WaterStyle } from "./tellus-types";
import { WORLD_RADIUS, WORLD_SCALE, setWorldScale, worldScaleForId, scaledPlayerSpeed, OCEAN_RADIUS, SEA_LEVEL, DISTANT_ISLAND_COUNT, TERRAIN_SEGMENTS, DISTANT_TERRAIN_SEGMENTS, DISTANT_TERRAIN_VERTEX_COUNT, DISTANT_WALK_LOCAL_RADIUS, PLAYER_SPEED, PENDING_GENERATION_FALLBACK_MS, POND_CENTER, POND_RADIUS, TERRAIN_VERTEX_COUNT, TERRAIN_SCULPT_RADIUS, TERRAIN_SCULPT_STEP, SKYBOX_FALLBACK_URLS, SKYBOX_VERTICAL_OFFSET, MOON_MODEL_URL, MOON_DISTANCE, MOON_SIZE, MOON_ARC_AZIMUTH, MOON_ARC_LATERAL_SWAY, PIXEL3D_PROVIDER, generationProviderLabels, instantMeshTargetLabels, terrainColors, terrainPaintKinds, waterMountTerms, airMountTerms, groundMountTerms, isChunkedWorldId, canonicalWorldId, chunkedWorldCenter, getChunkedWorldChunks, CHUNK_SPAN } from "./tellus-constants";
import { readJsonResponse, clamp, rand, isRecord, makeId, browserUuid, distance2D, promptIncludesAny, finiteNumber, sanitizeLogText, extractErrorMessage } from "./tellus-utils";
import { parseWaterSettings, runtimeConfig, applyRuntimeConfig, loadRuntimeConfigFile, loadRuntimeConfig, worldApiUrl } from "./tellus-runtime-config";
import { tellusWorldHttpUrl, tellusAssetLibraryUrl, tellusWorldWebSocketUrl, tellusVisitorId, tellusUserId, tellusAgentUrl, absoluteAssetForgeUrl, tellusApiUrl, absoluteTellusApiUrl, assetStoreGameOptimizedModelUrl, assetStoreIdFromModelUrl, toAssetId } from "./tellus-urls-identity";
import { terrainSculptOffsets, setTerrainStateDirty, setInitialWorldGeneratedThings, setInitialWorldPresence, terrainPaint, terrainSaveTimer, terrainStateDirty, terrainStateLoaded, terrainStateRevision, tellusWorldBackendAvailable, initialWorldGeneratedThings, initialWorldPresence, terrainPaintCode, terrainPaintKindFromCode, isTerrainPaintMode, terrainVertexColor, terrainGridIndex, distantTerrainGridIndex, terrainSculptOffsetAt, centralTerrainGridCoords, centralTerrainPaintAt, distantIslandLocalPoint, distantIslandWorldPoint, createDistantIslandSpec, distantIslandSpecs, rebuildDistantIslandSpecs, distantIslandLocalRadius, distantIslandSculptOffsetAt, distantIslandGridWorldPoint, distantTerrainGridCoords, distantTerrainPaintAt, nearestDistantIsland, distantIslandHeight, groundedPosition, groundHeightAt, isIntentionallyOffsetFromGround, normalizedDiscPosition, oceanPosition, waterBlockedByLand, waterVehiclePosition, distantIslandShorePosition, vehicleMode, isMountThing, isVehicleThing, isFreeMovingVehicle, airPosition, movedVehiclePosition, baseTerrainHeight, terrainHeight, terrainKind, pondWaterLevel, terrainOffsetsPayload, terrainPaintPayload, distantTerrainOffsetsPayload, distantTerrainPaintPayload, tellusState, tellusStatePayload, terrainStorageKey, isResetTerrainState, saveTerrainStateLocally, loadTerrainStateLocally, applyTellusTerrainState, applyWorldTerrainTemplate, terrainFromWorldPatch, presenceFromWorldPatch, generatedFromWorldPatch, loadTellusWorldState, saveTellusWorldState, loadTellusState, loadChunkedWorldBounds, saveTellusStateSoon, saveTellusStateNow, isStalePendingGeneratedThing, setChunkedHeightProvider, setChunkedFlatGround, onTerrainTemplateLoaded } from "./tellus-terrain";
import { gltfObjectCache, createGltfLoader, generatedAssetManifestEntries, generatedAssetManifestModelUrls, generatedAssetManifestAssetIds, loadAssetLibraryModels, browseAssetLibrary, type AssetBrowseSort, configureKtx2Support, textureFailedModelUrls, startPixel3DGeneration, waitForPixel3DModelUrl, hasExternalGenerationProvider, isMissingApiRouteError, generationProviderForThing, startDirectInstantMeshGeneration, waitForDirectGeneration, cancelDirectGeneration } from "./tellus-generation-client";
import { createTerrainGeometry, createFloatingRim, createFallbackOceanMaterial, createOceanSurface, createDistantIslandTerrainGeometry, createDistantIsland, createDistantArchipelago, createSkyDome, createEnvironmentTexture, createBackdropWaterMaterial, createFlowerSpriteTexture, createFlowerSpriteMaterials, disposeMaterial, disposeObject, fitModelToHeight, measureModelBounds, placeObjectAboveGround, loadGltfObject, generatedGltfCache, loadGeneratedGltfObject, prepareSkyboxModel, collectSkyboxTintMaterials, prepareMoonModel, loadSkyboxModel, assetTargetHeight, loadGeneratedModel, createPondWater, createGeneratedMesh, createGenerationSwirl, shouldShowGenerationSwirl, applyThingRotation, inferGeneratedKind, promptAccent, kindColor } from "./tellus-scene-builders";
import { createTerrainMaterial } from "./tellus-terrain-material";
import { largeWorldBaseHeight, largeWorldTerrainKind, usesContinentalChunkedTerrain } from "./tellus-large-world-terrain";
import type { RapierSolid, TellusRapierPhysics } from "./tellus-rapier-physics";
import { generateInteriorRoom } from "./tellus-building";
import { installSessionFetch, getSession, SESSION_HEADER } from "./tellus-auth";
import { AuthControls, PremiumUpsellChip, useTellusAuth } from "./tellus-auth-ui";
import { buildAgentFeed, type AgentChatLine, type AgentToolChip } from "./agent-chat-format";
import { buildAgentMapLocation, resolveAgentMoveTarget } from "./tellus-agent-location";
import { defaultSkyboxUrlForTemplate, parseLandShapeOverrides, parseOptionalWorldTemplateId, parseWorldTemplateId, shouldIgnoreDefaultTellusTemplate, templateForWorldId } from "./tellus-world-templates";
import { evoflowTerrainSourceFor } from "./tellus-evoflow-terrains";
import {
  ASSET_SURFACE_CONTEXTS,
  inferAssetSurfaceContexts,
  rankReusableAssets,
  type AssetReuseCandidate,
  type AssetSurfaceContext,
} from "./tellus-asset-reuse";
import { actorKindForVisitorId, friendlyVisitorName } from "./tellus-visitor-names";
import {
  buildWorldThingRuntimeProfile,
  defaultScaleForRealisticKind,
  normalizeWorldThingAssetIdentity,
  seatPositionForWorldThing,
  type WorldThingRuntimeProfile,
} from "./tellus-world-object-profile";
import {
  DAY_NIGHT_MODE_OPTIONS,
  LIGHTING_MOOD_OPTIONS,
  LIGHTING_MOOD_PROFILES,
  SKYBOX_OPTIONS,
  ADVANCED_WORLD_TEMPLATE_OPTIONS,
  WORLD_CREATION_TEMPLATES,
  WORLD_TEMPLATE_OPTIONS,
  liveDayNightPhase,
  normalizeDayNightCycleMs,
  normalizeSkyboxUrl,
  parseDayNightMode,
  parseLightingMood,
  skyboxLabel,
  worldTemplateLabel,
} from "./tellus-world-options";
import { AssetTile, AvatarTile } from "./tellus-picker-tiles";
import "./styles.css";

// Attach X-Tellus-Session to every Hyades API call (agent endpoints, world meta PATCH, state, pay)
// before ANY fetch fires — the /live WebSocket keeps the soft ?userId= identity instead.
installSessionFetch();

const PORTAL_ARRIVAL_EXIT_OFFSET = 4.5;
const GENERATED_INTERIOR_SCENE_URL = "generated://interior-room";
const GRAND_HALL_INTERIOR_SCENE_URL = "generated://interior-room?style=grand-hall";

const isInteriorWorldTemplate = (template: WorldTemplateId): boolean =>
  template === "interior-studio" || template === "grand-hall-shell";

const generatedInteriorSceneUrlForTemplate = (template: WorldTemplateId): string | undefined =>
  !isInteriorWorldTemplate(template)
    ? undefined
    : template === "grand-hall-shell"
      ? GRAND_HALL_INTERIOR_SCENE_URL
      : GENERATED_INTERIOR_SCENE_URL;

// Per-user embodied-agent status shape returned by the Hyades world agent endpoints (camelCase).
interface AgentStatus {
  worldId?: string;
  enabled: boolean;
  optedIn: boolean;
  offlinePersistence: boolean;
  ownerPresent: boolean;
  tokensSpentToday: number;
  dailyTokenBudget: number;
  selfSection: string;
  corePrompt: string;
  visitorId: string;
  agentId: string;
  idleBackoffLevel: number;
  intervalSeconds: number;
  pausedReason: string | null;
  tickCount: number;
  lastTickAt: string | null;
  /** True while the agent is mid-turn (LLM call in flight) — the "thinking" indicator. */
  processing?: boolean;
  /** The agent's own durable `remember` notes (newest first) — surfaced live in the memories block. */
  memories?: AgentRememberNote[];
}

interface OnlineContact {
  visitorId: string;
  name: string;
  kind: "player" | "agent";
  worldId: string;
  position?: Vec3;
  online: boolean;
  currentWorld: boolean;
  lastSeenAt?: string;
}

// One turn of the server-side agent's recent conversation. "assistant" = the agent speaking; "tool" = a tool
// call/result (dimmer); "user" = the owner's own chat line (restored from the thread so it survives a reload).
interface AgentTranscriptMessage {
  role: "assistant" | "tool" | "user";
  text: string;
}

// Shape of GET .../agent/transcript — last 40 of the agent's conversation turns.
interface AgentTranscriptResponse {
  messages?: AgentTranscriptMessage[];
}

// One entry of the agent's self-section ("Memories") edit log, from GET .../agent/memories.
interface AgentMemoryEntry {
  editedAt?: string;
  editedBy?: string;
  newValue?: string;
}

// One of the agent's OWN durable notes (its `remember` tool) — distinct from the owner-edited persona.
interface AgentRememberNote {
  text?: string;
  at?: string;
}

// Shape of GET .../agent/memories — current self-section + recent edit log + the agent's own notes.
interface AgentMemoriesResponse {
  selfSection?: string;
  log?: AgentMemoryEntry[];
  entries?: AgentMemoryEntry[];
  memories?: AgentRememberNote[];
}

// Compact tool chip: one-line pill in the feed's dimmed style language (same HUD palette as the old
// raw tool lines, just contained). Doubles as the collapsed-group toggle (as a <button>).
const agentChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  alignSelf: "flex-start",
  flex: "none", // the feed is a scrollable flex column — without this, overflow SQUISHES the pill
  maxWidth: "100%",
  padding: "1px 8px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)",
  color: "#dfe7d8",
  fontSize: 10,
  opacity: 0.6,
  whiteSpace: "nowrap",
  overflow: "hidden",
};

// Bold, legible terrain colours for the minimap raster (RGB tuples).
const BIOME_MAP_RGB: Record<string, [number, number, number]> = {
  meadow: [124, 168, 86],
  forest: [40, 102, 54],
  desert: [214, 186, 116],
  snow: [232, 238, 244],
  dirt: [130, 100, 70],
  stone: [142, 144, 136],
  brick: [150, 74, 58],
  water: [52, 114, 104],
  alien: [160, 88, 182],
};

function AgentToolChipPill({ chip }: { chip: AgentToolChip }) {
  const label = chip.summary ? `${chip.name} · ${chip.summary}` : chip.name;
  return (
    <span style={agentChipStyle} title={label}>
      <span aria-hidden="true">🔧</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </span>
  );
}

// Chunk-load radius (the chunked-world HUD slider): rings of chunks loaded around the player →
// (2r+1)² loaded chunks. Persisted here, read by both the world closure (on init) and the React HUD.
const CHUNK_LOAD_RADIUS_STORAGE_KEY = "tellus.chunkLoadRadius";

// Turn a Hyades portal `action.rejected` reason into clear player-facing guidance. The server reasons
// come straight from the world grain (ApplyPortalUpsert/Delete/Enter): ownership, feature flag, target
// validity, allowlist, cap. NOT a chunked-world thing — portals are terrain-provider independent.
function portalRejectionMessage(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("not the world owner"))
    return "Can't place a portal here — only this world's owner can. Try a world you own (or an open/unowned one).";
  if (r.includes("portals disabled"))
    return "Portals are turned off on this server right now (Features.Portals). Ask an admin to enable them.";
  if (r.includes("private target"))
    return "That destination world is private — you can't route a portal into a world you don't own.";
  if (r.includes("target world unavailable") || r.includes("interior unavailable"))
    return "The portal's destination world couldn't be reached. Try again or pick another target.";
  if (r.includes("portal cap"))
    return "This world has hit its portal limit (64). Delete a portal before adding another.";
  if (r.includes("allowlist") || r.includes("sceneurl"))
    return "That portal's scene URL isn't on the allowed-hosts list, so the server rejected it.";
  if (r.includes("bad target kind") || r.includes("invalid portal") || r.includes("no target"))
    return "That portal is missing a valid destination. Pick a target world and try again.";
  if (r.includes("unknown portal")) return "That portal no longer exists.";
  return `Portal action rejected: ${reason}`;
}

function createTellusWorld(
  container: HTMLElement,
  onSnapshot: (snapshot: TellusSnapshot) => void,
  options: { initialInteriorSceneUrl?: string } = {},
): TellusWorldApi {
  let destroyed = false;
  let animationId = 0;
  let lastTime = performance.now();
  // Debug FPS counter (sampled every 500ms); surfaced via getFps() for the hidden FPS overlay.
  let fpsValue = 0;
  let fpsFrames = 0;
  let fpsSampleStart = lastTime;
  let tick = 0;
  let renderer: THREE.WebGLRenderer | WebGPURenderer | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let renderIssueLogged = false;

  const generated: GeneratedThing[] = [];
  const logs: TellusLog[] = [];
  const worldChat: WorldChatMessage[] = [];
  // TELLUS INFINITY portals: the current world's portals + a one-shot world.portal.entered signal the React
  // layer consumes to switch worlds (with spawn). Both ride the snapshot bridge.
  let worldPortals: WorldPortal[] = [];
  let pendingPortalSwitch: PortalEntered | null = null;
  // TELLUS INFINITY biomes: the world's biome cells keyed "cx:cz" (diff-merged from world.biome.patch).
  const worldBiomeCells = new Map<string, WorldBiomeCell>();
  const seenWorldChatIds = new Set<string>();
  const generatedMeshes = new Map<string, THREE.Object3D>();
  type GeneratedAnimationState = {
    mixer: THREE.AnimationMixer;
    action?: THREE.AnimationAction;
    clipName?: string;
    mode: GeneratedMotionMode;
  };
  type GeneratedMotionMode = "idle" | "walk" | "run";
  const generatedAnimationMixers = new Map<string, GeneratedAnimationState>();
  // Placed VRM things (auton/Atlantean store models) animate through a real VRM rig — a VRMA idle clip
  // looped by default, advanced (mixer + spring bones) each frame here. Parallel to the plain-GLB
  // mixers above; a thing is in exactly one of the two maps.
  const generatedVrmRigs = new Map<string, VrmObjectRig>();
  // GPU-instancing of static duplicated generated models (flag-gated; default OFF). One InstancePool per
  // modelUrl holds one THREE.InstancedMesh per sub-mesh of the shared GLB; folded ("instanced") things keep
  // their regular mesh in the scene but `visible = false`, and we copy that hidden mesh's per-sub-mesh
  // matrixWorld into the matching instance slot. NOTHING here ever throws into the render loop — every op is
  // wrapped, and any failure disables instancing for the group and reverts its meshes to visible. See
  // reevaluateInstanceGroup / instancePools below `thingById`.
  interface InstancePool {
    modelUrl: string;
    instanced: THREE.InstancedMesh[]; // one per sub-mesh, in deterministic traversal order
    subMeshCount: number;
    capacity: number;
    freeSlots: number[]; // recycled slot indices (LIFO)
    nextSlot: number; // next never-used slot index
    slotToThing: Map<number, string>; // slot -> thing.id (reverse map for picking)
    thingToSlot: Map<string, number>; // thing.id -> slot
    disabled: boolean; // a failure here disables the whole group, reverting to regular meshes
  }
  const instancePools = new Map<string, InstancePool>();
  // Model URLs whose instancing hit an error once — never re-attempt for the session (they stay regular).
  const instancingDisabledUrls = new Set<string>();
  const skyboxTintMaterials = new Set<THREE.MeshBasicMaterial>();
  const pendingGenerationControllers = new Map<string, AbortController>();
  const pendingManifestReconciliations = new Set<string>();
  const transientModelLoadFailures = new Map<string, number>();
  const transientModelRetryTimers = new Map<string, number>();
  const keys = new Set<string>();
  let selectedThingId: string | undefined;
  let sailingThingId: string | undefined;
  let externalSkybox: THREE.Object3D | null = null;
  let activeSkyboxUrl = "";
  let skyboxLoadSeq = 0;
  let moonModel: THREE.Object3D | null = null;
  const moonMaterials = new Set<THREE.MeshStandardMaterial>();
  let directGenerationAvailable = true;
  let worldSocket: WebSocket | null = null;
  let worldSocketReconnectTimer: number | undefined;
  let worldSocketClosedByDestroy = false;
  const visitorId = tellusVisitorId();
  const userId = tellusUserId();
  const petOwnerId = userId || visitorId;
  const remoteVisitorMeshes = new Map<string, THREE.Group>();
  const remoteVisitors = new Map<string, WorldPresence>();
  // Rigged VRM avatar upgrades, keyed by visitorId (the local player's rig uses its own visitorId
  // — applyRemotePresence never creates a remote entry for it). Each rig's update(dt) runs in
  // animate(); rigs are disposed on remote prune and on destroy.
  const avatarRigs = new Map<string, AvatarRig>();
  let lastPresenceSentAt = 0;
  let lastPresencePruneAt = 0;

  // ── P2P video mesh (WebRTC, RX-on/TX-off by default) ──────────────────────
  // The mesh is the sole owner of all RTCPeerConnections; it lives outside the render loop and
  // contains every async failure (a dead peer just leaves its TV on static). Hyades is the
  // rendezvous only: signaling rides the /live WS, presence IS the peer roster, ICE comes from
  // the world snapshot. Constructed lazily once ICE config is known.
  let p2pMesh: WebRtcMesh | null = null;
  let p2pIceServers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302"] },
  ];
  let latestP2pStats: MeshStats | null = null;
  let pendingPeerRoster: string[] | null = null;
  // Streams that arrived before their avatar mesh existed (race on presence vs ontrack).
  const pendingPeerStreams = new Map<string, MediaStream | null>();

  const p2pSupported =
    typeof RTCPeerConnection !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  // P2P diagnostics: on by default (low volume) so connection issues are visible in the console;
  // silence with localStorage 'tellus.p2pDebug' = '0'.
  const p2pLog = (...args: unknown[]): void => {
    try {
      if (window.localStorage.getItem("tellus.p2pDebug") === "0") return;
    } catch {
      /* ignore */
    }
    console.info("[p2p]", ...args);
  };

  const sendRtcSignal = (
    to: string | null,
    kind: string,
    payload: string,
  ): void => {
    if (!worldSocket || worldSocket.readyState !== WebSocket.OPEN) {
      p2pLog("send DROPPED (socket not open)", kind, "->", to);
      return;
    }
    try {
      worldSocket.send(
        JSON.stringify({
          type: "signal",
          visitorId,
          signal: { to, kind, payload },
        }),
      );
      p2pLog("send", kind, "->", to);
    } catch {
      /* socket race — peer will retry via renegotiation */
    }
  };

  // P2P audio: remote TV-head <video>s start muted (autoplay-safe); the "Listen" toggle unmutes them all.
  let remoteAudioOn = false;
  const applyRemoteAudio = (screen: THREE.Mesh): void => {
    const vid = (screen.userData.tvScreen as { videoEl?: HTMLVideoElement } | undefined)?.videoEl;
    if (vid) vid.muted = !remoteAudioOn;
  };

  // Swap a remote avatar's TV screen to a live stream (or back to static when stream === null).
  const setPeerVideo = (peerId: string, stream: MediaStream | null): void => {
    const mesh = remoteVisitorMeshes.get(peerId);
    if (!mesh) {
      // Avatar not built yet — remember and apply when applyRemotePresence creates it.
      pendingPeerStreams.set(peerId, stream);
      return;
    }
    const screen = mesh.userData.tvScreenRef as THREE.Mesh | undefined;
    if (!screen) return;
    setTvHeadActive(mesh, !!stream); // show the TV head only while this peer is transmitting
    if (stream) {
      applyVideoToScreen(screen, stream);
      applyRemoteAudio(screen); // honor the current Listen state for the new <video>
    } else {
      applyStaticToScreen(screen, useWebGPU);
    }
  };

  // Unmute/mute every peer's TV-head audio (RX audio). Click is the user gesture browsers require.
  const setRemoteAudioEnabled = (on: boolean): void => {
    remoteAudioOn = on;
    for (const mesh of remoteVisitorMeshes.values()) {
      const screen = mesh.userData.tvScreenRef as THREE.Mesh | undefined;
      if (screen) applyRemoteAudio(screen);
    }
  };

  // Self-view: the local player's OWN camera renders on their own avatar's TV head when TX is on
  // (and is also exposed to the P2P panel preview via getSelfStream). `visitor` is created later in
  // this closure but this runs only after TX-on, by which time it exists.
  let selfStream: MediaStream | null = null;
  const setSelfVideo = (stream: MediaStream | null): void => {
    selfStream = stream;
    const screen = visitor?.userData.tvScreenRef as THREE.Mesh | undefined;
    if (!screen) return;
    if (visitor) setTvHeadActive(visitor, !!stream); // your own TV head appears only while transmitting
    if (stream) {
      applyVideoToScreen(screen, stream);
    } else {
      applyStaticToScreen(screen, useWebGPU);
    }
  };

  const feedP2pPresence = (peerIds: string[]): void => {
    if (p2pMesh) {
      p2pLog("roster", peerIds);
      p2pMesh.setPresence(peerIds);
    } else {
      p2pLog("roster (mesh pending)", peerIds);
      pendingPeerRoster = peerIds;
    }
  };

  let lastP2pStatesLog = "";
  const ensureP2pMesh = (): void => {
    if (p2pMesh || !p2pSupported) {
      if (!p2pSupported) p2pLog("UNSUPPORTED (no RTCPeerConnection/getUserMedia)");
      return;
    }
    p2pLog("mesh ready, self=", visitorId, "ice=", p2pIceServers);
    p2pMesh = new WebRtcMesh({
      selfId: visitorId,
      iceServers: p2pIceServers,
      sendSignal: (to, kind, payload) => sendRtcSignal(to, kind, payload),
      onPeerStream: (peerId, stream) => {
        p2pLog("peer stream", peerId, stream ? "ON" : "off");
        setPeerVideo(peerId, stream);
      },
      onLocalStream: (stream) => setSelfVideo(stream),
      onStats: (stats) => {
        latestP2pStats = stats;
        // Log connection-state transitions (not every tick).
        const sig = stats.peers.map((p) => `${p.id.slice(0, 6)}:${p.state}`).join(",");
        if (sig !== lastP2pStatesLog) {
          lastP2pStatesLog = sig;
          p2pLog("states", sig || "(no peers)");
        }
      },
      onError: (peerId, err) => {
        p2pLog("ERROR", peerId, err);
      },
      maxPeers: 16,
    });
    if (pendingPeerRoster) {
      p2pLog("roster (drained)", pendingPeerRoster);
      p2pMesh.setPresence(pendingPeerRoster);
      pendingPeerRoster = null;
    }
  };

  // Fetch cluster ICE config (STUN-only default), then stand up the mesh. Best-effort: on any
  // failure we keep the bundled public STUN and still build the mesh.
  const initP2p = async (): Promise<void> => {
    if (!p2pSupported || !runtimeConfig.worldApiBase) return;
    try {
      const res = await fetch(`${runtimeConfig.worldApiBase}/api/tellus/ice`, {
        cache: "no-store",
      });
      if (res.ok) {
        const body = (await res.json()) as {
          iceServers?: {
            urls?: string[] | string;
            username?: string;
            credential?: string;
          }[];
        };
        if (Array.isArray(body.iceServers) && body.iceServers.length > 0) {
          p2pIceServers = body.iceServers.map((s) => ({
            urls: s.urls ?? [],
            username: s.username,
            credential: s.credential,
          }));
        }
      }
    } catch {
      /* keep bundled STUN */
    }
    ensureP2pMesh();
  };

  const hasPendingGeneratedAsset = (creatorId?: AgentId | "visitor"): boolean =>
    generated.some(
      (thing) =>
        (!creatorId || thing.creatorId === creatorId) &&
        (thing.generationStatus === "queued" ||
          thing.generationStatus === "generating"),
    );

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa7c3ef);
  scene.fog = new THREE.Fog(0xa7c3ef, 72 * WORLD_SCALE, 230 * WORLD_SCALE);
  // Ambient reflections for PBR assets (GLBs look muddy without an environment); intensity follows
  // the day/night cycle below.
  scene.environment = createEnvironmentTexture();
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 720 * WORLD_SCALE);
  // Agent POV picture-in-picture: when set to a remote avatar's visitorId we render a small second view of
  // the scene from that avatar's head, looking forward along its facing. Reusable camera + scratch vectors.
  let agentViewportVisitorId: string | null = null;
  const povCamera = new THREE.PerspectiveCamera(62, 220 / 140, 0.1, 720 * WORLD_SCALE);
  const povEye = new THREE.Vector3();
  const povForward = new THREE.Vector3();
  const povLookAt = new THREE.Vector3();
  const POV_LOOK_DROP = new THREE.Vector3(0, -1.4, 0);
  // Scratch: the player-camera → POV-camera offset, used to re-center the camera-following celestials
  // (skybox dome, moon) on the POV camera for the PiP render so they don't stay locked to the player.
  const povSkyDelta = new THREE.Vector3();
  const fallbackSky = createSkyDome(320 * WORLD_SCALE);
  if (fallbackSky.material instanceof THREE.MeshBasicMaterial) {
    skyboxTintMaterials.add(fallbackSky.material);
  }
  // ~500ms/frame stall is WebGPU-specific on this GPU. Set back to `"gpu" in navigator` after testing.
  const useWebGPU = "gpu" in navigator;
  // Visual terrain density (decoupled from the synced 97² sculpt grid). FIXED vertex budget no
  // matter the world scale — bigger worlds stretch the same ~50K-vertex mesh instead of multiplying
  // it (operator: range over thickness; worlds get larger for less).
  const terrainRenderSegments = useWebGPU ? 224 : 144;
  // Rich TSL water on the WebGPU path; WebGL keeps the lightweight fallback material.
  const ocean = createOceanSurface(useWebGPU, runtimeConfig.waterSettings);
  const archipelago = createDistantArchipelago(useWebGPU);
  let chunkRenderer: ChunkRenderer | null = null;
  let lastActiveChunkCount = -1; // re-ground placed assets when the active chunk set changes
  // Ambient procedural vegetation (wind-swayed flowers/flora streamed around the player + island-wide
  // trees/rocks) and the lightweight physics world (thrown things, player jump/obstacles). Both are
  // deterministic from the synced terrain state — no protocol changes.
  //
  // Chunked worlds keep 3D flowers/reeds/small flora on by default, but suppress the hair-like grass
  // layer. "tellus.grass"="0" disables this vegetation pass entirely; classic worlds remain opt-in.
  // Classic-world vegetation remains opt-in via "tellus.grass"="1".
  const isChunked = isChunkedWorldId(runtimeConfig.worldId);
  const isContinentalChunkedWorld = isChunked && usesContinentalChunkedTerrain();
  const chunkedDims = isChunked ? getChunkedWorldChunks() : null;
  const chunkedCenterForWorld = isChunked ? chunkedWorldCenter() : null;
  if (chunkedCenterForWorld) {
    ocean.position.x = chunkedCenterForWorld.x;
    ocean.position.z = chunkedCenterForWorld.z;
    archipelago.position.x = chunkedCenterForWorld.x;
    archipelago.position.z = chunkedCenterForWorld.z;
  }
  const chunkedVegetationBounds = chunkedDims
    ? {
        minX: 0,
        maxX: chunkedDims.w * CHUNK_SPAN,
        minZ: 0,
        maxZ: chunkedDims.h * CHUNK_SPAN,
      }
    : undefined;
  const waterFeatureCenter = (() => {
    const center = isChunked ? chunkedWorldCenter() : null;
    if (!center) return { x: POND_CENTER.x, z: POND_CENTER.z };
    return {
      x: center.x + CHUNK_SPAN * 0.55,
      z: center.z - CHUNK_SPAN * 0.35,
    };
  })();
  const waterFeatureRadius = isChunked
    ? Math.max(18, Math.min(42, CHUNK_SPAN * 0.34))
    : POND_RADIUS;
  const waterFeatureContains = (x: number, z: number, pad = 0) => {
    if (isContinentalChunkedWorld) return false;
    const dx = x - waterFeatureCenter.x;
    const dz = z - waterFeatureCenter.z;
    const radius = waterFeatureRadius + pad;
    return dx * dx + dz * dz < radius * radius;
  };
  const waterFeatureLevel = () => {
    const ground =
      groundHeightAt(waterFeatureCenter.x, waterFeatureCenter.z) ??
      chunkRenderer?.sampleHeight(waterFeatureCenter.x, waterFeatureCenter.z) ??
      terrainHeight(waterFeatureCenter.x, waterFeatureCenter.z);
    return ground + 0.55;
  };
  const vegetationPreference = (() => {
    try {
      return window.localStorage.getItem("tellus.grass");
    } catch {
      return null;
    }
  })();
  const vegetationEnabled = vegetationPreference !== "0" && (isChunked || vegetationPreference === "1");
  const groundGrassEnabled = !isChunked && vegetationPreference === "1";
  const vegetation = vegetationEnabled
    ? createVegetation({
        scene,
        useWebGPU,
        sampleHeight: isChunked
          ? (x, z) => chunkRenderer?.sampleHeight(x, z) ?? SEA_LEVEL - 100
          : terrainHeight,
        samplePaint: isChunked
          ? (x, z) => {
              const painted = chunkRenderer?.samplePaint(x, z);
              if (painted) return painted;
              const kind = largeWorldTerrainKind(x, z);
              return kind === "water" ? null : kind;
            }
          : centralTerrainPaintAt,
        bounds: chunkedVegetationBounds,
        sectorsEnabled: !isChunked,
        grassOnly: false,
        suppressGrass: isChunked && !groundGrassEnabled,
        suppressSmallFlora: isChunked,
        maxFlowersPerChunk: isChunked ? 36 : undefined,
        initialTier: isChunked ? 1 : undefined,
        maxTier: isChunked ? 2 : undefined,
        isExcluded: isChunked
          ? (x, z, h) =>
              waterFeatureContains(x, z, 0.6) &&
              h < waterFeatureLevel() + 0.35
          : (x, z, h) => {
              return (
                waterFeatureContains(x, z, 0.6) &&
                h < waterFeatureLevel() + 0.35
              );
            },
        pondRing: {
          x: waterFeatureCenter.x,
          z: waterFeatureCenter.z,
          radius: waterFeatureRadius,
          level: waterFeatureLevel(),
        },
      })
    : {
        update: () => undefined,
        notifyTerrainChanged: () => undefined,
        getTreeColliders: () => [],
        stats: () => ({ tier: 0, chunks: 0, grassIndices: 0, trees: 0, sectors: 0 }),
        dispose: () => undefined,
      };
  const ambientPhysics = createAmbientPhysics({
    groundHeightAt: (x, z) => groundHeightAt(x, z) ?? SEA_LEVEL - 2.6,
    waterLevelAt: (x, z) => {
      if (waterFeatureContains(x, z, 0.4)) {
        return waterFeatureLevel();
      }
      return SEA_LEVEL;
    },
    worldRadius: OCEAN_RADIUS - 6,
  });
  let rapierPhysics: TellusRapierPhysics | null = null;
  void import("./tellus-rapier-physics")
    .then((module) => module.createTellusRapierPhysics())
    .then((physics) => {
      if (destroyed) {
        physics.dispose();
        return;
      }
      rapierPhysics = physics;
      publish();
    })
    .catch((error) => {
      console.warn("Tellus Rapier physics unavailable", error);
    });
  const terrain = new THREE.Mesh(
    createTerrainGeometry(terrainRenderSegments),
    createTerrainMaterial(useWebGPU, { roughness: 0.88 }),
  );
  terrain.receiveShadow = true;
  if (isChunked) {
    // Chunked worlds tile terrain per-grain; the single-grid mesh stays inert (kept so the many
    // code paths that reference `terrain` keep compiling) and the streamer owns the heightfield.
    terrain.visible = false;
    // Pass the procedural-detail terrain material so streamed chunks get the same fractal
    // mottling/slope-darkening as the central terrain (Lisa's #36 surface detail, applied per-chunk).
    chunkRenderer = createChunkRenderer(
      scene,
      createTerrainMaterial(useWebGPU, { roughness: 0.88 }),
    ); // adds its own group to the scene
    // Apply the persisted chunk-load radius (the HUD slider) so draw distance survives a reload.
    const savedRadius = (() => {
      try {
        const raw = window.localStorage.getItem(CHUNK_LOAD_RADIUS_STORAGE_KEY);
        const n = raw ? Math.round(Number(raw)) : NaN;
        return Number.isFinite(n) ? n : null;
      } catch {
        return null;
      }
    })();
    if (savedRadius !== null) chunkRenderer.setLoadRadius(savedRadius);
    // Walk the sculpted chunk heightfield where chunks are loaded (flat base elsewhere).
    setChunkedHeightProvider((x, z) => chunkRenderer!.sampleHeight(x, z));
  }
  const pondWater = createPondWater({
    center: waterFeatureCenter,
    radius: waterFeatureRadius,
    waterLevel: waterFeatureLevel(),
    animated: useWebGPU,
    waterSettings: runtimeConfig.waterSettings,
  });
  const flowerPatchGroup = new THREE.Group();
  flowerPatchGroup.name = "tellus-flower-patches";
  const flowerSpriteMaterials = createFlowerSpriteMaterials();
  const floatingRim = createFloatingRim();
  if (isChunked) {
    floatingRim.visible = false;
    pondWater.visible = false;
    if (isContinentalChunkedWorld) {
      ocean.visible = false;
      archipelago.visible = false;
    }
  }
  scene.add(
    fallbackSky,
    ocean,
    archipelago,
    terrain,
    pondWater,
    flowerPatchGroup,
    floatingRim,
  );

  // TELLUS INFINITY (Phase 3) interiors: when the world snapshot carries a sceneUrl, this world is an INTERIOR
  // — render its GLB room instead of the outdoor terrain. Idempotent (loads each url once); the outdoor meshes
  // are hidden, the player grounds on the room floor (flat y≈0 — interiors have no heightfield).
  let interiorObject: THREE.Object3D | null = null;
  let interiorSceneUrl: string | null = null;
  let profileInteriorSceneUrl = options.initialInteriorSceneUrl?.trim() || null;
  // Guards the ONE-TIME interior trimesh bake (see ensureInteriorStatics). Declared here (before
  // applyInterior uses it) to avoid a temporal-dead-zone reference.
  let interiorBaked = false;
  // Real multi-surface interior geometry now lives in src/tellus-building.ts (generateInteriorRoom):
  // floor slab(s) + perimeter walls (with a doorway gap) + a climbable staircase between levels +
  // ceiling + warm light, all flagged userData.collide for the physics track. A real sceneUrl GLB
  // (when it loads) is added INSIDE the same container.
  const interiorRoomSpecForSceneUrl = (sceneUrl: string) => {
    const lower = sceneUrl.toLowerCase();
    if (lower.includes("grand-hall") || lower.includes("tavern")) {
      return { width: 30, depth: 24, levels: 2, stairs: true, seed: 7 };
    }
    return { width: 20, depth: 18, levels: 2, stairs: true, seed: 3 };
  };

  const applyInterior = (sceneUrl: string) => {
    const u = sceneUrl.trim();
    if (!u || u === interiorSceneUrl) return;
    interiorSceneUrl = u;
    ocean.visible = !isContinentalChunkedWorld;
    for (const m of [archipelago, terrain, pondWater, flowerPatchGroup, floatingRim]) m.visible = false;
    setChunkedFlatGround(0); // ground the player on the room floor (no heightfield inside)
    // The procedural room is centered at the origin; drop the player INTO the room (origin, flat floor)
    // on entry instead of preserving an outdoor spawn point.
    visitorPosition.x = 0;
    visitorPosition.y = 0;
    visitorPosition.z = 0;
    lastLocalAvatarPos.x = 0;
    lastLocalAvatarPos.z = 0;
    // Don't let the return/entry portal at the spawn immediately re-fire (the spawn-on-door loop).
    armPortalArrivalGrace();
    if (interiorObject) {
      scene.remove(interiorObject);
      disposeObject(interiorObject);
      rapierPhysics?.clearStatics(); // drop the prior room's trimesh statics before baking the new one
    }
    interiorBaked = false; // new interior mount → allow exactly one bake (see ensureInteriorStatics)
    // Always show the procedural room immediately; the GLB (if the asset exists) layers in.
    const container = new THREE.Group();
    container.name = "tellus-interior";
    // Track B: real multi-surface interior geometry (floor/walls/stairs/ceiling). Solid meshes carry
    // userData.collide === true so Track A can bake them into a Rapier static trimesh. Default room:
    // 16×16, single level (set levels>1 to get a climbable staircase between mezzanine floors).
    container.add(generateInteriorRoom(interiorRoomSpecForSceneUrl(u)));
    interiorObject = container;
    scene.add(container);
    // TRACK-A: bake the interior's solid meshes (userData.collide === true) into a Rapier static
    // trimesh so floors/walls/stairs are walkable + impassable. Re-adding "interior" replaces any
    // prior room's statics. Rapier may still be loading (dynamic import) on the first interior — the
    // proximity check in animate re-arms it via ensureInteriorStatics() once physics is ready.
    rapierPhysics?.addStaticTrimesh("interior", container);
    addLog({ agentId: "world", agentName: "Tellus", tool: "interact", text: `Entered interior ${u}` });
    if (u.startsWith("generated://")) return;
    void loadGltfObject(u)
      .then((obj) => {
        if (destroyed || interiorObject !== container) {
          disposeObject(obj);
          return;
        }
        obj.name = "tellus-interior-glb";
        // Server interior GLBs don't carry our userData.collide flags (only the generated room does),
        // so without this the bake finds 0 collidable meshes and you'd fall through the floor. Flag the
        // GLB's solid meshes so addStaticTrimesh turns them into walkable/impassable colliders.
        obj.traverse((node) => {
          const m = node as THREE.Mesh;
          if (m.isMesh && m.geometry) m.userData.collide = true;
        });
        container.add(obj);
        // The GLB layered in AFTER the initial bake — re-bake once so its floor/walls are collidable.
        interiorBaked = false;
        ensureInteriorStatics();
      })
      .catch(() => {
        /* no GLB asset yet — the procedural room stands in. */
      });
  };

  // Bake the interior's solid meshes into Rapier statics EXACTLY ONCE per interior mount. Critical:
  // this must NOT retry every frame — a server GLB without our collide flags would otherwise re-cook
  // the entire trimesh 60×/sec (the 7-FPS interior bug). interiorBaked resets on each applyInterior /
  // GLB layer-in, so a late-ready Rapier or a late GLB still gets one bake.
  const ensureInteriorStatics = () => {
    if (!rapierPhysics || !interiorObject || interiorBaked) return;
    interiorBaked = true; // mark BEFORE baking so a throw doesn't cause a per-frame retry storm
    rapierPhysics.addStaticTrimesh("interior", interiorObject);
  };

  // Leave the interior: drop the room geometry and its physics statics so we fall back to outdoor
  // terrain grounding. Called when a snapshot arrives WITHOUT a sceneUrl while an interior is active.
  const exitInterior = () => {
    if (!interiorObject) return;
    scene.remove(interiorObject);
    disposeObject(interiorObject);
    interiorObject = null;
    interiorSceneUrl = null;
    rapierPhysics?.clearStatics();
    ocean.visible = !isContinentalChunkedWorld;
    archipelago.visible = !isContinentalChunkedWorld;
    terrain.visible = !isChunked;
    pondWater.visible = !isChunked;
    flowerPatchGroup.visible = true;
    floatingRim.visible = !isChunked;
    setChunkedFlatGround(isChunked ? 0 : null); // restore the world's normal grounding
  };

  // ── TELLUS INFINITY tiles (Phase 4) ── mount a 3D Tileset as the RENDER substrate (the gameplay height
  // still comes from the baked chunk heightfield, so agents + players agree). Experimental spike: a tiles-*
  // world's snapshot carries a tileSetUrl; we hide the placeholder terrain + stream the tileset.
  let tilesRenderer: TilesRenderer | null = null;
  let tileSetUrl: string | null = null;
  const mountTileset = (url: string) => {
    const u = url.trim();
    if (!u || u === tileSetUrl || !renderer) return;
    tileSetUrl = u;
    for (const m of [ocean, archipelago, terrain]) m.visible = false;
    try {
      tilesRenderer = new TilesRenderer(u);
      tilesRenderer.setCamera(camera);
      tilesRenderer.setResolutionFromRenderer(camera, renderer as THREE.WebGLRenderer);
      scene.add(tilesRenderer.group);
      addLog({ agentId: "world", agentName: "Tellus", tool: "interact", text: `Mounted 3D tileset: ${u}` });
    } catch (error) {
      addLog({ agentId: "world", agentName: "Tellus", tool: "interact", text: `tileset mount failed: ${error}` });
    }
  };

  // ── TELLUS INFINITY portal MARKERS (3D) ── a glowing ring + light pillar at each portal, synced from the
  // world's portal set. A per-frame proximity check (in animate) auto-enters when the player walks into the
  // trigger radius (debounced so it fires once per approach). No art assets — pure THREE primitives.
  const portalMarkerGroup = new THREE.Group();
  portalMarkerGroup.name = "tellus-portal-markers";
  scene.add(portalMarkerGroup);
  const portalMarkers = new Map<string, THREE.Object3D>();
  const pendingPortalIds = new Set<string>();
  const pendingPortalStartedAt = new Map<string, number>();
  const pendingPortalWarnedIds = new Set<string>();
  const pendingDeletedPortals = new Map<string, WorldPortal>();
  let lastPortalEnterAt = 0;
  let insidePortalId: string | null = null;
  // Set on spawn/warp/interior-entry; blocks portal auto-enter until the player is clear of ALL
  // portals once (prevents the "spawn on the door → bounce back" loop, robust to async portal load).
  let portalSpawnGuard = false;
  const makePortalMarker = (interior: boolean, pending = false): THREE.Object3D => {
    const g = new THREE.Group();
    const color = pending ? 0x9b7cff : interior ? 0xffc84f : 0xffdc3d;
    const bright = pending ? 0xd8c6ff : interior ? 0xfff0a6 : 0xffff8a;
    g.userData.portalMarkerKey = `${interior ? "interior" : "world"}:${pending ? "pending" : "ready"}`;
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: bright,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const base = new THREE.Mesh(
      new THREE.TorusGeometry(1.6, 0.12, 10, 36),
      ringMaterial,
    );
    base.rotation.x = Math.PI / 2;
    base.position.y = 0.12;
    const triggerRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.035, 8, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: pending ? 0.36 : 0.28,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    triggerRing.rotation.x = Math.PI / 2;
    triggerRing.position.y = 0.08;
    triggerRing.userData.portalTriggerRing = true;
    const swirl = new THREE.Group();
    swirl.userData.portalSpin = pending ? 1.6 : interior ? -0.9 : 1.1;
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(0.7 + i * 0.34, 0.045, 8, 36, Math.PI * 1.35),
        i === 1 ? glowMaterial : ringMaterial,
      );
      arc.rotation.x = Math.PI / 2;
      arc.rotation.z = i * 2.1;
      arc.position.y = 0.34 + i * 0.26;
      swirl.add(arc);
    }
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 5.8, 10, 1, true),
      glowMaterial,
    );
    pillar.position.y = 3.1;
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.055, 8, 32),
      glowMaterial,
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.35;
    halo.userData.portalBob = 1;
    if (pending) {
      const topHalo = new THREE.Mesh(
        new THREE.TorusGeometry(0.82, 0.035, 8, 28),
        glowMaterial,
      );
      topHalo.rotation.x = Math.PI / 2;
      topHalo.position.y = 2.05;
      topHalo.userData.portalBob = -1;
      topHalo.userData.portalSpin = -1.9;
      g.add(topHalo);
    }
    g.add(triggerRing, base, swirl, halo, pillar);
    return g;
  };
  const portalAnchorPosition = (p: WorldPortal): Vec3 => {
    const anchor = p.anchorThingId
      ? generated.find((thing) => thing.id === p.anchorThingId)
      : undefined;
    return anchor?.position ?? p.position;
  };
  const markPortalReady = (p: WorldPortal) => {
    const wasPending = pendingPortalIds.delete(p.id);
    pendingPortalStartedAt.delete(p.id);
    pendingPortalWarnedIds.delete(p.id);
    if (wasPending) {
      addLog({
        agentId: "world",
        agentName: "Tellus",
        tool: "interact",
        text: `Portal ready: ${p.label || p.target.worldId}`,
      });
    }
  };
  const mergePortalSnapshot = (snapshotPortals: WorldPortal[]) => {
    const byId = new Map<string, WorldPortal>();
    for (const p of snapshotPortals) {
      markPortalReady(p);
      byId.set(p.id, p);
    }
    for (const p of worldPortals) {
      if (pendingPortalIds.has(p.id) && !byId.has(p.id)) byId.set(p.id, p);
    }
    worldPortals = Array.from(byId.values());
  };
  const portalGroundY = (p: WorldPortal): number => {
    const position = portalAnchorPosition(p);
    let best = groundHeightAt(position.x, position.z);
    const r = Math.min(Math.max(0.5, p.radius), 6);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const h = groundHeightAt(
        position.x + Math.cos(a) * r,
        position.z + Math.sin(a) * r,
      );
      if (h !== null && Number.isFinite(h) && (best === null || h > best)) best = h;
    }
    return best ?? (Number.isFinite(position.y) ? position.y : SEA_LEVEL);
  };
  const syncPortalMarkers = () => {
    const seen = new Set<string>();
    for (const p of worldPortals) {
      seen.add(p.id);
      const pending = pendingPortalIds.has(p.id);
      const markerKey = `${p.target.kind === "interior" ? "interior" : "world"}:${pending ? "pending" : "ready"}`;
      let marker = portalMarkers.get(p.id);
      if (marker && marker.userData.portalMarkerKey !== markerKey) {
        portalMarkerGroup.remove(marker);
        disposeObject(marker);
        portalMarkers.delete(p.id);
        marker = undefined;
      }
      if (!marker) {
        marker = makePortalMarker(p.target.kind === "interior", pending);
        portalMarkers.set(p.id, marker);
        portalMarkerGroup.add(marker);
      }
      const position = portalAnchorPosition(p);
      const y = portalGroundY(p) + 0.05;
      marker.position.set(position.x, y, position.z);
      const triggerRing = marker.children.find((child) => child.userData.portalTriggerRing);
      if (triggerRing) {
        const r = Math.max(1.2, p.radius);
        triggerRing.scale.set(r, 1, r);
      }
    }
    for (const [id, marker] of portalMarkers) {
      if (seen.has(id)) continue;
      portalMarkerGroup.remove(marker);
      disposeObject(marker);
      portalMarkers.delete(id);
    }
  };
  // Called each frame: auto-enter when the player stands in a portal's trigger volume.
  const updatePortals = (now: number) => {
    for (const marker of portalMarkers.values()) {
      marker.rotation.y = now * 0.00025;
      for (const child of marker.children) {
        const spin = Number(child.userData.portalSpin);
        if (spin) child.rotation.y = now * 0.001 * spin;
        const bob = Number(child.userData.portalBob);
        if (bob) child.position.y = (bob > 0 ? 1.35 : 2.05) + Math.sin(now * 0.002) * 0.16 * bob;
      }
    }
    if (worldPortals.length === 0) {
      portalSpawnGuard = false; // no portals here — nothing to be guarded against
      return;
    }
    let nearId: string | null = null;
    for (const p of worldPortals) {
      if (pendingPortalIds.has(p.id)) continue;
      const position = portalAnchorPosition(p);
      const d = Math.hypot(visitorPosition.x - position.x, visitorPosition.z - position.z);
      if (d <= Math.max(1.2, p.radius)) {
        nearId = p.id;
        break;
      }
    }
    // Spawn protection: while guarded, suppress auto-enter entirely. The guard lifts the moment the
    // player is clear of every portal — then normal proximity entry resumes.
    if (portalSpawnGuard) {
      if (!nearId) portalSpawnGuard = false;
      insidePortalId = nearId;
      return;
    }
    if (nearId && nearId !== insidePortalId && now - lastPortalEnterAt > 2500) {
      lastPortalEnterAt = now;
      insidePortalId = nearId;
      enterPortal(nearId);
    } else if (!nearId) {
      insidePortalId = null;
    }
    for (const id of pendingPortalIds) {
      const started = pendingPortalStartedAt.get(id);
      if (!started || pendingPortalWarnedIds.has(id) || now - started < 8000) continue;
      pendingPortalWarnedIds.add(id);
      const portal = worldPortals.find((p) => p.id === id);
      // No confirm AND no rejection after 8s usually means the server isn't acting on the upsert at
      // all — most often Features.Portals is disabled on this silo, or you don't own this world (only
      // the owner / an unowned world can manage portals). Be honest rather than spin forever.
      addLog({
        agentId: "world",
        agentName: "Tellus",
        tool: "interact",
        text: `Portal "${portal?.label || id}" wasn't confirmed — portals may be disabled on this server, or you may not own this world.`,
      });
      publish();
    }
  };

  let transformControls: TransformControls | null = null;
  let transformControlsHelper: THREE.Object3D | null = null;
  let transformControlsObject: THREE.Object3D | null = null;
  let transformDragging = false;

  const sun = new THREE.DirectionalLight(0xffdfb7, 4.1);
  sun.position.set(-55, 58, 42);
  sun.castShadow = true;
  const moon = new THREE.DirectionalLight(0x9fb7ff, 0.55);
  moon.position.set(55, 42, -42);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  const hemisphere = new THREE.HemisphereLight(0xb6ccff, 0x3d5332, 2.25);
  scene.add(sun, moon, hemisphere);

  const visitor = createVisitorMesh(useWebGPU);
  // Chunked worlds place origin at a CORNER, so spawn at the world centre (from the manifest bounds)
  // to land in the middle of the tiled plane; non-chunked special worlds use the compatibility spawn.
  const chunkedCenter = chunkedWorldCenter();
  let visitorPosition = chunkedCenter
    ? groundedPosition(chunkedCenter.x, chunkedCenter.z)
    : normalizedDiscPosition(-20, 20);
  scene.add(visitor);
  // ── Avatar selection (the toolbelt picker) ────────────────────────────────
  // localAvatarId = YOUR explicit catalog pick ("" = none → deterministic per-visitor robot); it
  // persists in localStorage and rides every presence.update so others render the same pick.
  // applyAvatarTo is the ONLY mount/swap path (local AND remote): it tears down the previous rig,
  // restores the procedural TV-head in place, then mounts the requested rig async — the per-owner
  // token guards overlapping loads, and the mesh-identity check guards a prune mid-load.
  let localAvatarId = storedAvatarId();
  // localAvatarScale = YOUR avatar-size multiplier (the picker "Size" slider; 1 = default). It is
  // VISUAL-ONLY — physics/collision/movement never see it — persists in localStorage
  // "tellus.avatarScale" and rides every presence.update (server clamps to [0.1, 8]) so others
  // render you at the same size. Remote scales arrive on presence and ease in via tickAvatarScale.
  let localAvatarScale = storedAvatarScale();
  const appliedAvatarIds = new Map<string, string>();
  const avatarApplyTokens = new Map<string, number>();
  const applyAvatarTo = (group: THREE.Group, ownerId: string, requestedId: string): void => {
    const token = (avatarApplyTokens.get(ownerId) ?? 0) + 1;
    avatarApplyTokens.set(ownerId, token);
    appliedAvatarIds.set(ownerId, requestedId);
    avatarRigs.get(ownerId)?.dispose();
    avatarRigs.delete(ownerId);
    restoreProceduralAvatar(group);
    const stillCurrent = () =>
      !destroyed &&
      avatarApplyTokens.get(ownerId) === token &&
      (ownerId === visitorId || remoteVisitorMeshes.get(ownerId) === group);
    // "classic" (and any load failure) resolves null — the restored procedural robot stays.
    void attachAvatarRig(group, ownerId, requestedId, useWebGPU, stillCurrent).then((rig) => {
      if (!rig) return;
      if (!stillCurrent()) {
        rig.dispose();
        return;
      }
      avatarRigs.set(ownerId, rig);
    });
  };
  applyAvatarTo(visitor, visitorId, localAvatarId);
  setAvatarUserScale(visitor, localAvatarScale, true); // persisted size from the very first frame
  // Local locomotion state is derived per-frame from the position delta in animate().
  const lastLocalAvatarPos = { x: visitorPosition.x, z: visitorPosition.z };
  // Diagnostics hooks (smoke tests / console) — mirror the other __tellus* hooks. The referenced
  // closures are defined later in this function; the arrow bodies only resolve them at call time.
  window.__tellusViewDebug = {
    setAgentViewport: (id) => setAgentViewport(id),
    hasVisitorAvatar: (id) => hasVisitorAvatar(id),
    setCameraMode: (mode) => setCameraMode(mode),
    getCameraMode: () => cameraMode,
    injectRemotePresence: (id: string, x: number, z: number, avatarScale?: number) => {
      const now = new Date().toISOString();
      applyRemotePresence([
        ...Array.from(remoteVisitors.values()),
        { visitorId: id, position: { x, y: 0, z }, avatarScale, connectedAt: now, lastSeenAt: now },
      ]);
    },
  };
  // Mirror diagnostics (smoke tests / console): how many placed mirrors render live (have a
  // Reflector) vs as static tinted glass, plus the live-cap.
  window.__tellusMirrorDebug = () => {
    let live = 0;
    let glass = 0;
    for (const mesh of generatedMeshes.values()) {
      if (mesh.userData.mirrorReflector) live++;
      else if (mesh.userData.mirrorGlass) glass++;
    }
    return { live, glass, liveCap: MAX_LIVE_MIRRORS, trackedLive: liveMirrorCount() };
  };
  window.__tellusWorldDebug = () => ({
    worldId: runtimeConfig.worldId,
    runtimeTemplate: parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
    runtimeSkyboxUrl: runtimeConfig.skyboxUrl,
    chunkedWorldChunks: getChunkedWorldChunks(),
  });
  const countSkinnedMeshes = (root: THREE.Object3D | undefined): number => {
    if (!root) return 0;
    let n = 0;
    root.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) n++;
    });
    return n;
  };
  // Per-thing render diagnostics (smoke tests / console). Cheap: only walks state when called.
  window.__tellusThingsDebug = () =>
    generated.map((thing) => {
      const mesh = generatedMeshes.get(thing.id);
      let inScene = false;
      for (let node: THREE.Object3D | null = mesh ?? null; node; node = node.parent) {
        if (node === scene) {
          inScene = true;
          break;
        }
      }
      let instanced = false;
      for (const pool of instancePools.values()) {
        if (pool.thingToSlot.has(thing.id)) {
          instanced = true;
          break;
        }
      }
      return {
        id: thing.id,
        kind: thing.kind,
        prompt: thing.prompt.slice(0, 48),
        status: thing.generationStatus ?? "unknown",
        hasMesh: Boolean(mesh),
        meshVisible: mesh?.visible ?? false,
        inScene,
        loaded: Boolean(thing.modelUrl) && mesh?.userData.loadedModelUrl === thing.modelUrl,
        swirl: Boolean(mesh?.userData.generatingSwirl),
        instanced,
        worldPos: mesh
          ? (({ x, y, z }) => ({ x, y, z }))(mesh.getWorldPosition(new THREE.Vector3()))
          : undefined,
        worldScale: mesh ? mesh.getWorldScale(new THREE.Vector3()).y : undefined,
        // Embedded clip count of the loaded file. VRM autons are clip-less (0) but animate via a
        // retargeted VRMA action — `vrm` flags that, `playing` is true, and `vrmaClips` lists the
        // VRMA catalog clips the rig retargeted.
        clipCount: generatedModelClips(mesh).length,
        vrm: Boolean(mesh?.userData.vrmObjectRig),
        vrmaClips: mesh?.userData.vrmObjectRig
          ? (mesh.userData.vrmObjectRig as VrmObjectRig).clipNames()
          : [],
        skinnedMeshCount: countSkinnedMeshes(mesh),
        playing:
          generatedAnimationMixers.has(thing.id) || generatedVrmRigs.has(thing.id),
      };
    });
  window.__tellusAvatarDebug = () => {
    let skinned = 0;
    visitor.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) skinned++;
    });
    const bodyParts =
      (visitor.userData.robotBodyParts as THREE.Object3D[] | undefined) ?? [];
    // World-space Y scale of the local avatar's visible silhouette (mounted rigged model, else the
    // classic torso) — lets smoke tests assert the actual applied node scale, not just the knob.
    const scaleProbe =
      (visitor.userData.avatarMountedModel as THREE.Object3D | undefined) ?? bodyParts[0];
    const probeWorldScale = scaleProbe
      ? scaleProbe.getWorldScale(new THREE.Vector3()).y
      : 1;
    const remoteScales: Record<string, number> = {};
    for (const [remoteId, mesh] of remoteVisitorMeshes) {
      remoteScales[remoteId] = getAvatarUserScale(mesh);
    }
    return {
      localVisitorId: visitorId,
      localAvatarId: appliedAvatarIds.get(visitorId) ?? "",
      rigIds: Array.from(avatarRigs.keys()),
      localSkinnedMeshes: skinned,
      localBodyHidden:
        bodyParts.length > 0 && bodyParts.every((part) => !part.visible),
      localScale: getAvatarUserScale(visitor),
      localModelWorldScaleY: probeWorldScale,
      remoteScales,
    };
  };

  // DEV-ONLY: force into a generated interior room WITHOUT a server portal (Features.Portals may be
  // off on the silo, blocking the real door→portal→interior flow). Lets us verify the interior physics
  // — walk floors/stairs, hit walls, furniture grounding — locally. window.__tellusEnterInterior() to
  // build a 2-level room with stairs; window.__tellusExitInterior() to return outdoors. Strip before ship.
  window.__tellusEnterInterior = () => {
    // A fake-but-non-empty sceneUrl: applyInterior renders the procedural room (generateInteriorRoom)
    // and Track A bakes its solid meshes into Rapier trimesh statics.
    applyInterior(GENERATED_INTERIOR_SCENE_URL);
  };
  window.__tellusExitInterior = () => exitInterior();
  // DEV-ONLY perf readout: window.__tellusPerf() → { fps, vegetation: {tier, chunks, trees, grassTris} }.
  window.__tellusPerf = () => ({ fps: fpsValue, vegetation: vegetation.stats() });

  let yaw = 0.72;
  let pitch = -0.28;
  let zoom = 33;
  // ── Camera mode: presentation-only (physics/movement untouched). "first" parks the main camera
  // at the LOCAL avatar's head (same eye math as the agent POV) and hides your own avatar+TV
  // locally — other players still see you (they render their own mesh from presence). Persists in
  // localStorage "tellus.cameraMode"; the toolbelt Eye button and the V key flip it. ──
  type CameraMode = "first" | "third";
  const CAMERA_MODE_STORAGE_KEY = "tellus.cameraMode";
  let cameraMode: CameraMode = (() => {
    try {
      return window.localStorage.getItem(CAMERA_MODE_STORAGE_KEY) === "first" ? "first" : "third";
    } catch {
      return "third";
    }
  })();
  const FIRST_PERSON_EYE_HEIGHT = 2.4; // matches poseAgentPovCamera's avatar head height (× scale)
  // The eye rides the avatar's CURRENT (lerped) user scale — a giant sees from a giant's head.
  const firstPersonEyeHeight = () => FIRST_PERSON_EYE_HEIGHT * getAvatarUserScale(visitor);
  const applyCameraModeVisibility = () => {
    // Whole-group toggle: body + TV + marker. Remote meshes are per-client, so this is local-only.
    visitor.visible = cameraMode !== "first";
  };
  const setCameraMode = (mode: CameraMode) => {
    if (mode === cameraMode) return;
    cameraMode = mode;
    try {
      window.localStorage.setItem(CAMERA_MODE_STORAGE_KEY, mode);
    } catch {
      /* private mode — the selection just won't persist */
    }
    applyCameraModeVisibility();
    updateCamera();
    // Let the React HUD (the toolbelt Eye button) track mode flips that originate here (V key).
    window.dispatchEvent(new CustomEvent("tellus:camera-mode", { detail: mode }));
  };
  applyCameraModeVisibility(); // honor a persisted "first" from the very first frame
  let isDragging = false;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTravel = 0;
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  const snapshot = (): TellusSnapshot => ({
    generated: generated.map((thing) => ({
      ...thing,
      position: { ...thing.position },
    })),
    logs: logs.slice(-80),
    worldChat: worldChat.slice(-120),
    generationProvider: runtimeConfig.generationProvider,
    playerGenerationProvider: runtimeConfig.playerGenerationProvider,
    agentGenerationProvider: runtimeConfig.agentGenerationProvider,
    instantMeshTarget: runtimeConfig.instantMeshTarget,
    userId,
    visitorId,
    visitorPosition: { ...visitorPosition },
    visitorYaw: yaw, // facing direction (radians) for the minimap view cone
    viewDistance: scene.fog instanceof THREE.Fog ? scene.fog.far : 200 * WORLD_SCALE, // how far we can see
    remoteVisitors: Array.from(remoteVisitors.values()).map((presence) => ({
      ...presence,
      position: presence.position ? { ...presence.position } : undefined,
    })),
    selectedThingId,
    sailingThingId,
    portals: worldPortals.map((p) => ({ ...p, position: { ...p.position }, target: { ...p.target } })),
    portalSwitch: pendingPortalSwitch ?? undefined,
    biomeCells: worldBiomeCells.size > 0 ? Array.from(worldBiomeCells.values()).map((c) => ({ ...c })) : undefined,
  });

  // Coalesce HUD publishes to at most one per animation frame. publish() can be called many times per frame
  // (every WS patch, every transform-drag frame); each onSnapshot is a deep-cloned snapshot + a React
  // re-render, so collapsing them to a single flush in animate() removes the per-frame clone/render storm.
  let publishPending = false;
  let lastSnapshotFlushAt = 0;
  let lastSnapshotSignature = "";
  const MIN_SNAPSHOT_FLUSH_MS = 250;
  const snapshotSignature = (s: TellusSnapshot): string => {
    const pos = s.visitorPosition ?? { x: 0, y: 0, z: 0 };
    const generatedSig = s.generated
      .map((thing) =>
        [
          thing.id,
          thing.generationStatus ?? "",
          Math.round(thing.position.x * 2),
          Math.round(thing.position.y * 2),
          Math.round(thing.position.z * 2),
          Math.round((thing.rotationY ?? 0) * 20),
          thing.petOwnerId ?? "",
        ].join(":"),
      )
      .join("|");
    return [
      Math.round(pos.x * 2),
      Math.round(pos.y * 2),
      Math.round(pos.z * 2),
      Math.round((s.visitorYaw ?? 0) * 20),
      s.selectedThingId ?? "",
      s.sailingThingId ?? "",
      s.logs.length,
      s.worldChat.length,
      s.remoteVisitors.length,
      s.portals?.length ?? 0,
      s.portalSwitch
        ? `${s.portalSwitch.toWorldId}:${s.portalSwitch.spawn?.x ?? 0}:${s.portalSwitch.spawn?.z ?? 0}`
        : "",
      generatedSig,
    ].join(";");
  };
  const publish = () => {
    publishPending = true;
  };
  const flushPublish = () => {
    if (!publishPending) return;
    const nowMs = performance.now();
    const force = pendingPortalSwitch !== null;
    if (!force && nowMs - lastSnapshotFlushAt < MIN_SNAPSHOT_FLUSH_MS) return;
    publishPending = false;
    const nextSnapshot = snapshot();
    const signature = snapshotSignature(nextSnapshot);
    if (!force && signature === lastSnapshotSignature) return;
    lastSnapshotFlushAt = nowMs;
    lastSnapshotSignature = signature;
    onSnapshot(nextSnapshot);
    // The world.portal.entered signal is one-shot — the snapshot captured it by value, so clear it now so it
    // doesn't re-fire the React world-switch effect on the next publish.
    pendingPortalSwitch = null;
  };

  const addLog = (entry: Omit<TellusLog, "id" | "tick">): TellusLog => {
    const log: TellusLog = {
      id: makeId("log"),
      tick,
      ...entry,
    };
    logs.push(log);
    if (logs.length > 120) logs.shift();
    publish();
    return log;
  };

  const displayNameForVisitor = (id: string): string => {
    return friendlyVisitorName(id, remoteVisitors.get(id)?.name, visitorId);
  };

  const enrichedWorldChatMessage = (message: WorldChatMessage): WorldChatMessage => {
    const recipientId = message.recipientId?.trim() || undefined;
    return {
      ...message,
      senderName: message.senderName?.trim() || displayNameForVisitor(message.visitorId),
      recipientId,
      recipientName: message.recipientName?.trim() || (recipientId ? displayNameForVisitor(recipientId) : undefined),
      position: message.position ? { ...message.position } : undefined,
    };
  };

  const addWorldChatMessage = (message: WorldChatMessage): WorldChatMessage | null => {
    const text = message.text.trim().slice(0, 800);
    if (!text || seenWorldChatIds.has(message.id)) return null;
    const normalizedChannel =
      message.channel === "nearby" ? "nearby" : message.channel === "dm" ? "dm" : "world";
    const normalized: WorldChatMessage = {
      ...enrichedWorldChatMessage(message),
      text,
      channel: normalizedChannel,
    };
    worldChat.push(normalized);
    seenWorldChatIds.add(normalized.id);
    while (worldChat.length > 160) {
      const removed = worldChat.shift();
      if (removed) seenWorldChatIds.delete(removed.id);
    }
    publish();
    return normalized;
  };

  const mergeWorldChatMessages = (messages: WorldChatMessage[]) => {
    for (const message of messages) addWorldChatMessage(message);
  };

  const nearbyWorldChat = (radius = 36, channel?: WorldChatChannel): WorldChatMessage[] =>
    worldChat
      .filter((message) => {
        if (channel && message.channel !== channel) return false;
        if (message.channel !== "nearby") return true;
        if (!message.position) return true;
        return distance2D(visitorPosition, message.position) <= radius;
      })
      .slice(-40);

  const sendWorldChat = (
    text: string,
    channel: WorldChatChannel = "world",
    recipientId?: string,
    recipientName?: string,
    senderName?: string,
  ): WorldChatMessage | null => {
    const trimmed = text.trim().slice(0, 800);
    if (!trimmed) return null;
    const normalizedChannel =
      channel === "nearby" ? "nearby" : channel === "dm" ? "dm" : "world";
    if (normalizedChannel === "dm" && !recipientId?.trim()) return null;
    const normalizedRecipientId = normalizedChannel === "dm" ? recipientId?.trim() : undefined;
    const message: WorldChatMessage = {
      id: makeId("chat"),
      visitorId,
      senderName: senderName?.trim() || displayNameForVisitor(visitorId),
      text: trimmed,
      channel: normalizedChannel,
      recipientId: normalizedRecipientId,
      recipientName: normalizedRecipientId ? recipientName?.trim() || displayNameForVisitor(normalizedRecipientId) : undefined,
      position: { ...visitorPosition },
      createdAt: new Date().toISOString(),
    };
    addWorldChatMessage(message);
    const frame = { type: "world.chat", visitorId, message };
    if (worldSocket?.readyState === WebSocket.OPEN) {
      worldSocket.send(JSON.stringify(frame));
    } else if (tellusWorldBackendAvailable) {
      void fetch(tellusWorldHttpUrl("action"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(frame),
      }).catch(() => undefined);
    }
    return message;
  };

  const sampleMapPoint = (x: number, z: number): { height: number; kind: TerrainKind; loaded: boolean } => {
    if (waterFeatureContains(x, z, 0)) {
      return { height: waterFeatureLevel(), kind: "water", loaded: true };
    }
    if (isChunked) {
      const height = chunkRenderer?.sampleHeight(x, z);
      if (height != null && Number.isFinite(height)) {
        const kind = largeWorldTerrainKind(x, z);
        return { height, kind: kind === "water" ? "beach" : kind, loaded: true };
      }
      return {
        height: isContinentalChunkedWorld ? largeWorldBaseHeight(x, z) : SEA_LEVEL - 8,
        kind: isContinentalChunkedWorld ? largeWorldTerrainKind(x, z) : "water",
        loaded: false,
      };
    }
    const height = terrainHeight(x, z);
    return { height, kind: terrainKind(x, z, height), loaded: true };
  };

  let worldChatPollTimer: number | undefined;
  const pollWorldChatSnapshot = async () => {
    if (!tellusWorldBackendAvailable || destroyed) return;
    try {
      const response = await fetch(tellusWorldHttpUrl("state"), { cache: "no-store" });
      if (!response.ok) return;
      const parsed = (await response.json()) as unknown;
      const chatMessages = worldChatFromWorldPatch(parsed);
      if (chatMessages) mergeWorldChatMessages(chatMessages);
      const remoteThings = generatedFromWorldPatch(parsed);
      if (remoteThings) reconcileGeneratedSnapshot(remoteThings);
    } catch {
      // Best-effort freshness fallback; the websocket remains the primary realtime path.
    }
  };

  const announceWorldChat = (text: string, position?: Vec3) => {
    const message: WorldChatMessage = {
      id: makeId("chat"),
      visitorId: "world",
      senderName: "World",
      text,
      channel: "world",
      position: position ? { ...position } : undefined,
      createdAt: new Date().toISOString(),
    };
    addWorldChatMessage(message);
    const frame = { type: "world.chat", visitorId, message };
    if (worldSocket?.readyState === WebSocket.OPEN) {
      worldSocket.send(JSON.stringify(frame));
    }
  };

  const updatePondSurfacePosition = () => {
    const waterLevel = waterFeatureLevel();
    const pondSurface = pondWater.getObjectByName("tellus-pond-surface");
    if (pondSurface) {
      pondSurface.position.x = waterFeatureCenter.x;
      pondSurface.position.y = waterLevel;
      pondSurface.position.z = waterFeatureCenter.z;
      pondSurface.rotation.z = 0;
    }
    const ripples = pondWater.getObjectByName("tellus-pond-ripples");
    if (ripples) ripples.position.set(waterFeatureCenter.x, waterLevel + 0.035, waterFeatureCenter.z);
    const shore = pondWater.getObjectByName("tellus-pond-shore");
    if (shore) shore.position.set(waterFeatureCenter.x, waterLevel - 0.035, waterFeatureCenter.z);
  };

  const setWaterSettings = (settings: WaterSettings) => {
    runtimeConfig.waterSettings = parseWaterSettings(settings, runtimeConfig.waterSettings);
    const previousOceanMaterial = ocean.material;
    ocean.material = useWebGPU
      ? createBackdropWaterMaterial(runtimeConfig.waterSettings)
      : createFallbackOceanMaterial(runtimeConfig.waterSettings);
    disposeMaterial(previousOceanMaterial);

    const rebuiltPond = createPondWater({
      center: waterFeatureCenter,
      radius: waterFeatureRadius,
      waterLevel: waterFeatureLevel(),
      animated: useWebGPU,
      waterSettings: runtimeConfig.waterSettings,
    });
    for (const child of [...pondWater.children]) {
      pondWater.remove(child);
      disposeObject(child);
    }
    for (const child of [...rebuiltPond.children]) {
      rebuiltPond.remove(child);
      pondWater.add(child);
    }
    updatePondSurfacePosition();
  };

  const refreshFlowerPatches = () => {
    flowerPatchGroup.clear();
    if (isChunked) return;
    const flowerCode = terrainPaintCode("flowers");
    let flowerCount = 0;
    for (
      let zIndex = 1;
      zIndex < TERRAIN_VERTEX_COUNT - 1 && flowerCount < 180;
      zIndex += 2
    ) {
      for (
        let xIndex = 1;
        xIndex < TERRAIN_VERTEX_COUNT - 1 && flowerCount < 180;
        xIndex += 2
      ) {
        const index = terrainGridIndex(xIndex, zIndex);
        if (terrainPaint[index] !== flowerCode) continue;
        const seed = xIndex * 1009 + zIndex * 9176;
        if (rand(seed + 31) < 0.34) continue;
        const vx = (xIndex / TERRAIN_SEGMENTS - 0.5) * WORLD_RADIUS * 2;
        const vz = (zIndex / TERRAIN_SEGMENTS - 0.5) * WORLD_RADIUS * 2;
        if (Math.hypot(vx, vz) > WORLD_RADIUS - 1) continue;
        const jitterX = (rand(seed + 101) - 0.5) * 1.2;
        const jitterZ = (rand(seed + 203) - 0.5) * 1.2;
        const x = vx + jitterX;
        const z = vz + jitterZ;
        const sprite = new THREE.Sprite(
          flowerSpriteMaterials[flowerCount % flowerSpriteMaterials.length],
        );
        sprite.position.set(x, terrainHeight(x, z) + 0.16, z);
        const scale = 0.34 + rand(seed + 409) * 0.2;
        sprite.scale.set(scale, scale, scale);
        sprite.renderOrder = 2;
        flowerPatchGroup.add(sprite);
        flowerCount++;
      }
    }
  };

  const rebuildCentralTerrain = () => {
    const positions = terrain.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const colors = terrain.geometry.getAttribute("color") as THREE.BufferAttribute;
    const renderRow = terrainRenderSegments + 1;
    for (let zIndex = 0; zIndex <= terrainRenderSegments; zIndex++) {
      const vz = (zIndex / terrainRenderSegments - 0.5) * WORLD_RADIUS * 2;
      for (let xIndex = 0; xIndex <= terrainRenderSegments; xIndex++) {
        const vx = (xIndex / terrainRenderSegments - 0.5) * WORLD_RADIUS * 2;
        const radius = Math.hypot(vx, vz);
        const inside = radius <= WORLD_RADIUS;
        const edgeScale = inside ? 1 : WORLD_RADIUS / radius;
        const px = vx * edgeScale;
        const pz = vz * edgeScale;
        const py = inside ? terrainHeight(px, pz) : -4.5;
        const index = zIndex * renderRow + xIndex;
        positions.setXYZ(index, px, py, pz);
        const color = terrainVertexColor(
          inside ? terrainKind(px, pz, py) : "rock",
          px,
          pz,
          xIndex * 1009 + zIndex * 9176,
        );
        colors.setXYZ(index, color.r, color.g, color.b);
      }
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    terrain.geometry.computeVertexNormals();
    refreshFlowerPatches();
  };
  // Localized color-only repaint: paint strokes change ONLY the vertex color inside the brush — height
  // and normals are untouched — so there's no reason to walk all ~50K vertices or recompute normals.
  // We rebuild colors for just the render-grid rows/cols that overlap the brush AABB. A single full
  // rebuild costs ~50K vertex writes + a full computeVertexNormals(); a brush touches a few hundred.
  const repaintCentralTerrainRegion = (
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
  ) => {
    const colors = terrain.geometry.getAttribute("color") as THREE.BufferAttribute;
    const renderRow = terrainRenderSegments + 1;
    const span = WORLD_RADIUS * 2;
    // Map the world-space brush AABB to render-grid index ranges (one cell of padding for falloff seams).
    const toIndex = (w: number) =>
      clamp(Math.floor(((w / span) + 0.5) * terrainRenderSegments), 0, terrainRenderSegments);
    const x0 = Math.max(0, toIndex(minX) - 1);
    const x1 = Math.min(terrainRenderSegments, toIndex(maxX) + 1);
    const z0 = Math.max(0, toIndex(minZ) - 1);
    const z1 = Math.min(terrainRenderSegments, toIndex(maxZ) + 1);
    for (let zIndex = z0; zIndex <= z1; zIndex++) {
      const vz = (zIndex / terrainRenderSegments - 0.5) * span;
      for (let xIndex = x0; xIndex <= x1; xIndex++) {
        const vx = (xIndex / terrainRenderSegments - 0.5) * span;
        const radius = Math.hypot(vx, vz);
        const inside = radius <= WORLD_RADIUS;
        const edgeScale = inside ? 1 : WORLD_RADIUS / radius;
        const px = vx * edgeScale;
        const pz = vz * edgeScale;
        const py = inside ? terrainHeight(px, pz) : -4.5;
        const color = terrainVertexColor(
          inside ? terrainKind(px, pz, py) : "rock",
          px,
          pz,
          xIndex * 1009 + zIndex * 9176,
        );
        colors.setXYZ(zIndex * renderRow + xIndex, color.r, color.g, color.b);
      }
    }
    colors.needsUpdate = true;
  };

  // Coalesce the full 9409-vertex rebuild (positions + colors + computeVertexNormals + flower patches) to one
  // flush per frame — rapid sculpt steps and remote terrain patches no longer recompute the whole grid N
  // times per frame. Terrain height queries use the math (terrainHeight), not the mesh, so a 1-frame defer is
  // invisible.
  let centralTerrainDirty = false;
  // Accumulated world-space AABB for paint-only (color) strokes that don't need a full rebuild. Stays
  // null whenever a height-changing op (sculpt) or a remote patch forces the full path.
  let paintDirtyBounds: { minX: number; minZ: number; maxX: number; maxZ: number } | null = null;
  const refreshTerrainGeometry = () => {
    centralTerrainDirty = true;
    paintDirtyBounds = null; // full rebuild requested — discard any pending localized region
  };
  // Request a cheap color-only refresh over a brush AABB. Falls back to a full rebuild automatically if
  // a full rebuild is already pending this frame.
  const refreshTerrainPaintRegion = (
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
  ) => {
    if (centralTerrainDirty && !paintDirtyBounds) return; // full rebuild already covers it
    paintDirtyBounds = paintDirtyBounds
      ? {
          minX: Math.min(paintDirtyBounds.minX, minX),
          minZ: Math.min(paintDirtyBounds.minZ, minZ),
          maxX: Math.max(paintDirtyBounds.maxX, maxX),
          maxZ: Math.max(paintDirtyBounds.maxZ, maxZ),
        }
      : { minX, minZ, maxX, maxZ };
    centralTerrainDirty = true;
  };
  const flushTerrain = () => {
    if (!centralTerrainDirty) return;
    centralTerrainDirty = false;
    if (paintDirtyBounds) {
      // Paint-only frame: recolor just the brushed region, skip positions + computeVertexNormals.
      const b = paintDirtyBounds;
      paintDirtyBounds = null;
      repaintCentralTerrainRegion(b.minX, b.minZ, b.maxX, b.maxZ);
      refreshFlowerPatches();
      vegetation.notifyTerrainChanged();
      return;
    }
    rebuildCentralTerrain();
    // Re-grow the procedural vegetation lazily wherever the terrain changed (local sculpt or remote
    // patch both funnel through here).
    vegetation.notifyTerrainChanged();
  };
  refreshFlowerPatches();

  const refreshDistantIslandGeometry = (spec: DistantIslandSpec) => {
    const island = archipelago.getObjectByName(`tellus-distant-island-${spec.seed}`);
    const mesh = island?.getObjectByName(`tellus-distant-terrain-${spec.seed}`);
    if (!(mesh instanceof THREE.Mesh)) return;
    mesh.geometry.dispose();
    mesh.geometry = createDistantIslandTerrainGeometry(spec);
  };

  // Cheap per-island fingerprint so a remote terrain patch (which carries the FULL state every time) only
  // disposes+recreates a distant-island geometry that actually changed. Central sculpts never touch the
  // distant islands, so this skips the entire rebuild loop on the common case.
  const distantIslandSig = new Map<number, number>();
  const distantIslandSignature = (spec: DistantIslandSpec): number => {
    let h = 0;
    for (let i = 0; i < spec.sculptOffsets.length; i++) {
      h = (Math.imul(h, 31) + Math.round(spec.sculptOffsets[i] * 100)) | 0;
    }
    for (let i = 0; i < spec.paint.length; i++) {
      h = (Math.imul(h, 31) + spec.paint[i]) | 0;
    }
    return h;
  };

  const applyRemoteTerrainState = (terrainState: TellusTerrainState) => {
    if (!applyTellusTerrainState(terrainState)) return;
    setTerrainStateDirty(false);
    refreshTerrainGeometry();
    for (const spec of distantIslandSpecs) {
      const sig = distantIslandSignature(spec);
      if (distantIslandSig.get(spec.seed) === sig) continue;
      distantIslandSig.set(spec.seed, sig);
      refreshDistantIslandGeometry(spec);
    }
    updatePondSurfacePosition();
    visitorPosition = groundedPosition(visitorPosition.x, visitorPosition.z, visitorPosition);
    for (const thing of generated) {
      if (!isFreeMovingVehicle(thing) && !isIntentionallyOffsetFromGround(thing)) {
        thing.position = groundedPosition(thing.position.x, thing.position.z, thing.position);
        updateThingMeshPosition(thing);
      }
    }
    publish();
  };

  const removeRemoteVisitor = (remoteId: string) => {
    const mesh = remoteVisitorMeshes.get(remoteId);
    if (!mesh) {
      remoteVisitors.delete(remoteId);
      pendingPeerStreams.delete(remoteId);
      return;
    }
    // Detach + dispose the TV video (texture/<video>) BEFORE removing the avatar.
    setPeerVideo(remoteId, null);
    pendingPeerStreams.delete(remoteId);
    avatarRigs.get(remoteId)?.dispose();
    avatarRigs.delete(remoteId);
    appliedAvatarIds.delete(remoteId);
    avatarApplyTokens.delete(remoteId); // also invalidates any in-flight avatar load for them
    scene.remove(mesh);
    remoteVisitorMeshes.delete(remoteId);
    remoteVisitors.delete(remoteId);
  };

  const pruneStaleRemotePresence = (nowMs = Date.now()) => {
    let changed = false;
    for (const [remoteId, presence] of remoteVisitors) {
      if (isLivePresence(presence, nowMs)) continue;
      removeRemoteVisitor(remoteId);
      changed = true;
    }
    if (!changed) return;
    feedP2pPresence(Array.from(remoteVisitorMeshes.keys()));
    publish();
  };

  const applyRemotePresence = (presenceRaw: WorldPresence[]) => {
    // One logged-in account = one player: collapse a human's several live connections (stale tabs /
    // reconnects, each a distinct visitorId under the same ownerUserId) and drop my own other connections.
    // Anonymous sessions have no ownerUserId, so stale timestamp filtering is the safety net there.
    const presence = dedupePresenceForDisplay(
      presenceRaw,
      userId?.trim() || null,
      Date.now(),
      visitorId,
    );
    const activeRemoteIds = new Set<string>();
    for (const remote of presence) {
      if (remote.visitorId === visitorId || !remote.position) continue;
      activeRemoteIds.add(remote.visitorId);
      // avatarScale wire convention (mirrors avatarId/animation): present = explicit value,
      // ABSENT = a mid-rollout server stripped the field — keep the last-known value (a brand-new
      // visitor with no known value defaults to 1).
      const remoteScale =
        typeof remote.avatarScale === "number" && Number.isFinite(remote.avatarScale)
          ? clampAvatarScale(remote.avatarScale)
          : undefined;
      remoteVisitors.set(remote.visitorId, {
        ...remote,
        position: { ...remote.position },
        avatarScale: remoteScale ?? remoteVisitors.get(remote.visitorId)?.avatarScale,
      });
      let mesh = remoteVisitorMeshes.get(remote.visitorId);
      const remoteAvatarId = typeof remote.avatarId === "string" ? remote.avatarId : "";
      if (!mesh) {
        mesh = createRemoteVisitorMesh(useWebGPU);
        remoteVisitorMeshes.set(remote.visitorId, mesh);
        scene.add(mesh);
        // Async rigged upgrade per the visitor's broadcast avatar pick (agents — "agent:*"
        // visitorIds — ride this same path with the deterministic default). applyAvatarTo guards
        // against the visitor being pruned (or the world torn down) before the load resolved.
        applyAvatarTo(mesh, remote.visitorId, remoteAvatarId);
        // First sight of this visitor: snap straight to their size (no grow-in flicker).
        setAvatarUserScale(mesh, remoteScale ?? 1, true);
        // Drain any peer stream that surfaced before this avatar existed.
        if (pendingPeerStreams.has(remote.visitorId)) {
          const pending = pendingPeerStreams.get(remote.visitorId) ?? null;
          pendingPeerStreams.delete(remote.visitorId);
          setPeerVideo(remote.visitorId, pending);
        }
      } else {
        if (appliedAvatarIds.get(remote.visitorId) !== remoteAvatarId) {
          // The visitor changed avatars mid-session — rebuild their rig in place.
          applyAvatarTo(mesh, remote.visitorId, remoteAvatarId);
        }
        // Live size change: ease toward the new value (tickAvatarScale in animate()); absent
        // (mid-rollout strip) leaves the current target untouched.
        if (remoteScale !== undefined) setAvatarUserScale(mesh, remoteScale);
      }
      const position = groundedPosition(
        remote.position.x,
        remote.position.z,
        remote.position,
      );
      mesh.position.set(position.x, position.y, position.z);
      mesh.userData.lastSeenAt = remote.lastSeenAt;
      // Walk/idle/airborne for remotes is inferred from successive presence targets.
      avatarRigs
        .get(remote.visitorId)
        ?.notePresenceUpdate(position.x, position.y, position.z, performance.now());
    }
    for (const remoteId of remoteVisitorMeshes.keys()) {
      if (activeRemoteIds.has(remoteId)) continue;
      removeRemoteVisitor(remoteId);
    }
    // Feed the live roster to the mesh (drives connect/disconnect of PCs).
    feedP2pPresence(Array.from(activeRemoteIds));
    publish();
  };

  const clearVisitorSpawnPosition = (x: number, z: number): Vec3 => {
    const occupied = Array.from(remoteVisitors.values())
      .map((presence) => presence.position)
      .filter((position): position is Vec3 => Boolean(position));
    // Treat each portal as a no-spawn zone (radius + a margin) so arrivals don't land in a trigger
    // volume and immediately bounce back through it.
    const portalZones = worldPortals.map((p) => {
      const pos = portalAnchorPosition(p);
      return { pos, r: Math.max(1.2, p.radius) + 1.2 };
    });
    const isClear = (candidate: Vec3): boolean =>
      occupied.every((position) => distance2D(candidate, position) >= 2.4) &&
      portalZones.every((zone) => distance2D(candidate, zone.pos) >= zone.r);
    let best = groundedPosition(x, z, visitorPosition);
    if (isClear(best)) return best;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 24; i++) {
      const radius = 2.6 + Math.floor(i / 8) * 1.8;
      const angle = i * golden;
      const candidate = groundedPosition(
        x + Math.cos(angle) * radius,
        z + Math.sin(angle) * radius,
        visitorPosition,
      );
      if (isClear(candidate)) return candidate;
      if (
        occupied.reduce(
          (nearest, position) => Math.min(nearest, distance2D(candidate, position)),
          Number.POSITIVE_INFINITY,
        ) >
        occupied.reduce(
          (nearest, position) => Math.min(nearest, distance2D(best, position)),
          Number.POSITIVE_INFINITY,
        )
      ) {
        best = candidate;
      }
    }
    return best;
  };

  const sendPresenceUpdate = (force = false) => {
    if (!worldSocket || worldSocket.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    if (!force && now - lastPresenceSentAt < 300) return;
    lastPresenceSentAt = now;
    worldSocket.send(JSON.stringify({
      type: "presence.update",
      visitorId,
      position: visitorPosition,
      // Tiny + cheap: ride the avatar pick on EVERY presence update so late joiners and the
      // mid-rollout server (which may not persist it per-connection yet) always converge. "" = no
      // explicit pick (others use the deterministic per-visitor robot).
      avatarId: localAvatarId,
      // Avatar size rides the same way (server clamps to [0.1, 8]). Always the TARGET value, not
      // the lerped current — receivers ease toward it themselves.
      avatarScale: localAvatarScale,
    }));
  };

  const publishTerrainStateNow = () => {
    if (!tellusWorldBackendAvailable || worldSocket?.readyState !== WebSocket.OPEN) return;
    worldSocket.send(JSON.stringify({
      type: "terrain.replace",
      visitorId,
      terrain: tellusState(),
    }));
  };

  // Play a one-shot emote on the LOCAL avatar and best-effort broadcast it so nearby clients see it
  // too. Plays locally regardless of the socket (the "AI pilots its own body" guarantee); the
  // broadcast mirrors the inbound emote frame and is harmless if the server doesn't relay it.
  const playLocalEmote = (animation: string): boolean => {
    const name = animation.trim();
    if (!name) return false;
    avatarRigs.get(visitorId)?.playEmote(name);
    if (worldSocket?.readyState === WebSocket.OPEN) {
      worldSocket.send(JSON.stringify({ type: "emote", emote: { visitorId, animation: name } }));
    }
    return true;
  };

  const connectTellusWorldRealtime = () => {
    if (!tellusWorldBackendAvailable || worldSocket || destroyed) return;
    const socket = new WebSocket(tellusWorldWebSocketUrl(visitorId));
    worldSocket = socket;

    socket.addEventListener("message", (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data)) as unknown;
      } catch {
        return;
      }
      const terrainState = terrainFromWorldPatch(parsed);
      if (terrainState) {
        applyRemoteTerrainState(terrainState);
      }
      const presence = presenceFromWorldPatch(parsed);
      if (presence) {
        applyRemotePresence(presence);
      }
      const remoteThings = generatedFromWorldPatch(parsed);
      if (remoteThings) {
        applyRemoteGeneratedThings(remoteThings);
      }
      const chatMessages = worldChatFromWorldPatch(parsed);
      if (chatMessages) {
        mergeWorldChatMessages(chatMessages);
      }
      // TELLUS INFINITY portals: snapshot is authoritative (resets the set, even to empty, on a world switch);
      // portal.updated patches one; the world.portal.entered frame is React's signal to switch worlds.
      if ((parsed as { type?: string } | null)?.type === "world.snapshot") {
        const snapshotPortals = portalsFromWorldPatch(parsed);
        if (snapshotPortals) mergePortalSnapshot(snapshotPortals);
        // Phase 3: an interior snapshot carries a sceneUrl → render the GLB room instead of terrain.
        // A snapshot WITHOUT a sceneUrl while an interior is mounted means we left the room (switched
        // back to an outdoor world in the same scene) — tear the room + its physics statics down.
        const sceneUrl = (parsed as { sceneUrl?: unknown }).sceneUrl;
        if (typeof sceneUrl === "string" && sceneUrl) {
          profileInteriorSceneUrl = sceneUrl;
          applyInterior(sceneUrl);
        } else if (
          interiorObject &&
          !runtimeConfig.worldId.startsWith("interior-") &&
          !profileInteriorSceneUrl
        ) {
          exitInterior();
        }
        // Phase 4: a tiles world carries a tileSetUrl → mount the 3D tileset as the render substrate.
        const tileUrl = (parsed as { tileSetUrl?: unknown }).tileSetUrl;
        if (typeof tileUrl === "string" && tileUrl) mountTileset(tileUrl);
        // Biomes: the snapshot carries the FULL biome set (seed/converged). Reset the local grid from it
        // (authoritative — clears stale biomes on a world switch) so the map/HUD show biomes immediately
        // instead of waiting up to 10 min for the next diff tick. Live world.biome.patch then merges deltas.
        worldBiomeCells.clear();
        const snapshotBiomes = biomeCellsFromSnapshot(parsed);
        if (snapshotBiomes) for (const c of snapshotBiomes) worldBiomeCells.set(`${c.cx}:${c.cz}`, c);
        syncPortalMarkers();
        publish();
      } else {
        const portalUpsert = portalsFromWorldPatch(parsed);
        if (portalUpsert) {
          const byId = new Map(worldPortals.map((p) => [p.id, p]));
          for (const p of portalUpsert) {
            markPortalReady(p);
            byId.set(p.id, p);
          }
          worldPortals = Array.from(byId.values());
          syncPortalMarkers();
          publish();
        }
      }
      const portalDeleted = portalDeletedFromWorldPatch(parsed);
      if (portalDeleted) {
        pendingPortalIds.delete(portalDeleted);
        pendingPortalStartedAt.delete(portalDeleted);
        pendingPortalWarnedIds.delete(portalDeleted);
        pendingDeletedPortals.delete(portalDeleted);
        worldPortals = worldPortals.filter((p) => p.id !== portalDeleted);
        syncPortalMarkers();
        publish();
      }
      if (
        isRecord(parsed) &&
        parsed.type === "action.rejected" &&
        typeof parsed.actionType === "string" &&
        typeof parsed.reason === "string"
      ) {
        if (parsed.actionType === "world.portal.upsert" || parsed.actionType === "portal.upsert") {
          const rejectedPendingIds = new Set(pendingPortalIds);
          pendingPortalIds.clear();
          pendingPortalStartedAt.clear();
          pendingPortalWarnedIds.clear();
          worldPortals = worldPortals.filter((p) => !rejectedPendingIds.has(p.id));
          syncPortalMarkers();
        }
        if (parsed.actionType === "world.portal.delete" || parsed.actionType === "portal.delete") {
          for (const portal of pendingDeletedPortals.values()) {
            const byId = new Map(worldPortals.map((p) => [p.id, p]));
            byId.set(portal.id, portal);
            worldPortals = Array.from(byId.values());
          }
          pendingDeletedPortals.clear();
          syncPortalMarkers();
        }
        const isPortalAction = /portal/i.test(parsed.actionType);
        addLog({
          agentId: "world",
          agentName: "Tellus",
          tool: "interact",
          text: isPortalAction
            ? portalRejectionMessage(parsed.reason)
            : `${parsed.actionType} rejected: ${parsed.reason}`,
        });
        publish();
      }
      const entered = portalEnteredFromWorldPatch(parsed);
      if (entered) {
        pendingPortalSwitch = entered;
        addLog({ agentId: "world", agentName: "Tellus", tool: "interact", text: `Entering portal → ${entered.toWorldId}` });
        publish();
      }
      // TELLUS INFINITY biomes: diff-merge the changed cells into the local grid (a seed sends the full set).
      const biomeCells = biomeCellsFromWorldPatch(parsed);
      if (biomeCells) {
        for (const c of biomeCells) worldBiomeCells.set(`${c.cx}:${c.cz}`, c);
        publish();
      }
      // Emote frames: play that clip ONCE over the avatar's locomotion, then resume. Rigless
      // avatars (classic TV-heads, not-yet-loaded rigs) and unknown clips are simply ignored.
      const emote = emoteFromWorldPatch(parsed);
      if (emote) {
        avatarRigs.get(emote.visitorId)?.playEmote(emote.animation);
      }
      const chunkUpdate = chunkUpdatedFromWorldPatch(parsed);
      if (chunkUpdate && chunkRenderer) {
        chunkRenderer.reloadChunk(chunkUpdate.chunkX, chunkUpdate.chunkZ);
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        (parsed as Partial<WorldPatch>).type === "generated.deleted" &&
        typeof (parsed as { id?: unknown }).id === "string"
      ) {
        applyRemoteGeneratedDelete((parsed as { id: string }).id);
      }
      // WebRTC signaling relay (ephemeral, Seq=0). The grain stamps `from`; the gateway already
      // filtered to us. Hand to the mesh, which owns all PC/negotiation state.
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        (parsed as { type?: unknown }).type === "signal"
      ) {
        const sig = (parsed as { signal?: unknown }).signal;
        if (sig && typeof sig === "object") {
          const s = sig as {
            from?: unknown;
            kind?: unknown;
            payload?: unknown;
          };
          if (
            typeof s.from === "string" &&
            s.from !== visitorId &&
            typeof s.kind === "string"
          ) {
            p2pLog("recv", s.kind, "from", s.from, p2pMesh ? "" : "(mesh null!)");
            p2pMesh?.handleSignal(
              s.from,
              s.kind,
              typeof s.payload === "string" ? s.payload : "",
            );
          }
        }
      }
    });

    socket.addEventListener("open", () => {
      sendPresenceUpdate(true);
    });

    socket.addEventListener("close", () => {
      if (worldSocket === socket) worldSocket = null;
      if (worldSocketClosedByDestroy || destroyed || !tellusWorldBackendAvailable) return;
      worldSocketReconnectTimer = window.setTimeout(() => {
        worldSocketReconnectTimer = undefined;
        connectTellusWorldRealtime();
      }, 2500);
    });

    socket.addEventListener("error", () => {
      socket.close();
    });
  };

  const paintAirbrushKeepsCell = (
    xIndex: number,
    zIndex: number,
    falloff: number,
    paintCode: number,
    center: Vec3,
  ): boolean => {
    if (falloff >= 0.58) return true;
    if (falloff <= 0.06) return false;
    const seed =
      Math.sin(
        xIndex * 12.9898 +
          zIndex * 78.233 +
          paintCode * 37.719 +
          Math.round(center.x * 2) * 0.217 +
          Math.round(center.z * 2) * 0.311,
      ) * 43758.5453;
    const noise = seed - Math.floor(seed);
    return noise < falloff * 0.92;
  };

  const sculptTerrainAt = (
    mode: TerrainEditMode,
    center: Vec3,
    actorId: AgentId | "visitor",
    actorName: string,
  ) => {
    const paintCode = isTerrainPaintMode(mode) ? terrainPaintCode(mode) : 0;
    const distantIsland =
      Math.hypot(center.x, center.z) > WORLD_RADIUS - 2
        ? nearestDistantIsland(center.x, center.z, 1.04)
        : undefined;

    if (distantIsland) {
      const targetHeight = distantIslandHeight(distantIsland, center.x, center.z);
      for (let zIndex = 0; zIndex <= DISTANT_TERRAIN_SEGMENTS; zIndex++) {
        for (let xIndex = 0; xIndex <= DISTANT_TERRAIN_SEGMENTS; xIndex++) {
          const point = distantIslandGridWorldPoint(distantIsland, xIndex, zIndex);
          if (point.localRadius > 1) continue;
          const distance = Math.hypot(point.x - center.x, point.z - center.z);
          const brushRadius = paintCode ? TERRAIN_SCULPT_RADIUS * 0.68 : TERRAIN_SCULPT_RADIUS;
          if (distance > brushRadius) continue;
          const falloff =
            (1 + Math.cos((distance / brushRadius) * Math.PI)) * 0.5;
          const index = distantTerrainGridIndex(xIndex, zIndex);
          if (paintCode) {
            if (paintAirbrushKeepsCell(xIndex, zIndex, falloff, paintCode, center)) {
              distantIsland.paint[index] = paintCode;
            }
          } else if (mode === "flatten") {
            const currentHeight =
              SEA_LEVEL +
              0.28 +
              Math.pow(1 - clamp(point.localRadius, 0, 1), 1.75) *
                distantIsland.height *
                0.72 +
              distantIsland.sculptOffsets[index];
            distantIsland.sculptOffsets[index] +=
              (targetHeight - currentHeight) * falloff * 0.62;
          } else {
            const direction = mode === "raise" ? 1 : -1;
            distantIsland.sculptOffsets[index] +=
              direction * TERRAIN_SCULPT_STEP * falloff;
          }
          distantIsland.sculptOffsets[index] = clamp(
            distantIsland.sculptOffsets[index],
            -9,
            9,
          );
        }
      }
      refreshDistantIslandGeometry(distantIsland);
    } else {
      const targetHeight = terrainHeight(center.x, center.z);
      // The central brush radius scales with the world so it covers the same grid cells as the
      // legacy brush — keeps the math identical to the server's compatibility sculpt port.
      const brushRadius = TERRAIN_SCULPT_RADIUS * WORLD_SCALE * (paintCode ? 0.68 : 1);
      for (let zIndex = 0; zIndex <= TERRAIN_SEGMENTS; zIndex++) {
        const z = (zIndex / TERRAIN_SEGMENTS - 0.5) * WORLD_RADIUS * 2;
        for (let xIndex = 0; xIndex <= TERRAIN_SEGMENTS; xIndex++) {
          const x = (xIndex / TERRAIN_SEGMENTS - 0.5) * WORLD_RADIUS * 2;
          if (Math.hypot(x, z) > WORLD_RADIUS) continue;
          const distance = Math.hypot(x - center.x, z - center.z);
          if (distance > brushRadius) continue;
          const falloff =
            (1 + Math.cos((distance / brushRadius) * Math.PI)) * 0.5;
          const index = terrainGridIndex(xIndex, zIndex);
          if (paintCode) {
            if (paintAirbrushKeepsCell(xIndex, zIndex, falloff, paintCode, center)) {
              terrainPaint[index] = paintCode;
            }
          } else if (mode === "flatten") {
            const currentHeight = baseTerrainHeight(x, z) + terrainSculptOffsets[index];
            terrainSculptOffsets[index] +=
              (targetHeight - currentHeight) * falloff * 0.62;
          } else {
            const direction = mode === "raise" ? 1 : -1;
            terrainSculptOffsets[index] +=
              direction * TERRAIN_SCULPT_STEP * falloff;
          }
          terrainSculptOffsets[index] = clamp(terrainSculptOffsets[index], -9, 9);
        }
      }
      if (paintCode) {
        // Paint only recolors vertices — height/normals are unchanged, so do the cheap localized
        // recolor over the brush AABB instead of a full-mesh rebuild + computeVertexNormals.
        refreshTerrainPaintRegion(
          center.x - brushRadius,
          center.z - brushRadius,
          center.x + brushRadius,
          center.z + brushRadius,
        );
      } else {
        refreshTerrainGeometry();
      }
      updatePondSurfacePosition();
    }

    if (!paintCode) {
      visitorPosition = groundedPosition(visitorPosition.x, visitorPosition.z, visitorPosition);
      for (const thing of generated) {
        if (!isFreeMovingVehicle(thing) && !isIntentionallyOffsetFromGround(thing)) {
          groundThingToRenderedSurface(thing);
          updateThingMeshPosition(thing);
        }
      }
    }
    addLog({
      agentId: actorId,
      agentName: actorName,
      tool: "interact",
      text: distantIsland
        ? `${paintCode ? `paint ${mode}` : mode} terrain on distant island ${distantIsland.seed}`
        : `${paintCode ? `paint ${mode}` : mode} terrain near ${actorName}`,
    });
    saveTellusStateSoon();
    publishTerrainStateNow();
    publish();
  };

  // Chunked worlds hold NO inline terrain grid — terrain lives in per-chunk grains. So a sculpt must go to
  // the SERVER as a terrain.sculpt action (world grain → owning chunk grain(s) → chunk.updated patch →
  // chunkRenderer.reloadChunk), not edit the compatibility 97² grid.
  const sendChunkedSculpt = (mode: TerrainEditMode, center: Vec3) => {
    if (!tellusWorldBackendAvailable) return;
    const action = {
      type: "terrain.sculpt",
      visitorId,
      mode,
      center: { x: center.x, y: 0, z: center.z },
    };
    if (worldSocket?.readyState === WebSocket.OPEN) {
      worldSocket.send(JSON.stringify(action));
    } else {
      void fetch(tellusWorldHttpUrl("action"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      }).catch((error) => console.warn("Tellus chunked sculpt failed", error));
    }
    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "interact",
      text: `${isTerrainPaintMode(mode) ? `paint ${mode}` : mode} terrain (chunked)`,
    });
  };

  const sculptTerrain = (mode: TerrainEditMode) => {
    if (isChunked) {
      sendChunkedSculpt(mode, visitorPosition);
      return;
    }
    sculptTerrainAt(mode, visitorPosition, "visitor", "Visitor");
  };

  // The browser-NPC "pause AI" gate is gone; visitor-driven generation is never paused.
  const generationPausedForThing = (_thing: GeneratedThing) => false;

  const abortPendingGeneration = (
    shouldAbort: (thing: GeneratedThing) => boolean = () => true,
  ) => {
    for (const [id, controller] of pendingGenerationControllers) {
      const thing = thingById(id);
      if (!thing || shouldAbort(thing)) {
        controller.abort();
        pendingGenerationControllers.delete(id);
      }
    }
  };

  const thingById = (id: string): GeneratedThing | undefined =>
    generated.find((thing) => thing.id === id);

  // ── Static-duplicate GPU instancing ──────────────────────────────────────────────────────────────────
  // All of this is a no-op unless runtimeConfig.instanceStaticDuplicates is on. Correctness rule (per design):
  // we NEVER hand-derive instance matrices — we reuse the regular mesh's already-correct matrixWorld and copy
  // sub-mesh worldMatrices into instance slots, then hide the regular mesh.
  const INSTANCE_ZERO_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);
  const instancingEnabled = () => runtimeConfig.instanceStaticDuplicates;

  // A thing is animated (→ never instanced) if it has a live mixer, or its mounted mesh carries a non-empty
  // userData.animations array.
  const isThingAnimated = (thing: GeneratedThing): boolean => {
    if (generatedAnimationMixers.has(thing.id) || generatedVrmRigs.has(thing.id)) return true;
    const mesh = generatedMeshes.get(thing.id);
    if (mesh?.userData.vrmObjectRig) return true; // VRM thing → never instanced (skinned + per-frame)
    const anims = mesh?.userData.animations;
    return Array.isArray(anims) && anims.length > 0;
  };

  // A thing is a *candidate* for folding if its loaded static GLB is mounted (sharedGltf + matching
  // loadedModelUrl) and it isn't animated. Selection/duplicate-count gating is applied separately.
  const isInstanceCandidate = (thing: GeneratedThing): boolean => {
    if (thing.id === sailingThingId) return false;
    if (thing.petOwnerId) return false;
    if (!thing.modelUrl || thing.generationStatus !== "ready") return false;
    const mesh = generatedMeshes.get(thing.id);
    if (!mesh) return false;
    if (mesh.userData.loadedModelUrl !== thing.modelUrl) return false;
    if (!mesh.userData.sharedGltf) return false;
    if (mesh.userData.generatingSwirl) return false;
    if (isThingAnimated(thing)) return false;
    return true;
  };

  // Enumerate the sub-meshes of a mounted mesh in deterministic traversal order.
  const collectSubMeshes = (root: THREE.Object3D): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh)) {
        meshes.push(child);
      }
    });
    return meshes;
  };

  // Revert a whole group to plain regular meshes and forget the pool (used on any error or teardown).
  const disableInstancePool = (modelUrl: string, reason?: unknown) => {
    const pool = instancePools.get(modelUrl);
    if (!pool) return;
    pool.disabled = true;
    try {
      for (const inst of pool.instanced) {
        scene.remove(inst);
        inst.dispose();
      }
    } catch {
      // best-effort dispose; nothing else to do
    }
    for (const thingId of pool.thingToSlot.keys()) {
      const mesh = generatedMeshes.get(thingId);
      if (mesh) mesh.visible = true;
    }
    instancePools.delete(modelUrl);
    if (reason !== undefined) {
      // An actual error (not a benign drop-below-2 teardown) → never re-attempt this URL for the session.
      instancingDisabledUrls.add(modelUrl);
      console.warn(`[instancing] disabled for modelUrl=${modelUrl}`, reason);
    }
  };

  // Create the per-sub-mesh InstancedMeshes for a group, sized to `capacity`, from a template mounted mesh.
  const buildInstancePool = (
    modelUrl: string,
    templateMesh: THREE.Object3D,
    capacity: number,
  ): InstancePool | null => {
    // Build into a local array first; only attach to the scene once the full set constructs without throwing,
    // so a mid-build failure leaves nothing orphaned in the scene.
    const instanced: THREE.InstancedMesh[] = [];
    try {
      const subMeshes = collectSubMeshes(templateMesh);
      if (subMeshes.length === 0) return null;
      for (const sub of subMeshes) {
        const inst = new THREE.InstancedMesh(sub.geometry, sub.material, capacity);
        inst.frustumCulled = false;
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        inst.userData.tellusInstancePool = modelUrl;
        // Hide all slots until they're filled (avoids stray identity-matrix copies at the origin).
        for (let i = 0; i < capacity; i += 1) {
          inst.setMatrixAt(i, INSTANCE_ZERO_MATRIX);
        }
        inst.instanceMatrix.needsUpdate = true;
        inst.count = capacity;
        instanced.push(inst);
      }
      for (const inst of instanced) scene.add(inst);
      const pool: InstancePool = {
        modelUrl,
        instanced,
        subMeshCount: instanced.length,
        capacity,
        freeSlots: [],
        nextSlot: 0,
        slotToThing: new Map(),
        thingToSlot: new Map(),
        disabled: false,
      };
      instancePools.set(modelUrl, pool);
      return pool;
    } catch (error) {
      for (const inst of instanced) {
        scene.remove(inst);
        inst.dispose();
      }
      console.warn(`[instancing] failed to build pool for ${modelUrl}`, error);
      return null;
    }
  };

  // Grow a pool to ×2 capacity, recreating the InstancedMeshes and re-copying existing matrices.
  const growInstancePool = (pool: InstancePool): boolean => {
    const newInstanced: THREE.InstancedMesh[] = [];
    try {
      const newCapacity = Math.max(pool.capacity * 2, pool.capacity + 1);
      const oldInstanced = pool.instanced;
      const tmp = new THREE.Matrix4();
      for (const old of oldInstanced) {
        const inst = new THREE.InstancedMesh(old.geometry, old.material, newCapacity);
        inst.frustumCulled = false;
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        inst.userData.tellusInstancePool = pool.modelUrl;
        for (let i = 0; i < newCapacity; i += 1) {
          if (i < pool.capacity) {
            old.getMatrixAt(i, tmp);
            inst.setMatrixAt(i, tmp);
          } else {
            inst.setMatrixAt(i, INSTANCE_ZERO_MATRIX);
          }
        }
        inst.instanceMatrix.needsUpdate = true;
        inst.count = newCapacity;
        newInstanced.push(inst);
      }
      for (const inst of newInstanced) scene.add(inst);
      for (const old of oldInstanced) {
        scene.remove(old);
        old.dispose();
      }
      pool.instanced = newInstanced;
      pool.capacity = newCapacity;
      return true;
    } catch (error) {
      for (const inst of newInstanced) {
        scene.remove(inst);
        inst.dispose();
      }
      disableInstancePool(pool.modelUrl, error);
      return false;
    }
  };

  // Allocate a free slot, growing if needed.
  const allocateSlot = (pool: InstancePool): number | null => {
    const recycled = pool.freeSlots.pop();
    if (recycled !== undefined) return recycled;
    if (pool.nextSlot < pool.capacity) {
      const slot = pool.nextSlot;
      pool.nextSlot += 1;
      return slot;
    }
    if (!growInstancePool(pool)) return null;
    const slot = pool.nextSlot;
    pool.nextSlot += 1;
    return slot;
  };

  // Fold one thing into its group's pool at a free slot. Returns true on success.
  const instanceThing = (pool: InstancePool, thing: GeneratedThing): boolean => {
    if (pool.disabled) return false;
    if (pool.thingToSlot.has(thing.id)) return true; // already instanced
    const mesh = generatedMeshes.get(thing.id);
    if (!mesh) return false;
    try {
      mesh.updateWorldMatrix(true, true);
      const subMeshes = collectSubMeshes(mesh);
      // Sub-mesh count/order must line up with the pool template (shared GLB → should always hold). If not,
      // bail this thing back to a regular visible mesh — do NOT corrupt the pool.
      if (subMeshes.length !== pool.subMeshCount) {
        console.warn(
          `[instancing] sub-mesh mismatch for thing ${thing.id} (${subMeshes.length} vs ${pool.subMeshCount}); keeping regular mesh`,
        );
        mesh.visible = true;
        return false;
      }
      const slot = allocateSlot(pool);
      if (slot === null) return false;
      for (let j = 0; j < pool.subMeshCount; j += 1) {
        pool.instanced[j].setMatrixAt(slot, subMeshes[j].matrixWorld);
        pool.instanced[j].instanceMatrix.needsUpdate = true;
      }
      pool.slotToThing.set(slot, thing.id);
      pool.thingToSlot.set(thing.id, slot);
      mesh.visible = false;
      return true;
    } catch (error) {
      disableInstancePool(pool.modelUrl, error);
      return false;
    }
  };

  // Pop one thing OUT of instancing: zero its slot for every sub-mesh, free the slot, show the regular mesh.
  const uninstanceThing = (thingId: string) => {
    const mesh = generatedMeshes.get(thingId);
    for (const pool of instancePools.values()) {
      const slot = pool.thingToSlot.get(thingId);
      if (slot === undefined) continue;
      try {
        for (let j = 0; j < pool.subMeshCount; j += 1) {
          pool.instanced[j].setMatrixAt(slot, INSTANCE_ZERO_MATRIX);
          pool.instanced[j].instanceMatrix.needsUpdate = true;
        }
        pool.thingToSlot.delete(thingId);
        pool.slotToThing.delete(slot);
        pool.freeSlots.push(slot);
      } catch (error) {
        disableInstancePool(pool.modelUrl, error);
      }
    }
    if (mesh) mesh.visible = true;
  };

  // Resolve an InstancedMesh raycast hit (pool + instanceId) back to a thing id.
  const resolveInstancedHit = (
    instanced: THREE.InstancedMesh,
    instanceId: number,
  ): string | undefined => {
    const modelUrl = instanced.userData.tellusInstancePool;
    if (typeof modelUrl !== "string") return undefined;
    const pool = instancePools.get(modelUrl);
    return pool?.slotToThing.get(instanceId);
  };

  // Re-decide folding for every ready static placement that shares `modelUrl`. Folds in when ≥2 qualify and
  // the thing isn't selected; pops out the selected one and (when <2 qualify) the lone remaining one.
  const reevaluateInstanceGroup = (modelUrl: string | undefined) => {
    if (!modelUrl) return;
    if (instancingDisabledUrls.has(modelUrl)) return; // errored earlier this session → stay regular
    if (!instancingEnabled()) {
      // Flag off: ensure nothing stays folded (covers a runtime flip to off).
      const pool = instancePools.get(modelUrl);
      if (pool) disableInstancePool(modelUrl);
      return;
    }
    try {
      const existingPool = instancePools.get(modelUrl);
      if (existingPool?.disabled) return;
      // Candidates: ready, static, mounted GLB, sharing this modelUrl.
      const candidates = generated.filter(
        (t) => t.modelUrl === modelUrl && isInstanceCandidate(t),
      );
      // Foldable = candidate AND not currently selected/ridden. A ridden thing
      // must stay as its own mesh so rider positioning and movement can update it directly.
      const foldable = candidates.filter(
        (t) => t.id !== selectedThingId && t.id !== sailingThingId,
      );

      if (foldable.length < 2) {
        // Below threshold → pop everyone in this group back out (regular meshes), drop the pool.
        const pool = instancePools.get(modelUrl);
        if (pool) {
          for (const thingId of [...pool.thingToSlot.keys()]) {
            uninstanceThing(thingId);
          }
          disableInstancePool(modelUrl);
        }
        return;
      }

      // ≥2 foldable → ensure a pool exists, then sync membership.
      let pool = instancePools.get(modelUrl);
      if (!pool) {
        const template = generatedMeshes.get(foldable[0].id);
        if (!template) return;
        const created = buildInstancePool(
          modelUrl,
          template,
          Math.max(4, foldable.length * 2),
        );
        if (!created) {
          // Build failed → make sure all regular meshes are visible.
          for (const t of candidates) {
            const m = generatedMeshes.get(t.id);
            if (m) m.visible = true;
          }
          return;
        }
        pool = created;
      }

      const foldableIds = new Set(foldable.map((t) => t.id));
      // Pop out anything currently instanced that's no longer foldable (e.g. just selected).
      for (const thingId of [...pool.thingToSlot.keys()]) {
        if (!foldableIds.has(thingId)) uninstanceThing(thingId);
      }
      // Fold in anything foldable that isn't yet instanced.
      for (const t of foldable) {
        if (!pool.thingToSlot.has(t.id)) instanceThing(pool, t);
      }
    } catch (error) {
      disableInstancePool(modelUrl, error);
    }
  };

  // Re-fold the previously-selected thing's group and the newly-selected thing's group around a selection
  // change (the selected thing must always be a regular mesh so TransformControls can attach + move it).
  const reevaluateInstancingForSelection = (
    previousSelectedId: string | undefined,
    nextSelectedId: string | undefined,
  ) => {
    if (!instancingEnabled()) return;
    const urls = new Set<string>();
    const prev = previousSelectedId ? thingById(previousSelectedId) : undefined;
    const next = nextSelectedId ? thingById(nextSelectedId) : undefined;
    const ridden = sailingThingId ? thingById(sailingThingId) : undefined;
    if (prev?.modelUrl) urls.add(prev.modelUrl);
    if (next?.modelUrl) urls.add(next.modelUrl);
    if (ridden?.modelUrl) urls.add(ridden.modelUrl);
    // A selected/ridden thing is never instanced; pop it out first so its regular mesh is live before any re-fold.
    if (nextSelectedId) uninstanceThing(nextSelectedId);
    if (sailingThingId) uninstanceThing(sailingThingId);
    for (const url of urls) reevaluateInstanceGroup(url);
  };

  const stopGeneratedAnimation = (id: string) => {
    const rig = generatedVrmRigs.get(id);
    if (rig) {
      // VRM rigs own their mixer + VRM scene disposal; do that via disposeObject when the mesh is
      // removed. Here we only forget the rig so it stops advancing.
      generatedVrmRigs.delete(id);
    }
    const mixer = generatedAnimationMixers.get(id);
    if (!mixer) return;
    mixer.mixer.stopAllAction();
    generatedAnimationMixers.delete(id);
  };

  const generatedModelClips = (model: THREE.Object3D | undefined): THREE.AnimationClip[] => {
    const animations = model?.userData.animations;
    if (!Array.isArray(animations)) return [];
    return animations.filter(
      (clip): clip is THREE.AnimationClip => clip instanceof THREE.AnimationClip,
    );
  };

  // The clip names the Animation HUD lists for a thing: a VRM thing exposes the VRMA catalog clips;
  // a plain GLB thing exposes its embedded clip names.
  const generatedClipNamesForThing = (id: string): string[] => {
    const mesh = generatedMeshes.get(id);
    if (mesh?.userData.vrmObjectRig) {
      return (mesh.userData.vrmObjectRig as VrmObjectRig).clipNames();
    }
    return generatedModelClips(mesh).map((clip) => clip.name);
  };

  const generatedClipNameIncludes = (clip: THREE.AnimationClip, fragments: string[]) => {
    const name = (clip.name ?? "").toLowerCase();
    return fragments.some((fragment) => name.includes(fragment));
  };

  const badGeneratedClip = (clip: THREE.AnimationClip) =>
    generatedClipNameIncludes(clip, [
      "rest",
      "t-pose",
      "tpose",
      "death",
      "die",
      "attack",
      "bite",
      "kick",
      "hitreact",
    ]);

  const selectGeneratedClip = (
    clips: THREE.AnimationClip[],
    thing: GeneratedThing | undefined,
    mode: GeneratedMotionMode,
    vehicle: VehicleMode | null = null,
    options: { ignoreExplicit?: boolean } = {},
  ): THREE.AnimationClip | undefined => {
    if (clips.length === 0) return undefined;
    const wanted = options.ignoreExplicit ? "" : thing?.animation?.trim();
    const wantedClip = wanted
      ? clips.find((c) => c.name === wanted) ??
        clips.find((c) => c.name?.toLowerCase() === wanted.toLowerCase())
      : undefined;
    if (wantedClip) return wantedClip;
    const findAny = (fragments: string[]) =>
      clips.find((clip) => generatedClipNameIncludes(clip, fragments) && !badGeneratedClip(clip));
    if (mode === "walk" || mode === "run") {
      if (vehicle === "air") {
        const fly = findAny(["fly", "flying", "glide", "hover"]);
        if (fly) return fly;
      }
      if (vehicle === "water") {
        const swim = findAny(["swim", "swimming", "paddle", "float"]);
        if (swim) return swim;
      }
      if (mode === "walk") {
        return (
          findAny(["walk", "trot"]) ??
          findAny(["run", "gallop", "canter"]) ??
          findAny(["fly", "glide", "swim"]) ??
          findAny(["idle"])
        );
      }
      return (
        findAny(["run", "gallop", "canter"]) ??
        findAny(["walk", "trot"]) ??
        findAny(["fly", "glide", "swim"]) ??
        findAny(["idle"])
      );
    }
    return findAny(["idle"]) ?? findAny(["stand"]) ?? findAny(["walk"]) ?? clips.find((c) => !badGeneratedClip(c)) ?? clips[0];
  };

  const playGeneratedClip = (
    id: string,
    model: THREE.Object3D,
    mode: GeneratedMotionMode,
    vehicle: VehicleMode | null = null,
    options: { ignoreExplicit?: boolean } = {},
  ) => {
    const clips = generatedModelClips(model);
    const clip = selectGeneratedClip(clips, thingById(id), mode, vehicle, options);
    if (!clip) return;
    let state = generatedAnimationMixers.get(id);
    if (!state) {
      state = { mixer: new THREE.AnimationMixer(model), mode };
      generatedAnimationMixers.set(id, state);
    }
    if (state.clipName === clip.name && state.mode === mode && state.action) return;
    const next = state.mixer.clipAction(clip);
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(mode === "run" ? 1.15 : 1);
    if (state.action && state.action !== next) {
      next.play();
      state.action.crossFadeTo(next, 0.18, false);
    } else {
      next.play();
    }
    state.action = next;
    state.clipName = clip.name;
    state.mode = mode;
  };

  const updateMountedAnimation = (thing: GeneratedThing, moving: boolean, running = false) => {
    if (!isMountThing(thing)) return;
    const mode: GeneratedMotionMode = moving ? (running ? "run" : "walk") : "idle";
    if (mountedAnimationThingId === thing.id && mountedAnimationMode === mode) return;
    const model = generatedMeshes.get(thing.id);
    if (!model || model.userData.loadedModelUrl !== thing.modelUrl) return;
    playGeneratedClip(thing.id, model, mode, vehicleMode(thing), { ignoreExplicit: true });
    mountedAnimationThingId = thing.id;
    mountedAnimationMode = mode;
  };

  const startGeneratedAnimation = (id: string, model: THREE.Object3D) => {
    stopGeneratedAnimation(id);
    if (mountedAnimationThingId === id) {
      mountedAnimationMode = undefined;
    }
    // VRM things animate through their VRM rig (retargeted VRMA clips), not an embedded-clip mixer.
    const vrmRig = model.userData.vrmObjectRig as VrmObjectRig | undefined;
    if (vrmRig) {
      if (!vrmRig.hasClips()) return;
      vrmRig.play(thingById(id)?.animation?.trim() || undefined, 0);
      generatedVrmRigs.set(id, vrmRig);
      return;
    }
    const clips = generatedModelClips(model);
    if (clips.length === 0) return;
    // Play ONE clip. Multi-clip rigs (store animals ship Bark/Bite/Death/Idle/Jump/…) used to play
    // EVERYTHING at once — every clip fighting over the same bones each frame, which rendered as
    // glitchy "blinking". An explicit per-thing pick (`thing.animation`, synced over
    // generated.upsert) wins; otherwise prefer an idle/walk loop; avoid one-shot/pose clips.
    // Missing/renamed picks fall back to the heuristic rather than freezing the model.
    const thing = thingById(id);
    playGeneratedClip(id, model, "idle", thing ? vehicleMode(thing) : null);
  };

  // If a thing is currently folded into a pool (a non-selected instanced thing moved — rare), re-copy its
  // mesh's sub-mesh worldMatrices into its instance slot so the GPU copy tracks the new transform.
  const refreshInstancedThingMatrix = (thing: GeneratedThing) => {
    for (const pool of instancePools.values()) {
      const slot = pool.thingToSlot.get(thing.id);
      if (slot === undefined) continue;
      const mesh = generatedMeshes.get(thing.id);
      if (!mesh) return;
      try {
        mesh.updateWorldMatrix(true, true);
        const subMeshes = collectSubMeshes(mesh);
        if (subMeshes.length !== pool.subMeshCount) {
          uninstanceThing(thing.id); // shape changed under us → bail to a regular visible mesh
          return;
        }
        for (let j = 0; j < pool.subMeshCount; j += 1) {
          pool.instanced[j].setMatrixAt(slot, subMeshes[j].matrixWorld);
          pool.instanced[j].instanceMatrix.needsUpdate = true;
        }
      } catch (error) {
        disableInstancePool(pool.modelUrl, error);
      }
      return;
    }
  };

  const terrainRaycaster = new THREE.Raycaster();
  const terrainRayOrigin = new THREE.Vector3();
  const terrainRayDirection = new THREE.Vector3(0, -1, 0);
  const terrainRayTargets: THREE.Object3D[] = [];
  const footprintCache = new Map<string, { radius: number; height: number }>();

  const thingFootprint = (thing: GeneratedThing): { radius: number; height: number } | null => {
    const mesh = generatedMeshes.get(thing.id);
    if (!mesh) return null;
    const key = `${thing.id}:${thing.scale.toFixed(2)}`;
    const cached = footprintCache.get(key);
    if (cached) return cached;
    const box = measureModelBounds(mesh); // skinning-aware: bind-pose boxes of animated models are bogus
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const fp = { radius: Math.max(size.x, size.z) / 2, height: size.y };
    footprintCache.set(key, fp);
    if (footprintCache.size > 600) footprintCache.clear();
    return fp;
  };

  const renderedTerrainHeightAt = (x: number, z: number): number | null => {
    terrainRayTargets.length = 0;
    if (terrain.visible) terrainRayTargets.push(terrain);
    const chunkTerrain = scene.getObjectByName("tellus-chunk-terrain");
    if (chunkTerrain) terrainRayTargets.push(chunkTerrain);
    // In an interior the real floor is the room's solid meshes — add them as ray targets so furniture
    // rests on the actual floor/mezzanine surface (footprintGroundY) instead of the y=0 flat base.
    if (interiorObject) terrainRayTargets.push(interiorObject);
    if (terrainRayTargets.length === 0) return null;
    terrainRayOrigin.set(x, 480, z);
    terrainRaycaster.set(terrainRayOrigin, terrainRayDirection);
    terrainRaycaster.far = 780;
    if (!interiorObject) {
      // Outdoor fast path: nearest (highest) hit is the surface.
      const hit = terrainRaycaster.intersectObjects(terrainRayTargets, true)[0];
      return hit ? hit.point.y : null;
    }
    // Interior: a top-down ray hits the CEILING before the floor, so take the highest UP-FACING
    // surface (face normal world-Y > 0) — a floor/mezzanine/stair tread, never a ceiling underside.
    const hits = terrainRaycaster.intersectObjects(terrainRayTargets, true);
    for (const h of hits) {
      const n = h.face?.normal;
      if (!n) return h.point.y; // terrain hit (no per-face cull needed) — first is highest
      // Transform the face normal into world space to test its vertical component.
      const worldN = n.clone().applyNormalMatrix(
        new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld),
      );
      if (worldN.y > 0.3) return h.point.y;
    }
    return null;
  };

  // Highest terrain height under a thing's footprint. With the wider terrain height variability,
  // grounding to the single CENTRE sample can leave a multi-tile object partly buried under higher
  // neighbouring terrain ("under the land even after the surface button") - sampling a ring at the
  // footprint radius and taking the MAX rests the object ON the surface instead of inside it. Returns
  // null only when no sample resolves (async terrain not loaded yet).
  const footprintGroundY = (thing: GeneratedThing): number | null => {
    let bestRendered: number | null = renderedTerrainHeightAt(thing.position.x, thing.position.z);
    let bestAnalytic = groundHeightAt(thing.position.x, thing.position.z);
    const fp = thingFootprint(thing);
    const r = Math.min(fp?.radius ?? 0, 6);
    if (r >= 0.25) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = thing.position.x + Math.cos(a) * r;
        const z = thing.position.z + Math.sin(a) * r;
        const rendered = renderedTerrainHeightAt(x, z);
        if (
          rendered !== null &&
          Number.isFinite(rendered) &&
          (bestRendered === null || rendered > bestRendered)
        ) {
          bestRendered = rendered;
        }
        const analytic = groundHeightAt(x, z);
        if (
          analytic !== null &&
          Number.isFinite(analytic) &&
          (bestAnalytic === null || analytic > bestAnalytic)
        ) {
          bestAnalytic = analytic;
        }
      }
    }
    return bestRendered ?? bestAnalytic;
  };

  const liveGroundOffsetFrom = (thing: GeneratedThing): number | null => {
    const groundY = footprintGroundY(thing);
    return groundY !== null && Number.isFinite(groundY)
      ? thing.position.y - groundY
      : null;
  };

  const isVisiblyOffsetFromLiveGround = (thing: GeneratedThing): boolean => {
    const offset = liveGroundOffsetFrom(thing);
    return offset !== null
      ? Math.abs(offset) > 0.05
      : isIntentionallyOffsetFromGround(thing);
  };

  const runtimeProfileForThing = (
    thing: GeneratedThing,
    options: { mounted?: boolean; includeRenderedGround?: boolean } = {},
  ): WorldThingRuntimeProfile =>
    buildWorldThingRuntimeProfile(thing, {
      dimensions: thingFootprint(thing) ?? undefined,
      groundY: options.includeRenderedGround
        ? footprintGroundY(thing)
        : groundHeightAt(thing.position.x, thing.position.z),
      mounted: options.mounted,
    });

  const updateThingMeshPosition = (thing: GeneratedThing) => {
    const mesh = generatedMeshes.get(thing.id);
    if (!mesh) return;
    applyThingRotation(mesh, thing);
    if (mesh.userData.generatingSwirl || isFreeMovingVehicle(thing)) {
      mesh.position.set(thing.position.x, thing.position.y, thing.position.z);
      if (mesh.userData.generatingSwirl) {
        mesh.userData.baseY = mesh.position.y;
      }
      refreshInstancedThingMatrix(thing);
      updateSelectionIndicator();
      return;
    }
    // Chunked worlds: the stored thing.position.y may have been grounded against the flat base
    // (sampleHeight returns null until the owning chunk streams in), so once the sculpted chunk loads
    // the asset would sit BELOW the surface. Re-sample the live rendered ground here so the model's
    // feet rest flush. Display-only — this function must NOT mutate thing.position (lift/lower/ground
    // commands set the authoritative y and call us to repaint; mutating here would fight them).
    // PERF: isVisiblyOffsetFromLiveGround + footprintGroundY each do ~9 terrain RAYCASTS (+ a Box3
    // bounds traversal). They're ONLY needed to gate the chunked-world live reground below, so compute
    // them ONLY when isChunked. On legacy worlds this whole block was raycasting 9× per asset on every
    // updateThingMeshPosition (incl. once per asset during the load storm) and being thrown away — the
    // cause of the multi-second load freeze with many assets. Skip it entirely outside chunked worlds.
    const liveGround =
      isChunked && !isVisiblyOffsetFromLiveGround(thing) ? footprintGroundY(thing) : null;
    const placeAt =
      liveGround !== null && Number.isFinite(liveGround)
        ? { ...thing.position, y: liveGround }
        : thing.position;
    placeObjectAboveGround(mesh, placeAt, 0.04);
    refreshInstancedThingMatrix(thing);
    updateSelectionIndicator();
  };

  const updateSelectionIndicator = (_now?: number) => undefined;

  // Ground a thing's stored y to the LIVE RENDERED surface (footprintGroundY = raycast against the
  // actual mesh), falling back to the analytic groundedPosition only when no ray resolves. After heavy
  // terraforming the analytic terrainHeight() diverges from the rendered mesh, so grounding the DATA to
  // the rendered surface is what makes assets actually rest on the visible ground after a sculpt.
  const groundThingToRenderedSurface = (thing: GeneratedThing) => {
    const rendered = footprintGroundY(thing);
    thing.position =
      rendered !== null && Number.isFinite(rendered)
        ? { ...thing.position, y: rendered }
        : groundedPosition(thing.position.x, thing.position.z, thing.position);
  };

  const regroundClassicTerrainActorsAndThings = () => {
    visitorPosition = groundedPosition(visitorPosition.x, visitorPosition.z, visitorPosition);
    for (const thing of generated) {
      if (!isFreeMovingVehicle(thing) && !isIntentionallyOffsetFromGround(thing)) {
        groundThingToRenderedSurface(thing);
        updateThingMeshPosition(thing);
      }
    }
  };

  onTerrainTemplateLoaded(() => {
    if (isChunked) {
      chunkRenderer?.rebuildTerrain();
      publish();
      return;
    }
    refreshTerrainGeometry();
    updatePondSurfacePosition();
    regroundClassicTerrainActorsAndThings();
    refreshFlowerPatches();
    vegetation.notifyTerrainChanged();
    publish();
  });

  const commitTransformControlRotation = () => {
    if (!selectedThingId || !transformControlsObject) return;
    const thing = thingById(selectedThingId);
    if (!thing) return;
    thing.rotationX = transformControlsObject.rotation.x;
    thing.rotationY = transformControlsObject.rotation.y;
    thing.rotationZ = transformControlsObject.rotation.z;
    publishGeneratedThing(thing);
    publish();
  };

  const syncTransformControls = () => {
    if (!transformControls) return;
    const mesh =
      selectedThingId !== undefined
        ? generatedMeshes.get(selectedThingId)
        : undefined;
    if (!mesh) {
      transformControls.detach();
      transformControlsObject = null;
      if (transformControlsHelper) transformControlsHelper.visible = false;
      return;
    }
    if (transformControlsObject !== mesh) {
      transformControls.attach(mesh);
      transformControlsObject = mesh;
    }
    transformControls.setMode("rotate");
    transformControls.setSpace("local");
    transformControls.setRotationSnap(THREE.MathUtils.degToRad(5));
    if (transformControlsHelper) transformControlsHelper.visible = true;
  };

  const worldGeneratedThing = (thing: GeneratedThing): WorldGeneratedThing => ({
    id: thing.id,
    kind: thing.kind,
    prompt: thing.prompt,
    creatorId: thing.creatorId,
    ownerUserId: thing.ownerUserId,
    position: thing.position,
    rotationX: thing.rotationX,
    rotationY: thing.rotationY,
    rotationZ: thing.rotationZ,
    scale: thing.scale,
    color: thing.color,
    assetStoreModelId: thing.assetStoreModelId,
    modelUrl: thing.modelUrl,
    pipelineId: thing.modelUrl ? undefined : thing.pipelineId,
    generationStatus:
      thing.modelUrl
        ? "ready"
        : thing.generationStatus,
    // "" = explicit "default" (mirrors presence.avatarId): a mid-rollout server that doesn't know
    // the field yet echoes it back ABSENT, and absent must mean "keep what you have", not "clear".
    animation: thing.animation ?? "",
    petOwnerId: thing.petOwnerId,
    updatedAt: new Date().toISOString(),
  });

  const resolveAssetBackedModel = (
    modelUrl?: string,
    assetStoreModelId?: string,
  ): { modelUrl?: string; assetStoreModelId?: string } => {
    const identity = normalizeWorldThingAssetIdentity(modelUrl, assetStoreModelId);
    return {
      assetStoreModelId: identity.assetStoreModelId,
      modelUrl: identity.modelUrl
        ? (sanitizeProceduralModelUrl(identity.modelUrl) ?? absoluteTellusApiUrl(identity.modelUrl))
        : undefined,
    };
  };

  const normalizeGeneratedThing = (thing: WorldGeneratedThing): WorldGeneratedThing => {
    // procedural:// URLs are scheme-addressed local builds — absolutizing them (meant for legacy
    // relative GLB paths) would mangle them into "/procedural://…" and break rendering.
    const resolved = resolveAssetBackedModel(thing.modelUrl, thing.assetStoreModelId);
    const modelUrl = resolved.modelUrl;
    const stalePending = isStalePendingGeneratedThing(thing);
    return {
      ...thing,
      assetStoreModelId: resolved.assetStoreModelId,
      modelUrl,
      pipelineId: modelUrl || stalePending ? undefined : thing.pipelineId,
      generationStatus: modelUrl
        ? "ready"
        : stalePending
          ? "local"
          : thing.generationStatus,
    };
  };

  const isPendingGenerationStatus = (
    status: GeneratedThing["generationStatus"],
  ) => status === "queued" || status === "generating";

  const applyGenerationState = (
    existing: GeneratedThing,
    normalized: WorldGeneratedThing,
  ) => {
    const remoteIsPendingWithoutModel =
      !normalized.modelUrl &&
      isPendingGenerationStatus(normalized.generationStatus);
    const existingIsResolved =
      Boolean(existing.modelUrl) ||
      existing.generationStatus === "ready" ||
      existing.generationStatus === "local";

    if (remoteIsPendingWithoutModel && existingIsResolved) {
      return;
    }

    existing.assetStoreModelId = normalized.assetStoreModelId ?? existing.assetStoreModelId;
    existing.modelUrl = normalized.modelUrl;
    existing.pipelineId = normalized.modelUrl ? undefined : normalized.pipelineId;
    existing.generationStatus = normalized.modelUrl
      ? "ready"
      : normalized.generationStatus;
  };

  const failedPromptRelinkAttempts = new Set<string>();
  const normalizedAssetName = (value: string): string =>
    value.trim().replace(/\s+/g, " ").toLowerCase();
  const reconcileFailedAssetStorePrompt = (thing: GeneratedThing) => {
    if (thing.modelUrl || thing.generationStatus !== "failed") return;
    const prompt = thing.prompt.trim();
    if (!prompt || failedPromptRelinkAttempts.has(thing.id)) return;
    failedPromptRelinkAttempts.add(thing.id);
    void browseAssetLibrary(prompt, 1, "name", 8)
      .then((result) => {
        if (destroyed) return;
        const current = thingById(thing.id);
        if (!current || current.modelUrl || current.generationStatus !== "failed") return;
        const exact = result.models.filter(
          (model) => normalizedAssetName(model.name) === normalizedAssetName(prompt),
        );
        if (exact.length !== 1) return;
        const match = exact[0];
        const assetStoreModelId = match.assetStoreModelId ?? match.id;
        current.assetStoreModelId = assetStoreModelId;
        current.modelUrl = assetStoreGameOptimizedModelUrl(assetStoreModelId);
        current.pipelineId = undefined;
        current.generationStatus = "ready";
        ensureGeneratedVisual(current);
        publishGeneratedThing(current);
        loadRemoteGeneratedModel(current);
        addLog({
          agentId: "world",
          agentName: "Tellus",
          tool: "interact",
          text: `Relinked ${current.kind}: ${current.prompt} to asset-store model ${assetStoreModelId}.`,
        });
        publish();
      })
      .catch((error) => {
        console.warn("Failed asset prompt relink skipped", error);
      });
  };

  const generatedPlacementStorageKey = () =>
    `tellus.generated.${runtimeConfig.worldId}`;

  const generatedPlacementSnapshot = (): WorldGeneratedThing[] =>
    generated.map((thing) => worldGeneratedThing(thing));

  const saveGeneratedPlacementSnapshot = () => {
    if (tellusWorldBackendAvailable) return;
    try {
      window.localStorage.setItem(
        generatedPlacementStorageKey(),
        JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          generated: generatedPlacementSnapshot(),
        }),
      );
    } catch (error) {
      console.warn("Tellus generated placement save failed", error);
    }
  };

  const loadGeneratedPlacementSnapshot = (): WorldGeneratedThing[] => {
    if (tellusWorldBackendAvailable) return [];
    try {
      const raw = window.localStorage.getItem(generatedPlacementStorageKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      const source =
        isRecord(parsed) && Array.isArray(parsed.generated)
          ? parsed.generated
          : Array.isArray(parsed)
            ? parsed
            : [];
      return source.filter(isWorldGeneratedThing).map(normalizeGeneratedThing);
    } catch (error) {
      console.warn("Tellus generated placement load failed", error);
      return [];
    }
  };

  const publishGeneratedThing = (thing: GeneratedThing) => {
    saveGeneratedPlacementSnapshot();
    if (!tellusWorldBackendAvailable) return;
    const action = {
      type: "generated.upsert",
      visitorId,
      thing: worldGeneratedThing(thing),
    };
    if (worldSocket?.readyState === WebSocket.OPEN) {
      worldSocket.send(JSON.stringify(action));
      return;
    }
    void fetch(tellusWorldHttpUrl("action"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    }).catch((error) => {
      console.warn("Tellus generated sync failed", error);
    });
  };

  const MAX_WORLD_MODEL_LOADS = 1;
  const WORLD_MODEL_LOAD_PUMP_DELAY_MS = 120;
  let activeWorldModelLoads = 0;
  const worldModelLoadQueue: string[] = [];
  const queuedWorldModelLoads = new Set<string>();
  let worldModelLoadPumpScheduled = false;

  const isDeadLegacyHyadesContentUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url, window.location.href);
      const worldApiHost = runtimeConfig.worldApiBase
        ? new URL(runtimeConfig.worldApiBase, window.location.href).hostname
        : "";
      return (
        parsed.hostname === worldApiHost &&
        /^\/v1\/3d\/content\/[^/]+\/\d+\/?$/i.test(parsed.pathname)
      );
    } catch {
      return false;
    }
  };

  const isDefinitelyDeadModelUrl = async (url: string): Promise<boolean> => {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Range: "bytes=0-0" },
        cache: "no-store",
      });
      return res.status === 404 || res.status === 410;
    } catch {
      return false;
    }
  };

  const isAssetStoreBackedModel = (thing: GeneratedThing, modelUrl: string): boolean =>
    Boolean(thing.assetStoreModelId?.trim() || assetStoreIdFromModelUrl(modelUrl));

  const showTransientGeneratedLoadFailure = (thing: GeneratedThing, error: unknown) => {
    const oldMesh = generatedMeshes.get(thing.id);
    if (oldMesh?.userData.transientLoadFailedFor === thing.modelUrl) return;
    if (oldMesh) {
      uninstanceThing(thing.id);
      stopGeneratedAnimation(thing.id);
      scene.remove(oldMesh);
      disposeObject(oldMesh);
    }
    const failedMesh = createGeneratedMesh({ ...thing, generationStatus: "failed" });
    failedMesh.userData.transientLoadFailedFor = thing.modelUrl;
    failedMesh.userData.transientLoadError =
      error instanceof Error ? error.message : String(error);
    generatedMeshes.set(thing.id, failedMesh);
    scene.add(failedMesh);
    syncTransformControls();
    updateThingMeshPosition(thing);
  };

  const scheduleTransientModelRetry = (thingId: string, modelUrl: string) => {
    if (transientModelRetryTimers.has(thingId)) return;
    const current = thingById(thingId);
    const assetStoreBacked = current ? isAssetStoreBackedModel(current, modelUrl) : false;
    const attempts = transientModelLoadFailures.get(thingId) ?? 1;
    const delayCapMs = assetStoreBacked ? 60_000 : 30_000;
    const delay = Math.min(delayCapMs, 1_500 * Math.pow(2, Math.max(0, attempts - 1)));
    const timer = window.setTimeout(() => {
      transientModelRetryTimers.delete(thingId);
      const current = thingById(thingId);
      if (!current || current.modelUrl !== modelUrl || current.generationStatus !== "ready") return;
      loadRemoteGeneratedModel(current);
    }, delay);
    transientModelRetryTimers.set(thingId, timer);
  };

  const sortWorldModelLoadQueue = () => {
    worldModelLoadQueue.sort((a, b) => {
      if (selectedThingId === a) return -1;
      if (selectedThingId === b) return 1;
      const thingA = thingById(a);
      const thingB = thingById(b);
      const distanceA = thingA ? distance2D(visitorPosition, thingA.position) : Number.POSITIVE_INFINITY;
      const distanceB = thingB ? distance2D(visitorPosition, thingB.position) : Number.POSITIVE_INFINITY;
      return distanceA - distanceB;
    });
  };

  const scheduleWorldModelLoadPump = () => {
    if (worldModelLoadPumpScheduled || destroyed) return;
    worldModelLoadPumpScheduled = true;
    window.setTimeout(() => {
      worldModelLoadPumpScheduled = false;
      pumpWorldModelLoadQueue();
    }, WORLD_MODEL_LOAD_PUMP_DELAY_MS);
  };

  const pumpWorldModelLoadQueue = () => {
    if (destroyed) return;
    while (activeWorldModelLoads < MAX_WORLD_MODEL_LOADS && worldModelLoadQueue.length > 0) {
      sortWorldModelLoadQueue();
      const id = worldModelLoadQueue.shift();
      if (!id) return;
      queuedWorldModelLoads.delete(id);
      const thing = thingById(id);
      if (!thing?.modelUrl || thing.generationStatus !== "ready") continue;
      const modelUrl = thing.modelUrl;
      if (isDeadLegacyHyadesContentUrl(modelUrl)) {
        thing.modelUrl = undefined;
        thing.generationStatus = "failed";
        thing.pipelineId = undefined;
        ensureGeneratedVisual(thing);
        publishGeneratedThing(thing);
        publish();
        continue;
      }
      const currentMesh = generatedMeshes.get(thing.id);
      if (currentMesh?.userData.loadedModelUrl === modelUrl) continue;
      activeWorldModelLoads++;
      void loadGeneratedModel(modelUrl, thing, useWebGPU)
        .then((model) => {
          const current = thingById(id);
          if (destroyed || !current || current.modelUrl !== modelUrl) {
            disposeObject(model);
            return;
          }
          transientModelLoadFailures.delete(id);
          const retryTimer = transientModelRetryTimers.get(id);
          if (retryTimer !== undefined) {
            window.clearTimeout(retryTimer);
            transientModelRetryTimers.delete(id);
          }
          const oldMesh = generatedMeshes.get(id);
          if (oldMesh) {
            uninstanceThing(id); // free any instance slot the old mesh held before we swap it out
            stopGeneratedAnimation(id);
            scene.remove(oldMesh);
            disposeObject(oldMesh);
          }
          model.userData.loadedModelUrl = modelUrl;
          generatedMeshes.set(id, model);
          startGeneratedAnimation(id, model);
          scene.add(model);
          syncTransformControls();
          reevaluateInstanceGroup(modelUrl);
          publish();
        })
        .catch(async (error) => {
          const current = thingById(id);
          console.warn("Remote generated model load failed", error);
          if (!current || current.modelUrl !== modelUrl) return;
          const assetStoreBacked = isAssetStoreBackedModel(current, modelUrl);
          // Asset-store ids are stable Tellus state, and the asset manager resolves superseded ids
          // through aliases on the model endpoints. A 404/410 can still be transient while conversion,
          // alias creation, or the deploy catches up, so keep retrying instead of erasing the saved id.
          const definitelyDead = assetStoreBacked ? false : await isDefinitelyDeadModelUrl(modelUrl);
          if (!current || current.modelUrl !== modelUrl) return;
          if (definitelyDead) {
            current.modelUrl = undefined;
            current.generationStatus = "failed";
            current.pipelineId = undefined;
            ensureGeneratedVisual(current);
            publishGeneratedThing(current);
          } else {
            transientModelLoadFailures.set(id, (transientModelLoadFailures.get(id) ?? 0) + 1);
            showTransientGeneratedLoadFailure(current, error);
            scheduleTransientModelRetry(id, modelUrl);
          }
          publish();
        })
        .finally(() => {
          activeWorldModelLoads--;
          scheduleWorldModelLoadPump();
        });
    }
  };

  const loadRemoteGeneratedModel = (thing: GeneratedThing) => {
    if (!thing.modelUrl || thing.generationStatus !== "ready") return;
    const currentMesh = generatedMeshes.get(thing.id);
    if (currentMesh?.userData.loadedModelUrl === thing.modelUrl) {
      return;
    }
    if (queuedWorldModelLoads.has(thing.id)) return;
    queuedWorldModelLoads.add(thing.id);
    worldModelLoadQueue.push(thing.id);
    scheduleWorldModelLoadPump();
  };

  const ensureGeneratedVisual = (thing: GeneratedThing) => {
    const wantsSwirl = shouldShowGenerationSwirl(thing);
    const currentMesh = generatedMeshes.get(thing.id);
    // If the correct GLB is already mounted, never tear it down. Without this, every move/scale/rotate/mount
    // echoed back as a `generated.updated` patch would dispose the loaded model and re-download it: a ready
    // asset reports wantsSwirl=true (it has a modelUrl), but the loaded mesh carries no `generatingSwirl`
    // flag, so the state-compare below mismatched → dispose + re-fetch the GLB on every transform.
    const alreadyLoaded =
      Boolean(thing.modelUrl) && currentMesh?.userData.loadedModelUrl === thing.modelUrl;
    if (
      currentMesh &&
      (alreadyLoaded || Boolean(currentMesh.userData.generatingSwirl) === wantsSwirl)
    ) {
      return;
    }
    const previousModelUrl =
      typeof currentMesh?.userData.loadedModelUrl === "string"
        ? (currentMesh.userData.loadedModelUrl as string)
        : undefined;
    if (currentMesh) {
      uninstanceThing(thing.id); // a torn-down mesh must release its instance slot first
      stopGeneratedAnimation(thing.id);
      scene.remove(currentMesh);
      disposeObject(currentMesh);
    }
    const nextMesh = wantsSwirl ? createGenerationSwirl(thing) : createGeneratedMesh(thing);
    generatedMeshes.set(thing.id, nextMesh);
    scene.add(nextMesh);
    syncTransformControls();
    updateThingMeshPosition(thing);
    // The old GLB (if any) just lost a member; re-evaluate that group so the survivors fold correctly.
    if (previousModelUrl) reevaluateInstanceGroup(previousModelUrl);
  };

  const reconcileRemoteGeneratedManifest = (thing: GeneratedThing) => {
    if (thing.modelUrl || !thing.pipelineId || pendingManifestReconciliations.has(thing.id)) {
      return;
    }
    if (
      thing.generationStatus !== "queued" &&
      thing.generationStatus !== "generating" &&
      thing.generationStatus !== "failed"
    ) {
      return;
    }
    pendingManifestReconciliations.add(thing.id);
    void Promise.all([
      generatedAssetManifestModelUrls(),
      generatedAssetManifestAssetIds(),
    ])
      .then(([modelUrls, assetIds]) => {
        if (destroyed) return;
        const modelUrl = modelUrls.get(thing.id);
        if (!modelUrl) return;
        const current = thingById(thing.id);
        if (!current || current.modelUrl) return;
        current.assetStoreModelId = assetIds.get(thing.id) ?? current.assetStoreModelId;
        current.modelUrl = modelUrl;
        current.generationStatus = "ready";
        current.pipelineId = undefined;
        publishGeneratedThing(current);
        loadRemoteGeneratedModel(current);
        publish();
      })
      .catch((error) => {
        console.warn("Generated asset manifest reconciliation failed", error);
      })
      .finally(() => {
        pendingManifestReconciliations.delete(thing.id);
      });
  };

  const applyRemoteGeneratedThing = (remote: WorldGeneratedThing) => {
    const healedPending = isStalePendingGeneratedThing(remote);
    const normalized = normalizeGeneratedThing(remote);
    const existing = thingById(normalized.id);
    if (existing) {
      const locallyRidden = existing.id === sailingThingId;
      existing.kind = normalized.kind as GeneratedKind;
      existing.prompt = normalized.prompt;
      existing.creatorId = normalized.creatorId as AgentId | "visitor";
      existing.ownerUserId = normalized.ownerUserId;
      if (!locallyRidden) {
        existing.position = { ...normalized.position };
        existing.rotationX = normalized.rotationX ?? 0;
        existing.rotationY = normalized.rotationY;
        existing.rotationZ = normalized.rotationZ ?? 0;
        existing.scale = normalized.scale;
      }
      existing.color = normalized.color;
      existing.assetStoreModelId = normalized.assetStoreModelId ?? existing.assetStoreModelId;
      existing.petOwnerId = normalized.petOwnerId;
      // animation wire convention (mirrors presence.avatarId): "" = explicit default, a non-empty
      // string = explicit clip, ABSENT = a mid-rollout server stripped the field — keep ours
      // (otherwise our own upsert's echo would wipe a just-picked clip).
      const nextAnimation =
        normalized.animation === undefined
          ? existing.animation
          : normalized.animation || undefined;
      const animationChanged = (existing.animation ?? "") !== (nextAnimation ?? "");
      existing.animation = nextAnimation;
      applyGenerationState(existing, normalized);
      ensureGeneratedVisual(existing);
      updateThingMeshPosition(existing);
      // A remote animation pick on an already-loaded model restarts the loop in place (a model
      // still loading picks it up via startGeneratedAnimation after the load).
      if (animationChanged) {
        const mesh = generatedMeshes.get(existing.id);
        if (mesh && mesh.userData.loadedModelUrl === existing.modelUrl) {
          startGeneratedAnimation(existing.id, mesh);
        }
      }
      loadRemoteGeneratedModel(existing);
      reconcileRemoteGeneratedManifest(existing);
      reconcileFailedAssetStorePrompt(existing);
      if (healedPending) {
        publishGeneratedThing(existing);
      }
      return;
    }
    const thing: GeneratedThing = {
      id: normalized.id,
      kind: normalized.kind as GeneratedKind,
      prompt: normalized.prompt,
      creatorId: normalized.creatorId as AgentId | "visitor",
      ownerUserId: normalized.ownerUserId,
      position: { ...normalized.position },
      rotationX: normalized.rotationX ?? 0,
      rotationY: normalized.rotationY,
      rotationZ: normalized.rotationZ ?? 0,
      scale: normalized.scale,
      color: normalized.color,
      assetStoreModelId: normalized.assetStoreModelId,
      modelUrl: normalized.modelUrl,
      pipelineId: normalized.pipelineId,
      generationStatus: normalized.generationStatus,
      animation: normalized.animation || undefined, // "" (explicit default) → unset internally
      petOwnerId: normalized.petOwnerId,
    };
    generated.push(thing);
    const mesh = shouldShowGenerationSwirl(thing)
      ? createGenerationSwirl(thing)
      : createGeneratedMesh(thing);
    generatedMeshes.set(thing.id, mesh);
    scene.add(mesh);
    syncTransformControls();
    updateThingMeshPosition(thing);
    loadRemoteGeneratedModel(thing);
    reconcileRemoteGeneratedManifest(thing);
    reconcileFailedAssetStorePrompt(thing);
    if (healedPending) {
      publishGeneratedThing(thing);
    }
  };

  const applyRemoteGeneratedThings = (remoteThings: WorldGeneratedThing[]) => {
    const repaired = repairGeneratedCloneModelLinks(
      remoteThings,
      generated.map((thing) => worldGeneratedThing(thing)),
    );
    for (const remote of repaired.things) {
      applyRemoteGeneratedThing(remote);
    }
    for (const id of repaired.repairedIds) {
      const thing = thingById(id);
      if (thing) publishGeneratedThing(thing);
    }
    saveGeneratedPlacementSnapshot();
    publish();
  };

  function reconcileGeneratedSnapshot(remoteThings: WorldGeneratedThing[]) {
    const remoteIds = new Set(remoteThings.map((thing) => thing.id));
    applyRemoteGeneratedThings(remoteThings);
    for (const thing of [...generated]) {
      if (!remoteIds.has(thing.id)) {
        applyRemoteGeneratedDelete(thing.id);
      }
    }
  }

  const importGeneratedThings = (things: WorldGeneratedThing[]) => {
    for (const thing of things.filter(isWorldGeneratedThing)) {
      applyRemoteGeneratedThing(thing);
    }
    saveGeneratedPlacementSnapshot();
    addLog({
      agentId: "world",
      agentName: "Tellus",
      tool: "interact",
      text: `Recovered ${things.length} generated assets into the scene.`,
    });
    publish();
  };

  const recoverGeneratedFromPlacementSnapshot = (): boolean => {
    if (generated.length > 0) return true;
    const recovered = loadGeneratedPlacementSnapshot();
    if (recovered.length === 0) return false;
    importGeneratedThings(recovered);
    return true;
  };

  const recoverGeneratedFromManifest = () => {
    if (tellusWorldBackendAvailable) return;
    if (generated.length > 0) return;
    void generatedAssetManifestEntries()
      .then((entries) => {
        if (destroyed || generated.length > 0 || entries.length === 0) return;
        const recovered = entries
          .map((entry, index): WorldGeneratedThing | null => {
            if (
              typeof entry.id !== "string" ||
              typeof entry.modelUrl !== "string"
            ) {
              return null;
            }
            const prompt =
              typeof entry.prompt === "string" && entry.prompt.trim()
                ? entry.prompt
                : "recovered generated asset";
            const kind = inferGeneratedKind(
              typeof entry.kind === "string" ? entry.kind : prompt,
              "visitor",
            );
            const angle = index * 2.399963229728653;
            const radius = 8 + (index % 9) * 4.2;
            return {
              id: entry.id,
              kind,
              prompt,
              creatorId: "visitor",
              ownerUserId: userId,
              position: normalizedDiscPosition(
                Math.cos(angle) * radius,
                Math.sin(angle) * radius,
              ),
              rotationY: angle + Math.PI,
              scale: 1,
              color: kindColor(kind, prompt),
              assetStoreModelId:
                typeof entry.assetStoreModelId === "string" && entry.assetStoreModelId.trim()
                  ? entry.assetStoreModelId.trim()
                  : undefined,
              modelUrl:
                typeof entry.assetStoreModelId === "string" && entry.assetStoreModelId.trim()
                  ? assetStoreGameOptimizedModelUrl(entry.assetStoreModelId.trim())
                  : absoluteTellusApiUrl(entry.modelUrl),
              generationStatus: "ready",
              updatedAt:
                typeof entry.createdAt === "string"
                  ? entry.createdAt
                  : new Date().toISOString(),
            };
          })
          .filter((thing): thing is WorldGeneratedThing => thing !== null);
        if (recovered.length === 0) return;
        importGeneratedThings(recovered);
      })
      .catch((error) => {
        console.warn("Generated asset manifest recovery failed", error);
      });
  };

  const applyRemoteGeneratedDelete = (id: string) => {
    const index = generated.findIndex((thing) => thing.id === id);
    if (index === -1) return;
    const [removed] = generated.splice(index, 1);
    const removedModelUrl = removed?.modelUrl;
    const retryTimer = transientModelRetryTimers.get(id);
    if (retryTimer !== undefined) {
      window.clearTimeout(retryTimer);
      transientModelRetryTimers.delete(id);
    }
    transientModelLoadFailures.delete(id);
    const mesh = generatedMeshes.get(id);
    if (mesh) {
      uninstanceThing(id); // free the instance slot before the mesh goes away
      stopGeneratedAnimation(id);
      scene.remove(mesh);
      disposeObject(mesh);
      generatedMeshes.delete(id);
    }
    if (selectedThingId === id) selectedThingId = undefined;
    syncTransformControls();
    if (sailingThingId === id) sailingThingId = undefined;
    reevaluateInstanceGroup(removedModelUrl); // group may now drop below 2 → pop the survivor out
    saveGeneratedPlacementSnapshot();
    publish();
  };

  if (tellusWorldBackendAvailable && initialWorldPresence.length > 0) {
    applyRemotePresence(initialWorldPresence);
    visitorPosition = clearVisitorSpawnPosition(visitorPosition.x, visitorPosition.z);
    sendPresenceUpdate(true);
    setInitialWorldPresence([]);
  }

  if (tellusWorldBackendAvailable && initialWorldGeneratedThings.length > 0) {
    applyRemoteGeneratedThings(initialWorldGeneratedThings);
    setInitialWorldGeneratedThings([]);
  }

  connectTellusWorldRealtime();
  if (tellusWorldBackendAvailable) {
    worldChatPollTimer = window.setInterval(() => void pollWorldChatSnapshot(), 5000);
  }
  void initP2p();
  if (!tellusWorldBackendAvailable && !recoverGeneratedFromPlacementSnapshot()) {
    recoverGeneratedFromManifest();
  }

  const selectGenerated = (id?: string) => {
    const previousSelectedId = selectedThingId;
    selectedThingId = id && thingById(id) ? id : undefined;
    // Pop the newly-selected thing OUT (regular mesh visible) BEFORE attaching TransformControls, and re-fold
    // the previously-selected thing's group. No-op unless instancing is on.
    reevaluateInstancingForSelection(previousSelectedId, selectedThingId);
    updateSelectionIndicator();
    syncTransformControls();
    publish();
  };

  const goToGenerated = (id: string) => {
    const thing = thingById(id);
    if (!thing) return;
    const previousSelectedId = selectedThingId;
    selectedThingId = id;
    reevaluateInstancingForSelection(previousSelectedId, selectedThingId);
    const distance = Math.hypot(thing.position.x, thing.position.z);
    const offset =
      distance > 0.001
        ? { x: thing.position.x / distance, z: thing.position.z / distance }
        : { x: 1, z: 0 };
    const targetX = thing.position.x - offset.x * 3.2;
    const targetZ = thing.position.z - offset.z * 3.2;
    if (!moveMountedUnitTo(targetX, targetZ)) {
      visitorPosition = groundedPosition(targetX, targetZ, visitorPosition);
    }
    updateSelectionIndicator();
    syncTransformControls();
    sendPresenceUpdate(true);
    publish();
  };

  // Warp the player to a world (x,z) — the click-map teleport. Grounds onto the terrain (chunked-aware via
  // groundedPosition), cancels any fall/run-accel, and republishes presence so peers see the jump.
  // Arrival grace: after any spawn/warp/interior-entry, if the player is standing inside a portal's
  // radius (e.g. the return portal sits right at the spawn), mark it already-entered so a single move
  // doesn't immediately re-trigger it. The portal only re-arms once the player steps OUT of its radius
  // (updatePortals resets insidePortalId to null on !nearId). Without this you get the "spawn on the
  // door → move → bounce back → spawn on the door" loop.
  const armPortalArrivalGrace = () => {
    insidePortalId = null;
    lastPortalEnterAt = performance.now();
    // One-shot spawn protection: block ALL portal auto-enter until the player has been clear of every
    // portal radius at least once. This is robust even when the destination world's portals load
    // asynchronously AFTER spawn (the snapshot-at-spawn check alone would miss a late-loading return
    // portal and you'd bounce straight back).
    portalSpawnGuard = true;
  };

  if (options.initialInteriorSceneUrl) {
    applyInterior(options.initialInteriorSceneUrl);
  }

  const moveMountedUnitTo = (x: number, z: number): boolean => {
    if (!sailingThingId) return false;
    const mount = thingById(sailingThingId);
    if (!mount) {
      sailingThingId = undefined;
      return false;
    }
    const arrival = clearVisitorSpawnPosition(x, z);
    mount.position = movedVehiclePosition(mount, arrival.x, arrival.z, mount.position);
    updateThingMeshPosition(mount);
    visitorPosition = riderPositionForThing(mount);
    publishGeneratedThing(mount);
    syncAnchoredPortalsForThing(mount);
    return true;
  };

  const petLastPublishAt = new Map<string, number>();
  const localPetThings = (): GeneratedThing[] =>
    generated.filter((thing) => thing.petOwnerId === petOwnerId && thing.id !== sailingThingId);

  const petFollowTarget = (thing: GeneratedThing, index: number): Vec3 => {
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const distance = (sailingThingId ? 5.4 : 3.4) + row * 1.2;
    const lateral = side * (1.15 + row * 0.2);
    const behindX = -Math.sin(yaw) * distance;
    const behindZ = -Math.cos(yaw) * distance;
    const rightX = Math.cos(yaw) * lateral;
    const rightZ = -Math.sin(yaw) * lateral;
    const x = visitorPosition.x + behindX + rightX;
    const z = visitorPosition.z + behindZ + rightZ;
    return vehicleMode(thing)
      ? movedVehiclePosition(thing, x, z, thing.position)
      : groundedPosition(x, z, thing.position);
  };

  const syncPetsToOwner = (delta: number, forceTeleport = false) => {
    const pets = localPetThings();
    if (pets.length === 0) return;
    const nowMs = performance.now();
    let changed = false;
    for (let index = 0; index < pets.length; index++) {
      const pet = pets[index];
      if (ambientPhysics.has(pet.id)) continue;
      const target = petFollowTarget(pet, index);
      const dx = target.x - pet.position.x;
      const dz = target.z - pet.position.z;
      const distance = Math.hypot(dx, dz);
      const shouldSnap = forceTeleport || distance > 70;
      const shouldMove = shouldSnap || distance > 1.1;
      if (!shouldMove) continue;
      const previous = { ...pet.position };
      if (shouldSnap || delta <= 0) {
        pet.position = target;
      } else {
        const speed = scaledPlayerSpeed() * (sailingThingId ? 1.85 : 1.35);
        const step = Math.min(distance, Math.max(6, speed) * delta);
        const t = distance > 0 ? step / distance : 1;
        pet.position = {
          x: pet.position.x + dx * t,
          y: target.y,
          z: pet.position.z + dz * t,
        };
      }
      const mdx = pet.position.x - previous.x;
      const mdz = pet.position.z - previous.z;
      if (Math.hypot(mdx, mdz) > 0.001) {
        pet.rotationY = Math.atan2(mdx, mdz);
      }
      updateThingMeshPosition(pet);
      refreshInstancedThingMatrix(pet);
      const lastPublished = petLastPublishAt.get(pet.id) ?? 0;
      if (forceTeleport || nowMs - lastPublished > 320) {
        petLastPublishAt.set(pet.id, nowMs);
        publishGeneratedThing(pet);
      }
      changed = true;
    }
    if (changed) publish();
  };

  const warpTo = (x: number, z: number) => {
    // clearVisitorSpawnPosition nudges off other players AND off the nearest portal so you don't land
    // on top of someone or inside a trigger volume.
    if (!moveMountedUnitTo(x, z)) {
      visitorPosition = clearVisitorSpawnPosition(x, z);
    }
    playerAirborne = false;
    playerVy = 0;
    moveHoldStartMs = 0;
    armPortalArrivalGrace();
    syncPetsToOwner(0, true);
    sendPresenceUpdate(true);
    publish();
  };

  const syncAnchoredPortalsForThing = (thing: GeneratedThing) => {
    const anchored = worldPortals.filter((portal) => portal.anchorThingId === thing.id);
    if (anchored.length === 0) return;
    for (const portal of anchored) {
      sendPortalUpsert(
        {
          ...portal,
          position: { ...thing.position },
        },
        { pending: false },
      );
    }
  };

  const moveGenerated = (id: string, dx: number, dz: number) => {
    const thing = thingById(id);
    if (!thing) return;
    const preserveCurrentY = draggingThingId === id;
    const oldGroundY = groundHeightAt(thing.position.x, thing.position.z);
    const manualHeightOffset =
      oldGroundY !== null && Number.isFinite(oldGroundY)
        ? Math.max(0, thing.position.y - oldGroundY)
        : 0;
    const position =
      isVehicleThing(thing) || sailingThingId === id
        ? movedVehiclePosition(
            thing,
            thing.position.x + dx,
            thing.position.z + dz,
            thing.position,
          )
        : preserveCurrentY
          ? {
              x: thing.position.x + dx,
              y: thing.position.y,
              z: thing.position.z + dz,
            }
        : groundedPosition(
            thing.position.x + dx,
            thing.position.z + dz,
            thing.position,
          );
    if (!preserveCurrentY && !isVehicleThing(thing) && sailingThingId !== id && manualHeightOffset > 0) {
      const newGroundY = groundHeightAt(position.x, position.z);
      if (newGroundY !== null && Number.isFinite(newGroundY)) {
        position.y = newGroundY + manualHeightOffset;
      }
    }
    thing.position = position;
    if (sailingThingId === id) {
      visitorPosition = riderPositionForThing(thing);
    }
    updateThingMeshPosition(thing);
    publishGeneratedThing(thing);
    syncAnchoredPortalsForThing(thing);
    publish();
  };

  // Duplicate the selected object, preserving its model + scale + rotation, offset a little so it doesn't sit
  // exactly on the original. The GLB loads from the in-memory parse cache, so a clone is instant (no
  // re-download/re-parse), and it's persisted to the world like any other placement.
  const cloneGenerated = (id: string) => {
    const source = thingById(id);
    if (!source) return;
    const offset = 1.4 + source.scale * 0.8;
    const clone: GeneratedThing = {
      id: browserUuid(),
      kind: source.kind,
      prompt: source.prompt,
      creatorId: "visitor",
      ownerUserId: userId,
      position: groundedPosition(
        source.position.x + offset,
        source.position.z + offset,
        source.position,
      ),
      rotationX: source.rotationX,
      rotationY: source.rotationY,
      rotationZ: source.rotationZ,
      scale: source.scale,
      color: source.color,
      assetStoreModelId: source.assetStoreModelId,
      modelUrl: source.modelUrl,
      pipelineId: source.pipelineId,
      generationStatus: source.generationStatus,
    };
    generated.push(clone);
    const mesh = shouldShowGenerationSwirl(clone)
      ? createGenerationSwirl(clone)
      : createGeneratedMesh(clone);
    generatedMeshes.set(clone.id, mesh);
    scene.add(mesh);
    updateThingMeshPosition(clone);
    loadRemoteGeneratedModel(clone);
    publishGeneratedThing(clone);
    selectGenerated(clone.id);
  };

  const rotateGenerated = (id: string, radians: number, axis: "x" | "y" | "z" = "y") => {
    const thing = thingById(id);
    if (!thing) return;
    if (axis === "x") {
      thing.rotationX = (thing.rotationX ?? 0) + radians;
    } else if (axis === "z") {
      thing.rotationZ = (thing.rotationZ ?? 0) + radians;
    } else {
      thing.rotationY += radians;
    }
    const mesh = generatedMeshes.get(id);
    if (mesh) applyThingRotation(mesh, thing);
    publishGeneratedThing(thing);
    publish();
  };

  const setGeneratedScale = (thing: GeneratedThing, scale: number) => {
    const oldTargetHeight = assetTargetHeight(thing);
    thing.scale = clamp(scale, 0.1, 12);
    const newTargetHeight = assetTargetHeight(thing);
    const mesh = generatedMeshes.get(thing.id);
    if (mesh && oldTargetHeight > 0) {
      mesh.scale.multiplyScalar(newTargetHeight / oldTargetHeight);
      updateThingMeshPosition(thing);
    }
    publishGeneratedThing(thing);
    publish();
  };

  const scaleGenerated = (id: string, multiplier: number) => {
    const thing = thingById(id);
    if (!thing) return;
    setGeneratedScale(thing, thing.scale * multiplier);
  };

  const resetGeneratedScale = (id: string) => {
    const thing = thingById(id);
    if (!thing) return;
    setGeneratedScale(thing, 1);
  };

  const liftGenerated = (id: string, amount: number) => {
    const thing = thingById(id);
    if (!thing) return;
    // Free manual positioning: clamp around the asset's CURRENT y, not the terrain ground. Some GLBs
    // have geometry far above/below their origin, so the visible mesh can sit metres off the data y;
    // flooring at groundY would block lowering a floating model down to the surface. Give a generous
    // ±40m band around wherever it currently is so raise AND lower always have room to move.
    const minY = thing.position.y - 40;
    const maxY = thing.position.y + 40;
    thing.position = {
      ...thing.position,
      y: clamp(thing.position.y + amount, minY, maxY),
    };
    if (sailingThingId === id) {
      visitorPosition = riderPositionForThing(thing);
    }
    updateThingMeshPosition(thing);
    publishGeneratedThing(thing);
    syncAnchoredPortalsForThing(thing);
    publish();
  };

  // Highest terrain height under a thing's footprint. With the wider terrain height variability,
  // grounding to the single CENTRE sample can leave a multi-tile object partly buried under higher
  // neighbouring terrain ("under the land even after the surface button") — sampling a ring at the
  // footprint radius and taking the MAX rests the object ON the surface instead of inside it. Returns
  // null only when no sample resolves (async terrain not loaded yet).
  const groundGenerated = (id: string) => {
    const thing = thingById(id);
    if (!thing) return;
    const groundY = footprintGroundY(thing);
    // Origin-anchored placement (see placeObjectAboveGround): put the asset's origin on the ground.
    thing.position =
      groundY !== null && Number.isFinite(groundY)
        ? { ...thing.position, y: groundY }
        : groundedPosition(thing.position.x, thing.position.z, {
            ...thing.position,
            y: Math.min(thing.position.y, 0),
          });
    if (sailingThingId === id) {
      visitorPosition = riderPositionForThing(thing);
    }
    updateThingMeshPosition(thing);
    publishGeneratedThing(thing);
    syncAnchoredPortalsForThing(thing);
    publish();
  };

  const deleteGenerated = (id: string) => {
    const index = generated.findIndex((thing) => thing.id === id);
    if (index < 0) return;
    const previousSelectedId = selectedThingId;
    const anchoredPortals = worldPortals.filter((portal) => portal.anchorThingId === id);
    if (anchoredPortals.length > 0) {
      const names = anchoredPortals
        .slice(0, 4)
        .map((portal) => portal.label || portal.target.worldId)
        .join(", ");
      const ok = window.confirm(
        `This asset anchors ${anchoredPortals.length} portal${anchoredPortals.length === 1 ? "" : "s"}.\n` +
          `Delete the asset and its portal${anchoredPortals.length === 1 ? "" : "s"}?\n${names}`,
      );
      if (!ok) return;
      for (const portal of anchoredPortals) sendPortalDelete(portal.id);
    }
    const [thing] = generated.splice(index, 1);
    const deletedModelUrl = thing?.modelUrl;
    pendingGenerationControllers.get(id)?.abort();
    pendingGenerationControllers.delete(id);
    const mesh = generatedMeshes.get(id);
    if (mesh) {
      uninstanceThing(id); // free the instance slot before the mesh goes away
      stopGeneratedAnimation(id);
      scene.remove(mesh);
      disposeObject(mesh);
      generatedMeshes.delete(id);
    }
    syncTransformControls();
    if (sailingThingId === id) {
      sailingThingId = undefined;
      visitorPosition = groundedPosition(
        thing.position.x,
        thing.position.z,
        visitorPosition,
      );
    }
    selectedThingId =
      generated[Math.min(index, generated.length - 1)]?.id ?? undefined;
    // Deleting may drop the group below 2 (pop survivor out) and changes the selection (pop the new one out).
    reevaluateInstanceGroup(deletedModelUrl);
    reevaluateInstancingForSelection(previousSelectedId, selectedThingId);
    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "interact",
      text: `deleted ${thing.kind}: ${thing.prompt}`,
    });
    if (tellusWorldBackendAvailable) {
      const action = { type: "generated.delete", visitorId, id };
      if (worldSocket?.readyState === WebSocket.OPEN) {
        worldSocket.send(JSON.stringify(action));
      } else {
        void fetch(tellusWorldHttpUrl("action"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        });
      }
    }
    saveGeneratedPlacementSnapshot();
    publish();
  };

  const moveGeneratedToWater = (id: string) => {
    const thing = thingById(id);
    if (!thing) return;
    const angle = Math.atan2(visitorPosition.z, visitorPosition.x) || 0.2;
    const radius = Math.max(WORLD_RADIUS + 5, Math.hypot(thing.position.x, thing.position.z));
    thing.position = waterVehiclePosition(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      thing.position,
    );
    if (sailingThingId === id) {
      visitorPosition = riderPositionForThing(thing);
    }
    updateThingMeshPosition(thing);
    publishGeneratedThing(thing);
    syncAnchoredPortalsForThing(thing);
    publish();
  };

  const boardGenerated = (id: string) => {
    const thing = thingById(id);
    const mode = thing ? vehicleMode(thing) : null;
    if (!thing || !mode) return;
    const previousSelectedId = selectedThingId;
    sailingThingId = id;
    selectedThingId = undefined;
    draggingThingId = null;
    setMoveMode(null);
    uninstanceThing(id);
    reevaluateInstancingForSelection(previousSelectedId, selectedThingId);
    updateSelectionIndicator();
    syncTransformControls();
    if (mode === "water" && waterBlockedByLand(thing.position)) {
      moveGeneratedToWater(id);
    } else if (mode === "air") {
      thing.position = airPosition(thing.position.x, thing.position.z);
    }
    const boarded = thingById(id);
    if (boarded) {
      updateThingMeshPosition(boarded);
      visitorPosition = riderPositionForThing(boarded);
      mountedAnimationThingId = undefined;
      mountedAnimationMode = undefined;
      updateMountedAnimation(boarded, false);
      publishGeneratedThing(boarded);
    }
    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "interact",
      text: `boarded ${thing.kind}: ${thing.prompt}`,
    });
    publish();
  };

  const disembark = () => {
    if (!sailingThingId) return;
    const boat = thingById(sailingThingId);
    sailingThingId = undefined;
    if (boat) {
      updateMountedAnimation(boat, false);
      mountedAnimationThingId = undefined;
      mountedAnimationMode = undefined;
      publishGeneratedThing(boat);
      const mountedMesh = generatedMeshes.get(boat.id);
      if (mountedMesh && mountedMesh.userData.loadedModelUrl === boat.modelUrl && isMountThing(boat)) {
        uninstanceThing(boat.id);
        mountedMesh.visible = true;
      }
      const mode = vehicleMode(boat);
      const nearbyIsland = nearestDistantIsland(
        boat.position.x,
        boat.position.z,
        1.45,
      );
      const shoreDirection = new THREE.Vector3(
        boat.position.x,
        0,
        boat.position.z,
      );
      if (mode === "water" && nearbyIsland) {
        visitorPosition = distantIslandShorePosition(
          nearbyIsland,
          boat.position.x,
          boat.position.z,
        );
      } else if (mode === "air") {
        visitorPosition = groundedPosition(
          boat.position.x,
          boat.position.z,
          visitorPosition,
        );
      } else if (mode === "ground") {
        const footprint = thingFootprint(boat);
        const stepAway = Math.max(1.8, (footprint?.radius ?? 0.8) + 0.8);
        const candidates = [
          boat.rotationY + Math.PI / 2,
          boat.rotationY - Math.PI / 2,
          boat.rotationY + Math.PI,
          boat.rotationY,
        ];
        const angle = candidates.find((candidate) => Number.isFinite(candidate)) ?? boat.rotationY;
        visitorPosition = clearVisitorSpawnPosition(
          boat.position.x + Math.sin(angle) * stepAway,
          boat.position.z + Math.cos(angle) * stepAway,
        );
      } else if (shoreDirection.lengthSq() > 0.001) {
        shoreDirection.normalize();
        visitorPosition = groundedPosition(
          shoreDirection.x * (WORLD_RADIUS - 2),
          shoreDirection.z * (WORLD_RADIUS - 2),
          visitorPosition,
        );
      }
    }
    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "interact",
      text: "stepped back onto Tellus.",
    });
    sendPresenceUpdate(true);
    publish();
  };

  const setGeneratedPet = (id: string, isPet: boolean) => {
    const thing = thingById(id);
    if (!thing) return;
    thing.petOwnerId = isPet ? petOwnerId : undefined;
    petLastPublishAt.delete(id);
    if (isPet) {
      uninstanceThing(id);
      syncPetsToOwner(0, false);
    } else if (thing.modelUrl) {
      reevaluateInstanceGroup(thing.modelUrl);
    }
    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "interact",
      text: isPet
        ? `${thing.prompt} is now following you.`
        : `${thing.prompt} is no longer following you.`,
    });
    publishGeneratedThing(thing);
    publish();
  };

  const chooseLocation = (request: GenerateRequest): Vec3 => {
    if (typeof request.location === "object")
      return normalizedDiscPosition(request.location.x, request.location.z);
    if (request.location === "near-mountain") {
      const angle = rand(tick + generated.length) * Math.PI * 2;
      const radius = 8 + rand(tick + 3) * 13;
      return normalizedDiscPosition(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
      );
    }
    if (request.location === "near-pond")
      return normalizedDiscPosition(
        15 + rand(tick) * 8,
        -15 + rand(tick + 1) * 7,
      );
    const origin = visitorPosition;
    const angle = rand(tick + generated.length * 17) * Math.PI * 2;
    const radius = 3 + rand(tick + 33) * 7;
    return normalizedDiscPosition(
      origin.x + Math.cos(angle) * radius,
      origin.z + Math.sin(angle) * radius,
    );
  };

  const reusableAssetsForPrompt = async (
    prompt: string,
    limit = 5,
    preferredContexts: readonly AssetSurfaceContext[] = [],
  ): Promise<AssetReuseCandidate[]> => {
    const trimmed = prompt.trim();
    if (trimmed.length < 3) return [];
    const kind = inferGeneratedKind(trimmed, "visitor");
    const localModels: AssetLibraryModel[] = generated
      .filter((thing) => thing.modelUrl && thing.generationStatus === "ready")
      .map((thing) => ({
        id: `world:${thing.id}`,
        name: thing.prompt,
        description: thing.prompt,
        modelUrl: thing.modelUrl,
        source: "generated" as const,
        hasThumbnail: false,
      }));
    const localMatches = rankReusableAssets(trimmed, localModels, kind, limit, preferredContexts);
    let storeMatches: AssetReuseCandidate[] = [];
    if (runtimeConfig.worldApiBase && localMatches.length < limit) {
      const browsed = await browseAssetLibrary(trimmed, 1, "downloads", 12).catch(() => ({
        models: [],
        hasNext: false,
        total: 0,
      }));
      storeMatches = rankReusableAssets(trimmed, browsed.models, kind, limit, preferredContexts);
    }
    return rankReusableAssets(trimmed, [...localMatches, ...storeMatches], kind, limit, preferredContexts);
  };

  const generate = (request: GenerateRequest): GeneratedThing => {
    const kind = inferGeneratedKind(request.prompt, request.creatorId);
    const position = chooseLocation(request);
    const thing: GeneratedThing = {
      id: makeId(kind),
      kind,
      prompt: request.prompt,
      creatorId: request.creatorId,
      ownerUserId:
        request.ownerUserId ?? (request.creatorId === "visitor" ? userId : undefined),
      position,
      rotationY: 0,
      scale: request.scale ?? defaultScaleForRealisticKind(kind, request.prompt),
      color: kindColor(kind, request.prompt),
      generationStatus: "local",
    };
    const generationProvider = generationProviderForThing(thing);
    const usesExternalGeneration =
      hasExternalGenerationProvider(generationProvider) && directGenerationAvailable;
    thing.generationStatus = usesExternalGeneration ? "queued" : "local";
    generated.push(thing);
    const mesh = usesExternalGeneration
      ? createGenerationSwirl(thing)
      : createGeneratedMesh(thing);
    generatedMeshes.set(thing.id, mesh);
    scene.add(mesh);
    syncTransformControls();

    addLog({
      agentId: request.creatorId,
      agentName: "Visitor",
      tool: "generate",
      text: `Visitor generated ${thing.kind}: ${request.prompt}`,
    });
    announceWorldChat(`${displayNameForVisitor(String(request.creatorId))} started building ${thing.kind}: ${request.prompt}`, thing.position);
    publishGeneratedThing(thing);

    const showLocalFallbackMesh = () => {
      const oldMesh = generatedMeshes.get(thing.id);
      if (oldMesh) {
        stopGeneratedAnimation(thing.id);
        scene.remove(oldMesh);
        disposeObject(oldMesh);
      }
      const fallbackMesh = createGeneratedMesh(thing);
      generatedMeshes.set(thing.id, fallbackMesh);
      scene.add(fallbackMesh);
      syncTransformControls();
    };

    if (
      generationProvider === "asset-forge" &&
      runtimeConfig.assetForgeApiBase
    ) {
      const generationController = new AbortController();
      pendingGenerationControllers.set(thing.id, generationController);
      addLog({
        agentId: "world",
        agentName: "Pixel3D",
        tool: "generate",
        text: `Sending ${thing.kind} to Pixel3D: "${thing.prompt}"`,
      });
      void startPixel3DGeneration(thing, generationController.signal)
        .then(async (pipeline) => {
          if (destroyed || generationPausedForThing(thing) || !thingById(thing.id)) return;
          thing.pipelineId = pipeline.pipelineId;
          thing.generationStatus = "generating";
          publishGeneratedThing(thing);
          addLog({
            agentId: "world",
            agentName: "Pixel3D",
            tool: "generate",
            text: `Queued ${thing.kind} model for "${thing.prompt}" (${pipeline.pipelineId})`,
          });
          const modelUrl = await waitForPixel3DModelUrl(
            pipeline.pipelineId,
            generationController.signal,
          );
          if (destroyed || generationPausedForThing(thing) || !thingById(thing.id)) return;
          thing.modelUrl = modelUrl;
          addLog({
            agentId: "world",
            agentName: "Pixel3D",
            tool: "generate",
            text: `Pixel3D returned a model URL for ${thing.kind}; loading it into Tellus.`,
          });
          const model = await loadGeneratedModel(modelUrl, thing, useWebGPU);
          if (destroyed || generationPausedForThing(thing) || !thingById(thing.id)) {
            disposeObject(model);
            return;
          }
          thing.generationStatus = "ready";
          publishGeneratedThing(thing);
          const oldMesh = generatedMeshes.get(thing.id);
          if (oldMesh) {
            stopGeneratedAnimation(thing.id);
            scene.remove(oldMesh);
            disposeObject(oldMesh);
          }
          model.userData.loadedModelUrl = modelUrl;
          generatedMeshes.set(thing.id, model);
          startGeneratedAnimation(thing.id, model);
          scene.add(model);
          syncTransformControls();
          addLog({
            agentId: "world",
            agentName: "Pixel3D",
            tool: "interact",
            text: `Loaded Pixel3D GLB into the scene for ${thing.kind}: ${thing.prompt}`,
          });
          publish();
        })
        .catch((error) => {
          if (!thingById(thing.id)) return;
          if (generationPausedForThing(thing) || generationController.signal.aborted) {
            thing.generationStatus = "local";
            showLocalFallbackMesh();
            publishGeneratedThing(thing);
            publish();
            return;
          }
          thing.generationStatus = "failed";
          publishGeneratedThing(thing);
          addLog({
            agentId: "world",
            agentName: "Pixel3D",
            tool: "interact",
            text: `Pixel3D generation fell back to local mesh: ${
              error instanceof Error ? sanitizeLogText(error.message) : "unknown error"
            }`,
          });
          publish();
        })
        .finally(() => {
          pendingGenerationControllers.delete(thing.id);
        });
    } else if (
      directGenerationAvailable &&
      (generationProvider === "instantmesh-gradio" ||
        generationProvider === "pixal3d-gradio" ||
        generationProvider === "anigen-gradio")
    ) {
      const providerName = generationProviderLabels[generationProvider];
      const generationController = new AbortController();
      pendingGenerationControllers.set(thing.id, generationController);
      addLog({
        agentId: "world",
        agentName: providerName,
        tool: "generate",
        text: `Sending ${thing.kind} to ${providerName}: "${thing.prompt}"`,
      });
      void startDirectInstantMeshGeneration(
        thing,
        generationProvider,
        generationController.signal,
      )
        .then(async (initialResult) => {
          if (destroyed || generationPausedForThing(thing) || !thingById(thing.id)) return;
          thing.pipelineId = initialResult.jobId;
          thing.generationStatus =
            initialResult.status === "queued" ? "queued" : "generating";
          publishGeneratedThing(thing);
          addLog({
            agentId: "world",
            agentName: providerName,
            tool: "generate",
            text:
              initialResult.status === "queued"
                ? `Queued ${thing.kind} model for "${thing.prompt}" (${initialResult.jobId}); waiting for the ${providerName} worker.`
                : `Started ${thing.kind} model for "${thing.prompt}" (${initialResult.jobId})`,
          });
          const result = await waitForDirectGeneration(
            initialResult,
            generationController.signal,
            (status) => {
              if (destroyed || generationPausedForThing(thing) || !thingById(thing.id)) return;
              if (status === "queued" || status === "generating") {
                thing.generationStatus = status;
                addLog({
                  agentId: "world",
                  agentName: providerName,
                  tool: "generate",
                  text: `${providerName} job ${initialResult.jobId} is ${status}.`,
                });
              }
            },
          );
          if (destroyed || generationPausedForThing(thing) || !thingById(thing.id)) return;
          if (!result.modelUrl) {
            throw new Error(`${providerName} completed without a model URL`);
          }
          const resolved = resolveAssetBackedModel(result.modelUrl, result.assetStoreModelId);
          thing.assetStoreModelId = resolved.assetStoreModelId;
          thing.modelUrl = resolved.modelUrl ?? absoluteTellusApiUrl(result.modelUrl);
          thing.generationStatus = "ready";
          addLog({
            agentId: "world",
            agentName: providerName,
            tool: "generate",
            text: `${providerName} used ${result.textImageProvider ?? "image"} source ${result.sourceImageUrl ? absoluteTellusApiUrl(result.sourceImageUrl) : "image"} and saved ${thing.kind} GLB to ${result.storedModelUrl ? absoluteTellusApiUrl(result.storedModelUrl) : thing.modelUrl}; loading it into Tellus.`,
          });
          const model = await loadGeneratedModel(thing.modelUrl, thing, useWebGPU);
          if (destroyed || generationPausedForThing(thing) || !thingById(thing.id)) {
            disposeObject(model);
            return;
          }
          publishGeneratedThing(thing);
          const oldMesh = generatedMeshes.get(thing.id);
          if (oldMesh) {
            stopGeneratedAnimation(thing.id);
            scene.remove(oldMesh);
            disposeObject(oldMesh);
          }
          model.userData.loadedModelUrl = thing.modelUrl;
          generatedMeshes.set(thing.id, model);
          startGeneratedAnimation(thing.id, model);
          scene.add(model);
          syncTransformControls();
          addLog({
            agentId: "world",
            agentName: providerName,
            tool: "interact",
            text: `Loaded ${providerName} GLB into the scene for ${thing.kind}: ${thing.prompt}`,
          });
          publish();
        })
        .catch((error) => {
          if (!thingById(thing.id)) return;
          if (generationPausedForThing(thing) || generationController.signal.aborted) {
            thing.generationStatus = "local";
            showLocalFallbackMesh();
            publishGeneratedThing(thing);
            publish();
            return;
          }
          thing.generationStatus = "failed";
          publishGeneratedThing(thing);
          if (isMissingApiRouteError(error)) {
            directGenerationAvailable = false;
            thing.generationStatus = "local";
            showLocalFallbackMesh();
            publishGeneratedThing(thing);
            addLog({
              agentId: "world",
              agentName: "Tellus",
              tool: "interact",
              text: "External generation API is unavailable on this deployment; using local meshes.",
            });
            publish();
            return;
          }
          addLog({
            agentId: "world",
            agentName: providerName,
            tool: "interact",
            text: `${providerName} generation fell back to local mesh: ${
              error instanceof Error ? sanitizeLogText(error.message) : "unknown error"
            }`,
          });
          publish();
        })
        .finally(() => {
          pendingGenerationControllers.delete(thing.id);
        });
    }
    return thing;
  };

  const addLibraryAsset = (
    model: AssetLibraryModel,
    opts: {
      creatorId?: AgentId | "visitor";
      ownerUserId?: string;
      location?: GenerateRequest["location"];
      scale?: number;
    } = {},
  ): GeneratedThing => {
    const prompt = model.description?.trim() || model.name;
    const creatorId = opts.creatorId ?? "visitor";
    const kind = inferGeneratedKind(prompt, creatorId);
    // Prefer the game-optimized (meshopt-compressed) variant — typically ~80% smaller, same visual
    // quality. The store's game-optimized endpoint safely serves the original GLB when no optimized
    // build exists, so there's no 404 risk and no client-side fallback needed. (MeshoptDecoder is
    // already wired into the GLTF loader.)
    const assetStoreModelId =
      model.assetStoreModelId ??
      (model.source === "asset-library"
        ? model.id
        : model.modelUrl
          ? assetStoreIdFromModelUrl(model.modelUrl) ?? undefined
          : undefined);
    const modelUrl =
      assetStoreModelId
        ? assetStoreGameOptimizedModelUrl(assetStoreModelId)
        : model.modelUrl ??
          tellusAssetLibraryUrl(`/api/assets/model/${encodeURIComponent(model.id)}/game-optimized`);
    const position = chooseLocation({
      prompt,
      creatorId,
      location:
        opts.location ?? {
          x: visitorPosition.x + Math.sin(yaw) * 4,
          y: 0,
          z: visitorPosition.z + Math.cos(yaw) * 4,
        },
    });
    const thing: GeneratedThing = {
      id: makeId(kind),
      kind,
      prompt: model.name,
      creatorId,
      ownerUserId: opts.ownerUserId ?? (creatorId === "visitor" ? userId : undefined),
      position,
      rotationY: 0,
      scale: opts.scale ?? defaultScaleForRealisticKind(kind, prompt),
      color: kindColor(kind, prompt),
      assetStoreModelId,
      modelUrl,
      generationStatus: "ready",
    };
    generated.push(thing);
    const mesh = createGenerationSwirl(thing);
    generatedMeshes.set(thing.id, mesh);
    scene.add(mesh);
    const previousSelectedId = selectedThingId;
    selectedThingId = thing.id;
    reevaluateInstancingForSelection(previousSelectedId, selectedThingId);
    syncTransformControls();
    addLog({
      agentId: creatorId,
      agentName: displayNameForVisitor(String(creatorId)),
      tool: "generate",
      text: `added ${model.source === "generated" ? "generated" : "library"} asset: ${model.name}`,
    });
    publishGeneratedThing(thing);
    publish();
    void loadGeneratedModel(modelUrl, thing, useWebGPU)
      .then((modelObject) => {
        if (destroyed) return;
        const oldMesh = generatedMeshes.get(thing.id);
        if (oldMesh) {
          stopGeneratedAnimation(thing.id);
          scene.remove(oldMesh);
          disposeObject(oldMesh);
        }
        modelObject.userData.loadedModelUrl = modelUrl;
        generatedMeshes.set(thing.id, modelObject);
        startGeneratedAnimation(thing.id, modelObject); // VRM idle / embedded clip starts looping
        scene.add(modelObject);
        syncTransformControls();
        publish();
      })
      .catch((error) => {
        transientModelLoadFailures.set(thing.id, (transientModelLoadFailures.get(thing.id) ?? 0) + 1);
        showTransientGeneratedLoadFailure(thing, error);
        scheduleTransientModelRetry(thing.id, modelUrl);
        syncTransformControls();
        publish();
        addLog({
          agentId: "world",
          agentName: "Tellus",
          tool: "generate",
          text: `Library asset load will retry: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        });
    });
    return thing;
  };

  const scatterProceduralAsset = (archetypeId: string, count?: number): GeneratedThing[] => {
    const arch = PROCEDURAL_CATALOG.find((item) => item.id === archetypeId);
    if (!arch) return [];
    const rng = Math.random;
    const isTree = arch.kind === "tree";
    const proceduralScale = (variation = 1) =>
      defaultScaleForRealisticKind(arch.kind, arch.label) * (isTree ? 1.48 : 1) * variation;
    const total = clamp(
      Math.round(count ?? (isTree ? 5 : arch.kind === "flower" ? 14 : 10)),
      1,
      isTree ? 9 : 24,
    );
    const radius = isTree ? 24 : 12;
    const placed: GeneratedThing[] = [];
    for (let i = 0; i < total; i++) {
      const seed = (rng() * 0xffffffff) >>> 0;
      const angle = rng() * Math.PI * 2;
      const distance = (isTree ? 7 : 3) + Math.sqrt(rng()) * radius;
      const location = {
        x: visitorPosition.x + Math.sin(angle) * distance,
        y: 0,
        z: visitorPosition.z + Math.cos(angle) * distance,
      };
      placed.push(
        addLibraryAsset(
          {
            id: `proc-${arch.id}-${seed.toString(16)}`,
            name: arch.label,
            description: arch.kind === "tree" ? `${arch.label} tree` : arch.label,
            modelUrl: makeProceduralModelUrl(arch.id, seed),
            source: "generated",
          },
          {
            location,
            scale: proceduralScale(0.82 + rng() * 0.42),
          },
        ),
      );
    }
    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "generate",
      text: `scattered ${placed.length} ${arch.label}`,
    });
    publish();
    return placed;
  };

  const interact = (request: InteractRequest): TellusLog => {
    const target = generated.find((thing) => thing.id === request.targetId);
    return addLog({
      agentId: request.actorId,
      agentName: "Visitor",
      tool: "interact",
      text: `Visitor interacts with ${target?.kind ?? "the world"}: ${request.intent}`,
    });
  };

  const submitVisitorPrompt = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase().startsWith("ask ") && generated.length > 0) {
      interact({
        targetId: generated[generated.length - 1].id,
        intent: trimmed,
        actorId: "visitor",
      });
      return;
    }
    generate({
      prompt: trimmed,
      location: {
        x: visitorPosition.x + Math.sin(yaw) * 4,
        y: 0,
        z: visitorPosition.z + Math.cos(yaw) * 4,
      },
      creatorId: "visitor",
      ownerUserId: userId,
    });
  };

  const setGenerationProvider = (provider: GenerationProvider) => {
    if (runtimeConfig.generationProvider === provider) return;
    abortPendingGeneration();
    for (const thing of generated) {
      if (
        thing.generationStatus === "queued" ||
        thing.generationStatus === "generating"
      ) {
        cancelDirectGeneration(thing.pipelineId);
        thing.generationStatus = "local";
        thing.pipelineId = undefined;
        publishGeneratedThing(thing);
      }
    }
    runtimeConfig.generationProvider = provider;
    addLog({
      agentId: "world",
      agentName: "Tellus",
      tool: "interact",
      text: `Generation pipeline set to ${generationProviderLabels[provider]}.`,
    });
    publish();
  };

  const setPlayerGenerationProvider = (provider: RoleGenerationProvider) => {
    if (runtimeConfig.playerGenerationProvider === provider) return;
    runtimeConfig.playerGenerationProvider = provider;
    addLog({
      agentId: "world",
      agentName: "Tellus",
      tool: "interact",
      text: `Player generation set to ${generationProviderLabels[provider]}.`,
    });
    publish();
  };

  const setAgentGenerationProvider = (provider: RoleGenerationProvider) => {
    if (runtimeConfig.agentGenerationProvider === provider) return;
    runtimeConfig.agentGenerationProvider = provider;
    addLog({
      agentId: "world",
      agentName: "Tellus",
      tool: "interact",
      text: `Agent generation set to ${generationProviderLabels[provider]}.`,
    });
    publish();
  };

  const setInstantMeshTarget = (target: InstantMeshTarget) => {
    if (runtimeConfig.instantMeshTarget === target) return;
    runtimeConfig.instantMeshTarget = target;
    addLog({
      agentId: "world",
      agentName: "Tellus",
      tool: "interact",
      text: `InstantMesh target set to ${instantMeshTargetLabels[target]}.`,
    });
    publish();
  };

  const resize = () => {
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer?.setSize(width, height, false);
  };

  // ── Player physics: jump, fall, and obstacle pushout (trees + large placed things) ──
  let playerVy = 0;
  let playerAirborne = false;
  // Free-fly (toggle with F): ignore gravity, hold Space to ascend / C to descend. Also powers air-mount
  // vertical control. MAX_ALTITUDE is a generous ceiling for surveying large chunked worlds from above.
  let flying = false;
  const FLY_VERTICAL_SPEED = 16;
  const MAX_ALTITUDE = 260;
  // Republish (throttled) when the player turns in place so the minimap view-cone tracks facing — yaw
  // changes from camera drag don't otherwise trigger a snapshot.
  let lastConeYaw = 0;
  let lastConePublishMs = 0;
  // Accelerating run: hold a movement key and speed ramps up EXPONENTIALLY after a short grace — normal
  // walk for ~2s, then "quicker and quicker" up to a cap — so crossing a big chunked world to test
  // streaming is fast. Resets the instant movement stops. Tunables: grace before ramp, exp base/second,
  // and the multiplier cap. RUN_EXP_BASE^heldS reaches the 6× cap in ~3.5s of sustained running.
  let moveHoldStartMs = 0;
  let mountedAnimationThingId: string | undefined;
  let mountedAnimationMode: GeneratedMotionMode | undefined;
  const RUN_GRACE_MS = 2000;
  const RUN_EXP_BASE = 1.7; // exponential growth per second past the grace
  const RUN_MAX_MULT = 6; // top speed = 6× walk
  const MOUNT_SPEED_MULT = 4.2;
  const runSpeedMultiplier = (nowMs: number): number => {
    if (moveHoldStartMs === 0) return 1;
    const heldS = (nowMs - moveHoldStartMs - RUN_GRACE_MS) / 1000;
    if (heldS <= 0) return 1;
    return Math.min(RUN_MAX_MULT, Math.pow(RUN_EXP_BASE, heldS));
  };
  let obstacleCache: ObstacleCircle[] = [];
  let obstacleCacheAt = 0;
  let rapierSolidsCacheAt = 0;
  const riderOffsetCache = new Map<string, Vec3>();
  const riderPositionForThing = (thing: GeneratedThing): Vec3 => {
    const mesh = generatedMeshes.get(thing.id);
    if (mesh) {
      const key = `${thing.id}:${thing.modelUrl ?? ""}:${thing.scale.toFixed(2)}`;
      let offset = riderOffsetCache.get(key);
      if (!offset) {
        const box = measureModelBounds(mesh);
        if (!box.isEmpty() && Number.isFinite(box.max.y)) {
          const center = box.getCenter(new THREE.Vector3());
          offset = {
            x: center.x - thing.position.x,
            y: 0,
            z: center.z - thing.position.z,
          };
          riderOffsetCache.set(key, offset);
          if (riderOffsetCache.size > 200) riderOffsetCache.clear();
        }
      }
      if (offset) {
        return seatPositionForWorldThing(
          thing,
          runtimeProfileForThing(thing, { mounted: true }),
          offset,
        );
      }
    }
    return seatPositionForWorldThing(thing, runtimeProfileForThing(thing, { mounted: true }));
  };
  const solidForThing = (thing: GeneratedThing): RapierSolid | null => {
    if (thing.id === sailingThingId || ambientPhysics.has(thing.id)) return null;
    if (thing.petOwnerId) return null;
    if (thing.id === draggingThingId) return null;
    const profile = runtimeProfileForThing(thing);
    if (
      !profile.dimensions ||
      profile.dimensions.height < 1.4 ||
      profile.dimensions.radius < 0.55
    ) {
      return null;
    }
    if (thing.position.y > visitorPosition.y + 2.2) return null;
    return {
      id: thing.id,
      x: thing.position.x,
      y: thing.position.y,
      z: thing.position.z,
      radius: profile.collisionRadius,
      height: profile.collisionHeight,
    };
  };
  const syncRapierSolids = (force = false) => {
    if (!rapierPhysics) return;
    const nowMs = performance.now();
    if (!force && nowMs - rapierSolidsCacheAt < 500) return;
    rapierSolidsCacheAt = nowMs;
    const solids: RapierSolid[] = [];
    const maxSolidDistanceSq = 96 * 96;
    for (const thing of generated) {
      if (
        (thing.position.x - visitorPosition.x) ** 2 +
          (thing.position.z - visitorPosition.z) ** 2 >
        maxSolidDistanceSq
      ) {
        continue;
      }
      const solid = solidForThing(thing);
      if (solid) solids.push(solid);
      if (solids.length >= 96) break;
    }
    rapierPhysics.syncSolids(solids);
  };
  const currentObstacles = (): ObstacleCircle[] => {
    const nowMs = performance.now();
    if (nowMs - obstacleCacheAt > 500) {
      obstacleCacheAt = nowMs;
      const list: ObstacleCircle[] = [...vegetation.getTreeColliders()];
      for (const thing of generated) {
        // Pass through: the vehicle you're riding, ambient-physics props (their own collision),
        // and the thing you're actively dragging (else it shoves you around as you place it).
        if (thing.id === sailingThingId || ambientPhysics.has(thing.id)) continue;
        if (thing.petOwnerId) continue;
        if (thing.id === draggingThingId) continue;
        const fp = thingFootprint(thing);
        // Skip tiny/flat items you should be able to walk over (rugs, coins, low debris).
        if (!fp || fp.height < 1.4 || fp.radius < 0.55) continue;
        // only solid when the player can actually run into it (not lifted into the sky)
        if (thing.position.y > visitorPosition.y + 2.2) continue;
        const isProceduralBuilding =
          Boolean(parseProceduralModelUrl(thing.modelUrl ?? "")?.building);
        list.push({
          x: thing.position.x,
          z: thing.position.z,
          // Solid radius scales with the model's footprint (capped so huge props stay passable
          // around the edges); the 0.7 factor lets you brush past rather than bumping a fat box.
          r: isProceduralBuilding
            ? clamp(fp.radius * 0.82, 1.2, 14)
            : clamp(fp.radius * 0.7, 0.55, 2.6),
        });
      }
      obstacleCache = list;
    }
    return obstacleCache;
  };

  // Bounded auto-retry for models whose textures failed during a load burst (KTX2 contention):
  // the loader left them uncached + marked, so a re-load fully refetches. Max 2 attempts per url.
  const textureRetryCounts = new Map<string, number>();
  const textureRetryTimer = window.setInterval(() => {
    if (destroyed || textureFailedModelUrls.size === 0) return;
    for (const thing of generated) {
      if (!thing.modelUrl || !textureFailedModelUrls.has(thing.modelUrl)) continue;
      const tries = textureRetryCounts.get(thing.modelUrl) ?? 0;
      if (tries >= 2) continue;
      textureRetryCounts.set(thing.modelUrl, tries + 1);
      textureFailedModelUrls.delete(thing.modelUrl);
      const mesh = generatedMeshes.get(thing.id);
      if (mesh) mesh.userData.loadedModelUrl = undefined; // force the reload path
      loadRemoteGeneratedModel(thing);
      break; // one per sweep — keep retries gentle
    }
  }, 12_000);

  const moveVisitor = (delta: number) => {
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const movement = new THREE.Vector3();
    if (keys.has("w") || keys.has("arrowup")) movement.add(forward);
    if (keys.has("s") || keys.has("arrowdown")) movement.sub(forward);
    if (keys.has("a") || keys.has("arrowright")) movement.add(right);
    if (keys.has("d") || keys.has("arrowleft")) movement.sub(right);
    const hasInput = movement.lengthSq() > 0;
    const ascend = keys.has(" ");
    const descend = keys.has("c") || keys.has("shift");
    const verticalInput = ascend || descend;
    // Jump only in NORMAL mode; in fly mode or on an air mount, Space = ascend (handled below).
    if (!flying && !sailingThingId && ascend && !playerAirborne) {
      playerVy = 8.6;
      playerAirborne = true;
    }
    // Accelerating run: start/extend the hold while moving, reset it the moment input stops.
    if (hasInput) {
      if (moveHoldStartMs === 0) moveHoldStartMs = performance.now();
    } else {
      moveHoldStartMs = 0;
    }
    if (!hasInput && !playerAirborne && !flying && sailingThingId && !verticalInput) {
      const boat = thingById(sailingThingId);
      const mountedMesh = boat ? generatedMeshes.get(boat.id) : undefined;
      if (boat && mountedMesh && mountedMesh.userData.loadedModelUrl === boat.modelUrl && isMountThing(boat)) {
        uninstanceThing(boat.id);
        mountedMesh.visible = true;
        updateMountedAnimation(boat, false);
      }
      return;
    }
    // Proceed if there's horizontal input, we're mid-air, free-flying, or giving vertical input on a mount.
    if (!hasInput && !playerAirborne && !flying && !(sailingThingId && verticalInput)) return;
    const nowMs = performance.now();
    const speedMultiplier = runSpeedMultiplier(nowMs);
    if (hasInput) {
      const speed = scaledPlayerSpeed() *
        speedMultiplier *
        (sailingThingId ? MOUNT_SPEED_MULT : 1);
      movement.normalize().multiplyScalar(speed * delta);
    }
    if (sailingThingId) {
      playerAirborne = false;
      playerVy = 0;
      const boat = thingById(sailingThingId);
      if (!boat) {
        sailingThingId = undefined;
        mountedAnimationThingId = undefined;
        mountedAnimationMode = undefined;
        return;
      }
      const mode = vehicleMode(boat);
      const mountIsRunning = hasInput && speedMultiplier > 1.35;
      if (mode === "air") {
        // Air mount: horizontal via airPosition (keeps world-bounds clamping), vertical via Space/C with a
        // high ceiling — no longer pinned to a fixed +12 altitude.
        const horiz = airPosition(boat.position.x + movement.x, boat.position.z + movement.z);
        let y = boat.position.y;
        if (ascend) y += FLY_VERTICAL_SPEED * delta;
        if (descend) y -= FLY_VERTICAL_SPEED * delta;
        const floor = (groundHeightAt(horiz.x, horiz.z) ?? SEA_LEVEL) + 2;
        boat.position = { x: horiz.x, y: clamp(y, floor, MAX_ALTITUDE), z: horiz.z };
      } else {
        if (!hasInput) return;
        boat.position = movedVehiclePosition(
          boat,
          boat.position.x + movement.x,
          boat.position.z + movement.z,
          boat.position,
        );
      }
      if (movement.lengthSq() > 0.001) {
        boat.rotationY = Math.atan2(movement.x, movement.z);
      }
      const mountedMesh = generatedMeshes.get(boat.id);
      if (mountedMesh && mountedMesh.userData.loadedModelUrl === boat.modelUrl && isMountThing(boat)) {
        uninstanceThing(boat.id);
        mountedMesh.visible = true;
      }
      updateMountedAnimation(boat, hasInput || (mode === "air" && verticalInput), mountIsRunning);
      updateThingMeshPosition(boat);
      visitorPosition = riderPositionForThing(boat);
      sendPresenceUpdate();
      return;
    }
    // Free-fly (on foot): no gravity; move horizontally + ascend/descend, clamped above ground to the ceiling.
    if (flying) {
      const nx = visitorPosition.x + movement.x;
      const nz = visitorPosition.z + movement.z;
      let ny = visitorPosition.y;
      if (ascend) ny += FLY_VERTICAL_SPEED * delta;
      if (descend) ny -= FLY_VERTICAL_SPEED * delta;
      const floor = groundHeightAt(nx, nz) ?? SEA_LEVEL;
      visitorPosition = { x: nx, y: clamp(ny, floor, MAX_ALTITUDE), z: nz };
      sendPresenceUpdate();
      return;
    }
    const desiredX = visitorPosition.x + movement.x;
    const desiredZ = visitorPosition.z + movement.z;
    // ── Interior full-3D path ───────────────────────────────────────────────────────────────────
    // Inside a room the floor/walls/stairs are real Rapier trimesh statics. Route XZ AND a
    // gravity-integrated Y through movePlayer3D so the kinematic controller does vertical floor/stair
    // contact (autostep + snap-to-ground) and blocks walls/ceilings — instead of the flat-ground
    // grounding the outdoor path uses. Jump (playerVy set above) is honoured through the same Y delta.
    if (rapierPhysics && interiorObject && rapierPhysics.hasStatics()) {
      // Integrate gravity each frame; when grounded the controller zeroes the downward move, so we
      // keep a small constant downward bias (never positive unless jumping) to stay glued to stairs.
      playerVy = playerAirborne ? playerVy - 24 * delta : Math.min(playerVy, 0) - 24 * delta;
      const desiredY = visitorPosition.y + playerVy * delta;
      const moved = rapierPhysics.movePlayer3D(visitorPosition, {
        x: desiredX,
        y: desiredY,
        z: desiredZ,
      });
      if (moved.grounded) {
        playerAirborne = false;
        if (playerVy < 0) playerVy = 0; // landed — cancel accumulated fall speed
      } else {
        playerAirborne = true;
      }
      visitorPosition = moved.position;
      sendPresenceUpdate();
      return;
    }
    // Obstacle resolution, then ground/air vertical dynamics. Rapier owns generated-object solids when
    // ready; tree colliders stay on the lightweight vegetation pushout path for now.
    let pushed = { x: desiredX, z: desiredZ };
    if (rapierPhysics) {
      syncRapierSolids();
      const moved = rapierPhysics.movePlayer(visitorPosition, {
        x: desiredX,
        y: visitorPosition.y,
        z: desiredZ,
      });
      pushed = resolveObstacles(
        moved.position.x,
        moved.position.z,
        0.5,
        vegetation.getTreeColliders(),
      );
    } else {
      pushed = resolveObstacles(desiredX, desiredZ, 0.5, currentObstacles());
    }
    const grounded = groundedPosition(pushed.x, pushed.z, visitorPosition);
    if (playerAirborne) {
      playerVy -= 24 * delta;
      const ny = visitorPosition.y + playerVy * delta;
      if (ny <= grounded.y) {
        visitorPosition = grounded;
        playerAirborne = false;
        playerVy = 0;
      } else {
        visitorPosition = { x: grounded.x, y: ny, z: grounded.z };
      }
    } else if (grounded.y < visitorPosition.y - 1.6) {
      // walked off a ledge — fall instead of snapping down
      playerAirborne = true;
      playerVy = 0;
      visitorPosition = { x: grounded.x, y: visitorPosition.y, z: grounded.z };
    } else {
      visitorPosition = grounded;
    }
    sendPresenceUpdate();
  };

  // ── Throw the selected thing: a real ballistic launch that tumbles, bounces off the terrain (or
  // splashes and floats), then settles — the rest pose publishes through the normal upsert path so
  // every client converges. The flight itself streams at ~7 Hz for remote spectators.
  const throwEuler = new THREE.Euler();
  const throwGenerated = (id: string) => {
    const thing = thingById(id);
    if (!thing || thing.id === sailingThingId) return;
    const mesh = generatedMeshes.get(id);
    if (!mesh) return;
    const fp = thingFootprint(thing);
    const radius = THREE.MathUtils.clamp(fp?.radius ?? 0.5, 0.3, 2.4);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = Math.max(dir.y, -0.15);
    dir.normalize();
    const heft = THREE.MathUtils.clamp(15 / (1 + radius * radius), 5, 14);
    const isBalloon = thing.kind === "balloon";
    const velocity = dir
      .multiplyScalar(isBalloon ? heft * 0.7 : heft)
      .add(new THREE.Vector3(0, 3.4, 0));
    const groundHere = groundHeightAt(thing.position.x, thing.position.z) ?? SEA_LEVEL;
    const start = new THREE.Vector3(
      thing.position.x,
      Math.max(thing.position.y, groundHere) + radius + 0.25,
      thing.position.z,
    );
    const angular = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .normalize()
      .multiplyScalar(2 + Math.random() * 4);
    const startQuat = new THREE.Quaternion().setFromEuler(
      throwEuler.set(thing.rotationX ?? 0, thing.rotationY, thing.rotationZ ?? 0),
    );
    let lastFlightPublish = 0;
    const applyPose = (p: THREE.Vector3, q: THREE.Quaternion) => {
      thing.position = { x: p.x, y: p.y, z: p.z };
      throwEuler.setFromQuaternion(q);
      thing.rotationX = throwEuler.x;
      thing.rotationY = throwEuler.y;
      thing.rotationZ = throwEuler.z;
      mesh.position.set(p.x, p.y, p.z);
      mesh.quaternion.copy(q);
      refreshInstancedThingMatrix(thing);
    };
    ambientPhysics.launch({
      id,
      radius,
      position: start,
      quaternion: startQuat,
      velocity,
      angularVelocity: angular,
      gravityScale: isBalloon ? 0.16 : 1,
      restitution: isBalloon ? 0.55 : 0.42,
      onFrame: (p, q) => {
        applyPose(p, q);
        const nowMs = performance.now();
        if (nowMs - lastFlightPublish > 150) {
          lastFlightPublish = nowMs;
          publishGeneratedThing(thing);
        }
        publish();
      },
      onSettle: (p, q) => {
        applyPose(p, q);
        publishGeneratedThing(thing);
        updateSelectionIndicator();
        publish();
      },
    });
  };

  const syncMeshes = (now: number) => {
    visitor.position.set(
      visitorPosition.x,
      visitorPosition.y,
      visitorPosition.z,
    );
    visitor.rotation.y = yaw;
    sendPresenceUpdate();

    const ripples = pondWater.getObjectByName("tellus-pond-ripples");
    if (ripples) {
      ripples.children.forEach((child, index) => {
        const phase = (now * 0.00028 + index * 0.23) % 1;
        const scale = waterFeatureRadius * (0.22 + phase * 0.72);
        child.scale.setScalar(scale);
        const material = (child as THREE.Mesh).material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = Math.max(0, 0.32 * (1 - phase));
        }
      });
    }

    let index = 0;
    for (const mesh of generatedMeshes.values()) {
      if (mesh.userData.generatingSwirl) {
        mesh.rotation.y = now * 0.0022 + index;
        mesh.position.y =
          (typeof mesh.userData.baseY === "number"
            ? mesh.userData.baseY
            : mesh.position.y) + Math.sin(now * 0.004 + index) * 0.045;
        for (const child of mesh.children) {
          if (child.userData.swirlRing !== undefined) {
            child.rotation.z =
              now * (0.0028 + child.userData.swirlRing * 0.0007);
            child.scale.setScalar(
              0.78 +
                child.userData.swirlRing * 0.18 +
                Math.sin(now * 0.004 + child.userData.swirlRing) * 0.045,
            );
          }
          if (child.userData.swirlSpark !== undefined) {
            const angle =
              child.userData.baseAngle +
              now * (0.003 + child.userData.swirlSpark * 0.00018);
            const radius =
              0.44 + Math.sin(now * 0.003 + child.userData.swirlSpark) * 0.16;
            child.position.set(
              Math.cos(angle) * radius,
              0.75 +
                child.userData.swirlSpark * 0.075 +
                Math.sin(now * 0.005 + child.userData.swirlSpark) * 0.12,
              Math.sin(angle) * radius,
            );
          }
        }
      }
      index++;
    }
  };

  const syncExternalSkyboxToCamera = (cameraPosition: THREE.Vector3) => {
    if (!externalSkybox) return;
    const skyboxCenter =
      externalSkybox.userData.skyboxBoundsCenter instanceof THREE.Vector3
        ? externalSkybox.userData.skyboxBoundsCenter
        : new THREE.Vector3();
    const skyboxScale =
      typeof externalSkybox.userData.skyboxBoundsScale === "number"
        ? externalSkybox.userData.skyboxBoundsScale
        : 1;
    const skyboxModelVerticalOffset =
      typeof externalSkybox.userData.skyboxModelVerticalOffset === "number"
        ? externalSkybox.userData.skyboxModelVerticalOffset
        : 0;
    externalSkybox.position.set(
      cameraPosition.x - skyboxCenter.x * skyboxScale,
      cameraPosition.y +
        SKYBOX_VERTICAL_OFFSET +
        skyboxModelVerticalOffset -
        skyboxCenter.y * skyboxScale,
      cameraPosition.z - skyboxCenter.z * skyboxScale,
    );
  };

  const setSkyboxUrl = async (url: string): Promise<string | null> => {
    const requestedUrl = url.trim();
    if (requestedUrl && requestedUrl === activeSkyboxUrl) return activeSkyboxUrl;

    const seq = ++skyboxLoadSeq;
    const skyboxResult = await loadSkyboxModel(requestedUrl);
    if (!skyboxResult || destroyed || seq !== skyboxLoadSeq) return null;

    if (fallbackSky.parent) {
      scene.remove(fallbackSky);
      if (fallbackSky.material instanceof THREE.MeshBasicMaterial) {
        skyboxTintMaterials.delete(fallbackSky.material);
      }
      fallbackSky.geometry.dispose();
      disposeMaterial(fallbackSky.material);
    }

    if (externalSkybox) {
      for (const material of collectSkyboxTintMaterials(externalSkybox)) {
        skyboxTintMaterials.delete(material);
      }
      scene.remove(externalSkybox);
      disposeObject(externalSkybox);
    }

    activeSkyboxUrl = skyboxResult.url;
    externalSkybox = skyboxResult.model;
    for (const material of collectSkyboxTintMaterials(externalSkybox)) {
      skyboxTintMaterials.add(material);
    }
    scene.add(skyboxResult.model);
    updateDayNightCycle(Date.now());
    syncExternalSkyboxToCamera(camera.position);
    addLog({
      agentId: "world",
      agentName: "Tellus",
      tool: "interact",
      text: `Loaded external skybox: ${skyboxResult.url}`,
    });
    return skyboxResult.url;
  };

  const daylightBackground = new THREE.Color(0xa7c3ef);
  const sunriseBackground = new THREE.Color(0xf5b85f);
  const sunsetBackground = new THREE.Color(0xf08ed8);
  const nightBackground = new THREE.Color(0x8a24d6);
  const daylightSkyboxTint = new THREE.Color(0xffffff);
  const sunriseSkyboxTint = new THREE.Color(0xffc45f);
  const sunsetSkyboxTint = new THREE.Color(0xff83d6);
  const nightSkyboxTint = new THREE.Color(0xff58ff);
  const daylightSun = new THREE.Color(0xffdfb7);
  const duskSun = new THREE.Color(0xffbd5d);
  const nightSun = new THREE.Color(0xad7be7);
  const daylightHemiSky = new THREE.Color(0xb6ccff);
  const duskHemiSky = new THREE.Color(0xffc66d);
  const nightHemiSky = new THREE.Color(0x7542ad);
  const daylightHemiGround = new THREE.Color(0x3d5332);
  const nightHemiGround = new THREE.Color(0x35224f);
  const oceanDay = new THREE.Color(0x49a8d8);
  const oceanDusk = new THREE.Color(0xc49a54);
  const oceanNight = new THREE.Color(0x6b22a8);
  const reflectedSkyColor = new THREE.Color();
  const moonDayTint = new THREE.Color(0xf8f9ff);
  const moonNightTint = new THREE.Color(0xffffff);
  const backgroundColor = new THREE.Color();
  const skyboxTint = new THREE.Color();
  const sunColor = new THREE.Color();
  const hemiSkyColor = new THREE.Color();
  const hemiGroundColor = new THREE.Color();
  const oceanColor = new THREE.Color();
  const moonMaterialColor = new THREE.Color();
  const moonDirection = new THREE.Vector3();
  const moonArcDirection = new THREE.Vector3();

  const currentDayNightPhase = (cycleNow: number) =>
    (runtimeConfig.dayNightStart + cycleNow / runtimeConfig.dayNightCycleMs) % 1;

  const updateDayNightCycle = (cycleNow: number, animationNow = performance.now()) => {
    let phase = currentDayNightPhase(cycleNow);
    if (runtimeConfig.dayNightMode === "day") phase = 0.25;
    if (runtimeConfig.dayNightMode === "night") phase = 0.75;
    if (runtimeConfig.dayNightMode === "golden") phase = 0.53;
    if (runtimeConfig.dayNightMode === "pause") {
      phase = ((runtimeConfig.dayNightStart % 1) + 1) % 1;
    }
    const mood =
      LIGHTING_MOOD_PROFILES[runtimeConfig.lightingMood] ??
      LIGHTING_MOOD_PROFILES.natural;
    const angle = phase * Math.PI * 2;
    const sunHeight = Math.sin(angle);
    const skySunHeight = sunHeight + 0.18;
    const daylight = THREE.MathUtils.smoothstep(skySunHeight, -0.2, 0.32);
    const night = 1 - daylight;
    const twilight =
      clamp(1 - Math.abs(skySunHeight - 0.02) / 0.48, 0, 1) *
      (0.45 + daylight * 0.55);
    const twilightBackground =
      Math.cos(angle) >= 0 ? sunriseBackground : sunsetBackground;
    const twilightSkyboxTint =
      Math.cos(angle) >= 0 ? sunriseSkyboxTint : sunsetSkyboxTint;
    const waterPhaseColor =
      Math.cos(angle) >= 0
        ? sunriseSkyboxTint
        : sunsetSkyboxTint;
    reflectedSkyColor
      .copy(nightSkyboxTint)
      .lerp(daylightBackground, daylight)
      .lerp(waterPhaseColor, twilight * 0.62);
      oceanColor
        .copy(oceanNight)
        .lerp(oceanDay, daylight * 0.28)
        .lerp(reflectedSkyColor, 0.78);

    backgroundColor
      .copy(nightBackground)
      .lerp(daylightBackground, daylight)
      .lerp(twilightBackground, twilight * 0.78);
    if (mood.backgroundTint && mood.backgroundTintStrength) {
      backgroundColor.lerp(mood.backgroundTint, mood.backgroundTintStrength);
    }
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(backgroundColor);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(backgroundColor);
      scene.fog.near = (54 + daylight * 18) * WORLD_SCALE * mood.fogNear;
      scene.fog.far = (176 + daylight * 54) * WORLD_SCALE * mood.fogFar;
    }
    {
      // Environment (ambient PBR reflections) brightens with the day and warms at the golden hours.
      scene.environmentIntensity = (0.16 + daylight * 0.5 + twilight * 0.18) * mood.env;
    }

    skyboxTint
      .copy(nightSkyboxTint)
      .lerp(daylightSkyboxTint, daylight)
      .lerp(twilightSkyboxTint, twilight * 0.62);
    if (mood.skyTint && mood.skyTintStrength) {
      skyboxTint.lerp(mood.skyTint, mood.skyTintStrength);
    }
    for (const material of skyboxTintMaterials) {
      material.color.copy(skyboxTint);
    }

    sun.position.set(Math.cos(angle) * -72, sunHeight * 88, Math.sin(angle) * 58);
    sun.intensity = (0.05 + daylight * 4.15 + twilight * 0.55) * mood.sun;
    sunColor.copy(nightSun).lerp(daylightSun, daylight).lerp(duskSun, twilight);
    if (mood.sunTint && mood.sunTintStrength) {
      sunColor.lerp(mood.sunTint, mood.sunTintStrength);
    }
    sun.color.copy(sunColor);

    moon.position.copy(sun.position).multiplyScalar(-1);
    moon.position.y = Math.max(18, moon.position.y);
    moon.intensity = (0.42 + night * 3.35) * mood.moon;
    if (moonModel) {
      const moonRisePhase = 0.54;
      const moonVisibleDuration = 0.4;
      const moonNightProgress =
        ((phase - moonRisePhase + 1) % 1) / moonVisibleDuration;
      const moonIsInVisibleWindow = moonNightProgress >= 0 && moonNightProgress <= 1;
      const moonArcProgress = clamp(moonNightProgress, 0, 1);
      const moonVisibility =
        (moonIsInVisibleWindow ? 1 : 0) *
        THREE.MathUtils.smoothstep(moonArcProgress, 0.02, 0.16) *
        (1 - THREE.MathUtils.smoothstep(moonArcProgress, 0.86, 0.98));
      const moonArcHeight =
        0.04 + Math.sin(moonArcProgress * Math.PI) * 0.72;
      const baseMoonX = Math.sin(MOON_ARC_AZIMUTH);
      const baseMoonZ = Math.cos(MOON_ARC_AZIMUTH);
      const sideMoonX = Math.cos(MOON_ARC_AZIMUTH);
      const sideMoonZ = -Math.sin(MOON_ARC_AZIMUTH);
      const moonLateral =
        (moonArcProgress - 0.5) * MOON_ARC_LATERAL_SWAY * 2;
      moonArcDirection.set(
        baseMoonX + sideMoonX * moonLateral,
        moonArcHeight,
        baseMoonZ + sideMoonZ * moonLateral,
      );
      moonDirection.copy(moonArcDirection).normalize();
      moonModel.position.copy(camera.position).addScaledVector(
        moonDirection,
        MOON_DISTANCE,
      );
      moonModel.lookAt(camera.position);
      moonModel.rotateY(animationNow * 0.000018);
      moonModel.visible = moonVisibility > 0.01;
      moonMaterialColor.copy(moonDayTint).lerp(moonNightTint, night);
      for (const material of moonMaterials) {
        material.color.copy(moonMaterialColor);
        material.emissive.copy(moonMaterialColor).multiplyScalar(2.2 + night * 1.45);
      }
    }

    hemiSkyColor
      .copy(nightHemiSky)
      .lerp(daylightHemiSky, daylight)
      .lerp(duskHemiSky, twilight * 0.55);
    hemiGroundColor.copy(nightHemiGround).lerp(daylightHemiGround, daylight);
    if (mood.hemiSkyTint && mood.hemiTintStrength) {
      hemiSkyColor.lerp(mood.hemiSkyTint, mood.hemiTintStrength);
    }
    if (mood.hemiGroundTint && mood.hemiTintStrength) {
      hemiGroundColor.lerp(mood.hemiGroundTint, mood.hemiTintStrength);
    }
    hemisphere.color.copy(hemiSkyColor);
    hemisphere.groundColor.copy(hemiGroundColor);
    hemisphere.intensity = (0.82 + daylight * 1.55 + twilight * 0.3) * mood.hemi;

    const oceanMaterial = ocean.material;
    if (oceanMaterial instanceof THREE.MeshBasicMaterial) {
      if (mood.oceanTint && mood.oceanTintStrength) {
        oceanColor.lerp(mood.oceanTint, mood.oceanTintStrength);
      }
      oceanMaterial.color.copy(oceanColor);
      oceanMaterial.opacity = (0.58 + daylight * 0.14) * mood.opacity;
    }
  };

  const updateCamera = () => {
    if (cameraMode === "first") {
      // First person: eye at the local avatar's head (the same POV math the agent viewport uses,
      // but driven by the EXISTING look controls — drag steers yaw/pitch, WASD walks, physics
      // untouched). lookAt direction = yaw around Y with the full pitch range.
      const cosPitch = Math.cos(pitch);
      const eyeHeight = firstPersonEyeHeight();
      camera.position.set(
        visitorPosition.x,
        visitorPosition.y + eyeHeight,
        visitorPosition.z,
      );
      camera.lookAt(
        visitorPosition.x + Math.sin(yaw) * cosPitch,
        visitorPosition.y + eyeHeight + Math.sin(pitch),
        visitorPosition.z + Math.cos(yaw) * cosPitch,
      );
      syncExternalSkyboxToCamera(camera.position);
      return;
    }
    const pilotedThing = sailingThingId ? thingById(sailingThingId) : undefined;
    const pilotedMode = pilotedThing ? vehicleMode(pilotedThing) : null;
    const targetY =
      pilotedMode === "water"
        ? SEA_LEVEL + 4.8
        : pilotedMode === "air"
          ? visitorPosition.y + 1.8
          : visitorPosition.y + 2.7;
    const target = new THREE.Vector3(
      visitorPosition.x,
      targetY,
      visitorPosition.z,
    );
    const skyLookAmount = Math.max(0, pitch + 0.08);
    const cameraPitch = Math.min(pitch, -0.08);
    const lookTarget = target.clone();
    const offset = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(cameraPitch) * -zoom,
      Math.sin(-cameraPitch) * zoom + 2.2,
      Math.cos(yaw) * Math.cos(cameraPitch) * -zoom,
    );
    if (skyLookAmount > 0) {
      lookTarget.y += skyLookAmount * zoom * 2.6;
    }
    camera.position.copy(target).add(offset);
    camera.lookAt(lookTarget);
    syncExternalSkyboxToCamera(camera.position);
  };

  const setAgentViewport = (id: string | null) => {
    agentViewportVisitorId = id && id.trim() ? id.trim() : null;
  };

  // Is that remote-presence avatar actually in the scene right now? (false => the React layer shows
  // the server-held snapshot in the PiP instead of a locally rendered POV).
  const hasVisitorAvatar = (visitorId: string): boolean =>
    remoteVisitorMeshes.has(visitorId.trim());

  // Position povCamera at a remote avatar's head looking along its facing. Shared by the on-screen
  // PiP and the agent-vision capture. Returns false when the avatar isn't present.
  const poseAgentPovCamera = (visitorId: string): boolean => {
    const avatar = remoteVisitorMeshes.get(visitorId);
    if (!avatar) return false;
    avatar.getWorldPosition(povEye);
    // Eye height follows the visitor's avatar scale (presence-fed, lerped on the mesh) so a
    // giant agent's POV sits at its head, not its knees.
    povEye.y += 2.4 * getAvatarUserScale(avatar);
    const facing = avatar.rotation.y;
    povForward.set(Math.sin(facing), 0, Math.cos(facing)).normalize();
    povLookAt.copy(povEye).addScaledVector(povForward, 8).add(POV_LOOK_DROP);
    povCamera.position.copy(povEye);
    povCamera.lookAt(povLookAt);
    povCamera.updateMatrixWorld();
    return true;
  };

  // ── Agent vision capture: render the agent's POV into a small offscreen target and return a JPEG
  // data URL. The owner's client ships this to Hyades so the agent's LLM turn can SEE — no headless
  // browser anywhere. Works on both backends (async readback on WebGPU, sync on WebGL). ──
  // 720p 16:9 — vision models (holo3.1) read a full-size frame fine; the old 256×144 was so small + JPEG-
  // crushed that the model often couldn't make anything out (and reported the frame as "inverted / low-res").
  const AGENT_VIEW_W = 1280;
  const AGENT_VIEW_H = 720;
  let agentViewTarget: THREE.WebGLRenderTarget | null = null;
  let agentViewCanvas: HTMLCanvasElement | null = null;
  let agentViewBusy = false;
  const captureAgentView = async (visitorId: string): Promise<string | null> => {
    if (!renderer || agentViewBusy || destroyed) return null;
    if (!poseAgentPovCamera(visitorId)) return null;
    agentViewBusy = true;
    try {
      agentViewTarget ??= new THREE.WebGLRenderTarget(AGENT_VIEW_W, AGENT_VIEW_H);
      const prevTarget = renderer.getRenderTarget() as THREE.WebGLRenderTarget | null;
      // Celestials follow the player camera; recenter the moon on the POV for this off-screen draw.
      povSkyDelta.copy(povCamera.position).sub(camera.position);
      syncExternalSkyboxToCamera(povCamera.position);
      if (moonModel) moonModel.position.add(povSkyDelta);
      // First-person POV: hide our OWN avatar (body + the presence ring over its head) so the agent doesn't
      // see itself — otherwise the head ring renders as a white band across the top of every captured frame.
      const selfAvatar = remoteVisitorMeshes.get(visitorId);
      const selfWasVisible = selfAvatar?.visible ?? true;
      if (selfAvatar) selfAvatar.visible = false;
      // The agent's OWNER (this local user) must always be visible to the agent, even when the
      // user is in first-person (which hides their own `visitor` mesh globally). Force it visible
      // for this POV render, restore the user's own choice after.
      const userWasVisible = visitor.visible;
      visitor.visible = true;
      try {
        renderer.setRenderTarget(agentViewTarget);
        renderer.render(scene, povCamera);
      } finally {
        renderer.setRenderTarget(prevTarget);
        visitor.visible = userWasVisible;
        if (selfAvatar) selfAvatar.visible = selfWasVisible;
        if (moonModel) moonModel.position.sub(povSkyDelta);
        syncExternalSkyboxToCamera(camera.position);
      }
      const gpuRenderer = renderer as unknown as {
        readRenderTargetPixelsAsync?: (
          rt: THREE.WebGLRenderTarget,
          x: number,
          y: number,
          w: number,
          h: number,
        ) => Promise<Uint8Array | Uint8ClampedArray>;
        readRenderTargetPixels?: (
          rt: THREE.WebGLRenderTarget,
          x: number,
          y: number,
          w: number,
          h: number,
          buffer: Uint8Array,
        ) => void;
      };
      let pixels: Uint8Array | Uint8ClampedArray;
      if (typeof gpuRenderer.readRenderTargetPixelsAsync === "function") {
        pixels = await gpuRenderer.readRenderTargetPixelsAsync(agentViewTarget, 0, 0, AGENT_VIEW_W, AGENT_VIEW_H);
      } else if (typeof gpuRenderer.readRenderTargetPixels === "function") {
        const buf = new Uint8Array(AGENT_VIEW_W * AGENT_VIEW_H * 4);
        gpuRenderer.readRenderTargetPixels(agentViewTarget, 0, 0, AGENT_VIEW_W, AGENT_VIEW_H, buf);
        pixels = buf;
      } else {
        return null;
      }
      agentViewCanvas ??= document.createElement("canvas");
      agentViewCanvas.width = AGENT_VIEW_W;
      agentViewCanvas.height = AGENT_VIEW_H;
      const ctx2d = agentViewCanvas.getContext("2d");
      if (!ctx2d) return null;
      const img = ctx2d.createImageData(AGENT_VIEW_W, AGENT_VIEW_H);
      // flip Y (GPU readback is bottom-up)
      for (let y = 0; y < AGENT_VIEW_H; y++) {
        const src = (AGENT_VIEW_H - 1 - y) * AGENT_VIEW_W * 4;
        img.data.set(pixels.subarray(src, src + AGENT_VIEW_W * 4), y * AGENT_VIEW_W * 4);
      }
      ctx2d.putImageData(img, 0, 0);
      return agentViewCanvas.toDataURL("image/jpeg", 0.82);
    } catch {
      return null;
    } finally {
      agentViewBusy = false;
    }
  };

  // Render the agent POV picture-in-picture: a small second view of the scene from the target avatar's head,
  // looking forward along its facing. Runs AFTER the main render; any failure is swallowed so a bad PiP frame
  // never breaks the main loop. Works for both WebGL and WebGPU renderers (both expose scissor/viewport/render).
  //
  // Viewport/scissor units: three.js setViewport/setScissor take LOGICAL (CSS) pixels and multiply
  // by the renderer pixelRatio internally — on BOTH backends (WebGLRenderer multiplies _viewport by
  // _pixelRatio in state.viewport(); the WebGPU common Renderer does the same in _getFrameBufferTarget /
  // renderContext.viewportValue). A previous version multiplied by dpr manually AND restored with
  // renderer.domElement.width/height (PHYSICAL pixels), so on hiDPI screens the "small PiP" was dpr²×
  // too big and the restored main viewport was dpr× too big — the agent POV painted over the whole
  // screen (looked like being switched to 1st person). Save/restore the real state instead.
  const pipSavedViewport = new THREE.Vector4();
  const pipSavedScissor = new THREE.Vector4();
  const pipCanvasSize = new THREE.Vector2();
  const renderAgentViewport = () => {
    if (!renderer || !agentViewportVisitorId) return;
    if (!poseAgentPovCamera(agentViewportVisitorId)) return;
    // First-person: hide our own avatar (incl. the head presence-ring) for the on-screen PiP too.
    const selfAvatar = remoteVisitorMeshes.get(agentViewportVisitorId);
    const selfWasVisible = selfAvatar?.visible ?? true;
    // The agent's OWNER (this local user) must stay visible to the agent in the PiP even when the
    // user is in first-person (which hides their own `visitor` mesh globally). Force visible for
    // this POV render; restored in the finally.
    const userWasVisible = visitor.visible;
    visitor.visible = true;
    let skyShifted = false;
    let viewportSaved = false;
    let savedScissorTest = false;
    try {

      // The skybox dome + moon are repositioned every frame to follow the PLAYER camera
      // (updateCamera / updateDayNightCycle). Without this they stay centered on the player, so the PiP
      // shows the player's sky/moon, not the agent's. Shift them by (POV - player) for this render, then
      // undo it in the finally so the next main-loop frame starts from a clean player-centered state.
      povSkyDelta.copy(povCamera.position).sub(camera.position);
      syncExternalSkyboxToCamera(povCamera.position);
      if (moonModel) moonModel.position.add(povSkyDelta);
      skyShifted = true;

      // Save the current viewport/scissor state (logical pixels) before clobbering it.
      renderer.getViewport(pipSavedViewport);
      renderer.getScissor(pipSavedScissor);
      savedScissorTest = renderer.getScissorTest();
      viewportSaved = true;

      // Logical PiP rect: 220x140, sat clear in the bottom-LEFT corner (the sparse-HUD toolbelt is
      // centered, so this corner is free). NO manual dpr scaling — see the units note above.
      // The y ORIGIN differs by renderer family: classic WebGLRenderer measures viewport/scissor y
      // from the BOTTOM (GL convention); the WebGPU-class renderer measures from the TOP (WebGPU
      // convention — its WebGL2 fallback flips internally via `renderContext.height - height - y`),
      // verified in three 0.183 WebGLBackend.updateViewport/updateScissor.
      const pipW = 220;
      const pipH = 140;
      const marginX = 16;
      const marginY = 96; // from the canvas BOTTOM
      renderer.getSize(pipCanvasSize); // logical CSS pixels on both backends
      const y = useWebGPU ? pipCanvasSize.y - marginY - pipH : marginY;

      renderer.setScissorTest(true);
      renderer.setScissor(marginX, y, pipW, pipH);
      renderer.setViewport(marginX, y, pipW, pipH);
      if (selfAvatar) selfAvatar.visible = false;
      renderer.render(scene, povCamera);
    } catch {
      /* a bad PiP frame must never break the main loop */
    } finally {
      try {
        visitor.visible = userWasVisible;
        if (selfAvatar) selfAvatar.visible = selfWasVisible;
        // Restore the celestials to the player camera (next frame's updateCamera re-syncs the skybox too,
        // but undo the moon shift here so a mid-frame read never sees the POV-shifted position).
        if (skyShifted) {
          if (moonModel) moonModel.position.sub(povSkyDelta);
          syncExternalSkyboxToCamera(camera.position);
        }
        if (viewportSaved) {
          renderer.setScissorTest(savedScissorTest);
          renderer.setScissor(
            pipSavedScissor.x,
            pipSavedScissor.y,
            pipSavedScissor.z,
            pipSavedScissor.w,
          );
          renderer.setViewport(
            pipSavedViewport.x,
            pipSavedViewport.y,
            pipSavedViewport.z,
            pipSavedViewport.w,
          );
        }
      } catch {
        /* ignore restore failures */
      }
    }
  };

  const animate = async () => {
    if (destroyed || !renderer) return;
    const now = performance.now();
    fpsFrames++;
    if (now - fpsSampleStart >= 500) {
      fpsValue = Math.round((fpsFrames * 1000) / (now - fpsSampleStart));
      fpsFrames = 0;
      fpsSampleStart = now;
    }
    const delta = clamp((now - lastTime) / 1000, 0, 0.05);
    lastTime = now;
    tick++;
    // Bake interior trimesh statics once physics finishes its (async) load after a room mounted.
    ensureInteriorStatics();
    moveVisitor(delta);
    updatePortals(now); // TELLUS INFINITY: spin portal rings + auto-enter on walk-into
    if (tilesRenderer) {
      camera.updateMatrixWorld();
      tilesRenderer.update(); // stream the 3D tileset against the current camera
    }
    for (const state of generatedAnimationMixers.values()) {
      state.mixer.update(delta);
    }
    // Placed VRM things: advance the mixer + VRM spring bones (a static idle still needs spring-bone
    // settle; a looping VRMA clip plays here).
    for (const rig of generatedVrmRigs.values()) {
      rig.update(delta);
    }
    // Avatar rigs: local walk/idle/jump from the player position delta + airborne flag; remotes
    // self-derive inside the rig from presence updates. update(dt) advances mixer + VRM.
    const localRig = avatarRigs.get(visitorId);
    if (localRig && delta > 0) {
      const ldx = visitorPosition.x - lastLocalAvatarPos.x;
      const ldz = visitorPosition.z - lastLocalAvatarPos.z;
      localRig.setMoving(Math.hypot(ldx, ldz) / delta);
      localRig.setAirborne(playerAirborne || flying);
    }
    lastLocalAvatarPos.x = visitorPosition.x;
    lastLocalAvatarPos.z = visitorPosition.z;
    for (const rig of avatarRigs.values()) {
      rig.update(delta);
    }
    // Avatar user-scale easing (local slider + remote presence changes); settled groups no-op.
    tickAvatarScale(visitor, delta);
    for (const mesh of remoteVisitorMeshes.values()) {
      tickAvatarScale(mesh, delta);
    }
    syncMeshes(now);
    tickSharedStatic(now);
    updateSelectionIndicator(now);
    syncTransformControls();
    if (externalSkybox) {
      const rotationSpeed =
        typeof externalSkybox.userData.skyboxRotationSpeed === "number"
          ? externalSkybox.userData.skyboxRotationSpeed
          : 0;
      if (rotationSpeed) {
        externalSkybox.rotation.y += delta * rotationSpeed;
      }
    }
    updateCamera();
    updateDayNightCycle(Date.now(), now);
    flushTerrain();
    if (chunkRenderer) {
      chunkRenderer.update(visitorPosition.x, visitorPosition.z); // throttles internally on cell change
      chunkRenderer.flush(); // once/frame rebuild discipline
      // When the active chunk set changes (chunks streamed in/out), re-ground placed assets so they
      // rest flush on the freshly-loaded sculpted surface instead of the flat base they were placed
      // against. Cheap: only runs on a chunk-count change, not every frame.
      const activeChunks = chunkRenderer.stats().active;
      if (activeChunks !== lastActiveChunkCount) {
        lastActiveChunkCount = activeChunks;
        vegetation.notifyTerrainChanged();
        const mounted = sailingThingId ? thingById(sailingThingId) : undefined;
        if (mounted && !isFreeMovingVehicle(mounted) && !isVisiblyOffsetFromLiveGround(mounted)) {
          groundThingToRenderedSurface(mounted);
          updateThingMeshPosition(mounted);
          visitorPosition = riderPositionForThing(mounted);
          publishGeneratedThing(mounted);
          sendPresenceUpdate(true);
        }
        for (const thing of generated) {
          if (isFreeMovingVehicle(thing) || isVisiblyOffsetFromLiveGround(thing)) continue;
          updateThingMeshPosition(thing);
        }
      }
    }
    if (sailingThingId) {
      const mounted = thingById(sailingThingId);
      if (mounted && !isFreeMovingVehicle(mounted)) {
        const liveGround = footprintGroundY(mounted);
        if (liveGround !== null && Number.isFinite(liveGround) && liveGround > mounted.position.y + 0.05) {
          mounted.position = { ...mounted.position, y: liveGround };
          updateThingMeshPosition(mounted);
          visitorPosition = riderPositionForThing(mounted);
          publishGeneratedThing(mounted);
          sendPresenceUpdate(true);
        }
      }
    }
    // Anti-burial: if the live ground has risen above the player — terrain/chunks streamed in after a
    // teleport, or an EvoFlow raster lifted the surface — snap the avatar up so they never stand inside
    // the land (the symptom that used to need a manual jump). Only ever pushes UP; downward transitions
    // (ledges, falls) stay owned by the movement update. Skipped while flying, mid-jump/fall, or riding.
    // Also skipped in interiors: the flat groundedPosition (y=0) would yank a player off a mezzanine
    // or staircase back to the ground floor — interior vertical placement is owned by movePlayer3D.
    const inInterior = Boolean(interiorObject) && Boolean(rapierPhysics?.hasStatics());
    if (!flying && !playerAirborne && !sailingThingId && !inInterior) {
      const grounded = groundedPosition(visitorPosition.x, visitorPosition.z, visitorPosition);
      if (grounded.y > visitorPosition.y + 0.05) {
        visitorPosition = grounded;
        sendPresenceUpdate();
      }
    }
    syncPetsToOwner(delta);
    // Keep the minimap view-cone from driving React during camera-only motion. Presence still carries yaw-ish
    // movement updates when the player actually moves; a future minimap overlay can subscribe outside React.
    if (Math.abs(yaw - lastConeYaw) > 0.02 && now - lastConePublishMs > 1000) {
      lastConeYaw = yaw;
      lastConePublishMs = now;
    }
    flushPublish();
    if (now - lastPresencePruneAt > 5_000) {
      lastPresencePruneAt = now;
      pruneStaleRemotePresence(Date.now());
    }
    vegetation.update(visitorPosition.x, visitorPosition.z, visitorPosition.y, fpsValue, now);
    ambientPhysics.step(delta);
    try {
      renderer.render(scene, camera);
    } catch (error) {
      if (!renderIssueLogged) {
        renderIssueLogged = true;
        addLog({
          agentId: "world",
          agentName: "Tellus",
          tool: "interact",
          text: `WebGPU render failed: ${error instanceof Error ? error.message : "unknown renderer error"}`,
        });
      }
    }
    renderAgentViewport();
    if (!destroyed) {
      animationId = requestAnimationFrame(() => void animate());
    }
  };

  const isTextEditingTarget = (target: EventTarget | null): boolean => {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
    );
  };

  const nudgeSelectedWithArrowKey = (key: string): boolean => {
    if (!selectedThingId) return false;
    if (key === "ArrowUp") {
      moveGenerated(selectedThingId, 0, -2);
      return true;
    }
    if (key === "ArrowDown") {
      moveGenerated(selectedThingId, 0, 2);
      return true;
    }
    if (key === "ArrowLeft") {
      moveGenerated(selectedThingId, -2, 0);
      return true;
    }
    if (key === "ArrowRight") {
      moveGenerated(selectedThingId, 2, 0);
      return true;
    }
    return false;
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (isTextEditingTarget(event.target)) return;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      if (nudgeSelectedWithArrowKey(event.key)) return;
    }
    if (event.key === " ") event.preventDefault(); // jump — don't scroll the page
    if (event.key.toLowerCase() === "g" && selectedThingId) {
      throwGenerated(selectedThingId);
      return;
    }
    if (
      event.key.toLowerCase() === "v" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      setCameraMode(cameraMode === "first" ? "third" : "first");
      return;
    }
    // Backtick (`) toggles the on-screen FPS + vegetation-stats overlay (was a finicky brand triple-click).
    if (event.key === "`" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      window.dispatchEvent(new CustomEvent("tellus:toggle-fps"));
      return;
    }
    // F toggles free-fly (not while riding a vehicle — air mounts have their own ascend/descend).
    if (
      event.key.toLowerCase() === "f" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !sailingThingId
    ) {
      flying = !flying;
      playerVy = 0;
      if (flying) {
        // Entering fly: free-fly owns vertical, so clear any in-progress fall.
        playerAirborne = false;
      } else {
        // Leaving fly while still above the ground would otherwise FREEZE the player mid-air —
        // the movement update early-returns when there's no input, !playerAirborne and !flying, so
        // gravity never runs and they hover until a reload. Hand off to gravity instead: mark them
        // airborne so the next frame falls them to the ground; only settle to grounded if already low.
        const floor = groundHeightAt(visitorPosition.x, visitorPosition.z) ?? SEA_LEVEL;
        playerAirborne = visitorPosition.y > floor + 0.05;
      }
      addLog({ agentId: "visitor", agentName: "Visitor", tool: "interact", text: flying ? "fly mode ON (Space up / C down)" : "fly mode off" });
      return;
    }
    keys.add(event.key.toLowerCase());
  };
  const handleKeyUp = (event: KeyboardEvent) =>
    keys.delete(event.key.toLowerCase());
  const persistPageStateNow = () => {
    publishTerrainStateNow();
    saveTellusStateNow();
  };
  const handlePageHide = () => {
    persistPageStateNow();
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      persistPageStateNow();
    }
  };
  const handlePointerDown = (event: PointerEvent) => {
    if (transformDragging) {
      const controlsStillDragging =
        Boolean((transformControls as (TransformControls & { dragging?: boolean }) | null)?.dragging);
      if (controlsStillDragging) return;
      transformDragging = false;
    }
    // Move mode: every press repositions the target — no picking, no modifier.
    if (moveModeThingId) {
      const thing = thingById(moveModeThingId);
      if (thing && sailingThingId !== moveModeThingId && !ambientPhysics.has(moveModeThingId)) {
        draggingThingId = moveModeThingId;
        dragMoved = false;
        const target = dragGroundTarget(event);
        if (target) {
          moveGenerated(moveModeThingId, target.x - thing.position.x, target.z - thing.position.z);
          dragMoved = true;
        }
        return;
      }
      setMoveMode(null); // target vanished — drop the mode
    }
    // Object grab: Ctrl/Cmd + drag on a mouse picks up ANY object (auto-selecting it); plain drag is
    // ALWAYS camera orbit so the two never fight. Touch (no modifier keys) keeps the old rule: press
    // the already-selected object to drag it.
    const wantsGrab =
      event.pointerType === "touch"
        ? Boolean(selectedThingId)
        : event.ctrlKey || event.metaKey;
    if (wantsGrab) {
      const hit = pickThingIdAtPointer(event);
      const targetId =
        event.pointerType === "touch" ? (hit === selectedThingId ? hit : null) : hit;
      if (targetId && sailingThingId !== targetId && !ambientPhysics.has(targetId)) {
        if (selectedThingId !== targetId) selectGenerated(targetId);
        draggingThingId = targetId;
        dragMoved = false;
        container.style.cursor = "grabbing";
        return; // grabbing an object — not a camera orbit
      }
    }
    isDragging = true;
    pointerTravel = 0;
    pointerX = event.clientX;
    pointerY = event.clientY;
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (draggingThingId) {
      const nowMs = performance.now();
      if (nowMs - lastDragMoveAt < 70) return; // throttle move+publish cadence
      const target = dragGroundTarget(event);
      const thing = thingById(draggingThingId);
      if (!target || !thing) return;
      lastDragMoveAt = nowMs;
      const dx = target.x - thing.position.x;
      const dz = target.z - thing.position.z;
      if (Math.hypot(dx, dz) < 0.05) return;
      moveGenerated(draggingThingId, dx, dz);
      dragMoved = true;
      return;
    }
    if (transformDragging || !isDragging) return;
    const dx = event.clientX - pointerX;
    const dy = event.clientY - pointerY;
    pointerTravel += Math.hypot(dx, dy);
    pointerX = event.clientX;
    pointerY = event.clientY;
    yaw -= dx * 0.006;
    pitch = clamp(pitch - dy * 0.003, -1.05, 1.05);
  };
  const setPointerNdcFromEvent = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  };

  const pickThingIdAtPointer = (event: PointerEvent): string | null => {
    setPointerNdcFromEvent(event);
    raycaster.setFromCamera(pointerNdc, camera);
    // Raycast both the regular meshes (the visible, non-instanced ones) AND the pool InstancedMeshes. Hidden
    // (instanced) regular meshes are skipped automatically by THREE since they're `visible = false`, so a
    // folded thing is only ever hit through its InstancedMesh — no double-selection.
    const targets: THREE.Object3D[] = [...generatedMeshes.values()];
    for (const pool of instancePools.values()) {
      for (const inst of pool.instanced) targets.push(inst);
    }
    const intersections = raycaster.intersectObjects(targets, true);
    for (const intersection of intersections) {
      // Instanced hit: resolve (pool, instanceId) → thing id.
      if (
        intersection.object instanceof THREE.InstancedMesh &&
        typeof intersection.instanceId === "number"
      ) {
        const instancedThingId = resolveInstancedHit(
          intersection.object,
          intersection.instanceId,
        );
        if (instancedThingId) return instancedThingId;
        continue;
      }
      let object: THREE.Object3D | null = intersection.object;
      while (object) {
        const tellusId = object.userData.tellusId;
        if (typeof tellusId === "string") return tellusId;
        object = object.parent;
      }
    }
    return null;
  };

  const selectGeneratedAtPointer = (event: PointerEvent) => {
    selectGenerated(pickThingIdAtPointer(event) ?? undefined);
  };

  // ── Drag-to-move: press on the ALREADY-SELECTED object and drag — it follows the pointer across
  // the terrain (grounded, vehicles keep their water/air rules), publishing as it goes. Dragging
  // anywhere else still orbits the camera, so select first, then grab. ──
  let draggingThingId: string | null = null;
  let dragMoved = false;
  let lastDragMoveAt = 0;
  const dragGroundTarget = (event: PointerEvent): { x: number; z: number } | null => {
    // Analytic ray-march against terrainHeight() — the math, not the (now ~90K-vertex) mesh, so a
    // pointer-move never pays a dense-mesh raycast. Coarse 2u steps then 14 bisection rounds.
    setPointerNdcFromEvent(event);
    raycaster.setFromCamera(pointerNdc, camera);
    const ray = raycaster.ray;
    const maxT = 260 * WORLD_SCALE;
    const sampleGround = (x: number, z: number) => groundHeightAt(x, z) ?? SEA_LEVEL;
    let prevT = 0;
    let prevAbove = ray.origin.y - sampleGround(ray.origin.x, ray.origin.z) > 0;
    for (let t = 2; t <= maxT; t += 2) {
      const x = ray.origin.x + ray.direction.x * t;
      const z = ray.origin.z + ray.direction.z * t;
      const y = ray.origin.y + ray.direction.y * t;
      const ground = sampleGround(x, z);
      const above = y - ground > 0;
      if (prevAbove && !above) {
        let lo = prevT;
        let hi = t;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          const mx = ray.origin.x + ray.direction.x * mid;
          const mz = ray.origin.z + ray.direction.z * mid;
          const my = ray.origin.y + ray.direction.y * mid;
          const mg = sampleGround(mx, mz);
          if (my - mg > 0) lo = mid;
          else hi = mid;
        }
        const ft = (lo + hi) / 2;
        return { x: ray.origin.x + ray.direction.x * ft, z: ray.origin.z + ray.direction.z * ft };
      }
      prevAbove = above;
      prevT = t;
    }
    return null;
  };

  // ── Explicit Move mode: a UI toggle (no modifier needed — works on every platform incl. touch).
  // While active for the selected object, ANY press/drag on the world repositions it (click =
  // teleport there, drag = carry); camera orbit is suspended until the mode is toggled off. ──
  let moveModeThingId: string | null = null;
  const setMoveMode = (id: string | null) => {
    moveModeThingId = id && thingById(id) ? id : null;
    container.style.cursor = moveModeThingId ? "move" : "";
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (draggingThingId) {
      const id = draggingThingId;
      draggingThingId = null;
      container.style.cursor = moveModeThingId ? "move" : "";
      if (dragMoved) {
        const thing = thingById(id);
        if (thing) {
          // final settle: one authoritative grounded publish at the release point
          moveGenerated(id, 0, 0);
          addLog({
            agentId: "visitor",
            agentName: "Visitor",
            tool: "interact",
            text: `moved ${thing.prompt || thing.kind}`,
          });
        }
      }
      return;
    }
    if (transformDragging) {
      transformDragging = false;
      isDragging = false;
      return;
    }
    if (isDragging && pointerTravel < 6) {
      selectGeneratedAtPointer(event);
    }
    isDragging = false;
  };
  const handlePointerCancel = () => {
    transformDragging = false;
    draggingThingId = null;
    isDragging = false;
    container.style.cursor = moveModeThingId ? "move" : "";
  };
  const handleWheel = (event: WheelEvent) => {
    zoom = clamp(zoom + event.deltaY * 0.01, 12, 58);
  };

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  container.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerCancel);
  window.addEventListener("blur", handlePointerCancel);
  container.addEventListener("wheel", handleWheel, { passive: true });

  const init = async () => {
    try {
      if (useWebGPU) {
        renderer = new WebGPURenderer({ antialias: true, alpha: false });
        await renderer.init();
      } else {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        addLog({
          agentId: "world",
          agentName: "Tellus",
          tool: "interact",
          text: "WebGPU is not available in this browser. Using simplified WebGL preview.",
        });
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      // Teach the KTX2 loader this GPU's transcode targets (textured game-optimized GLBs need it).
      configureKtx2Support(renderer);
      container.appendChild(renderer.domElement);
      transformControls = new TransformControls(camera, renderer.domElement);
      transformControlsHelper = transformControls.getHelper();
      transformControls.setMode("rotate");
      transformControls.setSpace("local");
      transformControls.setRotationSnap(THREE.MathUtils.degToRad(5));
      transformControlsHelper.visible = false;
      transformControls.addEventListener("dragging-changed", (event) => {
        transformDragging = Boolean(event.value);
        if (!transformDragging) {
          commitTransformControlRotation();
          updateSelectionIndicator();
        }
      });
      transformControls.addEventListener("objectChange", () => {
        if (!selectedThingId || !transformControlsObject) return;
        const thing = thingById(selectedThingId);
        if (!thing) return;
        thing.rotationX = transformControlsObject.rotation.x;
        thing.rotationY = transformControlsObject.rotation.y;
        thing.rotationZ = transformControlsObject.rotation.z;
        publish();
        updateSelectionIndicator();
      });
      scene.add(transformControlsHelper);
      syncTransformControls();
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(container);
      resize();
      requestAnimationFrame(resize);
      publish();
      void setSkyboxUrl(runtimeConfig.skyboxUrl)
        .catch((error) => {
          addLog({
            agentId: "world",
            agentName: "Tellus",
            tool: "interact",
            text: `Skybox load failed: ${error instanceof Error ? error.message : "unknown skybox error"}`,
          });
        });
      void loadGltfObject(MOON_MODEL_URL)
        .then((moonAsset) => {
          if (destroyed) {
            disposeObject(moonAsset);
            return;
          }
          const preparedMoon = prepareMoonModel(moonAsset);
          moonModel = preparedMoon.model;
          for (const material of preparedMoon.materials) {
            moonMaterials.add(material);
          }
          scene.add(moonModel);
          updateDayNightCycle(Date.now());
          addLog({
            agentId: "world",
            agentName: "Tellus",
            tool: "interact",
            text: "Loaded moon model",
          });
        })
        .catch((error) => {
          addLog({
            agentId: "world",
            agentName: "Tellus",
            tool: "interact",
            text: `Moon model load failed: ${
              error instanceof Error ? error.message : "unknown moon error"
            }`,
          });
        });
      void animate();
    } catch (error) {
      addLog({
        agentId: "world",
        agentName: "Tellus",
        tool: "interact",
        text: `WebGPU initialization failed: ${error instanceof Error ? error.message : "unknown initialization error"}`,
      });
    }
  };

  void init();

  // Stable agent-control hook (window.tellusAgent). An external driver — e.g. a headless-browser agent
  // sidecar — reads world state and takes actions AS THIS PAGE'S VISITOR through the exact same in-world
  // dispatch functions the built-in autonomous agents use, so an embodied external agent and the native
  // agents share one action path. Verbs mirror the built-in agent decision vocabulary.
  const compassDirection = (from: Vec3, to: Vec3): string => {
    const angle = Math.atan2(to.z - from.z, to.x - from.x);
    const directions = ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"];
    const index = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % directions.length;
    return directions[index];
  };
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const assetContextFromUnknown = (value: unknown): AssetSurfaceContext[] => {
    const raw = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/[,/ ]+/)
        : [];
    const allowed = new Set<string>(ASSET_SURFACE_CONTEXTS);
    return raw
      .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
      .filter((entry): entry is AssetSurfaceContext => allowed.has(entry));
  };
  const nearToLocation = (near: unknown): GenerateRequest["location"] =>
    near === "mountain" ? "near-mountain" : near === "pond" ? "near-pond" : near === "agent" ? "near-agent" : { ...visitorPosition };
  const vrmaCategoryIds: readonly VrmaCategoryId[] = ["core", "gesture", "dance", "action", "sport", "locomotion", "pose", "other"];
  const setLocalAvatarSelection = (avatarId: string): boolean => {
    if (avatarId === localAvatarId) return false;
    localAvatarId = avatarId;
    setStoredAvatarId(avatarId);
    applyAvatarTo(visitor, visitorId, avatarId); // local rig rebuilds immediately
    sendPresenceUpdate(true); // broadcast the new pick right away (not on the 300ms cadence)
    return true;
  };
  const nearbyActors = (radius = 36) =>
    Array.from(remoteVisitors.values())
      .map((presence) => {
        const position = presence.position ? { ...presence.position } : undefined;
        const distance = position ? distance2D(visitorPosition, position) : Number.POSITIVE_INFINITY;
        return {
          visitorId: presence.visitorId,
          name: displayNameForVisitor(presence.visitorId),
          kind: actorKindForVisitorId(presence.visitorId),
          distance,
          direction: position ? compassDirection(visitorPosition, position) : undefined,
          position,
          ownerUserId: presence.ownerUserId,
          lastSeenAt: presence.lastSeenAt,
        };
      })
      .filter((actor) => actor.distance <= radius)
      .sort((a, b) => a.distance - b.distance);
  const tellusAgent = {
    getNearby(radius = 30) {
      return generated
        .map((thing) => ({
          id: thing.id,
          kind: thing.kind,
          prompt: thing.prompt,
          status: thing.generationStatus ?? "ready",
          distance: distance2D(visitorPosition, thing.position),
          direction: compassDirection(visitorPosition, thing.position),
          scale: thing.scale,
        }))
        .filter((o) => o.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 12);
    },
    getActors(radius = 80) {
      return nearbyActors(radius).map((actor) => ({
        visitorId: actor.visitorId,
        name: actor.name,
        kind: actor.kind,
        distance: actor.distance,
        direction: actor.direction,
        position: actor.position,
      }));
    },
    getState(radius = 30) {
      const groundHeight = terrainHeight(visitorPosition.x, visitorPosition.z);
      const mapLocation = buildAgentMapLocation({
        worldId: runtimeConfig.worldId,
        position: visitorPosition,
        worldScale: WORLD_SCALE,
        worldRadius: WORLD_RADIUS,
        oceanRadius: OCEAN_RADIUS,
        terrainType: terrainKind(visitorPosition.x, visitorPosition.z, groundHeight),
        terrainHeight: groundHeight,
        pondCenter: { x: waterFeatureCenter.x, y: 0, z: waterFeatureCenter.z },
        chunkedWorldChunks: isChunked ? getChunkedWorldChunks() : null,
        chunkSpan: CHUNK_SPAN,
      });
      return {
        worldId: runtimeConfig.worldId,
        visitorId,
        location: mapLocation,
        mapLocation: mapLocation.mapLocation,
        coordinates: mapLocation.coordinates,
        position: { ...visitorPosition },
        facing: {
          yawRadians: yaw,
          yawDegrees: Math.round((((yaw * 180) / Math.PI) % 360 + 360) % 360),
        },
        terrainType: mapLocation.terrain.type,
        terrainHeight: groundHeight,
        distanceToPond: Math.hypot(visitorPosition.x - waterFeatureCenter.x, visitorPosition.z - waterFeatureCenter.z),
        distanceToSummit: Math.hypot(visitorPosition.x, visitorPosition.z),
        distanceToShore: Math.max(0, WORLD_RADIUS - Math.hypot(visitorPosition.x, visitorPosition.z)),
        nearby: tellusAgent.getNearby(radius),
        actors: nearbyActors(radius),
        dmTargets: nearbyActors(Math.max(radius, 80)).map((actor) => ({
          visitorId: actor.visitorId,
          name: actor.name,
          kind: actor.kind,
          distance: actor.distance,
          direction: actor.direction,
        })),
        chat: nearbyWorldChat(radius),
        nearbyChat: nearbyWorldChat(radius, "nearby"),
        verbs: ["moveSelf", "findReusableAssets", "placeReusableAsset", "listProceduralAssets", "placeProceduralAsset", "scatterProceduralAsset", "generate", "sayChat", "sculptTerrain", "moveAsset", "rotateAsset", "scaleAsset", "moveAssetToWater", "playAnimation", "listAnimations", "listAvatars", "setAvatar", "setAvatarScale"],
        // A small default vocabulary for embodied agents. The full VRMA feed is available by category
        // through listAnimations so agents don't have to reason over hundreds of near-duplicate clips.
        animations: recommendedEmoteClipNamesSync(),
        animationCategories: vrmaCategorySummarySync(),
        avatarId: localAvatarId,
        avatarScale: localAvatarScale,
      };
    },
    listAnimations(opts: { category?: string; limit?: number } = {}) {
      const limit = clamp(num(opts.limit, 24), 1, 100);
      const category = typeof opts.category === "string" ? opts.category.trim().toLowerCase() : "";
      if (vrmaCategoryIds.includes(category as VrmaCategoryId)) {
        return {
          category,
          animations: emoteClipNamesByCategorySync(category as VrmaCategoryId, limit),
          categories: vrmaCategorySummarySync(),
        };
      }
      return {
        animations: recommendedEmoteClipNamesSync(limit),
        categories: vrmaCategorySummarySync(),
      };
    },
    listAvatars() {
      void loadAvatarCatalog();
      return avatarCatalogSync().map((entry) => ({
        id: entry.id,
        label: entry.label,
        kind: entry.kind,
        source: entry.source ?? "built-in",
        selected: entry.id === localAvatarId,
      }));
    },
    listProceduralAssets() {
      return PROCEDURAL_CATALOG.map((entry) => ({
        id: entry.id,
        label: entry.label,
        kind: entry.kind,
        scatterable: true,
      }));
    },
    getChat(opts: { radius?: number; channel?: WorldChatChannel; recipientId?: string } = {}) {
      const messages = nearbyWorldChat(
        typeof opts.radius === "number" ? opts.radius : 36,
        opts.channel === "nearby" || opts.channel === "world" || opts.channel === "dm" ? opts.channel : undefined,
      );
      const recipientId = typeof opts.recipientId === "string" ? opts.recipientId.trim() : "";
      const filtered = recipientId
        ? messages.filter(
            (message) =>
              message.channel === "dm" &&
              (message.recipientId === recipientId || message.visitorId === recipientId),
          )
        : messages;
      return filtered.map(enrichedWorldChatMessage);
    },
    sayChat(text: string, opts: { channel?: WorldChatChannel; recipientId?: string; recipientName?: string } = {}) {
      const channel =
        opts.channel === "nearby" ? "nearby" : opts.channel === "dm" ? "dm" : "world";
      const message = sendWorldChat(
        text,
        channel,
        opts.recipientId,
        opts.recipientName,
        displayNameForVisitor(visitorId),
      );
      return message ? { ok: true, message } : { ok: false, error: "sayChat requires text" };
    },
    async sendAction(verb: string, args: Record<string, unknown> = {}) {
      const a = args ?? {};
      switch (verb) {
        case "moveSelf": {
          const moved = resolveAgentMoveTarget(
            a,
            visitorPosition,
            8,
            (x, z) => groundedPosition(x, z, visitorPosition),
          );
          visitorPosition = moved.position;
          sendPresenceUpdate(true);
          return {
            ok: true,
            worldId: runtimeConfig.worldId,
            position: { ...visitorPosition },
            target: moved.target,
            distanceRemaining: moved.distanceRemaining,
            reached: moved.reached,
          };
        }
        case "findReusableAssets": {
          const prompt = typeof a.prompt === "string" ? a.prompt.trim() : "";
          if (!prompt) return { ok: false, error: "findReusableAssets requires a prompt" };
          const preferredContexts = assetContextFromUnknown(a.contexts ?? a.context);
          const suggestions = await reusableAssetsForPrompt(prompt, clamp(num(a.limit, 5), 1, 8), preferredContexts);
          return {
            ok: true,
            prompt,
            contexts: preferredContexts,
            suggestions: suggestions.map((model) => ({
              id: model.id,
              name: model.name,
              source: model.source ?? "asset-library",
              modelUrl: model.modelUrl,
              score: model.reuseScore,
              reason: model.reuseReason,
            })),
          };
        }
        case "placeReusableAsset": {
          const assetId = typeof a.assetId === "string" ? a.assetId : typeof a.id === "string" ? a.id : "";
          const prompt = typeof a.prompt === "string" ? a.prompt.trim() : "";
          if (!assetId && !prompt) {
            return { ok: false, error: "placeReusableAsset requires an assetId or prompt" };
          }
          const worldThing =
            assetId.startsWith("world:")
              ? thingById(assetId.slice("world:".length))
              : undefined;
          const directModel =
            worldThing?.modelUrl
              ? {
                  id: worldThing.assetStoreModelId ?? assetId,
                  name: worldThing.prompt,
                  description: worldThing.prompt,
                  assetStoreModelId: worldThing.assetStoreModelId,
                  modelUrl: worldThing.modelUrl,
                  source: "generated" as const,
                }
              : assetId && !assetId.startsWith("world:")
                ? {
                    id: assetId,
                    name: prompt || assetId,
                    description: prompt || assetId,
                    source: "asset-library" as const,
                    hasThumbnail: true,
                    hasGameOptimized: true,
                  }
                : undefined;
          const suggestions = !directModel && assetId
            ? await reusableAssetsForPrompt(prompt || assetId, 8, assetContextFromUnknown(a.contexts ?? a.context))
            : !directModel
              ? await reusableAssetsForPrompt(prompt, 1, assetContextFromUnknown(a.contexts ?? a.context))
              : [];
          const model =
            directModel ??
            suggestions.find((candidate) => candidate.id === assetId) ??
            suggestions.find((candidate) => candidate.modelUrl === assetId) ??
            suggestions[0];
          if (!model) return { ok: false, error: "No reusable asset matched" };
          const thing = addLibraryAsset(model, {
            creatorId: visitorId as GenerateRequest["creatorId"],
            location: nearToLocation(a.near),
          });
          return { ok: true, id: thing.id, reused: model.id, name: model.name };
        }
        case "listProceduralAssets":
          return { ok: true, assets: tellusAgent.listProceduralAssets() };
        case "placeProceduralAsset": {
          const archetypeId = typeof a.archetypeId === "string" ? a.archetypeId : typeof a.id === "string" ? a.id : "";
          const arch = PROCEDURAL_CATALOG.find((item) => item.id === archetypeId);
          if (!arch) return { ok: false, error: "placeProceduralAsset requires a valid archetypeId" };
          const seed = typeof a.seed === "number" && Number.isFinite(a.seed)
            ? a.seed >>> 0
            : (Math.random() * 0xffffffff) >>> 0;
          const thing = addLibraryAsset(
            {
              id: `proc-${arch.id}-${seed.toString(16)}`,
              name: arch.label,
              description: arch.kind === "tree" ? `${arch.label} tree` : arch.label,
              modelUrl: makeProceduralModelUrl(arch.id, seed),
              source: "generated",
            },
            {
              creatorId: visitorId as GenerateRequest["creatorId"],
              location: nearToLocation(a.near),
              scale: typeof a.scale === "number"
                ? a.scale
                : defaultScaleForRealisticKind(arch.kind, arch.label) * (arch.kind === "tree" ? 1.48 : 1),
            },
          );
          return { ok: true, id: thing.id, archetypeId: arch.id, label: arch.label };
        }
        case "scatterProceduralAsset": {
          const archetypeId = typeof a.archetypeId === "string" ? a.archetypeId : typeof a.id === "string" ? a.id : "";
          const placed = scatterProceduralAsset(archetypeId, typeof a.count === "number" ? a.count : undefined);
          if (!placed.length) return { ok: false, error: "scatterProceduralAsset requires a valid archetypeId" };
          return {
            ok: true,
            archetypeId,
            count: placed.length,
            ids: placed.map((thing) => thing.id),
          };
        }
        case "generate": {
          if (typeof a.prompt !== "string" || !a.prompt.trim()) return { ok: false, error: "generate requires a prompt" };
          const forceNew = a.force === true || a.generateNew === true || a.variant === true;
          if (!forceNew) {
            const suggestions = await reusableAssetsForPrompt(
              a.prompt.trim(),
              4,
              assetContextFromUnknown(a.contexts ?? a.context),
            );
            if (suggestions.length > 0) {
              return {
                ok: false,
                action: "reuse_suggestions",
                message: "Similar assets already exist. Use placeReusableAsset with an id, or call generate again with generateNew:true or variant:true.",
                suggestions: suggestions.map((model) => ({
                  id: model.id,
                  name: model.name,
                  source: model.source ?? "asset-library",
                  modelUrl: model.modelUrl,
                  score: model.reuseScore,
                  reason: model.reuseReason,
                })),
              };
            }
          }
          const thing = generate({
            prompt: a.prompt.trim(),
            location: nearToLocation(a.near),
            // Attribute creations to THIS visitor (e.g. an embodied agent's id) instead of the generic
            // "visitor", so the world + dashboards credit the actual creator.
            creatorId: visitorId as GenerateRequest["creatorId"],
            scale: typeof a.scale === "number" ? a.scale : undefined,
          });
          return { ok: true, id: thing.id };
        }
        case "sayChat": {
          const text = typeof a.text === "string" ? a.text : typeof a.message === "string" ? a.message : "";
          const channel = a.channel === "nearby" ? "nearby" : a.channel === "dm" ? "dm" : "world";
          const recipientId = typeof a.recipientId === "string" ? a.recipientId : undefined;
          const recipientName = typeof a.recipientName === "string" ? a.recipientName : undefined;
          const message = sendWorldChat(text, channel, recipientId, recipientName, displayNameForVisitor(visitorId));
          return message ? { ok: true, message } : { ok: false, error: "sayChat requires text" };
        }
        case "sculptTerrain": {
          const mode = (typeof a.mode === "string" ? a.mode : typeof a.terrainMode === "string" ? a.terrainMode : "flatten") as TerrainEditMode;
          sculptTerrainAt(mode, visitorPosition, "visitor", "Agent");
          return { ok: true };
        }
        case "moveAsset": {
          if (typeof a.targetId !== "string") return { ok: false, error: "moveAsset requires a targetId" };
          moveGenerated(a.targetId, clamp(num(a.dx, 0), -4, 4), clamp(num(a.dz, 0), -4, 4));
          return { ok: true };
        }
        case "rotateAsset": {
          if (typeof a.targetId !== "string") return { ok: false, error: "rotateAsset requires a targetId" };
          rotateGenerated(a.targetId, clamp(num(a.rotation, Math.PI / 8), -1, 1));
          return { ok: true };
        }
        case "scaleAsset": {
          if (typeof a.targetId !== "string") return { ok: false, error: "scaleAsset requires a targetId" };
          scaleGenerated(a.targetId, clamp(num(a.scaleMultiplier, 1.15), 0.65, 1.5));
          return { ok: true };
        }
        case "moveAssetToWater": {
          if (typeof a.targetId !== "string") return { ok: false, error: "moveAssetToWater requires a targetId" };
          moveGeneratedToWater(a.targetId);
          return { ok: true };
        }
        case "playAnimation": {
          const name = typeof a.name === "string" ? a.name : typeof a.animation === "string" ? a.animation : "";
          if (!name.trim()) return { ok: false, error: "playAnimation requires a name" };
          // Plays on the local avatar immediately and best-effort broadcasts to nearby clients. A name
          // outside the avatar's vocabulary simply doesn't play (matches the rig's ignore-unknown rule).
          playLocalEmote(name);
          return { ok: true };
        }
        case "listAnimations":
          return tellusAgent.listAnimations({
            category: typeof a.category === "string" ? a.category : undefined,
            limit: typeof a.limit === "number" ? a.limit : undefined,
          });
        case "listAvatars":
          return tellusAgent.listAvatars();
        case "setAvatar": {
          const avatarId = typeof a.avatarId === "string" ? a.avatarId : typeof a.id === "string" ? a.id : "";
          if (!avatarId.trim()) return { ok: false, error: "setAvatar requires an avatarId" };
          setLocalAvatarSelection(avatarId.trim());
          return { ok: true, avatarId: localAvatarId };
        }
        case "setAvatarScale": {
          const next = clampAvatarScale(num(a.scale, num(a.avatarScale, localAvatarScale)));
          if (next !== localAvatarScale) {
            localAvatarScale = next;
            setStoredAvatarScale(next);
            setAvatarUserScale(visitor, next);
            sendPresenceUpdate(true);
          }
          return { ok: true, avatarScale: localAvatarScale };
        }
        default:
          return { ok: false, error: `unknown verb: ${verb}` };
      }
    },
  };
  window.tellusAgent = tellusAgent;

  // TELLUS INFINITY: ask the server to enter a portal. The server validates target access and replies with a
  // world.portal.entered frame (handled in the WS dispatch → React switches worlds). Mirrors sendWorldChat's
  // socket-then-REST send.
  const enterPortal = (portalId: string) => {
    const id = portalId.trim();
    if (!id) return;
    if (pendingPortalIds.has(id)) {
      addLog({ agentId: "world", agentName: "Tellus", tool: "interact", text: "Portal is still forming..." });
      publish();
      return;
    }
    // Hyades world grain switches on the BARE action name (TellusWorldGrain.cs case "portal.enter").
    // Only the server→client switch patch is "world.portal.entered". Do NOT prefix outbound actions.
    const frame = { type: "portal.enter", visitorId, portalId: id };
    if (worldSocket?.readyState === WebSocket.OPEN) {
      worldSocket.send(JSON.stringify(frame));
    } else if (tellusWorldBackendAvailable) {
      void fetch(tellusWorldHttpUrl("action"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(frame),
      }).catch(() => undefined);
    }
  };

  // TELLUS INFINITY: create a portal at the player's feet (the server owner-gates + stamps it). A world portal
  // links to another world; a door opens a fresh interior room (procedural — no asset needed). The server
  // rejects if you don't own this world; the rejection surfaces as an action.rejected log line.
  const sendPortalUpsert = (
    portal: WorldPortal,
    options: { pending?: boolean; logText?: string } = {},
  ) => {
    const pending = options.pending ?? true;
    // Bare name — server grain case is "portal.upsert" (see portal.enter note above).
    const frame = { type: "portal.upsert", visitorId, portal };
    if (pending) {
      pendingPortalIds.add(portal.id);
      pendingPortalStartedAt.set(portal.id, performance.now());
      pendingPortalWarnedIds.delete(portal.id);
    } else {
      pendingPortalIds.delete(portal.id);
      pendingPortalStartedAt.delete(portal.id);
      pendingPortalWarnedIds.delete(portal.id);
    }
    const byId = new Map(worldPortals.map((p) => [p.id, p]));
    byId.set(portal.id, portal);
    worldPortals = Array.from(byId.values());
    syncPortalMarkers();
    const text = options.logText ?? (pending ? `Creating portal ${portal.label || portal.target.worldId}...` : "");
    if (text) {
      addLog({
        agentId: "world",
        agentName: "Tellus",
        tool: "interact",
        text,
      });
    }
    publish();
    if (worldSocket?.readyState === WebSocket.OPEN) worldSocket.send(JSON.stringify(frame));
    else if (tellusWorldBackendAvailable)
      void fetch(tellusWorldHttpUrl("action"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(frame) })
        .catch((error) => {
          if (pending) {
            pendingPortalIds.delete(portal.id);
            pendingPortalStartedAt.delete(portal.id);
            pendingPortalWarnedIds.delete(portal.id);
            worldPortals = worldPortals.filter((p) => p.id !== portal.id);
          }
          syncPortalMarkers();
          addLog({
            agentId: "world",
            agentName: "Tellus",
            tool: "interact",
            text: `Portal request failed: ${extractErrorMessage(error)}`,
          });
          publish();
        });
  };
  const sendPortalDelete = (portalId: string) => {
    const id = portalId.trim();
    if (!id) return;
    const existing = worldPortals.find((p) => p.id === id);
    if (!existing) return;
    pendingPortalIds.delete(id);
    pendingPortalStartedAt.delete(id);
    pendingPortalWarnedIds.delete(id);
    pendingDeletedPortals.set(id, existing);
    worldPortals = worldPortals.filter((p) => p.id !== id);
    syncPortalMarkers();
    addLog({
      agentId: "world",
      agentName: "Tellus",
      tool: "interact",
      text: `Deleting portal ${existing.label || existing.target.worldId}...`,
    });
    publish();
    // Bare name — server grain case is "portal.delete" (see portal.enter note above).
    const frame = { type: "portal.delete", visitorId, portalId: id };
    const restore = (error: unknown) => {
      pendingDeletedPortals.delete(id);
      worldPortals = [...worldPortals, existing];
      syncPortalMarkers();
      addLog({
        agentId: "world",
        agentName: "Tellus",
        tool: "interact",
        text: `Portal delete failed: ${extractErrorMessage(String(error))}`,
      });
      publish();
    };
    if (worldSocket?.readyState === WebSocket.OPEN) worldSocket.send(JSON.stringify(frame));
    else if (tellusWorldBackendAvailable)
      void fetch(tellusWorldHttpUrl("action"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(frame),
      }).catch(restore);
  };
  const updatePortalTarget = (portalId: string, targetWorldId: string) => {
    const portal = worldPortals.find((p) => p.id === portalId);
    const target = targetWorldId.trim();
    if (!portal || !target || portal.target.worldId === target) return;
    sendPortalUpsert({
      ...portal,
      label: `${runtimeConfig.worldId} to ${target} portal`.slice(0, 48),
      target: {
        ...portal.target,
        kind: "world",
        worldId: target,
        spawn: undefined,
      },
    });
  };
  const createPortalHere = (targetWorldId: string, label?: string) => {
    const target = targetWorldId.trim();
    if (!target) return;
    const anchor = selectedThingId ? thingById(selectedThingId) : undefined;
    const x = Math.round(anchor?.position.x ?? visitorPosition.x);
    const z = Math.round(anchor?.position.z ?? visitorPosition.z);
    const y = anchor?.position.y ?? groundHeightAt(x, z) ?? visitorPosition.y ?? SEA_LEVEL;
    sendPortalUpsert({
      id: makeId("portal"),
      worldId: runtimeConfig.worldId,
      label: (label || target).slice(0, 48),
      position: { x, y, z },
      radius: 2.2,
      target: { kind: "world", worldId: target },
      ...(anchor ? { anchorThingId: anchor.id } : {}),
    });
  };
  const createDoorHere = (label?: string) => {
    const interiorId = `interior-${runtimeConfig.worldId}-${makeId("room").slice(0, 12)}`;
    const x = Math.round(visitorPosition.x);
    const z = Math.round(visitorPosition.z);
    const y = groundHeightAt(x, z) ?? visitorPosition.y ?? SEA_LEVEL;
    sendPortalUpsert({
      id: makeId("door"),
      worldId: runtimeConfig.worldId,
      label: (label || "Door").slice(0, 48),
      position: { x, y, z },
      radius: 2.2,
      target: {
        kind: "interior",
        worldId: interiorId,
        spawn: { x: 0, y: 0, z: 2 },
        sceneUrl: GENERATED_INTERIOR_SCENE_URL,
      },
    });
  };

  return {
    enterPortal,
    createPortalHere,
    updatePortalTarget,
    deletePortal: sendPortalDelete,
    createDoorHere,
    generate,
    addLibraryAsset,
    scatterProceduralAsset,
    interact,
    selectGenerated,
    goToGenerated,
    moveGenerated,
    warpTo,
    rotateGenerated,
    scaleGenerated,
    resetGeneratedScale,
    liftGenerated,
    groundGenerated,
    deleteGenerated,
    cloneGenerated,
    moveGeneratedToWater,
    boardGenerated,
    disembark,
    setGeneratedPet,
    sculptTerrain,
    importGeneratedThings,
    setSkyboxUrl,
    setWaterSettings,
    setGenerationProvider,
    setPlayerGenerationProvider,
    setAgentGenerationProvider,
    setInstantMeshTarget,
    submitVisitorPrompt,
    sendWorldChat,
    sampleMapPoint,
    snapshot,
    getFps: () => fpsValue,
    setRxEnabled: (on: boolean) => {
      ensureP2pMesh();
      p2pMesh?.setRx(on);
    },
    setTxEnabled: async (on: boolean) => {
      ensureP2pMesh();
      if (!p2pMesh) return false;
      await p2pMesh.setTx(on);
      return p2pMesh.isTx();
    },
    setP2pDevices: async (audioDeviceId?: string, videoDeviceId?: string) => {
      ensureP2pMesh();
      await p2pMesh?.setDevices(audioDeviceId, videoDeviceId);
    },
    setRemoteAudioEnabled,
    setMicEnabled: (on: boolean) => {
      ensureP2pMesh();
      p2pMesh?.setMicEnabled(on);
    },
    getP2pStats: () => latestP2pStats,
    getSelfStream: () => selfStream,
    setAvatarSelection: (avatarId: string) => {
      setLocalAvatarSelection(avatarId);
    },
    getAvatarSelection: () => localAvatarId,
    setAvatarScale: (scale: number) => {
      const next = clampAvatarScale(scale);
      if (next === localAvatarScale) return;
      localAvatarScale = next;
      setStoredAvatarScale(next);
      // VISUAL-ONLY: re-applies the silhouette layout live (no rig rebuild); physics/collision
      // never see the scale. The first-person eye height tracks the lerped current value.
      setAvatarUserScale(visitor, next);
      sendPresenceUpdate(true); // broadcast the new size right away (not on the 300ms cadence)
    },
    getAvatarScale: () => localAvatarScale,
    setCameraMode,
    getCameraMode: () => cameraMode,
    // Chunked-world draw distance: rings of chunks loaded around the player.
    setChunkLoadRadius: (radius: number) => {
      chunkRenderer?.setLoadRadius(radius);
    },
    getGeneratedClipNames: (id: string) => generatedClipNamesForThing(id),
    setGeneratedAnimation: (id: string, animation: string) => {
      const thing = thingById(id);
      if (!thing) return;
      const next = animation.trim();
      if ((thing.animation ?? "") === next) return;
      thing.animation = next || undefined;
      const mesh = generatedMeshes.get(id);
      if (mesh && mesh.userData.loadedModelUrl === thing.modelUrl) {
        startGeneratedAnimation(id, mesh); // restart with the explicit pick (or the heuristic)
      }
      publishGeneratedThing(thing); // full-thing generated.upsert — every client converges
      publish();
    },
    setAgentViewport,
    hasVisitorAvatar,
    captureAgentView,
    throwGenerated,
    setMoveMode,
    getAmbientStats: () => ({
      vegetation: vegetation.stats(),
      chunkTerrain: chunkRenderer?.stats() ?? null,
      physicsBodies: ambientPhysics.activeCount(),
      rapierSolids: rapierPhysics?.stats().solids ?? 0,
    }),
    destroy: () => {
      destroyed = true;
      window.clearInterval(textureRetryTimer);
      if (worldChatPollTimer !== undefined) {
        window.clearInterval(worldChatPollTimer);
      }
      agentViewTarget?.dispose();
      vegetation.dispose();
      chunkRenderer?.dispose();
      onTerrainTemplateLoaded(null);
      setChunkedHeightProvider(null);
      ambientPhysics.dispose();
      rapierPhysics?.dispose();
      rapierPhysics = null;
      // Best-effort "bye" so peers tear down promptly; then own the RTC teardown.
      sendRtcSignal(null, "bye", "{}");
      for (const remoteId of remoteVisitorMeshes.keys()) {
        setPeerVideo(remoteId, null);
      }
      p2pMesh?.destroy();
      p2pMesh = null;
      abortPendingGeneration();
      for (const thing of generated) {
        if (
          thing.generationStatus === "queued" ||
          thing.generationStatus === "generating"
        ) {
          cancelDirectGeneration(thing.pipelineId);
        }
      }
      for (const id of generatedAnimationMixers.keys()) {
        stopGeneratedAnimation(id);
      }
      for (const timer of transientModelRetryTimers.values()) {
        window.clearTimeout(timer);
      }
      transientModelRetryTimers.clear();
      transientModelLoadFailures.clear();
      // Dispose placed VRM rigs (own mixer + skinned scene buffers) and clear the live-mirror slots.
      for (const rig of generatedVrmRigs.values()) {
        rig.dispose();
      }
      generatedVrmRigs.clear();
      resetLiveMirrors();
      // Dispose the static-duplicate instancing pools (InstancedMeshes own their own instanceMatrix buffers;
      // geometry/materials are shared with the GLB cache, so InstancedMesh.dispose() leaves those alone).
      for (const modelUrl of [...instancePools.keys()]) {
        disableInstancePool(modelUrl);
      }
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      container.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("blur", handlePointerCancel);
      container.removeEventListener("wheel", handleWheel);
      worldSocketClosedByDestroy = true;
      if (worldSocketReconnectTimer !== undefined) {
        window.clearTimeout(worldSocketReconnectTimer);
      }
      worldSocket?.close();
      if (tilesRenderer) {
        scene.remove(tilesRenderer.group);
        tilesRenderer.dispose();
        tilesRenderer = null;
      }
      delete window.__tellusAvatarDebug;
      delete window.__tellusWorldDebug;
      delete window.__tellusViewDebug;
      delete window.__tellusThingsDebug;
      delete window.__tellusMirrorDebug;
      delete window.__tellusEnterInterior;
      delete window.__tellusExitInterior;
      delete window.__tellusPerf;
      for (const rig of avatarRigs.values()) {
        rig.dispose();
      }
      avatarRigs.clear();
      for (const mesh of remoteVisitorMeshes.values()) {
        scene.remove(mesh);
      }
      remoteVisitorMeshes.clear();
      remoteVisitors.clear();
      flowerPatchGroup.clear();
      for (const material of flowerSpriteMaterials) {
        material.map?.dispose();
        material.dispose();
      }
      resizeObserver?.disconnect();
      transformControls?.detach();
      transformControls?.dispose();
      renderer?.dispose();
      if (renderer?.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      saveTellusStateNow();
    },
  };
}

function useSpeechInput(onText: (text: string) => void): {
  listening: boolean;
  supported: boolean;
  start: () => void;
} {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const supported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const start = () => {
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition || listening) return;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const result = event.results[0]?.[0]?.transcript;
      if (result) onText(result);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return { listening, supported, start };
}

// ── Avatar "Size" slider mapping ────────────────────────────────────────────────────────────────
// The slider is LOGARITHMIC across [0.1×, 8×] so 0.5× and 2× sit symmetrically around 1× and the
// whole range stays usable; values land snapped to a tidy 2-significant-digit step, with a small
// snap window around exactly 1× (the default must be reachable by drag).
const AVATAR_SCALE_SLIDER_STEPS = 200;
const avatarScaleToSlider = (scale: number): number =>
  Math.round(
    (Math.log(clampAvatarScale(scale) / AVATAR_SCALE_MIN) /
      Math.log(AVATAR_SCALE_MAX / AVATAR_SCALE_MIN)) *
      AVATAR_SCALE_SLIDER_STEPS,
  );
const avatarSliderToScale = (step: number): number => {
  const raw =
    AVATAR_SCALE_MIN *
    Math.pow(AVATAR_SCALE_MAX / AVATAR_SCALE_MIN, step / AVATAR_SCALE_SLIDER_STEPS);
  if (Math.abs(raw - 1) < 0.05) return 1;
  // 2 significant digits keeps the live label stable while dragging (0.25, 1.3, 4.2, …).
  return clampAvatarScale(Number(raw.toPrecision(2)));
};
const avatarScaleLabel = (scale: number): string =>
  `${scale >= 1 ? scale.toFixed(1) : scale.toFixed(2)}×`;

const WATER_STYLE_OPTIONS: Array<{ id: WaterStyle; label: string }> = [
  { id: "lagoon", label: "Lagoon" },
  { id: "clear", label: "Clear" },
  { id: "deep", label: "Deep" },
  { id: "dream", label: "Dream" },
];

interface TerrainTuningDraft {
  elevation: number;
  detail: number;
  ridge: number;
}

const terrainTuningFromLandShape = (landShape?: LandShapeOverrides): TerrainTuningDraft => ({
  elevation: clamp(landShape?.baseOffset ?? 0, -4, 6),
  detail: clamp(landShape?.detail?.amplitude ?? 1, 0, 3),
  ridge: clamp(landShape?.detail?.ridgeAmplitude ?? 0.8, 0, 3),
});

const landShapeFromTerrainTuning = (
  tuning: TerrainTuningDraft,
  existing?: LandShapeOverrides,
): LandShapeOverrides => ({
  ...existing,
  baseOffset: clamp(tuning.elevation, -4, 6),
  detail: {
    ...existing?.detail,
    amplitude: clamp(tuning.detail, 0, 3),
    ridgeAmplitude: clamp(tuning.ridge, 0, 3),
  },
});

// One avatar-picker grid tile: store thumbnail when it loads, else a colored-initial fallback
// ("classic" has no store thumbnail and always renders the initial tile). Click = select.
function App(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<TellusWorldApi | null>(null);
  const [snapshot, setSnapshot] = useState<TellusSnapshot>({
    generated: [],
    logs: [],
    worldChat: [],
    generationProvider: runtimeConfig.generationProvider,
    playerGenerationProvider: runtimeConfig.playerGenerationProvider,
    agentGenerationProvider: runtimeConfig.agentGenerationProvider,
    instantMeshTarget: runtimeConfig.instantMeshTarget,
    userId: tellusUserId(),
    visitorId: tellusVisitorId(),
    remoteVisitors: [],
  });
  const [prompt, setPrompt] = useState("");
  // Live Tellus account (null when logged out). World deletion is ultimately
  // server-gated; the world list carries can_delete for owners/admins.
  const account = useTellusAuth();
  const isAdmin = (account?.role ?? "").toLowerCase() === "admin";
  const [worldChatInput, setWorldChatInput] = useState("");
  const [worldChatChannel, setWorldChatChannel] = useState<WorldChatChannel>("world");
  // Whether the world-chat panel is open. Declared here (early) because the Agent tab now lives
  // inside it and agentPanelOpen is derived from it below.
  const [worldChatOpen, setWorldChatOpen] = useState(false);
  // Active chat-panel tab. The three real channels mirror worldChatChannel; "agent" is a UI-only
  // tab that folds the embodied-agent chat into the same panel (no center-screen floating aside).
  const [chatTab, setChatTab] = useState<WorldChatChannel | "agent">("world");
  const [worldChatDmTarget, setWorldChatDmTarget] = useState<{
    visitorId: string;
    name: string;
    kind: "player" | "agent";
    worldId?: string;
    position?: Vec3;
  } | null>(null);
  const [crossWorldPresence, setCrossWorldPresence] = useState<Record<string, WorldPresence[]>>({});
  const [portalTargetWorldId, setPortalTargetWorldId] = useState("");
  // Hidden FPS overlay: triple-click the "Tellus World Weaver" brand box to toggle.
  const [showFps, setShowFps] = useState(false);
  const [fps, setFps] = useState(0);
  const brandClicksRef = useRef<number[]>([]);
  const handleBrandTripleClick = () => {
    const now = performance.now();
    const recent = brandClicksRef.current.filter((t) => now - t < 600);
    recent.push(now);
    brandClicksRef.current = recent;
    if (recent.length >= 3) {
      brandClicksRef.current = [];
      setShowFps((v) => !v);
    }
  };
  // ── P2P video state (RX inbound default ON, TX local camera default OFF) ──
  const [rxEnabled, setRxEnabled] = useState(true);
  const [txEnabled, setTxEnabled] = useState(false);
  const [audioListen, setAudioListen] = useState(false); // hear peers (RX audio) — off by default (autoplay)
  const [micOn, setMicOn] = useState(true); // your mic (TX audio) active while TX is on
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [selectedCam, setSelectedCam] = useState<string>("");
  const [p2pError, setP2pError] = useState<string | null>(null);
  const [p2pStats, setP2pStats] = useState<MeshStats | null>(null);
  const [ambientStats, setAmbientStats] = useState<ReturnType<
    TellusWorldApi["getAmbientStats"]
  > | null>(null);
  // ── Camera mode (1st/3rd person; the world layer owns the actual camera + persistence) ──
  const [cameraMode, setCameraModeState] = useState<"first" | "third">(() => {
    try {
      return window.localStorage.getItem("tellus.cameraMode") === "first" ? "first" : "third";
    } catch {
      return "third";
    }
  });
  // Track flips that originate inside the world layer (the V shortcut).
  useEffect(() => {
    const onMode = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (detail === "first" || detail === "third") setCameraModeState(detail);
    };
    window.addEventListener("tellus:camera-mode", onMode);
    return () => window.removeEventListener("tellus:camera-mode", onMode);
  }, []);
  // Backtick key → toggle the FPS/veg-stats overlay (bridged from the world-layer keydown handler).
  useEffect(() => {
    const onToggle = () => setShowFps((v) => !v);
    window.addEventListener("tellus:toggle-fps", onToggle);
    return () => window.removeEventListener("tellus:toggle-fps", onToggle);
  }, []);
  // (camera 1st/3rd toggle is handled by the 'V' hotkey in the world layer — no React button anymore)
  // ── Chunk-load radius (chunked-world draw distance; only shown for chunked worlds) ──
  // r rings → (2r+1)² loaded chunks. UI range 1–8 (subset of the renderer's 1–12). Persisted in
  // localStorage; the world closure applies the saved value to the renderer on init.
  const CHUNK_LOAD_RADIUS_MIN = 1;
  const CHUNK_LOAD_RADIUS_MAX = 8;
  const [chunkLoadRadius, setChunkLoadRadiusState] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem("tellus.chunkLoadRadius");
      const n = raw ? Math.round(Number(raw)) : NaN;
      if (Number.isFinite(n)) {
        return Math.min(CHUNK_LOAD_RADIUS_MAX, Math.max(CHUNK_LOAD_RADIUS_MIN, n));
      }
    } catch {
      /* private mode — fall through to the default */
    }
    return 2;
  });
  const onChunkLoadRadius = (raw: number) => {
    const next = Math.min(CHUNK_LOAD_RADIUS_MAX, Math.max(CHUNK_LOAD_RADIUS_MIN, Math.round(raw)));
    setChunkLoadRadiusState(next);
    worldRef.current?.setChunkLoadRadius(next);
    try {
      window.localStorage.setItem("tellus.chunkLoadRadius", String(next));
    } catch {
      /* private mode — the change just won't persist */
    }
  };
  // ── Avatar picker state (catalog selection; "" = deterministic default robot) ──
  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  const [assetPanelTab, setAssetPanelTab] = useState<AssetPanelTab>("building");
  const [runtimeConfigLoaded, setRuntimeConfigLoaded] = useState(false);
  const [avatarCatalog, setAvatarCatalog] = useState<readonly AvatarCatalogEntry[]>(() => avatarCatalogSync());
  const [avatarSelection, setAvatarSelection] = useState<string>(() => storedAvatarId());
  useEffect(() => subscribeAvatarCatalog(() => setAvatarCatalog(avatarCatalogSync())), []);
  useEffect(() => {
    if (!runtimeConfigLoaded || !assetPanelOpen || assetPanelTab !== "avatar") return;
    let cancelled = false;
    loadAvatarCatalog()
      .then((catalog) => {
        if (!cancelled) setAvatarCatalog(catalog);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [runtimeConfigLoaded, assetPanelOpen, assetPanelTab]);
  const onAvatarPick = (entry: AvatarCatalogEntry) => {
    setAvatarSelection(entry.id);
    worldRef.current?.setAvatarSelection(entry.id); // persists + swaps the rig + broadcasts
  };
  // Avatar size (the "Size" slider): visual-only multiplier, persisted + broadcast like the pick.
  const [avatarScale, setAvatarScaleState] = useState<number>(() => storedAvatarScale());
  const onAvatarScale = (scale: number) => {
    const next = clampAvatarScale(scale);
    setAvatarScaleState(next);
    worldRef.current?.setAvatarScale(next); // persists + rescales live + broadcasts
  };
  // ── "Your Agent" panel state (per-user embodied agent on Hyades; self-contained, pure fetch) ──
  // The agent UI now lives as a tab inside the world-chat panel (no floating center aside), so
  // "panel open" is derived: the chat panel is open AND the Agent tab is the active one.
  const agentPanelOpen = worldChatOpen && chatTab === "agent";
  // Collapsible persona/memories/controls strip inside the Agent tab (default folded — chat-first).
  const [agentSettingsOpen, setAgentSettingsOpen] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [agentPersonaDraft, setAgentPersonaDraft] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  // Agent chat thread: the server-side agent's dialog (assistant=dialog, tool=dimmed) merged with the lines
  // YOU send it. Your lines append locally on send; the agent's replies arrive via the transcript poll and
  // are merged (content-deduped) so the thread reads as a conversation. POV viewport toggle alongside.
  const [agentChat, setAgentChat] = useState<AgentChatLine[]>([]);
  const [agentChatInput, setAgentChatInput] = useState("");
  const [agentViewportOn, setAgentViewportOn] = useState(false);
  // Expanded chat: a fullscreen overlay of the same agent thread for comfortable reading/long convos.
  const [chatExpanded, setChatExpanded] = useState(false);
  // Reset-thread escape hatch: two-step inline confirm + which collapsed chip groups are expanded.
  const [agentResetConfirm, setAgentResetConfirm] = useState(false);
  const [expandedChipGroups, setExpandedChipGroups] = useState<Set<string>>(() => new Set());
  // Memories block: collapsed live view vs edit (the persona textarea) vs the edit-history list.
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  const [memoriesEditing, setMemoriesEditing] = useState(false);
  const [memoriesHistoryOpen, setMemoriesHistoryOpen] = useState(false);
  const [memoriesLog, setMemoriesLog] = useState<AgentMemoryEntry[] | null>(null);
  // PiP fallback: when the agent's avatar mesh isn't in the local scene (asleep/remote), the POV
  // viewport shows the latest server-held snapshot instead of a locally rendered view.
  const [agentAvatarPresent, setAgentAvatarPresent] = useState(true);
  const [agentRemoteViewSrc, setAgentRemoteViewSrc] = useState<string | null>(null);
  const [agentRemoteViewFailed, setAgentRemoteViewFailed] = useState(false);
  const agentTranscriptScrollRef = useRef<HTMLDivElement | null>(null);
  const agentChatSeqRef = useRef(0);
  const agentMergedKeysRef = useRef<Set<string>>(new Set());
  const p2pSupported =
    typeof RTCPeerConnection !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  // Themed to the app's gold/green HUD palette (shared by P2P + the agent tab so they match the
  // rest of the app instead of the old off-theme dark-glass/white-border look).
  const p2pSelectStyle: React.CSSProperties = {
    background: "rgb(0 0 0 / 40%)",
    color: "var(--hud-text)",
    border: "1px solid var(--hud-border-soft)",
    borderRadius: 6,
    padding: "4px 6px",
    fontSize: 12,
  };
  const p2pBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "5px 0",
    borderRadius: 6,
    border: active ? "1px solid var(--hud-border)" : "1px solid var(--hud-border-soft)",
    background: active ? "rgb(222 188 86 / 18%)" : "rgb(0 0 0 / 22%)",
    color: active ? "var(--hud-gold-bright)" : "var(--hud-text)",
    fontSize: 12,
    cursor: "pointer",
  });

  const refreshP2pDevices = async () => {
    try {
      const { audioIn, videoIn } = await enumerateMediaDevices();
      setAudioInputs(audioIn);
      setVideoInputs(videoIn);
    } catch {
      /* enumerate can throw before any permission grant — ignore */
    }
  };

  const toggleRx = () => {
    const next = !rxEnabled;
    setRxEnabled(next);
    worldRef.current?.setRxEnabled(next);
  };

  const toggleAudioListen = () => {
    const next = !audioListen;
    setAudioListen(next);
    worldRef.current?.setRemoteAudioEnabled(next); // user gesture → browsers allow unmute
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    worldRef.current?.setMicEnabled(next);
  };

  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const attachSelfPreview = () => {
    const el = selfVideoRef.current;
    if (!el) return;
    const stream = worldRef.current?.getSelfStream() ?? null;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  };

  const toggleTx = async () => {
    const next = !txEnabled;
    setP2pError(null);
    // Optimistic flip; revert on denial. TX-on is the only permission prompt.
    const ok = (await worldRef.current?.setTxEnabled(next)) ?? false;
    if (next && !ok) {
      setTxEnabled(false);
      setP2pError("Camera/mic access denied or unavailable.");
      return;
    }
    setTxEnabled(next && ok);
    attachSelfPreview(); // show (or clear) the local self-view
    if (next && ok) void refreshP2pDevices(); // labels populate after the grant
  };

  const onMicChange = (id: string) => {
    setSelectedMic(id);
    void worldRef.current?.setP2pDevices(id || undefined, selectedCam || undefined).then(attachSelfPreview);
  };
  const onCamChange = (id: string) => {
    setSelectedCam(id);
    void worldRef.current?.setP2pDevices(selectedMic || undefined, id || undefined).then(attachSelfPreview);
  };

  // Sample mesh stats while the social panel OR the debug overlay is open (≈1Hz).
  useEffect(() => {
    if (!worldChatOpen && !showFps) return;
    const id = window.setInterval(() => {
      setP2pStats(worldRef.current?.getP2pStats() ?? null);
      setAmbientStats(worldRef.current?.getAmbientStats() ?? null);
    }, 1000);
    return () => window.clearInterval(id);
  }, [worldChatOpen, showFps]);

  // ── "Your Agent" panel handlers (self-contained; pure fetch against the Hyades world agent API) ──
  const fetchAgentStatus = useCallback(async (signal?: AbortSignal): Promise<AgentStatus | null> => {
    const res = await fetch(tellusAgentUrl("status"), { signal });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as AgentStatus;
  }, []);

  const fetchAgentTranscript = useCallback(
    async (signal?: AbortSignal): Promise<AgentTranscriptMessage[]> => {
      const res = await fetch(tellusAgentUrl("transcript"), { signal });
      if (!res.ok) throw new Error(`transcript ${res.status}`);
      const body = (await res.json()) as AgentTranscriptResponse;
      return Array.isArray(body.messages) ? body.messages : [];
    },
    [],
  );

  const runAgentAction = useCallback(
    async (action: "start" | "stop" | "persona", body?: unknown) => {
      setAgentBusy(true);
      setAgentError(null);
      try {
        const res = await fetch(tellusAgentUrl(action), {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) throw new Error(`${action} failed (${res.status})`);
        const status = (await res.json()) as AgentStatus;
        setAgentStatus(status);
        setAgentPersonaDraft(status.selfSection ?? "");
        return status;
      } catch (err) {
        setAgentError(err instanceof Error ? err.message : `Failed to ${action} agent.`);
        return null;
      } finally {
        setAgentBusy(false);
      }
    },
    [],
  );

  const onAgentStartStop = useCallback(() => {
    void runAgentAction(agentStatus?.optedIn ? "stop" : "start");
  }, [runAgentAction, agentStatus?.optedIn]);

  // Escape hatch for a wedged agent (bad tool loops, polluted context): POST /agent/reset-thread starts a
  // fresh conversation thread server-side — persona/memories survive, the inbox backlog is dropped. On
  // success the LOCAL thread resets too (dedupe keys included, so the empty new transcript merges cleanly)
  // and a one-line system note marks the cut.
  const onAgentResetThread = useCallback(async () => {
    setAgentBusy(true);
    setAgentError(null);
    try {
      const res = await fetch(tellusAgentUrl("reset-thread"), { method: "POST" });
      if (res.status === 404 || res.status === 501) {
        // Mid-rollout: the route lands with hyades 0.5.201 — older silos answer 404/501.
        setAgentError("Thread reset isn't on the server yet — try again in a minute.");
        return;
      }
      if (!res.ok) throw new Error(`reset failed (${res.status})`);
      agentMergedKeysRef.current = new Set();
      setExpandedChipGroups(new Set());
      setAgentChat([{ id: ++agentChatSeqRef.current, who: "system", text: "— thread reset —" }]);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Thread reset failed.");
    } finally {
      setAgentBusy(false);
      setAgentResetConfirm(false);
    }
  }, []);

  const onAgentSavePersona = useCallback(async () => {
    const status = await runAgentAction("persona", { text: agentPersonaDraft, replace: true });
    if (status) setMemoriesEditing(false); // saved — drop back to the live read-only view
  }, [runAgentAction, agentPersonaDraft]);

  // Persona portability: each world has its OWN agent grain; the default persona is what a brand-new
  // world's agent seeds from (server: POST /api/tellus/user/default-persona; the per-world copy is
  // independent afterwards). Saves the per-world persona too so "Set as default" never loses the edit.
  const onAgentSaveDefaultPersona = useCallback(async () => {
    setAgentBusy(true);
    setAgentError(null);
    try {
      await runAgentAction("persona", { text: agentPersonaDraft, replace: true });
      const base = runtimeConfig.worldApiBase || runtimeConfig.apiBase || "";
      const res = await fetch(`${base}/api/tellus/user/default-persona?userId=${encodeURIComponent(tellusUserId())}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: agentPersonaDraft }),
      });
      if (!res.ok) throw new Error(`default persona save failed (${res.status})`);
      setMemoriesEditing(false);
    } catch (error) {
      setAgentError(error instanceof Error ? error.message : "default persona save failed");
    } finally {
      setAgentBusy(false);
    }
  }, [runAgentAction, agentPersonaDraft]);

  // Load the agent's memory: the self-section edit history AND the agent's own `remember` notes.
  const loadMemoriesLog = useCallback(async () => {
    setMemoriesLog(null);
    try {
      const res = await fetch(tellusAgentUrl("memories"));
      if (!res.ok) throw new Error(`memories ${res.status}`);
      const body = (await res.json()) as AgentMemoriesResponse;
      setMemoriesLog(Array.isArray(body.log) ? body.log : Array.isArray(body.entries) ? body.entries : []);
    } catch {
      setMemoriesLog([]); // history is a bonus view — show "no edits" rather than an error
    }
  }, []);

  // Merge the agent's polled transcript into the chat thread. Content-deduped (role|text) so each agent line
  // is appended once; your "you" lines (added on send) stay interleaved in real send/reply order.
  const mergeAgentTranscript = useCallback((messages: AgentTranscriptMessage[]) => {
    const seen = agentMergedKeysRef.current;
    const additions: AgentChatLine[] = [];
    for (const m of messages) {
      const key = `${m.role}|${m.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      additions.push({
        id: ++agentChatSeqRef.current,
        who: m.role === "tool" ? "tool" : m.role === "user" ? "you" : "agent",
        text: m.text,
      });
    }
    if (additions.length) setAgentChat((prev) => [...prev, ...additions]);
  }, []);

  const sendAgentMessage = useCallback(async (rawText: string): Promise<boolean> => {
    const text = rawText.trim();
    if (!text) return false;
    if (!agentStatus?.optedIn) {
      setAgentError("Start your agent before talking to it.");
      return false;
    }
    // Pre-seed the dedup key so the same line coming back from the transcript poll (as a `user` message)
    // doesn't double-add it; on a fresh reload the seen set is empty so the transcript restores it cleanly.
    agentMergedKeysRef.current.add(`user|${text}`);
    setAgentChat((prev) => [...prev, { id: ++agentChatSeqRef.current, who: "you", text }]);
    setAgentError(null);
    try {
      const res = await fetch(tellusAgentUrl("say"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        setAgentError(
          res.status === 409
            ? "Start your agent before talking to it."
            : `Send failed (${res.status})`,
        );
        return false;
      }
      return true;
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Send failed.");
      return false;
    }
  }, [agentStatus?.optedIn]);

  const onAgentSend = useCallback(async () => {
    const sent = await sendAgentMessage(agentChatInput);
    if (sent) setAgentChatInput("");
  }, [agentChatInput, sendAgentMessage]);

  // Poll the agent status every ~3s while the panel is open OR the POV viewport is up (the viewport
  // outlives the panel, and the thinking/sleep state should stay fresh); prime the persona draft on
  // first load.
  useEffect(() => {
    if (!agentPanelOpen && !agentViewportOn) return;
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      try {
        const status = await fetchAgentStatus(controller.signal);
        if (cancelled) return;
        // Seed the textarea from selfSection ONLY on the first load (prev === null), so the 3s poll
        // never clobbers the user's edits — including a deliberately-cleared field.
        setAgentStatus((prev) => {
          if (prev === null) setAgentPersonaDraft(status?.selfSection ?? "");
          return status;
        });
        setAgentError(null);
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        setAgentError(err instanceof Error ? err.message : "Failed to load agent status.");
      }
      // Dialog feed: poll on the same cadence. A transcript failure is non-fatal — keep the last good feed
      // and don't surface an error (status drives the panel's error line).
      try {
        const messages = await fetchAgentTranscript(controller.signal);
        if (cancelled) return;
        // Merge new agent lines into the chat thread (content-deduped — identical polls add nothing, so the
        // feed neither re-renders nor re-scrolls while the agent is idle).
        mergeAgentTranscript(messages);
      } catch {
        /* keep the last thread; status owns the error surface */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [agentPanelOpen, agentViewportOn, fetchAgentStatus, fetchAgentTranscript, mergeAgentTranscript]);

  // The expanded-chat overlay (⤢) only makes sense while the Agent tab is visible. If the chat panel
  // closes or switches tabs, drop the overlay too — otherwise it survives as an orphaned fullscreen
  // modal over the world with the backing panel gone.
  useEffect(() => {
    if (!agentPanelOpen && chatExpanded) setChatExpanded(false);
  }, [agentPanelOpen, chatExpanded]);

  // Render-time projection of the thread: prose + tool chips, with long chip runs collapsed.
  const agentFeed = useMemo(() => buildAgentFeed(agentChat), [agentChat]);
  const toggleChipGroup = useCallback((key: string) => {
    setExpandedChipGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // One agent-thread feed item → JSX. Shared by the compact in-panel chat AND the expanded overlay so both
  // render identically (prose lines, tool chips, collapsible chip groups, system lines).
  const renderAgentFeedItem = (item: (typeof agentFeed)[number]) => {
    if (item.kind === "chip") return <AgentToolChipPill key={item.key} chip={item.chip} />;
    if (item.kind === "chipGroup") {
      const open = expandedChipGroups.has(item.key);
      const toggle = (
        <button
          type="button"
          onClick={() => toggleChipGroup(item.key)}
          style={{ ...agentChipStyle, cursor: "pointer" }}
          title={open ? "Collapse" : "Expand"}
        >
          <span aria-hidden="true">🔧</span>
          <span>
            {item.chips.length} actions {open ? "▾" : "▸"}
          </span>
        </button>
      );
      if (!open) return <React.Fragment key={item.key}>{toggle}</React.Fragment>;
      return (
        <span key={item.key} style={{ display: "flex", flexDirection: "column", gap: 3, flex: "none" }}>
          {toggle}
          {item.chips.map((c) => (
            <AgentToolChipPill key={c.key} chip={c.chip} />
          ))}
        </span>
      );
    }
    if (item.who === "system") {
      return (
        <span key={item.key} style={{ fontSize: 10, opacity: 0.45, fontStyle: "italic", textAlign: "center" }}>
          {item.text}
        </span>
      );
    }
    return (
      <span
        key={item.key}
        style={{
          fontSize: 12,
          color: item.who === "you" ? "#9ec8ff" : "#dfe7d8",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        <b style={{ opacity: 0.7, fontWeight: 600 }}>{item.who === "you" ? "You: " : ""}</b>
        {item.text}
      </span>
    );
  };

  // The "Agent" tab body inside the world-chat panel. Chat-first: the dialog feed + input are always
  // visible; the agent's controls (start/stop, personality, memories, tokens, viewport, reset) live
  // behind a single foldable "Settings" strip so the panel stays small and non-blocking. This replaces
  // the old floating center-screen agent aside — same handlers, same fetch wiring, just relocated.
  const renderAgentTab = () => {
    const optedIn = agentStatus?.optedIn ?? false;
    const running =
      optedIn &&
      ((agentStatus?.ownerPresent ?? false) || (agentStatus?.offlinePersistence ?? false)) &&
      (agentStatus?.enabled ?? false);
    const thinking = optedIn && (agentStatus?.processing ?? false);
    const willWake = optedIn && !(agentStatus?.enabled ?? false) && (agentStatus?.ownerPresent ?? false);
    const statusLabel = !optedIn
      ? "Stopped"
      : thinking
        ? "Thinking…"
        : running
          ? "Running"
          : willWake
            ? "Sleeping (will wake)"
            : "Sleeping";
    const dot = !optedIn ? "#7a8597" : thinking ? "#9ec8ff" : running ? "#6fae46" : "#d8a64a";
    return (
      <div className="agent-tab">
        {/* Status + settings fold toggle */}
        <div className="agent-tab-statusrow">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: 0.9 }}>
            <span
              style={{ width: 8, height: 8, borderRadius: "50%", background: dot, boxShadow: `0 0 6px ${dot}` }}
            />
            {statusLabel}
            {agentStatus?.offlinePersistence && (
              <span
                style={{
                  marginLeft: 2,
                  padding: "1px 6px",
                  borderRadius: 999,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: "#0c1016",
                  background: "linear-gradient(90deg,#f4d06f,#e9a23a)",
                }}
              >
                Premium
              </span>
            )}
          </span>
          <button
            type="button"
            className="agent-tab-fold"
            aria-expanded={agentSettingsOpen}
            onClick={() => setAgentSettingsOpen((open) => !open)}
            title="Agent settings: start/stop, personality, memories, viewport"
          >
            {agentSettingsOpen ? "▾" : "⚙"} Settings
          </button>
        </div>

        {agentSettingsOpen && (
          <div className="agent-tab-settings">
            <span style={{ fontSize: 10, opacity: 0.6 }} title="Each world has its own agent — its memories live in that world.">
              in “{worldDisplayName(canonicalWorldId(agentStatus?.worldId || activeWorldId || runtimeConfig.worldId))}”
            </span>
            {!agentStatus?.offlinePersistence && <PremiumUpsellChip />}
            <button
              type="button"
              disabled={agentBusy}
              onClick={onAgentStartStop}
              style={{
                ...p2pBtnStyle(optedIn),
                flex: "none",
                width: "100%",
                padding: "7px 0",
                opacity: agentBusy ? 0.6 : 1,
                cursor: agentBusy ? "default" : "pointer",
              }}
            >
              {agentBusy ? "…" : optedIn ? "Stop" : "Start my agent"}
            </button>

            {/* Personality & memories (folds within the settings strip) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button
                type="button"
                onClick={() =>
                  setMemoriesOpen((open) => {
                    if (!open) void loadMemoriesLog();
                    return !open;
                  })
                }
                style={{
                  background: "none",
                  border: "none",
                  color: "#dfe7d8",
                  fontSize: 11,
                  opacity: 0.85,
                  textAlign: "left",
                  padding: 0,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {memoriesOpen ? "▾" : "▸"} Personality &amp; memories
                {agentStatus?.memories?.length ? ` (${agentStatus.memories.length})` : ""}
              </button>
              {!memoriesOpen ? (
                <>
                  <pre
                    style={{
                      margin: 0,
                      maxHeight: 64,
                      overflowY: "auto",
                      background: "rgba(0,0,0,0.32)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      fontSize: 11,
                      fontFamily: "inherit",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      opacity: 0.85,
                    }}
                  >
                    {agentStatus?.selfSection?.trim() || "No personality set — click Edit to describe your agent."}
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      setAgentPersonaDraft(agentStatus?.selfSection ?? "");
                      setMemoriesOpen(true);
                      setMemoriesEditing(true);
                    }}
                    style={{ ...p2pBtnStyle(false), alignSelf: "flex-start" }}
                  >
                    Edit personality
                  </button>
                </>
              ) : memoriesEditing ? (
                <>
                  <textarea
                    value={agentPersonaDraft}
                    onChange={(e) => setAgentPersonaDraft(e.target.value)}
                    placeholder="Describe how your agent should behave, what it should remember…"
                    rows={6}
                    style={{
                      background: "rgba(0,0,0,0.4)",
                      color: "#dfe7d8",
                      border: "1px solid rgba(255,255,255,0.16)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      fontSize: 12,
                      resize: "vertical",
                      fontFamily: "inherit",
                    }}
                  />
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      disabled={agentBusy}
                      onClick={() => void onAgentSavePersona()}
                      style={{ ...p2pBtnStyle(true), opacity: agentBusy ? 0.6 : 1, cursor: agentBusy ? "default" : "pointer" }}
                    >
                      {agentBusy ? "…" : "Save"}
                    </button>
                    <button type="button" onClick={() => setMemoriesEditing(false)} style={p2pBtnStyle(false)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={agentBusy}
                      title="Save this text as your default persona — your agent in any NEW world starts with it."
                      onClick={() => void onAgentSaveDefaultPersona()}
                      style={{ ...p2pBtnStyle(false), opacity: agentBusy ? 0.6 : 1 }}
                    >
                      Set as default
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <pre
                    style={{
                      margin: 0,
                      maxHeight: 150,
                      overflowY: "auto",
                      background: "rgba(0,0,0,0.32)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      fontSize: 11,
                      fontFamily: "inherit",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {agentStatus?.selfSection?.trim() || "No memories yet."}
                  </pre>
                  {agentStatus?.memories && agentStatus.memories.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 600 }}>
                        Remembers ({agentStatus.memories.length})
                      </span>
                      <div
                        style={{
                          maxHeight: 120,
                          overflowY: "auto",
                          display: "flex",
                          flexDirection: "column",
                          gap: 5,
                          padding: "6px 8px",
                          background: "rgba(0,0,0,0.25)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 6,
                        }}
                      >
                        {agentStatus.memories.map((note, index) => (
                          <span
                            key={`${note.at ?? ""}-${index}`}
                            style={{ fontSize: 11, opacity: 0.8, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                          >
                            {note.at ? (
                              <span style={{ opacity: 0.5, fontSize: 9 }}>
                                {new Date(note.at).toLocaleString()} ·{" "}
                              </span>
                            ) : null}
                            {note.text ?? ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setAgentPersonaDraft(agentStatus?.selfSection ?? "");
                        setMemoriesEditing(true);
                      }}
                      style={p2pBtnStyle(false)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMemoriesHistoryOpen((open) => {
                          if (!open) void loadMemoriesLog();
                          return !open;
                        })
                      }
                      style={p2pBtnStyle(memoriesHistoryOpen)}
                    >
                      History
                    </button>
                  </div>
                  {memoriesHistoryOpen && (
                    <div
                      style={{
                        maxHeight: 110,
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        padding: "6px 8px",
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 6,
                      }}
                    >
                      {memoriesLog === null ? (
                        <span style={{ fontSize: 10, opacity: 0.5, fontStyle: "italic" }}>Loading…</span>
                      ) : memoriesLog.length === 0 ? (
                        <span style={{ fontSize: 10, opacity: 0.5, fontStyle: "italic" }}>No edits yet.</span>
                      ) : (
                        memoriesLog.map((entry, index) => (
                          <span
                            key={`${entry.editedAt ?? ""}-${index}`}
                            style={{ fontSize: 10, opacity: 0.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                          >
                            {entry.editedAt ? `${new Date(entry.editedAt).toLocaleString()} · ` : ""}
                            {entry.editedBy ? `${entry.editedBy}: ` : ""}
                            {entry.newValue ?? ""}
                          </span>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ fontSize: 11, opacity: 0.7 }}>
              tokens: {agentStatus?.tokensSpentToday ?? 0} / {agentStatus?.dailyTokenBudget ?? 0}
            </div>

            <button
              type="button"
              onClick={() => setAgentViewportOn((v) => !v)}
              disabled={!agentStatus?.visitorId}
              style={{
                ...p2pBtnStyle(agentViewportOn),
                flex: "none",
                width: "100%",
                opacity: agentStatus?.visitorId ? 1 : 0.5,
                cursor: agentStatus?.visitorId ? "pointer" : "default",
              }}
            >
              {agentViewportOn ? "Hide viewport" : "Show viewport"}
            </button>

            {/* Reset thread — subdued, two-step confirm; memories survive. */}
            {agentResetConfirm ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, opacity: 0.85 }}>
                <span style={{ flex: 1, minWidth: 0 }}>Reset? The chat history starts over; memories stay.</span>
                <button
                  type="button"
                  disabled={agentBusy}
                  onClick={() => void onAgentResetThread()}
                  style={{ ...p2pBtnStyle(true), flex: "none", padding: "3px 10px", fontSize: 10, opacity: agentBusy ? 0.6 : 1 }}
                >
                  {agentBusy ? "…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setAgentResetConfirm(false)}
                  style={{ ...p2pBtnStyle(false), flex: "none", padding: "3px 10px", fontSize: 10 }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={agentBusy}
                onClick={() => setAgentResetConfirm(true)}
                title="Start a fresh conversation thread for a stuck agent — its memories and personality stay."
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  alignSelf: "flex-start",
                  color: "#dfe7d8",
                  fontSize: 10,
                  opacity: agentBusy ? 0.3 : 0.5,
                  cursor: agentBusy ? "default" : "pointer",
                  textDecoration: "underline",
                  textDecorationColor: "rgba(255,255,255,0.25)",
                }}
              >
                Reset thread
              </button>
            )}
          </div>
        )}

        {agentError && <div style={{ fontSize: 11, color: "#ff9a9a" }}>{agentError}</div>}

        {/* Agent composer — the big box is the input; transcript appears above once there is history. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Chat</span>
          <button
            type="button"
            onClick={() => setChatExpanded(true)}
            title="Expand chat"
            style={{ background: "none", border: "none", color: "#dfe7d8", fontSize: 13, lineHeight: 1, opacity: 0.7, padding: 0, cursor: "pointer" }}
          >
            ⤢
          </button>
        </div>
        {(agentChat.length > 0 || agentStatus?.processing) && (
          <div
            ref={agentTranscriptScrollRef}
            className="agent-tab-transcript"
          >
            {agentFeed.map(renderAgentFeedItem)}
            {optedIn && agentStatus?.processing && (
              <span style={{ fontSize: 11, color: "#9ec8ff", fontStyle: "italic", opacity: 0.85 }}>thinking...</span>
            )}
          </div>
        )}
        <textarea
          className="agent-tab-composer"
          value={agentChatInput}
          onChange={(e) => setAgentChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onAgentSend();
            }
          }}
          placeholder={optedIn ? "Talk to your agent..." : "Start your agent first (Settings)"}
          disabled={!optedIn}
          rows={5}
        />
        <div className="agent-tab-actions">
          {agentSpeech.supported && (
            <button
              type="button"
              className={agentSpeech.listening ? "agent-tab-mic active" : "agent-tab-mic"}
              title={agentSpeech.listening ? "Listening..." : "Speak to your agent"}
              disabled={!optedIn}
              onClick={agentSpeech.start}
            >
              <Mic size={14} />
              <span>{agentSpeech.listening ? "Listening" : "Mic"}</span>
            </button>
          )}
          <button
            type="button"
            className="agent-tab-send"
            onClick={() => void onAgentSend()}
            disabled={!optedIn || agentChatInput.trim().length === 0}
          >
            Send
          </button>
        </div>
      </div>
    );
  };

  // Auto-scroll the chat thread to the newest line when it grows — but only if the user is already near the
  // bottom, so we don't snatch the view away from someone scrolled up reading older lines.
  useEffect(() => {
    const el = agentTranscriptScrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [agentChat]);

  // Drive the in-world POV viewport: ON + panel open + a known agent visitorId => show that avatar's view;
  // otherwise hide it. Re-applies when the agent's visitorId changes.
  useEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const visitorId = agentStatus?.visitorId;
    // The viewport intentionally SURVIVES closing the panel — the agent keeps running and its POV
    // stays on screen until you toggle it off.
    if (agentViewportOn && visitorId) {
      world.setAgentViewport(visitorId);
    } else {
      world.setAgentViewport(null);
    }
  }, [agentViewportOn, agentStatus?.visitorId]);

  // Agent vision uplink: while the agent runs, periodically render its POV client-side and ship a
  // small JPEG to Hyades (the LLM turn attaches it — the agent SEES without any headless browser).
  useEffect(() => {
    const visitorId = agentStatus?.visitorId;
    const running = Boolean(agentStatus?.optedIn && agentStatus?.enabled && visitorId);
    if (!running || !visitorId) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const image = await worldRef.current?.captureAgentView(visitorId);
        if (cancelled || !image) return;
        await fetch(tellusAgentUrl("view"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image }),
        });
      } catch {
        /* best effort — vision is a bonus sense */
      }
    };
    const id = window.setInterval(() => void tick(), 12_000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [agentStatus?.optedIn, agentStatus?.enabled, agentStatus?.visitorId]);

  // Track whether the agent's avatar mesh is actually in the local scene while the viewport is up
  // (it can be missing when the agent runs offline-persistent or its presence hasn't synced yet).
  useEffect(() => {
    const visitorId = agentStatus?.visitorId;
    if (!agentViewportOn || !visitorId) {
      setAgentAvatarPresent(true);
      return;
    }
    const check = () =>
      setAgentAvatarPresent(worldRef.current?.hasVisitorAvatar(visitorId) ?? false);
    check();
    const id = window.setInterval(check, 1000);
    return () => window.clearInterval(id);
  }, [agentViewportOn, agentStatus?.visitorId]);

  // PiP fallback active: viewport on + agent opted in, but no local avatar to render a POV from.
  const agentRemoteViewActive =
    agentViewportOn && (agentStatus?.optedIn ?? false) && !agentAvatarPresent;
  // The server only holds a view while the agent is actually awake: enabled (ticking) or its owner
  // present (arrival self-heals enabled). Fully asleep — e.g. parked in another world — means
  // GET .../agent/view 404s forever, so polling it every 5s is pure noise; gate the poll off and
  // let the PiP show the "asleep" hint instead.
  const agentRemoteViewPolling =
    agentRemoteViewActive &&
    ((agentStatus?.enabled ?? false) || (agentStatus?.ownerPresent ?? false));

  // Poll the server-held snapshot (GET .../agent/view) every 5s while the fallback shows; fetch (not a
  // bare <img> src) so the session header rides along, then hand the bytes to the <img> as a blob URL.
  useEffect(() => {
    if (!agentRemoteViewPolling) {
      setAgentRemoteViewSrc(null);
      setAgentRemoteViewFailed(false);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    // A single failed poll must not blank the view (the headless camera occasionally pays a
    // recreate+warmup cycle) — keep the LAST frame and only declare failure after 3 misses in a row.
    let misses = 0;
    const tick = async () => {
      if (cancelled || document.visibilityState === "hidden") return; // pause while the tab is hidden
      try {
        const res = await fetch(`${tellusAgentUrl("view")}&t=${Date.now()}`, { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          misses += 1;
          if (misses >= 3) setAgentRemoteViewFailed(true);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const next = URL.createObjectURL(blob);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = next;
        misses = 0;
        setAgentRemoteViewSrc(next);
        setAgentRemoteViewFailed(false);
      } catch {
        if (!cancelled) {
          misses += 1;
          if (misses >= 3) setAgentRemoteViewFailed(true);
        }
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setAgentRemoteViewSrc(null);
    };
  }, [agentRemoteViewPolling]);

  // The chat thread and viewport persist across panel open/close — the agent keeps running either
  // way, so closing the tab is just hiding the controls.

  // Re-enumerate when devices change (hot-plug, permission grant).
  useEffect(() => {
    if (!p2pSupported) return;
    const handler = () => void refreshP2pDevices();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2pSupported]);

  // World switching: each worldId is its own Hyades grain (created on first use). The list endpoint only
  // returns SEEDED worlds, so we union it with locally-remembered ids + the current one.
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
  const [worlds, setWorlds] = useState<string[]>([]);
  const sharedLocationRef = useRef<{ worldId: string; x: number; z: number; consumed: boolean } | null>(null);
  const pendingInteriorSceneUrlsRef = useRef<Record<string, string>>({});
  const [newWorldTemplate, setNewWorldTemplate] = useState<WorldTemplateId>(
    parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
  );
  const [newWorldSkyboxUrl, setNewWorldSkyboxUrl] = useState(
    normalizeSkyboxUrl(runtimeConfig.skyboxUrl) ||
      defaultSkyboxUrlForTemplate(parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus")),
  );
  const [newWorldName, setNewWorldName] = useState("");
  const [newWorldPanelOpen, setNewWorldPanelOpen] = useState(false);
  const [newWorldPrivate, setNewWorldPrivate] = useState(false);
  const [newWorldChunkSize, setNewWorldChunkSize] = useState(8);
  const [newWorldDayNightMode, setNewWorldDayNightMode] = useState<DayNightMode>(
    runtimeConfig.dayNightMode,
  );
  const [newWorldLightingMood, setNewWorldLightingMood] = useState<LightingMood>(
    runtimeConfig.lightingMood,
  );
  const [newWorldWaterSettings, setNewWorldWaterSettings] = useState<WaterSettings>(
    runtimeConfig.waterSettings,
  );
  const [advancedWorldTemplatesOpen, setAdvancedWorldTemplatesOpen] = useState(false);
  const [currentWorldTemplate, setCurrentWorldTemplate] = useState<WorldTemplateId>(
    parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
  );
  const [currentWorldSkyboxUrl, setCurrentWorldSkyboxUrl] = useState(
    normalizeSkyboxUrl(runtimeConfig.skyboxUrl) ||
      defaultSkyboxUrlForTemplate(parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus")),
  );
  const [currentWorldPrivate, setCurrentWorldPrivate] = useState(false);
  const [currentDayNightMode, setCurrentDayNightMode] = useState<DayNightMode>(
    runtimeConfig.dayNightMode,
  );
  const [currentDayNightCycleMs, setCurrentDayNightCycleMs] = useState(
    runtimeConfig.dayNightCycleMs,
  );
  const [currentLightingMood, setCurrentLightingMood] = useState<LightingMood>(
    runtimeConfig.lightingMood,
  );
  const [currentWaterSettings, setCurrentWaterSettings] = useState<WaterSettings>(
    runtimeConfig.waterSettings,
  );
  const [terrainTuningDraft, setTerrainTuningDraft] = useState<TerrainTuningDraft>(
    terrainTuningFromLandShape(runtimeConfig.landShape),
  );
  const [worldRenderRevision, setWorldRenderRevision] = useState(0);
  const [worldCreateNote, setWorldCreateNote] = useState<string | null>(null);
  const worldCreateNoteTimerRef = useRef<number | undefined>(undefined);
  // Admin-only world delete: a two-step inline confirm. First click arms (sets the world id here),
  // second click within the window confirms; clicking elsewhere / a timeout disarms.
  const [pendingDeleteWorld, setPendingDeleteWorld] = useState<string | null>(null);
  const [deletingWorld, setDeletingWorld] = useState(false);
  const pendingDeleteTimerRef = useRef<number | undefined>(undefined);
  const KNOWN_WORLDS_KEY = "tellus.knownWorlds";
  const WORLD_PROFILES_KEY = "tellus.worldProfiles";
  const ACTIVE_WORLD_KEY = "tellus.activeWorldId";
  const NEW_WORLD_TEMPLATE_KEY = "tellus.newWorldTemplate";
  const NEW_WORLD_SKYBOX_KEY = "tellus.newWorldSkyboxUrl";
  const NEW_WORLD_NAME_KEY = "tellus.newWorldName";
  const NEW_WORLD_PRIVATE_KEY = "tellus.newWorldPrivate";
  const NEW_WORLD_CHUNK_SIZE_KEY = "tellus.newWorldChunkSize";
  const NEW_WORLD_DAY_NIGHT_MODE_KEY = "tellus.newWorldDayNightMode";
  const NEW_WORLD_LIGHTING_MOOD_KEY = "tellus.newWorldLightingMood";
  const NEW_WORLD_WATER_SETTINGS_KEY = "tellus.newWorldWaterSettings";
  const defaultWorldTemplateRef = useRef<WorldTemplateId>(
    parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
  );
  const defaultSkyboxUrlRef = useRef(runtimeConfig.skyboxUrl);
  const defaultLandShapeRef = useRef<LandShapeOverrides | undefined>(runtimeConfig.landShape);

  interface WorldRenderProfile {
    displayName?: string;
    worldTemplate?: WorldTemplateId;
    skyboxUrl?: string;
    landShape?: LandShapeOverrides;
    isPublic?: boolean;
    canDelete?: boolean;
    deleteReason?: string;
    dayNightMode?: DayNightMode;
    dayNightCycleMs?: number;
    dayNightStart?: number;
    lightingMood?: LightingMood;
    waterSettings?: WaterSettings;
    sceneUrl?: string;
  }

  const parseWorldRenderProfile = (value: unknown): WorldRenderProfile => {
    if (!isRecord(value)) return {};
    const worldTemplate =
      typeof value.worldTemplate === "string" && value.worldTemplate.trim()
        ? parseOptionalWorldTemplateId(value.worldTemplate)
        : typeof value.world_template === "string" && value.world_template.trim()
          ? parseOptionalWorldTemplateId(value.world_template)
          : undefined;
    const displayName =
      typeof value.displayName === "string" && value.displayName.trim()
        ? value.displayName.trim()
        : typeof value.display_name === "string" && value.display_name.trim()
          ? value.display_name.trim()
          : typeof value.name === "string" && value.name.trim()
            ? value.name.trim()
            : undefined;
    const skyboxUrl =
      typeof value.skyboxUrl === "string" && value.skyboxUrl.trim()
        ? normalizeSkyboxUrl(value.skyboxUrl)
        : typeof value.skybox_url === "string" && value.skybox_url.trim()
          ? normalizeSkyboxUrl(value.skybox_url)
          : undefined;
    const landShape = parseLandShapeOverrides(
      value.landShape ?? value.land_shape,
    );
    const isPublic =
      typeof value.isPublic === "boolean"
        ? value.isPublic
        : typeof value.is_public === "boolean"
          ? value.is_public
          : undefined;
    const canDelete =
      typeof value.canDelete === "boolean"
        ? value.canDelete
        : typeof value.can_delete === "boolean"
          ? value.can_delete
          : undefined;
    const deleteReason =
      typeof value.deleteReason === "string" && value.deleteReason.trim()
        ? value.deleteReason.trim()
        : typeof value.delete_reason === "string" && value.delete_reason.trim()
          ? value.delete_reason.trim()
          : undefined;
    const dayNightModeValue = value.dayNightMode ?? value.day_night_mode;
    const dayNightMode =
      dayNightModeValue === undefined
        ? undefined
        : parseDayNightMode(dayNightModeValue, runtimeConfig.dayNightMode);
    const dayNightCycleMsValue = value.dayNightCycleMs ?? value.day_night_cycle_ms;
    const dayNightCycleMs =
      dayNightCycleMsValue === undefined
        ? undefined
        : normalizeDayNightCycleMs(dayNightCycleMsValue, runtimeConfig.dayNightCycleMs);
    const dayNightStart =
      typeof value.dayNightStart === "number"
        ? clamp(value.dayNightStart, 0, 1)
        : typeof value.day_night_start === "number"
          ? clamp(value.day_night_start, 0, 1)
          : undefined;
    const lightingMoodValue = value.lightingMood ?? value.lighting_mood;
    const lightingMood =
      lightingMoodValue === undefined
        ? undefined
        : parseLightingMood(lightingMoodValue, runtimeConfig.lightingMood);
    const waterSettingsValue = value.waterSettings ?? value.water_settings;
    const waterSettings =
      waterSettingsValue === undefined
        ? undefined
        : parseWaterSettings(waterSettingsValue, runtimeConfig.waterSettings);
    const sceneUrl =
      typeof value.sceneUrl === "string" && value.sceneUrl.trim()
        ? value.sceneUrl.trim()
        : typeof value.scene_url === "string" && value.scene_url.trim()
          ? value.scene_url.trim()
          : undefined;
    return {
      displayName,
      worldTemplate,
      skyboxUrl,
      landShape,
      isPublic,
      canDelete,
      deleteReason,
      dayNightMode,
      dayNightCycleMs,
      dayNightStart,
      lightingMood,
      waterSettings,
      sceneUrl,
    };
  };

  const loadLocalWorldProfiles = (): Record<string, WorldRenderProfile> => {
    try {
      const raw = window.localStorage.getItem(WORLD_PROFILES_KEY);
      const value = raw ? (JSON.parse(raw) as unknown) : {};
      if (!isRecord(value)) return {};
      const profiles: Record<string, WorldRenderProfile> = {};
      for (const [worldId, profile] of Object.entries(value)) {
        profiles[worldId] = parseWorldRenderProfile(profile);
      }
      return profiles;
    } catch {
      return {};
    }
  };

  const rememberWorldProfile = (worldId: string, profile: WorldRenderProfile) => {
    try {
      const profiles = loadLocalWorldProfiles();
      profiles[worldId] = { ...profiles[worldId], ...profile };
      window.localStorage.setItem(WORLD_PROFILES_KEY, JSON.stringify(profiles));
    } catch {
      /* ignore */
    }
  };

  const rememberRemoteWorldProfile = (worldId: string, profile: WorldRenderProfile) => {
    const existing = loadLocalWorldProfiles()[worldId] ?? {};
    const merged: WorldRenderProfile = { ...profile };
    if (existing.displayName !== undefined) merged.displayName = existing.displayName;
    if (existing.worldTemplate !== undefined) merged.worldTemplate = existing.worldTemplate;
    if (existing.skyboxUrl !== undefined) merged.skyboxUrl = existing.skyboxUrl;
    if (existing.landShape !== undefined) merged.landShape = existing.landShape;
    if (existing.isPublic !== undefined) merged.isPublic = existing.isPublic;
    if (existing.canDelete !== undefined) merged.canDelete = existing.canDelete;
    if (existing.deleteReason !== undefined) merged.deleteReason = existing.deleteReason;
    if (existing.dayNightMode !== undefined) merged.dayNightMode = existing.dayNightMode;
    if (existing.dayNightCycleMs !== undefined) merged.dayNightCycleMs = existing.dayNightCycleMs;
    if (existing.dayNightStart !== undefined) merged.dayNightStart = existing.dayNightStart;
    if (existing.lightingMood !== undefined) merged.lightingMood = existing.lightingMood;
    if (existing.waterSettings !== undefined) merged.waterSettings = existing.waterSettings;
    if (existing.sceneUrl !== undefined) merged.sceneUrl = existing.sceneUrl;
    rememberWorldProfile(worldId, merged);
  };

  const fallbackWorldDisplayName = (worldId: string): string => {
    const chunkedMatch = /^chunked-\d+-(.+)$/i.exec(worldId.trim());
    if (chunkedMatch?.[1]) return chunkedMatch[1];
    return worldId;
  };

  const worldDisplayName = (worldId: string): string =>
    loadLocalWorldProfiles()[worldId]?.displayName?.trim() || fallbackWorldDisplayName(worldId);

  const worldOptionLabel = (worldId: string): string => {
    return worldDisplayName(worldId);
  };

  const canDeleteWorld = (worldId: string): boolean => {
    const profile = loadLocalWorldProfiles()[canonicalWorldId(worldId)] ?? {};
    return Boolean(profile.canDelete || isAdmin);
  };

  const slugForWorldName = (name: string): string =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);

  const templatePreviewUrl = (template: WorldTemplateId): string | undefined =>
    evoflowTerrainSourceFor(template)?.previewUrl;

  const selectedCreationTemplate = (): (typeof WORLD_CREATION_TEMPLATES)[number] | undefined =>
    WORLD_CREATION_TEMPLATES.find((template) => template.id === newWorldTemplate);

  const applyNewWorldTemplate = (template: WorldTemplateId) => {
    const next = parseWorldTemplateId(template, defaultWorldTemplateRef.current);
    const preset = WORLD_CREATION_TEMPLATES.find((option) => option.id === next);
    setNewWorldTemplate(next);
    setNewWorldSkyboxUrl(
      normalizeSkyboxUrl(preset?.defaultSkyboxUrl || defaultSkyboxUrlForTemplate(next)),
    );
    if (preset) {
      setNewWorldLightingMood(preset.defaultLightingMood);
      setNewWorldDayNightMode(preset.defaultDayNightMode);
      setNewWorldChunkSize(preset.defaultChunkSize);
    }
  };

  const renameActiveWorld = () => {
    const id = activeWorldId ?? runtimeConfig.worldId;
    if (!id) return;
    const currentName = worldDisplayName(id);
    const next = window.prompt("World name:", currentName === id ? "" : currentName);
    if (next === null) return;
    const displayName = next.trim().slice(0, 64);
    rememberWorldProfile(id, { displayName: displayName || undefined });
    setWorldRenderRevision((revision) => revision + 1);
    showWorldNote(displayName ? `Renamed world to "${displayName}"` : "World name cleared");
    if (runtimeConfig.worldApiBase) {
      void fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(id)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: displayName || id,
            displayName: displayName || undefined,
          }),
        },
      ).catch(() => undefined);
    }
  };

  const resolveWorldRenderProfile = async (worldId: string): Promise<{
    template: WorldTemplateId;
    skyboxUrl: string;
    landShape?: LandShapeOverrides;
    isPublic?: boolean;
    dayNightMode: DayNightMode;
    dayNightCycleMs: number;
    dayNightStart: number;
    lightingMood: LightingMood;
    waterSettings: WaterSettings;
    sceneUrl?: string;
  }> => {
    const templateFallback = templateForWorldId(
      worldId,
      defaultWorldTemplateRef.current,
    );
    const localProfile = loadLocalWorldProfiles()[worldId] ?? {};
    let profile: WorldRenderProfile = {};
    if (runtimeConfig.worldApiBase) {
      try {
        const response = await fetch(
          `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(worldId)}?userId=${encodeURIComponent(tellusUserId())}`,
          { cache: "no-store" },
        );
        if (response.ok) {
          profile = parseWorldRenderProfile(await response.json());
          rememberRemoteWorldProfile(worldId, profile);
        }
      } catch {
        /* no world metadata endpoint (or offline) */
      }
    }
    const localTemplate = shouldIgnoreDefaultTellusTemplate(localProfile.worldTemplate, templateFallback)
      ? undefined
      : localProfile.worldTemplate;
    const remoteTemplate = shouldIgnoreDefaultTellusTemplate(profile.worldTemplate, templateFallback)
      ? undefined
      : profile.worldTemplate;
    let template = localTemplate ?? remoteTemplate ?? templateFallback;
    if (templateFallback === "flight-range" && template === "tellus") {
      template = templateFallback;
    }
    if (templateFallback !== "tellus" && remoteTemplate === undefined && localTemplate === undefined) {
      template = templateFallback;
    }
    const templateSkyboxUrl = normalizeSkyboxUrl(defaultSkyboxUrlForTemplate(template));
    const fallbackSkyboxUrl = normalizeSkyboxUrl(defaultSkyboxUrlForTemplate(templateFallback));
    const genericSkyboxes = new Set(
      [
        defaultSkyboxUrlRef.current,
        defaultSkyboxUrlForTemplate("tellus"),
        defaultSkyboxUrlForTemplate(defaultWorldTemplateRef.current),
        defaultSkyboxUrlForTemplate(templateFallback),
      ]
        .filter(Boolean)
        .map((url) => normalizeSkyboxUrl(url)),
    );
    let skyboxUrl = normalizeSkyboxUrl(
      localProfile.skyboxUrl ??
        profile.skyboxUrl ??
        templateSkyboxUrl ??
        defaultSkyboxUrlRef.current,
    );
    if (
      templateFallback !== "tellus" &&
      (localProfile.skyboxUrl === undefined || genericSkyboxes.has(skyboxUrl)) &&
      (profile.skyboxUrl === undefined || genericSkyboxes.has(skyboxUrl))
    ) {
      skyboxUrl = fallbackSkyboxUrl;
    }
    const landShape =
      localTemplate === undefined && remoteTemplate === undefined && templateFallback !== "tellus"
        ? undefined
        : localProfile.landShape ?? profile.landShape ?? defaultLandShapeRef.current;
    return {
      template,
      skyboxUrl,
      landShape,
      isPublic: profile.isPublic ?? localProfile.isPublic,
      dayNightMode:
        profile.dayNightMode ?? localProfile.dayNightMode ?? runtimeConfig.dayNightMode,
      dayNightCycleMs:
        profile.dayNightCycleMs ??
        localProfile.dayNightCycleMs ??
        runtimeConfig.dayNightCycleMs,
      dayNightStart:
        profile.dayNightStart ?? localProfile.dayNightStart ?? runtimeConfig.dayNightStart,
      lightingMood:
        profile.lightingMood ?? localProfile.lightingMood ?? runtimeConfig.lightingMood,
      waterSettings:
        profile.waterSettings ?? localProfile.waterSettings ?? runtimeConfig.waterSettings,
      sceneUrl:
        profile.sceneUrl ??
        localProfile.sceneUrl ??
        generatedInteriorSceneUrlForTemplate(template),
    };
  };
  const loadKnownWorlds = (): string[] => {
    try {
      const raw = window.localStorage.getItem(KNOWN_WORLDS_KEY);
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  };
  const rememberWorld = (id: string) => {
    const worldId = canonicalWorldId(id);
    try {
      const next = [...new Set([...loadKnownWorlds().map(canonicalWorldId), worldId])];
      window.localStorage.setItem(KNOWN_WORLDS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const forgetWorld = (id: string) => {
    const worldId = canonicalWorldId(id);
    try {
      const next = loadKnownWorlds().map(canonicalWorldId).filter((known) => known !== worldId);
      window.localStorage.setItem(KNOWN_WORLDS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    try {
      const profiles = loadLocalWorldProfiles();
      delete profiles[worldId];
      window.localStorage.setItem(WORLD_PROFILES_KEY, JSON.stringify(profiles));
    } catch {
      /* ignore */
    }
  };
  const refreshWorldList = async (current?: string) => {
    let server: string[] = [];
    try {
      const res = await fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds?userId=${encodeURIComponent(tellusUserId())}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as unknown;
      const list = Array.isArray(data)
        ? data
        : (data as { worlds?: unknown })?.worlds;
      if (Array.isArray(list)) {
        server = list
          .map((w) => {
            if (typeof w === "string") return canonicalWorldId(w);
            const world = w as { worldId?: string };
            if (typeof world.worldId === "string" && world.worldId.length > 0) {
              const worldId = canonicalWorldId(world.worldId);
              const profile = parseWorldRenderProfile(w);
              if (Object.keys(profile).length > 0) rememberRemoteWorldProfile(worldId, profile);
              return worldId;
            }
            return undefined;
          })
          .filter((x): x is string => typeof x === "string" && x.length > 0);
      }
    } catch {
      /* offline / no index — fall back to local */
    }
    const cur = canonicalWorldId(current ?? activeWorldId ?? runtimeConfig.worldId);
    setWorlds([...new Set([...server, ...loadKnownWorlds().map(canonicalWorldId), ...(cur ? [cur] : [])])].sort());
  };
  const switchWorld = (id: string) => {
    const next = canonicalWorldId(id);
    if (!next || next === activeWorldId) return;
    rememberWorld(next);
    try {
      window.localStorage.setItem(ACTIVE_WORLD_KEY, next);
    } catch {
      /* ignore */
    }
    setActiveWorldId(next);
    void refreshWorldList(next);
  };
  const parseSharedLocation = (): { worldId: string; x: number; z: number; consumed: boolean } | null => {
    const params = new URLSearchParams(window.location.search);
    const worldId = params.get("world")?.trim();
    const x = Number(params.get("x"));
    const z = Number(params.get("z"));
    if (!worldId || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    return { worldId: canonicalWorldId(worldId), x, z, consumed: false };
  };
  const shareLocationUrl = (worldId: string, x: number, z: number): string => {
    const url = new URL(window.location.href);
    url.searchParams.set("world", canonicalWorldId(worldId));
    url.searchParams.set("x", String(Math.round(x)));
    url.searchParams.set("z", String(Math.round(z)));
    return url.toString();
  };
  const portalArrivalPosition = (x: number, z: number) => {
    const len = Math.hypot(x, z);
    const dx = len > 0.001 ? x / len : 1;
    const dz = len > 0.001 ? z / len : 0;
    return {
      x: x + dx * PORTAL_ARRIVAL_EXIT_OFFSET,
      z: z + dz * PORTAL_ARRIVAL_EXIT_OFFSET,
    };
  };
  const transferPetThings = (
    pets: GeneratedThing[],
    arrival: { x: number; z: number } | null,
  ): WorldGeneratedThing[] =>
    pets.map((thing, index) => {
      const angle = Math.PI + (index % 2 === 0 ? -0.45 : 0.45);
      const row = Math.floor(index / 2);
      const distance = 3.6 + row * 1.2;
      const position = arrival
        ? {
            x: arrival.x + Math.sin(angle) * distance,
            y: thing.position.y,
            z: arrival.z + Math.cos(angle) * distance,
          }
        : { ...thing.position };
      return {
        id: thing.id,
        kind: thing.kind,
        prompt: thing.prompt,
        creatorId: thing.creatorId,
        ownerUserId: thing.ownerUserId,
        position,
        rotationX: thing.rotationX,
        rotationY: thing.rotationY,
        rotationZ: thing.rotationZ,
        scale: thing.scale,
        color: thing.color,
        assetStoreModelId: thing.assetStoreModelId,
        modelUrl: thing.modelUrl,
        pipelineId: thing.modelUrl ? undefined : thing.pipelineId,
        generationStatus: thing.modelUrl ? "ready" : thing.generationStatus,
        animation: thing.animation ?? "",
        petOwnerId: thing.petOwnerId,
        updatedAt: new Date().toISOString(),
      };
    });
  // TELLUS INFINITY: when the scene reports a world.portal.entered, switch to the target world and warp to the
  // portal's spawn once the new scene is up (best-effort delayed warp — the world reloads async on the id change).
  useEffect(() => {
    const ps = snapshot.portalSwitch;
    if (!ps || !ps.toWorldId || ps.toWorldId === activeWorldId) return;
    if (ps.sceneUrl) {
      pendingInteriorSceneUrlsRef.current[ps.toWorldId] = ps.sceneUrl;
    }
    const ownerId = snapshot.userId || snapshot.visitorId || tellusUserId();
    const pets = snapshot.generated.filter(
      (thing) => thing.petOwnerId === ownerId && thing.id !== snapshot.sailingThingId,
    );
    const arrival =
      ps.spawn && !(isChunkedWorldId(ps.toWorldId) && Math.hypot(ps.spawn.x, ps.spawn.z) < 1)
        ? portalArrivalPosition(ps.spawn.x, ps.spawn.z)
        : null;
    const petTransfers = transferPetThings(pets, arrival);
    for (const pet of pets) {
      worldRef.current?.deleteGenerated(pet.id);
    }
    switchWorld(ps.toWorldId);
    const t = window.setTimeout(() => {
      if (petTransfers.length > 0) worldRef.current?.importGeneratedThings(petTransfers);
      if (arrival) worldRef.current?.warpTo(arrival.x, arrival.z);
    }, 1400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.portalSwitch]);
  // Transient status line next to the world controls (reuses the create-note slot + its auto-clear).
  const showWorldNote = (msg: string, ms = 2800) => {
    if (worldCreateNoteTimerRef.current !== undefined) {
      window.clearTimeout(worldCreateNoteTimerRef.current);
    }
    setWorldCreateNote(msg);
    worldCreateNoteTimerRef.current = window.setTimeout(() => {
      setWorldCreateNote(null);
      worldCreateNoteTimerRef.current = undefined;
    }, ms);
  };
  const disarmDeleteWorld = () => {
    if (pendingDeleteTimerRef.current !== undefined) {
      window.clearTimeout(pendingDeleteTimerRef.current);
      pendingDeleteTimerRef.current = undefined;
    }
    setPendingDeleteWorld(null);
  };
  // Confirmed delete against the world API. The server allows admins to delete
  // any world and owners to delete only private owned worlds.
  const deleteWorld = async (id: string) => {
    if (!id || deletingWorld) return;
    const serverDeleteAllowed = canDeleteWorld(id);
    if (pendingDeleteWorld !== id) {
      // First click: arm the confirm (auto-disarms after a short window).
      if (pendingDeleteTimerRef.current !== undefined) {
        window.clearTimeout(pendingDeleteTimerRef.current);
      }
      setPendingDeleteWorld(id);
      pendingDeleteTimerRef.current = window.setTimeout(() => {
        setPendingDeleteWorld(null);
        pendingDeleteTimerRef.current = undefined;
      }, 4000);
      return;
    }
    // Second click: confirmed.
    disarmDeleteWorld();
    const label = worldDisplayName(id);
    const confirmed = window.confirm(
      serverDeleteAllowed
        ? `Permanently delete "${label}"?\n\nThis removes the saved world from the template/world picker and cannot be undone.`
        : `Remove "${label}" from your local world picker?\n\nYou are not authorized to delete it from the server, but you can hide this local/test entry.`,
    );
    if (!confirmed) return;
    const moveAwayFromRemovedWorld = async () => {
      if (id === (activeWorldId ?? runtimeConfig.worldId)) {
        const fallback =
          worlds.find((w) => w !== id) ??
          (runtimeConfig.worldId !== id ? runtimeConfig.worldId : "");
        if (fallback) {
          switchWorld(fallback);
        } else {
          await refreshWorldList();
        }
      } else {
        await refreshWorldList();
      }
    };
    if (!serverDeleteAllowed) {
      forgetWorld(id);
      await moveAwayFromRemovedWorld();
      showWorldNote(`Removed local world "${id}"`);
      return;
    }
    const token = getSession()?.token;
    setDeletingWorld(true);
    try {
      const res = await fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(id)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { [SESSION_HEADER]: token } : {}),
          },
          body: JSON.stringify({ confirm: id }),
        },
      );
      if (!res.ok) {
        let detail = "";
        try {
          const body = (await res.json()) as { detail?: string; error?: string };
          detail = body.detail || body.error || "";
        } catch {
          /* ignore */
        }
        detail ||= res.status === 403 ? "not authorized" : `HTTP ${res.status}`;
        showWorldNote(`Delete failed: ${detail}`, 4000);
        return;
      }
      forgetWorld(id);
      // If the deleted world was active, get the user out of it before it vanishes from the list.
      await moveAwayFromRemovedWorld();
      showWorldNote(`Deleted world "${id}"`);
    } catch {
      showWorldNote("Delete failed: network error", 4000);
    } finally {
      setDeletingWorld(false);
    }
  };
  const renderWorldDeleteButton = (target: string, className = "world-icon-button") => {
    const armed = pendingDeleteWorld === target;
    const serverDeleteAllowed = canDeleteWorld(target);
    return (
      <button
        type="button"
        aria-label={
          armed
            ? `Confirm ${serverDeleteAllowed ? "delete" : "remove"} world ${target}`
            : `${serverDeleteAllowed ? "Delete" : "Remove"} world ${target}`
        }
        title={
          armed
            ? `Click again to ${serverDeleteAllowed ? "permanently delete" : "remove local entry"} "${target}"`
            : `${serverDeleteAllowed ? "Delete" : "Remove local entry for"} "${target}"`
        }
        disabled={deletingWorld}
        onClick={(event) => {
          event.stopPropagation();
          void deleteWorld(target);
        }}
        onBlur={() => {
          if (pendingDeleteWorld === target) disarmDeleteWorld();
        }}
        className={`${className} ${armed ? "danger armed" : "danger"}`}
      >
        {deletingWorld ? "..." : armed ? "Confirm" : <Trash2 size={14} />}
      </button>
    );
  };
  const createNewWorld = () => {
    const displayName = newWorldName.trim().slice(0, 64);
    const sanitized = slugForWorldName(displayName);
    if (!displayName || !sanitized) {
      showWorldNote("Name the new world first", 3200);
      setNewWorldPanelOpen(true);
      return;
    }
    const size = Math.min(64, Math.max(1, Math.round(newWorldChunkSize) || 1));
    const pickedTemplate = parseWorldTemplateId(
      newWorldTemplate,
      defaultWorldTemplateRef.current,
    );
    const pickedInteriorSceneUrl = generatedInteriorSceneUrlForTemplate(pickedTemplate);
    // Server parses N from "chunked-<n>-<name>"; keep the name suffix non-empty.
    const namePart = sanitized.startsWith("chunked-")
      ? sanitized.replace(/^chunked-(?:\d+-)?/, "")
      : sanitized;
    const id = pickedInteriorSceneUrl
      ? `${pickedTemplate === "grand-hall-shell" ? "interior-grand-hall" : "interior-studio"}-${namePart || "room"}`
      : `chunked-${size}-${namePart || "world"}`;
    if (!id) return;
    const pickedSkybox = normalizeSkyboxUrl(
      newWorldSkyboxUrl || defaultSkyboxUrlForTemplate(pickedTemplate),
    );
    const makePrivate = newWorldPrivate;
    rememberWorldProfile(id, {
      displayName,
      worldTemplate: pickedTemplate,
      skyboxUrl: pickedSkybox,
      isPublic: !makePrivate,
      dayNightMode: newWorldDayNightMode,
      dayNightCycleMs: currentDayNightCycleMs,
      dayNightStart: runtimeConfig.dayNightStart,
      lightingMood: newWorldLightingMood,
      waterSettings: newWorldWaterSettings,
      sceneUrl: pickedInteriorSceneUrl,
    });
    const enter = () => {
      setNewWorldPanelOpen(false);
      setNewWorldName("");
      switchWorld(id);
    };
    if (runtimeConfig.worldApiBase) {
      // Seed metadata up front so template + skybox are world-specific before first entry.
      void fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(id)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: displayName,
            displayName,
            isPublic: !makePrivate,
            worldTemplate: pickedTemplate,
            skyboxUrl: pickedSkybox,
            dayNightMode: newWorldDayNightMode,
            dayNightCycleMs: currentDayNightCycleMs,
            dayNightStart: runtimeConfig.dayNightStart,
            lightingMood: newWorldLightingMood,
            waterSettings: newWorldWaterSettings,
            ...(pickedInteriorSceneUrl
              ? { sceneUrl: pickedInteriorSceneUrl, terrainProviderKind: "interior" }
              : {}),
          }),
        },
      )
        .then(enter)
        .catch(enter);
    } else {
      enter();
    }
  };
  const copyCurrentWorldSettings = () => {
    setNewWorldTemplate(currentWorldTemplate);
    setNewWorldSkyboxUrl(currentWorldSkyboxUrl);
    setNewWorldPrivate(currentWorldPrivate);
    setNewWorldDayNightMode(currentDayNightMode);
    setNewWorldLightingMood(currentLightingMood);
    setNewWorldWaterSettings(currentWaterSettings);
    setNewWorldName(`Copy of ${worldDisplayName(activeWorldId ?? runtimeConfig.worldId)}`.slice(0, 64));
    setNewWorldPanelOpen(true);
    if (worldCreateNoteTimerRef.current !== undefined) {
      window.clearTimeout(worldCreateNoteTimerRef.current);
    }
    setWorldCreateNote(
      `Copied current world settings: ${worldTemplateLabel(currentWorldTemplate)} - ${skyboxLabel(currentWorldSkyboxUrl)} - ${
        currentWorldPrivate ? "Private" : "Public"
      } - ${LIGHTING_MOOD_OPTIONS.find((option) => option.id === currentLightingMood)?.label ?? currentLightingMood}`,
    );
    worldCreateNoteTimerRef.current = window.setTimeout(() => {
      setWorldCreateNote(null);
      worldCreateNoteTimerRef.current = undefined;
    }, 2800);
  };
  const updateActiveWorldSkybox = (skyboxUrl: string) => {
    const next = normalizeSkyboxUrl(skyboxUrl);
    if (!next) return;
    setNewWorldSkyboxUrl(next);
    setCurrentWorldSkyboxUrl(next);
    runtimeConfig.skyboxUrl = next;
    if (activeWorldId) {
      rememberWorldProfile(activeWorldId, { skyboxUrl: next });
    }
    void worldRef.current?.setSkyboxUrl(next).then((loadedUrl) => {
      if (!loadedUrl) return;
      const normalizedLoadedUrl = normalizeSkyboxUrl(loadedUrl);
      if (normalizedLoadedUrl !== next) {
        setCurrentWorldSkyboxUrl(normalizedLoadedUrl);
        setNewWorldSkyboxUrl(normalizedLoadedUrl);
        runtimeConfig.skyboxUrl = normalizedLoadedUrl;
        if (activeWorldId) {
          rememberWorldProfile(activeWorldId, { skyboxUrl: normalizedLoadedUrl });
        }
      }
    }).catch((error) => {
      console.warn("Tellus skybox update failed", error);
    });
    if (runtimeConfig.worldApiBase && activeWorldId) {
      void fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(activeWorldId)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skyboxUrl: next }),
        },
      ).catch(() => undefined);
    }
  };
  const updateActiveWorldTemplate = (template: WorldTemplateId) => {
    const next = parseWorldTemplateId(template, defaultWorldTemplateRef.current);
    setNewWorldTemplate(next);
    if (!activeWorldId || next === currentWorldTemplate) return;
    setCurrentWorldTemplate(next);
    runtimeConfig.worldTemplate = next;
    runtimeConfig.landShape = undefined;
    setTerrainTuningDraft(terrainTuningFromLandShape(undefined));
    rememberWorldProfile(activeWorldId, { worldTemplate: next, landShape: undefined });
    applyWorldTerrainTemplate(next, undefined);
    setWorldRenderRevision((revision) => revision + 1);
    if (runtimeConfig.worldApiBase) {
      void fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(activeWorldId)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ worldTemplate: next }),
        },
      ).catch(() => undefined);
    }
  };
  const updateActiveWorldLighting = (patch: Partial<WorldRenderProfile>) => {
    if (!activeWorldId) return;
    const nextMode = patch.dayNightMode ?? currentDayNightMode;
    const nextCycleMs = normalizeDayNightCycleMs(
      patch.dayNightCycleMs ?? currentDayNightCycleMs,
      currentDayNightCycleMs,
    );
    const nextMood = patch.lightingMood ?? currentLightingMood;
    let nextStart =
      typeof patch.dayNightStart === "number"
        ? clamp(patch.dayNightStart, 0, 1)
        : runtimeConfig.dayNightStart;
    if (patch.dayNightMode === "pause") {
      nextStart = liveDayNightPhase(true);
    } else if (currentDayNightMode === "pause" && patch.dayNightMode === "cycle") {
      nextStart = liveDayNightPhase() - Date.now() / nextCycleMs;
    }
    setCurrentDayNightMode(nextMode);
    setCurrentDayNightCycleMs(nextCycleMs);
    setCurrentLightingMood(nextMood);
    runtimeConfig.dayNightMode = nextMode;
    runtimeConfig.dayNightCycleMs = nextCycleMs;
    runtimeConfig.dayNightStart = nextStart;
    runtimeConfig.lightingMood = nextMood;
    const profile: WorldRenderProfile = {
      dayNightMode: nextMode,
      dayNightCycleMs: nextCycleMs,
      dayNightStart: nextStart,
      lightingMood: nextMood,
    };
    rememberWorldProfile(activeWorldId, profile);
    if (runtimeConfig.worldApiBase) {
      void fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(activeWorldId)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(profile),
        },
      ).catch(() => undefined);
    }
  };
  const updateActiveWorldWater = (patch: Partial<WaterSettings>) => {
    if (!activeWorldId) return;
    const next = parseWaterSettings({ ...currentWaterSettings, ...patch }, currentWaterSettings);
    setCurrentWaterSettings(next);
    setNewWorldWaterSettings(next);
    runtimeConfig.waterSettings = next;
    worldRef.current?.setWaterSettings(next);
    rememberWorldProfile(activeWorldId, { waterSettings: next });
    if (runtimeConfig.worldApiBase) {
      void fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(activeWorldId)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waterSettings: next }),
        },
      ).catch(() => undefined);
    }
  };
  const applyActiveTerrainTuning = () => {
    if (!activeWorldId) return;
    const landShape = landShapeFromTerrainTuning(terrainTuningDraft, runtimeConfig.landShape);
    runtimeConfig.landShape = landShape;
    rememberWorldProfile(activeWorldId, { landShape });
    applyWorldTerrainTemplate(currentWorldTemplate, landShape);
    setWorldRenderRevision((revision) => revision + 1);
    showWorldNote("Terrain tuning applied");
    if (runtimeConfig.worldApiBase) {
      void fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(activeWorldId)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ landShape }),
        },
      ).catch(() => undefined);
    }
  };
  const resetActiveTerrainTuning = () => {
    setTerrainTuningDraft(terrainTuningFromLandShape(undefined));
    if (!activeWorldId) return;
    runtimeConfig.landShape = undefined;
    rememberWorldProfile(activeWorldId, { landShape: undefined });
    applyWorldTerrainTemplate(currentWorldTemplate, undefined);
    setWorldRenderRevision((revision) => revision + 1);
    showWorldNote("Terrain tuning reset");
    if (runtimeConfig.worldApiBase) {
      void fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(activeWorldId)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ landShape: null }),
        },
      ).catch(() => undefined);
    }
  };
  const [assetLibrary, setAssetLibrary] = useState<AssetLibraryModel[]>([]);
  // Store browse/search (server-side over the 3D Asset Manager): debounced query + paged results.
  const [assetSearch, setAssetSearch] = useState("");
  const [assetBrowse, setAssetBrowse] = useState<AssetLibraryModel[]>([]);
  const [assetBrowsePage, setAssetBrowsePage] = useState(1);
  const [assetBrowseHasNext, setAssetBrowseHasNext] = useState(false);
  const [assetBrowseTotal, setAssetBrowseTotal] = useState(0);
  const [assetBrowseLoading, setAssetBrowseLoading] = useState(false);
  const [assetBrowseSort, setAssetBrowseSort] = useState<AssetBrowseSort>("newest");
  const [procBuildingType, setProcBuildingType] = useState<ProceduralBuildingType>("simple-house");
  const [procBuildingMaterial, setProcBuildingMaterial] = useState<BuildingMaterialStyle>("auto");
  const [procBuildingLighting, setProcBuildingLighting] = useState<BuildingLightingStyle>("warm");
  const [procBuildingRoof, setProcBuildingRoof] = useState(true);
  // Map each browse tab to the store's REAL asset_category (flora / fauna / building). The store
  // categorizes animals under "fauna" (not "animal"), so use the precise category filter rather than
  // a fuzzy free-text search. A user-typed search overrides the category seed.
  const assetCategory =
    assetPanelTab === "flora"
      ? "flora"
      : assetPanelTab === "animal"
        ? "fauna"
        : assetPanelTab === "building"
          ? "building"
          : "";
  const selectedProcBuilding =
    PROCEDURAL_BUILDING_CATALOG.find((item) => item.id === procBuildingType) ??
    PROCEDURAL_BUILDING_CATALOG[0];
  const placeProceduralBuilding = useCallback(() => {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const archetypeId = makeProceduralBuildingArchetypeId(selectedProcBuilding.id);
    worldRef.current?.addLibraryAsset(
      {
        id: `proc-${archetypeId}-${seed.toString(16)}`,
        name: selectedProcBuilding.label,
        description: `${selectedProcBuilding.label} procedural building`,
        modelUrl: makeProceduralBuildingModelUrl(archetypeId, seed, {
          material: procBuildingMaterial,
          lighting: procBuildingLighting,
          roof: procBuildingRoof,
        }),
        source: "generated",
      },
      { scale: 1 },
    );
  }, [procBuildingLighting, procBuildingMaterial, procBuildingRoof, selectedProcBuilding]);
  const assetBrowseQuery = assetSearch.trim();
  const assetBrowseSeq = useRef(0);
  const [assetReuseSuggestions, setAssetReuseSuggestions] = useState<AssetReuseCandidate[]>([]);
  const [assetReuseLoading, setAssetReuseLoading] = useState(false);
  const [createPromptOpen, setCreatePromptOpen] = useState(false);

  const runAssetBrowse = useCallback(
    async (query: string, page: number, append: boolean, sort: AssetBrowseSort, category = "") => {
      const seq = ++assetBrowseSeq.current;
      setAssetBrowseLoading(true);
      try {
        const result = await browseAssetLibrary(query, page, sort, 24, category);
        if (assetBrowseSeq.current !== seq) return; // a newer query superseded this one
        setAssetBrowse((prev) => (append ? [...prev, ...result.models] : result.models));
        setAssetBrowsePage(page);
        setAssetBrowseHasNext(result.hasNext);
        setAssetBrowseTotal(result.total);
      } catch {
        if (assetBrowseSeq.current === seq && !append) setAssetBrowse([]);
      } finally {
        if (assetBrowseSeq.current === seq) setAssetBrowseLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const query = prompt.trim();
    if (query.length < 4 || !createPromptOpen) {
      setAssetReuseSuggestions([]);
      setAssetReuseLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const kind = inferGeneratedKind(query, "visitor");
      const preferredContexts = inferAssetSurfaceContexts(query);
      const worldModels: AssetLibraryModel[] = snapshot.generated
        .filter((thing) => thing.modelUrl && thing.generationStatus === "ready")
        .map((thing) => ({
          id: `world:${thing.id}`,
          name: thing.prompt,
          description: thing.prompt,
          modelUrl: thing.modelUrl,
          source: "generated" as const,
          hasThumbnail: false,
        }));
      const local = rankReusableAssets(query, [...worldModels, ...assetLibrary], kind, 4, preferredContexts);
      setAssetReuseSuggestions(local);
      setAssetReuseLoading(true);
      void browseAssetLibrary(query, 1, "downloads", 8)
        .then((result) => {
          if (cancelled) return;
          setAssetReuseSuggestions(
            rankReusableAssets(query, [...local, ...result.models], kind, 4, preferredContexts),
          );
        })
        .catch(() => {
          if (!cancelled) setAssetReuseSuggestions(local);
        })
        .finally(() => {
          if (!cancelled) setAssetReuseLoading(false);
        });
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [assetLibrary, createPromptOpen, prompt, snapshot.generated]);

  // Selected-object Move mode (mirrors world-side state; resets when the selection changes).
  const [moveModeActive, setMoveModeActive] = useState(false);
  const [selectedNudgeStep, setSelectedNudgeStep] = useState(0.25);
  useEffect(() => {
    setMoveModeActive(false);
    worldRef.current?.setMoveMode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.selectedThingId]);
  // ── Clean up dead references: world things whose model is definitively gone ──
  // Dead = generationStatus "failed" (the old strip-on-error bug), a procedural:// URL that no longer
  // parses, or a model URL the store answers 404/410 for. Network errors and 5xx are treated as ALIVE
  // (a store outage must never mass-delete a world).
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupNote, setCleanupNote] = useState<string | null>(null);
  const cleanupDeadReferences = useCallback(async () => {
    if (cleanupBusy) return;
    setCleanupBusy(true);
    setCleanupNote("Scanning…");
    try {
      const things = worldRef.current?.snapshot().generated ?? [];
      const dead: Array<{ id: string; name: string }> = [];
      const checkUrl = async (url: string): Promise<boolean> => {
        try {
          const ctrl = new AbortController();
          const res = await fetch(url, {
            signal: ctrl.signal,
            headers: { Range: "bytes=0-0" },
          });
          ctrl.abort();
          return res.status !== 404 && res.status !== 410;
        } catch {
          return true; // network hiccup — assume alive
        }
      };
      const remote: Array<{ id: string; name: string; url: string }> = [];
      for (const thing of things) {
        const name = thing.prompt || thing.kind;
        if (thing.generationStatus === "failed") {
          dead.push({ id: thing.id, name });
          continue;
        }
        if (!thing.modelUrl) continue;
        const proc = sanitizeProceduralModelUrl(thing.modelUrl);
        if (proc) {
          if (!parseProceduralModelUrl(proc)) dead.push({ id: thing.id, name });
          continue;
        }
        remote.push({ id: thing.id, name, url: thing.modelUrl });
      }
      // probe remote model urls with bounded concurrency
      const queue = [...remote];
      const workers = Array.from({ length: 6 }, async () => {
        for (;;) {
          const item = queue.shift();
          if (!item) return;
          if (!(await checkUrl(item.url))) dead.push({ id: item.id, name: item.name });
        }
      });
      await Promise.all(workers);
      if (dead.length === 0) {
        setCleanupNote("No dead references found.");
        return;
      }
      const preview = dead.slice(0, 6).map((d) => d.name.slice(0, 28)).join(", ");
      const ok = window.confirm(
        `Remove ${dead.length} broken object${dead.length === 1 ? "" : "s"}?\n${preview}${dead.length > 6 ? ", …" : ""}`,
      );
      if (!ok) {
        setCleanupNote(null);
        return;
      }
      for (const d of dead) worldRef.current?.deleteGenerated(d.id);
      setCleanupNote(`Removed ${dead.length} broken object${dead.length === 1 ? "" : "s"}.`);
    } finally {
      setCleanupBusy(false);
      window.setTimeout(() => setCleanupNote(null), 6000);
    }
  }, [cleanupBusy]);

  // Category tabs (flora/fauna/building) browse the shared asset library by store category; a typed
  // query overrides the category. The avatar tab has no browse.
  useEffect(() => {
    if (!runtimeConfigLoaded || !assetPanelOpen || (!assetCategory && !assetBrowseQuery)) return;
    const id = window.setTimeout(
      () => void runAssetBrowse(assetBrowseQuery, 1, false, assetBrowseSort, assetCategory),
      assetSearch.trim() ? 260 : 0,
    );
    return () => window.clearTimeout(id);
  }, [runtimeConfigLoaded, assetBrowseQuery, assetBrowseSort, assetCategory, assetPanelOpen, assetSearch, runAssetBrowse]);
  const [openToolMenus, setOpenToolMenus] = useState<ToolMenu[]>([]);
  const [createPromptFocused, setCreatePromptFocused] = useState(false);
  const [worldMenuOpen, setWorldMenuOpen] = useState(false);
  const [worldMapOpen, setWorldMapOpen] = useState(true);
  // Portals card: foldable + dismissable (was always-on with no close — the worst right-side offender).
  const [portalsPanelOpen, setPortalsPanelOpen] = useState(false);
  const [mapActorList, setMapActorList] = useState<"items" | "players" | "agents" | null>(null);
  const worldMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const { listening, supported, start } = useSpeechInput((text) =>
    setPrompt(text),
  );
  const agentSpeech = useSpeechInput((text) =>
    setAgentChatInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text)),
  );
  const importedGeneratedThings = (value: unknown): WorldGeneratedThing[] => {
    const source = Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.generated)
        ? value.generated
        : [];
    return source
      .map((item): WorldGeneratedThing | null => {
        if (isWorldGeneratedThing(item)) {
          const assetStoreModelId =
            item.assetStoreModelId ??
            (item.modelUrl ? assetStoreIdFromModelUrl(item.modelUrl) ?? undefined : undefined);
          const modelUrl = assetStoreModelId
            ? assetStoreGameOptimizedModelUrl(assetStoreModelId)
            : item.modelUrl
              ? absoluteTellusApiUrl(item.modelUrl)
              : undefined;
          return {
            ...item,
            assetStoreModelId,
            modelUrl,
            pipelineId: modelUrl ? undefined : item.pipelineId,
            generationStatus: modelUrl ? "ready" : item.generationStatus,
          };
        }
        if (!isRecord(item) || !isRecord(item.position)) return null;
        const { position } = item;
        if (
          typeof item.id !== "string" ||
          typeof item.prompt !== "string" ||
          typeof position.x !== "number" ||
          typeof position.y !== "number" ||
          typeof position.z !== "number"
        ) {
          return null;
        }
        const kind = inferGeneratedKind(
          typeof item.kind === "string" ? item.kind : item.prompt,
          "visitor",
        );
        const rawModelUrl =
          typeof item.modelUrl === "string"
            ? item.modelUrl
            : undefined;
        const assetStoreModelId =
          typeof item.assetStoreModelId === "string" && item.assetStoreModelId.trim()
            ? item.assetStoreModelId.trim()
            : rawModelUrl
              ? assetStoreIdFromModelUrl(rawModelUrl) ?? undefined
              : undefined;
        const modelUrl = assetStoreModelId
          ? assetStoreGameOptimizedModelUrl(assetStoreModelId)
          : rawModelUrl
            ? absoluteTellusApiUrl(rawModelUrl)
            : undefined;
        return {
          id: item.id,
          kind,
          prompt: item.prompt,
          creatorId:
            typeof item.creatorId === "string" ? item.creatorId : "visitor",
          ownerUserId:
            typeof item.ownerUserId === "string" ? item.ownerUserId : undefined,
          petOwnerId:
            typeof item.petOwnerId === "string" ? item.petOwnerId : undefined,
          position: {
            x: position.x,
            y: position.y,
            z: position.z,
          },
          rotationX:
            typeof item.rotationX === "number" ? item.rotationX : undefined,
          rotationY:
            typeof item.rotationY === "number" ? item.rotationY : 0,
          rotationZ:
            typeof item.rotationZ === "number" ? item.rotationZ : undefined,
          scale:
            typeof item.scale === "number" && Number.isFinite(item.scale)
              ? item.scale
              : 1,
          color:
            typeof item.color === "number" && Number.isFinite(item.color)
              ? item.color
              : kindColor(kind, item.prompt),
          assetStoreModelId,
          modelUrl,
          pipelineId:
            modelUrl
              ? undefined
              : typeof item.pipelineId === "string"
                ? item.pipelineId
                : undefined,
          generationStatus:
            modelUrl
              ? "ready"
              : item.generationStatus === "local" ||
                  item.generationStatus === "queued" ||
                  item.generationStatus === "generating" ||
                  item.generationStatus === "ready" ||
                  item.generationStatus === "failed"
                ? item.generationStatus
                : "ready",
          updatedAt:
            typeof item.updatedAt === "string"
              ? item.updatedAt
              : new Date().toISOString(),
        };
      })
      .filter((thing): thing is WorldGeneratedThing => thing !== null);
  };

  useEffect(() => {
    if (!showFps) return;
    const id = window.setInterval(() => {
      setFps(worldRef.current?.getFps() ?? 0);
    }, 250);
    return () => window.clearInterval(id);
  }, [showFps]);

  useEffect(() => {
    window.__tellusSnapshot = () => snapshot;
    window.__tellusImportGenerated = (value: unknown) => {
      const things = importedGeneratedThings(value);
      worldRef.current?.importGeneratedThings(things);
      return things.length;
    };
    window.__tellusImportSnapshot = (value: unknown) =>
      window.__tellusImportGenerated?.(value) ?? 0;
    window.__tellusSaveGeneratedPlacements = () => {
      const things = importedGeneratedThings(snapshot);
      window.localStorage.setItem(
        `tellus.generated.${runtimeConfig.worldId}`,
        JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          generated: things,
        }),
      );
      return things.length;
    };
    return () => {
      delete window.__tellusSnapshot;
      delete window.__tellusImportGenerated;
      delete window.__tellusImportSnapshot;
      delete window.__tellusSaveGeneratedPlacements;
    };
  }, [snapshot]);

  useEffect(() => {
    if (runtimeConfig.worldApiBase) return;
    const things = importedGeneratedThings(snapshot);
    if (things.length === 0) return;
    try {
      window.localStorage.setItem(
        `tellus.generated.${runtimeConfig.worldId}`,
        JSON.stringify({
          version: 1,
          savedAt: new Date().toISOString(),
          generated: things,
        }),
      );
    } catch (error) {
      console.warn("Tellus generated placement autosave failed", error);
    }
  }, [snapshot.generated]);

  // Load runtime config + asset library once, then choose the initial active world (a persisted choice wins
  // over the config default) and fetch the world list.
  useEffect(() => {
    let cancelled = false;
    void loadRuntimeConfig()
      .then(async () => {
        if (cancelled) return;
        setRuntimeConfigLoaded(true);
        const models = await loadAssetLibraryModels().catch(() => []);
        if (cancelled) return;
        setAssetLibrary(models);
        defaultWorldTemplateRef.current = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
        defaultSkyboxUrlRef.current = runtimeConfig.skyboxUrl;
        defaultLandShapeRef.current = runtimeConfig.landShape;
        setCurrentWorldTemplate(defaultWorldTemplateRef.current);
        setCurrentWorldSkyboxUrl(
          defaultSkyboxUrlRef.current || defaultSkyboxUrlForTemplate(defaultWorldTemplateRef.current),
        );
        try {
          const savedTemplate = window.localStorage.getItem(NEW_WORLD_TEMPLATE_KEY);
          const savedSkyboxUrl = window.localStorage.getItem(NEW_WORLD_SKYBOX_KEY);
          const savedWorldName = window.localStorage.getItem(NEW_WORLD_NAME_KEY);
          const savedPrivate = window.localStorage.getItem(NEW_WORLD_PRIVATE_KEY);
          const savedChunkSize = window.localStorage.getItem(NEW_WORLD_CHUNK_SIZE_KEY);
          const savedDayNightMode = window.localStorage.getItem(NEW_WORLD_DAY_NIGHT_MODE_KEY);
          const savedLightingMood = window.localStorage.getItem(NEW_WORLD_LIGHTING_MOOD_KEY);
          const savedWaterSettings = window.localStorage.getItem(NEW_WORLD_WATER_SETTINGS_KEY);
          setNewWorldTemplate(
            parseWorldTemplateId(savedTemplate, defaultWorldTemplateRef.current),
          );
          setNewWorldSkyboxUrl(
            savedSkyboxUrl ||
              defaultSkyboxUrlRef.current ||
              defaultSkyboxUrlForTemplate(defaultWorldTemplateRef.current),
          );
          setNewWorldName(savedWorldName ?? "");
          setNewWorldPrivate(savedPrivate === "1");
          setNewWorldDayNightMode(parseDayNightMode(savedDayNightMode, runtimeConfig.dayNightMode));
          setNewWorldLightingMood(parseLightingMood(savedLightingMood, runtimeConfig.lightingMood));
          setNewWorldWaterSettings(parseWaterSettings(savedWaterSettings ? JSON.parse(savedWaterSettings) : undefined));
          if (savedChunkSize) {
            const parsed = Math.round(Number(savedChunkSize));
            if (Number.isFinite(parsed)) {
              setNewWorldChunkSize(Math.min(64, Math.max(1, parsed)));
            }
          }
        } catch {
          setNewWorldTemplate(defaultWorldTemplateRef.current);
          setNewWorldSkyboxUrl(
            defaultSkyboxUrlRef.current || defaultSkyboxUrlForTemplate(defaultWorldTemplateRef.current),
          );
          setNewWorldName("");
          setNewWorldPrivate(false);
          setNewWorldChunkSize(8);
          setNewWorldDayNightMode(runtimeConfig.dayNightMode);
          setNewWorldLightingMood(runtimeConfig.lightingMood);
          setNewWorldWaterSettings(runtimeConfig.waterSettings);
        }
        const sharedLocation = parseSharedLocation();
        sharedLocationRef.current = sharedLocation;
        const configDefault = canonicalWorldId(runtimeConfig.worldId);
        rememberWorld(configDefault);
        let initial = sharedLocation?.worldId ?? configDefault;
        try {
          const saved = window.localStorage.getItem(ACTIVE_WORLD_KEY);
          if (!sharedLocation && saved && saved.trim()) initial = canonicalWorldId(saved);
        } catch {
          /* ignore */
        }
        rememberWorld(initial);
        runtimeConfig.worldId = initial;
        setActiveWorldId(initial);
        void refreshWorldList(initial);
      })
      .catch((error) => {
        console.warn("Tellus startup state failed to load", error);
        if (!cancelled) {
          setRuntimeConfigLoaded(true);
          setActiveWorldId(runtimeConfig.worldId);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(NEW_WORLD_TEMPLATE_KEY, newWorldTemplate);
      window.localStorage.setItem(NEW_WORLD_SKYBOX_KEY, newWorldSkyboxUrl);
      window.localStorage.setItem(NEW_WORLD_NAME_KEY, newWorldName);
      window.localStorage.setItem(NEW_WORLD_PRIVATE_KEY, newWorldPrivate ? "1" : "0");
      window.localStorage.setItem(NEW_WORLD_CHUNK_SIZE_KEY, String(newWorldChunkSize));
      window.localStorage.setItem(NEW_WORLD_DAY_NIGHT_MODE_KEY, newWorldDayNightMode);
      window.localStorage.setItem(NEW_WORLD_LIGHTING_MOOD_KEY, newWorldLightingMood);
      window.localStorage.setItem(NEW_WORLD_WATER_SETTINGS_KEY, JSON.stringify(newWorldWaterSettings));
    } catch {
      /* ignore */
    }
  }, [
    newWorldTemplate,
    newWorldSkyboxUrl,
    newWorldName,
    newWorldPrivate,
    newWorldChunkSize,
    newWorldDayNightMode,
    newWorldLightingMood,
    newWorldWaterSettings,
  ]);

  useEffect(() => {
    return () => {
      if (worldCreateNoteTimerRef.current !== undefined) {
        window.clearTimeout(worldCreateNoteTimerRef.current);
      }
    };
  }, []);

  // (Re)create the world view whenever the active world changes — load that world's state, then mount it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeWorldId) return;
    runtimeConfig.worldId = activeWorldId;
    let cancelled = false;
    let world: TellusWorldApi | null = null;
    void resolveWorldRenderProfile(activeWorldId)
      .then(async (profile) => {
        if (cancelled) return;
        // The resolved profile already folds in the user's persisted per-world skybox pick
        // (resolveWorldRenderProfile merges the local world profile over the server metadata).
        setCurrentWorldTemplate(profile.template);
        setCurrentWorldSkyboxUrl(profile.skyboxUrl);
        setCurrentWorldPrivate(profile.isPublic === false);
        setCurrentDayNightMode(profile.dayNightMode);
        setCurrentDayNightCycleMs(profile.dayNightCycleMs);
        setCurrentLightingMood(profile.lightingMood);
        setCurrentWaterSettings(profile.waterSettings);
        setNewWorldWaterSettings(profile.waterSettings);
        setTerrainTuningDraft(terrainTuningFromLandShape(profile.landShape));
        runtimeConfig.worldTemplate = profile.template;
        runtimeConfig.skyboxUrl = profile.skyboxUrl;
        runtimeConfig.landShape = profile.landShape;
        runtimeConfig.dayNightMode = profile.dayNightMode;
        runtimeConfig.dayNightCycleMs = profile.dayNightCycleMs;
        runtimeConfig.dayNightStart = profile.dayNightStart;
        runtimeConfig.lightingMood = profile.lightingMood;
        runtimeConfig.waterSettings = profile.waterSettings;
        applyWorldTerrainTemplate(profile.template, profile.landShape);
        if (profile.sceneUrl) {
          pendingInteriorSceneUrlsRef.current[activeWorldId] = profile.sceneUrl;
        }
        // World scale BEFORE any terrain/state work: derived from the world NAME (large-* → 3×,
        // mega-* → 5×) so every client — and the Hyades terrain port — agrees with no protocol change.
        setWorldScale(worldScaleForId(activeWorldId));
        rebuildDistantIslandSpecs();
        await loadTellusState().catch(() => undefined);
        // Chunked worlds: learn bounds (renderer edge-clamp) + arm centre-spawn/flat-grounding BEFORE
        // the world view mounts. Clears both for non-chunked special worlds, so switching back is clean.
        await loadChunkedWorldBounds().catch(() => undefined);
      })
      .then(() => {
        if (cancelled) return;
        const initialInteriorSceneUrl = pendingInteriorSceneUrlsRef.current[activeWorldId];
        if (initialInteriorSceneUrl) {
          delete pendingInteriorSceneUrlsRef.current[activeWorldId];
        }
        world = createTellusWorld(container, setSnapshot, { initialInteriorSceneUrl });
        worldRef.current = world;
        const mountedWorld = world;
        const sharedLocation = sharedLocationRef.current;
        if (
          sharedLocation &&
          !sharedLocation.consumed &&
          sharedLocation.worldId === activeWorldId
        ) {
          sharedLocation.consumed = true;
          window.setTimeout(() => {
            if (!cancelled && worldRef.current === mountedWorld) {
              mountedWorld.warpTo(sharedLocation.x, sharedLocation.z);
            }
          }, 250);
        }
      });
    return () => {
      cancelled = true;
      world?.destroy();
      worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorldId, worldRenderRevision]);

  useEffect(() => {
    if (!activeWorldId || !currentWorldSkyboxUrl) return;
    runtimeConfig.skyboxUrl = currentWorldSkyboxUrl;
    void worldRef.current?.setSkyboxUrl(currentWorldSkyboxUrl).then((loadedUrl) => {
      if (!loadedUrl) return;
      const normalizedLoadedUrl = normalizeSkyboxUrl(loadedUrl);
      if (normalizedLoadedUrl !== currentWorldSkyboxUrl) {
        setCurrentWorldSkyboxUrl(normalizedLoadedUrl);
        runtimeConfig.skyboxUrl = normalizedLoadedUrl;
        if (activeWorldId) {
          rememberWorldProfile(activeWorldId, { skyboxUrl: normalizedLoadedUrl });
        }
      }
    }).catch((error) => {
      console.warn("Tellus skybox update failed", error);
    });
  }, [activeWorldId, currentWorldSkyboxUrl]);

  const selectedThing = useMemo(
    () =>
      snapshot.generated.find((thing) => thing.id === snapshot.selectedThingId) ??
      snapshot.generated[snapshot.generated.length - 1],
    [snapshot.generated, snapshot.selectedThingId],
  );
  const activeSelectedThing = snapshot.selectedThingId ? selectedThing : null;
  const selectedRuntimeProfile = activeSelectedThing
    ? buildWorldThingRuntimeProfile(activeSelectedThing, {
        groundY: groundHeightAt(activeSelectedThing.position.x, activeSelectedThing.position.z),
      })
    : null;
  const debugGeneratedStats = useMemo(() => {
    let ready = 0;
    let pending = 0;
    let failed = 0;
    let missingIdentity = 0;
    let assetStoreBacked = 0;
    for (const thing of snapshot.generated) {
      if (thing.generationStatus === "failed") failed += 1;
      else if (thing.generationStatus === "queued" || thing.generationStatus === "generating") pending += 1;
      else if (thing.generationStatus === "ready" || thing.modelUrl) ready += 1;
      const identity = normalizeWorldThingAssetIdentity(thing.modelUrl, thing.assetStoreModelId);
      if (identity.source === "asset-store") assetStoreBacked += 1;
      if (identity.source === "missing") missingIdentity += 1;
    }
    return {
      total: snapshot.generated.length,
      ready,
      pending,
      failed,
      missingIdentity,
      assetStoreBacked,
    };
  }, [snapshot.generated]);
  // Embedded clip names of the selected thing's LOADED model ([] until the GLB mounts — the world
  // publishes a snapshot when the model lands, so this re-renders with the clip list).
  const selectedClipNames = activeSelectedThing
    ? worldRef.current?.getGeneratedClipNames(activeSelectedThing.id) ?? []
    : [];
  const selectedThingVehicleMode = selectedThing ? vehicleMode(selectedThing) : null;
  const selectedThingIsMount = selectedThing ? isMountThing(selectedThing) : false;
  const localPetOwnerId = snapshot.userId || snapshot.visitorId || tellusUserId();
  const selectedThingIsLocalPet =
    Boolean(activeSelectedThing?.petOwnerId) && activeSelectedThing?.petOwnerId === localPetOwnerId;
  const mapRadius = OCEAN_RADIUS * 0.42;
  // The minimap maps world (x,z) -> a [0,1] fraction. Chunked worlds use a local window centered
  // on the player/spawn so terrain and water features are readable instead of microscopic.
  const chunkedMapDims = isChunkedWorldId(activeWorldId ?? "") ? getChunkedWorldChunks() : null;
  const chunkedMapCenter =
    chunkedMapDims
      ? snapshot.visitorPosition
        ? { x: snapshot.visitorPosition.x, z: snapshot.visitorPosition.z }
        : chunkedWorldCenter() ?? {
            x: (chunkedMapDims.w * CHUNK_SPAN) / 2,
            z: (chunkedMapDims.h * CHUNK_SPAN) / 2,
          }
      : null;
  const mapExtentX = chunkedMapDims ? CHUNK_SPAN * 8 : mapRadius * 2;
  const mapExtentZ = chunkedMapDims ? CHUNK_SPAN * 8 : mapRadius * 2;
  const mapFracX = (x: number) =>
    chunkedMapCenter ? (x - (chunkedMapCenter.x - mapExtentX / 2)) / mapExtentX : x / (mapRadius * 2) + 0.5;
  const mapFracZ = (z: number) =>
    chunkedMapCenter ? (z - (chunkedMapCenter.z - mapExtentZ / 2)) / mapExtentZ : z / (mapRadius * 2) + 0.5;
  const mapFracToWorld = (fx: number, fz: number): { x: number; z: number } =>
    chunkedMapCenter
      ? {
          x: chunkedMapCenter.x - mapExtentX / 2 + fx * mapExtentX,
          z: chunkedMapCenter.z - mapExtentZ / 2 + fz * mapExtentZ,
        }
      : { x: (fx - 0.5) * mapRadius * 2, z: (fz - 0.5) * mapRadius * 2 };
  const mapPointStyle = (position: Vec3): React.CSSProperties => ({
    left: `${clamp(mapFracX(position.x) * 100, 0, 100)}%`,
    top: `${clamp(mapFracZ(position.z) * 100, 0, 100)}%`,
  });
  // Paint a real top-down terrain raster onto the minimap backdrop (was a static decorative disc
  // that reflected nothing — wrong for chunked worlds especially). Samples live ground relief through the
  // SAME mapFracToWorld transform the markers use, so terrain and markers register exactly.
  // Repaint as the player crosses into a new ~48-unit cell so freshly-streamed chunk relief shows up.
  const mapPlayerCell = snapshot.visitorPosition
    ? `${Math.round(snapshot.visitorPosition.x / 48)}:${Math.round(snapshot.visitorPosition.z / 48)}`
    : "";
  useEffect(() => {
    if (!worldMapOpen) return;
    const canvas = worldMapCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    try {
      const N = 128;
      canvas.width = N;
      canvas.height = N;
      const img = ctx.createImageData(N, N);
      const data = img.data;
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const fx = (i + 0.5) / N;
          const fz = (j + 0.5) / N;
          const w = mapFracToWorld(fx, fz);
          const sample = worldRef.current?.sampleMapPoint(w.x, w.z);
          const h = sample?.height;
          const hasH = Boolean(sample?.loaded) && h !== undefined && Number.isFinite(h);
          const hh = h !== undefined && Number.isFinite(h) ? h : SEA_LEVEL;
          const terrainSampleKind = sample?.kind ?? "water";
          let r: number, g: number, b: number;
          if (terrainSampleKind === "water" || hh <= SEA_LEVEL) {
            const depth = clamp((SEA_LEVEL - hh) / 12, 0, 1);
            if (!hasH) {
              r = 24;
              g = 58;
              b = 47;
            } else {
              r = lerp(56, 18, depth);
              g = lerp(128, 70, depth);
              b = lerp(114, 92, depth);
            }
          } else {
            const t = clamp((hh - SEA_LEVEL) / 16, 0, 1);
            const base = BIOME_MAP_RGB[terrainSampleKind] ?? BIOME_MAP_RGB.meadow;
            r = base[0];
            g = base[1];
            b = base[2];
            if (!hasH) {
              const avg = (r + g + b) / 3;
              r = lerp(avg, r, 0.4) * 0.45;
              g = lerp(avg, g, 0.4) * 0.45;
              b = lerp(avg, b, 0.4) * 0.45;
            } else {
              const lift = clamp(t, 0, 1);
              r = lerp(r, 232, lift * 0.22);
              g = lerp(g, 232, lift * 0.22);
              b = lerp(b, 238, lift * 0.22);
            }
            const he = worldRef.current?.sampleMapPoint(w.x + 2, w.z).height;
            const hn = worldRef.current?.sampleMapPoint(w.x, w.z + 2).height;
            if (hasH && he !== undefined && hn !== undefined && Number.isFinite(he) && Number.isFinite(hn)) {
              const slope = hh - he + (hh - hn);
              const shade = clamp((hh - he) * 0.12 + 1, 0.78, 1.18);
              const combinedShade = clamp(shade + slope * 0.08, 0.72, 1.24);
              r *= combinedShade;
              g *= combinedShade;
              b *= combinedShade;
            }
          }
          if (!hasH && terrainSampleKind !== "water") {
            r *= 0.65;
            g *= 0.65;
            b *= 0.65;
          }
          if (terrainSampleKind === "water" && hasH) {
            const he = worldRef.current?.sampleMapPoint(w.x + 2, w.z).height;
            if (he !== undefined && Number.isFinite(he)) {
              const shade = clamp((hh - he) * 0.08 + 1, 0.88, 1.12);
              r *= shade;
              g *= shade;
              b *= shade;
            }
          }
          const idx = (j * N + i) * 4;
          data[idx] = clamp(r, 0, 255);
          data[idx + 1] = clamp(g, 0, 255);
          data[idx + 2] = clamp(b, 0, 255);
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    } catch {
      /* best-effort backdrop; markers still render over it */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldMapOpen, activeWorldId, mapExtentX, mapExtentZ, mapPlayerCell]);
  const handleWorldMapClick = (event: React.MouseEvent<HTMLElement>) => {
    // Ignore clicks on the overlaid info panel / status badge — only the map plane warps.
    const target = event.target as HTMLElement;
    if (
      target.closest(".world-info-panel") ||
      target.closest(".world-map-status") ||
      target.closest(".world-map-actor-list")
    ) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const fx = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const fz = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const pos = mapFracToWorld(fx, fz);
    worldRef.current?.warpTo(pos.x, pos.z);
  };
  const pendingGenerated = snapshot.generated.filter(
    (thing) =>
      thing.generationStatus === "queued" ||
      thing.generationStatus === "generating",
  );
  const remoteAgents = snapshot.remoteVisitors.filter((visitor) =>
    visitor.visitorId.startsWith("agent:"),
  );
  const remotePlayers = snapshot.remoteVisitors.filter(
    (visitor) => !visitor.visitorId.startsWith("agent:"),
  );
  const playerList = [
    ...(snapshot.visitorPosition
      ? [{ visitorId: "local-player", name: "You", position: snapshot.visitorPosition }]
      : []),
    ...remotePlayers,
  ];
  const actorName = (visitor: { visitorId: string; name?: string }): string => {
    return friendlyVisitorName(visitor.visitorId, visitor.name, snapshot.visitorId);
  };
  const currentWorldId = activeWorldId ?? runtimeConfig.worldId;
  useEffect(() => {
    if (!worldChatOpen || chatTab !== "dm") return;
    const controller = new AbortController();
    let cancelled = false;
    const targetWorlds = worlds
      .map(canonicalWorldId)
      .filter((worldId) => worldId && worldId !== currentWorldId)
      .slice(0, 12);
    if (targetWorlds.length === 0) return () => controller.abort();

    const loadPresence = async () => {
      const entries = await Promise.all(
        targetWorlds.map(async (worldId) => {
          try {
            const res = await fetch(
              worldApiUrl(`/api/world/${encodeURIComponent(worldId)}/state?userId=${encodeURIComponent(tellusUserId())}`),
              { cache: "no-store", signal: controller.signal },
            );
            if (!res.ok) return [worldId, [] as WorldPresence[]] as const;
            const parsed = await res.json();
            return [worldId, (presenceFromWorldPatch(parsed) ?? []).filter(isLivePresence)] as const;
          } catch {
            return [worldId, [] as WorldPresence[]] as const;
          }
        }),
      );
      if (cancelled) return;
      setCrossWorldPresence((prev) => {
        const next: Record<string, WorldPresence[]> = { ...prev };
        for (const [worldId, presence] of entries) next[worldId] = presence;
        return next;
      });
    };

    void loadPresence();
    const interval = window.setInterval(() => void loadPresence(), 10000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [chatTab, currentWorldId, worldChatOpen, worlds.join("\n")]);
  const portalTargetOptions = worlds.filter((worldId) => worldId && worldId !== currentWorldId);
  useEffect(() => {
    if (portalTargetWorldId && portalTargetOptions.includes(portalTargetWorldId)) return;
    setPortalTargetWorldId(portalTargetOptions[0] ?? "");
  }, [portalTargetOptions.join("\n"), portalTargetWorldId]);
  const portalPanelNotice = useMemo(() => {
    for (let i = snapshot.logs.length - 1; i >= 0; i--) {
      const text = snapshot.logs[i]?.text ?? "";
      if (/portal|door|rejected/i.test(text)) return text;
    }
    return "";
  }, [snapshot.logs]);
  const chatTargets = useMemo<OnlineContact[]>(() => {
    const byKey = new Map<string, OnlineContact>();
    const merge = (presence: WorldPresence, worldId: string, currentWorld: boolean) => {
      if (presence.visitorId === snapshot.visitorId) return;
      if (presence.ownerUserId && presence.ownerUserId === snapshot.userId) return;
      const kind = presence.visitorId.startsWith("agent:") ? "agent" : "player";
      const key = kind === "player" && presence.ownerUserId
        ? `player:${presence.ownerUserId}`
        : `${kind}:${presence.visitorId}`;
      const next: OnlineContact = {
        visitorId: presence.visitorId,
        name: actorName(presence),
        kind,
        worldId,
        position: presence.position,
        online: isLivePresence(presence),
        currentWorld,
        lastSeenAt: presence.lastSeenAt,
      };
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, next);
        return;
      }
      const prevSeen = prev.lastSeenAt ? Date.parse(prev.lastSeenAt) : 0;
      const nextSeen = next.lastSeenAt ? Date.parse(next.lastSeenAt) : 0;
      if (
        next.currentWorld ||
        (!prev.currentWorld && (nextSeen >= prevSeen || (!prev.position && next.position)))
      ) {
        byKey.set(key, next);
      }
    };

    for (const visitor of [...remoteAgents, ...remotePlayers]) merge(visitor, currentWorldId, true);
    for (const [worldId, presence] of Object.entries(crossWorldPresence)) {
      if (worldId === currentWorldId) continue;
      for (const visitor of presence) merge(visitor, worldId, false);
    }

    if (agentStatus?.optedIn && agentStatus.visitorId) {
      const agentWorldId = canonicalWorldId(agentStatus.worldId || currentWorldId);
      const key = `agent:${agentStatus.visitorId}`;
      const existing = byKey.get(key);
      byKey.set(key, {
        visitorId: agentStatus.visitorId,
        name: existing?.name || actorName({ visitorId: agentStatus.visitorId, name: "Your agent" }),
        kind: "agent",
        worldId: existing?.worldId || agentWorldId,
        position: existing?.position,
        online: existing?.online ?? Boolean(agentStatus.enabled || agentStatus.ownerPresent || agentStatus.offlinePersistence),
        currentWorld: existing?.currentWorld ?? agentWorldId === currentWorldId,
        lastSeenAt: existing?.lastSeenAt || agentStatus.lastTickAt || undefined,
      });
    }

    return [...byKey.values()]
      .filter((contact) => contact.online)
      .sort((a, b) => {
        if (a.currentWorld !== b.currentWorld) return a.currentWorld ? -1 : 1;
        if (a.kind !== b.kind) return a.kind === "agent" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [
    agentStatus?.enabled,
    agentStatus?.lastTickAt,
    agentStatus?.offlinePersistence,
    agentStatus?.optedIn,
    agentStatus?.ownerPresent,
    agentStatus?.visitorId,
    agentStatus?.worldId,
    crossWorldPresence,
    currentWorldId,
    remoteAgents,
    remotePlayers,
    snapshot.userId,
    snapshot.visitorId,
  ]);
  const openDirectChatFor = (visitor: { visitorId: string; name?: string; position?: Vec3 }) => {
    const target = {
      visitorId: visitor.visitorId,
      name: actorName(visitor),
      kind: visitor.visitorId.startsWith("agent:") ? "agent" as const : "player" as const,
      worldId: currentWorldId,
      position: visitor.position,
    };
    setWorldChatOpen(true);
    setWorldChatChannel("dm");
    setWorldChatDmTarget(target);
    setWorldChatInput("");
  };
  const goToOnlineContact = (contact: OnlineContact) => {
    if (!contact.position) return;
    if (contact.worldId === currentWorldId) {
      worldRef.current?.warpTo(contact.position.x, contact.position.z);
      return;
    }
    const nextLocation = {
      worldId: canonicalWorldId(contact.worldId),
      x: contact.position.x,
      z: contact.position.z,
      consumed: false,
    };
    sharedLocationRef.current = nextLocation;
    try {
      window.history.replaceState(null, "", shareLocationUrl(nextLocation.worldId, nextLocation.x, nextLocation.z));
    } catch {
      /* ignore */
    }
    switchWorld(nextLocation.worldId);
  };
  const toggleMicControl = () => {
    if (!txEnabled) {
      void toggleTx();
      return;
    }
    toggleMic();
  };
  const visibleWorldChat = snapshot.worldChat.filter((message) => {
    if (worldChatChannel === "world") return message.channel === "world";
    if (worldChatChannel === "dm") {
      if (message.channel !== "dm") return false;
      const selfId = snapshot.visitorId;
      const targetId = worldChatDmTarget?.visitorId;
      const involvesSelf =
        !selfId || message.visitorId === selfId || message.recipientId === selfId;
      if (!targetId) return involvesSelf;
      return (
        involvesSelf &&
        (message.visitorId === targetId || message.recipientId === targetId)
      );
    }
    if (message.channel !== "nearby") return false;
    if (!message.position || !snapshot.visitorPosition) return true;
    return distance2D(snapshot.visitorPosition, message.position) <= 36;
  });
  const sendWorldChatMessage = () => {
    if (worldChatChannel === "dm" && !worldChatDmTarget) return;
    if (
      worldChatChannel === "dm" &&
      worldChatDmTarget?.visitorId &&
      agentStatus?.visitorId &&
      worldChatDmTarget.visitorId === agentStatus.visitorId
    ) {
      void sendAgentMessage(worldChatInput).then((sent) => {
        if (!sent) return;
        setWorldChatInput("");
        setChatTab("agent");
      });
      return;
    }
    const sent = worldRef.current?.sendWorldChat(
      worldChatInput,
      worldChatChannel,
      worldChatDmTarget?.visitorId,
      worldChatDmTarget?.name,
    );
    if (sent) setWorldChatInput("");
  };
  const inventory = snapshot.generated.filter(
    (thing) => thing.ownerUserId === snapshot.userId,
  );

  const submitPrompt = () => {
    worldRef.current?.submitVisitorPrompt(prompt);
    setPrompt("");
    setCreatePromptOpen(false);
  };

  const focusCreatePrompt = () => {
    setCreatePromptOpen((open) => !open);
    window.requestAnimationFrame(() => promptRef.current?.focus());
  };

  const isToolOpen = (menu: ToolMenu): boolean => openToolMenus.includes(menu);

  const toggleAssetDrawer = () => {
    setAssetPanelOpen((open) => {
      if (!open) setAssetPanelTab((current) => current === "avatar" ? "building" : current);
      return !open;
    });
  };

  const openAssetDrawerTab = (tab: AssetPanelTab) => {
    if (assetPanelOpen && assetPanelTab === tab) {
      setAssetPanelOpen(false);
      return;
    }
    setAssetPanelOpen(true);
    setAssetPanelTab(tab);
  };

  const closeToolPanel = (menu: ToolMenu) => {
    setOpenToolMenus((current) => current.filter((item) => item !== menu));
  };

  const toggleToolPanel = (menu: ToolMenu) => {
    setOpenToolMenus((current) =>
      current.includes(menu)
        ? current.filter((item) => item !== menu)
        : [...current, menu],
    );
  };

  const showMeshToolbar = () => {
    if (snapshot.selectedThingId) {
      worldRef.current?.selectGenerated(undefined);
      return;
    }
    if (snapshot.generated.length === 0) {
      setWorldMapOpen(true);
      setMapActorList("items");
      return;
    }
    if (!snapshot.selectedThingId) {
      worldRef.current?.selectGenerated(
        snapshot.generated[snapshot.generated.length - 1].id,
      );
    }
  };

  const debugPanel = showFps ? (
    <div className="debug-stats-panel" aria-label="Tellus debug stats">
      <div className="debug-stats-grid">
        <span>FPS</span>
        <strong>{fps}</strong>
        <span>Items</span>
        <strong>{debugGeneratedStats.total}</strong>
        <span>Ready</span>
        <strong>{debugGeneratedStats.ready}</strong>
        <span>Pending</span>
        <strong>{debugGeneratedStats.pending}</strong>
        <span>Failed</span>
        <strong>{debugGeneratedStats.failed}</strong>
        <span>Missing ID</span>
        <strong>{debugGeneratedStats.missingIdentity}</strong>
        <span>Store IDs</span>
        <strong>{debugGeneratedStats.assetStoreBacked}</strong>
        <span>Players</span>
        <strong>{remotePlayers.length}</strong>
        <span>Agents</span>
        <strong>{remoteAgents.length}</strong>
      </div>
      {ambientStats && (
        <div className="debug-stats-row">
          veg T{ambientStats.vegetation.tier} · {ambientStats.vegetation.chunks} chunks ·{" "}
          {Math.round(ambientStats.vegetation.grassIndices / 3)} grass tris ·{" "}
          {ambientStats.vegetation.trees} trees · physics {ambientStats.physicsBodies} · rapier{" "}
          {ambientStats.rapierSolids}
        </div>
      )}
      {ambientStats?.chunkTerrain && (
        <div className="debug-stats-row">
          terrain chunks {ambientStats.chunkTerrain.active} active ·{" "}
          {ambientStats.chunkTerrain.pending} pending · {ambientStats.chunkTerrain.failed} failed
        </div>
      )}
      {isChunkedWorldId(activeWorldId ?? "") && (() => {
        const side = 2 * chunkLoadRadius + 1;
        return (
          <div className="debug-chunk-control">
            <div>
              <span>Draw distance</span>
              <strong>{side}×{side} chunks</strong>
            </div>
            <input
              type="range"
              aria-label="Chunk load radius"
              data-testid="chunk-load-radius-slider"
              min={CHUNK_LOAD_RADIUS_MIN}
              max={CHUNK_LOAD_RADIUS_MAX}
              step={1}
              value={chunkLoadRadius}
              onChange={(event) => onChunkLoadRadius(Number(event.target.value))}
            />
          </div>
        );
      })()}
      <div className="debug-stats-row">
        P2P {p2pStats?.tx ? "TX on" : "TX off"} ·{" "}
        {(p2pStats?.rx ?? rxEnabled) ? "RX on" : "RX off"} · {p2pStats?.rxStreams ?? 0}/16 streams
      </div>
      {selectedRuntimeProfile && activeSelectedThing && (
        <div className="debug-object-profile">
          <strong>{activeSelectedThing.prompt}</strong>
          <span>{selectedRuntimeProfile.controllerKind} · {selectedRuntimeProfile.placementMode}</span>
          <span>
            asset {selectedRuntimeProfile.asset.source} · {selectedRuntimeProfile.asset.stableKey}
          </span>
          <span>
            h {selectedRuntimeProfile.targetHeight.toFixed(2)} · seat{" "}
            {selectedRuntimeProfile.seatHeight.toFixed(2)} · scale {activeSelectedThing.scale.toFixed(2)}
          </span>
          {selectedRuntimeProfile.groundOffset !== undefined && (
            <span>ground offset {selectedRuntimeProfile.groundOffset.toFixed(2)}</span>
          )}
        </div>
      )}
      {(p2pStats?.peers ?? []).slice(0, 4).map((peer) => (
        <div key={peer.id} className="debug-stats-row">
          {peer.id.slice(0, 6)} {peer.state} · {Math.round(peer.kbps)} kbps
        </div>
      ))}
      <div className="debug-stats-hint">triple-click logo or press ` to hide</div>
    </div>
  ) : null;

  useEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 36), 116)}px`;
  }, [prompt]);

  const repeatTimerRef = useRef<number | undefined>(undefined);
  const stopRepeating = () => {
    if (repeatTimerRef.current === undefined) return;
    window.clearInterval(repeatTimerRef.current);
    repeatTimerRef.current = undefined;
  };
  const pressRepeat = (action: () => void) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      stopRepeating();
      action();
      repeatTimerRef.current = window.setInterval(action, 140);
    },
    onPointerUp: stopRepeating,
    onPointerLeave: stopRepeating,
    onPointerCancel: stopRepeating,
  });

  useEffect(() => stopRepeating, []);

  return (
    <main
      className={[
        "tellus-shell",
        openToolMenus.length > 0 || assetPanelOpen ? "" : "mesh-tools-hidden",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <section className="world-panel" aria-label="Tellus world">
        <div ref={containerRef} className="world-canvas" />
        {worldChatOpen && (
          <aside className="world-mini-chat" aria-label="World chat">
            <header>
              <span>
                {chatTab === "agent"
                  ? "Your Agent"
                  : worldChatChannel === "dm"
                    ? worldChatDmTarget
                      ? `DM - ${worldChatDmTarget.name}`
                      : "DMs"
                    : "World Chat"}
              </span>
              <button type="button" className="panel-mini-button" onClick={() => setWorldChatOpen(false)}>
                Close
              </button>
            </header>
            <nav className="mini-chat-tabs" aria-label="Chat channels">
              {(["world", "dm", "agent"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={chatTab === tab ? "active" : ""}
                  onClick={() => {
                    setChatTab(tab);
                    if (tab === "world" || tab === "dm") setWorldChatChannel(tab);
                  }}
                >
                  {tab === "dm" ? "DMs" : tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
            {chatTab === "agent" && renderAgentTab()}
            {chatTab !== "agent" && (
              <>
                {worldChatChannel === "dm" && (
              <div className="mini-chat-dm-targets" aria-label="DM recipients">
                {chatTargets.length === 0 ? (
                  <span>No online players or agents found.</span>
                ) : (
                  <>
                    <span>To</span>
                    <div>
                      {chatTargets.map((target) => (
                        <div
                          key={target.visitorId}
                          className={`mini-chat-contact ${worldChatDmTarget?.visitorId === target.visitorId ? "active" : ""}`}
                          title={`${target.name} in ${worldDisplayName(target.worldId)}`}
                        >
                          <button
                            type="button"
                            className="mini-chat-contact-main"
                            onClick={() => setWorldChatDmTarget(target)}
                          >
                            <span className="presence-dot online" aria-hidden="true" />
                            <span>{target.name}</span>
                            <small>{target.currentWorld ? "here" : worldDisplayName(target.worldId)}</small>
                          </button>
                          <button
                            type="button"
                            className="mini-chat-contact-go"
                            disabled={!target.position}
                            onClick={(event) => {
                              event.stopPropagation();
                              goToOnlineContact(target);
                            }}
                          >
                            Go
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="mini-chat-log" role="log" aria-live="polite">
              {visibleWorldChat.slice(-24).map((message) => (
                <article
                  key={message.id}
                  className={`mini-chat-entry ${message.channel}`}
                  title={
                    message.position
                      ? `${message.channel} at x ${Math.round(message.position.x)}, z ${Math.round(message.position.z)}`
                      : message.channel
                  }
                >
                  <strong>
                    {message.senderName || "Visitor"}
                    <span>
                      {message.channel === "dm"
                        ? message.recipientName
                          ? `dm to ${message.recipientName}`
                          : "dm"
                        : message.channel === "nearby"
                          ? "nearby"
                          : "world"}
                    </span>
                  </strong>
                  <p>{message.text}</p>
                </article>
              ))}
              {visibleWorldChat.length === 0 && (
                <article className="mini-chat-entry empty">
                  <strong>
                    {worldChatChannel === "dm"
                      ? "DMs"
                      : worldChatChannel === "nearby"
                        ? "Nearby"
                        : "World"}
                  </strong>
                  <p>
                    {worldChatChannel === "dm" && !worldChatDmTarget
                      ? "Pick a player or agent to start a DM."
                      : "No messages yet."}
                  </p>
                </article>
              )}
            </div>
            <textarea
              className="mini-chat-input"
              value={worldChatInput}
              maxLength={800}
              rows={2}
              disabled={worldChatChannel === "dm" && !worldChatDmTarget}
              placeholder={
                worldChatChannel === "dm"
                  ? worldChatDmTarget
                    ? `Message ${worldChatDmTarget.name}`
                    : "Choose someone to DM"
                  : worldChatChannel === "nearby"
                    ? "Say something nearby"
                    : "Say something to the world"
              }
              onChange={(event) => setWorldChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendWorldChatMessage();
                }
              }}
            />
            <div className="mini-chat-actions">
              <button
                type="button"
                className="mini-chat-submit"
                disabled={!worldChatInput.trim() || (worldChatChannel === "dm" && !worldChatDmTarget)}
                onClick={sendWorldChatMessage}
              >
                Send
              </button>
              <div className="mini-chat-call-controls" aria-label="Voice and video controls">
                <button
                  type="button"
                  className={audioListen ? "mini-chat-call-button active" : "mini-chat-call-button"}
                  title={audioListen ? "Mute incoming audio" : "Hear others"}
                  onClick={toggleAudioListen}
                >
                  {audioListen ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
                <button
                  type="button"
                  className={txEnabled && micOn ? "mini-chat-call-button active" : "mini-chat-call-button"}
                  title={!txEnabled ? "Start camera and microphone" : micOn ? "Mute microphone" : "Unmute microphone"}
                  disabled={!p2pSupported}
                  onClick={toggleMicControl}
                >
                  {txEnabled && micOn ? <Mic size={15} /> : <MicOff size={15} />}
                </button>
                <button
                  type="button"
                  className={txEnabled ? "mini-chat-call-button active" : "mini-chat-call-button primary"}
                  title={txEnabled ? "Stop sharing camera" : "Start camera"}
                  disabled={!p2pSupported}
                  onClick={() => void toggleTx()}
                >
                  {txEnabled ? <Video size={15} /> : <VideoOff size={15} />}
                </button>
              </div>
            </div>
              </>
            )}
          </aside>
        )}
        <div className="world-top-bar">
          <div className="top-left-cluster" style={{ position: "relative" }}>
            <div
              className="brand-mark"
              onClick={handleBrandTripleClick}
              style={{ userSelect: "none" }}
            >
              <span className="brand-sigil">T</span>
              <span>Tellus</span>
              <small>World Weaver</small>
            </div>
            {debugPanel}
            <div className="brand-hud-actions">
              <AuthControls />
              <details className="world-help">
                <summary title="Controls" aria-label="Controls">
                  <CircleHelp size={16} />
                </summary>
                <div className="world-help-list">
                  <span>
                    <strong>Move</strong>
                    <small>WASD / arrows</small>
                  </span>
                  <span>
                    <strong>Look</strong>
                    <small>drag</small>
                  </span>
                  <span>
                    <strong>Zoom</strong>
                    <small>scroll</small>
                  </span>
                  {snapshot.sailingThingId && (
                    <span>
                      <strong>Pilot</strong>
                      <small>active</small>
                    </span>
                  )}
                </div>
              </details>
            </div>
          </div>
        </div>
        {worldMenuOpen && (
        <aside className="world-menu-panel" aria-label="World menu">
          <div className="world-menu-head">
            <span>World</span>
            <button
              type="button"
              className="icon-button"
              title="Close world menu"
              aria-label="Close world menu"
              onClick={() => setWorldMenuOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="top-left-cluster" style={{ position: "relative" }}>
            <div
              className="brand-mark"
              onClick={handleBrandTripleClick}
              style={{ userSelect: "none" }}
            >
              <span className="brand-sigil">T</span>
              <span>Tellus</span>
              <small>World Weaver</small>
            </div>
            {debugPanel}
          </div>
          <div
            className="world-switcher"
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
            }}
          >
            <div className="world-control-group world-picker-group">
              <span>World</span>
              <div className="world-picker-row">
                <select
                  aria-label="Active world"
                  title="Switch world"
                  value={activeWorldId ?? ""}
                  onChange={(e) => switchWorld(e.target.value)}
                >
                  {!activeWorldId && <option value="">…</option>}
                  {worlds.map((w) => (
                    <option key={w} value={w}>
                      {worldOptionLabel(w)}
                    </option>
                  ))}
                </select>
                {activeWorldId &&
                  (() => {
                    const target = activeWorldId;
                    const armed = pendingDeleteWorld === target;
                    const serverDeleteAllowed = canDeleteWorld(target);
                    return (
                      <button
                        type="button"
                        aria-label={
                          armed
                            ? `Confirm ${serverDeleteAllowed ? "delete" : "remove"} world ${target}`
                            : `${serverDeleteAllowed ? "Delete" : "Remove"} world ${target}`
                        }
                        title={
                          armed
                            ? `Click again to ${serverDeleteAllowed ? "permanently delete" : "remove local entry"} "${target}"`
                            : `${serverDeleteAllowed ? "Delete" : "Remove local entry for"} "${target}"`
                        }
                        disabled={deletingWorld}
                        onClick={() => void deleteWorld(target)}
                        onBlur={() => {
                          if (pendingDeleteWorld === target) disarmDeleteWorld();
                        }}
                        className={`world-icon-button ${armed ? "danger armed" : "danger"}`}
                      >
                        {deletingWorld ? "…" : armed ? "Confirm" : <Trash2 size={14} />}
                      </button>
                    );
                  })()}
              </div>
            </div>
            {worlds.length > 0 && (
              <div className="world-control-group world-list-group">
                <span>Worlds</span>
                <div className="world-list" role="list" aria-label="Known worlds">
                  {worlds.map((worldId) => {
                    const active = worldId === (activeWorldId ?? runtimeConfig.worldId);
                    return (
                      <div key={worldId} className={active ? "world-list-row active" : "world-list-row"} role="listitem">
                        <button
                          type="button"
                          className="world-list-switch"
                          aria-current={active ? "true" : undefined}
                          title={`Switch to ${worldDisplayName(worldId)}`}
                          onClick={() => switchWorld(worldId)}
                        >
                          <span>{worldDisplayName(worldId)}</span>
                          <small>{active ? "Current" : worldId}</small>
                        </button>
                        {renderWorldDeleteButton(worldId, "world-icon-button world-list-delete")}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="world-control-group world-name-edit-group">
              <span>Name</span>
              <button
                type="button"
                className="world-name-edit-button"
                title="Rename world"
                aria-label="Rename world"
                onClick={renameActiveWorld}
              >
                <span>{worldDisplayName(activeWorldId ?? runtimeConfig.worldId)}</span>
                <Pencil size={14} />
              </button>
            </div>
            <div className="world-control-group">
              <span>Terrain</span>
              <select
                aria-label="Active world terrain"
                title="Change terrain template for the active world"
                value={currentWorldTemplate}
                onChange={(e) =>
                  updateActiveWorldTemplate(
                    parseWorldTemplateId(e.target.value, defaultWorldTemplateRef.current),
                  )
                }
              >
                {WORLD_TEMPLATE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="world-control-group">
              <span>Sky</span>
              <select
                aria-label="World skybox"
                title="Change skybox for the active world"
                value={currentWorldSkyboxUrl}
                onChange={(e) => updateActiveWorldSkybox(e.target.value)}
              >
                {SKYBOX_OPTIONS.map((option) => (
                  <option key={option.url} value={option.url}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="world-lighting-controls" aria-label="Lighting settings">
              <label className="world-lighting-control">
                <span>Time</span>
                <select
                  aria-label="Day night mode"
                  title="Cycle, lock day or night, hold golden hour, or pause the current time"
                  value={currentDayNightMode}
                  onChange={(e) =>
                    updateActiveWorldLighting({
                      dayNightMode: parseDayNightMode(e.target.value, currentDayNightMode),
                    })
                  }
                >
                  {DAY_NIGHT_MODE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="world-lighting-control cycle-length">
                <span>Minutes</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  aria-label="Day night cycle length in minutes"
                  title="Length of a full day/night cycle"
                  disabled={currentDayNightMode !== "cycle"}
                  value={Math.round(currentDayNightCycleMs / 60000)}
                  onChange={(e) =>
                    updateActiveWorldLighting({
                      dayNightCycleMs: normalizeDayNightCycleMs(
                        Number(e.target.value) * 60000,
                        currentDayNightCycleMs,
                      ),
                    })
                  }
                />
              </label>
              <label className="world-lighting-control mood">
                <span>Mood</span>
                <select
                  aria-label="Lighting mood"
                  title="Global lighting preset for world objects and avatars"
                  value={currentLightingMood}
                  onChange={(e) =>
                    updateActiveWorldLighting({
                      lightingMood: parseLightingMood(e.target.value, currentLightingMood),
                    })
                  }
                >
                  {LIGHTING_MOOD_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="world-water-controls" aria-label="Water settings">
              <label className="world-lighting-control">
                <span>Water</span>
                <select
                  aria-label="Water style"
                  title="Water color and clarity style"
                  value={currentWaterSettings.style}
                  onChange={(e) =>
                    updateActiveWorldWater({ style: e.target.value as WaterStyle })
                  }
                >
                  {WATER_STYLE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="world-lighting-control slider">
                <span>Opacity</span>
                <input
                  type="range"
                  min={0.25}
                  max={0.92}
                  step={0.01}
                  aria-label="Water opacity"
                  value={currentWaterSettings.opacity}
                  onChange={(e) => updateActiveWorldWater({ opacity: Number(e.target.value) })}
                />
              </label>
              <label className="world-lighting-control slider">
                <span>Waves</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  aria-label="Water wave strength"
                  value={currentWaterSettings.waveStrength}
                  onChange={(e) => updateActiveWorldWater({ waveStrength: Number(e.target.value) })}
                />
              </label>
            </div>
            <details className="world-tuning-controls">
              <summary>Terrain tune</summary>
              <div className="world-tuning-grid">
                <label className="world-lighting-control slider">
                  <span>Height</span>
                  <input
                    type="range"
                    min={-4}
                    max={6}
                    step={0.1}
                    aria-label="Terrain height offset"
                    value={terrainTuningDraft.elevation}
                    onChange={(e) =>
                      setTerrainTuningDraft((draft) => ({
                        ...draft,
                        elevation: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="world-lighting-control slider">
                  <span>Detail</span>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.05}
                    aria-label="Terrain detail strength"
                    value={terrainTuningDraft.detail}
                    onChange={(e) =>
                      setTerrainTuningDraft((draft) => ({
                        ...draft,
                        detail: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="world-lighting-control slider">
                  <span>Ridge</span>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.05}
                    aria-label="Terrain ridge strength"
                    value={terrainTuningDraft.ridge}
                    onChange={(e) =>
                      setTerrainTuningDraft((draft) => ({
                        ...draft,
                        ridge: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="world-action-button"
                  onClick={applyActiveTerrainTuning}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="world-action-button"
                  onClick={resetActiveTerrainTuning}
                >
                  Reset
                </button>
              </div>
            </details>
            <button
              type="button"
              className="world-action-button"
              title="Start a new world using the active world's settings"
              onClick={copyCurrentWorldSettings}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="world-action-button primary"
              title="Open new world setup"
              onClick={() => setNewWorldPanelOpen((open) => !open)}
            >
              <Plus size={14} /> New
            </button>
            {worldCreateNote && (
              <span className="world-create-note">
                {worldCreateNote}
              </span>
            )}
            {newWorldPanelOpen && (
              <div className="world-create-panel" aria-label="New world setup">
                <div className="world-create-title">
                  <span>New World</span>
                  <button
                    type="button"
                    className="world-icon-button"
                    title="Close new world setup"
                    aria-label="Close new world setup"
                    onClick={() => setNewWorldPanelOpen(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
                <label className="world-field world-name-field">
                  <span>Name</span>
                  <input
                    type="text"
                    value={newWorldName}
                    placeholder="Lisa Tavern"
                    maxLength={64}
                    onChange={(e) => setNewWorldName(e.target.value)}
                  />
                </label>
                <div className="world-template-grid" aria-label="World templates">
                  {WORLD_CREATION_TEMPLATES.map((option) => {
                    const previewUrl = option.previewUrl || templatePreviewUrl(option.id);
                    const selected = newWorldTemplate === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`world-template-tile ${selected ? "selected" : ""}`}
                        title={option.label}
                        onClick={() => applyNewWorldTemplate(option.id)}
                      >
                        {previewUrl ? (
                          <img src={previewUrl} alt="" />
                        ) : (
                          <span className={`world-template-swatch template-${option.id}`} />
                        )}
                        <span className="world-template-label">{option.label}</span>
                        <small>{option.tagline}</small>
                      </button>
                    );
                  })}
                </div>
                <div className="world-template-summary">
                  <span>{selectedCreationTemplate()?.label ?? worldTemplateLabel(newWorldTemplate)}</span>
                  <small>
                    {skyboxLabel(newWorldSkyboxUrl)} -{" "}
                    {LIGHTING_MOOD_OPTIONS.find((option) => option.id === newWorldLightingMood)?.label ??
                      newWorldLightingMood} - {DAY_NIGHT_MODE_OPTIONS.find((option) => option.id === newWorldDayNightMode)?.label ??
                      newWorldDayNightMode} - {WATER_STYLE_OPTIONS.find((option) => option.id === newWorldWaterSettings.style)?.label ??
                      newWorldWaterSettings.style}
                  </small>
                </div>
                {ADVANCED_WORLD_TEMPLATE_OPTIONS.length > 0 && (
                  <details
                    className="world-advanced-templates"
                    open={advancedWorldTemplatesOpen}
                    onToggle={(event) =>
                      setAdvancedWorldTemplatesOpen((event.currentTarget as HTMLDetailsElement).open)
                    }
                  >
                    <summary>Advanced terrain</summary>
                    <div className="world-advanced-template-grid">
                      {ADVANCED_WORLD_TEMPLATE_OPTIONS.map((option) => {
                        const previewUrl = templatePreviewUrl(option.id);
                        const selected = newWorldTemplate === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            className={`world-advanced-template ${selected ? "selected" : ""}`}
                            onClick={() => applyNewWorldTemplate(option.id)}
                          >
                            {previewUrl ? (
                              <img src={previewUrl} alt="" />
                            ) : (
                              <span className={`world-template-swatch template-${option.id}`} />
                            )}
                            <span>{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </details>
                )}
                <div className="world-create-fields">
                  <label className="world-field">
                    <span>Sky</span>
                    <select
                      aria-label="New world skybox"
                      value={newWorldSkyboxUrl}
                      onChange={(e) => setNewWorldSkyboxUrl(e.target.value)}
                    >
                      {SKYBOX_OPTIONS.map((option) => (
                        <option key={option.url} value={option.url}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="world-field compact">
                    <span>Time</span>
                    <select
                      aria-label="New world time"
                      value={newWorldDayNightMode}
                      onChange={(e) =>
                        setNewWorldDayNightMode(parseDayNightMode(e.target.value, newWorldDayNightMode))
                      }
                    >
                      {DAY_NIGHT_MODE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="world-field">
                    <span>Mood</span>
                    <select
                      aria-label="New world lighting mood"
                      value={newWorldLightingMood}
                      onChange={(e) =>
                        setNewWorldLightingMood(parseLightingMood(e.target.value, newWorldLightingMood))
                      }
                    >
                      {LIGHTING_MOOD_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="world-field compact">
                    <span>Water</span>
                    <select
                      aria-label="New world water style"
                      value={newWorldWaterSettings.style}
                      onChange={(e) =>
                        setNewWorldWaterSettings((settings) =>
                          parseWaterSettings({ ...settings, style: e.target.value }),
                        )
                      }
                    >
                      {WATER_STYLE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="world-field compact">
                    <span>Waves</span>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={0.1}
                      aria-label="New world water wave strength"
                      value={newWorldWaterSettings.waveStrength}
                      onChange={(e) =>
                        setNewWorldWaterSettings((settings) =>
                          parseWaterSettings({ ...settings, waveStrength: Number(e.target.value) }),
                        )
                      }
                    />
                  </label>
                  <label className="world-field compact">
                    <span>Size</span>
                    <input
                      type="number"
                      min={1}
                      max={64}
                      step={1}
                      aria-label="New world chunk size"
                      value={newWorldChunkSize}
                      onChange={(e) => {
                        const parsed = Math.round(Number(e.target.value));
                        if (Number.isFinite(parsed)) {
                          setNewWorldChunkSize(Math.min(64, Math.max(1, parsed)));
                        }
                      }}
                    />
                  </label>
                  <label className="world-field compact">
                    <span>Visibility</span>
                    <select
                      aria-label="New world visibility"
                      value={newWorldPrivate ? "private" : "public"}
                      onChange={(e) => setNewWorldPrivate(e.target.value === "private")}
                    >
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </select>
                  </label>
                  <button type="button" className="world-action-button primary create" onClick={createNewWorld}>
                    Create
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="top-right-cluster">
            <AuthControls />
            <details className="world-help">
              <summary title="Controls" aria-label="Controls">
                <CircleHelp size={16} />
              </summary>
              <div className="world-help-list">
                <span>
                  <strong>Move</strong>
                  <small>WASD / arrows</small>
                </span>
                <span>
                  <strong>Look</strong>
                  <small>drag</small>
                </span>
                <span>
                  <strong>Zoom</strong>
                  <small>scroll</small>
                </span>
                {snapshot.sailingThingId && (
                  <span>
                    <strong>Pilot</strong>
                    <small>active</small>
                  </span>
                )}
              </div>
            </details>
          </div>
        </aside>
        )}
        <aside className="world-left-toolbelt" aria-label="Toolbelt">
          <button
            type="button"
            className={createPromptOpen ? "toolbelt-button primary active" : "toolbelt-button primary"}
            title={createPromptOpen ? "Hide create prompt" : "Create"}
            onClick={focusCreatePrompt}
          >
            <Send size={18} />
            <span>Create</span>
          </button>
          <button
            type="button"
            className={assetPanelOpen && assetPanelTab !== "avatar" ? "toolbelt-button active" : "toolbelt-button"}
            title="Assets"
            onClick={toggleAssetDrawer}
          >
            <Box size={18} />
            <span>Assets</span>
          </button>
          <button
            type="button"
            className={worldChatOpen ? "toolbelt-button active" : "toolbelt-button"}
            title="World chat"
            onClick={() => setWorldChatOpen((open) => !open)}
          >
            <MessageCircle size={18} />
            <span>Chat</span>
          </button>
          <button
            type="button"
            className={worldMenuOpen ? "toolbelt-button active" : "toolbelt-button"}
            title="World menu"
            onClick={() => setWorldMenuOpen((open) => !open)}
          >
            <Globe2 size={18} />
            <span>World</span>
          </button>
          <button
            type="button"
            className={worldMapOpen ? "toolbelt-button active" : "toolbelt-button"}
            title="Map"
            onClick={() => setWorldMapOpen((open) => !open)}
          >
            <MapIcon size={18} />
            <span>Map</span>
          </button>
          {/* View (1st/3rd person) lives on the 'V' hotkey — no toolbar button (it opened no menu). */}
          <button
            type="button"
            className={isToolOpen("terrain") ? "toolbelt-button active" : "toolbelt-button"}
            title="Terrain"
            onClick={() => toggleToolPanel("terrain")}
          >
            <Mountain size={18} />
            <span>Terrain</span>
          </button>
          <button
            type="button"
            className={activeSelectedThing ? "toolbelt-button active" : "toolbelt-button"}
            title={activeSelectedThing ? "Hide move controls" : "Move selected asset"}
            onClick={showMeshToolbar}
          >
            <RotateCw size={18} />
            <span>Move</span>
          </button>
          <button
            type="button"
            className={agentPanelOpen ? "toolbelt-button active" : "toolbelt-button"}
            title="Your Agent"
            onClick={() => {
              setChatTab("agent");
              setWorldChatOpen((open) => (chatTab === "agent" ? !open : true));
            }}
          >
            <Bot size={18} />
            <span>Agent</span>
          </button>
          <button
            type="button"
            className={assetPanelOpen && assetPanelTab === "avatar" ? "toolbelt-button active" : "toolbelt-button"}
            title="Avatar"
            onClick={() => openAssetDrawerTab("avatar")}
          >
            <PersonStanding size={18} />
            <span>Avatar</span>
          </button>
        </aside>
        {/* The login dialog is a true modal (fullscreen dimmed overlay, z-index 70) ABOVE all panels. */}
        {false && (
          <aside
            className="avatar-panel"
            aria-label="Avatar picker"
            style={{
              position: "absolute",
              bottom: 92,
              right: 12,
              width: 300,
              maxHeight: "min(560px, calc(100dvh - 120px))",
              overflowY: "auto",
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(12,16,22,0.92)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "#dfe7d8",
              font: "500 13px/1.4 system-ui, sans-serif",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              zIndex: 30,
              pointerEvents: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>Avatar</strong>
              <span style={{ fontSize: 11, opacity: 0.7 }}>everyone sees your pick</span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
              }}
            >
              {avatarCatalog.map((entry) => (
                <AvatarTile
                  key={entry.id}
                  entry={entry}
                  selected={avatarSelection === entry.id}
                  onSelect={onAvatarPick}
                />
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  Size{" "}
                  <span data-testid="avatar-scale-label" style={{ opacity: 0.8, fontWeight: 500 }}>
                    {avatarScaleLabel(avatarScale)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => onAvatarScale(1)}
                  disabled={avatarScale === 1}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)",
                    color: "#dfe7d8",
                    fontSize: 11,
                    cursor: avatarScale === 1 ? "default" : "pointer",
                    opacity: avatarScale === 1 ? 0.45 : 1,
                  }}
                >
                  Reset
                </button>
              </div>
              <input
                type="range"
                aria-label="Avatar size"
                data-testid="avatar-scale-slider"
                min={0}
                max={AVATAR_SCALE_SLIDER_STEPS}
                step={1}
                value={avatarScaleToSlider(avatarScale)}
                onChange={(event) =>
                  onAvatarScale(avatarSliderToScale(Number(event.target.value)))
                }
                style={{ width: "100%" }}
              />
              <span style={{ fontSize: 10, opacity: 0.55 }}>
                0.1× – 8× · visual only (movement unchanged)
              </span>
            </div>
          </aside>
        )}
        {/* PiP fallback: same box the in-canvas POV viewport uses (bottom-left), showing the latest
            server-held agent snapshot when there's no local avatar mesh to render a live POV from. */}
        {agentRemoteViewActive && (
          <div
            aria-label="Agent remote view"
            style={{
              position: "absolute",
              left: 16,
              bottom: 96,
              width: 220,
              height: 140,
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(0,0,0,0.55)",
              zIndex: 25,
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {agentRemoteViewSrc && !agentRemoteViewFailed ? (
              <img
                src={agentRemoteViewSrc}
                alt="Latest view from your agent"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontSize: 11, color: "#9aa4b2", fontStyle: "italic" }}>
                {agentRemoteViewPolling ? "no view yet" : "unavailable — agent is asleep"}
              </span>
            )}
            <span
              style={{
                position: "absolute",
                left: 6,
                bottom: 4,
                fontSize: 10,
                color: "#dfe7d8",
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                opacity: 0.85,
              }}
            >
              (remote view)
            </span>
          </div>
        )}
        {chatExpanded && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Agent chat (expanded)"
            tabIndex={-1}
            ref={(el) => el?.focus()}
            onClick={() => setChatExpanded(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setChatExpanded(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80, // var(--z-modal)
              background: "rgba(0,0,0,0.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
              outline: "none",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(720px, 96vw)",
                height: "min(80dvh, 720px)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                background: "rgba(18,22,17,0.96)",
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: 12,
                padding: 14,
                boxShadow: "0 18px 60px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#dfe7d8" }}>Chat</span>
                <button
                  type="button"
                  onClick={() => setChatExpanded(false)}
                  title="Close"
                  style={{
                    background: "none",
                    border: "none",
                    color: "#dfe7d8",
                    fontSize: 18,
                    lineHeight: 1,
                    opacity: 0.75,
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: "auto",
                  background: "rgba(0,0,0,0.32)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {agentChat.length === 0 && !agentStatus?.processing ? (
                  <span style={{ fontSize: 12, opacity: 0.5, fontStyle: "italic" }}>
                    {agentStatus?.optedIn
                      ? "Say hello to your agent below."
                      : "Start your agent, then say hello below."}
                  </span>
                ) : (
                  agentFeed.map(renderAgentFeedItem)
                )}
                {agentStatus?.optedIn && agentStatus?.processing && (
                  <span style={{ fontSize: 12, color: "#9ec8ff", fontStyle: "italic", opacity: 0.85 }}>
                    💭 thinking…
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="text"
                  value={agentChatInput}
                  onChange={(e) => setAgentChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void onAgentSend();
                    }
                  }}
                  placeholder={agentStatus?.optedIn ? "Talk to your agent…" : "Start your agent first"}
                  disabled={!agentStatus?.optedIn}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(0,0,0,0.3)",
                    color: "#eef2ea",
                    opacity: agentStatus?.optedIn ? 1 : 0.5,
                  }}
                />
                <button
                  type="button"
                  onClick={() => void onAgentSend()}
                  disabled={!agentStatus?.optedIn || agentChatInput.trim().length === 0}
                  style={{
                    ...p2pBtnStyle(false),
                    flex: "none",
                    padding: "8px 16px",
                    opacity: agentStatus?.optedIn && agentChatInput.trim().length > 0 ? 1 : 0.5,
                    cursor: agentStatus?.optedIn && agentChatInput.trim().length > 0 ? "pointer" : "default",
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}
        {worldMapOpen && (
          <aside className="world-right-hud" aria-label="World systems">
            <section
              className="world-map"
              aria-label="World map — click to warp"
              title="Click to warp here"
              style={{ cursor: "crosshair" }}
              onClick={handleWorldMapClick}
            >
              <canvas ref={worldMapCanvasRef} className="world-map-terrain" aria-hidden="true" />
              {snapshot.visitorPosition && snapshot.visitorYaw !== undefined && (() => {
                // View cone: from the player marker, along the facing yaw, reaching the view distance —
                // shows which way you're looking and how far you can see. forward = (sin yaw, cos yaw) in
                // world (x→right, z→down on the map), so the same trig maps onto the minimap.
                const px = clamp(mapFracX(snapshot.visitorPosition.x) * 100, 0, 100);
                const pz = clamp(mapFracZ(snapshot.visitorPosition.z) * 100, 0, 100);
                const yawV = snapshot.visitorYaw;
                // The cone should reach as far as you can actually see. The fog far-plane (viewDistance)
                // under-reads the real visible reach (terrain stays legible well past the fog midpoint), so
                // scale it up ~1.8× and lift the clamp ceiling so the wedge clearly extends across the map.
                const reach = (snapshot.viewDistance ?? 120) * 1.8;
                const r = clamp((reach / Math.max(mapExtentX, mapExtentZ)) * 100, 8, 280);
                const half = (78 / 2) * (Math.PI / 180); // ~78° cone (≈ the camera's horizontal FOV)
                // The map box is aspect-ratio 1.05 and the SVG stretches a square viewBox over it
                // (preserveAspectRatio none), which skews any heading horizontally. Divide the x-component
                // by the box aspect so the rendered wedge points along the TRUE facing direction.
                const MAP_ASPECT = 1.05;
                const e1x = px + (r * Math.sin(yawV - half)) / MAP_ASPECT;
                const e1z = pz + r * Math.cos(yawV - half);
                const e2x = px + (r * Math.sin(yawV + half)) / MAP_ASPECT;
                const e2z = pz + r * Math.cos(yawV + half);
                return (
                  <svg className="world-map-cone" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d={`M ${px.toFixed(2)} ${pz.toFixed(2)} L ${e1x.toFixed(2)} ${e1z.toFixed(2)} L ${e2x.toFixed(2)} ${e2z.toFixed(2)} Z`} />
                  </svg>
                );
              })()}
              {snapshot.visitorPosition && (
                <button
                  type="button"
                  className="map-marker player"
                  style={mapPointStyle(snapshot.visitorPosition)}
                  title="You"
                  aria-label="Go to your location"
                  onClick={(event) => {
                    event.stopPropagation();
                    const pos = snapshot.visitorPosition;
                    if (pos) worldRef.current?.warpTo(pos.x, pos.z);
                  }}
                />
              )}
              {snapshot.remoteVisitors.map((visitor) => {
                const name = actorName(visitor);
                return visitor.position ? (
                  <button
                    type="button"
                    key={visitor.visitorId}
                    className={[
                      "map-marker",
                      visitor.visitorId.startsWith("agent:") ? "agent" : "remote-player",
                    ].join(" ")}
                    style={mapPointStyle(visitor.position)}
                    title={name}
                    aria-label={`Go to ${name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      const pos = visitor.position;
                      if (pos) worldRef.current?.warpTo(pos.x, pos.z);
                    }}
                  />
                ) : null;
              })}
              {(snapshot.portals ?? []).map((portal) => {
                const anchoredThing = portal.anchorThingId
                  ? snapshot.generated.find((thing) => thing.id === portal.anchorThingId)
                  : undefined;
                const position = anchoredThing?.position ?? portal.position;
                return (
                  <button
                    type="button"
                    key={portal.id}
                    className="map-marker portal"
                    style={mapPointStyle(position)}
                    title={portal.label || `Portal to ${worldDisplayName(portal.target.worldId)}`}
                    aria-label={portal.label || `Portal to ${worldDisplayName(portal.target.worldId)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      worldRef.current?.warpTo(position.x, position.z);
                    }}
                  />
                );
              })}
              {snapshot.generated.map((thing) => {
                const isAnimatedThing = (worldRef.current?.getGeneratedClipNames(thing.id) ?? []).length > 0;
                return (
                  <button
                    type="button"
                    key={thing.id}
                    className={[
                      "map-marker",
                      "asset",
                      isAnimatedThing ? "animated" : "",
                      thing.id === selectedThing?.id ? "selected" : "",
                      thing.generationStatus === "queued" ||
                      thing.generationStatus === "generating"
                        ? "pending"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={mapPointStyle(thing.position)}
                    title={`${thing.kind}: ${thing.prompt}`}
                    aria-label={`Go to ${thing.kind}: ${thing.prompt}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      worldRef.current?.goToGenerated(thing.id);
                    }}
                  />
                );
              })}
              {pendingGenerated.length > 0 && (
                <span className="world-map-status">
                  {pendingGenerated.length} building
                </span>
              )}
              <section className="world-info-panel mini" aria-label="World info">
                <select
                  className="world-map-title-select"
                  aria-label="Map world"
                  title="Switch world"
                  value={activeWorldId ?? ""}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    event.stopPropagation();
                    switchWorld(event.target.value);
                  }}
                >
                  {!activeWorldId && <option value="">main</option>}
                  {worlds.map((worldId) => (
                    <option key={worldId} value={worldId}>
                      {worldOptionLabel(worldId)}
                    </option>
                  ))}
                </select>
                <div className="world-info-stats">
                  <button
                    type="button"
                    className={mapActorList === "items" ? "active" : ""}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMapActorList((current) => current === "items" ? null : "items");
                    }}
                  >
                    <span className="world-info-label">Items</span>
                    <span className="world-info-value">{snapshot.generated.length}</span>
                  </button>
                  <button
                    type="button"
                    className={mapActorList === "players" ? "active" : ""}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMapActorList((current) => current === "players" ? null : "players");
                    }}
                  >
                    <span className="world-info-label">Players</span>
                    <span className="world-info-value">{playerList.length}</span>
                  </button>
                  <button
                    type="button"
                    className={mapActorList === "agents" ? "active" : ""}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMapActorList((current) => current === "agents" ? null : "agents");
                    }}
                  >
                    <span className="world-info-label">Agents</span>
                    <span className="world-info-value">{remoteAgents.length}</span>
                  </button>
                </div>
              </section>
              {mapActorList && (
                <section className="world-map-actor-list" aria-label={`${mapActorList} in world`}>
                  {mapActorList === "items" && (
                    <>
                      <div className="world-map-actor-row utility">
                        <span>{snapshot.generated.length} items</span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void cleanupDeadReferences();
                          }}
                          disabled={cleanupBusy}
                          title="Remove world objects whose models are no longer available"
                        >
                          Clean
                        </button>
                      </div>
                      {cleanupNote && <p>{cleanupNote}</p>}
                      {snapshot.generated.length === 0 && <p>No items visible.</p>}
                      {snapshot.generated.map((thing) => (
                        <div key={thing.id} className="world-map-actor-row">
                          <span title={thing.prompt}>
                            {thing.prompt.slice(0, 28)}
                          </span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              worldRef.current?.goToGenerated(thing.id);
                            }}
                          >
                            Go to
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              worldRef.current?.selectGenerated(thing.id);
                            }}
                          >
                            Select
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  {mapActorList !== "items" && (mapActorList === "players" ? playerList : remoteAgents).length === 0 && (
                    <p>No {mapActorList} visible.</p>
                  )}
                  {mapActorList !== "items" && (mapActorList === "players" ? playerList : remoteAgents).map((visitor) => {
                    const name = actorName(visitor);
                    return (
                      <div key={visitor.visitorId} className="world-map-actor-row">
                        <span title={visitor.visitorId}>{name}</span>
                        <button
                          type="button"
                          disabled={!visitor.position}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (visitor.position) worldRef.current?.warpTo(visitor.position.x, visitor.position.z);
                          }}
                        >
                          Go to
                        </button>
                        <button
                          type="button"
                          disabled={visitor.visitorId === "local-player"}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (visitor.visitorId !== "local-player") {
                              openDirectChatFor(visitor);
                            }
                          }}
                        >
                          Chat
                        </button>
                      </div>
                    );
                  })}
                </section>
              )}
            </section>
            {snapshot.visitorPosition && (() => {
              // Position readout: where you are, so you can tell others. Chunked worlds also show the
              // chunk cell (origin at a corner, CHUNK_SPAN units/chunk); other worlds just show coords.
              const pos = snapshot.visitorPosition;
              const wx = Math.round(pos.x);
              const wz = Math.round(pos.z);
              const chunked = isChunkedWorldId(activeWorldId ?? "");
              const cell = chunked
                ? `chunk ${Math.floor(pos.x / CHUNK_SPAN)},${Math.floor(pos.z / CHUNK_SPAN)} · `
                : "";
              const locationText = `${worldDisplayName(currentWorldId)} · ${cell}(${wx}, ${wz})`;
              return (
                <div className="world-map-action-bar" aria-label="Map actions">
                  <button
                    type="button"
                    title="Copy a link to your world location"
                    onClick={() => {
                      const url = shareLocationUrl(currentWorldId, pos.x, pos.z);
                      void navigator.clipboard?.writeText(url).catch(() => undefined);
                    }}
                  >
                    <span className="world-info-label">Share</span>
                    <span className="world-info-value">{`${worldDisplayName(currentWorldId)} - (${wx}, ${wz})`}</span>
                  </button>
                  <button
                    type="button"
                    title="Open portal menu"
                    className={portalsPanelOpen ? "active" : undefined}
                    onClick={() => setPortalsPanelOpen((open) => !open)}
                  >
                    <span className="world-info-label">Portal</span>
                    <span className="world-info-value">{snapshot.portals?.length ?? 0}</span>
                  </button>
                </div>
              );
            })()}
        {portalsPanelOpen && (() => {
          const portalBtn = {
            display: "block",
            width: "100%",
            textAlign: "left" as const,
            margin: "2px 0",
            background: "rgba(255,255,255,0.08)",
            color: "inherit",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 8,
            padding: "4px 8px",
            cursor: "pointer",
            font: "inherit",
          };
          return (
            <aside
              className="portal-panel hud-card"
              aria-label="Portals"
            >
              <div className="hud-card-body">
              {(snapshot.portals ?? []).map((p) => {
                const targetChoices = portalTargetOptions.includes(p.target.worldId)
                  ? portalTargetOptions
                  : [p.target.worldId, ...portalTargetOptions].filter(Boolean);
                return (
                  <article key={p.id} className="portal-panel-row">
                    <button type="button" title={`Enter ${p.label || worldDisplayName(p.target.worldId)} (${p.target.kind})`} onClick={() => worldRef.current?.enterPortal(p.id)} style={portalBtn}>
                      {"->"} {p.label || worldDisplayName(p.target.worldId)} <small style={{ opacity: 0.6 }}>{p.target.kind}</small>
                    </button>
                    <div className="portal-panel-row-actions">
                      <select
                        value={p.target.worldId}
                        aria-label={`Destination for ${p.label || p.id}`}
                        title="Change portal destination"
                        disabled={targetChoices.length === 0}
                        onChange={(event) => worldRef.current?.updatePortalTarget(p.id, event.target.value)}
                      >
                        {targetChoices.map((worldId) => (
                          <option key={worldId} value={worldId}>
                            {worldOptionLabel(worldId)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        title="Delete portal"
                        aria-label={`Delete ${p.label || p.id}`}
                        onClick={() => {
                          const ok = window.confirm(`Delete portal ${p.label || worldDisplayName(p.target.worldId)}?`);
                          if (ok) worldRef.current?.deletePortal(p.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })}
              {/* Create at your feet (owner-only — the server rejects otherwise; the rejection shows in the log). */}
              <button
                type="button"
                title="Open a door to a fresh interior room at your position"
                onClick={() => worldRef.current?.createDoorHere(window.prompt("Door label?", "Door") || "Door")}
                style={{ ...portalBtn, marginTop: 6, borderColor: "rgba(255,207,106,0.5)" }}
              >
                ＋ Door here
              </button>
              <button
                type="button"
                title={activeSelectedThing ? "Create a portal anchored to the selected asset" : "Create a portal at your position to another world"}
                disabled={!portalTargetWorldId}
                onClick={() => {
                  const target = portalTargetWorldId.trim();
                  if (target) worldRef.current?.createPortalHere(target, `${worldDisplayName(currentWorldId)} to ${worldDisplayName(target)} portal`);
                }}
                style={{
                  ...portalBtn,
                  borderColor: "rgba(106,208,255,0.5)",
                  opacity: portalTargetWorldId ? 1 : 0.55,
                  cursor: portalTargetWorldId ? "pointer" : "default",
                }}
              >
                ＋ Portal here
              </button>
              <select
                value={portalTargetWorldId}
                aria-label="Portal destination world"
                title="Portal destination world"
                disabled={portalTargetOptions.length === 0}
                onChange={(event) => setPortalTargetWorldId(event.target.value)}
                style={{
                  width: "100%",
                  marginTop: 4,
                  background: "rgba(0,0,0,0.45)",
                  color: "inherit",
                  border: "1px solid rgba(106,208,255,0.35)",
                  borderRadius: 8,
                  padding: "4px 6px",
                  font: "inherit",
                }}
              >
                {portalTargetOptions.length === 0 ? (
                  <option value="">No other worlds</option>
                ) : (
                  portalTargetOptions.map((worldId) => (
                    <option key={worldId} value={worldId}>
                      {worldDisplayName(currentWorldId)} to {worldDisplayName(worldId)}
                    </option>
                  ))
                )}
              </select>
              {portalPanelNotice && (
                <div className="portal-panel-notice" role="status" aria-live="polite">
                  {portalPanelNotice}
                </div>
              )}
              </div>
            </aside>
          );
        })()}
          </aside>
        )}
        {snapshot.sailingThingId && (
          <button
            type="button"
            className="dismount-button"
            title="Dismount"
            aria-label="Dismount"
            onClick={() => worldRef.current?.disembark()}
          >
            <Ship size={17} />
            <span>Dismount</span>
          </button>
        )}
        {activeSelectedThing && !snapshot.sailingThingId && (
          <div className="selected-transform-hud" aria-label="Selected asset controls">
            <div className="selected-transform-label">
              <Box size={15} />
              <select
                value={activeSelectedThing.id}
                aria-label="Selected asset"
                onChange={(event) =>
                  worldRef.current?.selectGenerated(event.target.value)
                }
              >
                {snapshot.generated.map((thing) => (
                  <option key={thing.id} value={thing.id}>
                    {thing.prompt}
                  </option>
                ))}
              </select>
              <div className="selected-name-actions">
                <button
                  type="button"
                  className="selected-name-action"
                  disabled={!selectedThingVehicleMode}
                  title={
                    selectedThingVehicleMode
                      ? snapshot.sailingThingId === activeSelectedThing.id
                        ? "Stop riding"
                        : "Ride or pilot asset"
                      : "Not rideable"
                  }
                  onClick={() => {
                    if (!selectedThingVehicleMode) return;
                    if (snapshot.sailingThingId === activeSelectedThing.id) {
                      worldRef.current?.disembark();
                      return;
                    }
                    worldRef.current?.boardGenerated(activeSelectedThing.id);
                  }}
                >
                  {snapshot.sailingThingId === activeSelectedThing.id
                    ? "Dismount"
                    : "Ride"}
                </button>
                <button
                  type="button"
                  className="selected-name-action"
                  title={selectedThingIsLocalPet ? "Stop this companion from following you" : "Make this asset your pet companion"}
                  onClick={() =>
                    worldRef.current?.setGeneratedPet(
                      activeSelectedThing.id,
                      !selectedThingIsLocalPet,
                    )
                  }
                >
                  {selectedThingIsLocalPet ? "Unpet" : "Pet"}
                </button>
                <button
                  type="button"
                  className="selected-name-action"
                  title="Duplicate this object with its current scale & rotation"
                  onClick={() =>
                    worldRef.current?.cloneGenerated(activeSelectedThing.id)
                  }
                >
                  Clone
                </button>
                <button
                  type="button"
                  className="selected-name-action"
                  title="Hurl it where you're looking — it tumbles, bounces, and settles (or floats). Key: G"
                  onClick={() =>
                    worldRef.current?.throwGenerated(activeSelectedThing.id)
                  }
                >
                  Throw
                </button>
                <button
                  type="button"
                  className="selected-name-action"
                  title="Move mode: click or drag anywhere in the world to put this object there (camera won't orbit until you toggle this off). Ctrl+drag works anytime without this."
                  style={
                    moveModeActive
                      ? { background: "rgba(111,174,70,0.4)", fontWeight: 700 }
                      : undefined
                  }
                  onClick={() => {
                    const next = !moveModeActive;
                    setMoveModeActive(next);
                    worldRef.current?.setMoveMode(next ? activeSelectedThing.id : null);
                  }}
                >
                  {moveModeActive ? "Moving…" : "Move"}
                </button>
                <button
                  type="button"
                  className="selected-name-action selected-name-delete"
                  onClick={() =>
                    worldRef.current?.deleteGenerated(activeSelectedThing.id)
                  }
                >
                  Delete
                </button>
              </div>
              {selectedClipNames.length > 0 && (
                <select
                  aria-label="Animation"
                  title="Loop one of this model's animation clips — synced to everyone in the world"
                  value={activeSelectedThing.animation ?? ""}
                  style={{ gridColumn: 2, gridRow: 3 }}
                  onChange={(event) =>
                    worldRef.current?.setGeneratedAnimation(
                      activeSelectedThing.id,
                      event.target.value,
                    )
                  }
                >
                  <option value="">Animation: (default)</option>
                  {selectedClipNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="selected-step-control" aria-label="Nudge step">
              {[0.25, 1, 2].map((step) => (
                <button
                  key={step}
                  type="button"
                  className={step === selectedNudgeStep ? "active" : undefined}
                  title={`Move and height step: ${step}`}
                  aria-label={`Use ${step} step`}
                  aria-pressed={step === selectedNudgeStep}
                  onClick={() => setSelectedNudgeStep(step)}
                >
                  {step}
                </button>
              ))}
            </div>
            <div className="selected-nudge-pad" aria-label="Position controls">
              <button
                type="button"
                className="icon-button nudge-up"
                title="Move forward"
                aria-label="Move asset forward"
                onClick={() =>
                  worldRef.current?.moveGenerated(
                    activeSelectedThing.id,
                    0,
                    -selectedNudgeStep,
                  )
                }
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="icon-button nudge-left"
                title="Move left"
                aria-label="Move asset left"
                onClick={() =>
                  worldRef.current?.moveGenerated(
                    activeSelectedThing.id,
                    -selectedNudgeStep,
                    0,
                  )
                }
              >
                <ArrowLeft size={16} />
              </button>
              <button
                type="button"
                className="icon-button nudge-right"
                title="Move right"
                aria-label="Move asset right"
                onClick={() =>
                  worldRef.current?.moveGenerated(
                    activeSelectedThing.id,
                    selectedNudgeStep,
                    0,
                  )
                }
              >
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                className="icon-button nudge-down"
                title="Move backward"
                aria-label="Move asset backward"
                onClick={() =>
                  worldRef.current?.moveGenerated(
                    activeSelectedThing.id,
                    0,
                    selectedNudgeStep,
                  )
                }
              >
                <ArrowDown size={16} />
              </button>
            </div>
            <div className="selected-place-actions" aria-label="Placement controls">
              <button
                type="button"
                className="icon-button selected-water-button"
                title="Move to water"
                aria-label="Move asset to water"
              onClick={() =>
                worldRef.current?.moveGeneratedToWater(activeSelectedThing.id)
              }
            >
              <Waves size={17} />
            </button>
              <button
                type="button"
                className="icon-button"
                title="Ground asset"
                aria-label="Ground asset"
                onClick={() =>
                  worldRef.current?.groundGenerated(activeSelectedThing.id)
                }
              >
                <Mountain size={17} />
              </button>
            </div>
            <div className="selected-transform-stack" aria-label="Height controls">
              <button
                type="button"
                className="icon-button"
                title="Raise asset"
                aria-label="Raise asset"
                onClick={() =>
                  worldRef.current?.liftGenerated(activeSelectedThing.id, selectedNudgeStep)
                }
              >
                <ArrowUp size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Lower asset"
                aria-label="Lower asset"
                onClick={() =>
                  worldRef.current?.liftGenerated(activeSelectedThing.id, -selectedNudgeStep)
                }
              >
                <ArrowDown size={17} />
              </button>
            </div>
            <div className="selected-transform-stack" aria-label="Scale controls">
              <button
                type="button"
                className="icon-button"
                title="Scale up"
                aria-label="Scale up"
                onClick={() =>
                  worldRef.current?.scaleGenerated(activeSelectedThing.id, 1.16)
                }
              >
                <Plus size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Scale down"
                aria-label="Scale down"
                onClick={() =>
                  worldRef.current?.scaleGenerated(activeSelectedThing.id, 0.86)
                }
              >
                <Minus size={17} />
              </button>
            </div>
          </div>
        )}
        {createPromptOpen && (
        <section
          className={
            createPromptFocused
              ? "prompt-card world-prompt-card active"
              : "prompt-card world-prompt-card"
          }
        >
          <label htmlFor="tellus-prompt">Create</label>
          <textarea
            id="tellus-prompt"
            ref={promptRef}
            value={prompt}
            rows={1}
            placeholder="make a crooked apple tree with golden moss..."
            onFocus={() => setCreatePromptFocused(true)}
            onBlur={() => setCreatePromptFocused(false)}
            onChange={(event) => setPrompt(event.target.value)}
          />
          {(assetReuseSuggestions.length > 0 || assetReuseLoading) && (
            <div className="prompt-reuse-strip" aria-label="Reusable asset suggestions">
              <span>{assetReuseLoading ? "Checking existing assets..." : "Already made"}</span>
              <div>
                {assetReuseSuggestions.slice(0, 3).map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    title={`${model.name}${model.reuseReason ? ` - ${model.reuseReason}` : ""}`}
                    onClick={() => {
                      worldRef.current?.addLibraryAsset(model);
                      setPrompt("");
                      setCreatePromptOpen(false);
                    }}
                  >
                    {model.hasThumbnail && !model.id.startsWith("world:") ? (
                      <img
                        src={tellusAssetLibraryUrl(`/api/assets/model/${encodeURIComponent(model.id)}/thumbnail`)}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <Box size={15} />
                    )}
                    <span>{model.name}</span>
                    <small>Place</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="prompt-actions">
            <button
              type="button"
              className="secondary-button prompt-icon-button"
              title={listening ? "Listening" : "Describe by voice"}
              aria-label={listening ? "Listening" : "Describe what to create by voice"}
              disabled={!supported || listening}
              onClick={start}
            >
              <Mic size={16} />
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={submitPrompt}
            >
              <Send size={16} />
              <span>Create</span>
            </button>
          </div>
        </section>
        )}
      </section>

      {assetPanelOpen && (
      <aside className="tool-panel asset-tool-panel" aria-label="Asset panel">
        {assetPanelOpen && (
          <section className="tool-card inventory-card asset-drawer">
            <div className="panel-strip">
              <span>Assets</span>
              <button
                type="button"
                className="icon-button"
                title="Close assets"
                aria-label="Close assets"
                onClick={() => setAssetPanelOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <nav className="tool-panel-tabs asset-tabs" aria-label="Asset tabs">
              <button
                type="button"
                className={assetPanelTab === "avatar" ? "active" : ""}
                title="People"
                aria-label="People assets"
                onClick={() => setAssetPanelTab("avatar")}
              >
                <PersonStanding size={17} />
              </button>
              <button
                type="button"
                className={assetPanelTab === "flora" ? "active" : ""}
                title="Flora"
                aria-label="Flora assets"
                onClick={() => setAssetPanelTab("flora")}
              >
                <Sprout size={17} />
              </button>
              <button
                type="button"
                className={assetPanelTab === "animal" ? "active" : ""}
                title="Animals"
                aria-label="Animal assets"
                onClick={() => setAssetPanelTab("animal")}
              >
                <PawPrint size={17} />
              </button>
              <button
                type="button"
                className={assetPanelTab === "building" ? "active" : ""}
                title="Buildings"
                aria-label="Building assets"
                onClick={() => setAssetPanelTab("building")}
              >
                <Building2 size={17} />
              </button>
            </nav>
            {assetPanelTab === "avatar" && (
              <div className="inventory-list asset-list asset-avatar-tab">
                <div className="asset-tab-note">
                  <strong>Avatar</strong>
                  <span>everyone sees your pick</span>
                </div>
                <div className="asset-avatar-grid">
                  {avatarCatalog.map((entry) => (
                    <AvatarTile
                      key={entry.id}
                      entry={entry}
                      selected={avatarSelection === entry.id}
                      onSelect={onAvatarPick}
                    />
                  ))}
                </div>
                <div className="asset-avatar-scale">
                  <div>
                    <span>
                      Size{" "}
                      <span data-testid="avatar-scale-label">
                        {avatarScaleLabel(avatarScale)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onAvatarScale(1)}
                      disabled={avatarScale === 1}
                    >
                      Reset
                    </button>
                  </div>
                  <input
                    type="range"
                    aria-label="Avatar size"
                    data-testid="avatar-scale-slider"
                    min={0}
                    max={AVATAR_SCALE_SLIDER_STEPS}
                    step={1}
                    value={avatarScaleToSlider(avatarScale)}
                    onChange={(event) =>
                      onAvatarScale(avatarSliderToScale(Number(event.target.value)))
                    }
                  />
                  <small>0.1x - 8x · visual only</small>
                </div>
              </div>
            )}
            {(assetPanelTab === "animal" || assetPanelTab === "building" || assetPanelTab === "flora") && (
              <div className="inventory-list asset-list">
                {assetPanelTab === "building" && (
                  <section className="asset-proc-panel" aria-label="Procedural buildings">
                    <div className="asset-proc-heading">
                      <Building2 size={14} />
                      <span>Procedural</span>
                    </div>
                    <label className="asset-proc-field">
                      <span>Preset</span>
                      <select
                        value={procBuildingType}
                        onChange={(event) =>
                          setProcBuildingType(event.target.value as ProceduralBuildingType)
                        }
                      >
                        {PROCEDURAL_BUILDING_CATALOG.map((recipe) => (
                          <option key={recipe.id} value={recipe.id}>
                            {recipe.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="asset-proc-row">
                      <label className="asset-proc-field">
                        <span>Material</span>
                        <select
                          value={procBuildingMaterial}
                          onChange={(event) =>
                            setProcBuildingMaterial(event.target.value as BuildingMaterialStyle)
                          }
                        >
                          {BUILDING_MATERIAL_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="asset-proc-field">
                        <span>Light</span>
                        <select
                          value={procBuildingLighting}
                          onChange={(event) =>
                            setProcBuildingLighting(event.target.value as BuildingLightingStyle)
                          }
                        >
                          {BUILDING_LIGHTING_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="asset-proc-actions">
                      <label>
                        <input
                          type="checkbox"
                          checked={procBuildingRoof}
                          onChange={(event) => setProcBuildingRoof(event.target.checked)}
                        />
                        <span>Roof</span>
                      </label>
                      <button type="button" onClick={placeProceduralBuilding}>
                        <Plus size={14} />
                        <span>Place</span>
                      </button>
                    </div>
                  </section>
                )}
                <label className="asset-search-field">
                  <Search size={14} aria-hidden="true" />
                  <input
                    type="text"
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder={`Search ${assetPanelTab} assets...`}
                    aria-label="Search assets"
                  />
                </label>
                <div className="asset-browse-controls" aria-label="Asset sort">
                  {(
                    [
                      ["newest", "Newest"],
                      ["downloads", "Popular"],
                      ["name", "A–Z"],
                    ] as Array<[AssetBrowseSort, string]>
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAssetBrowseSort(key)}
                      className={assetBrowseSort === key ? "active" : ""}
                      aria-pressed={assetBrowseSort === key}
                    >
                      {label}
                    </button>
                  ))}
                  {assetBrowseTotal > 0 && (
                    <span>
                      {assetBrowse.length}/{assetBrowseTotal}
                    </span>
                  )}
                </div>
                {assetBrowse.length > 0 && (
                  <div className="asset-browse-grid">
                    {assetBrowse.map((model) => (
                      <AssetTile
                        key={model.id}
                        model={model}
                        onSelect={(m) => worldRef.current?.addLibraryAsset(m)}
                      />
                    ))}
                  </div>
                )}
                {assetBrowse.length === 0 && !assetBrowseLoading && (
                  <span className="inventory-empty">
                    No {assetPanelTab} assets loaded yet.
                  </span>
                )}
                {assetBrowseLoading && (
                  <span className="inventory-empty">Loading...</span>
                )}
                {assetBrowseHasNext && !assetBrowseLoading && (
                  <button
                    type="button"
                    className="inventory-item"
                    style={{ justifyContent: "center", fontWeight: 600 }}
                    onClick={() => void runAssetBrowse(assetBrowseQuery, assetBrowsePage + 1, true, assetBrowseSort, assetCategory)}
                  >
                    Load more
                  </button>
                )}
              </div>
            )}
            {false && (
              <div className="inventory-list asset-list">
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 6 }}>
                  <button
                    type="button"
                    onClick={() => void cleanupDeadReferences()}
                    disabled={cleanupBusy}
                    title="Find world objects whose model is gone (failed loads, deleted store models, broken procedural links) and remove them"
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.06)",
                      color: "#e7eee2",
                      cursor: cleanupBusy ? "default" : "pointer",
                      opacity: cleanupBusy ? 0.6 : 1,
                    }}
                  >
                    🧹 Clean up dead references
                  </button>
                  {cleanupNote && (
                    <span style={{ fontSize: 10, opacity: 0.7 }}>{cleanupNote}</span>
                  )}
                </div>
                {snapshot.generated.length > 0 ? (
                  snapshot.generated.map((thing) => (
                    <article
                      key={thing.id}
                      className={
                        thing.id === selectedThing?.id
                          ? "inventory-item asset-row active"
                          : "inventory-item asset-row"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => worldRef.current?.selectGenerated(thing.id)}
                      >
                        <Box size={16} />
                        <span>
                          <strong>{thing.prompt.slice(0, 30)}</strong>
                          <small>
                            {thing.kind} · {thing.generationStatus ?? "local"} · x{" "}
                            {thing.position.x.toFixed(0)} z{" "}
                            {thing.position.z.toFixed(0)}
                          </small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="asset-go-button"
                        onClick={() => worldRef.current?.goToGenerated(thing.id)}
                      >
                        Go
                      </button>
                    </article>
                  ))
                ) : (
                  <span className="inventory-empty">No world objects yet.</span>
                )}
              </div>
            )}
            {false && (
              <div className="inventory-list asset-list">
                {inventory.length > 0 ? (
                  inventory.map((thing) => (
                    <article
                      key={thing.id}
                      className={
                        thing.id === selectedThing?.id
                          ? "inventory-item asset-row active"
                          : "inventory-item asset-row"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => worldRef.current?.selectGenerated(thing.id)}
                      >
                        <Box size={16} />
                        <span>
                          <strong>{thing.prompt.slice(0, 30)}</strong>
                          <small>{thing.kind} · {thing.generationStatus ?? "local"}</small>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="asset-go-button"
                        onClick={() => worldRef.current?.goToGenerated(thing.id)}
                      >
                        Go
                      </button>
                    </article>
                  ))
                ) : (
                  <span className="inventory-empty">No owned assets yet.</span>
                )}
              </div>
            )}
          </section>
        )}
      </aside>
      )}

      {openToolMenus.length > 0 && (
      <aside className="tool-panel compact-tool-panel" aria-label="Tool panel">
        {isToolOpen("terrain") && (
        <section className="tool-card terrain-card">
          <div className="panel-strip">
            <span>Terrain</span>
            <button
              type="button"
              className="icon-button"
              title="Close terrain"
              aria-label="Close terrain"
              onClick={() => closeToolPanel("terrain")}
            >
              <X size={16} />
            </button>
          </div>
          <div className="terrain-subtitle">Height</div>
          <div className="terrain-actions compact terrain-height-actions">
            <button
              type="button"
              className="secondary-button terrain-hold"
              title="Hold to raise terrain"
              aria-label="Raise terrain"
              {...pressRepeat(() => worldRef.current?.sculptTerrain("raise"))}
            >
              <ArrowUp size={18} />
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => worldRef.current?.sculptTerrain("flatten")}
            >
              <span>Flatten</span>
            </button>
            <button
              type="button"
              className="secondary-button terrain-hold"
              title="Hold to lower terrain"
              aria-label="Lower terrain"
              {...pressRepeat(() => worldRef.current?.sculptTerrain("lower"))}
            >
              <ArrowDown size={18} />
            </button>
          </div>
          <div className="terrain-subtitle with-rule">Materials</div>
          <div className="terrain-material-swatches">
            <button
              type="button"
              className="terrain-swatch meadow"
              onClick={() => worldRef.current?.sculptTerrain("meadow")}
            >
              <span className="terrain-swatch-preview" />
              <span>Meadow</span>
            </button>
            <button
              type="button"
              className="terrain-swatch beach"
              onClick={() => worldRef.current?.sculptTerrain("beach")}
            >
              <span className="terrain-swatch-preview" />
              <span>Beach</span>
            </button>
            <button
              type="button"
              className="terrain-swatch dirt"
              onClick={() => worldRef.current?.sculptTerrain("dirt")}
            >
              <span className="terrain-swatch-preview" />
              <span>Dirt</span>
            </button>
            <button
              type="button"
              className="terrain-swatch pebbles"
              onClick={() => worldRef.current?.sculptTerrain("rock")}
            >
              <span className="terrain-swatch-preview" />
              <span>Pebbles</span>
            </button>
            <button
              type="button"
              className="terrain-swatch snow"
              onClick={() => worldRef.current?.sculptTerrain("snow")}
            >
              <span className="terrain-swatch-preview" />
              <span>Snow</span>
            </button>
            <button
              type="button"
              className="terrain-swatch flowers"
              onClick={() => worldRef.current?.sculptTerrain("flowers")}
            >
              <span className="terrain-swatch-preview" />
              <span>Flowers</span>
            </button>
            <button
              type="button"
              className="terrain-swatch stone"
              onClick={() => worldRef.current?.sculptTerrain("stone")}
            >
              <span className="terrain-swatch-preview" />
              <span>Stone</span>
            </button>
            <button
              type="button"
              className="terrain-swatch brick"
              onClick={() => worldRef.current?.sculptTerrain("brick")}
            >
              <span className="terrain-swatch-preview" />
              <span>Brick</span>
            </button>
          </div>
          <div className="terrain-subtitle with-rule">Scatter</div>
          <div className="terrain-scatter-grid">
            {PROCEDURAL_CATALOG.map((arch) => (
              <div key={arch.id} className="terrain-scatter-tile">
                <button
                  type="button"
                  className="terrain-scatter-place"
                  title={`${arch.label} — tap again for a new variation`}
                  aria-label={arch.label}
                  onClick={() => {
                    const seed = (Math.random() * 0xffffffff) >>> 0;
                    worldRef.current?.addLibraryAsset({
                      id: `proc-${arch.id}-${seed.toString(16)}`,
                      name: arch.label,
                      description: arch.kind === "tree" ? `${arch.label} tree` : arch.label,
                      modelUrl: makeProceduralModelUrl(arch.id, seed),
                      source: "generated",
                    }, {
                      scale: defaultScaleForRealisticKind(arch.kind, arch.label) * (arch.kind === "tree" ? 1.48 : 1),
                    });
                  }}
                >
                  <span className="terrain-scatter-emoji" aria-hidden="true">{arch.emoji}</span>
                  <span className="terrain-scatter-label">{arch.label}</span>
                </button>
                <button
                  type="button"
                  className="terrain-scatter-burst"
                  title={`Scatter ${arch.label}`}
                  aria-label={`Scatter ${arch.label}`}
                  onClick={() => worldRef.current?.scatterProceduralAsset(arch.id)}
                >
                  <Sprout size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="terrain-scatter-tile"
              title={`Mirror — up to ${MAX_LIVE_MIRRORS} reflect live`}
              aria-label="Mirror"
              onClick={() => {
                const seed = (Math.random() * 0xffffffff) >>> 0;
                worldRef.current?.addLibraryAsset({
                  id: `proc-mirror-${seed.toString(16)}`,
                  name: "Mirror",
                  description: "Mirror",
                  modelUrl: makeProceduralModelUrl(MIRROR_ARCHETYPE_ID, seed),
                  source: "generated",
                });
              }}
            >
              <span className="terrain-scatter-emoji" aria-hidden="true">🪞</span>
              <span className="terrain-scatter-label">Mirror</span>
            </button>
          </div>
        </section>
        )}

      </aside>
      )}

    </main>
  );
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Tellus root element was not found");
}

const tellusRoot = window.__tellusRoot ?? createRoot(root);
window.__tellusRoot = tellusRoot;

tellusRoot.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
