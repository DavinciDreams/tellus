import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Backpack,
  Bot,
  Box,
  CircleHelp,
  Eye,
  Layers,
  Map as MapIcon,
  Mic,
  Minus,
  Mountain,
  PersonStanding,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Send,
  Ship,
  Trash2,
  Video,
  Waves,
} from "lucide-react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { createVegetation } from "./tellus-vegetation";
import { PROCEDURAL_CATALOG } from "./tellus-veg-archetypes";
import { makeProceduralModelUrl, sanitizeProceduralModelUrl, parseProceduralModelUrl, MIRROR_ARCHETYPE_ID, MAX_LIVE_MIRRORS, liveMirrorCount, resetLiveMirrors } from "./tellus-procedural-assets";
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
  getAvatarUserScale,
  restoreProceduralAvatar,
  setAvatarUserScale,
  tickAvatarScale,
  VrmObjectRig,
  type AvatarRig,
} from "./tellus-vrm-avatar";
import {
  AVATAR_CATALOG,
  attachAvatarRig,
  avatarThumbnailUrl,
  setStoredAvatarId,
  setStoredAvatarScale,
  storedAvatarId,
  storedAvatarScale,
  type AvatarCatalogEntry,
} from "./tellus-avatar-catalog";
import {
  type TellusTerrainState,
  type WorldGeneratedThing,
  type WorldPresence,
  type WorldPatch,
  emoteFromWorldPatch,
  chunkUpdatedFromWorldPatch,
  isTellusTerrainState,
  isWorldGeneratedThing,
} from "./world-protocol";
import { createChunkRenderer, type ChunkRenderer } from "./tellus-chunk-renderer";
import type { AgentId, TerrainKind, TerrainPaintKind, TerrainEditMode, GenerationProvider, DirectGenerationProvider, RoleGenerationProvider, InstantMeshTarget, GeneratedKind, ToolName, AssetPanelTab, ToolMenu, Vec3, GeneratedThing, AssetLibraryModel, AssetLibraryResponse, DistantIslandSpec, TellusLog, GenerateRequest, InteractRequest, TellusSnapshot, TellusWorldApi, TellusRuntimeConfig, AssetForgePipelineStart, AssetForgePipelineStatus, DirectGenerationResponse, GeneratedAssetManifestEntry, SpeechRecognitionConstructor, SpeechRecognitionLike, VehicleMode, MaterialWithTextureMaps, WorldTemplateId, LandShapeOverrides } from "./tellus-types";
import { WORLD_RADIUS, WORLD_SCALE, setWorldScale, worldScaleForId, scaledPlayerSpeed, OCEAN_RADIUS, SEA_LEVEL, DISTANT_ISLAND_COUNT, TERRAIN_SEGMENTS, DISTANT_TERRAIN_SEGMENTS, DISTANT_TERRAIN_VERTEX_COUNT, CENTRAL_WALK_RADIUS, DISTANT_WALK_LOCAL_RADIUS, PLAYER_SPEED, PENDING_GENERATION_FALLBACK_MS, POND_CENTER, POND_RADIUS, TERRAIN_VERTEX_COUNT, TERRAIN_SCULPT_RADIUS, TERRAIN_SCULPT_STEP, SKYBOX_FALLBACK_URLS, SKYBOX_VERTICAL_OFFSET, DEFAULT_DAY_NIGHT_CYCLE_MS, DEFAULT_DAY_NIGHT_START, MIN_DAY_NIGHT_CYCLE_MS, MOON_MODEL_URL, MOON_DISTANCE, MOON_SIZE, MOON_ARC_AZIMUTH, MOON_ARC_LATERAL_SWAY, PIXEL3D_PROVIDER, generationProviderLabels, instantMeshTargetLabels, terrainColors, terrainPaintKinds, waterMountTerms, airMountTerms, groundMountTerms, isChunkedWorldId, chunkedWorldCenter, getChunkedWorldChunks, CHUNK_SPAN } from "./tellus-constants";
import { readJsonResponse, boundedNumber, clamp, rand, isRecord, makeId, browserUuid, distance2D, promptIncludesAny, finiteNumber, sanitizeLogText, extractErrorMessage } from "./tellus-utils";
import { runtimeConfig, applyRuntimeConfig, loadRuntimeConfigFile, loadRuntimeConfig } from "./tellus-runtime-config";
import { tellusWorldHttpUrl, tellusAssetLibraryUrl, tellusWorldWebSocketUrl, tellusVisitorId, tellusUserId, tellusAgentUrl, absoluteAssetForgeUrl, tellusApiUrl, absoluteTellusApiUrl, toAssetId } from "./tellus-urls-identity";
import { terrainSculptOffsets, setTerrainStateDirty, setInitialWorldGeneratedThings, terrainPaint, terrainSaveTimer, terrainStateDirty, terrainStateLoaded, terrainStateRevision, tellusWorldBackendAvailable, initialWorldGeneratedThings, terrainPaintCode, terrainPaintKindFromCode, isTerrainPaintMode, terrainVertexColor, terrainGridIndex, distantTerrainGridIndex, terrainSculptOffsetAt, centralTerrainGridCoords, centralTerrainPaintAt, distantIslandLocalPoint, distantIslandWorldPoint, createDistantIslandSpec, distantIslandSpecs, rebuildDistantIslandSpecs, distantIslandLocalRadius, distantIslandSculptOffsetAt, distantIslandGridWorldPoint, distantTerrainGridCoords, distantTerrainPaintAt, nearestDistantIsland, distantIslandHeight, groundedPosition, groundHeightAt, isIntentionallyElevated, normalizedDiscPosition, oceanPosition, waterBlockedByLand, waterVehiclePosition, distantIslandShorePosition, vehicleMode, isMountThing, isVehicleThing, isFreeMovingVehicle, airPosition, movedVehiclePosition, baseTerrainHeight, terrainHeight, terrainKind, pondWaterLevel, terrainOffsetsPayload, terrainPaintPayload, distantTerrainOffsetsPayload, distantTerrainPaintPayload, tellusState, tellusStatePayload, terrainStorageKey, isResetTerrainState, saveTerrainStateLocally, loadTerrainStateLocally, applyTellusTerrainState, applyWorldTerrainTemplate, terrainFromWorldPatch, presenceFromWorldPatch, generatedFromWorldPatch, loadTellusWorldState, saveTellusWorldState, loadTellusState, loadChunkedWorldBounds, saveTellusStateSoon, saveTellusStateNow, isStalePendingGeneratedThing, setChunkedHeightProvider } from "./tellus-terrain";
import { gltfObjectCache, createGltfLoader, generatedAssetManifestEntries, generatedAssetManifestModelUrls, loadAssetLibraryModels, browseAssetLibrary, type AssetBrowseSort, configureKtx2Support, textureFailedModelUrls, startPixel3DGeneration, waitForPixel3DModelUrl, hasExternalGenerationProvider, isMissingApiRouteError, generationProviderForThing, startDirectInstantMeshGeneration, waitForDirectGeneration, cancelDirectGeneration } from "./tellus-generation-client";
import { createTerrainGeometry, createFloatingRim, createFallbackOceanMaterial, createOceanSurface, createDistantIslandTerrainGeometry, createDistantIsland, createDistantArchipelago, createSkyDome, createEnvironmentTexture, createMoonHorizonOccluderTexture, createMoonCloudVeil, createBackdropWaterMaterial, createFlowerSpriteTexture, createFlowerSpriteMaterials, disposeMaterial, disposeObject, fitModelToHeight, measureModelBounds, placeObjectAboveGround, loadGltfObject, generatedGltfCache, loadGeneratedGltfObject, prepareSkyboxModel, collectSkyboxTintMaterials, prepareMoonModel, loadSkyboxModel, assetTargetHeight, loadGeneratedModel, createPondWater, createGeneratedMesh, createGenerationSwirl, shouldShowGenerationSwirl, applyThingRotation, inferGeneratedKind, promptAccent, kindColor } from "./tellus-scene-builders";
import { createTerrainMaterial } from "./tellus-terrain-material";
import { installSessionFetch } from "./tellus-auth";
import { AuthControls, PremiumUpsellChip } from "./tellus-auth-ui";
import { buildAgentFeed, type AgentChatLine, type AgentToolChip } from "./agent-chat-format";
import { defaultSkyboxUrlForTemplate, parseLandShapeOverrides, parseWorldTemplateId, templateForWorldId } from "./tellus-world-templates";
import "./styles.css";

// Attach X-Tellus-Session to every Hyades API call (agent endpoints, world meta PATCH, state, pay)
// before ANY fetch fires — the /live WebSocket keeps the soft ?userId= identity instead.
installSessionFetch();

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
}

// One turn of the server-side agent's recent conversation (its dialog). role "assistant" = the agent speaking;
// "tool" = a tool call/result (rendered dimmer/smaller in the feed).
interface AgentTranscriptMessage {
  role: "assistant" | "tool";
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

// Shape of GET .../agent/memories — current self-section + recent edit log.
interface AgentMemoriesResponse {
  selfSection?: string;
  log?: AgentMemoryEntry[];
  entries?: AgentMemoryEntry[];
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

const WORLD_TEMPLATE_OPTIONS: Array<{ id: WorldTemplateId; label: string }> = [
  { id: "tellus", label: "Tellus" },
  { id: "wide-island", label: "Wide Island" },
  { id: "lowlands", label: "Lowlands" },
  { id: "ridge", label: "Ridge" },
];

const SKYBOX_OPTIONS: Array<{ url: string; label: string }> = [
  { url: "/skybox/free_-_skybox_in_the_cloud/scene.gltf", label: "Cloud Dome" },
  { url: "/skybox/free_-_skybox_basic_sky.glb", label: "Basic Sky" },
  { url: "/skybox/skybox_skydays_3.glb", label: "Sky Days" },
  { url: "/skybox/tellus-starry-night/scene.gltf", label: "Starry Night" },
  { url: "/skybox/tellus-blue-clouds/scene.gltf", label: "Blue Clouds" },
];

function worldTemplateLabel(template: WorldTemplateId): string {
  return (
    WORLD_TEMPLATE_OPTIONS.find((option) => option.id === template)?.label ??
    template
  );
}

function skyboxLabel(url: string): string {
  return SKYBOX_OPTIONS.find((option) => option.url === url)?.label ?? "Custom Sky";
}

function AgentToolChipPill({ chip }: { chip: AgentToolChip }) {
  const label = chip.summary ? `${chip.name} · ${chip.summary}` : chip.name;
  return (
    <span style={agentChipStyle} title={label}>
      <span aria-hidden="true">🔧</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </span>
  );
}

function createTellusWorld(
  container: HTMLElement,
  onSnapshot: (snapshot: TellusSnapshot) => void,
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
  const generatedMeshes = new Map<string, THREE.Object3D>();
  const generatedAnimationMixers = new Map<string, THREE.AnimationMixer>();
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
  const keys = new Set<string>();
  let selectedThingId: string | undefined;
  let sailingThingId: string | undefined;
  let externalSkybox: THREE.Object3D | null = null;
  let moonModel: THREE.Object3D | null = null;
  const moonMaterials = new Set<THREE.MeshStandardMaterial>();
  const moonCloudVeil = createMoonCloudVeil();
  let directGenerationAvailable = true;
  let worldSocket: WebSocket | null = null;
  let worldSocketReconnectTimer: number | undefined;
  let worldSocketClosedByDestroy = false;
  const visitorId = tellusVisitorId();
  const userId = tellusUserId();
  const remoteVisitorMeshes = new Map<string, THREE.Group>();
  const remoteVisitors = new Map<string, WorldPresence>();
  // Rigged VRM avatar upgrades, keyed by visitorId (the local player's rig uses its own visitorId
  // — applyRemotePresence never creates a remote entry for it). Each rig's update(dt) runs in
  // animate(); rigs are disposed on remote prune and on destroy.
  const avatarRigs = new Map<string, AvatarRig>();
  let lastPresenceSentAt = 0;

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
  const useWebGPU = "gpu" in navigator;
  // Visual terrain density (decoupled from the synced 97² sculpt grid). FIXED vertex budget no
  // matter the world scale — bigger worlds stretch the same ~50K-vertex mesh instead of multiplying
  // it (operator: range over thickness; worlds get larger for less).
  const terrainRenderSegments = useWebGPU ? 224 : 144;
  const ocean = createOceanSurface(useWebGPU);
  const archipelago = createDistantArchipelago(useWebGPU);
  // Ambient procedural vegetation (wind-swayed grass/flowers streamed around the player + island-wide
  // trees/rocks) and the lightweight physics world (thrown things, player jump/obstacles). Both are
  // deterministic from the synced terrain state — no protocol changes.
  //
  // Vegetation is OFF by default (per-frame streaming/stamping cost); the localStorage
  // "tellus.grass"="1" escape hatch re-enables the full system. When off, a no-op stub stands in so
  // every call site (per-frame update, terrain-change notify, tree colliders, stats, dispose) stays
  // branch-free — zero per-frame cost.
  const grassEnabled = (() => {
    try {
      return window.localStorage.getItem("tellus.grass") === "1";
    } catch {
      return false;
    }
  })();
  const vegetation = grassEnabled
    ? createVegetation({
        scene,
        useWebGPU,
        sampleHeight: terrainHeight,
        samplePaint: centralTerrainPaintAt,
        isExcluded: (x, z, h) => {
          const pdx = x - POND_CENTER.x;
          const pdz = z - POND_CENTER.z;
          return (
            pdx * pdx + pdz * pdz < (POND_RADIUS + 0.6) * (POND_RADIUS + 0.6) &&
            h < pondWaterLevel() + 0.35
          );
        },
        pondRing: {
          x: POND_CENTER.x,
          z: POND_CENTER.z,
          radius: POND_RADIUS,
          level: pondWaterLevel(),
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
      const pdx = x - POND_CENTER.x;
      const pdz = z - POND_CENTER.z;
      if (pdx * pdx + pdz * pdz < (POND_RADIUS + 0.4) * (POND_RADIUS + 0.4)) {
        return pondWaterLevel();
      }
      return SEA_LEVEL;
    },
    worldRadius: OCEAN_RADIUS - 6,
  });
  const isChunked = isChunkedWorldId(runtimeConfig.worldId);
  let chunkRenderer: ChunkRenderer | null = null;
  let lastActiveChunkCount = -1; // re-ground placed assets when the active chunk set changes
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
    // Walk the sculpted chunk heightfield where chunks are loaded (flat base elsewhere).
    setChunkedHeightProvider((x, z) => chunkRenderer!.sampleHeight(x, z));
  }
  const pondWater = createPondWater();
  const flowerPatchGroup = new THREE.Group();
  flowerPatchGroup.name = "tellus-flower-patches";
  const flowerSpriteMaterials = createFlowerSpriteMaterials();
  scene.add(
    fallbackSky,
    ocean,
    archipelago,
    terrain,
    pondWater,
    flowerPatchGroup,
    createFloatingRim(),
    moonCloudVeil.group,
  );

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
  // to land in the middle of the tiled plane; classic worlds keep the island-disc spawn.
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
    generationProvider: runtimeConfig.generationProvider,
    playerGenerationProvider: runtimeConfig.playerGenerationProvider,
    agentGenerationProvider: runtimeConfig.agentGenerationProvider,
    instantMeshTarget: runtimeConfig.instantMeshTarget,
    userId,
    visitorPosition: { ...visitorPosition },
    visitorYaw: yaw, // facing direction (radians) for the minimap view cone
    viewDistance: scene.fog instanceof THREE.Fog ? scene.fog.far : 200 * WORLD_SCALE, // how far we can see
    remoteVisitors: Array.from(remoteVisitors.values()).map((presence) => ({
      ...presence,
      position: presence.position ? { ...presence.position } : undefined,
    })),
    selectedThingId,
    sailingThingId,
  });

  // Coalesce HUD publishes to at most one per animation frame. publish() can be called many times per frame
  // (every WS patch, every transform-drag frame); each onSnapshot is a deep-cloned snapshot + a React
  // re-render, so collapsing them to a single flush in animate() removes the per-frame clone/render storm.
  let publishPending = false;
  const publish = () => {
    publishPending = true;
  };
  const flushPublish = () => {
    if (!publishPending) return;
    publishPending = false;
    onSnapshot(snapshot());
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

  const updatePondSurfacePosition = () => {
    const waterLevel = pondWaterLevel();
    const pondSurface = pondWater.getObjectByName("tellus-pond-surface");
    if (pondSurface) {
      pondSurface.position.y = waterLevel;
      pondSurface.rotation.z = 0;
    }
    const ripples = pondWater.getObjectByName("tellus-pond-ripples");
    if (ripples) ripples.position.y = waterLevel + 0.035;
    const shore = pondWater.getObjectByName("tellus-pond-shore");
    if (shore) shore.position.y = waterLevel - 0.035;
  };

  const refreshFlowerPatches = () => {
    flowerPatchGroup.clear();
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
        const scale = 0.52 + rand(seed + 409) * 0.32;
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
      if (!isFreeMovingVehicle(thing) && !isIntentionallyElevated(thing)) {
        thing.position = groundedPosition(thing.position.x, thing.position.z, thing.position);
        updateThingMeshPosition(thing);
      }
    }
    publish();
  };

  const applyRemotePresence = (presence: WorldPresence[]) => {
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
    for (const [remoteId, mesh] of remoteVisitorMeshes) {
      if (activeRemoteIds.has(remoteId)) continue;
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
    }
    // Feed the live roster to the mesh (drives connect/disconnect of PCs).
    feedP2pPresence(Array.from(activeRemoteIds));
    publish();
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
          if (distance > TERRAIN_SCULPT_RADIUS) continue;
          const falloff =
            (1 + Math.cos((distance / TERRAIN_SCULPT_RADIUS) * Math.PI)) * 0.5;
          const index = distantTerrainGridIndex(xIndex, zIndex);
          if (paintCode) {
            if (falloff > 0.18) distantIsland.paint[index] = paintCode;
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
      // classic brush — keeps the math identical to the server's classic-space sculpt port.
      const brushRadius = TERRAIN_SCULPT_RADIUS * WORLD_SCALE;
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
            if (falloff > 0.18) terrainPaint[index] = paintCode;
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

    visitorPosition = groundedPosition(visitorPosition.x, visitorPosition.z, visitorPosition);
    for (const thing of generated) {
      if (!isFreeMovingVehicle(thing) && !isIntentionallyElevated(thing)) {
        thing.position = groundedPosition(thing.position.x, thing.position.z, thing.position);
        updateThingMeshPosition(thing);
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

  // Chunked worlds hold NO inline classic grid — terrain lives in per-chunk grains. So a sculpt must go to
  // the SERVER as a terrain.sculpt action (world grain → owning chunk grain(s) → chunk.updated patch →
  // chunkRenderer.reloadChunk), NOT edit the hidden 97² classic grid the way classic worlds do.
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
      // Foldable = candidate AND not currently selected.
      const foldable = candidates.filter((t) => t.id !== selectedThingId);

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
    if (prev?.modelUrl) urls.add(prev.modelUrl);
    if (next?.modelUrl) urls.add(next.modelUrl);
    // A selected thing is never instanced; pop it out first so its regular mesh is live before any re-fold.
    if (nextSelectedId) uninstanceThing(nextSelectedId);
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
    mixer.stopAllAction();
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

  const startGeneratedAnimation = (id: string, model: THREE.Object3D) => {
    stopGeneratedAnimation(id);
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
    const wanted = thingById(id)?.animation?.trim();
    const wantedClip = wanted
      ? clips.find((c) => c.name === wanted) ??
        clips.find((c) => c.name?.toLowerCase() === wanted.toLowerCase())
      : undefined;
    const find = (frag: string) => clips.find((c) => c.name?.toLowerCase().includes(frag));
    const bad = (c: THREE.AnimationClip) => {
      const n = (c.name ?? "").toLowerCase();
      return (
        n.includes("rest") || n.includes("t-pose") || n.includes("tpose") ||
        n.includes("death") || n.includes("die") || n.includes("attack") || n.includes("bite")
      );
    };
    // Missing/renamed picks fall back to the heuristic rather than freezing the model.
    const clip =
      wantedClip ?? find("idle") ?? find("walk") ?? clips.find((c) => !bad(c)) ?? clips[0];
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(clip).play();
    generatedAnimationMixers.set(id, mixer);
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

  const updateThingMeshPosition = (thing: GeneratedThing) => {
    const mesh = generatedMeshes.get(thing.id);
    if (!mesh) return;
    applyThingRotation(mesh, thing);
    if (
      mesh.userData.generatingSwirl ||
      isFreeMovingVehicle(thing) ||
      isIntentionallyElevated(thing) ||
      Math.hypot(thing.position.x, thing.position.z) > WORLD_RADIUS
    ) {
      mesh.position.set(thing.position.x, thing.position.y, thing.position.z);
      if (mesh.userData.generatingSwirl) {
        mesh.userData.baseY = mesh.position.y;
      }
      refreshInstancedThingMatrix(thing);
      updateSelectionIndicator();
      return;
    }
    // Chunked worlds: the stored thing.position.y may have been grounded against the flat base
    // (sampleHeight returns null until the owning chunk streams in), so once the sculpted chunk
    // loads the asset would sit BELOW the surface. Re-sample the live ground height here so the
    // model's feet rest flush on the sculpted terrain. Falls through to the stored y otherwise.
    const liveGround = isChunked
      ? groundHeightAt(thing.position.x, thing.position.z)
      : null;
    const placeAt =
      liveGround !== null && Number.isFinite(liveGround)
        ? { ...thing.position, y: liveGround }
        : thing.position;
    placeObjectAboveGround(mesh, placeAt, 0.04);
    refreshInstancedThingMatrix(thing);
    updateSelectionIndicator();
  };

  const updateSelectionIndicator = (_now?: number) => undefined;

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
    modelUrl: thing.modelUrl,
    pipelineId: thing.modelUrl ? undefined : thing.pipelineId,
    generationStatus: thing.modelUrl ? "ready" : thing.generationStatus,
    // "" = explicit "default" (mirrors presence.avatarId): a mid-rollout server that doesn't know
    // the field yet echoes it back ABSENT, and absent must mean "keep what you have", not "clear".
    animation: thing.animation ?? "",
    updatedAt: new Date().toISOString(),
  });

  const normalizeGeneratedThing = (thing: WorldGeneratedThing): WorldGeneratedThing => {
    // procedural:// URLs are scheme-addressed local builds — absolutizing them (meant for legacy
    // relative GLB paths) would mangle them into "/procedural://…" and break rendering.
    const modelUrl = thing.generationStatus === "failed"
      ? undefined
      : thing.modelUrl
        ? (sanitizeProceduralModelUrl(thing.modelUrl) ?? absoluteTellusApiUrl(thing.modelUrl))
        : undefined;
    const stalePending = isStalePendingGeneratedThing(thing);
    return {
      ...thing,
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

    existing.modelUrl = normalized.modelUrl;
    existing.pipelineId = normalized.modelUrl ? undefined : normalized.pipelineId;
    existing.generationStatus = normalized.modelUrl
      ? "ready"
      : normalized.generationStatus;
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

  const loadRemoteGeneratedModel = (thing: GeneratedThing) => {
    if (!thing.modelUrl || thing.generationStatus !== "ready") return;
    const currentMesh = generatedMeshes.get(thing.id);
    if (currentMesh?.userData.loadedModelUrl === thing.modelUrl) {
      return;
    }
    void loadGeneratedModel(thing.modelUrl, thing, useWebGPU)
      .then((model) => {
        if (destroyed || !thingById(thing.id)) {
          disposeObject(model);
          return;
        }
        const oldMesh = generatedMeshes.get(thing.id);
        if (oldMesh) {
          uninstanceThing(thing.id); // free any instance slot the old mesh held before we swap it out
          stopGeneratedAnimation(thing.id);
          scene.remove(oldMesh);
          disposeObject(oldMesh);
        }
        model.userData.loadedModelUrl = thing.modelUrl;
        generatedMeshes.set(thing.id, model);
        startGeneratedAnimation(thing.id, model);
        scene.add(model);
        syncTransformControls();
        reevaluateInstanceGroup(thing.modelUrl);
        publish();
      })
      .catch((error) => {
        console.warn("Remote generated model load failed", error);
        if (thing.modelUrl) {
          thing.modelUrl = undefined;
          thing.generationStatus = "failed";
          thing.pipelineId = undefined;
          ensureGeneratedVisual(thing);
          publishGeneratedThing(thing);
          publish();
        }
      });
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
    void generatedAssetManifestModelUrls()
      .then((modelUrls) => {
        if (destroyed) return;
        const modelUrl = modelUrls.get(thing.id);
        if (!modelUrl) return;
        const current = thingById(thing.id);
        if (!current || current.modelUrl) return;
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
      existing.kind = normalized.kind as GeneratedKind;
      existing.prompt = normalized.prompt;
      existing.creatorId = normalized.creatorId as AgentId | "visitor";
      existing.ownerUserId = normalized.ownerUserId;
      existing.position = { ...normalized.position };
      existing.rotationX = normalized.rotationX ?? 0;
      existing.rotationY = normalized.rotationY;
      existing.rotationZ = normalized.rotationZ ?? 0;
      existing.scale = normalized.scale;
      existing.color = normalized.color;
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
      modelUrl: normalized.modelUrl,
      pipelineId: normalized.pipelineId,
      generationStatus: normalized.generationStatus,
      animation: normalized.animation || undefined, // "" (explicit default) → unset internally
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
    if (healedPending) {
      publishGeneratedThing(thing);
    }
  };

  const applyRemoteGeneratedThings = (remoteThings: WorldGeneratedThing[]) => {
    for (const remote of remoteThings) {
      applyRemoteGeneratedThing(remote);
    }
    saveGeneratedPlacementSnapshot();
    publish();
  };

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
              modelUrl: absoluteTellusApiUrl(entry.modelUrl),
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

  if (tellusWorldBackendAvailable && initialWorldGeneratedThings.length > 0) {
    applyRemoteGeneratedThings(initialWorldGeneratedThings);
    setInitialWorldGeneratedThings([]);
  }

  connectTellusWorldRealtime();
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
    visitorPosition = groundedPosition(
      thing.position.x - offset.x * 3.2,
      thing.position.z - offset.z * 3.2,
      visitorPosition,
    );
    updateSelectionIndicator();
    syncTransformControls();
    sendPresenceUpdate(true);
    publish();
  };

  // Warp the player to a world (x,z) — the click-map teleport. Grounds onto the terrain (chunked-aware via
  // groundedPosition), cancels any fall/run-accel, and republishes presence so peers see the jump.
  const warpTo = (x: number, z: number) => {
    visitorPosition = groundedPosition(x, z, visitorPosition);
    playerAirborne = false;
    playerVy = 0;
    moveHoldStartMs = 0;
    sendPresenceUpdate(true);
    publish();
  };

  const moveGenerated = (id: string, dx: number, dz: number) => {
    const thing = thingById(id);
    if (!thing) return;
    const position =
      isVehicleThing(thing) || sailingThingId === id
        ? movedVehiclePosition(
            thing,
            thing.position.x + dx,
            thing.position.z + dz,
            thing.position,
          )
        : groundedPosition(
            thing.position.x + dx,
            thing.position.z + dz,
            thing.position,
          );
    thing.position = position;
    if (sailingThingId === id) {
      visitorPosition = { ...position };
    }
    updateThingMeshPosition(thing);
    publishGeneratedThing(thing);
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
    const groundY = groundHeightAt(thing.position.x, thing.position.z);
    const baseY =
      groundY ??
      (Math.hypot(thing.position.x, thing.position.z) > WORLD_RADIUS
        ? SEA_LEVEL + 0.14
        : thing.position.y);
    thing.position = {
      ...thing.position,
      y: clamp(thing.position.y + amount, baseY, baseY + 30),
    };
    if (sailingThingId === id) {
      visitorPosition = { ...thing.position };
    }
    updateThingMeshPosition(thing);
    publishGeneratedThing(thing);
    publish();
  };

  const groundGenerated = (id: string) => {
    const thing = thingById(id);
    if (!thing) return;
    thing.position = groundedPosition(thing.position.x, thing.position.z, thing.position);
    if (sailingThingId === id) {
      visitorPosition = { ...thing.position };
    }
    updateThingMeshPosition(thing);
    publishGeneratedThing(thing);
    publish();
  };

  const deleteGenerated = (id: string) => {
    const index = generated.findIndex((thing) => thing.id === id);
    if (index < 0) return;
    const previousSelectedId = selectedThingId;
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
      visitorPosition = { ...thing.position };
    }
    updateThingMeshPosition(thing);
    publishGeneratedThing(thing);
    publish();
  };

  const boardGenerated = (id: string) => {
    const thing = thingById(id);
    const mode = thing ? vehicleMode(thing) : null;
    if (!thing || !mode) return;
    const previousSelectedId = selectedThingId;
    sailingThingId = id;
    selectedThingId = id;
    reevaluateInstancingForSelection(previousSelectedId, selectedThingId);
    if (mode === "water" && waterBlockedByLand(thing.position)) {
      moveGeneratedToWater(id);
    } else if (mode === "air") {
      thing.position = airPosition(thing.position.x, thing.position.z);
    }
    const boarded = thingById(id);
    if (boarded) {
      visitorPosition = { ...boarded.position };
      updateThingMeshPosition(boarded);
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
      scale: request.scale ?? 0.75 + rand(tick + generated.length) * 0.8,
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
          thing.modelUrl = absoluteTellusApiUrl(result.modelUrl);
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

  const addLibraryAsset = (model: AssetLibraryModel): GeneratedThing => {
    const prompt = model.description?.trim() || model.name;
    const kind = inferGeneratedKind(prompt, "visitor");
    // Prefer the game-optimized (meshopt-compressed) variant — typically ~80% smaller, same visual
    // quality. The store's game-optimized endpoint safely serves the original GLB when no optimized
    // build exists, so there's no 404 risk and no client-side fallback needed. (MeshoptDecoder is
    // already wired into the GLTF loader.)
    const modelUrl =
      model.modelUrl ??
      tellusAssetLibraryUrl(`/api/assets/model/${encodeURIComponent(model.id)}/game-optimized`);
    const position = chooseLocation({
      prompt,
      creatorId: "visitor",
      location: {
        x: visitorPosition.x + Math.sin(yaw) * 4,
        y: 0,
        z: visitorPosition.z + Math.cos(yaw) * 4,
      },
    });
    const thing: GeneratedThing = {
      id: makeId(kind),
      kind,
      prompt: model.name,
      creatorId: "visitor",
      ownerUserId: userId,
      position,
      rotationY: 0,
      scale: 1,
      color: kindColor(kind, prompt),
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
      agentId: "visitor",
      agentName: "Visitor",
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
        thing.generationStatus = "failed";
        publishGeneratedThing(thing);
        addLog({
          agentId: "world",
          agentName: "Tellus",
          tool: "generate",
          text: `Library asset failed to load: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        });
      });
    return thing;
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
  const RUN_GRACE_MS = 2000;
  const RUN_EXP_BASE = 1.7; // exponential growth per second past the grace
  const RUN_MAX_MULT = 6; // top speed = 6× walk
  const runSpeedMultiplier = (nowMs: number): number => {
    if (moveHoldStartMs === 0) return 1;
    const heldS = (nowMs - moveHoldStartMs - RUN_GRACE_MS) / 1000;
    if (heldS <= 0) return 1;
    return Math.min(RUN_MAX_MULT, Math.pow(RUN_EXP_BASE, heldS));
  };
  let obstacleCache: ObstacleCircle[] = [];
  let obstacleCacheAt = 0;
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
  const currentObstacles = (): ObstacleCircle[] => {
    const nowMs = performance.now();
    if (nowMs - obstacleCacheAt > 500) {
      obstacleCacheAt = nowMs;
      const list: ObstacleCircle[] = [...vegetation.getTreeColliders()];
      for (const thing of generated) {
        // Pass through: the vehicle you're riding, ambient-physics props (their own collision),
        // and the thing you're actively dragging (else it shoves you around as you place it).
        if (thing.id === sailingThingId || ambientPhysics.has(thing.id)) continue;
        if (thing.id === draggingThingId) continue;
        const fp = thingFootprint(thing);
        // Skip tiny/flat items you should be able to walk over (rugs, coins, low debris).
        if (!fp || fp.height < 1.4 || fp.radius < 0.55) continue;
        // only solid when the player can actually run into it (not lifted into the sky)
        if (thing.position.y > visitorPosition.y + 2.2) continue;
        list.push({
          x: thing.position.x,
          z: thing.position.z,
          // Solid radius scales with the model's footprint (capped so huge props stay passable
          // around the edges); the 0.7 factor lets you brush past rather than bumping a fat box.
          r: clamp(fp.radius * 0.7, 0.55, 2.6),
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
    // Proceed if there's horizontal input, we're mid-air, free-flying, or giving vertical input on a mount.
    if (!hasInput && !playerAirborne && !flying && !(sailingThingId && verticalInput)) return;
    if (hasInput) movement.normalize().multiplyScalar(scaledPlayerSpeed() * runSpeedMultiplier(performance.now()) * delta);
    if (sailingThingId) {
      playerAirborne = false;
      playerVy = 0;
      const boat = thingById(sailingThingId);
      if (!boat) {
        sailingThingId = undefined;
        return;
      }
      if (vehicleMode(boat) === "air") {
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
      visitorPosition = { ...boat.position };
      const mesh = generatedMeshes.get(boat.id);
      if (mesh) {
        mesh.position.set(boat.position.x, boat.position.y, boat.position.z);
        if (movement.lengthSq() > 0.001) {
          boat.rotationY = Math.atan2(movement.x, movement.z);
          mesh.rotation.y = boat.rotationY;
        }
      }
      publishGeneratedThing(boat);
      sendPresenceUpdate();
      publish();
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
    // obstacle pushout, then ground/air vertical dynamics
    const pushed = resolveObstacles(
      visitorPosition.x + movement.x,
      visitorPosition.z + movement.z,
      0.5,
      currentObstacles(),
    );
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
        const scale = POND_RADIUS * (0.22 + phase * 0.72);
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
    externalSkybox.position.set(
      cameraPosition.x - skyboxCenter.x * skyboxScale,
      cameraPosition.y + SKYBOX_VERTICAL_OFFSET - skyboxCenter.y * skyboxScale,
      cameraPosition.z - skyboxCenter.z * skyboxScale,
    );
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

  const updateDayNightCycle = (cycleNow: number, animationNow = performance.now()) => {
    const phase =
      (runtimeConfig.dayNightStart + cycleNow / runtimeConfig.dayNightCycleMs) % 1;
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
    if (scene.background instanceof THREE.Color) {
      scene.background.copy(backgroundColor);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(backgroundColor);
      scene.fog.near = (54 + daylight * 18) * WORLD_SCALE;
      scene.fog.far = (176 + daylight * 54) * WORLD_SCALE;
    }
    {
      // Environment (ambient PBR reflections) brightens with the day and warms at the golden hours.
      scene.environmentIntensity = 0.16 + daylight * 0.5 + twilight * 0.18;
    }

    skyboxTint
      .copy(nightSkyboxTint)
      .lerp(daylightSkyboxTint, daylight)
      .lerp(twilightSkyboxTint, twilight * 0.62);
    for (const material of skyboxTintMaterials) {
      material.color.copy(skyboxTint);
    }

    sun.position.set(Math.cos(angle) * -72, sunHeight * 88, Math.sin(angle) * 58);
    sun.intensity = 0.05 + daylight * 4.15 + twilight * 0.55;
    sunColor.copy(nightSun).lerp(daylightSun, daylight).lerp(duskSun, twilight);
    sun.color.copy(sunColor);

    moon.position.copy(sun.position).multiplyScalar(-1);
    moon.position.y = Math.max(18, moon.position.y);
    moon.intensity = 0.42 + night * 3.35;
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
      const moonHorizonAmount =
        1 - THREE.MathUtils.smoothstep(moonArcHeight, 0.24, 0.48);
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
      moonArcDirection.set(
        baseMoonX + sideMoonX * moonLateral,
        0.13,
        baseMoonZ + sideMoonZ * moonLateral,
      );
      moonDirection.copy(moonArcDirection).normalize();
      moonCloudVeil.group.position.copy(camera.position).addScaledVector(
        moonDirection,
        MOON_DISTANCE - 0.55,
      );
      moonCloudVeil.group.lookAt(camera.position);
      moonCloudVeil.group.visible = moonHorizonAmount > 0.03 && moonVisibility > 0.02;
      moonMaterialColor.copy(moonDayTint).lerp(moonNightTint, night);
      for (const material of moonMaterials) {
        material.color.copy(moonMaterialColor);
        material.emissive.copy(moonMaterialColor).multiplyScalar(2.2 + night * 1.45);
      }
      moonCloudVeil.materials.forEach((material) => {
        material.color.copy(oceanColor);
        material.opacity =
          moonVisibility *
          moonHorizonAmount *
          (0.72 + night * 0.28);
        if (material.map) {
          material.map.offset.x = (animationNow * 0.000004) % 1;
        }
      });
    }

    hemiSkyColor
      .copy(nightHemiSky)
      .lerp(daylightHemiSky, daylight)
      .lerp(duskHemiSky, twilight * 0.55);
    hemiGroundColor.copy(nightHemiGround).lerp(daylightHemiGround, daylight);
    hemisphere.color.copy(hemiSkyColor);
    hemisphere.groundColor.copy(hemiGroundColor);
    hemisphere.intensity = 0.82 + daylight * 1.55 + twilight * 0.3;

    const oceanMaterial = ocean.material;
    if (oceanMaterial instanceof THREE.MeshBasicMaterial) {
      oceanMaterial.color.copy(oceanColor);
      oceanMaterial.opacity = 0.58 + daylight * 0.14;
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
  const AGENT_VIEW_W = 256;
  const AGENT_VIEW_H = 144;
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
      // celestials follow the player camera — recenter them on the POV for this off-screen draw
      povSkyDelta.copy(povCamera.position).sub(camera.position);
      syncExternalSkyboxToCamera(povCamera.position);
      if (moonModel) moonModel.position.add(povSkyDelta);
      moonCloudVeil.group.position.add(povSkyDelta);
      try {
        renderer.setRenderTarget(agentViewTarget);
        renderer.render(scene, povCamera);
      } finally {
        renderer.setRenderTarget(prevTarget);
        if (moonModel) moonModel.position.sub(povSkyDelta);
        moonCloudVeil.group.position.sub(povSkyDelta);
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
      return agentViewCanvas.toDataURL("image/jpeg", 0.55);
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
    let skyShifted = false;
    let viewportSaved = false;
    let savedScissorTest = false;
    try {

      // The skybox dome + moon + cloud veil are repositioned every frame to follow the PLAYER camera
      // (updateCamera / updateDayNightCycle). Without this they stay centered on the player, so the PiP
      // shows the player's sky/moon, not the agent's. Shift them by (POV - player) for this render, then
      // undo it in the finally so the next main-loop frame starts from a clean player-centered state.
      povSkyDelta.copy(povCamera.position).sub(camera.position);
      syncExternalSkyboxToCamera(povCamera.position);
      if (moonModel) moonModel.position.add(povSkyDelta);
      moonCloudVeil.group.position.add(povSkyDelta);
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
      renderer.render(scene, povCamera);
    } catch {
      /* a bad PiP frame must never break the main loop */
    } finally {
      try {
        // Restore the celestials to the player camera (next frame's updateCamera re-syncs the skybox too,
        // but undo the moon shift here so a mid-frame read never sees the POV-shifted position).
        if (skyShifted) {
          if (moonModel) moonModel.position.sub(povSkyDelta);
          moonCloudVeil.group.position.sub(povSkyDelta);
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
    moveVisitor(delta);
    for (const mixer of generatedAnimationMixers.values()) {
      mixer.update(delta);
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
        for (const thing of generated) {
          if (isFreeMovingVehicle(thing) || isIntentionallyElevated(thing)) continue;
          updateThingMeshPosition(thing);
        }
      }
    }
    // Keep the minimap view-cone live while turning in place (~10fps, only on a real yaw change).
    if (Math.abs(yaw - lastConeYaw) > 0.02 && now - lastConePublishMs > 100) {
      lastConeYaw = yaw;
      lastConePublishMs = now;
      publish();
    }
    flushPublish();
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
    // F toggles free-fly (not while riding a vehicle — air mounts have their own ascend/descend).
    if (
      event.key.toLowerCase() === "f" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !sailingThingId
    ) {
      flying = !flying;
      playerAirborne = false;
      playerVy = 0;
      addLog({ agentId: "visitor", agentName: "Visitor", tool: "interact", text: flying ? "fly mode ON (Space up / C down)" : "fly mode off" });
      return;
    }
    keys.add(event.key.toLowerCase());
  };
  const handleKeyUp = (event: KeyboardEvent) =>
    keys.delete(event.key.toLowerCase());
  const handlePageHide = () => {
    publishTerrainStateNow();
    saveTellusStateNow();
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      handlePageHide();
    }
  };
  const handlePointerDown = (event: PointerEvent) => {
    if (transformDragging) return;
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
    let prevT = 0;
    let prevAbove = ray.origin.y - terrainHeight(ray.origin.x, ray.origin.z) > 0;
    for (let t = 2; t <= maxT; t += 2) {
      const x = ray.origin.x + ray.direction.x * t;
      const z = ray.origin.z + ray.direction.z * t;
      const y = ray.origin.y + ray.direction.y * t;
      const ground = Math.hypot(x, z) <= CENTRAL_WALK_RADIUS ? terrainHeight(x, z) : SEA_LEVEL;
      const above = y - ground > 0;
      if (prevAbove && !above) {
        let lo = prevT;
        let hi = t;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          const mx = ray.origin.x + ray.direction.x * mid;
          const mz = ray.origin.z + ray.direction.z * mid;
          const my = ray.origin.y + ray.direction.y * mid;
          const mg = Math.hypot(mx, mz) <= CENTRAL_WALK_RADIUS ? terrainHeight(mx, mz) : SEA_LEVEL;
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
      isDragging = false;
      return;
    }
    if (isDragging && pointerTravel < 6) {
      selectGeneratedAtPointer(event);
    }
    isDragging = false;
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
      void loadSkyboxModel()
        .then((skyboxResult) => {
          if (!skyboxResult || destroyed) return;
          scene.remove(fallbackSky);
          if (fallbackSky.material instanceof THREE.MeshBasicMaterial) {
            skyboxTintMaterials.delete(fallbackSky.material);
          }
          fallbackSky.geometry.dispose();
          disposeMaterial(fallbackSky.material);
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
            text: `Loaded external skybox: ${
              skyboxResult.url.split("/").pop() ?? skyboxResult.url
            }`,
          });
        })
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
  const nearToLocation = (near: unknown): GenerateRequest["location"] =>
    near === "mountain" ? "near-mountain" : near === "pond" ? "near-pond" : near === "agent" ? "near-agent" : { ...visitorPosition };
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
    getState(radius = 30) {
      const groundHeight = terrainHeight(visitorPosition.x, visitorPosition.z);
      return {
        visitorId,
        position: { ...visitorPosition },
        terrainType: terrainKind(visitorPosition.x, visitorPosition.z, groundHeight),
        terrainHeight: groundHeight,
        distanceToPond: Math.hypot(visitorPosition.x - POND_CENTER.x, visitorPosition.z - POND_CENTER.z),
        distanceToSummit: Math.hypot(visitorPosition.x, visitorPosition.z),
        distanceToShore: Math.max(0, WORLD_RADIUS - Math.hypot(visitorPosition.x, visitorPosition.z)),
        nearby: tellusAgent.getNearby(radius),
        verbs: ["moveSelf", "generate", "sculptTerrain", "moveAsset", "rotateAsset", "scaleAsset", "moveAssetToWater"],
      };
    },
    sendAction(verb: string, args: Record<string, unknown> = {}) {
      const a = args ?? {};
      switch (verb) {
        case "moveSelf": {
          visitorPosition = groundedPosition(
            visitorPosition.x + clamp(num(a.dx, 0), -8, 8),
            visitorPosition.z + clamp(num(a.dz, 0), -8, 8),
            visitorPosition,
          );
          sendPresenceUpdate(true);
          return { ok: true, position: { ...visitorPosition } };
        }
        case "generate": {
          if (typeof a.prompt !== "string" || !a.prompt.trim()) return { ok: false, error: "generate requires a prompt" };
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
        default:
          return { ok: false, error: `unknown verb: ${verb}` };
      }
    },
  };
  window.tellusAgent = tellusAgent;

  return {
    generate,
    addLibraryAsset,
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
    sculptTerrain,
    importGeneratedThings,
    setGenerationProvider,
    setPlayerGenerationProvider,
    setAgentGenerationProvider,
    setInstantMeshTarget,
    submitVisitorPrompt,
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
      if (avatarId === localAvatarId) return;
      localAvatarId = avatarId;
      setStoredAvatarId(avatarId);
      applyAvatarTo(visitor, visitorId, avatarId); // local rig rebuilds immediately
      sendPresenceUpdate(true); // broadcast the new pick right away (not on the 300ms cadence)
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
      physicsBodies: ambientPhysics.activeCount(),
    }),
    destroy: () => {
      destroyed = true;
      window.clearInterval(textureRetryTimer);
      agentViewTarget?.dispose();
      vegetation.dispose();
      chunkRenderer?.dispose();
      setChunkedHeightProvider(null);
      ambientPhysics.dispose();
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
      container.removeEventListener("wheel", handleWheel);
      worldSocketClosedByDestroy = true;
      if (worldSocketReconnectTimer !== undefined) {
        window.clearTimeout(worldSocketReconnectTimer);
      }
      worldSocket?.close();
      delete window.__tellusAvatarDebug;
      delete window.__tellusViewDebug;
      delete window.__tellusThingsDebug;
      delete window.__tellusMirrorDebug;
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

// One avatar-picker grid tile: store thumbnail when it loads, else a colored-initial fallback
// ("classic" has no store thumbnail and always renders the initial tile). Click = select.
function AvatarTile({
  entry,
  selected,
  onSelect,
}: {
  entry: AvatarCatalogEntry;
  selected: boolean;
  onSelect: (entry: AvatarCatalogEntry) => void;
}): React.ReactElement {
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbUrl = avatarThumbnailUrl(entry);
  // Deterministic tile hue per label so the initials fallback stays distinctive.
  let hue = 0;
  for (let i = 0; i < entry.label.length; i++) hue = (hue * 31 + entry.label.charCodeAt(i)) % 360;
  return (
    <button
      type="button"
      title={entry.label}
      aria-pressed={selected}
      onClick={() => onSelect(entry)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
        padding: 4,
        borderRadius: 8,
        border: selected ? "1px solid #6fae46" : "1px solid rgba(255,255,255,0.14)",
        background: selected ? "rgba(111,174,70,0.22)" : "rgba(255,255,255,0.05)",
        color: "#dfe7d8",
        cursor: "pointer",
      }}
    >
      {thumbUrl && !thumbFailed ? (
        <img
          src={thumbUrl}
          alt={entry.label}
          onError={() => setThumbFailed(true)}
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            objectFit: "cover",
            borderRadius: 6,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 700,
            color: "#0c1016",
            background: `hsl(${hue} 45% 62%)`,
          }}
        >
          {entry.label.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span
        style={{
          fontSize: 10,
          lineHeight: 1.2,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {entry.label}
      </span>
    </button>
  );
}

// One asset-store search-result tile — same square-thumbnail grid look as AvatarTile, driven by a
// browse-card AssetLibraryModel. Store thumbnail when available, else a deterministic colored-initial
// fallback. Click = drop the asset into the world.
function AssetTile({
  model,
  onSelect,
}: {
  model: AssetLibraryModel;
  onSelect: (model: AssetLibraryModel) => void;
}): React.ReactElement {
  const [thumbFailed, setThumbFailed] = useState(false);
  const thumbUrl =
    model.hasThumbnail && !thumbFailed
      ? tellusAssetLibraryUrl(`/api/assets/model/${encodeURIComponent(model.id)}/thumbnail`)
      : null;
  // Deterministic tile hue per name so the initials fallback stays distinctive (matches AvatarTile).
  let hue = 0;
  for (let i = 0; i < model.name.length; i++) hue = (hue * 31 + model.name.charCodeAt(i)) % 360;
  const format = (model.file_format ?? "model").toUpperCase();
  const title =
    model.name +
    (model.hasGameOptimized ? " · game-optimized" : "") +
    (typeof model.download_count === "number" && model.download_count > 0
      ? ` · ${model.download_count} downloads`
      : "");
  return (
    <button
      type="button"
      title={title}
      onClick={() => onSelect(model)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 4,
        padding: 4,
        borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.05)",
        color: "#dfe7d8",
        cursor: "pointer",
      }}
    >
      {thumbUrl ? (
        <img
          src={thumbUrl}
          alt={model.name}
          loading="lazy"
          onError={() => setThumbFailed(true)}
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            objectFit: "cover",
            borderRadius: 6,
            background: "rgba(0,0,0,0.35)",
          }}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 700,
            color: "#0c1016",
            background: `hsl(${hue} 45% 62%)`,
          }}
        >
          {model.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span
        style={{
          fontSize: 10,
          lineHeight: 1.2,
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {model.name}
      </span>
      <span
        style={{
          fontSize: 9,
          lineHeight: 1,
          textAlign: "center",
          opacity: 0.5,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {format}
        {typeof model.download_count === "number" && model.download_count > 0
          ? ` · ${model.download_count}↓`
          : ""}
      </span>
    </button>
  );
}

function App(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<TellusWorldApi | null>(null);
  const [snapshot, setSnapshot] = useState<TellusSnapshot>({
    generated: [],
    logs: [],
    generationProvider: runtimeConfig.generationProvider,
    playerGenerationProvider: runtimeConfig.playerGenerationProvider,
    agentGenerationProvider: runtimeConfig.agentGenerationProvider,
    instantMeshTarget: runtimeConfig.instantMeshTarget,
    userId: tellusUserId(),
    remoteVisitors: [],
  });
  const [prompt, setPrompt] = useState("");
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
  // ── P2P video panel state (RX inbound default ON, TX local camera default OFF) ──
  const [p2pPanelOpen, setP2pPanelOpen] = useState(false);
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
  const toggleCameraMode = () => {
    const next = cameraMode === "first" ? "third" : "first";
    setCameraModeState(next);
    worldRef.current?.setCameraMode(next);
  };
  // ── Avatar picker state (catalog selection; "" = deterministic default robot) ──
  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false);
  const [avatarSelection, setAvatarSelection] = useState<string>(() => storedAvatarId());
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
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
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

  const p2pSelectStyle: React.CSSProperties = {
    background: "rgba(0,0,0,0.4)",
    color: "#dfe7d8",
    border: "1px solid rgba(255,255,255,0.16)",
    borderRadius: 6,
    padding: "4px 6px",
    fontSize: 12,
  };
  const p2pBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "5px 0",
    borderRadius: 6,
    border: active
      ? "1px solid #6fae46"
      : "1px solid rgba(255,255,255,0.18)",
    background: active ? "rgba(111,174,70,0.25)" : "rgba(255,255,255,0.06)",
    color: "#dfe7d8",
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

  // Re-attach the self-preview when the panel mounts the <video> (panel open + TX already on).
  useEffect(() => {
    if (p2pPanelOpen && txEnabled) attachSelfPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2pPanelOpen, txEnabled]);

  // Sample mesh stats while the P2P panel OR the debug overlay is open (≈1Hz).
  useEffect(() => {
    if (!p2pPanelOpen && !showFps) return;
    const id = window.setInterval(() => {
      setP2pStats(worldRef.current?.getP2pStats() ?? null);
      setAmbientStats(worldRef.current?.getAmbientStats() ?? null);
    }, 1000);
    return () => window.clearInterval(id);
  }, [p2pPanelOpen, showFps]);

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

  // Edit history of the agent's self-section (its own `remember` writes + your persona saves).
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
        who: m.role === "tool" ? "tool" : "agent",
        text: m.text,
      });
    }
    if (additions.length) setAgentChat((prev) => [...prev, ...additions]);
  }, []);

  const onAgentSend = useCallback(async () => {
    const text = agentChatInput.trim();
    if (!text) return;
    if (!agentStatus?.optedIn) {
      setAgentError("Start your agent before talking to it.");
      return;
    }
    setAgentChat((prev) => [...prev, { id: ++agentChatSeqRef.current, who: "you", text }]);
    setAgentChatInput("");
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
      }
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Send failed.");
    }
  }, [agentChatInput, agentStatus?.optedIn]);

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
  const [newWorldTemplate, setNewWorldTemplate] = useState<WorldTemplateId>(
    parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
  );
  const [newWorldSkyboxUrl, setNewWorldSkyboxUrl] = useState(
    runtimeConfig.skyboxUrl ||
      defaultSkyboxUrlForTemplate(parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus")),
  );
  const [newWorldPrivate, setNewWorldPrivate] = useState(false);
  // Chunked worlds tile a flat plane into NxN chunk grains (server parses N from the id
  // "chunked-<n>-<name>"). Expose it as a first-class kind+size picker so the operator never
  // has to hand-type the naming convention.
  const [newWorldChunked, setNewWorldChunked] = useState(false);
  const [newWorldChunkSize, setNewWorldChunkSize] = useState(8);
  const [currentWorldTemplate, setCurrentWorldTemplate] = useState<WorldTemplateId>(
    parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
  );
  const [currentWorldSkyboxUrl, setCurrentWorldSkyboxUrl] = useState(
    runtimeConfig.skyboxUrl ||
      defaultSkyboxUrlForTemplate(parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus")),
  );
  const [currentWorldPrivate, setCurrentWorldPrivate] = useState(false);
  const [worldCreateNote, setWorldCreateNote] = useState<string | null>(null);
  const worldCreateNoteTimerRef = useRef<number | undefined>(undefined);
  const KNOWN_WORLDS_KEY = "tellus.knownWorlds";
  const ACTIVE_WORLD_KEY = "tellus.activeWorldId";
  const NEW_WORLD_TEMPLATE_KEY = "tellus.newWorldTemplate";
  const NEW_WORLD_SKYBOX_KEY = "tellus.newWorldSkyboxUrl";
  const NEW_WORLD_PRIVATE_KEY = "tellus.newWorldPrivate";
  const NEW_WORLD_CHUNKED_KEY = "tellus.newWorldChunked";
  const NEW_WORLD_CHUNK_SIZE_KEY = "tellus.newWorldChunkSize";
  const defaultWorldTemplateRef = useRef<WorldTemplateId>(
    parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
  );
  const defaultSkyboxUrlRef = useRef(runtimeConfig.skyboxUrl);
  const defaultLandShapeRef = useRef<LandShapeOverrides | undefined>(runtimeConfig.landShape);

  interface WorldRenderProfile {
    worldTemplate?: WorldTemplateId;
    skyboxUrl?: string;
    landShape?: LandShapeOverrides;
    isPublic?: boolean;
  }

  const parseWorldRenderProfile = (value: unknown): WorldRenderProfile => {
    if (!isRecord(value)) return {};
    const worldTemplate =
      typeof value.worldTemplate === "string" && value.worldTemplate.trim()
        ? parseWorldTemplateId(value.worldTemplate)
        : typeof value.world_template === "string" && value.world_template.trim()
          ? parseWorldTemplateId(value.world_template)
          : undefined;
    const skyboxUrl =
      typeof value.skyboxUrl === "string" && value.skyboxUrl.trim()
        ? value.skyboxUrl.trim()
        : typeof value.skybox_url === "string" && value.skybox_url.trim()
          ? value.skybox_url.trim()
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
    return { worldTemplate, skyboxUrl, landShape, isPublic };
  };

  const resolveWorldRenderProfile = async (worldId: string): Promise<{
    template: WorldTemplateId;
    skyboxUrl: string;
    landShape?: LandShapeOverrides;
    isPublic?: boolean;
  }> => {
    const templateFallback = templateForWorldId(
      worldId,
      defaultWorldTemplateRef.current,
    );
    let profile: WorldRenderProfile = {};
    if (runtimeConfig.worldApiBase) {
      try {
        const response = await fetch(
          `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(worldId)}?userId=${encodeURIComponent(tellusUserId())}`,
          { cache: "no-store" },
        );
        if (response.ok) {
          profile = parseWorldRenderProfile(await response.json());
        }
      } catch {
        /* no world metadata endpoint (or offline) */
      }
    }
    const template = profile.worldTemplate ?? templateFallback;
    const skyboxUrl =
      profile.skyboxUrl ??
      defaultSkyboxUrlForTemplate(template) ??
      defaultSkyboxUrlRef.current;
    const landShape = profile.landShape ?? defaultLandShapeRef.current;
    return { template, skyboxUrl, landShape, isPublic: profile.isPublic };
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
    try {
      const next = [...new Set([...loadKnownWorlds(), id])];
      window.localStorage.setItem(KNOWN_WORLDS_KEY, JSON.stringify(next));
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
          .map((w) => (typeof w === "string" ? w : (w as { worldId?: string })?.worldId))
          .filter((x): x is string => typeof x === "string" && x.length > 0);
      }
    } catch {
      /* offline / no index — fall back to local */
    }
    const cur = current ?? activeWorldId ?? runtimeConfig.worldId;
    setWorlds([...new Set([...server, ...loadKnownWorlds(), ...(cur ? [cur] : [])])].sort());
  };
  const switchWorld = (id: string) => {
    if (!id || id === activeWorldId) return;
    rememberWorld(id);
    try {
      window.localStorage.setItem(ACTIVE_WORLD_KEY, id);
    } catch {
      /* ignore */
    }
    setActiveWorldId(id);
    void refreshWorldList(id);
  };
  const createNewWorld = () => {
    const raw = window.prompt(
      newWorldChunked
        ? "New chunked world name (letters, numbers, dashes):"
        : "New world id (letters, numbers, dashes):",
      "",
    );
    if (!raw) return;
    const sanitized = raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    if (!sanitized) return;
    let id = sanitized;
    if (newWorldChunked) {
      const size = Math.min(64, Math.max(1, Math.round(newWorldChunkSize) || 1));
      // Server parses N from "chunked-<n>-<name>"; keep the name suffix non-empty.
      const namePart = sanitized.startsWith("chunked-")
        ? sanitized.replace(/^chunked-(?:\d+-)?/, "")
        : sanitized;
      id = `chunked-${size}-${namePart || "world"}`;
    }
    if (!id) return;
    const pickedTemplate = parseWorldTemplateId(
      newWorldTemplate,
      defaultWorldTemplateRef.current,
    );
    const pickedSkybox =
      newWorldSkyboxUrl || defaultSkyboxUrlForTemplate(pickedTemplate);
    const makePrivate = newWorldPrivate;
    const enter = () => switchWorld(id);
    if (runtimeConfig.worldApiBase) {
      // Seed metadata up front so template + skybox are world-specific before first entry.
      void fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(id)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isPublic: !makePrivate,
            worldTemplate: pickedTemplate,
            skyboxUrl: pickedSkybox,
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
    if (worldCreateNoteTimerRef.current !== undefined) {
      window.clearTimeout(worldCreateNoteTimerRef.current);
    }
    setWorldCreateNote(
      `Copied current world settings: ${worldTemplateLabel(currentWorldTemplate)} · ${
        currentWorldPrivate ? "Private" : "Public"
      }`,
    );
    setWorldCreateNote(
      `Copied current world settings: ${worldTemplateLabel(currentWorldTemplate)} - ${skyboxLabel(currentWorldSkyboxUrl)} - ${
        currentWorldPrivate ? "Private" : "Public"
      }`,
    );
    worldCreateNoteTimerRef.current = window.setTimeout(() => {
      setWorldCreateNote(null);
      worldCreateNoteTimerRef.current = undefined;
    }, 2800);
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
  const assetBrowseSeq = useRef(0);

  const runAssetBrowse = useCallback(
    async (query: string, page: number, append: boolean, sort: AssetBrowseSort) => {
      const seq = ++assetBrowseSeq.current;
      setAssetBrowseLoading(true);
      try {
        const result = await browseAssetLibrary(query, page, sort);
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

  const [assetPanelOpen, setAssetPanelOpen] = useState(false);
  // Selected-object Move mode (mirrors world-side state; resets when the selection changes).
  const [moveModeActive, setMoveModeActive] = useState(false);
  useEffect(() => {
    setMoveModeActive(false);
    worldRef.current?.setMoveMode(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.selectedThingId]);
  const [assetPanelTab, setAssetPanelTab] = useState<AssetPanelTab>("search");
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

  // Debounced live search whenever the Assets panel's Search tab is showing.
  useEffect(() => {
    if (!assetPanelOpen || assetPanelTab !== "search") return;
    const id = window.setTimeout(
      () => void runAssetBrowse(assetSearch, 1, false, assetBrowseSort),
      assetSearch ? 350 : 0,
    );
    return () => window.clearTimeout(id);
  }, [assetPanelOpen, assetPanelTab, assetSearch, assetBrowseSort, runAssetBrowse]);
  const [openToolMenus, setOpenToolMenus] = useState<ToolMenu[]>([]);
  const [createPromptOpen, setCreatePromptOpen] = useState(false);
  const [createPromptFocused, setCreatePromptFocused] = useState(false);
  const [worldMapOpen, setWorldMapOpen] = useState(true);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const { listening, supported, start } = useSpeechInput((text) =>
    setPrompt(text),
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
          const modelUrl = item.modelUrl
            ? absoluteTellusApiUrl(item.modelUrl)
            : undefined;
          return {
            ...item,
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
        const modelUrl =
          typeof item.modelUrl === "string"
            ? absoluteTellusApiUrl(item.modelUrl)
            : undefined;
        return {
          id: item.id,
          kind,
          prompt: item.prompt,
          creatorId:
            typeof item.creatorId === "string" ? item.creatorId : "visitor",
          ownerUserId:
            typeof item.ownerUserId === "string" ? item.ownerUserId : undefined,
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
          const savedPrivate = window.localStorage.getItem(NEW_WORLD_PRIVATE_KEY);
          const savedChunked = window.localStorage.getItem(NEW_WORLD_CHUNKED_KEY);
          const savedChunkSize = window.localStorage.getItem(NEW_WORLD_CHUNK_SIZE_KEY);
          setNewWorldTemplate(
            parseWorldTemplateId(savedTemplate, defaultWorldTemplateRef.current),
          );
          setNewWorldSkyboxUrl(
            savedSkyboxUrl ||
              defaultSkyboxUrlRef.current ||
              defaultSkyboxUrlForTemplate(defaultWorldTemplateRef.current),
          );
          setNewWorldPrivate(savedPrivate === "1");
          setNewWorldChunked(savedChunked === "1");
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
          setNewWorldPrivate(false);
          setNewWorldChunked(false);
          setNewWorldChunkSize(8);
        }
        const configDefault = runtimeConfig.worldId; // typically "main" — always keep it reachable
        rememberWorld(configDefault);
        let initial = configDefault;
        try {
          const saved = window.localStorage.getItem(ACTIVE_WORLD_KEY);
          if (saved && saved.trim()) initial = saved.trim();
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
        if (!cancelled) setActiveWorldId(runtimeConfig.worldId);
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
      window.localStorage.setItem(NEW_WORLD_PRIVATE_KEY, newWorldPrivate ? "1" : "0");
      window.localStorage.setItem(NEW_WORLD_CHUNKED_KEY, newWorldChunked ? "1" : "0");
      window.localStorage.setItem(NEW_WORLD_CHUNK_SIZE_KEY, String(newWorldChunkSize));
    } catch {
      /* ignore */
    }
  }, [newWorldTemplate, newWorldSkyboxUrl, newWorldPrivate, newWorldChunked, newWorldChunkSize]);

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
        setCurrentWorldTemplate(profile.template);
        setCurrentWorldSkyboxUrl(profile.skyboxUrl);
        setCurrentWorldPrivate(profile.isPublic === false);
        runtimeConfig.worldTemplate = profile.template;
        runtimeConfig.skyboxUrl = profile.skyboxUrl;
        runtimeConfig.landShape = profile.landShape;
        applyWorldTerrainTemplate(profile.template, profile.landShape);
        // World scale BEFORE any terrain/state work: derived from the world NAME (large-* → 3×,
        // mega-* → 5×) so every client — and the Hyades terrain port — agrees with no protocol change.
        setWorldScale(worldScaleForId(activeWorldId));
        rebuildDistantIslandSpecs();
        await loadTellusState().catch(() => undefined);
        // Chunked worlds: learn bounds (renderer edge-clamp) + arm centre-spawn/flat-grounding BEFORE
        // the world view mounts. Clears both for classic worlds, so switching back is clean.
        await loadChunkedWorldBounds().catch(() => undefined);
      })
      .then(() => {
        if (cancelled) return;
        world = createTellusWorld(container, setSnapshot);
        worldRef.current = world;
      });
    return () => {
      cancelled = true;
      world?.destroy();
      worldRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorldId]);

  const selectedThing = useMemo(
    () =>
      snapshot.generated.find((thing) => thing.id === snapshot.selectedThingId) ??
      snapshot.generated[snapshot.generated.length - 1],
    [snapshot.generated, snapshot.selectedThingId],
  );
  const activeSelectedThing = snapshot.selectedThingId ? selectedThing : null;
  // Embedded clip names of the selected thing's LOADED model ([] until the GLB mounts — the world
  // publishes a snapshot when the model lands, so this re-renders with the clip list).
  const selectedClipNames = activeSelectedThing
    ? worldRef.current?.getGeneratedClipNames(activeSelectedThing.id) ?? []
    : [];
  const selectedThingVehicleMode = selectedThing ? vehicleMode(selectedThing) : null;
  const selectedThingIsMount = selectedThing ? isMountThing(selectedThing) : false;
  const mapRadius = OCEAN_RADIUS * 0.42;
  // The minimap maps world (x,z) → a [0,1] fraction. Classic worlds are origin-centred (0,0 → mid-map);
  // chunked worlds put origin at a CORNER and span [0, N*96), so they map linearly from 0. The inverse
  // (mapFracToWorld) powers click-to-warp and MUST mirror the forward map so a click lands where it shows.
  const chunkedMapDims = isChunkedWorldId(activeWorldId ?? "") ? getChunkedWorldChunks() : null;
  const mapExtentX = chunkedMapDims ? chunkedMapDims.w * CHUNK_SPAN : mapRadius * 2;
  const mapExtentZ = chunkedMapDims ? chunkedMapDims.h * CHUNK_SPAN : mapRadius * 2;
  const mapFracX = (x: number) => (chunkedMapDims ? x / mapExtentX : x / (mapRadius * 2) + 0.5);
  const mapFracZ = (z: number) => (chunkedMapDims ? z / mapExtentZ : z / (mapRadius * 2) + 0.5);
  const mapFracToWorld = (fx: number, fz: number): { x: number; z: number } =>
    chunkedMapDims
      ? { x: fx * mapExtentX, z: fz * mapExtentZ }
      : { x: (fx - 0.5) * mapRadius * 2, z: (fz - 0.5) * mapRadius * 2 };
  const mapPointStyle = (position: Vec3): React.CSSProperties => ({
    left: `${clamp(mapFracX(position.x) * 100, 0, 100)}%`,
    top: `${clamp(mapFracZ(position.z) * 100, 0, 100)}%`,
  });
  const handleWorldMapClick = (event: React.MouseEvent<HTMLElement>) => {
    // Ignore clicks on the overlaid info panel / status badge — only the map plane warps.
    const target = event.target as HTMLElement;
    if (target.closest(".world-info-panel") || target.closest(".world-map-status")) return;
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
  const inventory = snapshot.generated.filter(
    (thing) => thing.ownerUserId === snapshot.userId,
  );

  const submitPrompt = () => {
    worldRef.current?.submitVisitorPrompt(prompt);
    setPrompt("");
    setCreatePromptOpen(false);
  };

  const focusCreatePrompt = () => {
    setCreatePromptOpen((open) => {
      if (open) return false;
      window.requestAnimationFrame(() => promptRef.current?.focus());
      return true;
    });
  };

  const isToolOpen = (menu: ToolMenu): boolean => openToolMenus.includes(menu);

  const toggleAssetDrawer = () => {
    setAssetPanelOpen((open) => !open);
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
      setAssetPanelOpen(true);
      setAssetPanelTab("world-assets");
      return;
    }
    if (!snapshot.selectedThingId) {
      worldRef.current?.selectGenerated(
        snapshot.generated[snapshot.generated.length - 1].id,
      );
    }
  };

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
        "world-log-hidden",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <section className="world-panel" aria-label="Tellus world">
        <div ref={containerRef} className="world-canvas" />
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
            {showFps && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "rgba(0,0,0,0.6)",
                  color: "#7ec850",
                  font: "600 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  zIndex: 20,
                }}
              >
                <div>{fps} FPS</div>
                {ambientStats && (
                  <div style={{ marginTop: 3, color: "#b8e08a" }}>
                    veg T{ambientStats.vegetation.tier} · {ambientStats.vegetation.chunks}ch ·{" "}
                    {Math.round(ambientStats.vegetation.grassIndices / 3)}tri ·{" "}
                    {ambientStats.vegetation.trees}🌲 · {ambientStats.physicsBodies}⚙
                  </div>
                )}
                <div style={{ marginTop: 3, color: "#9ad0ff" }}>
                  P2P {p2pStats?.tx ? "TX●" : "tx○"} {p2pStats?.rx ?? rxEnabled ? "RX●" : "rx○"} ·{" "}
                  {p2pStats?.rxStreams ?? 0}/16 streams
                </div>
                {(p2pStats?.peers ?? []).map((peer) => (
                  <div key={peer.id} style={{ color: "#c8c8c8" }}>
                    {peer.id.slice(0, 6)} {peer.state}
                    {peer.haveRemoteVideo ? " 📺" : ""} {Math.round(peer.kbps)}kbps
                  </div>
                ))}
              </div>
            )}
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
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 10, opacity: 0.72, color: "#dfe7d8" }}>World</span>
              <select
                aria-label="Active world"
                title="Switch world"
                value={activeWorldId ?? ""}
                onChange={(e) => switchWorld(e.target.value)}
                style={{
                  background: "rgba(0,0,0,0.5)",
                  color: "#dfe7d8",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "4px 8px",
                  font: "600 12px/1.2 ui-sans-serif, system-ui",
                  maxWidth: 180,
                }}
              >
                {!activeWorldId && <option value="">…</option>}
                {worlds.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 10, opacity: 0.72, color: "#dfe7d8" }}>Kind</span>
              <select
                aria-label="New world kind"
                title="Classic island worlds, or a large flat tiled (chunked) plane"
                value={newWorldChunked ? "chunked" : "classic"}
                onChange={(e) => setNewWorldChunked(e.target.value === "chunked")}
                style={{
                  background: "rgba(0,0,0,0.5)",
                  color: "#dfe7d8",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "4px 8px",
                  font: "600 12px/1.2 ui-sans-serif, system-ui",
                  maxWidth: 120,
                }}
              >
                <option value="classic">Classic</option>
                <option value="chunked">Chunked</option>
              </select>
            </div>
            {newWorldChunked && (
              <div style={{ display: "grid", gap: 2 }}>
                <span style={{ fontSize: 10, opacity: 0.72, color: "#dfe7d8" }}>Size (NxN)</span>
                <input
                  type="number"
                  min={1}
                  max={64}
                  step={1}
                  aria-label="New chunked world size"
                  title="Chunks per side (1-64); the world is this many chunks square"
                  value={newWorldChunkSize}
                  onChange={(e) => {
                    const parsed = Math.round(Number(e.target.value));
                    if (Number.isFinite(parsed)) {
                      setNewWorldChunkSize(Math.min(64, Math.max(1, parsed)));
                    }
                  }}
                  style={{
                    background: "rgba(0,0,0,0.5)",
                    color: "#dfe7d8",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 8,
                    padding: "4px 8px",
                    font: "600 12px/1.2 ui-sans-serif, system-ui",
                    width: 70,
                  }}
                />
              </div>
            )}
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 10, opacity: 0.72, color: "#dfe7d8" }}>Terrain</span>
              <select
                aria-label="New world template"
                title="Terrain template for newly created worlds"
                value={newWorldTemplate}
                onChange={(e) =>
                  setNewWorldTemplate(
                    parseWorldTemplateId(e.target.value, defaultWorldTemplateRef.current),
                  )
                }
                style={{
                  background: "rgba(0,0,0,0.5)",
                  color: "#dfe7d8",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "4px 8px",
                  font: "600 12px/1.2 ui-sans-serif, system-ui",
                  maxWidth: 150,
                }}
              >
                {WORLD_TEMPLATE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 10, opacity: 0.72, color: "#dfe7d8" }}>Sky</span>
              <select
                aria-label="New world skybox"
                title="Skybox for newly created worlds"
                value={newWorldSkyboxUrl}
                onChange={(e) => setNewWorldSkyboxUrl(e.target.value)}
                style={{
                  background: "rgba(0,0,0,0.5)",
                  color: "#dfe7d8",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "4px 8px",
                  font: "600 12px/1.2 ui-sans-serif, system-ui",
                  maxWidth: 150,
                }}
              >
                {SKYBOX_OPTIONS.map((option) => (
                  <option key={option.url} value={option.url}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gap: 2 }}>
              <span style={{ fontSize: 10, opacity: 0.72, color: "#dfe7d8" }}>Visibility</span>
              <select
                aria-label="New world visibility"
                title="Visibility for newly created worlds"
                value={newWorldPrivate ? "private" : "public"}
                onChange={(e) => setNewWorldPrivate(e.target.value === "private")}
                style={{
                  background: "rgba(0,0,0,0.5)",
                  color: "#dfe7d8",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "4px 8px",
                  font: "600 12px/1.2 ui-sans-serif, system-ui",
                  maxWidth: 120,
                }}
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            <button
              type="button"
              title="Copy template + visibility from the current world"
              onClick={copyCurrentWorldSettings}
              style={{
                background: "rgba(0,0,0,0.5)",
                color: "#dfe7d8",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 8,
                padding: "4px 8px",
                font: "600 12px/1.2 ui-sans-serif, system-ui",
                cursor: "pointer",
              }}
            >
              Duplicate
            </button>
            <button
              type="button"
              title={`Create a new ${newWorldPrivate ? "private" : "public"} ${
                newWorldChunked ? `chunked ${newWorldChunkSize}x${newWorldChunkSize} world` : `world (${newWorldTemplate})`
              }`}
              onClick={createNewWorld}
              style={{
                background: "rgba(0,0,0,0.5)",
                color: "#7ec850",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 8,
                padding: "4px 9px",
                font: "700 12px/1.2 ui-sans-serif, system-ui",
                cursor: "pointer",
              }}
            >
              ＋ New
            </button>
            {worldCreateNote && (
              <span
                style={{
                  marginLeft: 2,
                  fontSize: 10,
                  color: "#9ad0ff",
                  opacity: 0.86,
                  whiteSpace: "nowrap",
                }}
              >
                {worldCreateNote}
              </span>
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
        </div>
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
            className={assetPanelOpen ? "toolbelt-button active" : "toolbelt-button"}
            title="Assets"
            onClick={toggleAssetDrawer}
          >
            <Box size={18} />
            <span>Assets</span>
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
          <button
            type="button"
            className={cameraMode === "first" ? "toolbelt-button active" : "toolbelt-button"}
            title={
              cameraMode === "first"
                ? "Switch to 3rd person view (V)"
                : "Switch to 1st person view (V)"
            }
            onClick={toggleCameraMode}
          >
            <Eye size={18} />
            <span>View</span>
          </button>
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
          {p2pSupported && (
            <button
              type="button"
              className={p2pPanelOpen ? "toolbelt-button active" : "toolbelt-button"}
              title="P2P Video"
              onClick={() => {
                setP2pPanelOpen((open) => !open);
                void refreshP2pDevices();
              }}
            >
              <Video size={18} />
              <span>P2P</span>
            </button>
          )}
          <button
            type="button"
            className={agentPanelOpen ? "toolbelt-button active" : "toolbelt-button"}
            title="Your Agent"
            onClick={() => setAgentPanelOpen((open) => !open)}
          >
            <Bot size={18} />
            <span>Agent</span>
          </button>
          <button
            type="button"
            className={avatarPanelOpen ? "toolbelt-button active" : "toolbelt-button"}
            title="Avatar"
            onClick={() => setAvatarPanelOpen((open) => !open)}
          >
            <PersonStanding size={18} />
            <span>Avatar</span>
          </button>
        </aside>
        {/* Panel layout policy: every bottom panel gets its OWN anchor so any combination can be
            open at once — avatar picker = LEFT edge column, P2P = just left-of-center, agent =
            just right-of-center; each is height-capped with internal scroll. The login dialog is
            a true modal (fullscreen dimmed overlay, z-index 70) ABOVE all of them by design. The
            open avatar picker temporarily covers the agent-PiP corner (close it to see the PiP). */}
        {avatarPanelOpen && (
          <aside
            className="avatar-panel"
            aria-label="Avatar picker"
            style={{
              position: "absolute",
              bottom: 92,
              left: 12,
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
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
              }}
            >
              {AVATAR_CATALOG.map((entry) => (
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
        {p2pPanelOpen && p2pSupported && (
          <aside
            className="p2p-panel"
            aria-label="P2P video"
            style={{
              position: "absolute",
              bottom: 92,
              left: "50%",
              transform: "translateX(-104%)", // sit just LEFT of center (won't overlap the agent panel)
              width: 280,
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
              <strong style={{ fontSize: 13 }}>P2P Video</strong>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {p2pStats?.rxStreams ?? 0}/16 · 480p
              </span>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11 }}>
              Microphone
              <select
                value={selectedMic}
                onChange={(e) => onMicChange(e.target.value)}
                style={p2pSelectStyle}
              >
                <option value="">Default</option>
                {audioInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11 }}>
              Camera
              <select
                value={selectedCam}
                onChange={(e) => onCamChange(e.target.value)}
                style={p2pSelectStyle}
              >
                <option value="">Default</option>
                {videoInputs.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Cam ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            </label>
            <video
              ref={selfVideoRef}
              muted
              playsInline
              autoPlay
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                borderRadius: 8,
                background: "#000",
                objectFit: "cover",
                display: txEnabled ? "block" : "none",
                transform: "scaleX(-1)", // mirror, like a webcam preview
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void refreshP2pDevices()}
                style={p2pBtnStyle(false)}
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={toggleRx}
                style={p2pBtnStyle(rxEnabled)}
              >
                RX {rxEnabled ? "On" : "Off"}
              </button>
              <button
                type="button"
                onClick={() => void toggleTx()}
                style={p2pBtnStyle(txEnabled)}
              >
                TX {txEnabled ? "On" : "Off"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={toggleAudioListen}
                style={p2pBtnStyle(audioListen)}
                title="Hear other players' audio"
              >
                🔊 Listen {audioListen ? "On" : "Off"}
              </button>
              <button
                type="button"
                onClick={toggleMic}
                disabled={!txEnabled}
                style={{ ...p2pBtnStyle(txEnabled && micOn), opacity: txEnabled ? 1 : 0.45 }}
                title={txEnabled ? "Mute/unmute your mic" : "Turn TX on to use your mic"}
              >
                🎤 {txEnabled ? (micOn ? "On" : "Muted") : "Off"}
              </button>
            </div>
            {p2pError && (
              <div style={{ fontSize: 11, color: "#ff9a9a" }}>{p2pError}</div>
            )}
            <div style={{ fontSize: 10, opacity: 0.6 }}>
              RX shows others' cameras; TX shares your camera + mic (480p). Listen = hear others.
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
        {agentPanelOpen && (
          <aside
            className="agent-panel"
            aria-label="Your agent"
            style={{
              position: "absolute",
              bottom: 92,
              left: "50%",
              transform: "translateX(4%)", // sit just RIGHT of center (won't overlap the P2P panel)
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
              <strong style={{ fontSize: 13 }}>
                Your Agent{" "}
                <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 500 }} title="Each world has its own agent — its memories live in that world. Use 'Set as default' in Personality to carry a persona into new worlds.">
                  in “{agentStatus?.worldId || activeWorldId || runtimeConfig.worldId}”
                </span>
              </strong>
              {(() => {
                const optedIn = agentStatus?.optedIn ?? false;
                const running =
                  optedIn &&
                  ((agentStatus?.ownerPresent ?? false) || (agentStatus?.offlinePersistence ?? false)) &&
                  (agentStatus?.enabled ?? false);
                const thinking = optedIn && (agentStatus?.processing ?? false);
                // optedIn but momentarily disabled while you're here: the server self-heals
                // (resume-on-heartbeat), so surface that it WILL wake rather than a flat "Sleeping".
                const willWake =
                  optedIn && !(agentStatus?.enabled ?? false) && (agentStatus?.ownerPresent ?? false);
                const label = !optedIn
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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, opacity: 0.9 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: dot,
                        boxShadow: `0 0 6px ${dot}`,
                      }}
                    />
                    {label}
                    {agentStatus?.offlinePersistence && (
                      <span
                        style={{
                          marginLeft: 4,
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
                );
              })()}
            </div>
            {/* Premium upsell: logged in & not premium — Premium = the agent survives you leaving. */}
            {!agentStatus?.offlinePersistence && <PremiumUpsellChip />}
            <button
              type="button"
              disabled={agentBusy}
              onClick={onAgentStartStop}
              style={{
                ...p2pBtnStyle(agentStatus?.optedIn ?? false),
                flex: "none",
                width: "100%",
                padding: "7px 0",
                opacity: agentBusy ? 0.6 : 1,
                cursor: agentBusy ? "default" : "pointer",
              }}
            >
              {agentBusy ? "…" : agentStatus?.optedIn ? "Stop" : "Start my agent"}
            </button>
            {/* Escape hatch for a wedged agent: fresh server-side thread, memories stay. Deliberately
                subdued (text-link styling) with a two-step inline confirm — not an everyday control. */}
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
            {/* Memories: the agent's persona/self-section — ONE field (the old persona textarea moved
                here). Live read-only view + Edit (textarea, same POST /agent/persona replace:true save
                semantics) + a dimmed edit-history list (its own `remember` writes show up too). */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button
                type="button"
                onClick={() => setMemoriesOpen((open) => !open)}
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
                      style={{
                        ...p2pBtnStyle(true),
                        opacity: agentBusy ? 0.6 : 1,
                        cursor: agentBusy ? "default" : "pointer",
                      }}
                    >
                      {agentBusy ? "…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemoriesEditing(false)}
                      style={p2pBtnStyle(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={agentBusy}
                      title="Save this text as your default persona — your agent in any NEW world starts with it (each world keeps its own copy afterwards)."
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
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        // Seed the draft from the LIVE value at edit time — one source of truth.
                        setAgentPersonaDraft(agentStatus?.selfSection ?? "");
                        setMemoriesEditing(true);
                      }}
                      style={p2pBtnStyle(false)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMemoriesHistoryOpen((open) => {
                          if (!open) void loadMemoriesLog();
                          return !open;
                        });
                      }}
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
                            style={{
                              fontSize: 10,
                              opacity: 0.55,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
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
            {agentError && (
              <div style={{ fontSize: 11, color: "#ff9a9a" }}>{agentError}</div>
            )}
            {/* Chat thread: the agent's dialog (assistant = dialog, tool = dimmed) plus the lines you send it. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, opacity: 0.7 }}>Chat</span>
              <div
                ref={agentTranscriptScrollRef}
                style={{
                  maxHeight: 140,
                  overflowY: "auto",
                  background: "rgba(0,0,0,0.32)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 6,
                  padding: "6px 8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                {agentChat.length === 0 && !agentStatus?.processing ? (
                  <span style={{ fontSize: 11, opacity: 0.5, fontStyle: "italic" }}>
                    {agentStatus?.optedIn
                      ? "Say hello to your agent below."
                      : "Start your agent, then say hello below."}
                  </span>
                ) : (
                  agentFeed.map((item) => {
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
                        <span
                          key={item.key}
                          style={{ fontSize: 10, opacity: 0.45, fontStyle: "italic", textAlign: "center" }}
                        >
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
                  })
                )}
                {agentStatus?.optedIn && agentStatus?.processing && (
                  <span style={{ fontSize: 11, color: "#9ec8ff", fontStyle: "italic", opacity: 0.85 }}>
                    💭 thinking…
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
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
                    fontSize: 12,
                    padding: "5px 8px",
                    borderRadius: 6,
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
                    padding: "5px 12px",
                    opacity:
                      agentStatus?.optedIn && agentChatInput.trim().length > 0 ? 1 : 0.5,
                    cursor:
                      agentStatus?.optedIn && agentChatInput.trim().length > 0
                        ? "pointer"
                        : "default",
                  }}
                >
                  Send
                </button>
              </div>
            </div>
            {/* POV viewport toggle: render a picture-in-picture of the scene from the agent's avatar. */}
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
            <div style={{ fontSize: 10, opacity: 0.6 }}>
              Your agent acts as you in this world. Premium keeps it active while you're away.
            </div>
          </aside>
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
              <div className="world-map-disc" />
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
                const e1x = px + r * Math.sin(yawV - half);
                const e1z = pz + r * Math.cos(yawV - half);
                const e2x = px + r * Math.sin(yawV + half);
                const e2z = pz + r * Math.cos(yawV + half);
                return (
                  <svg className="world-map-cone" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    <path d={`M ${px.toFixed(2)} ${pz.toFixed(2)} L ${e1x.toFixed(2)} ${e1z.toFixed(2)} L ${e2x.toFixed(2)} ${e2z.toFixed(2)} Z`} />
                  </svg>
                );
              })()}
              {snapshot.visitorPosition && (
                <span
                  className="map-marker player"
                  style={mapPointStyle(snapshot.visitorPosition)}
                  title="You"
                />
              )}
              {snapshot.remoteVisitors.map((visitor) =>
                visitor.position ? (
                  <span
                    key={visitor.visitorId}
                    className="map-marker remote-player"
                    style={mapPointStyle(visitor.position)}
                    title="Remote player"
                  />
                ) : null,
              )}
              {snapshot.generated.map((thing) => (
                <span
                  key={thing.id}
                  className={[
                    "map-marker",
                    "asset",
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
                />
              ))}
              {pendingGenerated.length > 0 && (
                <span className="world-map-status">
                  {pendingGenerated.length} building
                </span>
              )}
              <section className="world-info-panel mini" aria-label="World info">
                <dl>
                  <div><dt>Generated</dt><dd>{snapshot.generated.length}</dd></div>
                  <div><dt>Players</dt><dd>{snapshot.remoteVisitors.length + 1}</dd></div>
                </dl>
              </section>
            </section>
            {snapshot.visitorPosition && (() => {
              // Position readout: where you are, so you can tell others. Chunked worlds also show the
              // chunk cell (origin at a corner, CHUNK_SPAN units/chunk); classic worlds just world coords.
              const pos = snapshot.visitorPosition;
              const wx = Math.round(pos.x);
              const wz = Math.round(pos.z);
              const chunked = isChunkedWorldId(activeWorldId ?? "");
              const cell = chunked
                ? `chunk ${Math.floor(pos.x / CHUNK_SPAN)},${Math.floor(pos.z / CHUNK_SPAN)} · `
                : "";
              return (
                <div className="world-pos-readout" title="Your location — copy to share">
                  {cell}({wx}, {wz})
                </div>
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
        {activeSelectedThing && (
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
            <div className="selected-nudge-pad" aria-label="Position controls">
              <button
                type="button"
                className="icon-button nudge-up"
                title="Move forward"
                aria-label="Move asset forward"
                onClick={() =>
                  worldRef.current?.moveGenerated(activeSelectedThing.id, 0, -2)
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
                  worldRef.current?.moveGenerated(activeSelectedThing.id, -2, 0)
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
                  worldRef.current?.moveGenerated(activeSelectedThing.id, 2, 0)
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
                  worldRef.current?.moveGenerated(activeSelectedThing.id, 0, 2)
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
                  worldRef.current?.liftGenerated(activeSelectedThing.id, 1)
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
                  worldRef.current?.liftGenerated(activeSelectedThing.id, -1)
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
                title="Hide assets"
                aria-label="Hide assets"
                onClick={() => setAssetPanelOpen(false)}
              >
                <ArrowLeft size={17} />
              </button>
            </div>
            <nav className="tool-panel-tabs asset-tabs" aria-label="Asset tabs">
              <button
                type="button"
                className={assetPanelTab === "search" ? "active" : ""}
                onClick={() => setAssetPanelTab("search")}
              >
                <Search size={15} />
                <span>Search</span>
              </button>
              <button
                type="button"
                className={assetPanelTab === "world-assets" ? "active" : ""}
                onClick={() => setAssetPanelTab("world-assets")}
              >
                <Layers size={15} />
                <span>World</span>
              </button>
              <button
                type="button"
                className={assetPanelTab === "inventory" ? "active" : ""}
                onClick={() => setAssetPanelTab("inventory")}
              >
                <Backpack size={15} />
                <span>Mine</span>
              </button>
              <button
                type="button"
                className={assetPanelTab === "procedural" ? "active" : ""}
                onClick={() => setAssetPanelTab("procedural")}
              >
                <Mountain size={15} />
                <span>Nature</span>
              </button>
            </nav>
            {assetPanelTab === "procedural" && (
              <div className="inventory-list asset-list">
                <span className="inventory-empty" style={{ paddingBottom: 4 }}>
                  Procedural nature — built instantly, no generation cost. Every placement gets a
                  fresh random look.
                </span>
                {PROCEDURAL_CATALOG.map((arch) => (
                  <button
                    key={arch.id}
                    type="button"
                    className="inventory-item"
                    onClick={() => {
                      const seed = (Math.random() * 0xffffffff) >>> 0;
                      worldRef.current?.addLibraryAsset({
                        id: `proc-${arch.id}-${seed.toString(16)}`,
                        name: arch.label,
                        description: arch.label,
                        modelUrl: makeProceduralModelUrl(arch.id, seed),
                        source: "generated",
                      });
                    }}
                  >
                    <span style={{ fontSize: 16, width: 16, textAlign: "center" }}>{arch.emoji}</span>
                    <span>
                      <strong>{arch.label}</strong>
                      <small>procedural · tap again for a new variation</small>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="inventory-item"
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
                  <span style={{ fontSize: 16, width: 16, textAlign: "center" }}>🪞</span>
                  <span>
                    <strong>Mirror</strong>
                    <small>
                      reflective standing mirror · up to {MAX_LIVE_MIRRORS} reflect live (extras
                      render as tinted glass)
                    </small>
                  </span>
                </button>
              </div>
            )}
            {assetPanelTab === "search" && (
              <div className="inventory-list asset-list">
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0 6px" }}>
                  <Search size={14} style={{ opacity: 0.6, flex: "none" }} />
                  <input
                    type="text"
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder="Search the asset store…"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 12,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(0,0,0,0.3)",
                      color: "#eef2ea",
                    }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, paddingBottom: 6 }}>
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
                      style={{
                        fontSize: 10,
                        padding: "3px 9px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: assetBrowseSort === key ? "rgba(111,174,70,0.3)" : "rgba(255,255,255,0.05)",
                        color: "#e7eee2",
                        cursor: "pointer",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  {assetBrowseTotal > 0 && (
                    <span style={{ fontSize: 10, opacity: 0.55, marginLeft: "auto" }}>
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
                    {assetSearch ? `Nothing matched “${assetSearch}”.` : "No library assets loaded yet."}
                  </span>
                )}
                {assetBrowseLoading && (
                  <span className="inventory-empty">Searching…</span>
                )}
                {assetBrowseHasNext && !assetBrowseLoading && (
                  <button
                    type="button"
                    className="inventory-item"
                    style={{ justifyContent: "center", fontWeight: 600 }}
                    onClick={() => void runAssetBrowse(assetSearch, assetBrowsePage + 1, true, assetBrowseSort)}
                  >
                    Load more
                  </button>
                )}
              </div>
            )}
            {assetPanelTab === "world-assets" && (
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
            {assetPanelTab === "inventory" && (
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
              title="Hide terrain"
              aria-label="Hide terrain"
              onClick={() => closeToolPanel("terrain")}
            >
              <ArrowLeft size={17} />
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
