import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Box,
  Brush,
  Building2,
  CircleHelp,
  Globe2,
  ImagePlus,
  Map as MapIcon,
  MessageCircle,
  Mic,
  MicOff,
  Minus,
  Mountain,
  PawPrint,
  Pencil,
  PersonStanding,
  Plane,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
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
import {
  ASSET_BACKED_PROCPLANT_MODEL_ID_SET,
  PROCPLANT_PLACEABLE_CATALOG,
  procPlantPlaceableById,
} from "./tellus-procplant-biomes";
import {
  createProcPlantVegetation,
  type ProcPlantVegetationStats,
} from "./tellus-procplant-vegetation";
import { isWorldEntryVisuallyReady } from "./tellus-world-entry-readiness";
import { ShadowUpdatePolicy } from "./tellus-shadow-update-policy";
import { fitDirectionalShadowCamera } from "./tellus-shadow-camera";
import { staticTerrainAutoVegetationEnabled } from "./tellus-static-terrain";
import { PROCEDURAL_CATALOG } from "./tellus-veg-archetypes";
import { makeProcPlantModelUrl, makeProceduralModelUrl, makeProceduralBuildingModelUrl, sanitizeProceduralModelUrl, parseProceduralModelUrl, MIRROR_ARCHETYPE_ID, resetLiveMirrors } from "./tellus-procedural-assets";
import {
  BUILDING_LIGHTING_OPTIONS,
  BUILDING_MATERIAL_OPTIONS,
  PROCEDURAL_BUILDING_CATALOG,
  makeProceduralBuildingArchetypeId,
  proceduralBuildingDimensions,
  type BuildingLightingStyle,
  type BuildingMaterialStyle,
  type ProceduralBuildingType,
} from "./tellus-proc-buildings";
import { createAmbientPhysics, resolveObstacles, resolveRectObstacles, resolveSweptRectObstacles, type ObstacleCircle, type ObstacleRect } from "./tellus-physics";
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
  vrmaMetadataForNameSync,
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
  procPlantDeletedFromWorldPatch,
  procPlantPlacementsFromWorldPatch,
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
  type WorldProcPlantPlacement,
  type PortalEntered,
  wildlifePatchFromWorldPatch,
  wildlifeConfiguredFromWorldPatch,
  wildlifeSnapshotFromWorldPatch,
  type WildlifeAnimalConfig,
} from "./world-protocol";
import { WildlifeInterpolationBuffer, type WildlifePresentationPose } from "./tellus-wildlife-interpolation";
import { planWildlifeLod, type WildlifeLodAssignment, type WildlifeRenderTier } from "./tellus-wildlife-lod";
import { WildlifeProxyRenderer } from "./tellus-wildlife-proxies";
import { removeWildlifePresentationState } from "./tellus-wildlife-presentation";
import {
  DEER_WILDLIFE_PROFILE,
  wildlifeClipNameForIntent,
  wildlifeSpeciesProfile,
} from "./tellus-wildlife-species";
import { createChunkRenderer, type ChunkRenderer } from "./tellus-chunk-renderer";
import type { AgentId, TerrainKind, TerrainPaintKind, TerrainEditMode, GenerationProvider, DirectGenerationProvider, RoleGenerationProvider, InstantMeshTarget, GeneratedKind, ToolName, AssetPanelTab, ToolMenu, Vec3, GeneratedThing, ProceduralAssetPlacement, AssetLibraryModel, AssetLibraryResponse, DistantIslandSpec, TellusLog, GenerateRequest, InteractRequest, TellusSnapshot, TellusWorldApi, TellusRuntimeConfig, AssetForgePipelineStart, AssetForgePipelineStatus, DirectGenerationResponse, GeneratedAssetManifestEntry, SpeechRecognitionConstructor, SpeechRecognitionLike, VehicleMode, MaterialWithTextureMaps, WorldTemplateId, LandShapeOverrides, DayNightMode, LightingMood, WaterSettings, WaterStyle } from "./tellus-types";
import { WORLD_RADIUS, WORLD_SCALE, setWorldScale, worldScaleForId, scaledPlayerSpeed, OCEAN_RADIUS, SEA_LEVEL, DISTANT_ISLAND_COUNT, TERRAIN_SEGMENTS, DISTANT_TERRAIN_SEGMENTS, DISTANT_TERRAIN_VERTEX_COUNT, DISTANT_WALK_LOCAL_RADIUS, PLAYER_SPEED, PENDING_GENERATION_FALLBACK_MS, POND_CENTER, POND_RADIUS, TERRAIN_VERTEX_COUNT, TERRAIN_SCULPT_RADIUS, TERRAIN_SCULPT_STEP, SKYBOX_FALLBACK_URLS, SKYBOX_VERTICAL_OFFSET, MOON_MODEL_URL, MOON_DISTANCE, MOON_SIZE, MOON_ARC_AZIMUTH, MOON_ARC_LATERAL_SWAY, PIXEL3D_PROVIDER, generationProviderLabels, instantMeshTargetLabels, terrainColors, terrainPaintKinds, waterMountTerms, airMountTerms, groundMountTerms, isChunkedWorldId, canonicalWorldId, chunkedWorldCenter, getChunkedWorldChunks, chunkedWorldSupportsPaint, CHUNK_SPAN } from "./tellus-constants";
import { readJsonResponse, clamp, rand, isRecord, makeId, browserUuid, distance2D, promptIncludesAny, finiteNumber, sanitizeLogText, extractErrorMessage } from "./tellus-utils";
import { parseWaterSettings, runtimeConfig, applyRuntimeConfig, loadRuntimeConfigFile, loadRuntimeConfig, worldApiUrl } from "./tellus-runtime-config";
import { applyActiveBiomeMixRegistryForWorld } from "./tellus-biome-mix";
import { tellusWorldHttpUrl, tellusAssetLibraryUrl, tellusWorldWebSocketUrl, tellusVisitorId, tellusUserId, tellusAgentUrl, absoluteAssetForgeUrl, tellusApiUrl, absoluteTellusApiUrl, assetStoreGameOptimizedModelUrl, assetStoreIdFromModelUrl, assetStoreLodModelUrl, assetStoreOptimizedAssetUrls, toAssetId } from "./tellus-urls-identity";
import { terrainSculptOffsets, setTerrainStateDirty, setInitialWorldGeneratedThings, setInitialWorldPresence, terrainPaint, terrainStateDirty, terrainStateLoaded, terrainStateRevision, tellusWorldBackendAvailable, initialWorldGeneratedThings, initialWorldPresence, terrainPaintCode, terrainPaintKindFromCode, isTerrainPaintMode, terrainVertexColor, terrainGridIndex, distantTerrainGridIndex, terrainSculptOffsetAt, centralTerrainGridCoords, centralTerrainPaintAt, distantIslandLocalPoint, distantIslandWorldPoint, createDistantIslandSpec, distantIslandSpecs, rebuildDistantIslandSpecs, distantIslandLocalRadius, distantIslandSculptOffsetAt, distantIslandGridWorldPoint, distantTerrainGridCoords, distantTerrainPaintAt, nearestDistantIsland, distantIslandHeight, groundedPosition, groundHeightAt, normalizedDiscPosition, oceanPosition, waterBlockedByLand, waterVehiclePosition, distantIslandShorePosition, vehicleMode, isMountThing, isVehicleThing, isFreeMovingVehicle, airPosition, DEFAULT_AIR_GROUND_RELATIVE_OFFSET, movedVehiclePosition, baseTerrainHeight, terrainHeight, terrainKind, pondWaterLevel, terrainOffsetsPayload, terrainPaintPayload, distantTerrainOffsetsPayload, distantTerrainPaintPayload, tellusState, tellusStatePayload, terrainStorageKey, isResetTerrainState, saveTerrainStateLocally, loadTerrainStateLocally, applyTellusTerrainState, applyWorldTerrainTemplate, terrainFromWorldPatch, presenceFromWorldPatch, generatedFromWorldPatch, loadTellusWorldState, saveTellusWorldState, loadTellusState, loadChunkedWorldBounds, saveTellusStateSoon, saveTellusStateNow, isStalePendingGeneratedThing, setChunkedHeightProvider, setChunkedFlatGround, onTerrainTemplateLoaded, activeEvoflowWorldBiomeCellAt } from "./tellus-terrain";
import {
  groundRelativeOffset,
  groundRelativeOffsetFromSurface,
  hasAuthoredGroundRelativeOffset,
  positionAtGroundRelativeOffset,
} from "./tellus-grounding";
import { gltfObjectCache, createGltfLoader, generatedAssetManifestEntries, generatedAssetManifestModelUrls, generatedAssetManifestAssetIds, loadAssetLibraryModels, browseAssetLibrary, type AssetBrowseSort, configureKtx2Support, textureFailedModelUrls, startPixel3DGeneration, waitForPixel3DModelUrl, hasExternalGenerationProvider, isMissingApiRouteError, generationProviderForThing, startDirectInstantMeshGeneration, waitForDirectGeneration, cancelDirectGeneration } from "./tellus-generation-client";
import { createTerrainGeometry, createFloatingRim, createFallbackOceanMaterial, createOceanSurface, createDistantIslandTerrainGeometry, createDistantIsland, createDistantArchipelago, createSkyDome, createEnvironmentTexture, createBackdropWaterMaterial, createFlowerSpriteTexture, createFlowerSpriteMaterials, disposeMaterial, disposeObject, fitModelToHeight, fittedModelDimensions, generatedModelHasRuntimeAnimations, measureModelBounds, placeObjectAboveGround, loadGltfObject, generatedGltfCache, loadGeneratedGltfObject, prepareSkyboxModel, collectSkyboxTintMaterials, prepareMoonModel, loadSkyboxModel, assetTargetHeight, loadGeneratedModel, createPondWater, positionPondRipplePatch, triggerPondRipple, updatePondRipples, createGeneratedMesh, createGenerationSwirl, shouldShowGenerationSwirl, applyThingRotation, inferGeneratedKind, promptAccent, kindColor } from "./tellus-scene-builders";
import { createTerrainMaterial, terrainKindCode, terrainTextureDiagnostics } from "./tellus-terrain-material";
import { largeWorldBaseHeight, largeWorldBiomeCellAt, largeWorldTerrainKind, usesContinentalChunkedTerrain } from "./tellus-large-world-terrain";
import {
  buildingMaterialForEcology,
  resolveEcologySample,
  worldBiomeCellBounds,
  worldBiomeCellCoordinates,
} from "./tellus-ecology";
import type { RapierSolid, TellusRapierPhysics } from "./tellus-rapier-physics";
import { generateInteriorRoom, normalizeInteriorBiomeMaterial, type InteriorBiomeMaterial } from "./tellus-building";
import { installSessionFetch, getSession, issueTellusLiveTicket, SESSION_HEADER } from "./tellus-auth";
import { AuthControls, PremiumUpsellChip, openTellusAccountPanel, useTellusAuth } from "./tellus-auth-ui";
import { buildAgentFeed, type AgentChatLine, type AgentToolChip } from "./agent-chat-format";
import { buildAgentMapLocation, resolveBlockableAgentMoveTarget } from "./tellus-agent-location";
import {
  MakerAgentApiError,
  createMakerAgent,
  deleteMakerAgent,
  fetchMakerAgents,
  renameMakerAgent,
  runMakerAgentAction,
  setMakerAgentRuntimePolicy,
  type AgentRuntimePolicy,
  type MakerAgentDirectory,
  type MakerAgentSummary,
} from "./tellus-maker-agents";
import {
  createWorldTriggerVolumeGroup,
  disposeWorldTriggerVolumeGroup,
} from "./tellus-world-trigger-volumes";
import { WorldTriggersPanel } from "./world-triggers-panel";
import { AgentCapabilitiesPanel } from "./agent-capabilities-panel";
import { AgentCollaborationPanel } from "./agent-collaboration-panel";
import { AgentAssetWorkshopPanel } from "./agent-asset-workshop-panel";
import { defaultSkyboxUrlForTemplate, parseLandShapeOverrides, parseOptionalWorldTemplateId, parseWorldTemplateId, shouldIgnoreDefaultTellusTemplate, templateForWorldId, templateSuppressesAutoVegetation } from "./tellus-world-templates";
import { evoflowTerrainSourceFor, evoflowWaterModeFor } from "./tellus-evoflow-terrains";
import {
  ASSET_SURFACE_CONTEXTS,
  inferAssetSurfaceContexts,
  rankReusableAssets,
  type AssetReuseCandidate,
  type AssetSurfaceContext,
} from "./tellus-asset-reuse";
import { actorKindForVisitorId, friendlyVisitorName } from "./tellus-visitor-names";
import {
  fetchPresenceForUsers,
  presenceRegistryDiagnostics,
  setPresencePollIntervalMs,
  type RegistryPresence,
} from "./tellus-presence-client";
import {
  EMPTY_FRIENDS_SNAPSHOT,
  acceptFriendRequest,
  declineFriendRequest,
  fetchFriends,
  friendsDiagnostics,
  removeFriend,
  sendFriendRequest,
  setFriendsRefreshIntervalMs,
  type FriendsSnapshot,
  type SocialPrincipalKind,
  type SocialPrincipalTarget,
} from "./tellus-friends-client";
import {
  DirectMessagesApiError,
  directMessageDiagnostics,
  fetchDirectMessageInbox,
  fetchDirectMessageThread,
  sendDirectMessage,
  type DirectMessage,
  type DirectMessageThreadSummary,
} from "./tellus-social-client";
import {
  buildWorldThingRuntimeProfile,
  defaultScaleForRealisticKind,
  inferAssetVehicleMode,
  normalizeWorldThingAssetIdentity,
  seatPositionForWorldThing,
  type WorldThingRuntimeProfile,
} from "./tellus-world-object-profile";
import { assetRenderLodLevel } from "./tellus-asset-lod-policy";
import {
  DAY_NIGHT_MODE_OPTIONS,
  LIGHTING_MOOD_OPTIONS,
  LIGHTING_MOOD_PROFILES,
  SKYBOX_OPTIONS,
  ADVANCED_WORLD_TEMPLATE_OPTIONS,
  ALL_WORLD_CREATION_TEMPLATES,
  WORLD_CREATION_TEMPLATES,
  WORLD_TEMPLATE_OPTIONS,
  defaultChunkSizeForWorldTemplate,
  fallbackWorldDisplayName,
  isProtectedWorldId,
  liveDayNightPhase,
  normalizeDayNightCycleMs,
  normalizeSkyboxUrl,
  parseDayNightMode,
  parseLightingMood,
  skyboxLabel,
  worldPickerLabel,
  worldTemplateLabel,
} from "./tellus-world-options";
import { validatedLegacyWorldCleanupIds } from "./tellus-world-cleanup";
import { AssetTile, AvatarTile } from "./tellus-picker-tiles";
import { FirstRunCoach } from "./onboarding/FirstRunCoach";
import { useDialogs, CommandPalette, Dock } from "./design-system";
import type { CommandItem, DockItem } from "./design-system";
import {
  animationMetadataHasBlockingIssue,
  inferAnimationIntentFromText,
  normalizeAnimationIntent,
  selectAnimationClipByIntent,
  type AssetAnimationMetadata,
  type AnimationActorKind,
  type AnimationIntent,
} from "./tellus-animation-intents";
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
  /** Maker-controlled presentation name. The immutable visitorId remains the chat/address identity. */
  displayName?: string;
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
  userId?: string;
  principalKind?: SocialPrincipalKind;
  principalId?: string;
  name: string;
  kind: "player" | "agent";
  worldId?: string;
  position?: Vec3;
  online: boolean;
  currentWorld: boolean;
  canMessage: boolean;
  lastSeenAt?: string;
  isFriend?: boolean;
  friendSinceMs?: number;
  presenceKnown?: boolean;
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

function readDebugModeFlags(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const storage = window.localStorage;
    const flags: string[] = [];
    if (storage.getItem("tellus.terrainOnly") === "1") flags.push("terrain only");
    const procplants = storage.getItem("tellus.procplants");
    if (procplants === "0") flags.push("plants off");
    if (procplants === "1") flags.push("plants forced");
    const plantDensity = Number(storage.getItem("tellus.procplants.density"));
    if (Number.isFinite(plantDensity) && plantDensity > 0 && Math.abs(plantDensity - 1) > 0.01) {
      flags.push(`plant density ${plantDensity.toFixed(2).replace(/\.?0+$/, "")}`);
    }
    if (storage.getItem("tellus.lowGpu") === "1") flags.push("low GPU");
    const renderEvery = Number(storage.getItem("tellus.renderEvery"));
    if (Number.isFinite(renderEvery) && renderEvery > 1) flags.push(`render every ${Math.round(renderEvery)}`);
    if (storage.getItem("tellus.frameDriver") === "timeout") flags.push("timeout frames");
    const renderer = storage.getItem("tellus.renderer");
    if (renderer === "webgpu" || renderer === "webgl") flags.push(renderer);
    const pixelRatioCap = Number(storage.getItem("tellus.pixelRatioCap"));
    if (Number.isFinite(pixelRatioCap) && pixelRatioCap > 0) {
      flags.push(`pixel cap ${pixelRatioCap.toFixed(2).replace(/\.?0+$/, "")}`);
    }
    return flags;
  } catch {
    return [];
  }
}

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
  let animationTimerId = 0;
  let lastTime = performance.now();
  const worldCreatedAt = lastTime;
  // Debug FPS counter (sampled every 500ms); surfaced via getFps() for the hidden FPS overlay.
  let fpsValue = 0;
  let fpsFrames = 0;
  let fpsSampleStart = lastTime;
  let tick = 0;
  type BrowserLongTask = {
    name: string;
    startTime: number;
    duration: number;
    attribution?: unknown;
  };
  const recentLongTasks: BrowserLongTask[] = [];
  let heartbeatLastAt = performance.now();
  const perfDiagnostics = {
    frames: 0,
    maxFrameMs: 0,
    slowFrame: null as null | {
      frame: number;
      totalMs: number;
      measuredMs: number;
      unmeasuredMs: number;
      fps: number;
      position: Vec3;
      phases: {
        movementMs: number;
        chunkTerrainMs: number;
        vegetationMs: number;
        procplantsMs: number;
        physicsMs: number;
        renderMs: number;
        cameraMs: number;
        miscMs: number;
      };
      chunkTerrain: unknown;
      chunkStreaming: {
        activeChanges: number;
        deferredGrounding: boolean;
        queuedGrounding: number;
        lastGroundingMs: number;
        maxGroundingMs: number;
      };
      procplants: unknown;
      renderer: unknown;
      browser: {
        visibilityState: string;
        hidden: boolean;
        heartbeat: {
          lastGapMs: number;
          maxGapMs: number;
          count: number;
        };
        recentLongTasks: BrowserLongTask[];
        recentResources: Array<{
          name: string;
          initiatorType: string;
          duration: number;
          transferSize?: number;
        }>;
      };
    },
    longTasks: {
      count: 0,
      last: null as BrowserLongTask | null,
      worst: null as BrowserLongTask | null,
    },
    heartbeat: {
      lastGapMs: 0,
      maxGapMs: 0,
      count: 0,
    },
    maxPlayerStep: 0,
    maxVerticalStep: 0,
    maxCameraStep: 0,
    chunkStreaming: {
      activeChanges: 0,
      deferredGrounding: false,
      queuedGrounding: 0,
      lastGroundingMs: 0,
      maxGroundingMs: 0,
    },
    phases: {
      movementMs: 0,
      chunkTerrainMs: 0,
      vegetationMs: 0,
      procplantsMs: 0,
      physicsMs: 0,
      renderMs: 0,
      cameraMs: 0,
      miscMs: 0,
      maxMovementMs: 0,
      maxChunkTerrainMs: 0,
      maxVegetationMs: 0,
      maxProcplantsMs: 0,
      maxPhysicsMs: 0,
      maxRenderMs: 0,
      maxCameraMs: 0,
      maxMiscMs: 0,
    },
    lastPlayer: null as Vec3 | null,
    lastCamera: null as Vec3 | null,
  };
  let longTaskObserver: PerformanceObserver | null = null;
  try {
    if (typeof PerformanceObserver !== "undefined") {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const task: BrowserLongTask = {
            name: entry.name,
            startTime: Math.round(entry.startTime * 10) / 10,
            duration: Math.round(entry.duration * 10) / 10,
            attribution: "attribution" in entry ? (entry as PerformanceEntry & { attribution?: unknown }).attribution : undefined,
          };
          recentLongTasks.push(task);
          if (recentLongTasks.length > 16) recentLongTasks.shift();
          perfDiagnostics.longTasks.count++;
          perfDiagnostics.longTasks.last = task;
          if (!perfDiagnostics.longTasks.worst || task.duration > perfDiagnostics.longTasks.worst.duration) {
            perfDiagnostics.longTasks.worst = task;
          }
        }
      });
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    }
  } catch {
    longTaskObserver = null;
  }
  const heartbeatTimer = window.setInterval(() => {
    const now = performance.now();
    const gap = now - heartbeatLastAt;
    heartbeatLastAt = now;
    perfDiagnostics.heartbeat.count++;
    perfDiagnostics.heartbeat.lastGapMs = Math.round(gap * 10) / 10;
    perfDiagnostics.heartbeat.maxGapMs = Math.max(
      perfDiagnostics.heartbeat.maxGapMs,
      perfDiagnostics.heartbeat.lastGapMs,
    );
  }, 250);
  let renderer: THREE.WebGLRenderer | WebGPURenderer | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let renderIssueLogged = false;
  let rendererContextLostCount = 0;
  let rendererContextRestoredCount = 0;
  let rendererContextLastEvent = "";
  type WebGlGpuTimerExtension = {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  };
  type WebGlGpuTimer = {
    gl: WebGL2RenderingContext;
    extension: WebGlGpuTimerExtension;
    active: WebGLQuery | null;
    pending: WebGLQuery[];
    lastMs: number;
    maxMs: number;
    totalMs: number;
    samples: number;
    failed: boolean;
  };
  let webGlGpuTimer: WebGlGpuTimer | null = null;

  const initializeWebGlGpuTimer = () => {
    if (!(renderer instanceof THREE.WebGLRenderer)) return;
    const context = renderer.getContext();
    if (!(context instanceof WebGL2RenderingContext)) return;
    const extension = context.getExtension("EXT_disjoint_timer_query_webgl2") as
      | WebGlGpuTimerExtension
      | null;
    if (!extension) return;
    webGlGpuTimer = {
      gl: context,
      extension,
      active: null,
      pending: [],
      lastMs: 0,
      maxMs: 0,
      totalMs: 0,
      samples: 0,
      failed: false,
    };
  };

  const pollWebGlGpuTimer = () => {
    const timer = webGlGpuTimer;
    if (!timer || timer.failed) return;
    try {
      if (timer.gl.getParameter(timer.extension.GPU_DISJOINT_EXT)) {
        for (const query of timer.pending) timer.gl.deleteQuery(query);
        timer.pending.length = 0;
        return;
      }
      while (timer.pending.length > 0) {
        const query = timer.pending[0]!;
        if (!timer.gl.getQueryParameter(query, timer.gl.QUERY_RESULT_AVAILABLE)) break;
        timer.pending.shift();
        const elapsedNanoseconds = Number(
          timer.gl.getQueryParameter(query, timer.gl.QUERY_RESULT),
        );
        timer.gl.deleteQuery(query);
        if (!Number.isFinite(elapsedNanoseconds)) continue;
        const elapsedMs = elapsedNanoseconds / 1_000_000;
        timer.lastMs = elapsedMs;
        timer.maxMs = Math.max(timer.maxMs, elapsedMs);
        timer.totalMs += elapsedMs;
        timer.samples++;
      }
    } catch {
      timer.failed = true;
    }
  };

  const beginWebGlGpuTimer = (frame: number): boolean => {
    const timer = webGlGpuTimer;
    if (!timer || timer.failed) return false;
    pollWebGlGpuTimer();
    // Timer queries are diagnostic and can themselves add driver overhead. Sample roughly once per
    // second at the target frame rate instead of wrapping every draw.
    if (frame % 60 !== 0 || timer.active || timer.pending.length >= 3) return false;
    try {
      const query = timer.gl.createQuery();
      if (!query) return false;
      timer.gl.beginQuery(timer.extension.TIME_ELAPSED_EXT, query);
      timer.active = query;
      return true;
    } catch {
      timer.failed = true;
      return false;
    }
  };

  const endWebGlGpuTimer = () => {
    const timer = webGlGpuTimer;
    if (!timer?.active || timer.failed) return;
    try {
      timer.gl.endQuery(timer.extension.TIME_ELAPSED_EXT);
      timer.pending.push(timer.active);
      timer.active = null;
    } catch {
      timer.failed = true;
      timer.active = null;
    }
  };

  const disposeWebGlGpuTimer = () => {
    const timer = webGlGpuTimer;
    if (!timer) return;
    if (timer.active) timer.gl.deleteQuery(timer.active);
    for (const query of timer.pending) timer.gl.deleteQuery(query);
    timer.pending.length = 0;
    timer.active = null;
    webGlGpuTimer = null;
  };

  const generated: GeneratedThing[] = [];
  const logs: TellusLog[] = [];
  const worldChat: WorldChatMessage[] = [];
  // TELLUS INFINITY portals: the current world's portals + a one-shot world.portal.entered signal the React
  // layer consumes to switch worlds (with spawn). Both ride the snapshot bridge.
  let worldPortals: WorldPortal[] = [];
  const portalAnchorOffsets = new Map<string, Vec3>();
  let pendingPortalSwitch: PortalEntered | null = null;
  // TELLUS INFINITY biomes: the world's biome cells keyed "cx:cz" (diff-merged from world.biome.patch).
  const worldBiomeCells = new Map<string, WorldBiomeCell>();
  let worldBiomeGridAuthoritative = false;
  const seenWorldChatIds = new Set<string>();
  const generatedMeshes = new Map<string, THREE.Object3D>();
  type GeneratedAnimationState = {
    mixer: THREE.AnimationMixer;
    action?: THREE.AnimationAction;
    clipName?: string;
    mode: GeneratedMotionMode;
  };
  type GeneratedMotionMode = AnimationIntent;
  type GeneratedClipOptions = {
    ignoreExplicit?: boolean;
    movementHints?: string[];
    preferSit?: boolean;
    preferredClipName?: string;
  };
  const generatedAnimationMixers = new Map<string, GeneratedAnimationState>();
  // Placed VRM things (auton/Atlantean store models) animate through a real VRM rig — a VRMA idle clip
  // looped by default, advanced (mixer + spring bones) each frame here. Parallel to the plain-GLB
  // mixers above; a thing is in exactly one of the two maps.
  const generatedVrmRigs = new Map<string, VrmObjectRig>();
  const wildlifeConfigs = new Map<string, WildlifeAnimalConfig>();
  const wildlifeInterpolation = new WildlifeInterpolationBuffer();
  const wildlifePoses = new Map<string, WildlifePresentationPose>();
  const wildlifeTiers = new Map<string, WildlifeRenderTier>();
  const wildlifeLastIntents = new Map<string, string>();
  let wildlifeProxyRenderer: WildlifeProxyRenderer;
  let wildlifeAssignments: WildlifeLodAssignment[] = [];
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
  const refreshInstancePoolBounds = (pool: InstancePool) => {
    let drawCount = 0;
    for (const slot of pool.slotToThing.keys()) drawCount = Math.max(drawCount, slot + 1);
    for (const instanced of pool.instanced) {
      // Only submit the occupied slot range. Recycled holes inside it remain zero-scale matrices.
      instanced.count = drawCount;
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
    }
  };
  const generatedAssetPerfStats = () => {
    let instancedThings = 0;
    let instancedDraws = 0;
    for (const pool of instancePools.values()) {
      instancedThings += pool.thingToSlot.size;
      instancedDraws += pool.instanced.length;
    }
    let visibleMeshes = 0;
    let childMeshes = 0;
    let visibleChildMeshes = 0;
    let frustumCulledChildMeshes = 0;
    let alwaysRenderedChildMeshes = 0;
    let visibleBuildingLodProxies = 0;
    const materialKeys = new Set<string>();
    for (const mesh of generatedMeshes.values()) {
      if (mesh.visible) visibleMeshes += 1;
      const visit = (child: THREE.Object3D, parentVisible: boolean) => {
        const effectivelyVisible = parentVisible && child.visible;
        if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh) return;
        childMeshes++;
        if (effectivelyVisible) {
          visibleChildMeshes++;
          if (child.frustumCulled) frustumCulledChildMeshes++;
          else alwaysRenderedChildMeshes++;
        }
        if (effectivelyVisible && child.userData.generatedBuildingLodProxy) visibleBuildingLodProxies++;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) materialKeys.add(material.uuid);
      };
      const walk = (node: THREE.Object3D, parentVisible: boolean) => {
        visit(node, parentVisible);
        const nextVisible = parentVisible && node.visible;
        for (const child of node.children) walk(child, nextVisible);
      };
      walk(mesh, true);
    }
    return {
      things: generated.length,
      mountedMeshes: generatedMeshes.size,
      wildlife: {
        configured: wildlifeConfigs.size,
        interpolated: wildlifePoses.size,
        full: wildlifeAssignments.filter((entry) => entry.tier === "full").length,
        instanced: wildlifeAssignments.filter((entry) => entry.tier === "instanced").length,
        impostor: wildlifeAssignments.filter((entry) => entry.tier === "impostor").length,
        culled: wildlifeAssignments.filter((entry) => entry.tier === "culled").length,
      },
      visibleMeshes,
      queue: {
        pending: worldModelLoadQueue.length,
        queuedUnique: queuedWorldModelLoads.size,
        active: activeWorldModelLoads,
        maxActive: generatedModelLoadConcurrency(),
        pumpDelayMs: WORLD_MODEL_LOAD_PUMP_DELAY_MS,
        pausedForMotion:
          hasMovementKeyHeld() ||
          performance.now() - lastWorldModelLoadMotionAt < WORLD_MODEL_LOAD_MOTION_GRACE_MS,
      },
      loads: {
        enqueued: generatedModelLoadStats.enqueued,
        started: generatedModelLoadStats.started,
        loaded: generatedModelLoadStats.loaded,
        failed: generatedModelLoadStats.failed,
        retried: generatedModelLoadStats.retried,
        lastMs: Math.round(generatedModelLoadStats.lastMs),
        averageMs:
          generatedModelLoadStats.loaded > 0
            ? Math.round(generatedModelLoadStats.totalMs / generatedModelLoadStats.loaded)
            : 0,
        maxMs: Math.round(generatedModelLoadStats.maxMs),
        lastQueueWaitMs: Math.round(generatedModelLoadStats.lastQueueWaitMs),
        averageQueueWaitMs:
          generatedModelLoadStats.started > 0
            ? Math.round(generatedModelLoadStats.totalQueueWaitMs / generatedModelLoadStats.started)
            : 0,
        lastUrl: generatedModelLoadStats.lastUrl,
        lastRenderUrl: generatedModelLoadStats.lastRenderUrl,
        lodRequests: generatedModelLoadStats.lodRequests,
        lodFallbacks: generatedModelLoadStats.lodFallbacks,
      },
      caches: {
        generatedGltf: generatedGltfCache.size,
        gltfObject: gltfObjectCache.size,
      },
      meshes: {
        childMeshes,
        visibleChildMeshes,
        frustumCulledChildMeshes,
        alwaysRenderedChildMeshes,
        visibleBuildingLodProxies,
        uniqueMaterials: materialKeys.size,
      },
      instancing: {
        enabled: instancingEnabled(),
        pools: instancePools.size,
        instancedThings,
        instancedDraws,
        frustumCulledDraws: [...instancePools.values()].reduce(
          (total, pool) => total + pool.instanced.filter((mesh) => mesh.frustumCulled).length,
          0,
        ),
        disabledUrls: instancingDisabledUrls.size,
      },
    };
  };
  // Model URLs whose instancing hit an error once — never re-attempt for the session (they stay regular).
  const instancingDisabledUrls = new Set<string>();
  const skyboxTintMaterials = new Set<THREE.MeshBasicMaterial>();
  const pendingGenerationControllers = new Map<string, AbortController>();
  const pendingManifestReconciliations = new Set<string>();
  const transientModelLoadFailures = new Map<string, number>();
  const transientModelRetryTimers = new Map<string, number>();
  const keys = new Set<string>();
  const isMovementKey = (key: string): boolean =>
    key === "w" ||
    key === "arrowup" ||
    key === "s" ||
    key === "arrowdown" ||
    key === "a" ||
    key === "arrowright" ||
    key === "d" ||
    key === "arrowleft" ||
    key === " " ||
    key === "c" ||
    key === "shift";
  const hasMovementKeyHeld = (): boolean => {
    for (const key of keys) {
      if (isMovementKey(key)) return true;
    }
    return false;
  };
  let selectedThingId: string | undefined;
  let sailingThingId: string | undefined;
  // Throttles the ridden mount's live-terrain-raycast ground-snap check (see PET_GROUND_RAYCAST_INTERVAL_MS
  // for why footprintGroundY is expensive per-call). Reset (via mountGroundCheckThingId mismatch) whenever
  // the ridden thing changes, so a freshly-mounted thing isn't stuck waiting out a stale throttle window.
  let mountGroundCheckNextAt = 0;
  let mountGroundCheckThingId: string | undefined;
  let externalSkybox: THREE.Object3D | null = null;
  let activeSkyboxUrl = "";
  let skyboxLoadSeq = 0;
  let moonModel: THREE.Object3D | null = null;
  const moonMaterials = new Set<THREE.MeshStandardMaterial>();
  let directGenerationAvailable = true;
  let worldSocket: WebSocket | null = null;
  let worldSocketConnecting = false;
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

  // P2P diagnostics are opt-in; high-frequency presence/signalling logs can otherwise swamp DevTools.
  const p2pLog = (...args: unknown[]): void => {
    try {
      if (window.localStorage.getItem("tellus.p2pDebug") !== "1") return;
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

  let lastP2pRosterSignature = "";
  const feedP2pPresence = (peerIds: string[]): void => {
    const stablePeerIds = [...new Set(peerIds)].sort();
    const signature = stablePeerIds.join("\n");
    if (signature === lastP2pRosterSignature) return;
    lastP2pRosterSignature = signature;
    if (p2pMesh) {
      p2pLog("roster", stablePeerIds);
      p2pMesh.setPresence(stablePeerIds);
    } else {
      p2pLog("roster (mesh pending)", stablePeerIds);
      pendingPeerRoster = stablePeerIds;
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
  let worldTriggerVolumeGroup: THREE.Group | null = null;
  const setWorldTriggerVolumes = (definitions: Parameters<TellusWorldApi["setWorldTriggerVolumes"]>[0]) => {
    if (worldTriggerVolumeGroup) {
      scene.remove(worldTriggerVolumeGroup);
      disposeWorldTriggerVolumeGroup(worldTriggerVolumeGroup);
      worldTriggerVolumeGroup = null;
    }
    if (!definitions?.length || destroyed) return;
    worldTriggerVolumeGroup = createWorldTriggerVolumeGroup(definitions);
    scene.add(worldTriggerVolumeGroup);
  };
  wildlifeProxyRenderer = new WildlifeProxyRenderer(scene);
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
  const rendererPreference = (() => {
    try {
      return window.localStorage.getItem("tellus.renderer");
    } catch {
      return null;
    }
  })();
  const activeWorldTemplate = parseWorldTemplateId(
    runtimeConfig.worldTemplate,
    templateForWorldId(runtimeConfig.worldId, "tellus"),
  );
  const isChunked = isChunkedWorldId(runtimeConfig.worldId);
  const isContinentalChunkedWorld = isChunked && usesContinentalChunkedTerrain();
  const evoflowWaterMode = evoflowWaterModeFor(activeWorldTemplate);
  const usesChunkedLakeWater = isChunked && evoflowWaterMode === "lake";
  const supportsChunkedWater = isChunked && (!isContinentalChunkedWorld || usesChunkedLakeWater);
  const usesSimulatedPondWater = !isChunked || usesChunkedLakeWater;
  const showsWorldWaterSurface = !isChunked || !isContinentalChunkedWorld || usesChunkedLakeWater;
  const chunkedDims = isChunked ? getChunkedWorldChunks() : null;

  // ── Entry loading screen + spawn grounding ────────────────────────────────────────────────────
  // The first couple seconds after entering a world pay one-time costs: the spawn chunk builds, the
  // procedural-plant template variants generate, and WebGL compiles/uploads their shaders. Chunked
  // worlds also don't know the real ground height until the spawn chunk streams in, so the player
  // would briefly hang in the air and drop. Cover the view with a loading overlay until the ground is
  // known AND nearby chunks have had a moment to build, then snap the player down and fade it out.
  // worldEntryGrounded starts true for non-chunked worlds (they spawn on analytic terrain already).
  let worldEntryGrounded = !isChunked;
  let worldEntryGroundedAt = worldEntryGrounded ? performance.now() : 0;
  let worldReadyFired = false;
  const loadingOverlay = document.createElement("div");
  loadingOverlay.className = "tellus-entry-loading";
  loadingOverlay.setAttribute("role", "status");
  loadingOverlay.innerHTML =
    '<div class="tellus-entry-loading__spinner"></div>' +
    '<div class="tellus-entry-loading__label">Entering world…</div>';
  container.appendChild(loadingOverlay);
  let loadingOverlayRemoved = false;
  const removeLoadingOverlay = (reason: "visually-ready" | "safety-timeout") => {
    if (loadingOverlayRemoved) return;
    loadingOverlayRemoved = true;
    worldReadyFired = true;
    loadingOverlay.classList.add("tellus-entry-loading--hidden");
    // Remove after the CSS fade so it doesn't linger in the DOM.
    window.setTimeout(() => loadingOverlay.remove(), 700);
    window.dispatchEvent(new CustomEvent("tellus:world-ready", { detail: { reason } }));
  };
  // Safety net: never let the overlay stick, even if the ready signal is somehow missed.
  const loadingOverlaySafetyTimer = window.setTimeout(
    () => removeLoadingOverlay("safety-timeout"),
    9000,
  );
  const prefersOriginalTellusIslandRenderer =
    activeWorldTemplate === "tellus" && !isContinentalChunkedWorld;
  // WebGL is now the HARD DEFAULT. three.js's WebGPU backend is currently both slower for this app's
  // workload (many non-instanced meshes + custom terrain material) AND actively broken here (framebuffer
  // format + multisample/bindgroup errors on the agent-viewport / portal copies), so we only use WebGPU
  // when a developer EXPLICITLY opts in via localStorage `tellus.renderer = "webgpu"`. The classic Tellus
  // island's WebGPU-tuned water/fog now falls back to the WebGL look — strictly better than a broken
  // WebGPU render. Revisit the auto-selection once the WebGPU path is fixed and the backend matures.
  const useWebGPU = rendererPreference === "webgpu" && "gpu" in navigator;
  // Visual terrain density (decoupled from the synced 97² sculpt grid). FIXED vertex budget no
  // matter the world scale — bigger worlds stretch the same ~50K-vertex mesh instead of multiplying
  // it (operator: range over thickness; worlds get larger for less).
  const terrainRenderSegments = useWebGPU ? 224 : 144;
  const configureCalmLakeBase = (material: THREE.Material | THREE.Material[]) => {
    if (!usesChunkedLakeWater || Array.isArray(material) || !(material instanceof THREE.ShaderMaterial)) return;
    if (material.uniforms.uPondCalm) material.uniforms.uPondCalm.value = 1;
    material.userData.tellusCalmPondBase = true;
  };
  // Rich TSL water on the WebGPU path; WebGL keeps the lightweight fallback material.
  const ocean = createOceanSurface(useWebGPU, runtimeConfig.waterSettings, usesChunkedLakeWater
    ? {
        mode: "lake",
        width: (chunkedDims?.w ?? 1) * CHUNK_SPAN,
        depth: (chunkedDims?.h ?? 1) * CHUNK_SPAN,
      }
    : { mode: "ocean" });
  configureCalmLakeBase(ocean.material);
  const archipelago = createDistantArchipelago(useWebGPU);
  let chunkRenderer: ChunkRenderer | null = null;
  let lastActiveChunkCount = -1; // defer placed-asset grounding when the active chunk set changes
  let lastProvisionalChunkCount = -1;
  let chunkStreamGroundingPending = false;
  let lastChunkStreamGroundingAt = 0;
  const chunkStreamGroundingQueue: string[] = [];
  const queuedChunkStreamGrounding = new Set<string>();
  const chunkedCenterForWorld = isChunked ? chunkedWorldCenter() : null;
  if (chunkedCenterForWorld) {
    ocean.position.x = chunkedCenterForWorld.x;
    ocean.position.z = chunkedCenterForWorld.z;
    if (!isContinentalChunkedWorld && chunkedDims) {
      const mapRadius = Math.hypot(chunkedDims.w * CHUNK_SPAN, chunkedDims.h * CHUNK_SPAN) / 2 + CHUNK_SPAN;
      const oceanScale = Math.max(1, mapRadius / OCEAN_RADIUS);
      ocean.scale.set(oceanScale, oceanScale, oceanScale);
    }
    if (ocean.material instanceof THREE.ShaderMaterial && ocean.material.userData.tellusWaterShader) {
      const shoreCenter = ocean.material.uniforms.uShoreCenter?.value;
      if (shoreCenter && typeof shoreCenter.set === "function") {
        shoreCenter.set(chunkedCenterForWorld.x, chunkedCenterForWorld.z);
      }
    }
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
  const chunkedWorldBounds = chunkedDims
    ? {
        minX: 0,
        maxX: chunkedDims.w * CHUNK_SPAN,
        minZ: 0,
        maxZ: chunkedDims.h * CHUNK_SPAN,
      }
    : null;
  const clampChunkedPoint = (x: number, z: number): { x: number; z: number } => {
    if (!chunkedWorldBounds) return { x, z };
    return {
      x: clamp(x, chunkedWorldBounds.minX + 1, chunkedWorldBounds.maxX - 1),
      z: clamp(z, chunkedWorldBounds.minZ + 1, chunkedWorldBounds.maxZ - 1),
    };
  };
  const isChunkedWaterPoint = (x: number, z: number): boolean => {
    if (!supportsChunkedWater) return false;
    if (waterFeatureContains(x, z, 0.5)) return true;
    const height = chunkRenderer?.sampleHeight(x, z) ?? largeWorldBaseHeight(x, z);
    if (!Number.isFinite(height)) return false;
    return height <= SEA_LEVEL + 0.45 || largeWorldTerrainKind(x, z, height) === "water";
  };
  const chunkedWaterSurfaceY = (x: number, z: number): number =>
    waterFeatureContains(x, z, 0.5) ? waterFeatureLevel() + 0.12 : SEA_LEVEL + 0.14;
  const chunkedWaterVehiclePosition = (x: number, z: number, fallback?: Vec3): Vec3 => {
    const clamped = clampChunkedPoint(x, z);
    if (waterFeatureContains(clamped.x, clamped.z, 0.5)) {
      return { x: clamped.x, y: chunkedWaterSurfaceY(clamped.x, clamped.z), z: clamped.z };
    }
    if (isChunkedWaterPoint(clamped.x, clamped.z)) {
      return { x: clamped.x, y: chunkedWaterSurfaceY(clamped.x, clamped.z), z: clamped.z };
    }
    const searchOrigin = fallback ?? visitorPosition;
    const origin = clampChunkedPoint(searchOrigin.x, searchOrigin.z);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let ring = 0; ring < 18; ring++) {
      const radius = 8 + ring * 10;
      const samples = 18 + ring * 2;
      for (let i = 0; i < samples; i++) {
        const angle = i * golden + ring * 0.37;
        const candidate = clampChunkedPoint(
          origin.x + Math.cos(angle) * radius,
          origin.z + Math.sin(angle) * radius,
        );
        if (isChunkedWaterPoint(candidate.x, candidate.z)) {
          return { x: candidate.x, y: chunkedWaterSurfaceY(candidate.x, candidate.z), z: candidate.z };
        }
      }
    }
    return fallback ? { ...fallback } : { x: clamped.x, y: chunkedWaterSurfaceY(clamped.x, clamped.z), z: clamped.z };
  };
  const waterVehiclePositionForCurrentWorld = (x: number, z: number, fallback?: Vec3): Vec3 => {
    if (!isChunked) return waterVehiclePosition(x, z, fallback);
    if (supportsChunkedWater) return chunkedWaterVehiclePosition(x, z, fallback);
    return fallback ? { ...fallback } : { x, y: largeWorldBaseHeight(x, z), z };
  };
  const movedVehiclePositionForCurrentWorld = (
    thing: GeneratedThing,
    x: number,
    z: number,
    fallback?: Vec3,
  ): Vec3 => {
    if (supportsChunkedWater && vehicleMode(thing) === "water") {
      const position = chunkedWaterVehiclePosition(x, z, fallback);
      if (
        fallback &&
        position.x === fallback.x &&
        position.y === fallback.y &&
        position.z === fallback.z
      ) {
        return { ...fallback };
      }
      return positionAtGroundRelativeOffset(
        position,
        chunkedWaterSurfaceY(position.x, position.z),
        thing.verticalOffset,
      );
    }
    return movedVehiclePosition(thing, x, z, fallback);
  };
  const waterVehicleNeedsRelocation = (position: Vec3): boolean => {
    if (!isChunked) return waterBlockedByLand(position);
    return !supportsChunkedWater || !isChunkedWaterPoint(position.x, position.z);
  };
  const procPlantPreference = (() => {
    try {
      return window.localStorage.getItem("tellus.procplants");
    } catch {
      return null;
    }
  })();
  const procPlantDensityPreference = (() => {
    try {
      const value = Number(window.localStorage.getItem("tellus.procplants.density"));
      return Number.isFinite(value) && value > 0 ? value : 1;
    } catch {
      return 1;
    }
  })();
  const terrainOnlyDebug = () => {
    try {
      return window.localStorage.getItem("tellus.terrainOnly") === "1";
    } catch {
      return false;
    }
  };
  const lowGpuDebug = () => {
    try {
      return window.localStorage.getItem("tellus.lowGpu") === "1";
    } catch {
      return false;
    }
  };
  const lowGpuPixelRatioCap = () => (lowGpuDebug() ? 0.75 : 1.5);
  const renderEveryDebug = () => {
    try {
      const value = Number(window.localStorage.getItem("tellus.renderEvery"));
      return Number.isFinite(value) ? Math.max(1, Math.min(30, Math.round(value))) : 1;
    } catch {
      return 1;
    }
  };
  // Centralized policy: fixed worlds cache shadows, while cycling worlds update after meaningful
  // sun-angle movement. It also owns a slow safety refresh for streamed casters.
  const shadowUpdates = new ShadowUpdatePolicy();
  let canopyShadowCasterBounds: THREE.Box3 | null = null;
  const shadowCasterFocus = new THREE.Vector3();
  const shadowFallbackFocus = new THREE.Vector3();
  let shadowCameraFit: ReturnType<typeof fitDirectionalShadowCamera> | null = null;
  const frameDriverDebug = (): "raf" | "timeout" => {
    try {
      return window.localStorage.getItem("tellus.frameDriver") === "timeout" ? "timeout" : "raf";
    } catch {
      return "raf";
    }
  };
  const applyLowGpuDebugMode = () => {
    if (!renderer) return;
    let pixelRatioCap = lowGpuPixelRatioCap();
    if (!lowGpuDebug()) {
      try {
        const configured = Number(window.localStorage.getItem("tellus.pixelRatioCap"));
        if (Number.isFinite(configured) && configured >= 0.75 && configured <= 2) {
          pixelRatioCap = configured;
        }
      } catch {
        // Keep the default cap when storage is unavailable.
      }
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    renderer.shadowMap.enabled = !lowGpuDebug();
    // Force a shadow refresh next render whenever this runs (e.g. toggling low-GPU mode back on).
    shadowUpdates.invalidate();
  };
  const sampleVegetationHeight = isChunked
    ? (x: number, z: number) => chunkRenderer?.sampleHeight(x, z) ?? largeWorldBaseHeight(x, z)
    : terrainHeight;
  const sampleVegetationPaint = isChunked
    ? (x: number, z: number) => {
        const painted = chunkRenderer?.samplePaint(x, z);
        if (painted) return painted;
        const kind = largeWorldTerrainKind(x, z);
        return kind === "water" ? null : kind;
      }
    : centralTerrainPaintAt;
  const isWaterTerrainForVegetation = (x: number, z: number, h: number): boolean => {
    if (isChunked && h > SEA_LEVEL + 0.35) return false;
    const kind = isChunked
      ? largeWorldTerrainKind(x, z, h)
      : terrainKind(x, z, h);
    return kind === "water";
  };
  const biomeCellAt = (x: number, z: number, height: number): WorldBiomeCell | null => {
    const cell = worldBiomeCellCoordinates(x, z, {
      chunkedWorldChunks: chunkedDims,
      worldRadius: WORLD_RADIUS,
    });
    const key = `${cell.cx}:${cell.cz}`;
    const authored = worldBiomeCells.get(key);
    if (authored) return authored;
    if (worldBiomeGridAuthoritative) return { ...cell, biome: "grassland", intensity: 1 };
    return isChunked
      ? largeWorldBiomeCellAt(x, z, height)
      : activeEvoflowWorldBiomeCellAt(x, z, height);
  };
  const sampleEcology = (x: number, z: number, height: number, paint: TerrainPaintKind | null, seed: number) =>
    resolveEcologySample({
      seed,
      x,
      z,
      height,
      slope: isChunked
        ? Math.min(1, Math.abs((chunkRenderer?.sampleHeight(x + 2.5, z) ?? height) - height) / 2.5)
        : undefined,
      terrainPaint: paint,
      biomeCell: biomeCellAt(x, z, height),
    });
  const generatedThingSuppressesVegetation = (thing: GeneratedThing): boolean => {
    if (parseProceduralModelUrl(thing.modelUrl ?? "")?.building) return true;
    const lower = `${thing.kind} ${thing.prompt}`.toLowerCase();
    return (
      thing.kind === "shrine" ||
      lower.includes("house") ||
      lower.includes("hut") ||
      lower.includes("cabin") ||
      lower.includes("building") ||
      lower.includes("shop") ||
      lower.includes("temple") ||
      lower.includes("tower")
    );
  };
  type VegetationExclusionFootprint =
    | { kind: "aabb"; minX: number; maxX: number; minZ: number; maxZ: number }
    | { kind: "oriented"; x: number; z: number; halfWidth: number; halfDepth: number; yaw: number };
  const vegetationExclusionFootprintCache = new Map<string, VegetationExclusionFootprint | null>();
  const vegetationExclusionFootprint = (thing: GeneratedThing): VegetationExclusionFootprint | null => {
    if (!generatedThingSuppressesVegetation(thing)) return null;
    const mesh = generatedMeshes.get(thing.id);
    const meshKey = mesh && !shouldShowGenerationSwirl(thing) ? mesh.uuid : "fallback";
    const key = [
      thing.id,
      thing.modelUrl ?? "",
      meshKey,
      thing.position.x.toFixed(2),
      thing.position.z.toFixed(2),
      thing.scale.toFixed(3),
      (thing.rotationY ?? 0).toFixed(3),
    ].join(":");
    if (vegetationExclusionFootprintCache.has(key)) {
      return vegetationExclusionFootprintCache.get(key) ?? null;
    }
    let footprint: VegetationExclusionFootprint | null = null;
    if (mesh && !shouldShowGenerationSwirl(thing)) {
      const box = measureModelBounds(mesh);
      if (!box.isEmpty()) {
        const pad = 1.1 * WORLD_SCALE;
        footprint = {
          kind: "aabb",
          minX: box.min.x - pad,
          maxX: box.max.x + pad,
          minZ: box.min.z - pad,
          maxZ: box.max.z + pad,
        };
      }
    }
    if (!footprint) {
      const parsed = parseProceduralModelUrl(thing.modelUrl ?? "");
      const dims = parsed?.building
        ? proceduralBuildingDimensions(parsed.building.recipeId, parsed.seed)
        : null;
      // Recipe dimensions are pre-fit. Procedural buildings are later scaled by fitModelToHeight
      // (avatar/world-object sizing), so mimic that only as a fallback until rendered bounds exist.
      const fitScale = dims ? assetTargetHeight(thing) / Math.max(1, dims.bodyHeight) : 1;
      const width = dims ? dims.width * fitScale : clamp(thing.scale * 4.5, 2.6, 18);
      const depth = dims ? dims.depth * fitScale : clamp(thing.scale * 4.5, 2.6, 18);
      const pad = dims ? 1.6 * WORLD_SCALE : 1.1 * WORLD_SCALE;
      footprint = {
        kind: "oriented",
        x: thing.position.x,
        z: thing.position.z,
        halfWidth: width / 2 + pad,
        halfDepth: depth / 2 + pad,
        yaw: thing.rotationY ?? 0,
      };
    }
    vegetationExclusionFootprintCache.set(key, footprint);
    if (vegetationExclusionFootprintCache.size > 600) vegetationExclusionFootprintCache.clear();
    return footprint;
  };
  const generatedBuildingExcludesVegetation = (x: number, z: number): boolean => {
    for (const thing of generated) {
      const footprint = vegetationExclusionFootprint(thing);
      if (!footprint) continue;
      if (footprint.kind === "aabb") {
        if (x >= footprint.minX && x <= footprint.maxX && z >= footprint.minZ && z <= footprint.maxZ) return true;
        continue;
      }
      const cos = Math.cos(-footprint.yaw);
      const sin = Math.sin(-footprint.yaw);
      const dx = x - footprint.x;
      const dz = z - footprint.z;
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;
      if (Math.abs(localX) <= footprint.halfWidth && Math.abs(localZ) <= footprint.halfDepth) return true;
    }
    return false;
  };
  const terrainVegetationExcluded = (x: number, z: number, h: number): boolean =>
    isWaterTerrainForVegetation(x, z, h) ||
    (waterFeatureContains(x, z, 0.6) && h < waterFeatureLevel() + 0.35) ||
    generatedBuildingExcludesVegetation(x, z);
  // Legacy mesh vegetation stays off: procplants/custom biome mixes own automatic biome plants.
  const vegetation = {
    update: (..._args: unknown[]) => undefined,
    notifyTerrainChanged: () => undefined,
    getTreeColliders: () => [],
    stats: () => ({ tier: 0, chunks: 0, grassIndices: 0, trees: 0, sectors: 0 }),
    dispose: () => undefined,
  };
  const staticTerrainAllowsAutoVegetation = staticTerrainAutoVegetationEnabled(runtimeConfig.worldId);
  const templateAllowsAutoVegetation = !templateSuppressesAutoVegetation(activeWorldTemplate);
  const procplantsEnabled =
    !terrainOnlyDebug() &&
    procPlantPreference !== "0" &&
    staticTerrainAllowsAutoVegetation &&
    templateAllowsAutoVegetation &&
    (isChunked || procPlantPreference === "1");
  const procplants = procplantsEnabled
    ? createProcPlantVegetation({
        scene,
        renderer: () => renderer,
        camera: () => camera,
        worldId: runtimeConfig.worldId,
        sampleHeight: sampleVegetationHeight,
        samplePaint: sampleVegetationPaint,
        sampleEcology,
        ecologyRegionKey: (x, z) => {
          const cell = worldBiomeCellCoordinates(x, z, {
            chunkedWorldChunks: chunkedDims,
            worldRadius: WORLD_RADIUS,
          });
          return `${cell.cx}:${cell.cz}`;
        },
        bounds: chunkedVegetationBounds,
        densityMultiplier: procPlantDensityPreference,
        isExcluded: terrainVegetationExcluded,
        viewMode: () => cameraMode,
        fullDetailLod: activeWorldTemplate === "tellus",
        shouldPauseBuild: hasMovementKeyHeld,
        shadowProxyBudget: () =>
          lowGpuDebug() ? 0 : runtimeConfig.dayNightMode === "cycle" ? 96 : 192,
        onShadowCastersChanged: (bounds) => {
          canopyShadowCasterBounds = bounds?.clone() ?? null;
          if (canopyShadowCasterBounds) canopyShadowCasterBounds.getCenter(shadowCasterFocus);
          else shadowCasterFocus.set(visitorPosition.x, visitorPosition.y, visitorPosition.z);
          shadowUpdates.invalidate();
        },
        windStrength: () => lowGpuDebug() ? 0 : 1,
        shouldDeferBuild: () => {
          const terrainStats = chunkRenderer?.stats();
          const terrainReady = !isChunked || Boolean(
            terrainStats &&
            (
              terrainStats.active > 0 ||
              (terrainStats.ready > 0 && terrainStats.inflight === 0)
            ),
          );
          const skyboxReady =
            Boolean(activeSkyboxUrl) ||
            !runtimeConfig.skyboxUrl ||
            performance.now() - worldCreatedAt > 3500;
          return !terrainReady || !skyboxReady;
        },
      })
    : {
        update: () => undefined,
        notifyTerrainChanged: () => undefined,
        notifyRegionsChanged: () => undefined,
        stats: () => ({
          chunks: 0,
          nearChunks: 0,
          nearChunksBuilt: 0,
          centerChunkBuilt: false,
          plants: 0,
          manualPlants: 0,
          instances: 0,
          grassInstances: 0,
          grassTriangles: 0,
          stemTriangles: 0,
          organDraws: 0,
          branchSegments: 0,
          attachedLeaves: 0,
          branchLod0: 0,
          branchLod1: 0,
          branchLod2: 0,
          impostors: 0,
          lod0: 0,
          lod1: 0,
          lod2: 0,
          viewMode: "first" as const,
          queuedRebuilds: 0,
          terrainInvalidations: 0,
          chunksCreated: 0,
          chunksEvicted: 0,
          chunksBuilt: 0,
          lastUpdateMs: 0,
          maxUpdateMs: 0,
          lastBuildMs: 0,
          maxBuildMs: 0,
          totalBuildMs: 0,
          builtLastUpdate: 0,
          buildPausedForMotion: false,
          buildDeferred: false,
          deferredLodChunks: 0,
          deferredColdChunks: 0,
          lodRefreshes: 0,
          shadowProxies: 0,
          shadowProxyBudget: 0,
          shadowProxyRefreshes: 0,
        }),
        placeManualPlant: () => false,
        replaceManualPlants: () => undefined,
        removeManualPlant: () => false,
        manualPlantPlacements: () => [],
        dispose: () => undefined,
      };
  let terrainOnlyLayersDisposed = false;
  const applyTerrainOnlyDebugMode = () => {
    if (!terrainOnlyDebug() || terrainOnlyLayersDisposed) return;
    vegetation.dispose();
    procplants.dispose();
    worldModelLoadQueue.length = 0;
    queuedWorldModelLoads.clear();
    terrainOnlyLayersDisposed = true;
  };
  window.__tellusSetTerrainOnly = (enabled = true) => {
    try {
      if (enabled) window.localStorage.setItem("tellus.terrainOnly", "1");
      else window.localStorage.removeItem("tellus.terrainOnly");
    } catch {
      // Ignore storage failures; the returned state will reflect whether it stuck.
    }
    applyTerrainOnlyDebugMode();
    return terrainOnlyDebug();
  };
  window.__tellusSetLowGpu = (enabled = true) => {
    try {
      if (enabled) window.localStorage.setItem("tellus.lowGpu", "1");
      else window.localStorage.removeItem("tellus.lowGpu");
    } catch {
      // Ignore storage failures; the returned state will reflect whether it stuck.
    }
    applyLowGpuDebugMode();
    return lowGpuDebug();
  };
  window.__tellusSetRenderEvery = (frames = 1) => {
    const value = Math.max(1, Math.min(30, Math.round(Number(frames) || 1)));
    try {
      if (value === 1) window.localStorage.removeItem("tellus.renderEvery");
      else window.localStorage.setItem("tellus.renderEvery", String(value));
    } catch {
      // Ignore storage failures; the returned state will reflect whether it stuck.
    }
    return renderEveryDebug();
  };
  window.__tellusSetFrameDriver = (driver: "raf" | "timeout" = "raf") => {
    try {
      if (driver === "timeout") window.localStorage.setItem("tellus.frameDriver", "timeout");
      else window.localStorage.removeItem("tellus.frameDriver");
    } catch {
      // Ignore storage failures; the returned state will reflect whether it stuck.
    }
    return frameDriverDebug();
  };
  window.__tellusSetRenderer = (preference: "webgl" | "webgpu" | "default" = "default") => {
    try {
      if (preference === "webgpu") window.localStorage.setItem("tellus.renderer", "webgpu");
      else if (preference === "webgl") window.localStorage.setItem("tellus.renderer", "webgl");
      else window.localStorage.removeItem("tellus.renderer");
    } catch {
      // Ignore storage failures; the returned state will reflect whether it stuck.
    }
    return {
      requested: preference,
      active: useWebGPU ? "webgpu" : "webgl",
      reloadRequired: true,
    };
  };
  const refreshVegetationForGeneratedThing = (thing: GeneratedThing | undefined) => {
    if (!thing || !generatedThingSuppressesVegetation(thing)) return;
    vegetation.notifyTerrainChanged();
    procplants.notifyTerrainChanged();
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
    chunkRenderer.setFetchStartBudget(0);
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
    simulated: usesSimulatedPondWater,
    baseSurface: !isChunked,
    waterSettings: runtimeConfig.waterSettings,
  });
  const pondRippleContains = (x: number, z: number, pad = 0): boolean =>
    usesChunkedLakeWater ? isChunkedWaterPoint(x, z) : waterFeatureContains(x, z, pad);
  const pondRippleWaterLevelAt = (x: number, z: number): number =>
    usesChunkedLakeWater ? chunkedWaterSurfaceY(x, z) + 0.025 : waterFeatureLevel();
  const disturbPond = (
    position: { x: number; z: number },
    nowMs: number,
    strength = 1,
  ): boolean => {
    if (!pondWater.visible || !pondRippleContains(position.x, position.z, -0.12)) return false;
    if (usesSimulatedPondWater) {
      positionPondRipplePatch(
        pondWater,
        position,
        pondRippleWaterLevelAt(position.x, position.z),
      );
    }
    return triggerPondRipple(pondWater, position, nowMs, strength);
  };
  const flowerPatchGroup = new THREE.Group();
  flowerPatchGroup.name = "tellus-flower-patches";
  const flowerSpriteMaterials = createFlowerSpriteMaterials();
  const floatingRim = createFloatingRim();
  if (isChunked) {
    floatingRim.visible = false;
    pondWater.visible = usesChunkedLakeWater;
    if (isContinentalChunkedWorld) {
      ocean.visible = usesChunkedLakeWater;
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
  let preInteriorCameraMode: CameraMode | null = null;
  let profileInteriorSceneUrl = options.initialInteriorSceneUrl?.trim() || null;
  let portalPreviewTargetWorldId: string | null = null;
  type PortalPreview = {
    targetWorldId: string;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderTarget: THREE.WebGLRenderTarget;
    material: THREE.MeshBasicMaterial;
    plane: THREE.Mesh;
    room: THREE.Object3D;
    socket?: WebSocket;
    liveGroup: THREE.Group;
    presenceMarkers: Map<string, THREE.Object3D>;
    generatedMarkers: Map<string, THREE.Object3D>;
    viewerTexture?: THREE.Texture;
    viewerFrameUrl?: string;
  };
  let portalPreview: PortalPreview | null = null;
  // Guards the ONE-TIME interior trimesh bake (see ensureInteriorStatics). Declared here (before
  // applyInterior uses it) to avoid a temporal-dead-zone reference.
  let interiorBaked = false;
  // Real multi-surface interior geometry now lives in src/tellus-building.ts (generateInteriorRoom):
  // floor slab(s) + perimeter walls (with a doorway gap) + a climbable staircase between levels +
  // ceiling + warm light, all flagged userData.collide for the physics track. A real sceneUrl GLB
  // (when it loads) is added INSIDE the same container.
  const interiorBiomeFromLegacyName = (value: string): InteriorBiomeMaterial => {
    const lower = value.toLowerCase();
    if (lower.includes("desert") || lower.includes("dune") || lower.includes("copper")) return "desert";
    if (lower.includes("snow") || lower.includes("ice") || lower.includes("tundra")) return "tundra";
    if (lower.includes("taiga") || lower.includes("boreal")) return "taiga";
    if (lower.includes("savanna") || lower.includes("savannah")) return "savanna";
    if (lower.includes("grass") || lower.includes("meadow") || lower.includes("lowland")) return "grassland";
    if (lower.includes("estuary") || lower.includes("marsh") || lower.includes("mud")) return "estuary";
    if (lower.includes("coast") || lower.includes("cove") || lower.includes("beach") || lower.includes("water") || lower.includes("island")) return "coastal";
    if (lower.includes("tropical") || lower.includes("jungle") || lower.includes("palm") || lower.includes("bamboo")) return "tropical-rain-forest";
    return "temperate-rain-forest";
  };

  const dominantWorldBiome = (): string | null => {
    const counts = new Map<string, number>();
    for (const cell of worldBiomeCells.values()) {
      const name = (cell.becoming || cell.biome || "").trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + Math.max(0.1, cell.intensity ?? 1));
    }
    let winner: string | null = null;
    let winnerCount = 0;
    for (const [name, count] of counts) {
      if (count <= winnerCount) continue;
      winner = name;
      winnerCount = count;
    }
    return winner;
  };

  const interiorBiomeForSceneUrl = (sceneUrl: string): InteriorBiomeMaterial => {
    const source = [sceneUrl, dominantWorldBiome(), runtimeConfig.worldTemplate, runtimeConfig.worldId]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(" ");
    const explicit = normalizeInteriorBiomeMaterial(source);
    if (explicit !== "temperate-rain-forest" || /temperate|forest|plaster|stone/i.test(source)) return explicit;
    return interiorBiomeFromLegacyName(source);
  };

  const interiorRoomSpecForSceneUrl = (sceneUrl: string) => {
    const lower = sceneUrl.toLowerCase();
    if (lower.includes("grand-hall") || lower.includes("tavern")) {
      return { width: 30, depth: 24, levels: 2, stairs: true, seed: 7, biome: interiorBiomeForSceneUrl(sceneUrl) };
    }
    return { width: 20, depth: 18, levels: 2, stairs: true, seed: 3, biome: interiorBiomeForSceneUrl(sceneUrl) };
  };

  const hashPortalPreviewWorld = (worldId: string): number => {
    let h = 2166136261;
    for (let i = 0; i < worldId.length; i++) {
      h ^= worldId.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const createPortalPreviewScene = (worldId: string): THREE.Scene => {
    const previewScene = new THREE.Scene();
    const lower = worldId.toLowerCase();
    const hash = hashPortalPreviewWorld(worldId);
    const hue = ((hash % 360) / 360 + (lower.includes("fantasy") ? 0.22 : 0)) % 1;
    const sky = lower.includes("cove") || lower.includes("beach") ? 0x9fd8ff : lower.includes("ridge") || lower.includes("mountain") ? 0xb7c8e8 : 0xcfe9ff;
    previewScene.background = new THREE.Color(sky);
    previewScene.add(new THREE.HemisphereLight(0xffffff, 0x5c6a55, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-4, 7, 5);
    previewScene.add(sun);

    const groundColor = lower.includes("cove") || lower.includes("beach")
      ? 0xd9c28a
      : lower.includes("ridge") || lower.includes("mountain")
        ? 0x6d7a62
        : lower.includes("garden") || lower.includes("fantasy")
          ? 0x4f9d63
          : new THREE.Color().setHSL(hue, 0.42, 0.45).getHex();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 16, 1, 1),
      new THREE.MeshStandardMaterial({ color: groundColor, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -1.5;
    previewScene.add(ground);

    if (lower.includes("cove") || lower.includes("beach")) {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(18, 8),
        new THREE.MeshStandardMaterial({ color: 0x358fbd, roughness: 0.35, metalness: 0.05 }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.set(0, 0.04, -5.5);
      previewScene.add(water);
    }

    const mountainCount = lower.includes("ridge") || lower.includes("mountain") ? 6 : 3;
    for (let i = 0; i < mountainCount; i++) {
      const x = -6 + i * (12 / Math.max(1, mountainCount - 1));
      const h = lower.includes("ridge") || lower.includes("mountain") ? 2.4 + ((hash >> (i % 16)) & 3) * 0.55 : 0.8 + (i % 2) * 0.35;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(1.6 + h * 0.25, h, 5),
        new THREE.MeshStandardMaterial({ color: lower.includes("cartoon") ? 0x5daf57 : 0x6b735f, roughness: 0.88 }),
      );
      cone.position.set(x, h / 2, -5 - (i % 2) * 1.2);
      previewScene.add(cone);
      if (h > 2.2) {
        const snow = new THREE.Mesh(
          new THREE.ConeGeometry(0.55 + h * 0.08, h * 0.26, 5),
          new THREE.MeshStandardMaterial({ color: 0xf1f2ec, roughness: 0.7 }),
        );
        snow.position.set(x, h * 0.88, -5 - (i % 2) * 1.2);
        previewScene.add(snow);
      }
    }

    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.06, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd76a }),
    );
    marker.position.set(0, 0.08, -1.2);
    marker.rotation.x = -Math.PI / 2;
    previewScene.add(marker);
    return previewScene;
  };

  const portalPreviewLiveUrl = (worldId: string): string => {
    const httpUrl = new URL(
      worldApiUrl(`/api/world/${encodeURIComponent(worldId)}/preview/live?userId=${encodeURIComponent(tellusUserId())}`),
      window.location.href,
    );
    httpUrl.searchParams.set("visitorId", `${visitorId}-preview`);
    httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
    return httpUrl.toString();
  };

  const portalPreviewPosition = (position?: Vec3): THREE.Vector3 | null => {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null;
    return new THREE.Vector3(
      clamp(position.x / 14, -6.4, 6.4),
      Math.max(0.34, clamp((position.y ?? 0) / 18 + 0.34, 0.34, 3.2)),
      clamp(position.z / 14 - 2.5, -6.8, 2.8),
    );
  };

  const makePortalPreviewPresenceMarker = (presence: WorldPresence): THREE.Object3D => {
    const group = new THREE.Group();
    group.name = `portal-preview-presence-${presence.visitorId}`;
    const hue = ((hashPortalPreviewWorld(presence.ownerUserId || presence.visitorId) % 360) / 360);
    const bodyColor = new THREE.Color().setHSL(hue, 0.62, 0.58).getHex();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16, 0.46, 4, 8),
      new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.68 }),
    );
    body.position.y = 0.45;
    group.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd7a3, roughness: 0.72 }),
    );
    head.position.y = 0.86;
    group.add(head);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.018, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe27c }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.04;
    group.add(halo);
    return group;
  };

  const makePortalPreviewGeneratedMarker = (thing: WorldGeneratedThing): THREE.Object3D => {
    const color = Number.isFinite(thing.color) ? thing.color : kindColor(thing.kind as GeneratedKind, thing.prompt);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.76 });
    const mesh = new THREE.Mesh(
      thing.kind === "plant" || /tree|flower|garden/i.test(thing.prompt)
        ? new THREE.ConeGeometry(0.24, 0.72, 7)
        : new THREE.BoxGeometry(0.42, 0.42, 0.42),
      material,
    );
    mesh.name = `portal-preview-generated-${thing.id}`;
    mesh.position.y = 0.22;
    mesh.scale.setScalar(clamp(thing.scale || 1, 0.65, 1.8));
    return mesh;
  };

  const syncPortalPreviewPresence = (preview: PortalPreview, presenceRaw: WorldPresence[]) => {
    const active = new Set<string>();
    for (const presence of presenceRaw.filter(isLivePresence)) {
      const pos = portalPreviewPosition(presence.position);
      if (!pos) continue;
      active.add(presence.visitorId);
      let marker = preview.presenceMarkers.get(presence.visitorId);
      if (!marker) {
        marker = makePortalPreviewPresenceMarker(presence);
        preview.presenceMarkers.set(presence.visitorId, marker);
        preview.liveGroup.add(marker);
      }
      marker.position.copy(pos);
    }
    for (const [id, marker] of preview.presenceMarkers) {
      if (active.has(id)) continue;
      preview.liveGroup.remove(marker);
      disposeObject(marker);
      preview.presenceMarkers.delete(id);
    }
  };

  const upsertPortalPreviewGenerated = (preview: PortalPreview, thing: WorldGeneratedThing) => {
    const pos = portalPreviewPosition(thing.position);
    if (!pos) return;
    let marker = preview.generatedMarkers.get(thing.id);
    if (!marker) {
      marker = makePortalPreviewGeneratedMarker(thing);
      preview.generatedMarkers.set(thing.id, marker);
      preview.liveGroup.add(marker);
    }
    marker.position.copy(pos);
    marker.rotation.y = thing.rotationY || 0;
  };

  const syncPortalPreviewGenerated = (preview: PortalPreview, things: WorldGeneratedThing[]) => {
    const active = new Set<string>();
    for (const thing of things.filter(isWorldGeneratedThing).slice(0, 64)) {
      active.add(thing.id);
      upsertPortalPreviewGenerated(preview, thing);
    }
    for (const [id, marker] of preview.generatedMarkers) {
      if (active.has(id)) continue;
      preview.liveGroup.remove(marker);
      disposeObject(marker);
      preview.generatedMarkers.delete(id);
    }
  };

  const applyPortalPreviewPatch = (preview: PortalPreview, patch: WorldPatch) => {
    if (patch.type === "world.snapshot") {
      syncPortalPreviewPresence(preview, patch.presence ?? []);
      syncPortalPreviewGenerated(preview, patch.generated ?? []);
      return;
    }
    if (patch.type === "presence.updated") {
      syncPortalPreviewPresence(preview, patch.presence ?? []);
      return;
    }
    if (patch.type === "generated.updated" && isWorldGeneratedThing(patch.thing)) {
      upsertPortalPreviewGenerated(preview, patch.thing);
      return;
    }
    if (patch.type === "generated.deleted") {
      const marker = preview.generatedMarkers.get(patch.id);
      if (!marker) return;
      preview.liveGroup.remove(marker);
      disposeObject(marker);
      preview.generatedMarkers.delete(patch.id);
    }
  };

  const setPortalPreviewViewerFrame = (preview: PortalPreview, src: string) => {
    if (!src || preview !== portalPreview) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (preview !== portalPreview) return;
      preview.viewerTexture?.dispose();
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      preview.viewerTexture = texture;
      preview.material.map = texture;
      preview.material.needsUpdate = true;
      if (preview.viewerFrameUrl) {
        URL.revokeObjectURL(preview.viewerFrameUrl);
        preview.viewerFrameUrl = undefined;
      }
      if (src.startsWith("blob:")) preview.viewerFrameUrl = src;
    };
    image.onerror = () => {
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    };
    image.src = src;
  };

  const applyPortalPreviewViewerMessage = (preview: PortalPreview, data: unknown): boolean => {
    if (data instanceof Blob) {
      setPortalPreviewViewerFrame(preview, URL.createObjectURL(data));
      return true;
    }
    if (!isRecord(data)) return false;
    const type = typeof data.type === "string" ? data.type : "";
    const image =
      typeof data.dataUrl === "string" ? data.dataUrl :
      typeof data.imageUrl === "string" ? data.imageUrl :
      typeof data.jpeg === "string" ? `data:image/jpeg;base64,${data.jpeg}` :
      typeof data.png === "string" ? `data:image/png;base64,${data.png}` :
      "";
    if (!image) return false;
    if (type && !/preview|viewer|frame/i.test(type)) return false;
    setPortalPreviewViewerFrame(preview, image);
    return true;
  };

  const connectPortalPreviewLive = (preview: PortalPreview) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(portalPreviewLiveUrl(preview.targetWorldId));
    } catch {
      return;
    }
    preview.socket = socket;
    socket.onmessage = (event) => {
      if (preview !== portalPreview) return;
      if (event.data instanceof ArrayBuffer) {
        applyPortalPreviewViewerMessage(preview, new Blob([event.data], { type: "image/jpeg" }));
        return;
      }
      if (event.data instanceof Blob) {
        applyPortalPreviewViewerMessage(preview, event.data);
        return;
      }
      if (typeof event.data !== "string") return;
      try {
        const parsed = JSON.parse(event.data) as unknown;
        if (applyPortalPreviewViewerMessage(preview, parsed)) return;
        applyPortalPreviewPatch(preview, parsed as WorldPatch);
      } catch {
        // The static doorway scene remains useful if a mid-rollout backend sends something unexpected.
      }
    };
    socket.onerror = () => {
      try { socket.close(); } catch { /* best effort */ }
    };
    socket.onclose = () => {
      if (preview.socket === socket) preview.socket = undefined;
    };
  };

  const findInteriorPortalDoor = (): { room: THREE.Object3D; anchor: { position: Vec3; width: number; height: number } } | null => {
    if (!interiorObject) return null;
    for (const child of interiorObject.children) {
      const anchor = child.userData.portalDoorAnchor as { position?: Vec3; width?: number; height?: number } | undefined;
      if (
        anchor?.position &&
        typeof anchor.position.x === "number" &&
        typeof anchor.position.y === "number" &&
        typeof anchor.position.z === "number" &&
        typeof anchor.width === "number" &&
        typeof anchor.height === "number"
      ) {
        return { room: child, anchor: { position: anchor.position, width: anchor.width, height: anchor.height } };
      }
    }
    return null;
  };

  const disposePortalPreview = () => {
    if (!portalPreview) return;
    try { portalPreview.socket?.close(); } catch { /* best effort */ }
    portalPreview.room.remove(portalPreview.plane);
    portalPreview.plane.geometry.dispose();
    portalPreview.material.dispose();
    portalPreview.renderTarget.dispose();
    portalPreview.viewerTexture?.dispose();
    if (portalPreview.viewerFrameUrl) URL.revokeObjectURL(portalPreview.viewerFrameUrl);
    disposeObject(portalPreview.scene);
    portalPreview = null;
  };

  const ensurePortalPreview = () => {
    const target = portalPreviewTargetWorldId?.trim();
    const door = findInteriorPortalDoor();
    if (!target || !door) {
      disposePortalPreview();
      return;
    }
    if (portalPreview && portalPreview.targetWorldId === target && portalPreview.room === door.room) return;
    disposePortalPreview();

    const renderTarget = new THREE.WebGLRenderTarget(512, 512, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
      map: renderTarget.texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(door.anchor.width * 0.96, door.anchor.height * 0.94), material);
    plane.name = "tellus-portal-door-preview";
    plane.position.set(door.anchor.position.x, door.anchor.height / 2, door.anchor.position.z + 0.08);
    plane.renderOrder = 2;
    const previewScene = createPortalPreviewScene(target);
    const liveGroup = new THREE.Group();
    liveGroup.name = "tellus-portal-preview-live";
    previewScene.add(liveGroup);
    const previewCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 80);
    previewCamera.position.set(0, 3.2, 6.8);
    previewCamera.lookAt(0, 1.1, -3.4);
    door.room.add(plane);
    portalPreview = {
      targetWorldId: target,
      scene: previewScene,
      camera: previewCamera,
      renderTarget,
      material,
      plane,
      room: door.room,
      socket: undefined,
      liveGroup,
      presenceMarkers: new Map(),
      generatedMarkers: new Map(),
    };
    connectPortalPreviewLive(portalPreview);
  };

  const renderPortalPreview = () => {
    if (!renderer || !portalPreview) return;
    if (lowGpuDebug()) return;
    if (portalPreview.material.map !== portalPreview.renderTarget.texture) return;
    const previousTarget = renderer.getRenderTarget() as THREE.WebGLRenderTarget | null;
    renderer.setRenderTarget(portalPreview.renderTarget);
    renderer.render(portalPreview.scene, portalPreview.camera);
    renderer.setRenderTarget(previousTarget);
  };

  const previewPortalTarget = (targetWorldId?: string | null) => {
    portalPreviewTargetWorldId = targetWorldId?.trim() || null;
    ensurePortalPreview();
  };

  const applyInterior = (sceneUrl: string) => {
    const u = sceneUrl.trim();
    if (!u || u === interiorSceneUrl) return;
    interiorSceneUrl = u;
    ocean.visible = false;
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
    if (preInteriorCameraMode === null) preInteriorCameraMode = cameraMode;
    setCameraMode("first", { persist: false });
    if (interiorObject) {
      disposePortalPreview();
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
    ensurePortalPreview();
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
    disposePortalPreview();
    wallDoorPlacement = null;
    if (wallDoorPlacementGhost) {
      portalMarkerGroup.remove(wallDoorPlacementGhost);
      disposeObject(wallDoorPlacementGhost);
      wallDoorPlacementGhost = null;
    }
    scene.remove(interiorObject);
    disposeObject(interiorObject);
    interiorObject = null;
    interiorSceneUrl = null;
    rapierPhysics?.clearStatics();
    ocean.visible = showsWorldWaterSurface;
    archipelago.visible = !isContinentalChunkedWorld;
    terrain.visible = !isChunked;
    pondWater.visible = !isChunked || usesChunkedLakeWater;
    flowerPatchGroup.visible = true;
    floatingRim.visible = !isChunked;
    if (preInteriorCameraMode !== null) {
      const restoreMode = preInteriorCameraMode;
      preInteriorCameraMode = null;
      setCameraMode(restoreMode, { persist: false });
    }
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
  let wallDoorPlacement:
    | {
        targetWorldId: string;
        label: string;
      }
    | null = null;
  let wallDoorPlacementGhost: THREE.Object3D | null = null;
  const pendingPortalIds = new Set<string>();
  const pendingPortalStartedAt = new Map<string, number>();
  const pendingPortalWarnedIds = new Set<string>();
  const pendingDeletedPortals = new Map<string, WorldPortal>();
  let lastPortalEnterAt = 0;
  let lastPortalSelectAt = 0;
  let insidePortalId: string | null = null;
  // Set on spawn/warp/interior-entry; blocks portal auto-enter until the player is clear of ALL
  // portals once (prevents the "spawn on the door → bounce back" loop, robust to async portal load).
  let portalSpawnGuard = false;
  // Must be initialized before realtime connects; interior snapshots can arrive while this factory is still running.
  const armPortalArrivalGrace = () => {
    insidePortalId = null;
    lastPortalEnterAt = performance.now();
    portalSpawnGuard = true;
  };
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
  const makeWallDoorMarker = (pending = false): THREE.Object3D => {
    const g = new THREE.Group();
    g.userData.portalMarkerKey = `wall-door:${pending ? "pending" : "ready"}`;
    const pickVolume = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 3.3, 0.72),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.001,
        depthWrite: false,
      }),
    );
    pickVolume.position.set(0, 1.65, 0.08);
    pickVolume.userData.portalDoorPickVolume = true;
    const frameMat = new THREE.MeshStandardMaterial({
      color: pending ? 0x8fd5ff : 0x5e3b1f,
      roughness: 0.72,
      metalness: 0.0,
      transparent: pending,
      opacity: pending ? 0.62 : 1,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color: pending ? 0x8fd5ff : 0xffd76a,
      transparent: true,
      opacity: pending ? 0.24 : 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const panelMat = new THREE.MeshBasicMaterial({
      color: pending ? 0x6ad0ff : 0x142033,
      transparent: true,
      opacity: pending ? 0.28 : 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const width = 2.3;
    const height = 3.0;
    const depth = 0.12;
    const visual = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.86, height * 0.9), panelMat);
    visual.position.set(0, height / 2, 0.035);
    visual.userData.portalDoorFace = true;
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.16, height, depth), frameMat);
    left.position.set(-width / 2, height / 2, 0);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.16, height, depth), frameMat);
    right.position.set(width / 2, height / 2, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, 0.16, depth), frameMat);
    top.position.set(0, height, 0);
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(width + 0.34, 0.08, 0.46), frameMat);
    threshold.position.set(0, 0.04, 0.16);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.12, height * 1.04), glowMat);
    glow.position.set(0, height / 2, 0.02);
    g.add(pickVolume, glow, visual, left, right, top, threshold);
    return g;
  };
  const interiorDoorSpawnForSceneUrl = (sceneUrl: string): Vec3 => {
    const spec = interiorRoomSpecForSceneUrl(sceneUrl);
    const depth = typeof spec.depth === "number" && Number.isFinite(spec.depth) ? spec.depth : 18;
    return { x: 0, y: 0, z: -Math.max(2.5, depth / 2 - 2.2) };
  };
  const isWallDoorPortal = (p: WorldPortal): boolean =>
    Boolean(interiorObject && p.target.kind === "world");
  const isDoorSurfacePortal = (p: WorldPortal): boolean =>
    Boolean(isWallDoorPortal(p) || p.target.kind === "interior" || typeof p.rotation?.y === "number");
  const portalAnchorThing = (p: WorldPortal): GeneratedThing | undefined =>
    p.anchorThingId ? generated.find((thing) => thing.id === p.anchorThingId) : undefined;
  const rotateXZ = (point: Vec3, radians: number): Vec3 => {
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: point.x * cos - point.z * sin,
      y: point.y,
      z: point.x * sin + point.z * cos,
    };
  };
  const portalAnchorOffset = (p: WorldPortal, anchor: GeneratedThing): Vec3 => {
    const cached = portalAnchorOffsets.get(p.id);
    if (
      cached &&
      Number.isFinite(cached.x) &&
      Number.isFinite(cached.y) &&
      Number.isFinite(cached.z)
    ) {
      return cached;
    }
    if (
      p.anchorOffset &&
      Number.isFinite(p.anchorOffset.x) &&
      Number.isFinite(p.anchorOffset.y) &&
      Number.isFinite(p.anchorOffset.z)
    ) {
      portalAnchorOffsets.set(p.id, { ...p.anchorOffset });
      return p.anchorOffset;
    }
    const derived = {
      x: p.position.x - anchor.position.x,
      y: p.position.y - anchor.position.y,
      z: p.position.z - anchor.position.z,
    };
    portalAnchorOffsets.set(p.id, derived);
    return derived;
  };
  const portalAnchorPosition = (p: WorldPortal): Vec3 => {
    const anchor = portalAnchorThing(p);
    if (!anchor) return p.position;
    const offset = portalAnchorOffset(p, anchor);
    const worldOffset = rotateXZ(offset, anchor.rotationY ?? 0);
    return {
      x: anchor.position.x + worldOffset.x,
      y: anchor.position.y + worldOffset.y,
      z: anchor.position.z + worldOffset.z,
    };
  };
  const portalRotationY = (p: WorldPortal): number => {
    const base = typeof p.rotation?.y === "number" ? p.rotation.y : 0;
    const anchor = portalAnchorThing(p);
    return anchor ? (anchor.rotationY ?? 0) + base : base;
  };
  const portalDoorSurfacePose = (p: WorldPortal): { position: Vec3; rotationY: number } => {
    const position = portalAnchorPosition(p);
    if (!interiorObject || !isWallDoorPortal(p)) {
      return { position, rotationY: portalRotationY(p) };
    }
    if (typeof p.rotation?.y === "number") {
      return { position, rotationY: portalRotationY(p) };
    }
    const bounds = interiorPlacementBounds(1.4);
    if (!bounds) return { position: interiorPlacementPosition(position.x, position.z), rotationY: 0 };
    const x = clamp(position.x, bounds.minX, bounds.maxX);
    const z = bounds.minZ;
    return {
      position: { x, y: interiorPlacementFloorHeightAt(x, z, visitorPosition.y) ?? Math.max(0, visitorPosition.y), z },
      rotationY: 0,
    };
  };
  const markPortalReady = (p: WorldPortal) => {
    if (p.anchorThingId && p.anchorOffset) {
      portalAnchorOffsets.set(p.id, { ...p.anchorOffset });
    } else if (!p.anchorThingId) {
      portalAnchorOffsets.delete(p.id);
    } else if (!portalAnchorOffsets.has(p.id)) {
      const anchor = portalAnchorThing(p);
      if (anchor) {
        portalAnchorOffsets.set(p.id, {
          x: p.position.x - anchor.position.x,
          y: p.position.y - anchor.position.y,
          z: p.position.z - anchor.position.z,
        });
      }
    }
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
    const snapshotIds = new Set<string>();
    for (const p of snapshotPortals) {
      snapshotIds.add(p.id);
      markPortalReady(p);
      byId.set(p.id, p);
    }
    for (const p of worldPortals) {
      if (pendingPortalIds.has(p.id) && !byId.has(p.id)) byId.set(p.id, p);
    }
    for (const id of portalAnchorOffsets.keys()) {
      if (!snapshotIds.has(id) && !pendingPortalIds.has(id)) portalAnchorOffsets.delete(id);
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
  const announcePortalSelection = (portalId: string) => {
    lastPortalSelectAt = performance.now();
    insidePortalId = portalId;
    window.dispatchEvent(new CustomEvent("tellus:portal-selected", { detail: portalId }));
  };
  const syncPortalMarkers = () => {
    const seen = new Set<string>();
    for (const p of worldPortals) {
      seen.add(p.id);
      const pending = pendingPortalIds.has(p.id);
      const doorSurface = isDoorSurfacePortal(p);
      const markerKey = doorSurface
        ? `door-surface:${pending ? "pending" : "ready"}`
        : `${p.target.kind === "interior" ? "interior" : "world"}:${pending ? "pending" : "ready"}`;
      let marker = portalMarkers.get(p.id);
      if (marker && marker.userData.portalMarkerKey !== markerKey) {
        portalMarkerGroup.remove(marker);
        disposeObject(marker);
        portalMarkers.delete(p.id);
        marker = undefined;
      }
      if (!marker) {
        marker = doorSurface ? makeWallDoorMarker(pending) : makePortalMarker(p.target.kind === "interior", pending);
        marker.userData.portalMarkerKey = markerKey;
        portalMarkers.set(p.id, marker);
        portalMarkerGroup.add(marker);
      }
      marker.userData.portalId = p.id;
      marker.traverse((child) => {
        child.userData.portalId = p.id;
      });
      const pose = doorSurface ? portalDoorSurfacePose(p) : null;
      const position = pose?.position ?? portalAnchorPosition(p);
      const y = pose ? position.y : portalGroundY(p) + 0.05;
      marker.position.set(position.x, y, position.z);
      marker.rotation.y = pose?.rotationY ?? 0;
      marker.scale.setScalar(doorSurface ? clamp(p.radius / 1.7, 0.55, 2.4) : 1);
      const triggerRing = marker.children.find((child) => child.userData.portalTriggerRing);
      if (triggerRing) {
        const r = Math.max(1.2, p.radius);
        triggerRing.scale.set(r / marker.scale.x, 1, r / marker.scale.z);
      }
    }
    for (const [id, marker] of portalMarkers) {
      if (seen.has(id)) continue;
      portalMarkerGroup.remove(marker);
      disposeObject(marker);
      portalMarkers.delete(id);
    }
  };
  const portalProbePositions = (): Vec3[] => {
    const mounted = sailingThingId ? thingById(sailingThingId) : undefined;
    return mounted ? [visitorPosition, mounted.position] : [visitorPosition];
  };
  const doorSurfacePortalContainsPoint = (p: WorldPortal, point: Vec3): boolean => {
    const pose = portalDoorSurfacePose(p);
    const dx = point.x - pose.position.x;
    const dz = point.z - pose.position.z;
    const normalX = Math.sin(pose.rotationY);
    const normalZ = Math.cos(pose.rotationY);
    const rightX = Math.cos(pose.rotationY);
    const rightZ = -Math.sin(pose.rotationY);
    const forward = dx * normalX + dz * normalZ;
    const lateral = dx * rightX + dz * rightZ;
    const heightScale = clamp(p.radius / 1.7, 0.55, 2.4);
    const halfWidth = Math.max(0.85, Math.min(1.35, p.radius * 0.62));
    return (
      Math.abs(lateral) <= halfWidth &&
      forward >= -0.42 &&
      forward <= 0.72 &&
      point.y >= pose.position.y - 0.35 &&
      point.y <= pose.position.y + 3.35 * heightScale
    );
  };
  const doorSurfacePortalContainsVisitor = (p: WorldPortal): boolean =>
    portalProbePositions().some((point) => doorSurfacePortalContainsPoint(p, point));

  // Called each frame: auto-enter when the player crosses a portal doorway surface.
  const updatePortals = (now: number) => {
    for (const marker of portalMarkers.values()) {
      if (marker.userData.portalMarkerKey?.startsWith?.("door-surface:")) {
        const face = marker.children.find((child) => child.userData.portalDoorFace);
        if (face) {
          const mat = (face as THREE.Mesh).material;
          if (mat instanceof THREE.MeshBasicMaterial) mat.opacity = 0.32 + Math.sin(now * 0.002) * 0.08;
        }
      } else {
        marker.rotation.y = now * 0.00025;
      }
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
      const near = isDoorSurfacePortal(p)
        ? doorSurfacePortalContainsVisitor(p)
        : portalProbePositions().some(
            (point) => distance2D(point, portalAnchorPosition(p)) <= Math.max(1.2, p.radius),
          );
      if (near) {
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
    if (now - lastPortalSelectAt < 1400) {
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
  // Manual shadow-map refresh: the day/night cycle nudges the sun every frame, which would otherwise
  // force a full shadow re-render every frame on both backends (WebGL WebGLShadowMap + WebGPU
  // ShadowNode both honour LightShadow.autoUpdate/needsUpdate per-light). The animate loop instead
  // flags needsUpdate from the centralized fixed/cycling policy below.
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  const moon = new THREE.DirectionalLight(0x9fb7ff, 0.55);
  moon.position.set(55, 42, -42);
  // Moon does NOT cast shadows: a second full shadow pass every frame for a 0.55-intensity fill light
  // was pure GPU cost with almost no visible shadow contribution. The sun shadow carries the scene.
  moon.castShadow = false;
  const hemisphere = new THREE.HemisphereLight(0xb6ccff, 0x3d5332, 2.25);
  scene.add(sun, sun.target, moon, hemisphere);

  const visitor = createVisitorMesh(useWebGPU);
  // Chunked worlds place origin at a CORNER, so spawn at the world centre (from the manifest bounds)
  // to land in the middle of the tiled plane; non-chunked special worlds use the compatibility spawn.
  // The raw centre can land on a tiny hill surrounded by sea — search outward from it for solid, roomy
  // land first. Uses analytic large-world height (deterministic, available before any chunk streams in).
  const spawnGroundHeight = (x: number, z: number): number => {
    const h = largeWorldBaseHeight(x, z);
    return Number.isFinite(h) ? h : SEA_LEVEL - 10;
  };
  const isSpawnableLand = (x: number, z: number): boolean => {
    const h = spawnGroundHeight(x, z);
    return h > SEA_LEVEL + 1.2 && largeWorldTerrainKind(x, z, h) !== "water";
  };
  // Roomy = the point AND its neighbours a chunk away are all land, so we don't spawn on a one-tile islet.
  const isRoomySpawnLand = (x: number, z: number): boolean =>
    isSpawnableLand(x, z) &&
    isSpawnableLand(x + CHUNK_SPAN, z) &&
    isSpawnableLand(x - CHUNK_SPAN, z) &&
    isSpawnableLand(x, z + CHUNK_SPAN) &&
    isSpawnableLand(x, z - CHUNK_SPAN);
  const findSpawnLand = (cx: number, cz: number): { x: number; z: number } => {
    if (isRoomySpawnLand(cx, cz)) return { x: cx, z: cz };
    // Two passes over expanding rings: prefer roomy land, then accept any solid land.
    for (const wantRoomy of [true, false]) {
      for (let ring = 1; ring <= 24; ring++) {
        const radius = ring * CHUNK_SPAN;
        const samples = Math.max(8, ring * 6);
        for (let s = 0; s < samples; s++) {
          const angle = (s / samples) * Math.PI * 2;
          const x = cx + Math.cos(angle) * radius;
          const z = cz + Math.sin(angle) * radius;
          if (wantRoomy ? isRoomySpawnLand(x, z) : isSpawnableLand(x, z)) return { x, z };
        }
      }
    }
    return { x: cx, z: cz }; // all-water fallback: keep the centre
  };
  const chunkedCenter = chunkedWorldCenter();
  let visitorPosition = chunkedCenter
    ? (() => {
        const spawn = isChunked ? findSpawnLand(chunkedCenter.x, chunkedCenter.z) : chunkedCenter;
        return groundedPosition(spawn.x, spawn.z);
      })()
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
  const lastPondRipplePosition = { x: visitorPosition.x, z: visitorPosition.z };
  let lastPondRippleAt = Number.NEGATIVE_INFINITY;
  let pointWalkTarget: Vec3 | null = null;
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
  // Mirror diagnostics (smoke tests / console): mirrors are permanently static glass.
  window.__tellusMirrorDebug = () => {
    let glass = 0;
    for (const mesh of generatedMeshes.values()) {
      if (mesh.userData.mirrorGlass) glass++;
    }
    return { live: 0, glass, liveCap: 0, trackedLive: 0 };
  };
  window.__tellusWorldDebug = (sampleX = visitorPosition.x, sampleZ = visitorPosition.z) => ({
    worldId: runtimeConfig.worldId,
    runtimeTemplate: parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
    runtimeSkyboxUrl: runtimeConfig.skyboxUrl,
    renderer: {
      backend: useWebGPU ? "webgpu" : "webgl",
      preference: rendererPreference ?? "default",
      navigatorGpu: "gpu" in navigator,
      prefersOriginalTellusIslandRenderer,
    },
    chunkedWorldChunks: getChunkedWorldChunks(),
    terrainMode: {
      isChunked,
      isContinentalChunkedWorld,
    },
    point: {
      x: sampleX,
      z: sampleZ,
      visitorY: visitorPosition.y,
      sampled: sampleMapPoint(sampleX, sampleZ),
      analyticHeight: largeWorldBaseHeight(sampleX, sampleZ),
      renderedHeight: renderedTerrainHeightAt(sampleX, sampleZ),
      chunkStats: chunkRenderer?.stats(),
    },
    water: {
      oceanVisible: ocean.visible,
      archipelagoVisible: archipelago.visible,
      pondWaterVisible: pondWater.visible,
      pondMaterial: (() => {
        const surface = pondWater.getObjectByName("tellus-pond-surface");
        return surface instanceof THREE.Mesh
          ? Array.isArray(surface.material)
            ? surface.material.map((material) => material.type)
            : surface.material.type
          : undefined;
      })(),
      pondSimulation: Boolean(pondWater.userData.pondRippleSimulation),
      pondPendingDrops: Number(pondWater.userData.pondRippleSimulation?.pendingDropCount ?? 0),
      oceanMaterial: Array.isArray(ocean.material)
        ? ocean.material.map((material) => material.type)
        : ocean.material.type,
      oceanShaderVariant: Array.isArray(ocean.material)
        ? ocean.material.map((material) => material.userData.tellusWaterShaderVariant)
        : ocean.material.userData.tellusWaterShaderVariant,
      oceanShoreCenter:
        !Array.isArray(ocean.material) &&
        ocean.material instanceof THREE.ShaderMaterial &&
        ocean.material.uniforms.uShoreCenter?.value
          ? {
              x: ocean.material.uniforms.uShoreCenter.value.x,
              y: ocean.material.uniforms.uShoreCenter.value.y,
            }
          : undefined,
      oceanTransparent: Array.isArray(ocean.material)
        ? ocean.material.some((material) => material.transparent)
        : ocean.material.transparent,
    },
  });
  window.__tellusAssetLodUrls = (assetIdOrUrl: string) => {
    const assetId =
      assetStoreIdFromModelUrl(assetIdOrUrl) ??
      (assetIdOrUrl.trim() ? assetIdOrUrl.trim() : null);
    if (!assetId) return null;
    const urls = assetStoreOptimizedAssetUrls(assetId);
    return {
      assetId,
      gameOptimized: worldApiUrl(urls.gameOptimized),
      lod0: worldApiUrl(urls.lod0),
      lod1: worldApiUrl(urls.lod1),
      lod2: worldApiUrl(urls.lod2),
      impostor: worldApiUrl(urls.impostor),
    };
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
        modelUrl: thing.modelUrl,
        assetStoreModelId: thing.assetStoreModelId,
        loadedAssetRenderUrl:
          typeof mesh?.userData.loadedAssetRenderUrl === "string"
            ? (mesh.userData.loadedAssetRenderUrl as string)
            : undefined,
        loadedAssetLodLevel:
          typeof mesh?.userData.loadedAssetLodLevel === "number"
            ? (mesh.userData.loadedAssetLodLevel as number)
            : undefined,
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
  const rendererDiagnostics = () => {
    if (!renderer || !("info" in renderer)) return null;
    const info = (renderer as THREE.WebGLRenderer).info;
    let visibleMeshes = 0;
    let visibleShadowCasters = 0;
    let visibleShadowReceivers = 0;
    let reflectionCaptures = 0;
    let reflectionSkips = 0;
    scene.traverse((object) => {
      const reflectionState = object.userData.tellusReflectionState as
        | { captures?: number; skipped?: number }
        | undefined;
      reflectionCaptures += reflectionState?.captures ?? 0;
      reflectionSkips += reflectionState?.skipped ?? 0;
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.InstancedMesh)) return;
      let effectivelyVisible = object.visible;
      for (let parent = object.parent; effectivelyVisible && parent; parent = parent.parent) {
        effectivelyVisible = parent.visible;
      }
      if (!effectivelyVisible) return;
      visibleMeshes++;
      if (object.castShadow) visibleShadowCasters++;
      if (object.receiveShadow) visibleShadowReceivers++;
    });
    return {
      backend: useWebGPU ? "webgpu" : "webgl",
      preference: rendererPreference ?? "default",
      pixelRatio: renderer.getPixelRatio(),
      canvas: {
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        clientWidth: renderer.domElement.clientWidth,
        clientHeight: renderer.domElement.clientHeight,
      },
      context: {
        lost: rendererContextLostCount,
        restored: rendererContextRestoredCount,
        lastEvent: rendererContextLastEvent,
      },
      memory: {
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      render: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        points: info.render.points,
        lines: info.render.lines,
        reflectionCaptures,
        reflectionSkips,
      },
      programs: info.programs?.length ?? 0,
      gpuTiming: webGlGpuTimer
        ? {
            supported: true,
            failed: webGlGpuTimer.failed,
            lastMs: Math.round(webGlGpuTimer.lastMs * 10) / 10,
            averageMs: webGlGpuTimer.samples > 0
              ? Math.round((webGlGpuTimer.totalMs / webGlGpuTimer.samples) * 10) / 10
              : 0,
            maxMs: Math.round(webGlGpuTimer.maxMs * 10) / 10,
            samples: webGlGpuTimer.samples,
            pending: webGlGpuTimer.pending.length,
          }
        : { supported: false },
      scene: {
        visibleMeshes,
        visibleShadowCasters,
        visibleShadowReceivers,
      },
      shadows: shadowUpdates.diagnostics(),
      shadowCamera: shadowCameraFit,
    };
  };
  // DEV-ONLY perf readout: window.__tellusPerf() -> { fps, vegetation, procplants }.
  window.__tellusPerf = () => ({
    fps: fpsValue,
    frame: {
      frames: perfDiagnostics.frames,
      maxFrameMs: Math.round(perfDiagnostics.maxFrameMs * 10) / 10,
      slowFrame: perfDiagnostics.slowFrame,
      phases: {
        movementMs: Math.round(perfDiagnostics.phases.movementMs * 10) / 10,
        chunkTerrainMs: Math.round(perfDiagnostics.phases.chunkTerrainMs * 10) / 10,
        vegetationMs: Math.round(perfDiagnostics.phases.vegetationMs * 10) / 10,
        procplantsMs: Math.round(perfDiagnostics.phases.procplantsMs * 10) / 10,
        physicsMs: Math.round(perfDiagnostics.phases.physicsMs * 10) / 10,
        renderMs: Math.round(perfDiagnostics.phases.renderMs * 10) / 10,
        cameraMs: Math.round(perfDiagnostics.phases.cameraMs * 10) / 10,
        miscMs: Math.round(perfDiagnostics.phases.miscMs * 10) / 10,
        maxMovementMs: Math.round(perfDiagnostics.phases.maxMovementMs * 10) / 10,
        maxChunkTerrainMs: Math.round(perfDiagnostics.phases.maxChunkTerrainMs * 10) / 10,
        maxVegetationMs: Math.round(perfDiagnostics.phases.maxVegetationMs * 10) / 10,
        maxProcplantsMs: Math.round(perfDiagnostics.phases.maxProcplantsMs * 10) / 10,
        maxPhysicsMs: Math.round(perfDiagnostics.phases.maxPhysicsMs * 10) / 10,
        maxRenderMs: Math.round(perfDiagnostics.phases.maxRenderMs * 10) / 10,
        maxCameraMs: Math.round(perfDiagnostics.phases.maxCameraMs * 10) / 10,
        maxMiscMs: Math.round(perfDiagnostics.phases.maxMiscMs * 10) / 10,
      },
    },
    browser: {
      visibilityState: document.visibilityState,
      hidden: document.hidden,
      longTasks: perfDiagnostics.longTasks,
      heartbeat: perfDiagnostics.heartbeat,
    },
    motion: {
      maxPlayerStep: Math.round(perfDiagnostics.maxPlayerStep * 1000) / 1000,
      maxVerticalStep: Math.round(perfDiagnostics.maxVerticalStep * 1000) / 1000,
      maxCameraStep: Math.round(perfDiagnostics.maxCameraStep * 1000) / 1000,
      chunkPressure: chunkStreamPressure(),
      chunkSpeedScale: chunkMovementSpeedScale(),
      position: { ...visitorPosition },
    },
    chunkStreaming: {
      activeChanges: perfDiagnostics.chunkStreaming.activeChanges,
      deferredGrounding: perfDiagnostics.chunkStreaming.deferredGrounding,
      queuedGrounding: perfDiagnostics.chunkStreaming.queuedGrounding,
      lastGroundingMs: Math.round(perfDiagnostics.chunkStreaming.lastGroundingMs * 10) / 10,
      maxGroundingMs: Math.round(perfDiagnostics.chunkStreaming.maxGroundingMs * 10) / 10,
    },
    vegetation: vegetation.stats(),
    procplants: procplants.stats(),
    generatedAssets: generatedAssetPerfStats(),
    friendsPresence: {
      ...presenceRegistryDiagnostics(),
      relationships: friendsDiagnostics(),
      directMessages: directMessageDiagnostics(),
    },
    debug: {
      terrainOnly: terrainOnlyDebug(),
      lowGpu: lowGpuDebug(),
      renderEvery: renderEveryDebug(),
      frameDriver: frameDriverDebug(),
    },
    chunkTerrain: chunkRenderer?.stats() ?? null,
    physics: {
      ambientBodies: ambientPhysics.activeCount(),
      rapierSolids: rapierPhysics?.stats().solids ?? 0,
      rapierReady: rapierPhysics?.stats().ready ?? false,
    },
    renderer: rendererDiagnostics(),
    terrainTextures: terrainTextureDiagnostics(renderer, useWebGPU),
  });
  window.__tellusPerfReport = () => {
    const perf = window.__tellusPerf?.() as
      | {
          browser?: unknown;
          chunkStreaming?: unknown;
          frame?: { phases?: unknown; slowFrame?: unknown };
          chunkTerrain?: unknown;
          motion?: unknown;
          procplants?: unknown;
        }
      | undefined;
    const slowFrame = perf?.frame?.slowFrame as
      | {
          browser?: {
            recentLongTasks?: BrowserLongTask[];
            recentResources?: Array<{
              name: string;
              initiatorType: string;
              duration: number;
              transferSize?: number;
            }>;
          };
        }
      | undefined;
    return {
      chunkStreaming: perf?.chunkStreaming,
      phases: perf?.frame?.phases,
      chunkTerrain: perf?.chunkTerrain,
      motion: perf?.motion,
      procplants: perf?.procplants,
      slowFrame: perf?.frame?.slowFrame,
      longTasks: slowFrame?.browser?.recentLongTasks?.map((task) => ({
        name: task.name,
        startTime: task.startTime,
        duration: task.duration,
        attribution: task.attribution,
      })) ?? [],
      resources: slowFrame?.browser?.recentResources ?? [],
      browser: perf?.browser,
    };
  };
  window.__tellusPerfReset = () => {
    lastTime = performance.now();
    heartbeatLastAt = lastTime;
    fpsFrames = 0;
    fpsSampleStart = lastTime;
    fpsValue = 0;
    perfDiagnostics.maxFrameMs = 0;
    perfDiagnostics.slowFrame = null;
    perfDiagnostics.phases.maxMovementMs = 0;
    perfDiagnostics.phases.maxChunkTerrainMs = 0;
    perfDiagnostics.phases.maxVegetationMs = 0;
    perfDiagnostics.phases.maxProcplantsMs = 0;
    perfDiagnostics.phases.maxPhysicsMs = 0;
    perfDiagnostics.phases.maxRenderMs = 0;
    perfDiagnostics.phases.maxCameraMs = 0;
    perfDiagnostics.phases.maxMiscMs = 0;
    perfDiagnostics.longTasks.count = 0;
    perfDiagnostics.longTasks.last = null;
    perfDiagnostics.longTasks.worst = null;
    perfDiagnostics.heartbeat.lastGapMs = 0;
    perfDiagnostics.heartbeat.maxGapMs = 0;
    perfDiagnostics.heartbeat.count = 0;
    if (webGlGpuTimer) {
      webGlGpuTimer.lastMs = 0;
      webGlGpuTimer.maxMs = 0;
      webGlGpuTimer.totalMs = 0;
      webGlGpuTimer.samples = 0;
    }
    recentLongTasks.length = 0;
    return true;
  };

  const procPlantPlacementFromWorld = (
    placement: WorldProcPlantPlacement,
  ): Parameters<typeof procplants.placeManualPlant>[0] => ({
    id: placement.id,
    presetId: placement.presetId,
    seed: placement.seed >>> 0,
    x: placement.position.x,
    z: placement.position.z,
    scale: placement.scale,
  });
  const pendingProcPlantUpserts = new Map<string, number>();
  const RECENT_PROCPLANT_UPSERT_GRACE_MS = 15_000;

  const publishProcPlantPlacement = (placement: WorldProcPlantPlacement) => {
    if (!tellusWorldBackendAvailable) return;
    pendingProcPlantUpserts.set(placement.id, Date.now());
    const frame = {
      type: "procplant.upsert",
      visitorId,
      placement,
    };
    if (worldSocket?.readyState === WebSocket.OPEN) {
      worldSocket.send(JSON.stringify(frame));
      return;
    }
    void fetch(tellusWorldHttpUrl("action"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(frame),
    }).catch((error) => {
      console.warn("Tellus procplant sync failed", error);
    });
  };

  const THIRD_PERSON_ZOOM_MIN = 12;
  const THIRD_PERSON_ZOOM_DEFAULT = 28;
  const THIRD_PERSON_ZOOM_MAX = 42;
  let yaw = 0.72; // CAMERA orbit direction — changed only by right-drag look (and WASD's frame of reference)
  let avatarFacing = 0.72; // CHARACTER visual facing — turns toward actual movement, independent of camera
  let pitch = -0.28;
  let zoom = THIRD_PERSON_ZOOM_DEFAULT;
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
  const GENERATED_BUILDING_LOD_PROXY_NAME = "tellus-generated-building-lod-proxy";
  const generatedBuildingLodMaterials = {
    wall: new THREE.MeshStandardMaterial({ color: 0xb7aa8c, roughness: 0.88 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x5d5048, roughness: 0.9 }),
  };
  const generatedBuildingLodThreshold = () => {
    try {
      const configured = Number(window.localStorage.getItem("tellus.buildingLodDistance"));
      if (Number.isFinite(configured) && configured >= 24) return configured;
    } catch {
      // Use the camera-mode default when storage is unavailable.
    }
    return cameraMode === "third" ? 50 : 66;
  };
  const createGeneratedBuildingLodProxy = (model: THREE.Object3D) => {
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().makeEmpty();
    const inverseRoot = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const localMatrix = new THREE.Matrix4();
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object.userData.generatedBuildingLodProxy) return;
      const geometry = object.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox) return;
      localMatrix.multiplyMatrices(inverseRoot, object.matrixWorld);
      bounds.union(geometry.boundingBox.clone().applyMatrix4(localMatrix));
    });
    if (bounds.isEmpty()) return null;
    const size = bounds.getSize(new THREE.Vector3());
    if (size.x <= 0.01 || size.y <= 0.01 || size.z <= 0.01) return null;
    const center = bounds.getCenter(new THREE.Vector3());
    const proxy = new THREE.Group();
    proxy.name = GENERATED_BUILDING_LOD_PROXY_NAME;
    proxy.userData.generatedBuildingLodProxy = true;
    const bodyHeight = Math.max(0.1, size.y * 0.72);
    const roofHeight = Math.max(0.08, size.y - bodyHeight);
    const bottomY = bounds.min.y;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, bodyHeight, size.z),
      generatedBuildingLodMaterials.wall,
    );
    body.position.set(center.x, bottomY + bodyHeight / 2, center.z);
    body.castShadow = false;
    body.receiveShadow = true;
    body.userData.generatedBuildingLodProxy = true;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(size.x, size.z) * 0.72, roofHeight, 4),
      generatedBuildingLodMaterials.roof,
    );
    roof.position.set(center.x, bottomY + bodyHeight + roofHeight / 2, center.z);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = false;
    roof.receiveShadow = true;
    roof.userData.generatedBuildingLodProxy = true;
    proxy.add(body, roof);
    proxy.visible = false;
    return proxy;
  };
  const ensureGeneratedBuildingLodProxy = (thing: GeneratedThing, model: THREE.Object3D) => {
    if (!thing.modelUrl || !parseProceduralModelUrl(thing.modelUrl)?.building) return;
    if (model.getObjectByName(GENERATED_BUILDING_LOD_PROXY_NAME)) return;
    const proxy = createGeneratedBuildingLodProxy(model);
    if (proxy) model.add(proxy);
  };
  const updateGeneratedBuildingLod = (thing: GeneratedThing, mesh: THREE.Object3D) => {
    const proxy = mesh.getObjectByName(GENERATED_BUILDING_LOD_PROXY_NAME);
    if (!proxy) return;
    const distance = distance2D(visitorPosition, thing.position);
    const useProxy =
      selectedThingId !== thing.id &&
      !interiorObject &&
      distance > generatedBuildingLodThreshold();
    proxy.visible = useProxy;
    for (const child of mesh.children) {
      if (child === proxy) continue;
      child.visible = !useProxy;
    }
  };
  const FIRST_PERSON_EYE_HEIGHT = 2.4; // matches poseAgentPovCamera's avatar head height (× scale)
  // The eye rides the avatar's CURRENT (lerped) user scale — a giant sees from a giant's head.
  const firstPersonEyeHeight = () => {
    if (!interiorObject) return FIRST_PERSON_EYE_HEIGHT * getAvatarUserScale(visitor);
    const bounds =
      interiorObject.children[0]?.userData.placementBounds ??
      interiorObject.userData.placementBounds;
    const levelHeight =
      typeof bounds?.levelHeight === "number" && Number.isFinite(bounds.levelHeight)
        ? bounds.levelHeight
        : 4;
    return Math.min(1.72, Math.max(1.2, levelHeight - 0.55));
  };
  const applyCameraModeVisibility = () => {
    // Whole-group toggle: body + TV + marker. Remote meshes are per-client, so this is local-only.
    visitor.visible = cameraMode !== "first";
  };
  let updateCameraNow: (() => void) | null = null;
  const setCameraMode = (mode: CameraMode, options: { persist?: boolean } = {}) => {
    if (mode === cameraMode) return;
    cameraMode = mode;
    if (options.persist !== false) {
      try {
        window.localStorage.setItem(CAMERA_MODE_STORAGE_KEY, mode);
      } catch {
        /* private mode — the selection just won't persist */
      }
    }
    applyCameraModeVisibility();
    updateCameraNow?.();
    // Let the React HUD (the toolbelt Eye button) track mode flips that originate here (V key).
    window.dispatchEvent(new CustomEvent("tellus:camera-mode", { detail: mode }));
  };
  applyCameraModeVisibility(); // honor a persisted "first" from the very first frame
  let isDragging = false;
  // Control scheme: click-to-move primary + right-drag to look (chosen by the operator).
  //  • orbitEligible  = this press may turn the camera (RIGHT mouse button, or any touch — mobile has
  //    no right button). Plain LEFT-drag is intentionally inert (reserved for future box-select).
  //  • tapEligible    = a short press may walk-to/select (LEFT button, or touch). Right-clicks never
  //    walk or select; they only look.
  let orbitEligible = false;
  let tapEligible = false;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTravel = 0;
  let terrainBrushMode: TerrainEditMode | null = null;
  let terrainPaintBrushRadius = TERRAIN_SCULPT_RADIUS * WORLD_SCALE * 0.68;
  let vegetationBrushArchetypeId: string | null = null;
  let vegetationBrushMode: "single" | "multi" = "single";
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const terrainBrushPreviewBaseRadius = TERRAIN_SCULPT_RADIUS * WORLD_SCALE * 0.68;
  const terrainBrushPreviewMaterial = new THREE.MeshBasicMaterial({
    color: 0xffef9a,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const terrainBrushPreview = new THREE.Mesh(
    new THREE.RingGeometry(terrainBrushPreviewBaseRadius * 0.96, terrainBrushPreviewBaseRadius, 96),
    terrainBrushPreviewMaterial,
  );
  terrainBrushPreview.name = "tellus-terrain-brush-preview";
  terrainBrushPreview.rotation.x = -Math.PI / 2;
  terrainBrushPreview.renderOrder = 80;
  terrainBrushPreview.visible = false;
  scene.add(terrainBrushPreview);
  const pointWalkMarkerRadius = 1.15 * WORLD_SCALE;
  const pointWalkMarker = new THREE.Group();
  pointWalkMarker.name = "tellus-point-walk-marker";
  const pointWalkMarkerRing = new THREE.Mesh(
    new THREE.RingGeometry(pointWalkMarkerRadius * 0.72, pointWalkMarkerRadius, 72),
    new THREE.MeshBasicMaterial({
      color: 0xffef9a,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  pointWalkMarkerRing.rotation.x = -Math.PI / 2;
  pointWalkMarkerRing.renderOrder = 78;
  const pointWalkMarkerDot = new THREE.Mesh(
    new THREE.CircleGeometry(pointWalkMarkerRadius * 0.18, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffef9a,
      transparent: true,
      opacity: 0.75,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  pointWalkMarkerDot.rotation.x = -Math.PI / 2;
  pointWalkMarkerDot.renderOrder = 79;
  pointWalkMarker.add(pointWalkMarkerRing, pointWalkMarkerDot);
  pointWalkMarker.visible = false;
  scene.add(pointWalkMarker);
  const hideTerrainBrushPreview = () => {
    terrainBrushPreview.visible = false;
  };
  const activeBrushRadius = (): number => {
    if (vegetationBrushArchetypeId) {
      const option = proceduralAssetOption(vegetationBrushArchetypeId);
      if (vegetationBrushMode === "multi") return Math.max(3.2 * WORLD_SCALE, (option?.radius ?? 12) * 0.55);
      return 0.42 * WORLD_SCALE;
    }
    if (terrainBrushMode) return terrainPaintBrushRadius;
    return TERRAIN_SCULPT_RADIUS * WORLD_SCALE;
  };
  const syncTerrainBrushPreviewStyle = () => {
    const radius = activeBrushRadius();
    terrainBrushPreview.scale.setScalar(radius / terrainBrushPreviewBaseRadius);
    terrainBrushPreviewMaterial.color.setHex(vegetationBrushArchetypeId ? 0x9ff7b8 : 0xffef9a);
  };
  const clearPointWalkTarget = () => {
    pointWalkTarget = null;
    pointWalkMarker.visible = false;
  };
  const setPointWalkTarget = (target: Vec3) => {
    pointWalkTarget = target;
    pointWalkMarker.position.set(target.x, target.y + 0.1, target.z);
    pointWalkMarker.visible = true;
  };
  const isPointerFromUi = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement &&
    Boolean(target.closest("button, input, select, textarea, .tool-card"));

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
    portals: worldPortals.map((p) => ({
      ...p,
      position: { ...p.position },
      anchorOffset: p.anchorOffset ?? (p.anchorThingId ? portalAnchorOffsets.get(p.id) : undefined),
      target: { ...p.target },
    })),
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
        return { height, kind, loaded: true };
      }
      return {
        height: isContinentalChunkedWorld ? largeWorldBaseHeight(x, z) : SEA_LEVEL - 8,
        // Unknown streamed terrain is not water. `loaded: false` lets the minimap render a neutral
        // placeholder until the chunk arrives without promising a lake that later turns into land.
        kind: isContinentalChunkedWorld ? largeWorldTerrainKind(x, z) : "meadow",
        loaded: false,
      };
    }
    const height = terrainHeight(x, z);
    return { height, kind: terrainKind(x, z, height), loaded: true };
  };

  const isAgentPlacementWater = (x: number, z: number): boolean => {
    if (interiorObject) return false;
    return isChunked ? isChunkedWaterPoint(x, z) : sampleMapPoint(x, z).kind === "water";
  };
  const requiresDryLand = (kind: GeneratedKind): boolean =>
    kind === "tree" ||
    kind === "flower" ||
    kind === "path" ||
    kind === "shrine" ||
    kind === "seed";

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
      if (remoteThings) {
        performance.mark("tellus:reconcileGeneratedSnapshot:start");
        reconcileGeneratedSnapshot(remoteThings);
        performance.mark("tellus:reconcileGeneratedSnapshot:end");
        performance.measure(
          "tellus:reconcileGeneratedSnapshot",
          "tellus:reconcileGeneratedSnapshot:start",
          "tellus:reconcileGeneratedSnapshot:end",
        );
      }
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
    configureCalmLakeBase(ocean.material);
    disposeMaterial(previousOceanMaterial);

    const rebuiltPond = createPondWater({
      center: waterFeatureCenter,
      radius: waterFeatureRadius,
      waterLevel: waterFeatureLevel(),
      animated: useWebGPU,
      simulated: usesSimulatedPondWater,
      baseSurface: !isChunked,
      waterSettings: runtimeConfig.waterSettings,
    });
    const disposePreviousPondSimulation = pondWater.userData.disposePondSimulation as
      | (() => void)
      | undefined;
    disposePreviousPondSimulation?.();
    for (const child of [...pondWater.children]) {
      pondWater.remove(child);
      disposeObject(child);
    }
    for (const child of [...rebuiltPond.children]) {
      rebuiltPond.remove(child);
      pondWater.add(child);
    }
    pondWater.userData = { ...rebuiltPond.userData };
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
    const paintCodes = terrain.geometry.getAttribute("tellusPaintCode") as THREE.BufferAttribute | undefined;
    const terrainKindCodes = terrain.geometry.getAttribute("tellusTerrainKindCode") as THREE.BufferAttribute | undefined;
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
        const kind = inside ? terrainKind(px, pz, py) : "rock";
        const color = terrainVertexColor(
          kind,
          px,
          pz,
          xIndex * 1009 + zIndex * 9176,
        );
        colors.setXYZ(index, color.r, color.g, color.b);
        const painted = inside ? centralTerrainPaintAt(px, pz) : null;
        paintCodes?.setX(index, painted ? terrainPaintCode(painted) : 0);
        terrainKindCodes?.setX(index, terrainKindCode(kind));
      }
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    if (paintCodes) paintCodes.needsUpdate = true;
    if (terrainKindCodes) terrainKindCodes.needsUpdate = true;
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
    const paintCodes = terrain.geometry.getAttribute("tellusPaintCode") as THREE.BufferAttribute | undefined;
    const terrainKindCodes = terrain.geometry.getAttribute("tellusTerrainKindCode") as THREE.BufferAttribute | undefined;
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
        const kind = inside ? terrainKind(px, pz, py) : "rock";
        const color = terrainVertexColor(
          kind,
          px,
          pz,
          xIndex * 1009 + zIndex * 9176,
        );
        const index = zIndex * renderRow + xIndex;
        colors.setXYZ(index, color.r, color.g, color.b);
        const painted = inside ? centralTerrainPaintAt(px, pz) : null;
        paintCodes?.setX(index, painted ? terrainPaintCode(painted) : 0);
        terrainKindCodes?.setX(index, terrainKindCode(kind));
      }
    }
    colors.needsUpdate = true;
    if (paintCodes) paintCodes.needsUpdate = true;
    if (terrainKindCodes) terrainKindCodes.needsUpdate = true;
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
      procplants.notifyTerrainChanged();
      return;
    }
    rebuildCentralTerrain();
    // Re-grow the procedural vegetation lazily wherever the terrain changed (local sculpt or remote
    // patch both funnel through here).
    vegetation.notifyTerrainChanged();
    procplants.notifyTerrainChanged();
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
    visitorPosition = groundedPositionForCurrentSurface(visitorPosition.x, visitorPosition.z, visitorPosition);
    for (const thing of generated) {
      if (!isFreeMovingVehicle(thing)) {
        groundThingToRenderedSurface(thing);
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

  const avatarIntentCategories = (intent: AnimationIntent): VrmaCategoryId[] => {
    switch (intent) {
      case "dance":
        return ["dance", "gesture", "other"];
      case "throw":
        return ["sport", "action", "gesture"];
      case "wave":
        return ["gesture", "core"];
      case "jump":
      case "walk":
      case "run":
      case "fly":
      case "swim":
        return ["locomotion", "sport", "core"];
      case "sit":
      case "stand":
      case "idle":
        return ["pose", "core", "locomotion"];
      case "mount":
      case "dismount":
        return ["locomotion", "pose", "core"];
      default:
        return ["gesture", "action", "sport", "core", "other"];
    }
  };

  const avatarClipNamesForIntent = (intent: AnimationIntent): string[] => {
    const seen = new Set<string>();
    const names: string[] = [];
    const add = (clipName: string) => {
      const key = clipName.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      names.push(clipName);
    };
    for (const category of avatarIntentCategories(intent)) {
      for (const clipName of emoteClipNamesByCategorySync(category, 80)) add(clipName);
    }
    for (const clipName of recommendedEmoteClipNamesSync(80)) add(clipName);
    return names;
  };

  const resolveAvatarAnimationName = (input: string, preferIntent = false): string => {
    const raw = input.trim();
    if (!raw) return "";
    const intent = normalizeAnimationIntent(raw) ?? inferAnimationIntentFromText(raw);
    const allNames = [
      ...recommendedEmoteClipNamesSync(100),
      ...(["core", "gesture", "dance", "action", "sport", "locomotion", "pose", "other"] as VrmaCategoryId[])
        .flatMap((category) => emoteClipNamesByCategorySync(category, 100)),
    ];
    const exact =
      allNames.find((name) => name === raw) ??
      allNames.find((name) => name.toLowerCase() === raw.toLowerCase());
    if (exact && !preferIntent) return exact;
    if (!intent) return raw;
    const candidates = avatarClipNamesForIntent(intent);
    const matched = selectAnimationClipByIntent(
      candidates.map((name) => ({ name })),
      intent,
      {
        actor: "avatar",
        metadataForClip: (clip) => vrmaMetadataForNameSync(clip.name),
        reject: (clip) => animationMetadataHasBlockingIssue(vrmaMetadataForNameSync(clip.name)),
      },
    );
    return matched?.name ?? exact ?? raw;
  };

  const playLocalAnimationIntent = (input: string): boolean => {
    const name = resolveAvatarAnimationName(input, true);
    return name ? playLocalEmote(name) : false;
  };

  const connectTellusWorldRealtime = async () => {
    if (!tellusWorldBackendAvailable || worldSocket || worldSocketConnecting || destroyed) return;
    worldSocketConnecting = true;
    let liveTicket: string | null = null;
    const ticketAbort = new AbortController();
    const ticketTimeout = window.setTimeout(() => ticketAbort.abort(), 5000);
    try {
      liveTicket = await issueTellusLiveTicket(visitorId, ticketAbort.signal);
    } catch {
      // Anonymous and temporarily unauthenticated worlds still use the existing soft-identity socket.
    } finally {
      window.clearTimeout(ticketTimeout);
    }
    if (worldSocket || destroyed || !tellusWorldBackendAvailable) {
      worldSocketConnecting = false;
      return;
    }
    let socket: WebSocket;
    try {
      socket = new WebSocket(tellusWorldWebSocketUrl(visitorId, liveTicket));
    } catch {
      worldSocketConnecting = false;
      return;
    }
    worldSocket = socket;
    worldSocketConnecting = false;

    socket.addEventListener("message", (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data)) as unknown;
      } catch {
        return;
      }
      if ((parsed as { type?: string } | null)?.type === "world.snapshot") {
        // Establish the active room before applying snapshot assets, so their first mount/ground pass
        // samples the interior floor instead of the outdoor terrain fallback.
        const sceneUrl = (parsed as { sceneUrl?: unknown }).sceneUrl;
        if (typeof sceneUrl === "string" && sceneUrl) {
          profileInteriorSceneUrl = sceneUrl;
          applyInterior(sceneUrl);
        } else if (runtimeConfig.worldId.startsWith("interior-") && !interiorObject) {
          applyInterior(profileInteriorSceneUrl || GENERATED_INTERIOR_SCENE_URL);
        } else if (
          interiorObject &&
          !runtimeConfig.worldId.startsWith("interior-") &&
          !profileInteriorSceneUrl
        ) {
          exitInterior();
        }
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
      const wildlifeSnapshot = wildlifeSnapshotFromWorldPatch(parsed);
      if (wildlifeSnapshot) {
        const previouslyConfigured = new Set(wildlifeConfigs.keys());
        wildlifeConfigs.clear();
        wildlifeInterpolation.clear();
        wildlifeTiers.clear();
        for (const config of wildlifeSnapshot.animals) wildlifeConfigs.set(config.animalId, config);
        for (const config of wildlifeSnapshot.animals) {
          previouslyConfigured.delete(config.animalId);
          if (config.enabled) uninstanceThing(config.animalId);
          else {
            const mesh = generatedMeshes.get(config.animalId);
            if (mesh) mesh.visible = true;
          }
        }
        for (const animalId of previouslyConfigured) {
          const mesh = generatedMeshes.get(animalId);
          if (mesh) mesh.visible = true;
          wildlifeLastIntents.delete(animalId);
        }
        const byHerd = new Map<string, typeof wildlifeSnapshot.states>();
        for (const state of wildlifeSnapshot.states) {
          const states = byHerd.get(state.herdId) ?? [];
          states.push(state);
          byHerd.set(state.herdId, states);
        }
        const serverTime = new Date().toISOString();
        for (const [herdId, states] of byHerd) {
          wildlifeInterpolation.applyPatch({
            type: "wildlife.patch",
            seq: Math.max(1, ...states.map((state) => state.revision)),
            serverTime,
            herdId,
            animals: states.map((state) => ({
              id: state.animalId,
              position: state.position,
              rotationY: state.rotationY,
              state: state.state,
              animationIntent: state.animationIntent,
              speedMetersPerSecond: state.speedMetersPerSecond,
              revision: state.revision,
            })),
          });
        }
      }
      const wildlifePatch = wildlifePatchFromWorldPatch(parsed);
      if (wildlifePatch) {
        // Hyades keeps durable configuration on the per-herd grain. A client which was already connected when
        // another owner configured the herd may see its first semantic patch before a fresh snapshot; hydrate a
        // conservative deer config so the authoritative movement is still rendered and animated immediately.
        for (const animal of wildlifePatch.animals) {
          if (wildlifeConfigs.has(animal.id)) continue;
          const thing = thingById(animal.id);
          wildlifeConfigs.set(animal.id, {
            animalId: animal.id,
            enabled: true,
            speciesProfileId: DEER_WILDLIFE_PROFILE.id,
            movementMode: DEER_WILDLIFE_PROFILE.movementMode,
            herdId: wildlifePatch.herdId,
            home: {
              kind: "circle",
              center: { x: thing?.position.x ?? animal.position.x, z: thing?.position.z ?? animal.position.z },
              radiusMeters: 48,
            },
            seed: Math.abs([...animal.id].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 17)),
            populationEligible: true,
            revision: animal.revision,
          });
          uninstanceThing(animal.id);
        }
        wildlifeInterpolation.applyPatch(wildlifePatch);
      }
      const configuredWildlife = wildlifeConfiguredFromWorldPatch(parsed);
      if (configuredWildlife) {
        for (const config of configuredWildlife) {
          wildlifeConfigs.set(config.animalId, config);
          if (config.enabled) uninstanceThing(config.animalId);
          else {
            const mesh = generatedMeshes.get(config.animalId);
            if (mesh) mesh.visible = true;
            wildlifeTiers.delete(config.animalId);
            wildlifeLastIntents.delete(config.animalId);
          }
        }
      }
      const remoteProcPlants = procPlantPlacementsFromWorldPatch(parsed);
      if (remoteProcPlants) {
        const placements = remoteProcPlants.map(procPlantPlacementFromWorld);
        if ((parsed as { type?: string } | null)?.type === "world.snapshot") {
          const remoteIds = new Set(placements.map((placement) => placement.id));
          const localPending = new Map(procplants.manualPlantPlacements().map((placement) => [placement.id, placement]));
          const nowMs = Date.now();
          for (const [id, sentAt] of [...pendingProcPlantUpserts]) {
            if (remoteIds.has(id) || nowMs - sentAt > RECENT_PROCPLANT_UPSERT_GRACE_MS) {
              pendingProcPlantUpserts.delete(id);
              continue;
            }
            const placement = localPending.get(id);
            if (placement) placements.push(placement);
          }
          procplants.replaceManualPlants(placements);
        } else {
          for (const placement of placements) {
            pendingProcPlantUpserts.delete(placement.id);
            procplants.placeManualPlant(placement);
          }
        }
      }
      const deletedProcPlant = procPlantDeletedFromWorldPatch(parsed);
      if (deletedProcPlant) {
        pendingProcPlantUpserts.delete(deletedProcPlant);
        procplants.removeManualPlant(deletedProcPlant);
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
        // Phase 4: a tiles world carries a tileSetUrl → mount the 3D tileset as the render substrate.
        const tileUrl = (parsed as { tileSetUrl?: unknown }).tileSetUrl;
        if (typeof tileUrl === "string" && tileUrl) mountTileset(tileUrl);
        // Biomes: the snapshot carries the FULL biome set (seed/converged). Reset the local grid from it
        // (authoritative — clears stale biomes on a world switch) so the map/HUD show biomes immediately
        // instead of waiting up to 10 min for the next diff tick. Live world.biome.patch then merges deltas.
        worldBiomeCells.clear();
        const snapshotBiomes = biomeCellsFromSnapshot(parsed);
        worldBiomeGridAuthoritative = snapshotBiomes !== null;
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
        portalAnchorOffsets.delete(portalDeleted);
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
        if (parsed.actionType === "terrain.sculpt") {
          chunkRenderer?.discardLocalPaint();
        }
        if (parsed.actionType === "world.portal.upsert" || parsed.actionType === "portal.upsert") {
          const rejectedPendingIds = new Set(pendingPortalIds);
          pendingPortalIds.clear();
          pendingPortalStartedAt.clear();
          pendingPortalWarnedIds.clear();
          for (const id of rejectedPendingIds) portalAnchorOffsets.delete(id);
          worldPortals = worldPortals.filter((p) => !rejectedPendingIds.has(p.id));
          syncPortalMarkers();
        }
        if (parsed.actionType === "world.portal.delete" || parsed.actionType === "portal.delete") {
          for (const portal of pendingDeletedPortals.values()) {
            if (portal.anchorThingId && portal.anchorOffset) {
              portalAnchorOffsets.set(portal.id, { ...portal.anchorOffset });
            }
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
        worldBiomeGridAuthoritative = true;
        for (const c of biomeCells) worldBiomeCells.set(`${c.cx}:${c.cz}`, c);
        procplants.notifyRegionsChanged(biomeCells.map((cell) => worldBiomeCellBounds(cell.cx, cell.cz, {
          chunkedWorldChunks: chunkedDims,
          worldRadius: WORLD_RADIUS,
        })));
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
        void connectTellusWorldRealtime();
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
    _paintCode: number,
    _center: Vec3,
  ): boolean => {
    void xIndex;
    void zIndex;
    return falloff >= 0.18;
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
          const brushRadius = terrainPaintBrushRadius / WORLD_SCALE;
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
      // The central brush radius is user-controlled and already scaled to the active world.
      const brushRadius = terrainPaintBrushRadius;
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
      visitorPosition = groundedPositionForCurrentSurface(visitorPosition.x, visitorPosition.z, visitorPosition);
      for (const thing of generated) {
        if (!isFreeMovingVehicle(thing)) {
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
    if (isTerrainPaintMode(mode) && !chunkedWorldSupportsPaint(mode)) {
      addLog({
        agentId: "world",
        agentName: "Tellus",
        tool: "interact",
        text: `${mode} paint is not supported by this world's terrain server, so nothing was changed.`,
      });
      publish();
      return;
    }
    if (isTerrainPaintMode(mode)) {
      chunkRenderer?.applyLocalPaint(mode, center.x, center.z, terrainPaintBrushRadius);
    }
    const action = {
      type: "terrain.sculpt",
      visitorId,
      mode,
      center: { x: center.x, y: 0, z: center.z },
      radius: terrainPaintBrushRadius,
    };
    if (worldSocket?.readyState === WebSocket.OPEN) {
      worldSocket.send(JSON.stringify(action));
    } else {
      void fetch(tellusWorldHttpUrl("action"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      })
        .then(async (response) => {
          const patch = await response.json().catch(() => null) as unknown;
          if (
            !response.ok ||
            (isRecord(patch) && patch.type === "action.rejected")
          ) {
            const reason = isRecord(patch) && typeof patch.reason === "string"
              ? patch.reason
              : `HTTP ${response.status}`;
            throw new Error(reason);
          }
          const chunkUpdate = chunkUpdatedFromWorldPatch(patch);
          if (chunkUpdate) {
            chunkRenderer?.reloadChunk(chunkUpdate.chunkX, chunkUpdate.chunkZ);
          }
        })
        .catch((error) => {
          if (isTerrainPaintMode(mode)) chunkRenderer?.discardLocalPaint();
          const reason = error instanceof Error ? error.message : String(error);
          console.warn("Tellus chunked sculpt failed", error);
          addLog({
            agentId: "world",
            agentName: "Tellus",
            tool: "interact",
            text: `Terrain edit was not saved: ${reason}`,
          });
          publish();
        });
    }
    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "interact",
      text: `${isTerrainPaintMode(mode) ? `paint ${mode}` : mode} terrain (chunked)`,
    });
  };

  const sculptTerrainAtWorldPoint = (mode: TerrainEditMode, center: Vec3) => {
    if (isChunked) {
      sendChunkedSculpt(mode, center);
      return;
    }
    sculptTerrainAt(mode, center, "visitor", "Visitor");
  };

  const setTerrainBrush = (mode: TerrainEditMode | null) => {
    terrainBrushMode = mode;
    if (mode) vegetationBrushArchetypeId = null;
    syncTerrainBrushPreviewStyle();
    if (!mode) hideTerrainBrushPreview();
  };

  const setTerrainBrushRadius = (radius: number) => {
    if (!Number.isFinite(radius)) return;
    terrainPaintBrushRadius = clamp(radius, 0.75 * WORLD_SCALE, 24 * WORLD_SCALE);
    syncTerrainBrushPreviewStyle();
  };

  const setVegetationBrush = (archetypeId: string | null, mode: "single" | "multi" = "single") => {
    vegetationBrushArchetypeId = archetypeId && proceduralAssetOption(archetypeId) ? archetypeId : null;
    vegetationBrushMode = mode;
    if (vegetationBrushArchetypeId) terrainBrushMode = null;
    syncTerrainBrushPreviewStyle();
    if (!vegetationBrushArchetypeId) hideTerrainBrushPreview();
  };

  const sculptTerrain = (mode: TerrainEditMode) => {
    sculptTerrainAtWorldPoint(mode, visitorPosition);
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

  const staticTerrainSuppressesGeneratedVegetation = (thing: GeneratedThing): boolean => {
    if (staticTerrainAllowsAutoVegetation) return false;
    if (thing.kind === "tree" || thing.kind === "flower") return true;
    const parsed = parseProceduralModelUrl(thing.modelUrl ?? "");
    if (parsed?.procPlant) return true;
    if (
      thing.assetStoreModelId &&
      ASSET_BACKED_PROCPLANT_MODEL_ID_SET.has(thing.assetStoreModelId)
    ) {
      return true;
    }
    const label = `${thing.prompt} ${thing.modelUrl ?? ""}`.toLowerCase();
    return /\b(grass|tree|pine|spruce|fir|cedar|redwood|birch|oak|maple|cherry|palm|fern|flower|flora|shrub|bush|reed|sedge|agave|plant)\b/.test(label);
  };

  const removeGeneratedMeshOnly = (thingId: string) => {
    const mesh = generatedMeshes.get(thingId);
    if (!mesh) return;
    uninstanceThing(thingId);
    stopGeneratedAnimation(thingId);
    scene.remove(mesh);
    disposeObject(mesh);
    generatedMeshes.delete(thingId);
    syncTransformControls();
  };

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
    if (wildlifeConfigs.has(thing.id)) return false;
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
        inst.frustumCulled = true;
        inst.castShadow = true;
        inst.receiveShadow = true;
        inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        inst.userData.tellusInstancePool = modelUrl;
        // Hide all slots until they're filled (avoids stray identity-matrix copies at the origin).
        for (let i = 0; i < capacity; i += 1) {
          inst.setMatrixAt(i, INSTANCE_ZERO_MATRIX);
        }
        inst.instanceMatrix.needsUpdate = true;
        inst.count = 0;
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
        inst.frustumCulled = true;
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
      refreshInstancePoolBounds(pool);
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
      refreshInstancePoolBounds(pool);
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
        refreshInstancePoolBounds(pool);
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

  const metadataForGeneratedClip = (
    thing: GeneratedThing | undefined,
    clipName: string | undefined,
  ): AssetAnimationMetadata | undefined => {
    if (!thing?.animationClips || !clipName) return undefined;
    const wanted = clipName.trim().toLowerCase();
    if (!wanted) return undefined;
    return thing.animationClips.find((entry) => entry.name.trim().toLowerCase() === wanted);
  };

  const animationActorKindForThing = (
    thing: GeneratedThing | undefined,
    vehicle: VehicleMode | null = null,
  ): AnimationActorKind => {
    if (!thing) return "object";
    if (isMountThing(thing)) return "mount";
    if (isVehicleThing(thing) || vehicle) return "vehicle";
    const prompt = `${thing.kind ?? ""} ${thing.prompt ?? ""}`.toLowerCase();
    if (/\b(animal|horse|deer|bird|dog|cat|wolf|fox|tiger|lion|bear|unicorn|dragon|fish)\b/.test(prompt)) {
      return "animal";
    }
    return "object";
  };

  const selectGeneratedClip = (
    clips: THREE.AnimationClip[],
    thing: GeneratedThing | undefined,
    mode: GeneratedMotionMode,
    vehicle: VehicleMode | null = null,
    options: GeneratedClipOptions = {},
  ): THREE.AnimationClip | undefined => {
    if (clips.length === 0) return undefined;
    const preferred = options.preferredClipName?.trim();
    const preferredClip = preferred
      ? clips.find((clip) => clip.name === preferred) ??
        clips.find((clip) => clip.name.toLowerCase() === preferred.toLowerCase())
      : undefined;
    if (preferredClip) return preferredClip;
    const wanted = options.ignoreExplicit ? "" : thing?.animation?.trim();
    const wantedClip = wanted
      ? clips.find((c) => c.name === wanted) ??
        clips.find((c) => c.name?.toLowerCase() === wanted.toLowerCase())
      : undefined;
    if (wantedClip) return wantedClip;
    const rejectGeneratedClip = (clip: THREE.AnimationClip) =>
      badGeneratedClip(clip) || animationMetadataHasBlockingIssue(metadataForGeneratedClip(thing, clip.name));
    const findAny = (fragments: string[]) =>
      clips.find((clip) => generatedClipNameIncludes(clip, fragments) && !rejectGeneratedClip(clip));
    if ((mode === "walk" || mode === "run") && options.movementHints?.length) {
      const hintedMovement = findAny(options.movementHints);
      if (hintedMovement) return hintedMovement;
    }
    if (mode === "idle" && options.preferSit) {
      const seated = findAny(["sit", "sitting", "seated", "resting"]);
      if (seated) return seated;
    }
    const effectiveMode =
      (mode === "walk" || mode === "run") && vehicle === "air"
        ? "fly"
        : (mode === "walk" || mode === "run") && vehicle === "water"
          ? "swim"
          : mode;
    return (
      selectAnimationClipByIntent(clips, effectiveMode, {
        actor: animationActorKindForThing(thing, vehicle),
        metadataForClip: (clip) => metadataForGeneratedClip(thing, clip.name),
        reject: rejectGeneratedClip,
      }) ??
      (mode === "walk" ? findAny(["walk", "trot", "crawl", "creep", "slither"]) : undefined) ??
      (mode === "run" ? findAny(["run", "gallop", "canter", "dash"]) : undefined) ??
      findAny(["idle"]) ??
      findAny(["stand"]) ??
      findAny(["walk"]) ??
      clips.find((c) => !rejectGeneratedClip(c)) ??
      clips[0]
    );
  };

  const playGeneratedClip = (
    id: string,
    model: THREE.Object3D,
    mode: GeneratedMotionMode,
    vehicle: VehicleMode | null = null,
    options: GeneratedClipOptions = {},
  ): boolean => {
    const clips = generatedModelClips(model);
    const clip = selectGeneratedClip(clips, thingById(id), mode, vehicle, options);
    if (!clip) return false;
    let state = generatedAnimationMixers.get(id);
    if (!state) {
      state = { mixer: new THREE.AnimationMixer(model), mode };
      generatedAnimationMixers.set(id, state);
    }
    if (state.clipName === clip.name && state.mode === mode && state.action) return true;
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
    return true;
  };

  const playGeneratedIntent = (
    id: string,
    input: string,
    options: { persist?: boolean } = {},
  ): { ok: boolean; animation?: string; intent?: AnimationIntent; error?: string } => {
    const thing = thingById(id);
    if (!thing) return { ok: false, error: "No placed asset matched targetId" };
    const model = generatedMeshes.get(id);
    if (!model || model.userData.loadedModelUrl !== thing.modelUrl) {
      return { ok: false, error: "The target asset is not loaded yet" };
    }
    const raw = input.trim();
    if (!raw) return { ok: false, error: "Animation intent or clip name is required" };
    const intent = normalizeAnimationIntent(raw) ?? inferAnimationIntentFromText(raw) ?? undefined;
    const vrmRig = model.userData.vrmObjectRig as VrmObjectRig | undefined;
    let animation = raw;
    if (vrmRig) {
      const clips = vrmRig.clipNames().map((name) => ({ name }));
      const exact =
        clips.find((clip) => clip.name === raw) ??
        clips.find((clip) => clip.name.toLowerCase() === raw.toLowerCase());
      const selected = intent
        ? selectAnimationClipByIntent(clips, intent, {
            actor: animationActorKindForThing(thing, vehicleMode(thing)),
          })
        : exact;
      animation = selected?.name ?? exact?.name ?? raw;
      vrmRig.play(animation);
    } else {
      const clips = generatedModelClips(model);
      const selected = intent
        ? selectGeneratedClip(clips, thing, intent, vehicleMode(thing), { ignoreExplicit: true })
        : clips.find((clip) => clip.name === raw) ??
          clips.find((clip) => clip.name?.toLowerCase() === raw.toLowerCase());
      if (!selected) return { ok: false, error: "No matching animation clip is loaded for targetId" };
      animation = selected.name;
      const previousAnimation = thing.animation;
      thing.animation = animation;
      playGeneratedClip(id, model, intent ?? "idle", vehicleMode(thing));
      thing.animation = previousAnimation;
    }
    if (options.persist !== false && thing.animation !== animation) {
      thing.animation = animation;
      publishGeneratedThing(thing);
      publish();
    }
    return { ok: true, animation, intent };
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

  const petMovementHintsForThing = (thing: GeneratedThing): string[] => {
    const label = `${thing.prompt} ${thing.animation ?? ""} ${thing.modelUrl ?? ""}`.toLowerCase();
    if (/\b(snake|serpent|eel|worm|slug|slither)\b/.test(label)) {
      return ["slither", "crawl", "creep", "swim", "walk"];
    }
    if (/\b(bird|bat|butterfly|dragonfly|wing|winged|fly|flying|flap)\b/.test(label)) {
      return ["fly", "flying", "flap", "glide", "hover", "soar", "walk"];
    }
    if (/\b(fish|shark|dolphin|whale|ray|aquatic|swim|swimming)\b/.test(label)) {
      return ["swim", "swimming", "paddle", "float", "dive"];
    }
    return [];
  };

  const updatePetAnimation = (thing: GeneratedThing, mode: GeneratedMotionMode) => {
    if (petAnimationModes.get(thing.id) === mode) return;
    const model = generatedMeshes.get(thing.id);
    if (!model || model.userData.loadedModelUrl !== thing.modelUrl) return;
    playGeneratedClip(thing.id, model, mode, vehicleMode(thing), {
      ignoreExplicit: true,
      movementHints: mode === "idle" ? undefined : petMovementHintsForThing(thing),
      preferSit: mode === "idle",
    });
    petAnimationModes.set(thing.id, mode);
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
        }
        refreshInstancePoolBounds(pool);
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
  type ThingFootprint = {
    radius: number;
    height: number;
    width: number;
    depth: number;
    centerX: number;
    centerZ: number;
    source: "procedural-building" | "rendered";
  };
  const footprintCache = new Map<string, ThingFootprint>();

  const interiorPlacementBounds = (margin = 0): { minX: number; maxX: number; minZ: number; maxZ: number } | null => {
    const raw = interiorObject?.children[0]?.userData.placementBounds ?? interiorObject?.userData.placementBounds;
    if (!isRecord(raw)) return null;
    const minX = typeof raw.minX === "number" ? raw.minX + margin : null;
    const maxX = typeof raw.maxX === "number" ? raw.maxX - margin : null;
    const minZ = typeof raw.minZ === "number" ? raw.minZ + margin : null;
    const maxZ = typeof raw.maxZ === "number" ? raw.maxZ - margin : null;
    if (minX === null || maxX === null || minZ === null || maxZ === null) return null;
    return {
      minX: Math.min(minX, maxX),
      maxX: Math.max(minX, maxX),
      minZ: Math.min(minZ, maxZ),
      maxZ: Math.max(minZ, maxZ),
    };
  };

  const clampInteriorPlacementXZ = (x: number, z: number, margin = 0.65): { x: number; z: number } => {
    const bounds = interiorPlacementBounds(margin);
    if (!bounds) return { x, z };
    return {
      x: clamp(x, bounds.minX, bounds.maxX),
      z: clamp(z, bounds.minZ, bounds.maxZ),
    };
  };

  const interiorFloorHeightAt = (x: number, z: number, referenceY = visitorPosition.y): number | null => {
    if (!interiorObject) return null;
    const clamped = clampInteriorPlacementXZ(x, z);
    terrainRayOrigin.set(clamped.x, Math.max(referenceY + 4, 32), clamped.z);
    terrainRaycaster.set(terrainRayOrigin, terrainRayDirection);
    terrainRaycaster.far = Math.max(80, terrainRayOrigin.y + 12);
    const hits = terrainRaycaster.intersectObject(interiorObject, true);
    const maxFloorY = referenceY + 1.35;
    for (const h of hits) {
      const n = h.face?.normal;
      if (!n) continue;
      const worldN = n.clone().applyNormalMatrix(
        new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld),
      );
      if (worldN.y > 0.45 && h.point.y <= maxFloorY) return h.point.y;
    }
    return null;
  };

  const interiorFloorHeightCandidatesAt = (x: number, z: number): number[] => {
    if (!interiorObject) return [];
    const clamped = clampInteriorPlacementXZ(x, z);
    terrainRayOrigin.set(clamped.x, 32, clamped.z);
    terrainRaycaster.set(terrainRayOrigin, terrainRayDirection);
    terrainRaycaster.far = 80;
    const hits = terrainRaycaster.intersectObject(interiorObject, true);
    const floors: number[] = [];
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.collide !== true) continue;
      const n = h.face?.normal;
      if (!n) continue;
      const worldN = n.clone().applyNormalMatrix(
        new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld),
      );
      if (worldN.y <= 0.45) continue;
      if (!floors.some((y) => Math.abs(y - h.point.y) < 0.05)) {
        floors.push(h.point.y);
      }
    }
    return floors.sort((a, b) => a - b);
  };

  const interiorAnalyticFloorHeightAt = (x: number, z: number, referenceY = visitorPosition.y): number | null => {
    const raw = interiorObject?.children[0]?.userData.placementBounds ?? interiorObject?.userData.placementBounds;
    if (!isRecord(raw)) return null;
    const levels = typeof raw.levels === "number" && Number.isFinite(raw.levels)
      ? Math.max(1, Math.floor(raw.levels))
      : 1;
    const levelHeight = typeof raw.levelHeight === "number" && Number.isFinite(raw.levelHeight)
      ? Math.max(1, raw.levelHeight)
      : 4;
    if (levels <= 1) return 0;
    // Upper generated-room floors are mezzanines in the far (+Z) half. Ground-floor placement remains
    // valid everywhere, including under the open mezzanine void.
    const upperAccessible = z >= 0;
    const maxLevel = upperAccessible ? levels - 1 : 0;
    const nearestLevel = clamp(Math.round(referenceY / levelHeight), 0, maxLevel);
    return nearestLevel * levelHeight;
  };

  const interiorPlacementFloorHeightAt = (x: number, z: number, referenceY = visitorPosition.y): number | null => {
    const referenceFloorY = interiorFloorHeightAt(x, z, referenceY);
    const analyticFloorY = interiorAnalyticFloorHeightAt(x, z, referenceY);
    const candidates = interiorFloorHeightCandidatesAt(x, z);
    if (analyticFloorY !== null && candidates.length > 0) {
      const nearAnalytic = candidates
        .filter((y) => Math.abs(y - analyticFloorY) <= 0.65)
        .sort((a, b) => Math.abs(a - analyticFloorY) - Math.abs(b - analyticFloorY))[0];
      if (nearAnalytic !== undefined) return nearAnalytic;
    }
    if (
      analyticFloorY !== null &&
      referenceFloorY !== null &&
      Math.abs(referenceFloorY - analyticFloorY) > 1.35
    ) {
      return analyticFloorY;
    }
    return referenceFloorY ?? analyticFloorY ?? candidates[0] ?? null;
  };

  const interiorPlacementPosition = (x: number, z: number, referenceY = visitorPosition.y): Vec3 => {
    const clamped = clampInteriorPlacementXZ(x, z);
    return {
      ...clamped,
      y: interiorPlacementFloorHeightAt(clamped.x, clamped.z, referenceY) ?? Math.max(0, referenceY),
    };
  };

  const groundedPositionForCurrentSurface = (x: number, z: number, fallback?: Vec3): Vec3 =>
    interiorObject
      ? interiorPlacementPosition(x, z, fallback?.y ?? visitorPosition.y)
      : groundedPosition(x, z, fallback);

  const thingFootprint = (thing: GeneratedThing): ThingFootprint | null => {
    const proceduralModel = parseProceduralModelUrl(thing.modelUrl ?? "");
    const proceduralBuilding = proceduralModel?.building;
    const mesh = generatedMeshes.get(thing.id);
    const key = [
      thing.id,
      thing.modelUrl ?? "",
      mesh?.uuid ?? "missing",
      thing.scale.toFixed(3),
      (thing.rotationY ?? 0).toFixed(3),
    ].join(":");
    const cached = footprintCache.get(key);
    if (cached) return cached;
    if (!mesh) return null;
    const fitted = fittedModelDimensions(mesh);
    const box = fitted
      ? null
      : measureModelBounds(mesh); // skinning-aware fallback for models without stable fitted metadata
    if (!fitted && (!box || box.isEmpty())) return null;
    const size = fitted
      ? new THREE.Vector3(fitted.width, fitted.height, fitted.depth)
      : box!.getSize(new THREE.Vector3());
    const center = fitted
      ? mesh.getWorldPosition(new THREE.Vector3())
      : box!.getCenter(new THREE.Vector3());
    const fp: ThingFootprint = {
      radius: Math.max(size.x, size.z) / 2,
      height: size.y,
      width: size.x,
      depth: size.z,
      centerX: center.x,
      centerZ: center.z,
      source: proceduralBuilding ? "procedural-building" : "rendered",
    };
    footprintCache.set(key, fp);
    if (footprintCache.size > 600) footprintCache.clear();
    return fp;
  };

  const renderedTerrainHeightAt = (x: number, z: number, referenceY = visitorPosition.y): number | null => {
    if (interiorObject) return interiorPlacementFloorHeightAt(x, z, referenceY);
    terrainRayTargets.length = 0;
    if (terrain.visible) terrainRayTargets.push(terrain);
    const chunkTerrain = scene.getObjectByName("tellus-chunk-terrain");
    if (chunkTerrain) terrainRayTargets.push(chunkTerrain);
    if (terrainRayTargets.length === 0) return null;
    terrainRayOrigin.set(x, 480, z);
    terrainRaycaster.set(terrainRayOrigin, terrainRayDirection);
    terrainRaycaster.far = 780;
    const hit = terrainRaycaster.intersectObjects(terrainRayTargets, true)[0];
    return hit ? hit.point.y : null;
  };

  // Highest terrain height under a thing's footprint. With the wider terrain height variability,
  // grounding to the single CENTRE sample can leave a multi-tile object partly buried under higher
  // neighbouring terrain ("under the land even after the surface button") - sampling a ring at the
  // footprint radius and taking the MAX rests the object ON the surface instead of inside it. Returns
  // null only when no sample resolves (async terrain not loaded yet).
  const footprintGroundYAt = (
    thing: GeneratedThing,
    x: number,
    z: number,
    referenceY = interiorObject
      ? thing.position.y - groundRelativeOffset(thing.verticalOffset)
      : thing.position.y,
  ): number | null => {
    let bestRendered: number | null = renderedTerrainHeightAt(x, z, referenceY);
    let bestAnalytic = interiorObject
      ? interiorPlacementFloorHeightAt(x, z, referenceY)
      : groundHeightAt(x, z);
    const fp = thingFootprint(thing);
    const r = Math.min(fp?.radius ?? 0, 6);
    if (r >= 0.25) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const sx = x + Math.cos(a) * r;
        const sz = z + Math.sin(a) * r;
        const rendered = renderedTerrainHeightAt(sx, sz, referenceY);
        if (
          rendered !== null &&
          Number.isFinite(rendered) &&
          (bestRendered === null || rendered > bestRendered)
        ) {
          bestRendered = rendered;
        }
        const analytic = interiorObject
          ? interiorPlacementFloorHeightAt(sx, sz, referenceY)
          : groundHeightAt(sx, sz);
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

  const footprintGroundY = (thing: GeneratedThing): number | null =>
    footprintGroundYAt(thing, thing.position.x, thing.position.z);

  const placementSurfaceYForThing = (thing: GeneratedThing): number | null => {
    const mode = vehicleMode(thing);
    if (mode === "water") {
      return waterVehiclePositionForCurrentWorld(thing.position.x, thing.position.z).y;
    }
    if (mode === "air") {
      const cruise = airPosition(thing.position.x, thing.position.z);
      return cruise.y - DEFAULT_AIR_GROUND_RELATIVE_OFFSET;
    }
    return footprintGroundY(thing) ?? groundHeightAt(thing.position.x, thing.position.z);
  };

  const captureGroundRelativeOffsetFromPosition = (thing: GeneratedThing): boolean => {
    const surfaceY = placementSurfaceYForThing(thing);
    if (surfaceY === null || !Number.isFinite(surfaceY)) return false;
    thing.verticalOffset = groundRelativeOffsetFromSurface(thing.position.y, surfaceY);
    return true;
  };

  const interiorVisiblePlacementForThing = (thing: GeneratedThing): Vec3 => {
    const floorY =
      interiorPlacementFloorHeightAt(
        thing.position.x,
        thing.position.z,
        thing.position.y - groundRelativeOffset(thing.verticalOffset),
      ) ??
      Math.max(0, visitorPosition.y);
    return positionAtGroundRelativeOffset(thing.position, floorY, thing.verticalOffset);
  };

  const repairInteriorThingPosition = (thing: GeneratedThing): boolean => {
    if (!interiorObject || isFreeMovingVehicle(thing)) return false;
    const fixed = interiorVisiblePlacementForThing(thing);
    if (Math.abs(fixed.y - thing.position.y) <= 0.05) return false;
    thing.position = fixed;
    return true;
  };

  const runtimeProfileForThing = (
    thing: GeneratedThing,
    options: { mounted?: boolean } = {},
  ): WorldThingRuntimeProfile =>
    buildWorldThingRuntimeProfile(thing, {
      dimensions: thingFootprint(thing) ?? undefined,
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
    if (interiorObject) {
      placeObjectAboveGround(mesh, interiorVisiblePlacementForThing(thing), 0.04);
      refreshInstancedThingMatrix(thing);
      updateSelectionIndicator();
      return;
    }
    // Chunked worlds: the stored thing.position.y may have been grounded against the flat base
    // (sampleHeight returns null until the owning chunk streams in), so once the sculpted chunk loads
    // the asset would sit BELOW the surface. Re-sample the live rendered ground here so the model's
    // feet rest flush. Display-only — this function must NOT mutate thing.position (lift/lower/ground
    // commands set the authoritative y and call us to repaint; mutating here would fight them).
    // PERF: footprintGroundY does ~9 terrain RAYCASTS (+ a Box3
    // bounds traversal). They're ONLY needed to gate the chunked-world live reground below, so compute
    // them ONLY when isChunked. On legacy worlds this whole block was raycasting 9× per asset on every
    // updateThingMeshPosition (incl. once per asset during the load storm) and being thrown away — the
    // cause of the multi-second load freeze with many assets. Skip it entirely outside chunked worlds.
    const liveGround = isChunked ? footprintGroundY(thing) : null;
    const placeAt =
      liveGround !== null && Number.isFinite(liveGround)
        ? positionAtGroundRelativeOffset(thing.position, liveGround, thing.verticalOffset)
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
    if (rendered === null || !Number.isFinite(rendered)) return;
    thing.position = positionAtGroundRelativeOffset(
      thing.position,
      rendered,
      thing.verticalOffset,
    );
  };

  const regroundClassicTerrainActorsAndThings = () => {
    visitorPosition = groundedPositionForCurrentSurface(visitorPosition.x, visitorPosition.z, visitorPosition);
    for (const thing of generated) {
      if (!isFreeMovingVehicle(thing)) {
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
    procplants.notifyTerrainChanged();
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

  const GENERATED_ECHO_GUARD_MS = 12_000;
  const GENERATED_DELETE_TOMBSTONE_MS = 10 * 60_000;
  const pendingGeneratedUpserts = new Map<
    string,
    { updatedAtMs: number; signature: string; expiresAtMs: number }
  >();
  const pendingGeneratedDeletes = new Map<string, { deletedAtMs: number; expiresAtMs: number }>();

  const generatedUpdateTime = (thing: Pick<WorldGeneratedThing, "updatedAt">): number => {
    const ms = Date.parse(thing.updatedAt);
    return Number.isFinite(ms) ? ms : 0;
  };

  const worldGeneratedThing = (thing: GeneratedThing, updatedAt = new Date().toISOString()): WorldGeneratedThing => ({
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
    verticalOffset: groundRelativeOffset(thing.verticalOffset),
    vehicleMode: thing.vehicleMode,
    hasAnimations: thing.hasAnimations,
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
    // "" = explicit "not a pet". ABSENT from a mid-rollout server means "keep local value".
    petOwnerId: thing.petOwnerId ?? "",
    animationClips: thing.animationClips,
    updatedAt,
  });

  const roundedGeneratedNumber = (value: number | undefined): number =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.round(value * 1000) / 1000
      : 0;

  const generatedThingSignature = (thing: WorldGeneratedThing): string =>
    JSON.stringify({
      kind: thing.kind,
      prompt: thing.prompt,
      creatorId: thing.creatorId,
      ownerUserId: thing.ownerUserId ?? "",
      position: {
        x: roundedGeneratedNumber(thing.position.x),
        y: roundedGeneratedNumber(thing.position.y),
        z: roundedGeneratedNumber(thing.position.z),
      },
      rotationX: roundedGeneratedNumber(thing.rotationX),
      rotationY: roundedGeneratedNumber(thing.rotationY),
      rotationZ: roundedGeneratedNumber(thing.rotationZ),
      scale: roundedGeneratedNumber(thing.scale),
      color: thing.color,
      verticalOffset: roundedGeneratedNumber(thing.verticalOffset),
      vehicleMode: thing.vehicleMode ?? "",
      hasAnimations: thing.hasAnimations ?? false,
      assetStoreModelId: thing.assetStoreModelId ?? "",
      modelUrl: thing.modelUrl ?? "",
      pipelineId: thing.pipelineId ?? "",
      generationStatus: thing.generationStatus ?? "",
      animation: thing.animation ?? "",
      petOwnerId: thing.petOwnerId ?? "",
    });

  const pruneGeneratedEchoGuards = (nowMs = Date.now()) => {
    for (const [id, pending] of pendingGeneratedUpserts) {
      if (pending.expiresAtMs <= nowMs) pendingGeneratedUpserts.delete(id);
    }
    for (const [id, pending] of pendingGeneratedDeletes) {
      if (pending.expiresAtMs <= nowMs) pendingGeneratedDeletes.delete(id);
    }
  };

  const markGeneratedDeletePending = (id: string, deletedAtMs = Date.now()) => {
    pendingGeneratedUpserts.delete(id);
    pendingGeneratedDeletes.set(id, {
      deletedAtMs,
      expiresAtMs: deletedAtMs + GENERATED_DELETE_TOMBSTONE_MS,
    });
  };

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
    const updatedAt = new Date().toISOString();
    const wireThing = worldGeneratedThing(thing, updatedAt);
    pendingGeneratedDeletes.delete(thing.id);
    pendingGeneratedUpserts.set(thing.id, {
      updatedAtMs: Date.parse(updatedAt),
      signature: generatedThingSignature(wireThing),
      expiresAtMs: Date.now() + GENERATED_ECHO_GUARD_MS,
    });
    if (!tellusWorldBackendAvailable) return;
    const action = {
      type: "generated.upsert",
      visitorId,
      thing: wireThing,
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

  const generatedModelLoadConcurrency = (): number => {
    try {
      const stored = Number(window.localStorage.getItem("tellus.generated.maxLoads"));
      if (Number.isFinite(stored) && stored > 0) return clamp(Math.round(stored), 1, 5);
    } catch {
      // Storage can be unavailable in private/embedded contexts; use the conservative default.
    }
    return 5;
  };
  const WORLD_MODEL_LOAD_PUMP_DELAY_MS = 120;
  const WORLD_MODEL_LOAD_MOTION_GRACE_MS = 800;
  let activeWorldModelLoads = 0;
  const worldModelLoadQueue: string[] = [];
  const queuedWorldModelLoads = new Set<string>();
  const worldModelLoadEnqueuedAt = new Map<string, number>();
  let worldModelLoadPumpScheduled = false;
  let lastWorldModelLoadMotionAt = Number.NEGATIVE_INFINITY;
  const generatedModelLoadStats = {
    enqueued: 0,
    started: 0,
    loaded: 0,
    failed: 0,
    retried: 0,
    totalMs: 0,
    lastMs: 0,
    maxMs: 0,
    lastQueueWaitMs: 0,
    totalQueueWaitMs: 0,
    lastUrl: "",
    lastRenderUrl: "",
    lodRequests: 0,
    lodFallbacks: 0,
  };

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

  type AssetStoreRenderLodLevel = 0 | 1 | 2;

  const assetStoreRenderLodLevelForThing = (thing: GeneratedThing): AssetStoreRenderLodLevel => {
    const dx = thing.position.x - visitorPosition.x;
    const dz = thing.position.z - visitorPosition.z;
    const distance = Math.hypot(dx, dz);
    const viewerFacing =
      distance > 0.001
        ? (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / distance
        : 1;
    return assetRenderLodLevel({
      kind: thing.kind,
      prompt: thing.prompt,
      distance,
      worldTemplate: activeWorldTemplate,
      isChunkedWorld: isChunked,
      selected: selectedThingId === thing.id,
      viewerFacing,
    });
  };

  const assetStoreRenderModelUrlForThing = (
    thing: GeneratedThing,
    canonicalModelUrl: string,
  ): {
    canonicalModelUrl: string;
    renderModelUrl: string;
    assetStoreModelId?: string;
    lodLevel?: AssetStoreRenderLodLevel;
  } => {
    const assetStoreModelId =
      thing.assetStoreModelId?.trim() || assetStoreIdFromModelUrl(canonicalModelUrl) || undefined;
    if (!assetStoreModelId) {
      return { canonicalModelUrl, renderModelUrl: canonicalModelUrl };
    }
    const lodLevel = assetStoreRenderLodLevelForThing(thing);
    return {
      canonicalModelUrl,
      renderModelUrl: assetStoreLodModelUrl(assetStoreModelId, lodLevel),
      assetStoreModelId,
      lodLevel,
    };
  };

  const loadGeneratedModelForThing = async (
    canonicalModelUrl: string,
    thing: GeneratedThing,
  ): Promise<THREE.Object3D> => {
    const resolved = assetStoreRenderModelUrlForThing(thing, canonicalModelUrl);
    const hasAssetStoreLod =
      resolved.assetStoreModelId && resolved.renderModelUrl !== resolved.canonicalModelUrl;
    if (hasAssetStoreLod) {
      generatedModelLoadStats.lodRequests += 1;
    }
    generatedModelLoadStats.lastRenderUrl = resolved.renderModelUrl;
    try {
      const model = await loadGeneratedModel(resolved.renderModelUrl, thing, useWebGPU);
      if (
        hasAssetStoreLod &&
        (thing.hasAnimations === true || (thing.animationClips?.length ?? 0) > 0) &&
        !generatedModelHasRuntimeAnimations(model)
      ) {
        generatedModelLoadStats.lodFallbacks += 1;
        const fallback = await loadGeneratedModel(resolved.canonicalModelUrl, thing, useWebGPU);
        fallback.userData.loadedModelUrl = resolved.canonicalModelUrl;
        fallback.userData.loadedAssetRenderUrl = resolved.canonicalModelUrl;
        fallback.userData.loadedAssetStoreModelId = resolved.assetStoreModelId;
        fallback.userData.loadedAssetLodLevel = undefined;
        fallback.userData.loadedAssetLodFallbackReason = "missing-animations";
        return fallback;
      }
      model.userData.loadedModelUrl = resolved.canonicalModelUrl;
      model.userData.loadedAssetRenderUrl = resolved.renderModelUrl;
      model.userData.loadedAssetStoreModelId = resolved.assetStoreModelId;
      model.userData.loadedAssetLodLevel = resolved.lodLevel;
      return model;
    } catch (error) {
      if (!hasAssetStoreLod) throw error;
      generatedModelLoadStats.lodFallbacks += 1;
      const fallback = await loadGeneratedModel(resolved.canonicalModelUrl, thing, useWebGPU);
      fallback.userData.loadedModelUrl = resolved.canonicalModelUrl;
      fallback.userData.loadedAssetRenderUrl = resolved.canonicalModelUrl;
      fallback.userData.loadedAssetStoreModelId = resolved.assetStoreModelId;
      fallback.userData.loadedAssetLodLevel = undefined;
      fallback.userData.loadedAssetLodFallbackError =
        error instanceof Error ? error.message : String(error);
      return fallback;
    }
  };

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
    const loadScore = (id: string) => {
      const thing = thingById(id);
      if (!thing) return Number.POSITIVE_INFINITY;
      const dx = thing.position.x - visitorPosition.x;
      const dz = thing.position.z - visitorPosition.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 0.001) return 0;
      const forwardX = Math.sin(yaw);
      const forwardZ = Math.cos(yaw);
      const facing = (dx * forwardX + dz * forwardZ) / distance;
      const behindPenalty = facing < -0.2 ? 18 : 0;
      const sidePenalty = facing < 0.25 ? 8 : 0;
      return distance + behindPenalty + sidePenalty;
    };
    worldModelLoadQueue.sort((a, b) => {
      if (selectedThingId === a) return -1;
      if (selectedThingId === b) return 1;
      return loadScore(a) - loadScore(b);
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
    if (
      worldModelLoadQueue.length > 0 &&
      activeWorldModelLoads === 0 &&
      (hasMovementKeyHeld() ||
        performance.now() - lastWorldModelLoadMotionAt < WORLD_MODEL_LOAD_MOTION_GRACE_MS)
    ) {
      scheduleWorldModelLoadPump();
      return;
    }
    const maxWorldModelLoads = generatedModelLoadConcurrency();
    while (activeWorldModelLoads < maxWorldModelLoads && worldModelLoadQueue.length > 0) {
      sortWorldModelLoadQueue();
      const id = worldModelLoadQueue.shift();
      if (!id) return;
      queuedWorldModelLoads.delete(id);
      const enqueuedAt = worldModelLoadEnqueuedAt.get(id);
      worldModelLoadEnqueuedAt.delete(id);
      const thing = thingById(id);
      if (!thing?.modelUrl || thing.generationStatus !== "ready") continue;
      if (staticTerrainSuppressesGeneratedVegetation(thing)) {
        removeGeneratedMeshOnly(thing.id);
        continue;
      }
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
      const loadStartedAt = performance.now();
      const queueWaitMs =
        typeof enqueuedAt === "number" ? Math.max(0, loadStartedAt - enqueuedAt) : 0;
      generatedModelLoadStats.started += 1;
      generatedModelLoadStats.lastQueueWaitMs = queueWaitMs;
      generatedModelLoadStats.totalQueueWaitMs += queueWaitMs;
      generatedModelLoadStats.lastUrl = modelUrl;
      void loadGeneratedModelForThing(modelUrl, thing)
        .then((model) => {
          const loadMs = Math.max(0, performance.now() - loadStartedAt);
          generatedModelLoadStats.loaded += 1;
          generatedModelLoadStats.totalMs += loadMs;
          generatedModelLoadStats.lastMs = loadMs;
          generatedModelLoadStats.maxMs = Math.max(generatedModelLoadStats.maxMs, loadMs);
          generatedModelLoadStats.lastUrl = modelUrl;
          const current = thingById(id);
          if (destroyed || !current || current.modelUrl !== modelUrl) {
            disposeObject(model);
            return;
          }
          if (staticTerrainSuppressesGeneratedVegetation(current)) {
            disposeObject(model);
            removeGeneratedMeshOnly(current.id);
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
          ensureGeneratedBuildingLodProxy(current, model);
          generatedMeshes.set(id, model);
          // A placeholder may have observed an authoritative intent before animation clips existed.
          // Clear that marker so the newly loaded model retries the current intent on the next frame.
          wildlifeLastIntents.delete(id);
          startGeneratedAnimation(id, model);
          scene.add(model);
          if (interiorObject && !isFreeMovingVehicle(current)) {
            placeObjectAboveGround(model, interiorVisiblePlacementForThing(current), 0.04);
          }
          updateThingMeshPosition(current);
          syncTransformControls();
          reevaluateInstanceGroup(modelUrl);
          publish();
        })
        .catch(async (error) => {
          const loadMs = Math.max(0, performance.now() - loadStartedAt);
          generatedModelLoadStats.failed += 1;
          generatedModelLoadStats.lastMs = loadMs;
          generatedModelLoadStats.maxMs = Math.max(generatedModelLoadStats.maxMs, loadMs);
          generatedModelLoadStats.lastUrl = modelUrl;
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
            generatedModelLoadStats.retried += 1;
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
    if (terrainOnlyDebug()) return;
    if (staticTerrainSuppressesGeneratedVegetation(thing)) {
      removeGeneratedMeshOnly(thing.id);
      queuedWorldModelLoads.delete(thing.id);
      worldModelLoadEnqueuedAt.delete(thing.id);
      return;
    }
    if (!thing.modelUrl || thing.generationStatus !== "ready") return;
    const currentMesh = generatedMeshes.get(thing.id);
    if (currentMesh?.userData.loadedModelUrl === thing.modelUrl) {
      return;
    }
    if (queuedWorldModelLoads.has(thing.id)) return;
    queuedWorldModelLoads.add(thing.id);
    worldModelLoadEnqueuedAt.set(thing.id, performance.now());
    generatedModelLoadStats.enqueued += 1;
    worldModelLoadQueue.push(thing.id);
    scheduleWorldModelLoadPump();
  };

  const ensureGeneratedVisual = (thing: GeneratedThing) => {
    if (staticTerrainSuppressesGeneratedVegetation(thing)) {
      removeGeneratedMeshOnly(thing.id);
      return;
    }
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
    pruneGeneratedEchoGuards();
    const healedPending = isStalePendingGeneratedThing(remote);
    const normalized = normalizeGeneratedThing(remote);
    const remoteUpdatedAt = generatedUpdateTime(normalized);
    const pendingDelete = pendingGeneratedDeletes.get(normalized.id);
    if (
      pendingDelete &&
      (remoteUpdatedAt === 0 || remoteUpdatedAt <= pendingDelete.deletedAtMs || Date.now() < pendingDelete.expiresAtMs)
    ) {
      return;
    }
    const existing = thingById(normalized.id);
    if (existing) {
      const previousTargetHeight = assetTargetHeight(existing);
      const pendingUpsert = pendingGeneratedUpserts.get(existing.id);
      if (pendingUpsert) {
        const remoteSignature = generatedThingSignature(normalized);
        const remoteCompletesGeneration =
          !existing.modelUrl &&
          Boolean(normalized.modelUrl) &&
          normalized.generationStatus === "ready";
        if (remoteSignature === pendingUpsert.signature) {
          pendingGeneratedUpserts.delete(existing.id);
        } else if (remoteCompletesGeneration) {
          pendingGeneratedUpserts.delete(existing.id);
        } else if (
          remoteUpdatedAt === 0 ||
          remoteUpdatedAt < pendingUpsert.updatedAtMs ||
          Date.now() < pendingUpsert.expiresAtMs
        ) {
          return;
        } else {
          pendingGeneratedUpserts.delete(existing.id);
        }
      }
      const locallyRidden = existing.id === sailingThingId;
      const nextPetOwnerId =
        normalized.petOwnerId === undefined
          ? existing.petOwnerId
          : normalized.petOwnerId || undefined;
      const locallyFollowedPet = nextPetOwnerId === petOwnerId;
      existing.kind = normalized.kind as GeneratedKind;
      existing.prompt = normalized.prompt;
      existing.creatorId = normalized.creatorId as AgentId | "visitor";
      existing.ownerUserId = normalized.ownerUserId;
      if (!locallyRidden && !locallyFollowedPet) {
        existing.position = { ...normalized.position };
        existing.rotationX = normalized.rotationX ?? 0;
        existing.rotationY = normalized.rotationY;
        existing.rotationZ = normalized.rotationZ ?? 0;
        existing.scale = normalized.scale;
        const nextTargetHeight = assetTargetHeight(existing);
        const existingMesh = generatedMeshes.get(existing.id);
        if (
          existingMesh &&
          previousTargetHeight > 0 &&
          Math.abs(nextTargetHeight - previousTargetHeight) > 0.0001
        ) {
          existingMesh.scale.multiplyScalar(nextTargetHeight / previousTargetHeight);
        }
      }
      existing.color = normalized.color;
      existing.verticalOffset = normalized.verticalOffset === undefined
        ? existing.verticalOffset
        : groundRelativeOffset(normalized.verticalOffset);
      existing.vehicleMode = normalized.vehicleMode ?? existing.vehicleMode;
      existing.hasAnimations = normalized.hasAnimations ?? existing.hasAnimations;
      if (vehicleMode(existing) === "water" && existing.verticalOffset !== undefined) {
        const surface = waterVehiclePositionForCurrentWorld(existing.position.x, existing.position.z);
        existing.position.y = surface.y + clamp(existing.verticalOffset, -40, 40);
      }
      existing.assetStoreModelId = normalized.assetStoreModelId ?? existing.assetStoreModelId;
      // petOwnerId wire convention mirrors animation/avatar fields: "" clears, non-empty sets,
      // ABSENT means a mid-rollout backend stripped the field, so keep the local value.
      existing.petOwnerId = nextPetOwnerId;
      // animation wire convention (mirrors presence.avatarId): "" = explicit default, a non-empty
      // string = explicit clip, ABSENT = a mid-rollout server stripped the field — keep ours
      // (otherwise our own upsert's echo would wipe a just-picked clip).
      const nextAnimation =
        normalized.animation === undefined
          ? existing.animation
          : normalized.animation || undefined;
      const animationChanged = (existing.animation ?? "") !== (nextAnimation ?? "");
      existing.animation = nextAnimation;
      if (normalized.animationClips !== undefined) {
        existing.animationClips = normalized.animationClips;
      }
      applyGenerationState(existing, normalized);
      if (!isFreeMovingVehicle(existing)) groundThingToRenderedSurface(existing);
      const repairedInteriorPosition = repairInteriorThingPosition(existing);
      ensureGeneratedVisual(existing);
      updateThingMeshPosition(existing);
      refreshVegetationForGeneratedThing(existing);
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
      if (healedPending || repairedInteriorPosition) {
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
      verticalOffset: groundRelativeOffset(normalized.verticalOffset),
      vehicleMode: normalized.vehicleMode,
      hasAnimations: normalized.hasAnimations,
      assetStoreModelId: normalized.assetStoreModelId,
      modelUrl: normalized.modelUrl,
      pipelineId: normalized.pipelineId,
      generationStatus: normalized.generationStatus,
      animation: normalized.animation || undefined, // "" (explicit default) → unset internally
      petOwnerId: normalized.petOwnerId || undefined,
      animationClips: normalized.animationClips,
    };
    if (vehicleMode(thing) === "water" && thing.verticalOffset !== undefined) {
      const surface = waterVehiclePositionForCurrentWorld(thing.position.x, thing.position.z);
      thing.position.y = surface.y + clamp(thing.verticalOffset, -40, 40);
    }
    if (!isFreeMovingVehicle(thing)) groundThingToRenderedSurface(thing);
    generated.push(thing);
    const repairedInteriorPosition = repairInteriorThingPosition(thing);
    ensureGeneratedVisual(thing);
    updateThingMeshPosition(thing);
    refreshVegetationForGeneratedThing(thing);
    loadRemoteGeneratedModel(thing);
    reconcileRemoteGeneratedManifest(thing);
    reconcileFailedAssetStorePrompt(thing);
    if (healedPending || repairedInteriorPosition) {
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
    markGeneratedDeletePending(id);
    wildlifeAssignments = removeWildlifePresentationState(id, {
      configs: wildlifeConfigs,
      interpolation: wildlifeInterpolation,
      poses: wildlifePoses,
      tiers: wildlifeTiers,
      lastIntents: wildlifeLastIntents,
      assignments: wildlifeAssignments,
    });
    // Do not wait for the every-other-frame proxy sync: deletion must remove the last proxy now.
    wildlifeProxyRenderer.sync(wildlifeAssignments, wildlifePoses);
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
    petGroundRaycastState.delete(id);
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

  void connectTellusWorldRealtime();
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
      visitorPosition = groundedPositionForCurrentSurface(targetX, targetZ, visitorPosition);
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
    mount.position = movedVehiclePositionForCurrentWorld(mount, arrival.x, arrival.z, mount.position);
    updateThingMeshPosition(mount);
    visitorPosition = riderPositionForThing(mount);
    publishGeneratedThing(mount);
    syncAnchoredPortalsForThing(mount);
    return true;
  };

  const petLastPublishAt = new Map<string, number>();
  const petAnimationModes = new Map<string, GeneratedMotionMode>();
  const lastPetOwnerPosition = { x: visitorPosition.x, z: visitorPosition.z };
  const localPetThings = (): GeneratedThing[] =>
    generated.filter((thing) => thing.petOwnerId === petOwnerId && thing.id !== sailingThingId);

  // footprintGroundY(At) raycasts the LIVE rendered terrain mesh up to 9x (a center sample + an 8-point
  // footprint ring) per call — expensive at 60fps, and this cost MULTIPLIES per followed pet (a rider with
  // 3 dogs and a parrot pays it 4x/frame on top of the mount's own check below). Throttle each tracked
  // entity to its own ~180ms raycast cadence (staggered by index so N pets don't all re-raycast on the
  // same frame) and hold the last resolved ground Y between raycasts — the analytic groundedPosition
  // fallback still runs every frame so movement stays smooth, only the expensive mesh-precision correction
  // is rate-limited.
  const PET_GROUND_RAYCAST_INTERVAL_MS = 180;
  const petGroundRaycastState = new Map<string, { nextAt: number; lastY: number | null }>();

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
    const mode = vehicleMode(thing);
    if (mode === "air" || mode === "water") {
      return movedVehiclePositionForCurrentWorld(thing, x, z, thing.position);
    }
    const nowMs = performance.now();
    let state = petGroundRaycastState.get(thing.id);
    if (!state) {
      // Stagger first-raycast timing by index so a pack of pets doesn't all pay the raycast on the
      // same frame the moment they're first followed.
      state = { nextAt: nowMs + (index % 6) * (PET_GROUND_RAYCAST_INTERVAL_MS / 6), lastY: null };
      petGroundRaycastState.set(thing.id, state);
    }
    if (nowMs >= state.nextAt) {
      state.nextAt = nowMs + PET_GROUND_RAYCAST_INTERVAL_MS;
      const liveGround = footprintGroundYAt(thing, x, z, visitorPosition.y);
      state.lastY = liveGround !== null && Number.isFinite(liveGround) ? liveGround : null;
    }
    if (state.lastY !== null) {
      return positionAtGroundRelativeOffset(
        { x, y: state.lastY, z },
        state.lastY,
        thing.verticalOffset,
      );
    }
    const analyticGround = interiorObject
      ? interiorPlacementFloorHeightAt(
          x,
          z,
          thing.position.y - groundRelativeOffset(thing.verticalOffset),
        )
      : groundHeightAt(x, z);
    return analyticGround !== null && Number.isFinite(analyticGround)
      ? positionAtGroundRelativeOffset(
          { x, y: analyticGround, z },
          analyticGround,
          thing.verticalOffset,
        )
      : groundedPositionForCurrentSurface(x, z, thing.position);
  };

  const liftPetToRenderedTerrain = (pet: GeneratedThing): boolean => {
    if (isFreeMovingVehicle(pet)) return false;
    const liveGround = footprintGroundY(pet);
    if (liveGround === null || !Number.isFinite(liveGround)) return false;
    const targetY = liveGround + groundRelativeOffset(pet.verticalOffset);
    if (targetY <= pet.position.y + 0.05) return false;
    pet.position = { ...pet.position, y: targetY };
    updateThingMeshPosition(pet);
    refreshInstancedThingMatrix(pet);
    return true;
  };

  const syncPetsToOwner = (delta: number, forceTeleport = false) => {
    const pets = localPetThings();
    const ownerMoveDistance = Math.hypot(
      visitorPosition.x - lastPetOwnerPosition.x,
      visitorPosition.z - lastPetOwnerPosition.z,
    );
    const ownerMoving = !forceTeleport && ownerMoveDistance > 0.04;
    lastPetOwnerPosition.x = visitorPosition.x;
    lastPetOwnerPosition.z = visitorPosition.z;
    if (pets.length === 0) return;
    const nowMs = performance.now();
    let changed = false;
    for (let index = 0; index < pets.length; index++) {
      const pet = pets[index];
      if (ambientPhysics.has(pet.id)) continue;
      const target = petFollowTarget(pet, index);
      const dx = target.x - pet.position.x;
      const dy = target.y - pet.position.y;
      const dz = target.z - pet.position.z;
      const distance = Math.hypot(dx, dz);
      const shouldSnap = forceTeleport || distance > 70;
      const shouldMove = shouldSnap || distance > 0.28 || Math.abs(dy) > 0.08;
      const previous = { ...pet.position };
      if (shouldMove) {
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
        liftPetToRenderedTerrain(pet);
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
      const movedThisFrame = Math.hypot(
        pet.position.x - previous.x,
        pet.position.z - previous.z,
      ) > 0.001;
      const moving = !forceTeleport && (ownerMoving || movedThisFrame || distance > 0.6);
      const mode: GeneratedMotionMode = moving
        ? distance > (sailingThingId ? 5.5 : 8)
          ? "run"
          : "walk"
        : "idle";
      updatePetAnimation(pet, mode);
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
          position: portalAnchorPosition(portal),
        },
        { pending: false },
      );
    }
  };

  const setPortalWorldPosition = (portal: WorldPortal, position: Vec3): WorldPortal => {
    const anchor = portalAnchorThing(portal);
    if (!anchor) return { ...portal, position };
    const worldOffset = {
      x: position.x - anchor.position.x,
      y: position.y - anchor.position.y,
      z: position.z - anchor.position.z,
    };
    return {
      ...portal,
      position,
      anchorOffset: rotateXZ(worldOffset, -(anchor.rotationY ?? 0)),
    };
  };

  const upsertEditedPortal = (portal: WorldPortal, logText?: string) => {
    sendPortalUpsert(portal, {
      pending: false,
      logText,
    });
  };

  const movePortal = (portalId: string, dx: number, dz: number) => {
    const portal = worldPortals.find((p) => p.id === portalId);
    if (!portal) return;
    const current = portalAnchorPosition(portal);
    const next = setPortalWorldPosition(portal, { ...current, x: current.x + dx, z: current.z + dz });
    upsertEditedPortal(next);
  };

  const liftPortal = (portalId: string, amount: number) => {
    const portal = worldPortals.find((p) => p.id === portalId);
    if (!portal) return;
    const current = portalAnchorPosition(portal);
    const next = setPortalWorldPosition(portal, { ...current, y: current.y + amount });
    upsertEditedPortal(next);
  };

  const rotatePortal = (portalId: string, radians: number) => {
    const portal = worldPortals.find((p) => p.id === portalId);
    if (!portal) return;
    const rotation = portal.rotation ?? { x: 0, y: 0, z: 0 };
    upsertEditedPortal({
      ...portal,
      rotation: { ...rotation, y: (rotation.y ?? 0) + radians },
    });
  };

  const scalePortal = (portalId: string, multiplier: number) => {
    const portal = worldPortals.find((p) => p.id === portalId);
    if (!portal) return;
    upsertEditedPortal({
      ...portal,
      radius: clamp(portal.radius * multiplier, 0.55, 5.5),
    });
  };

  const nearestGeneratedThingToPortal = (portal: WorldPortal): GeneratedThing | undefined => {
    const position = portalAnchorPosition(portal);
    let best: GeneratedThing | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const thing of generated) {
      const distance = distance2D(position, thing.position);
      if (distance < bestDistance) {
        best = thing;
        bestDistance = distance;
      }
    }
    return best;
  };

  const attachPortalToThing = (portalId: string, thingId: string) => {
    const portal = worldPortals.find((p) => p.id === portalId);
    const anchor = thingById(thingId);
    if (!portal || !anchor) return;
    const position = portalAnchorPosition(portal);
    const worldOffset = {
      x: position.x - anchor.position.x,
      y: position.y - anchor.position.y,
      z: position.z - anchor.position.z,
    };
    const rotationY = portalRotationY(portal) - (anchor.rotationY ?? 0);
    upsertEditedPortal(
      {
        ...portal,
        position,
        rotation: { ...(portal.rotation ?? { x: 0, y: 0, z: 0 }), y: rotationY },
        anchorThingId: anchor.id,
        anchorOffset: rotateXZ(worldOffset, -(anchor.rotationY ?? 0)),
      },
      `Attached ${portal.label || portal.target.worldId} to ${anchor.prompt || anchor.kind}`,
    );
  };

  const attachPortalToSelected = (portalId: string) => {
    const portal = worldPortals.find((p) => p.id === portalId);
    if (!portal) return;
    const anchor = selectedThingId ? thingById(selectedThingId) : undefined;
    const fallback = anchor ?? nearestGeneratedThingToPortal(portal);
    if (!fallback) return;
    attachPortalToThing(portalId, fallback.id);
  };

  const detachPortal = (portalId: string) => {
    const portal = worldPortals.find((p) => p.id === portalId);
    if (!portal) return;
    const position = portalAnchorPosition(portal);
    const rotationY = portalRotationY(portal);
    const next: WorldPortal = {
      ...portal,
      position,
      rotation: { ...(portal.rotation ?? { x: 0, y: 0, z: 0 }), y: rotationY },
      anchorThingId: undefined,
      anchorOffset: undefined,
    };
    upsertEditedPortal(next, `Detached ${portal.label || portal.target.worldId}`);
  };

  const moveGenerated = (id: string, dx: number, dz: number, targetY?: number) => {
    const thing = thingById(id);
    if (!thing) return;
    const preserveCurrentY = draggingThingId === id && targetY === undefined;
    const manualHeightOffset = groundRelativeOffset(thing.verticalOffset);
    const position =
      isVehicleThing(thing) || sailingThingId === id
        ? movedVehiclePositionForCurrentWorld(
            thing,
            thing.position.x + dx,
            thing.position.z + dz,
            thing.position,
          )
        : targetY !== undefined
          ? positionAtGroundRelativeOffset(
              {
                x: thing.position.x + dx,
                y: targetY,
                z: thing.position.z + dz,
              },
              targetY,
              thing.verticalOffset,
            )
          : preserveCurrentY
            ? {
                x: thing.position.x + dx,
                y: thing.position.y,
                z: thing.position.z + dz,
              }
            : groundedPositionForCurrentSurface(
                thing.position.x + dx,
                thing.position.z + dz,
                thing.position,
              );
    if (
      targetY === undefined &&
      !preserveCurrentY &&
      !isVehicleThing(thing) &&
      sailingThingId !== id &&
      Math.abs(manualHeightOffset) > 0.001
    ) {
      const newGroundY = interiorObject
        ? interiorPlacementFloorHeightAt(
            position.x,
            position.z,
            position.y - manualHeightOffset,
          )
        : groundHeightAt(position.x, position.z);
      if (newGroundY !== null && Number.isFinite(newGroundY)) {
        position.y = positionAtGroundRelativeOffset(
          position,
          newGroundY,
          thing.verticalOffset,
        ).y;
      }
    }
    thing.position = position;
    if (!isFreeMovingVehicle(thing)) thing.verticalOffset = manualHeightOffset;
    if (sailingThingId === id) {
      visitorPosition = riderPositionForThing(thing);
    }
    updateThingMeshPosition(thing);
    publishGeneratedThing(thing);
    syncAnchoredPortalsForThing(thing);
    refreshVegetationForGeneratedThing(thing);
    publish();
  };

  // Duplicate the selected object, preserving its model + scale + rotation, offset a little so it doesn't sit
  // exactly on the original. The GLB loads from the in-memory parse cache, so a clone is instant (no
  // re-download/re-parse), and it's persisted to the world like any other placement.
  const cloneGenerated = (id: string) => {
    const source = thingById(id);
    if (!source) return;
    const offset = 1.4 + source.scale * 0.8;
    const sourceVerticalOffset = groundRelativeOffset(source.verticalOffset);
    const cloneSurfacePosition = interiorObject
      ? interiorPlacementPosition(
          source.position.x + offset,
          source.position.z + offset,
          source.position.y - sourceVerticalOffset,
        )
      : groundedPositionForCurrentSurface(
          source.position.x + offset,
          source.position.z + offset,
          source.position,
        );
    const clone: GeneratedThing = {
      id: browserUuid(),
      kind: source.kind,
      prompt: source.prompt,
      creatorId: "visitor",
      ownerUserId: userId,
      position: isFreeMovingVehicle(source)
        ? { ...source.position, x: source.position.x + offset, z: source.position.z + offset }
        : positionAtGroundRelativeOffset(
            cloneSurfacePosition,
            cloneSurfacePosition.y,
            sourceVerticalOffset,
          ),
      rotationX: source.rotationX,
      rotationY: source.rotationY,
      rotationZ: source.rotationZ,
      scale: source.scale,
      color: source.color,
      verticalOffset: sourceVerticalOffset,
      vehicleMode: source.vehicleMode,
      hasAnimations: source.hasAnimations,
      assetStoreModelId: source.assetStoreModelId,
      modelUrl: source.modelUrl,
      pipelineId: source.pipelineId,
      generationStatus: source.generationStatus,
      animation: source.animation,
      petOwnerId: source.petOwnerId,
      animationClips: source.animationClips,
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
    refreshVegetationForGeneratedThing(clone);
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
    syncAnchoredPortalsForThing(thing);
    refreshVegetationForGeneratedThing(thing);
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
    syncAnchoredPortalsForThing(thing);
    refreshVegetationForGeneratedThing(thing);
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
    const surfaceY = vehicleMode(thing) === "water"
      ? waterVehiclePositionForCurrentWorld(thing.position.x, thing.position.z).y
      : footprintGroundY(thing) ?? groundHeightAt(thing.position.x, thing.position.z);
    if (surfaceY !== null && Number.isFinite(surfaceY)) {
      thing.verticalOffset = groundRelativeOffsetFromSurface(thing.position.y, surfaceY);
    }
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
    thing.verticalOffset = 0;
    const groundY = footprintGroundY(thing);
    // Origin-anchored placement (see placeObjectAboveGround): put the asset's origin on the ground.
    thing.position =
      groundY !== null && Number.isFinite(groundY)
        ? { ...thing.position, y: groundY }
        : groundedPositionForCurrentSurface(thing.position.x, thing.position.z, {
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
    const deletedAt = new Date().toISOString();
    const deletedAtMs = Date.parse(deletedAt);
    markGeneratedDeletePending(id, Number.isFinite(deletedAtMs) ? deletedAtMs : Date.now());
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
      visitorPosition = groundedPositionForCurrentSurface(
        thing.position.x,
        thing.position.z,
        visitorPosition,
      );
    }
    refreshVegetationForGeneratedThing(thing);
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
      const action = { type: "generated.delete", visitorId, id, deletedAt };
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
    const waterPosition = waterVehiclePositionForCurrentWorld(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
      thing.position,
    );
    const waterSurface = waterVehiclePositionForCurrentWorld(waterPosition.x, waterPosition.z);
    thing.position = positionAtGroundRelativeOffset(
      waterPosition,
      waterSurface.y,
      thing.verticalOffset,
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
    if (mode === "water" && waterVehicleNeedsRelocation(thing.position)) {
      moveGeneratedToWater(id);
    } else if (mode === "air") {
      if (!hasAuthoredGroundRelativeOffset(thing.verticalOffset)) {
        thing.verticalOffset = DEFAULT_AIR_GROUND_RELATIVE_OFFSET;
      }
      thing.position = movedVehiclePositionForCurrentWorld(
        thing,
        thing.position.x,
        thing.position.z,
        thing.position,
      );
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

  const chunkedWaterVehicleDisembarkPosition = (boat: GeneratedThing): Vec3 | null => {
    if (!supportsChunkedWater || vehicleMode(boat) !== "water") return null;
    const footprint = thingFootprint(boat);
    const startRadius = Math.max(3.2, (footprint?.radius ?? boat.scale * 1.8) + 1.4);
    const preferredAngles = [
      boat.rotationY + Math.PI / 2,
      boat.rotationY - Math.PI / 2,
      boat.rotationY + Math.PI,
      boat.rotationY,
    ].filter(Number.isFinite);
    const tryCandidate = (x: number, z: number): Vec3 | null => {
      const candidate = clampChunkedPoint(x, z);
      if (isChunkedWaterPoint(candidate.x, candidate.z)) return null;
      const height = groundHeightAt(candidate.x, candidate.z) ?? largeWorldBaseHeight(candidate.x, candidate.z);
      if (!Number.isFinite(height)) return null;
      return clearVisitorSpawnPosition(candidate.x, candidate.z);
    };

    // Chunked worlds do not have the classic origin-centered island shore. Dismount near the boat by
    // sampling local land first, so parking by a beach exits to that beach instead of to world center.
    for (const angle of preferredAngles) {
      for (const radius of [startRadius, startRadius + 3, startRadius + 7, startRadius + 12]) {
        const found = tryCandidate(
          boat.position.x + Math.sin(angle) * radius,
          boat.position.z + Math.cos(angle) * radius,
        );
        if (found) return found;
      }
    }

    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < 220; i++) {
      const radius = startRadius + Math.floor(i / 18) * 4.5;
      const angle = i * golden;
      const found = tryCandidate(
        boat.position.x + Math.cos(angle) * radius,
        boat.position.z + Math.sin(angle) * radius,
      );
      if (found) return found;
    }
    return null;
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
      const chunkedShore = chunkedWaterVehicleDisembarkPosition(boat);
      if (chunkedShore) {
        visitorPosition = chunkedShore;
      } else if (mode === "water" && nearbyIsland) {
        visitorPosition = distantIslandShorePosition(
          nearbyIsland,
          boat.position.x,
          boat.position.z,
        );
      } else if (mode === "air") {
        visitorPosition = groundedPositionForCurrentSurface(
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
        visitorPosition = groundedPositionForCurrentSurface(
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
    petAnimationModes.delete(id);
    petGroundRaycastState.delete(id);
    if (isPet) {
      if (vehicleMode(thing) === "air" && !hasAuthoredGroundRelativeOffset(thing.verticalOffset)) {
        thing.verticalOffset = DEFAULT_AIR_GROUND_RELATIVE_OFFSET;
        thing.position = movedVehiclePositionForCurrentWorld(
          thing,
          thing.position.x,
          thing.position.z,
          thing.position,
        );
      }
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
    if (typeof request.location === "object") {
      return interiorObject
        ? interiorPlacementPosition(request.location.x, request.location.z)
        : normalizedDiscPosition(request.location.x, request.location.z);
    }
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
    const radius = interiorObject ? 2.2 + rand(tick + 33) * 2.8 : 3 + rand(tick + 33) * 7;
    if (interiorObject) {
      return interiorPlacementPosition(
        origin.x + Math.cos(angle) * radius,
        origin.z + Math.sin(angle) * radius,
      );
    }
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
      verticalOffset: 0,
      generationStatus: "local",
    };
    const generationProvider = generationProviderForThing(thing);
    const usesExternalGeneration =
      hasExternalGenerationProvider(generationProvider) && directGenerationAvailable;
    thing.generationStatus = usesExternalGeneration ? "queued" : "local";
    generated.push(thing);
    refreshVegetationForGeneratedThing(thing);
    const mesh = usesExternalGeneration
      ? createGenerationSwirl(thing)
      : createGeneratedMesh(thing);
    generatedMeshes.set(thing.id, mesh);
    scene.add(mesh);
    syncTransformControls();

    addLog({
      agentId: request.creatorId,
      agentName: displayNameForVisitor(String(request.creatorId)),
      tool: "generate",
      text: `${displayNameForVisitor(String(request.creatorId))} generated ${thing.kind}: ${request.prompt}`,
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
          const model = await loadGeneratedModelForThing(modelUrl, thing);
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
          ensureGeneratedBuildingLodProxy(thing, model);
          generatedMeshes.set(thing.id, model);
          startGeneratedAnimation(thing.id, model);
          scene.add(model);
          updateThingMeshPosition(thing);
          refreshVegetationForGeneratedThing(thing);
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
        request.sourceImageUrl,
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
          const model = await loadGeneratedModelForThing(thing.modelUrl, thing);
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
          ensureGeneratedBuildingLodProxy(thing, model);
          generatedMeshes.set(thing.id, model);
          startGeneratedAnimation(thing.id, model);
          scene.add(model);
          updateThingMeshPosition(thing);
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
    const rawModelUrl =
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
    let modelUrl = rawModelUrl;
    const parsedProcedural = parseProceduralModelUrl(rawModelUrl);
    if (parsedProcedural?.building && !parsedProcedural.building.material) {
      const recipeId = parsedProcedural.building.recipeId;
      const height = sampleVegetationHeight(position.x, position.z) ?? terrainHeight(position.x, position.z);
      const paint = sampleVegetationPaint(position.x, position.z);
      const ecology = resolveEcologySample({
        seed: parsedProcedural.seed,
        x: position.x,
        z: position.z,
        height,
        terrainPaint: paint,
        biomeCell: biomeCellAt(position.x, position.z, height),
      });
      modelUrl = makeProceduralBuildingModelUrl(
        makeProceduralBuildingArchetypeId(recipeId),
        parsedProcedural.seed,
        {
          material: buildingMaterialForEcology(ecology, recipeId),
          lighting: parsedProcedural.building.lighting,
          roof: parsedProcedural.building.roof,
        },
      );
    }
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
      verticalOffset: 0,
      assetStoreModelId,
      modelUrl,
      generationStatus: "ready",
      vehicleMode: inferAssetVehicleMode(model),
      hasAnimations: (model.animationClips?.length ?? 0) > 0,
      animationClips: model.animationClips,
    };
    generated.push(thing);
    refreshVegetationForGeneratedThing(thing);
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
    void loadGeneratedModelForThing(modelUrl, thing)
      .then((modelObject) => {
        if (destroyed) return;
        const oldMesh = generatedMeshes.get(thing.id);
        if (oldMesh) {
          stopGeneratedAnimation(thing.id);
          scene.remove(oldMesh);
          disposeObject(oldMesh);
        }
        ensureGeneratedBuildingLodProxy(thing, modelObject);
        generatedMeshes.set(thing.id, modelObject);
        startGeneratedAnimation(thing.id, modelObject); // VRM idle / embedded clip starts looping
        scene.add(modelObject);
        if (interiorObject && !isFreeMovingVehicle(thing)) {
          placeObjectAboveGround(modelObject, interiorVisiblePlacementForThing(thing), 0.04);
        }
        updateThingMeshPosition(thing);
        refreshVegetationForGeneratedThing(thing);
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

  const proceduralAssetOption = (archetypeId: string) => {
    const arch = PROCEDURAL_CATALOG.find((item) => item.id === archetypeId);
    if (arch) {
      const proceduralAssetStoreModelIds: Partial<Record<string, string>> = {
        flower: "cab852ab-b072-4316-aad0-6e4d5f4507f2",
        mushroom: "80b4a76f-27f4-4ba3-bb63-47c54f5995b9",
      };
      const assetStoreModelId = proceduralAssetStoreModelIds[arch.id];
      return {
        id: arch.id,
        label: arch.label,
        kind: arch.kind,
        tree: arch.kind === "tree",
        count: arch.kind === "tree" ? 5 : arch.kind === "flower" ? 14 : 10,
        max: arch.kind === "tree" ? 9 : 24,
        radius: arch.kind === "tree" ? 24 : 12,
        minDistance: arch.kind === "tree" ? 7 : 3,
        modelUrl: (seed: number) => assetStoreModelId
          ? assetStoreGameOptimizedModelUrl(assetStoreModelId)
          : makeProceduralModelUrl(arch.id, seed),
        assetId: (seed: number) => assetStoreModelId ?? `proc-${arch.id}-${seed.toString(16)}`,
        scale: (variation = 1) =>
          (assetStoreModelId ? 1.15 : defaultScaleForRealisticKind(arch.kind, arch.label) * (arch.kind === "tree" ? 1.48 : 1)) * variation,
        description: arch.kind === "tree" ? `${arch.label} tree` : arch.label,
        procPlantPresetId: undefined,
        assetStoreModelId,
      };
    }
    const procPlant = procPlantPlaceableById(archetypeId);
    if (!procPlant) return null;
    const assetBacked = Boolean(procPlant.assetStoreModelId && procPlant.assetModelUrl);
    return {
      id: procPlant.id,
      label: procPlant.label,
      kind: procPlant.kind,
      tree: procPlant.kind === "tree",
      count: procPlant.scatterCount,
      max: procPlant.kind === "tree" ? 6 : 22,
      radius: procPlant.scatterRadius,
      minDistance: procPlant.kind === "tree" ? Math.max(9, procPlant.scale * 0.75) : 2.5,
      modelUrl: (seed: number) => assetBacked ? procPlant.assetModelUrl! : makeProcPlantModelUrl(procPlant.presetId, seed),
      assetId: (seed: number) => assetBacked
        ? procPlant.assetStoreModelId!
        : `procplant-${procPlant.presetId.toLowerCase()}-${seed.toString(16)}`,
      scale: (variation = 1) => procPlant.scale * variation,
      description: `${procPlant.label} procplant`,
      procPlantPresetId: assetBacked ? undefined : procPlant.presetId,
      assetStoreModelId: procPlant.assetStoreModelId,
    };
  };

  const placeProcPlantAsset = (
    option: NonNullable<ReturnType<typeof proceduralAssetOption>>,
    seed: number,
    location: { x: number; y: number; z: number },
    scale: number,
  ): ProceduralAssetPlacement | null => {
    if (!option.procPlantPresetId) return null;
    const id = option.assetId(seed);
    const placed = procplants.placeManualPlant({
      id,
      presetId: option.procPlantPresetId,
      seed,
      x: location.x,
      z: location.z,
      scale,
    });
    if (!placed) return null;
    publishProcPlantPlacement({
      id,
      presetId: option.procPlantPresetId,
      seed,
      position: location,
      scale,
      createdBy: visitorId,
      updatedAt: new Date().toISOString(),
    });
    return {
      id,
      archetypeId: option.id,
      label: option.label,
      chunkedVegetation: true,
    };
  };

  const scatterProceduralAsset = (
    archetypeId: string,
    count?: number,
    center: Vec3 = visitorPosition,
    placement: "around-visitor" | "brush-centered" = "around-visitor",
  ): ProceduralAssetPlacement[] => {
    const option = proceduralAssetOption(archetypeId);
    if (!option) return [];
    const rng = Math.random;
    const total = clamp(
      Math.round(count ?? option.count),
      1,
      option.max,
    );
    const placed: ProceduralAssetPlacement[] = [];
    const maxAttempts = total * 4;
    for (let attempt = 0; attempt < maxAttempts && placed.length < total; attempt++) {
      const i = placed.length;
      const seed = (rng() * 0xffffffff) >>> 0;
      const angle = rng() * Math.PI * 2;
      const brushRadius = Math.max(1.5, option.radius * 0.55);
      const distance =
        placement === "brush-centered"
          ? i === 0
            ? 0
            : Math.sqrt(rng()) * brushRadius
          : option.minDistance + Math.sqrt(rng()) * option.radius;
      const location = {
        x: center.x + Math.sin(angle) * distance,
        y: 0,
        z: center.z + Math.cos(angle) * distance,
      };
      if (isAgentPlacementWater(location.x, location.z)) continue;
      const scale = option.scale(0.82 + rng() * 0.42);
      const plantPlacement = placeProcPlantAsset(option, seed, location, scale);
      if (plantPlacement) {
        placed.push(plantPlacement);
        continue;
      }
      const thing = addLibraryAsset(
        {
          id: option.assetId(seed),
          name: option.label,
          description: option.description,
          modelUrl: option.modelUrl(seed),
          assetStoreModelId: option.assetStoreModelId,
          source: option.assetStoreModelId ? "asset-library" : "generated",
        },
        {
          location,
          scale,
        },
      );
      placed.push({
        id: thing.id,
        archetypeId: option.id,
        label: option.label,
        generatedThingId: thing.id,
      });
    }
    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "generate",
      text: `${placement === "brush-centered" ? "placed" : "scattered"} ${placed.length} ${option.label}`,
    });
    publish();
    return placed;
  };

  const placeVegetationBrushAt = (archetypeId: string, target: Vec3): ProceduralAssetPlacement | null => {
    if (vegetationBrushMode === "multi") {
      const placed = scatterProceduralAsset(archetypeId, undefined, target, "brush-centered");
      return placed[0] ?? null;
    }
    const option = proceduralAssetOption(archetypeId);
    if (!option) return null;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const scale = option.scale(0.9 + Math.random() * 0.22);
    const placed = placeProcPlantAsset(option, seed, target, scale);
    if (!placed) {
      const thing = addLibraryAsset(
        {
          id: option.assetId(seed),
          name: option.label,
          description: option.description,
          modelUrl: option.modelUrl(seed),
          assetStoreModelId: option.assetStoreModelId,
          source: option.assetStoreModelId ? "asset-library" : "generated",
        },
        { location: target, scale },
      );
      return {
        id: thing.id,
        archetypeId: option.id,
        label: option.label,
        generatedThingId: thing.id,
      };
    }
    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "generate",
      text: `placed ${option.label}`,
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

  const submitVisitorPrompt = (prompt: string, sourceImageUrl?: string) => {
    const trimmed = prompt.trim();
    const trimmedImageUrl = sourceImageUrl?.trim();
    if (!trimmed && !trimmedImageUrl) return;
    if (trimmed.toLowerCase().startsWith("ask ") && generated.length > 0) {
      interact({
        targetId: generated[generated.length - 1].id,
        intent: trimmed,
        actorId: "visitor",
      });
      return;
    }
    generate({
      prompt: trimmed || "make a 3D model from this reference image",
      location: {
        x: visitorPosition.x + Math.sin(yaw) * 4,
        y: 0,
        z: visitorPosition.z + Math.cos(yaw) * 4,
      },
      creatorId: "visitor",
      ownerUserId: userId,
      sourceImageUrl: trimmedImageUrl || undefined,
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
  let chunkStreamProbe: Vec3 | null = null;
  const runSpeedMultiplier = (nowMs: number): number => {
    if (moveHoldStartMs === 0) return 1;
    const heldS = (nowMs - moveHoldStartMs - RUN_GRACE_MS) / 1000;
    if (heldS <= 0) return 1;
    return Math.min(RUN_MAX_MULT, Math.pow(RUN_EXP_BASE, heldS));
  };
  const chunkStreamPressure = () => {
    if (!isChunked || !chunkRenderer) return 0;
    const stats = chunkRenderer.stats();
    let pressure = 0;
    if (stats.currentProvisional) pressure = Math.max(pressure, 1);
    if (stats.ready > 0) pressure = Math.max(pressure, 0.75);
    if (stats.inflight > 0) pressure = Math.max(pressure, 0.55);
    return pressure;
  };
  const chunkMovementSpeedScale = () => {
    if (terrainOnlyDebug()) return 1;
    const pressure = chunkStreamPressure();
    if (pressure >= 1) return 0.38;
    if (pressure >= 0.75) return 0.52;
    if (pressure >= 0.55) return 0.68;
    return 1;
  };
  let obstacleCache: ObstacleCircle[] = [];
  let buildingWallObstacleCache: ObstacleRect[] = [];
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
    if (isFlatGroundThing(thing)) return null;
    if (isBuildingThing(thing)) return null;
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
      x: profile.dimensions ? (thingFootprint(thing)?.centerX ?? thing.position.x) : thing.position.x,
      y: thing.position.y,
      z: profile.dimensions ? (thingFootprint(thing)?.centerZ ?? thing.position.z) : thing.position.z,
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

  const isBuildingThing = (thing: GeneratedThing): boolean => {
    return generatedThingSuppressesVegetation(thing);
  };
  const isFlatGroundThing = (thing: GeneratedThing): boolean => {
    const lower = thing.prompt.toLowerCase();
    return (
      thing.kind === "path" ||
      lower.includes("path") ||
      lower.includes("road") ||
      lower.includes("bridge") ||
      lower.includes("dock") ||
      lower.includes("pier") ||
      lower.includes("cobblestone") ||
      lower.includes("cobble") ||
      lower.includes("paver") ||
      lower.includes("paving") ||
      lower.includes("plaza") ||
      lower.includes("courtyard")
    );
  };

  const pushBuildingWall = (
    list: ObstacleRect[],
    thing: GeneratedThing,
    centerX: number,
    centerZ: number,
    localX: number,
    localZ: number,
    hx: number,
    hz: number,
    yaw: number,
  ) => {
    if (hx <= 0.12 || hz <= 0.12) return;
    const cos = Math.cos(thing.rotationY);
    const sin = Math.sin(thing.rotationY);
    list.push({
      ownerId: thing.id,
      x: centerX + localX * cos - localZ * sin,
      z: centerZ + localX * sin + localZ * cos,
      hx,
      hz,
      yaw: thing.rotationY + yaw,
    });
  };

  const buildingWallObstaclesForThing = (thing: GeneratedThing): ObstacleRect[] => {
    const fp = thingFootprint(thing);
    if (!fp || fp.height < 1.4 || fp.radius < 1.0) return [];
    if (thing.position.y > visitorPosition.y + 2.2) return [];
    const proceduralBuilding = Boolean(parseProceduralModelUrl(thing.modelUrl ?? "")?.building);
    const inset = proceduralBuilding ? 0.85 : 0;
    const halfWidth = Math.max(0.8, clamp(fp.width / 2, 1.4, 26) - inset);
    const halfDepth = Math.max(0.8, clamp(fp.depth / 2, 1.4, 26) - inset);
    const wallThickness = proceduralBuilding ? 0.28 : clamp(Math.min(halfWidth, halfDepth) * 0.08, 0.22, 0.6);
    const walls: ObstacleRect[] = [];
    const addWholeWall = (side: "front" | "back" | "left" | "right") => {
      if (side === "front") pushBuildingWall(walls, thing, fp.centerX, fp.centerZ, 0, halfDepth, halfWidth, wallThickness, 0);
      else if (side === "back") pushBuildingWall(walls, thing, fp.centerX, fp.centerZ, 0, -halfDepth, halfWidth, wallThickness, 0);
      else if (side === "left") pushBuildingWall(walls, thing, fp.centerX, fp.centerZ, -halfWidth, 0, halfDepth, wallThickness, Math.PI / 2);
      else pushBuildingWall(walls, thing, fp.centerX, fp.centerZ, halfWidth, 0, halfDepth, wallThickness, Math.PI / 2);
    };
    addWholeWall("front");
    addWholeWall("back");
    addWholeWall("left");
    addWholeWall("right");
    return walls;
  };
  const pointInsideBuildingFootprint = (thing: GeneratedThing, point: { x: number; z: number }): boolean => {
    const fp = thingFootprint(thing);
    if (!fp || fp.height < 1.4 || fp.radius < 1.0) return false;
    const halfWidth = clamp(fp.width / 2, 1.4, 26);
    const halfDepth = clamp(fp.depth / 2, 1.4, 26);
    const cos = Math.cos(-(thing.rotationY ?? 0));
    const sin = Math.sin(-(thing.rotationY ?? 0));
    const dx = point.x - fp.centerX;
    const dz = point.z - fp.centerZ;
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    return Math.abs(localX) < halfWidth && Math.abs(localZ) < halfDepth;
  };
  const currentObstacles = (): ObstacleCircle[] => {
    const nowMs = performance.now();
    if (nowMs - obstacleCacheAt > 500) {
      obstacleCacheAt = nowMs;
      const list: ObstacleCircle[] = [];
      const wallList: ObstacleRect[] = [];
      for (const thing of generated) {
        // Pass through: the vehicle you're riding, ambient-physics props (their own collision),
        // and the thing you're actively dragging (else it shoves you around as you place it).
        if (thing.id === sailingThingId || ambientPhysics.has(thing.id)) continue;
        if (thing.petOwnerId) continue;
        if (thing.id === draggingThingId) continue;
        if (isFlatGroundThing(thing)) continue;
        const fp = thingFootprint(thing);
        // Skip tiny/flat items you should be able to walk over (rugs, coins, low debris).
        if (!fp || fp.height < 1.4 || fp.radius < 0.55) continue;
        // only solid when the player can actually run into it (not lifted into the sky)
        if (thing.position.y > visitorPosition.y + 2.2) continue;
        if (isBuildingThing(thing)) {
          wallList.push(...buildingWallObstaclesForThing(thing));
          continue;
        }
        list.push({
          x: fp.centerX,
          z: fp.centerZ,
          // Solid radius scales with the model's footprint (capped so huge props stay passable
          // around the edges); the 0.7 factor lets you brush past rather than bumping a fat box.
          r: clamp(fp.radius * 0.7, 0.55, 2.6),
        });
      }
      obstacleCache = list;
      buildingWallObstacleCache = wallList;
    }
    return obstacleCache;
  };

  const currentBuildingWallObstacles = (): ObstacleRect[] => {
    currentObstacles();
    return buildingWallObstacleCache;
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

  // Reused scratch vectors for moveVisitor — hoisted out of the per-frame body so a moving player
  // doesn't allocate 3-4 Vector3s every frame (was a steady GC pressure source in the movement phase).
  const _mvForward = new THREE.Vector3();
  const _mvRight = new THREE.Vector3();
  const _mvMovement = new THREE.Vector3();
  const _mvDirection = new THREE.Vector3();
  const moveVisitor = (delta: number) => {
    const forward = _mvForward.set(Math.sin(yaw), 0, Math.cos(yaw));
    const right = _mvRight.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const movement = _mvMovement.set(0, 0, 0);
    const hasKeyboardMove =
      keys.has("w") ||
      keys.has("arrowup") ||
      keys.has("s") ||
      keys.has("arrowdown") ||
      keys.has("a") ||
      keys.has("arrowright") ||
      keys.has("d") ||
      keys.has("arrowleft");
    if (hasKeyboardMove) clearPointWalkTarget();
    if (keys.has("w") || keys.has("arrowup")) movement.add(forward);
    if (keys.has("s") || keys.has("arrowdown")) movement.sub(forward);
    if (keys.has("a") || keys.has("arrowright")) movement.add(right);
    if (keys.has("d") || keys.has("arrowleft")) movement.sub(right);
    let pointWalkStep: number | null = null;
    if (!hasKeyboardMove && pointWalkTarget) {
      const dx = pointWalkTarget.x - visitorPosition.x;
      const dz = pointWalkTarget.z - visitorPosition.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 0.6 * WORLD_SCALE) {
        clearPointWalkTarget();
      } else {
        movement.set(dx / distance, 0, dz / distance);
        pointWalkStep = distance;
        // NOTE: do NOT touch `yaw` here — that would rotate the CAMERA toward the walk direction.
        // The character's facing is updated from the movement vector below (avatarFacing).
      }
    }
    const hasInput = movement.lengthSq() > 0;
    const ascend = keys.has(" ");
    const descend = keys.has("c") || keys.has("shift");
    const verticalInput = ascend || descend;
    if (!hasInput || flying || sailingThingId) chunkStreamProbe = null;
    // Jump only in NORMAL mode; in fly mode or on an air mount, Space = ascend (handled below).
    if (!flying && !sailingThingId && ascend && !playerAirborne) {
      playerVy = 8.6;
      playerAirborne = true;
    }
    // Accelerating run: start/extend the hold while moving, reset it the moment input stops.
    if (hasInput && hasKeyboardMove) {
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
    if (hasInput || verticalInput) lastWorldModelLoadMotionAt = nowMs;
    const speedMultiplier = runSpeedMultiplier(nowMs);
    const chunkSpeedScale = chunkMovementSpeedScale();
    if (hasInput) {
      const movementDirection = _mvDirection.copy(movement).normalize();
      // Character turns to face its ACTUAL movement direction (click-to-move or WASD) — the camera
      // (yaw) is left alone so walking never yanks the view around. This is what makes click-to-move
      // feel right instead of snapping the camera behind the character.
      avatarFacing = Math.atan2(movementDirection.x, movementDirection.z);
      const speed = scaledPlayerSpeed() *
        speedMultiplier *
        (sailingThingId ? MOUNT_SPEED_MULT : 1) *
        chunkSpeedScale;
      if (isChunked && chunkRenderer) {
        const streamLookahead = Math.max(CHUNK_SPAN * 1.35, speed * 2.4);
        chunkStreamProbe = {
          x: visitorPosition.x + movementDirection.x * streamLookahead,
          y: visitorPosition.y,
          z: visitorPosition.z + movementDirection.z * streamLookahead,
        };
      }
      const step = pointWalkStep === null ? speed * delta : Math.min(speed * delta, pointWalkStep);
      movement.copy(movementDirection).multiplyScalar(step);
      if (pointWalkStep !== null && step >= pointWalkStep - 0.001) {
        clearPointWalkTarget();
      }
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
        if (ascend) y += FLY_VERTICAL_SPEED * chunkSpeedScale * delta;
        if (descend) y -= FLY_VERTICAL_SPEED * chunkSpeedScale * delta;
        const floor = (groundHeightAt(horiz.x, horiz.z) ?? SEA_LEVEL) + 2;
        boat.position = { x: horiz.x, y: clamp(y, floor, MAX_ALTITUDE), z: horiz.z };
        captureGroundRelativeOffsetFromPosition(boat);
      } else {
        if (!hasInput) return;
        boat.position = movedVehiclePositionForCurrentWorld(
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
      if (ascend) ny += FLY_VERTICAL_SPEED * chunkSpeedScale * delta;
      if (descend) ny -= FLY_VERTICAL_SPEED * chunkSpeedScale * delta;
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
      pushed = { x: moved.position.x, z: moved.position.z };
      pushed = resolveSweptRectObstacles(
        visitorPosition.x,
        visitorPosition.z,
        pushed.x,
        pushed.z,
        0.08,
        currentBuildingWallObstacles(),
      );
      pushed = resolveRectObstacles(
        pushed.x,
        pushed.z,
        0.08,
        currentBuildingWallObstacles(),
      );
    } else {
      pushed = resolveObstacles(desiredX, desiredZ, 0.5, currentObstacles());
      pushed = resolveSweptRectObstacles(
        visitorPosition.x,
        visitorPosition.z,
        pushed.x,
        pushed.z,
        0.08,
        currentBuildingWallObstacles(),
      );
      pushed = resolveRectObstacles(
        pushed.x,
        pushed.z,
        0.08,
        currentBuildingWallObstacles(),
      );
    }
    if (
      isChunked &&
      chunkRenderer &&
      !flying &&
      !playerAirborne &&
      hasInput &&
      chunkRenderer.sampleHeight(pushed.x, pushed.z) === null
    ) {
      chunkRenderer.update(pushed.x, pushed.z);
      if (!chunkRenderer.ensureBaseChunk(pushed.x, pushed.z)) {
        chunkRenderer.flush(1, 4, 2);
        playerVy = 0;
        sendPresenceUpdate();
        return;
      }
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
    playLocalAnimationIntent("throw");
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
    let pondSplashCreated = false;
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
        if (
          !pondSplashCreated &&
          pondWater.visible &&
          pondRippleContains(p.x, p.z, -0.15) &&
          p.y - radius * 0.25 <= pondRippleWaterLevelAt(p.x, p.z) + 0.08
        ) {
          pondSplashCreated = disturbPond(
            { x: p.x, z: p.z },
            performance.now(),
            THREE.MathUtils.clamp(0.7 + velocity.length() * 0.045, 0.7, 1.5),
          );
        }
        const nowMs = performance.now();
        if (nowMs - lastFlightPublish > 150) {
          lastFlightPublish = nowMs;
          captureGroundRelativeOffsetFromPosition(thing);
          publishGeneratedThing(thing);
        }
        publish();
      },
      onSettle: (p, q) => {
        applyPose(p, q);
        captureGroundRelativeOffsetFromPosition(thing);
        publishGeneratedThing(thing);
        updateSelectionIndicator();
        publish();
      },
    });
  };

  const syncMeshes = (now: number) => {
    const mountedThing = sailingThingId ? thingById(sailingThingId) : undefined;
    if (mountedThing && Number.isFinite(mountedThing.rotationY)) {
      avatarFacing = mountedThing.rotationY;
    }
    visitor.position.set(
      visitorPosition.x,
      visitorPosition.y,
      visitorPosition.z,
    );
    visitor.rotation.y = avatarFacing;
    sendPresenceUpdate();

    for (const thing of generated) {
      const mesh = generatedMeshes.get(thing.id);
      if (mesh) updateGeneratedBuildingLod(thing, mesh);
    }

    updatePondRipples(
      pondWater,
      now,
      renderer instanceof THREE.WebGLRenderer ? renderer : null,
    );
    const pondStepDistance = Math.hypot(
      visitorPosition.x - lastPondRipplePosition.x,
      visitorPosition.z - lastPondRipplePosition.z,
    );
    if (
      pondWater.visible &&
      pondRippleContains(visitorPosition.x, visitorPosition.z, -0.2) &&
      pondStepDistance >= 0.24 &&
      now - lastPondRippleAt >= 145
    ) {
      const rippleStrength = THREE.MathUtils.clamp(0.62 + pondStepDistance * 0.7, 0.62, 1.25);
      if (
        disturbPond(
          { x: visitorPosition.x, z: visitorPosition.z },
          now,
          rippleStrength,
        )
      ) {
        lastPondRipplePosition.x = visitorPosition.x;
        lastPondRipplePosition.z = visitorPosition.z;
        lastPondRippleAt = now;
      }
    } else if (!pondRippleContains(visitorPosition.x, visitorPosition.z, 0.1)) {
      lastPondRipplePosition.x = visitorPosition.x;
      lastPondRipplePosition.z = visitorPosition.z;
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
  const oceanNoonBlue = new THREE.Color(0x4fb9e6);
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
  const sunOffset = new THREE.Vector3();

  const currentDayNightPhase = (cycleNow: number) =>
    (runtimeConfig.dayNightStart + cycleNow / runtimeConfig.dayNightCycleMs) % 1;
  const resolvedDayNightPhase = (cycleNow: number) => {
    if (runtimeConfig.dayNightMode === "day") return 0.25;
    if (runtimeConfig.dayNightMode === "night") return 0.75;
    if (runtimeConfig.dayNightMode === "golden") return 0.53;
    if (runtimeConfig.dayNightMode === "pause") {
      return ((runtimeConfig.dayNightStart % 1) + 1) % 1;
    }
    return currentDayNightPhase(cycleNow);
  };
  let currentLightingPhase = resolvedDayNightPhase(Date.now());

  const updateDayNightCycle = (cycleNow: number, animationNow = performance.now()) => {
    const phase = resolvedDayNightPhase(cycleNow);
    currentLightingPhase = phase;
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
    oceanColor.lerp(oceanNoonBlue, daylight * (1 - twilight) * 0.22);

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

    sunOffset.set(Math.cos(angle) * -72, sunHeight * 88, Math.sin(angle) * 58);
    sun.position.copy(shadowCasterFocus).add(sunOffset);
    sun.target.position.copy(shadowCasterFocus);
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
      oceanMaterial.opacity = (0.6 + daylight * 0.16) * mood.opacity;
    } else if (oceanMaterial instanceof THREE.ShaderMaterial && oceanMaterial.userData.tellusWaterShader) {
      if (mood.oceanTint && mood.oceanTintStrength) {
        oceanColor.lerp(mood.oceanTint, mood.oceanTintStrength);
      }
      oceanMaterial.uniforms.uTintColor?.value.copy(oceanColor);
      if (oceanMaterial.uniforms.uOpacity) {
        oceanMaterial.uniforms.uOpacity.value = (0.6 + daylight * 0.16) * mood.opacity;
      }
    }
  };

  // Reused scratch vectors for updateCamera's third-person path (runs every frame). Avoids 3 Vector3
  // allocations per frame.
  const _camTarget = new THREE.Vector3();
  const _camLookTarget = new THREE.Vector3();
  const _camOffset = new THREE.Vector3();
  // Spring-arm camera collision scratch: pull the third-person camera in front of solid objects so they
  // never block the view of the character.
  const _camCollideDir = new THREE.Vector3();
  const _camRaycaster = new THREE.Raycaster();
  const _camCollisionTargets: THREE.Object3D[] = [];
  // Generous allowance for a generated object's bounds extending past its center (e.g. a large building).
  const CAM_COLLISION_RADIUS_MARGIN = 12;
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
    const target = _camTarget.set(
      visitorPosition.x,
      targetY,
      visitorPosition.z,
    );
    const skyLookAmount = Math.max(0, pitch + 0.08);
    const cameraPitch = Math.min(pitch, -0.08);
    const lookTarget = _camLookTarget.copy(target);
    const offset = _camOffset.set(
      Math.sin(yaw) * Math.cos(cameraPitch) * -zoom,
      Math.sin(-cameraPitch) * zoom + 2.2,
      Math.cos(yaw) * Math.cos(cameraPitch) * -zoom,
    );
    if (skyLookAmount > 0) {
      lookTarget.y += skyLookAmount * zoom * 2.6;
    }
    // Spring-arm collision: cast one short ray from the character out to where the camera wants to sit.
    // If a placed object (building/prop) is in the way, pull the camera IN FRONT of it so the character
    // stays visible. Grass/trees (instanced) are intentionally NOT collided with — the camera would
    // jitter through foliage. The player's own mount is skipped too.
    const desiredDist = offset.length();
    let camDist = desiredDist;
    if (desiredDist > 0.001) {
      const camDir = _camCollideDir.copy(offset).multiplyScalar(1 / desiredDist);
      _camCollisionTargets.length = 0;
      // Cheap distance pre-filter before the expensive recursive triangle raycast: a mesh whose
      // center is well beyond the ray's own length can never be hit, so skip it without descending
      // into its geometry. Margin covers large meshes (e.g. buildings) whose bounds extend past their
      // center point. In a world with hundreds of generated things this keeps intersectObjects's
      // target list — and per-frame triangle-intersection cost — bounded by nearby objects only.
      const maxCollideDistSq = (desiredDist + CAM_COLLISION_RADIUS_MARGIN) ** 2;
      for (const [id, mesh] of generatedMeshes) {
        if (id === sailingThingId) continue; // don't collide with the thing you're riding
        if (mesh.position.distanceToSquared(target) > maxCollideDistSq) continue;
        _camCollisionTargets.push(mesh);
      }
      _camRaycaster.set(target, camDir);
      _camRaycaster.far = desiredDist;
      const camHit = _camRaycaster.intersectObjects(_camCollisionTargets, true)[0];
      if (camHit) {
        // 0.45 keeps the lens just off the surface; never closer than 3 units so we don't clip into
        // the character.
        camDist = Math.max(3, Math.min(desiredDist, camHit.distance - 0.45));
      }
    }
    camera.position.copy(target).addScaledVector(offset, camDist / (desiredDist || 1));
    // Terrain floor: never let the camera sink below the ground beneath it (analytic, cheap).
    const camGroundY = groundHeightAt(camera.position.x, camera.position.z);
    if (camGroundY !== null && camera.position.y < camGroundY + 1.1) {
      camera.position.y = camGroundY + 1.1;
    }
    camera.lookAt(lookTarget);
    syncExternalSkyboxToCamera(camera.position);
  };
  updateCameraNow = updateCamera;

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
    if (lowGpuDebug()) return;
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

  const animate = () => {
    if (destroyed || !renderer) return;
    const now = performance.now();
    const frameStartedAt = now;
    const frameGapMs = now - lastTime;
    perfDiagnostics.frames++;
    perfDiagnostics.maxFrameMs = Math.max(perfDiagnostics.maxFrameMs, frameGapMs);
    fpsFrames++;
    if (now - fpsSampleStart >= 500) {
      fpsValue = Math.round((fpsFrames * 1000) / (now - fpsSampleStart));
      fpsFrames = 0;
      fpsSampleStart = now;
    }
    const delta = clamp((now - lastTime) / 1000, 0, 0.05);
    lastTime = now;
    tick++;
    applyTerrainOnlyDebugMode();
    // Bake interior trimesh statics once physics finishes its (async) load after a room mounted.
    ensureInteriorStatics();
    let phaseStartedAt = performance.now();
    moveVisitor(delta);
    perfDiagnostics.phases.movementMs = performance.now() - phaseStartedAt;
    perfDiagnostics.phases.maxMovementMs = Math.max(
      perfDiagnostics.phases.maxMovementMs,
      perfDiagnostics.phases.movementMs,
    );
    let miscStartedAt = performance.now();
    updatePortals(now); // TELLUS INFINITY: spin portal rings + auto-enter on walk-into
    if (tilesRenderer) {
      camera.updateMatrixWorld();
      tilesRenderer.update(); // stream the 3D tileset against the current camera
    }
    const sampledWildlife = wildlifeInterpolation.sampleAll(Date.now());
    wildlifePoses.clear();
    for (const pose of sampledWildlife) wildlifePoses.set(pose.id, pose);
    if (tick % 12 === 0) {
      wildlifeAssignments = planWildlifeLod(
        [...wildlifeConfigs.values()].filter((config) => config.enabled).map((config) => {
          const pose = wildlifePoses.get(config.animalId);
          const mesh = generatedMeshes.get(config.animalId);
          const position = pose?.position ?? thingById(config.animalId)?.position;
          const distanceMeters = position
            ? Math.hypot(
                camera.position.x - position.x,
                camera.position.y - position.y,
                camera.position.z - position.z,
              )
            : Number.POSITIVE_INFINITY;
          return {
            id: config.animalId,
            distanceMeters,
            visible: Boolean(position),
            // Runtime VAT renderers opt into this capability; ordinary skinned GLBs use the proxy tier.
            supportsInstancedAnimation: mesh?.userData.wildlifeInstancedAnimation === true,
            selected: selectedThingId === config.animalId,
          };
        }),
        wildlifeTiers,
      );
      wildlifeTiers.clear();
      for (const assignment of wildlifeAssignments) wildlifeTiers.set(assignment.id, assignment.tier);
    }
    for (const assignment of wildlifeAssignments) {
      const pose = wildlifePoses.get(assignment.id);
      const mesh = generatedMeshes.get(assignment.id);
      if (mesh) {
        mesh.visible = assignment.tier === "full";
        if (pose) {
          mesh.position.set(pose.position.x, pose.position.y, pose.position.z);
          mesh.rotation.y = pose.rotationY;
          if (assignment.tier === "full" && wildlifeLastIntents.get(pose.id) !== pose.animationIntent) {
            const config = wildlifeConfigs.get(pose.id);
            const preferredClipName = config
              ? wildlifeClipNameForIntent(
                  config.speciesProfileId,
                  pose.animationIntent,
                  generatedModelClips(mesh).map((clip) => clip.name),
                )
              : undefined;
            if (playGeneratedClip(pose.id, mesh, pose.animationIntent, null, { preferredClipName })) {
              wildlifeLastIntents.set(pose.id, pose.animationIntent);
            }
          }
        }
      }
    }
    if (tick % 2 === 0) wildlifeProxyRenderer.sync(wildlifeAssignments, wildlifePoses);
    for (const [id, state] of generatedAnimationMixers) {
      if (wildlifeConfigs.has(id) && wildlifeTiers.get(id) !== "full") continue;
      state.mixer.update(delta);
    }
    // Placed VRM things: advance the mixer + VRM spring bones (a static idle still needs spring-bone
    // settle; a looping VRMA clip plays here).
    for (const [id, rig] of generatedVrmRigs) {
      if (wildlifeConfigs.has(id) && wildlifeTiers.get(id) !== "full") continue;
      rig.update(delta);
    }
    // Avatar rigs: local walk/idle/jump from the player position delta + airborne flag; remotes
    // self-derive inside the rig from presence updates. update(dt) advances mixer + VRM.
    const localRig = avatarRigs.get(visitorId);
    if (localRig && delta > 0) {
      const ldx = visitorPosition.x - lastLocalAvatarPos.x;
      const ldz = visitorPosition.z - lastLocalAvatarPos.z;
      localRig.setMounted(Boolean(sailingThingId));
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
    const oceanMaterial = ocean.material;
    if (oceanMaterial instanceof THREE.ShaderMaterial && oceanMaterial.userData.tellusWaterShader) {
      oceanMaterial.uniforms.uTime.value = now * 0.001;
    }
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
    const cameraStartedAt = performance.now();
    performance.mark("tellus:updateCamera:start");
    updateCamera();
    performance.mark("tellus:updateCamera:end");
    performance.measure("tellus:updateCamera", "tellus:updateCamera:start", "tellus:updateCamera:end");
    perfDiagnostics.phases.cameraMs = performance.now() - cameraStartedAt;
    perfDiagnostics.phases.maxCameraMs = Math.max(
      perfDiagnostics.phases.maxCameraMs,
      perfDiagnostics.phases.cameraMs,
    );
    if (perfDiagnostics.lastPlayer) {
      perfDiagnostics.maxPlayerStep = Math.max(
        perfDiagnostics.maxPlayerStep,
        Math.hypot(
          visitorPosition.x - perfDiagnostics.lastPlayer.x,
          visitorPosition.z - perfDiagnostics.lastPlayer.z,
        ),
      );
      perfDiagnostics.maxVerticalStep = Math.max(
        perfDiagnostics.maxVerticalStep,
        Math.abs(visitorPosition.y - perfDiagnostics.lastPlayer.y),
      );
    }
    perfDiagnostics.lastPlayer = { ...visitorPosition };
    if (perfDiagnostics.lastCamera) {
      perfDiagnostics.maxCameraStep = Math.max(
        perfDiagnostics.maxCameraStep,
        Math.hypot(
          camera.position.x - perfDiagnostics.lastCamera.x,
          camera.position.y - perfDiagnostics.lastCamera.y,
          camera.position.z - perfDiagnostics.lastCamera.z,
        ),
      );
    }
    perfDiagnostics.lastCamera = {
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    };
    updateDayNightCycle(Date.now(), now);
    flushTerrain();
    perfDiagnostics.phases.miscMs = performance.now() - miscStartedAt;
    phaseStartedAt = performance.now();
    if (chunkRenderer) {
      const movingOnFoot = hasMovementKeyHeld() && !sailingThingId && !flying;
      // current position owns eviction; movingOnFoot defers expensive LOD-upgrade rebuilds (see
      // ChunkRenderer.update's doc comment) until the player settles.
      chunkRenderer.update(visitorPosition.x, visitorPosition.z, movingOnFoot);
      chunkRenderer.ensureBaseChunk(visitorPosition.x, visitorPosition.z);
      if (chunkStreamProbe) {
        chunkRenderer.prefetch(chunkStreamProbe.x, chunkStreamProbe.z, 1);
        if (terrainOnlyDebug()) {
          chunkRenderer.ensureBaseChunk(chunkStreamProbe.x, chunkStreamProbe.z);
        }
      }
      const chunkStatsBeforeFlush = chunkRenderer.stats();
      const terrainOnlyActive = terrainOnlyDebug();
      // One terrain upload per moving frame keeps chunk crossings below the frame budget. This does
      // not reduce geometry or draw distance; look-ahead prefetching still prepares the same chunks.
      const movingBuildBudget = 1;
      chunkRenderer.flush(
        movingOnFoot ? movingBuildBudget : terrainOnlyActive ? 4 : 3,
        movingOnFoot ? 4 : terrainOnlyActive ? 14 : 9,
        movingOnFoot ? (terrainOnlyActive ? 2 : 3) : 6,
      );
      const changedTerrainRegions = chunkRenderer.consumeChangedRegions();
      if (changedTerrainRegions.length > 0) {
        procplants.notifyRegionsChanged(changedTerrainRegions);
      }
      // When the active chunk set changes (chunks streamed in/out), defer placed-asset grounding until
      // movement is idle. Treating streaming like a terrain edit used to invalidate all vegetation and
      // walk every generated thing on the boundary frame, which made every chunk crossing hitch.
      const postFlushChunkStats = chunkRenderer.stats();
      const activeChunks = postFlushChunkStats.active;
      const provisionalChunks = postFlushChunkStats.provisional;
      if (activeChunks !== lastActiveChunkCount || provisionalChunks !== lastProvisionalChunkCount) {
        lastActiveChunkCount = activeChunks;
        lastProvisionalChunkCount = provisionalChunks;
        if (!chunkStreamGroundingPending && chunkStreamGroundingQueue.length === 0) {
          chunkStreamGroundingPending = true;
          for (const thing of generated) {
            if (queuedChunkStreamGrounding.has(thing.id)) continue;
            queuedChunkStreamGrounding.add(thing.id);
            chunkStreamGroundingQueue.push(thing.id);
          }
        }
        perfDiagnostics.chunkStreaming.activeChanges++;
      }
      perfDiagnostics.chunkStreaming.queuedGrounding = chunkStreamGroundingQueue.length;
      perfDiagnostics.chunkStreaming.deferredGrounding = chunkStreamGroundingPending;
      if (
        chunkStreamGroundingPending &&
        !movingOnFoot &&
        performance.now() - lastChunkStreamGroundingAt > 250
      ) {
        const groundingStartedAt = performance.now();
        chunkStreamGroundingPending = false;
        lastChunkStreamGroundingAt = groundingStartedAt;
        const mounted = sailingThingId ? thingById(sailingThingId) : undefined;
        if (mounted && !isFreeMovingVehicle(mounted)) {
          groundThingToRenderedSurface(mounted);
          updateThingMeshPosition(mounted);
          visitorPosition = riderPositionForThing(mounted);
          publishGeneratedThing(mounted);
          sendPresenceUpdate(true);
        }
        let processed = 0;
        while (chunkStreamGroundingQueue.length > 0 && processed < 8) {
          if (performance.now() - groundingStartedAt > 4) break;
          const id = chunkStreamGroundingQueue.shift()!;
          queuedChunkStreamGrounding.delete(id);
          const thing = thingById(id);
          if (!thing) continue;
          if (isFreeMovingVehicle(thing)) continue;
          groundThingToRenderedSurface(thing);
          updateThingMeshPosition(thing);
          processed++;
        }
        chunkStreamGroundingPending = chunkStreamGroundingQueue.length > 0;
        perfDiagnostics.chunkStreaming.queuedGrounding = chunkStreamGroundingQueue.length;
        perfDiagnostics.chunkStreaming.lastGroundingMs = performance.now() - groundingStartedAt;
        perfDiagnostics.chunkStreaming.maxGroundingMs = Math.max(
          perfDiagnostics.chunkStreaming.maxGroundingMs,
          perfDiagnostics.chunkStreaming.lastGroundingMs,
        );
        perfDiagnostics.chunkStreaming.deferredGrounding = chunkStreamGroundingPending;
      }
    }
    perfDiagnostics.phases.chunkTerrainMs = performance.now() - phaseStartedAt;
    perfDiagnostics.phases.maxChunkTerrainMs = Math.max(
      perfDiagnostics.phases.maxChunkTerrainMs,
      perfDiagnostics.phases.chunkTerrainMs,
    );
    // Entry grounding + loading-screen reveal (runs only until the world is revealed).
    if (!worldReadyFired) {
      // Pin the player to the best-known ground EVERY frame while the world builds. This uses the
      // analytic ground height (available as soon as the chunk height provider is wired, independent of
      // whether the chunk mesh has been built), so the player can never spawn floating and never
      // accumulates a fall as chunks stream in. The overlay hides all of this from view.
      visitorPosition = groundedPositionForCurrentSurface(
        visitorPosition.x,
        visitorPosition.z,
        visitorPosition,
      );
      playerVy = 0;
      playerAirborne = false;
      // Ground is "built" once the actual spawn chunk mesh resolves (non-chunked worlds are always
      // ready). Start the settle clock from that point.
      const groundBuilt =
        !isChunked ||
        (chunkRenderer?.sampleHeight(visitorPosition.x, visitorPosition.z) ?? null) !== null;
      if (groundBuilt && !worldEntryGrounded) {
        worldEntryGrounded = true;
        worldEntryGroundedAt = performance.now();
      }
      // Reveal once the spawn terrain and a majority of the immediate procplant neighborhood are
      // built. Distant terrain and vegetation keep streaming after reveal; neither full queue should
      // define visual readiness for the player's entry area.
      const chunkStats = chunkRenderer?.stats();
      const spawnTerrainReady =
        !isChunked ||
        (groundBuilt && Boolean(chunkStats && chunkStats.active > 0));
      const plantStats = procplants.stats();
      // Wait for the chosen VRM avatar to finish mounting so the default robot isn't seen first.
      // "" (deterministic robot) and "classic" stay procedural by design — nothing to wait for there.
      const localAvatarPending =
        localAvatarId !== "" && localAvatarId !== "classic" && !avatarRigs.has(visitorId);
      const settledMs = worldEntryGroundedAt > 0 ? performance.now() - worldEntryGroundedAt : 0;
      if (isWorldEntryVisuallyReady({
        grounded: worldEntryGrounded,
        groundedForMs: settledMs,
        spawnTerrainReady,
        avatarReady: !localAvatarPending,
        procplantsEnabled,
        vegetation: plantStats,
      })) {
        window.clearTimeout(loadingOverlaySafetyTimer);
        removeLoadingOverlay("visually-ready");
      }
    }
    if (sailingThingId) {
      if (mountGroundCheckThingId !== sailingThingId) {
        mountGroundCheckThingId = sailingThingId;
        mountGroundCheckNextAt = 0; // freshly mounted — don't wait out a stale throttle window
      }
      const mounted = thingById(sailingThingId);
      if (
        mounted &&
        !isFreeMovingVehicle(mounted) &&
        now >= mountGroundCheckNextAt
      ) {
        mountGroundCheckNextAt = now + PET_GROUND_RAYCAST_INTERVAL_MS;
        const liveGround = footprintGroundY(mounted);
        const targetY =
          liveGround !== null && Number.isFinite(liveGround)
            ? liveGround + groundRelativeOffset(mounted.verticalOffset)
            : null;
        if (targetY !== null && targetY > mounted.position.y + 0.05) {
          mounted.position = { ...mounted.position, y: targetY };
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
    performance.mark("tellus:syncPetsToOwner:start");
    syncPetsToOwner(delta);
    performance.mark("tellus:syncPetsToOwner:end");
    performance.measure("tellus:syncPetsToOwner", "tellus:syncPetsToOwner:start", "tellus:syncPetsToOwner:end");
    // Keep the minimap view-cone from driving React during camera-only motion. Presence still carries yaw-ish
    // movement updates when the player actually moves; a future minimap overlay can subscribe outside React.
    if (Math.abs(yaw - lastConeYaw) > 0.02 && now - lastConePublishMs > 1000) {
      lastConeYaw = yaw;
      lastConePublishMs = now;
    }
    miscStartedAt = performance.now();
    flushPublish();
    if (now - lastPresencePruneAt > 5_000) {
      lastPresencePruneAt = now;
      pruneStaleRemotePresence(Date.now());
    }
    perfDiagnostics.phases.miscMs += performance.now() - miscStartedAt;
    perfDiagnostics.phases.maxMiscMs = Math.max(
      perfDiagnostics.phases.maxMiscMs,
      perfDiagnostics.phases.miscMs,
    );
    phaseStartedAt = performance.now();
    vegetation.update(visitorPosition.x, visitorPosition.z, visitorPosition.y, fpsValue, now);
    perfDiagnostics.phases.vegetationMs = performance.now() - phaseStartedAt;
    perfDiagnostics.phases.maxVegetationMs = Math.max(
      perfDiagnostics.phases.maxVegetationMs,
      perfDiagnostics.phases.vegetationMs,
    );
    phaseStartedAt = performance.now();
    procplants.update(visitorPosition.x, visitorPosition.z, visitorPosition.y, fpsValue, now);
    perfDiagnostics.phases.procplantsMs = performance.now() - phaseStartedAt;
    perfDiagnostics.phases.maxProcplantsMs = Math.max(
      perfDiagnostics.phases.maxProcplantsMs,
      perfDiagnostics.phases.procplantsMs,
    );
    phaseStartedAt = performance.now();
    ambientPhysics.step(delta);
    perfDiagnostics.phases.physicsMs = performance.now() - phaseStartedAt;
    perfDiagnostics.phases.maxPhysicsMs = Math.max(
      perfDiagnostics.phases.maxPhysicsMs,
      perfDiagnostics.phases.physicsMs,
    );
    try {
      phaseStartedAt = performance.now();
      const renderEvery = renderEveryDebug();
      const shouldRenderThisFrame = renderEvery <= 1 || perfDiagnostics.frames % renderEvery === 0;
      // Render every frame, including while the entry overlay is up: this lets WebGL compile each new
      // material's shader incrementally as chunks/plants stream in (small per-frame costs, hidden behind
      // the overlay), instead of deferring them into one catastrophic multi-second first-frame compile.
      if (shouldRenderThisFrame) {
        // Frozen worlds reuse their shadow map; cycling worlds update only after meaningful sun-angle
        // movement. A slow reconciliation refresh picks up newly streamed casters.
        const shadowDecision = shadowUpdates.next({
          enabled: renderer.shadowMap.enabled,
          mode: runtimeConfig.dayNightMode,
          phase: currentLightingPhase,
          nowMs: now,
        });
        if (shadowDecision.refresh) {
          shadowFallbackFocus.set(visitorPosition.x, visitorPosition.y, visitorPosition.z);
          shadowCameraFit = fitDirectionalShadowCamera(
            sun,
            sunOffset,
            canopyShadowCasterBounds,
            shadowFallbackFocus,
          );
          sun.shadow.needsUpdate = true;
        }
        const gpuTimerActive = beginWebGlGpuTimer(perfDiagnostics.frames);
        try {
          renderPortalPreview();
          renderer.render(scene, camera);
        } finally {
          if (gpuTimerActive) endWebGlGpuTimer();
        }
      }
      perfDiagnostics.phases.renderMs = performance.now() - phaseStartedAt;
      perfDiagnostics.phases.maxRenderMs = Math.max(
        perfDiagnostics.phases.maxRenderMs,
        perfDiagnostics.phases.renderMs,
      );
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
    if (renderEveryDebug() <= 1 || perfDiagnostics.frames % renderEveryDebug() === 0) {
      renderAgentViewport();
    }
    const measuredMs =
      perfDiagnostics.phases.movementMs +
      perfDiagnostics.phases.chunkTerrainMs +
      perfDiagnostics.phases.vegetationMs +
      perfDiagnostics.phases.procplantsMs +
      perfDiagnostics.phases.physicsMs +
      perfDiagnostics.phases.renderMs +
      perfDiagnostics.phases.miscMs;
    const totalMs = Math.max(frameGapMs, performance.now() - frameStartedAt);
    if (totalMs >= 45 && totalMs >= (perfDiagnostics.slowFrame?.totalMs ?? 0)) {
      const recentResources = performance.getEntriesByType("resource")
        .slice(-10)
        .map((entry) => {
          const resource = entry as PerformanceResourceTiming;
          return {
            name: resource.name.split("/").slice(-3).join("/"),
            initiatorType: resource.initiatorType,
            duration: Math.round(resource.duration * 10) / 10,
            transferSize: resource.transferSize,
          };
        });
      perfDiagnostics.slowFrame = {
        frame: perfDiagnostics.frames,
        totalMs: Math.round(totalMs * 10) / 10,
        measuredMs: Math.round(measuredMs * 10) / 10,
        unmeasuredMs: Math.round(Math.max(0, totalMs - measuredMs) * 10) / 10,
        fps: fpsValue,
        position: { ...visitorPosition },
        phases: {
          movementMs: Math.round(perfDiagnostics.phases.movementMs * 10) / 10,
          chunkTerrainMs: Math.round(perfDiagnostics.phases.chunkTerrainMs * 10) / 10,
          vegetationMs: Math.round(perfDiagnostics.phases.vegetationMs * 10) / 10,
          procplantsMs: Math.round(perfDiagnostics.phases.procplantsMs * 10) / 10,
          physicsMs: Math.round(perfDiagnostics.phases.physicsMs * 10) / 10,
          renderMs: Math.round(perfDiagnostics.phases.renderMs * 10) / 10,
          cameraMs: Math.round(perfDiagnostics.phases.cameraMs * 10) / 10,
          miscMs: Math.round(perfDiagnostics.phases.miscMs * 10) / 10,
        },
        chunkTerrain: chunkRenderer?.stats() ?? null,
        chunkStreaming: {
          activeChanges: perfDiagnostics.chunkStreaming.activeChanges,
          deferredGrounding: perfDiagnostics.chunkStreaming.deferredGrounding,
          queuedGrounding: perfDiagnostics.chunkStreaming.queuedGrounding,
          lastGroundingMs: Math.round(perfDiagnostics.chunkStreaming.lastGroundingMs * 10) / 10,
          maxGroundingMs: Math.round(perfDiagnostics.chunkStreaming.maxGroundingMs * 10) / 10,
        },
        procplants: procplants.stats(),
        renderer: rendererDiagnostics(),
        browser: {
          visibilityState: document.visibilityState,
          hidden: document.hidden,
          heartbeat: {
            lastGapMs: perfDiagnostics.heartbeat.lastGapMs,
            maxGapMs: perfDiagnostics.heartbeat.maxGapMs,
            count: perfDiagnostics.heartbeat.count,
          },
          recentLongTasks: recentLongTasks.slice(-8),
          recentResources,
        },
      };
    }
    if (!destroyed) {
      scheduleNextFrame();
    }
  };
  const scheduleNextFrame = () => {
    if (destroyed) return;
    window.clearTimeout(animationTimerId);
    cancelAnimationFrame(animationId);
    if (frameDriverDebug() === "timeout") {
      animationTimerId = window.setTimeout(() => void animate(), 16);
    } else {
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
    if (event.key === "Escape" && wallDoorPlacement) {
      event.preventDefault();
      setInteriorWallDoorPlacement(null);
      return;
    }
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
    const key = event.key.toLowerCase();
    keys.add(key);
    if (isMovementKey(key)) lastWorldModelLoadMotionAt = performance.now();
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
    if (wallDoorPlacement) {
      event.preventDefault();
      const target = updateWallDoorPlacementGhost(event);
      if (target) {
        const portalId = createInteriorWallDoorAt(target, wallDoorPlacement.targetWorldId, wallDoorPlacement.label);
        setInteriorWallDoorPlacement(null);
        if (portalId) announcePortalSelection(portalId);
      }
      return;
    }
    // Move mode: every press repositions the target — no picking, no modifier.
    if (moveModeThingId) {
      const thing = thingById(moveModeThingId);
      if (thing && sailingThingId !== moveModeThingId && !ambientPhysics.has(moveModeThingId)) {
        draggingThingId = moveModeThingId;
        dragMoved = false;
        const target = dragGroundTarget(event);
        if (target) {
          moveGenerated(moveModeThingId, target.x - thing.position.x, target.z - thing.position.z, target.y);
          dragMoved = true;
        }
        return;
      }
      setMoveMode(null); // target vanished — drop the mode
    }
    const hasTerrainSurfaceBrush = terrainBrushMode || vegetationBrushArchetypeId;
    if (hasTerrainSurfaceBrush && !interiorObject && !isPointerFromUi(event.target) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const target = dragGroundTarget(event);
      if (target) {
        event.preventDefault();
        syncTerrainBrushPreviewStyle();
        terrainBrushPreview.position.set(target.x, target.y + 0.08, target.z);
        terrainBrushPreview.visible = true;
        if (vegetationBrushArchetypeId) {
          placeVegetationBrushAt(vegetationBrushArchetypeId, target);
          return;
        }
        if (!terrainBrushMode) return;
        sculptTerrainAtWorldPoint(terrainBrushMode, target);
        return;
      }
    }
    // Object grab: Ctrl/Cmd + drag on a mouse picks up ANY object (auto-selecting it); plain drag is
    // ALWAYS camera orbit so the two never fight. Touch (no modifier keys) keeps the old rule: press
    // the already-selected object to drag it.
    const portalId = pickPortalIdAtPointer(event);
    if (portalId) {
      event.preventDefault();
      announcePortalSelection(portalId);
      return;
    }
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
    // Classify the press for the click-to-move + right-drag-look scheme. Touch has no right button, so
    // a touch press is BOTH orbit-eligible (one-finger drag looks) and tap-eligible (tap walks/selects).
    const isTouch = event.pointerType === "touch";
    orbitEligible = isTouch || event.button === 2;
    tapEligible = isTouch || event.button === 0;
    if (!orbitEligible && !tapEligible) return; // e.g. middle mouse — ignore
    isDragging = true;
    pointerTravel = 0;
    pointerX = event.clientX;
    pointerY = event.clientY;
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (wallDoorPlacement) {
      updateWallDoorPlacementGhost(event);
      return;
    }
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
      moveGenerated(draggingThingId, dx, dz, target.y);
      dragMoved = true;
      return;
    }
    if (terrainBrushMode || vegetationBrushArchetypeId) {
      updateTerrainBrushPreview(event);
      return;
    }
    if (transformDragging || !isDragging) return;
    const dx = event.clientX - pointerX;
    const dy = event.clientY - pointerY;
    pointerTravel += Math.hypot(dx, dy);
    pointerX = event.clientX;
    pointerY = event.clientY;
    // Only orbit-eligible presses (right mouse / touch) turn the camera. A plain left-drag accumulates
    // travel (so it won't be mistaken for a tap-walk) but does NOT move the camera.
    if (!orbitEligible) return;
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

  const pickPortalIdAtPointer = (event: PointerEvent): string | null => {
    setPointerNdcFromEvent(event);
    raycaster.setFromCamera(pointerNdc, camera);
    const intersections = raycaster.intersectObjects([...portalMarkers.values()], true);
    for (const intersection of intersections) {
      let object: THREE.Object3D | null = intersection.object;
      while (object) {
        const portalId = object.userData.portalId;
        if (typeof portalId === "string") return portalId;
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
  const dragGroundTarget = (event: PointerEvent): Vec3 | null => {
    // Analytic ray-march against terrainHeight() — the math, not the (now ~90K-vertex) mesh, so a
    // pointer-move never pays a dense-mesh raycast. Coarse 2u steps then 14 bisection rounds.
    setPointerNdcFromEvent(event);
    raycaster.setFromCamera(pointerNdc, camera);
    const ray = raycaster.ray;
    if (interiorObject) {
      const hits = raycaster.intersectObject(interiorObject, true);
      for (const h of hits) {
        const n = h.face?.normal;
        if (!n) continue;
        const worldN = n.clone().applyNormalMatrix(
          new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld),
        );
        if (worldN.y <= 0.45 || h.point.y > visitorPosition.y + 1.35) continue;
        return interiorPlacementPosition(h.point.x, h.point.z, visitorPosition.y);
      }
      const fallbackDistance = 3.2;
      return interiorPlacementPosition(
        visitorPosition.x + Math.sin(yaw) * fallbackDistance,
        visitorPosition.z + Math.cos(yaw) * fallbackDistance,
        visitorPosition.y,
      );
    }
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
        const x = ray.origin.x + ray.direction.x * ft;
        const z = ray.origin.z + ray.direction.z * ft;
        return { x, y: sampleGround(x, z), z };
      }
      prevAbove = above;
      prevT = t;
    }
    return null;
  };

  // ── Explicit Move mode: a UI toggle (no modifier needed — works on every platform incl. touch).
  // While active for the selected object, ANY press/drag on the world repositions it (click =
  // teleport there, drag = carry); camera orbit is suspended until the mode is toggled off. ──
  const updateTerrainBrushPreview = (event: PointerEvent) => {
    if (
      (!terrainBrushMode && !vegetationBrushArchetypeId) ||
      interiorObject ||
      isPointerFromUi(event.target) ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      hideTerrainBrushPreview();
      return;
    }
    const target = dragGroundTarget(event);
    if (!target) {
      hideTerrainBrushPreview();
      return;
    }
    syncTerrainBrushPreviewStyle();
    terrainBrushPreview.position.set(target.x, target.y + 0.08, target.z);
    terrainBrushPreview.visible = true;
  };

  let moveModeThingId: string | null = null;
  const wallDoorTargetFromPointer = (event: PointerEvent): { position: Vec3; rotationY: number } | null => {
    if (!interiorObject) return null;
    setPointerNdcFromEvent(event);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObject(interiorObject, true);
    const bounds = interiorPlacementBounds(1.4);
    for (const h of hits) {
      const mesh = h.object as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.collide !== true) continue;
      const n = h.face?.normal;
      if (!n) continue;
      const worldN = n.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize();
      if (Math.abs(worldN.y) > 0.25) continue;
      const axisX = Math.abs(worldN.x) > Math.abs(worldN.z);
      const floorY = interiorPlacementFloorHeightAt(h.point.x, h.point.z, visitorPosition.y) ?? Math.max(0, visitorPosition.y);
      const x = axisX
        ? h.point.x + Math.sign(worldN.x || 1) * 0.12
        : bounds
          ? clamp(h.point.x, bounds.minX, bounds.maxX)
          : h.point.x;
      const z = axisX
        ? bounds
          ? clamp(h.point.z, bounds.minZ, bounds.maxZ)
          : h.point.z
        : h.point.z + Math.sign(worldN.z || 1) * 0.12;
      return {
        position: { x, y: floorY, z },
        rotationY: Math.atan2(worldN.x, worldN.z),
      };
    }
    return null;
  };

  const disposeWallDoorPlacementGhost = () => {
    if (!wallDoorPlacementGhost) return;
    portalMarkerGroup.remove(wallDoorPlacementGhost);
    disposeObject(wallDoorPlacementGhost);
    wallDoorPlacementGhost = null;
  };

  const updateWallDoorPlacementGhost = (event: PointerEvent): { position: Vec3; rotationY: number } | null => {
    const target = wallDoorTargetFromPointer(event);
    if (!target) {
      if (wallDoorPlacementGhost) wallDoorPlacementGhost.visible = false;
      return null;
    }
    if (!wallDoorPlacementGhost) {
      wallDoorPlacementGhost = makeWallDoorMarker(true);
      portalMarkerGroup.add(wallDoorPlacementGhost);
    }
    wallDoorPlacementGhost.visible = true;
    wallDoorPlacementGhost.position.set(target.position.x, target.position.y, target.position.z);
    wallDoorPlacementGhost.rotation.y = target.rotationY;
    return target;
  };

  const setInteriorWallDoorPlacement = (targetWorldId?: string | null, label?: string) => {
    const target = targetWorldId?.trim();
    if (!target) {
      wallDoorPlacement = null;
      disposeWallDoorPlacementGhost();
      container.style.cursor = moveModeThingId ? "move" : "";
      return;
    }
    if (!interiorObject) {
      addLog({
        agentId: "world",
        agentName: "Tellus",
        tool: "interact",
        text: "Enter an interior before placing a wall door.",
      });
      publish();
      return;
    }
    wallDoorPlacement = {
      targetWorldId: target,
      label: (label || `Door to ${target}`).slice(0, 48),
    };
    container.style.cursor = "crosshair";
    addLog({
      agentId: "world",
      agentName: "Tellus",
      tool: "interact",
      text: "Slide the door along a wall, then click to place it.",
    });
    publish();
  };

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
    // A short press that's tap-eligible (left button / touch) selects an object or walks to the ground.
    // Right-button releases fall through (they only look), so they never walk or change selection.
    if (isDragging && tapEligible && pointerTravel < 6) {
      const pickedThingId = pickThingIdAtPointer(event);
      selectGenerated(pickedThingId ?? undefined);
      if (
        !pickedThingId &&
        !isPointerFromUi(event.target) &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const target = dragGroundTarget(event);
        if (target) {
          if (pondWater.visible && pondRippleContains(target.x, target.z, -0.12)) {
            disturbPond(target, performance.now(), 0.72);
          }
          setPointWalkTarget(target);
        }
      }
    }
    isDragging = false;
  };
  const handlePointerCancel = () => {
    transformDragging = false;
    draggingThingId = null;
    isDragging = false;
    hideTerrainBrushPreview();
    container.style.cursor = moveModeThingId ? "move" : "";
  };
  const handleWheel = (event: WheelEvent) => {
    zoom = clamp(zoom + event.deltaY * 0.01, THIRD_PERSON_ZOOM_MIN, THIRD_PERSON_ZOOM_MAX);
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
  // Right-drag turns the camera, so suppress the browser context menu over the world canvas.
  const handleContextMenu = (event: MouseEvent) => {
    if (isPointerFromUi(event.target)) return; // let real UI (inputs, panels) keep their menu
    event.preventDefault();
  };
  container.addEventListener("contextmenu", handleContextMenu);

  const init = async () => {
    try {
      if (useWebGPU) {
        renderer = new WebGPURenderer({ antialias: true, alpha: false });
        await renderer.init();
      } else {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        initializeWebGlGpuTimer();
        addLog({
          agentId: "world",
          agentName: "Tellus",
          tool: "interact",
          text: "WebGPU is not available in this browser. Using simplified WebGL preview.",
        });
      }
      applyLowGpuDebugMode();
      renderer.domElement.addEventListener("webglcontextlost", (event) => {
        rendererContextLostCount++;
        rendererContextLastEvent = `lost:${Math.round(performance.now())}`;
        event.preventDefault();
      });
      renderer.domElement.addEventListener("webglcontextrestored", () => {
        rendererContextRestoredCount++;
        rendererContextLastEvent = `restored:${Math.round(performance.now())}`;
      });
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
      scheduleNextFrame();
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
  const configureWildlife = (
    animalId: string,
    options: { speciesProfileId?: string; herdId?: string; radiusMeters?: number; enabled?: boolean } = {},
  ) => {
    const thing = thingById(animalId);
    if (!thing) return { ok: false, error: `unknown generated animal id '${animalId}'` };
    if (worldSocket?.readyState !== WebSocket.OPEN) return { ok: false, error: "world socket is not connected" };
    const current = wildlifeConfigs.get(animalId);
    const profile = wildlifeSpeciesProfile(options.speciesProfileId?.trim() || current?.speciesProfileId || "deer");
    const config: WildlifeAnimalConfig = {
      animalId,
      enabled: options.enabled ?? true,
      speciesProfileId: profile?.id ?? "deer",
      movementMode: profile?.movementMode ?? current?.movementMode ?? "ground",
      herdId: options.herdId?.trim() || current?.herdId || "deer-default",
      home: {
        kind: "circle",
        center: current?.home?.center ?? { x: thing.position.x, z: thing.position.z },
        radiusMeters: clamp(options.radiusMeters ?? current?.home?.radiusMeters ?? 48, 2, 2_000),
      },
      seed: current?.seed ?? Math.abs([...animalId].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 17)),
      populationEligible: current?.populationEligible ?? true,
      revision: current?.revision ?? 0,
    };
    worldSocket.send(JSON.stringify({
      type: "wildlife.configure",
      visitorId,
      requestId: makeId("wildlife-configure"),
      config,
    }));
    return { ok: true, config };
  };

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
    getWildlife() {
      return [...wildlifeConfigs.values()].map((config) => ({
        ...config,
        pose: wildlifePoses.get(config.animalId) ?? null,
        renderTier: wildlifeTiers.get(config.animalId) ?? "culled",
      }));
    },
    configureWildlife,
    populateDeerHerd(
      options: { count?: number; herdId?: string; radiusMeters?: number; center?: { x: number; z: number } } = {},
    ) {
      if (worldSocket?.readyState !== WebSocket.OPEN) return { ok: false, error: "world socket is not connected" };
      const count = Math.round(clamp(options.count ?? 6, 1, DEER_WILDLIFE_PROFILE.populationCap));
      const herdId = options.herdId?.trim() || `deer-${makeId("herd").slice(-8)}`;
      const center = options.center ?? { x: visitorPosition.x, z: visitorPosition.z };
      const homeRadius = clamp(options.radiusMeters ?? 48, 8, 2_000);
      const members: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const angle = index * Math.PI * (3 - Math.sqrt(5));
        const distance = 3 + Math.sqrt(index / Math.max(1, count - 1)) * Math.min(10, homeRadius * 0.25);
        const x = center.x + Math.cos(angle) * distance;
        const z = center.z + Math.sin(angle) * distance;
        const thing = addLibraryAsset({
          id: "tellus-deer-stag",
          name: DEER_WILDLIFE_PROFILE.label,
          description: "low-poly stag deer wildlife",
          modelUrl: DEER_WILDLIFE_PROFILE.modelUrl,
          source: "generated",
        }, {
          creatorId: "visitor",
          ownerUserId: userId,
          location: { x, y: terrainHeight(x, z), z },
          scale: DEER_WILDLIFE_PROFILE.defaultScale,
        });
        members.push(thing.id);
        configureWildlife(thing.id, {
          speciesProfileId: DEER_WILDLIFE_PROFILE.id,
          herdId,
          radiusMeters: homeRadius,
        });
      }
      return { ok: true, herdId, members };
    },
    commandWildlife(args: {
      animalId?: string;
      herdId?: string;
      intent: "idle" | "graze" | "wander" | "travel" | "flee" | "return" | "gather";
      destination?: Vec3;
      from?: Vec3;
      durationSeconds?: number;
      reason?: string;
    }) {
      if (worldSocket?.readyState !== WebSocket.OPEN) return { ok: false, error: "world socket is not connected" };
      const selector = args.animalId ? { animalId: args.animalId } : args.herdId ? { herdId: args.herdId } : null;
      if (!selector) return { ok: false, error: "animalId or herdId is required" };
      worldSocket.send(JSON.stringify({
        type: "wildlife.command",
        visitorId,
        requestId: makeId("wildlife-command"),
        selector,
        intent: args.intent,
        destination: args.destination,
        from: args.from,
        durationSeconds: clamp(args.durationSeconds ?? 20, 1, 120),
        reason: args.reason,
      }));
      return { ok: true };
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
        verbs: ["moveSelf", "findReusableAssets", "placeReusableAsset", "listProceduralAssets", "placeProceduralAsset", "scatterProceduralAsset", "generate", "sayChat", "sculptTerrain", "moveAsset", "rotateAsset", "scaleAsset", "moveAssetToWater", "mountAsset", "dismount", "setPet", "enterPortal", "playAnimation", "listAnimations", "listAvatars", "setAvatar", "setAvatarScale"],
        // A small default vocabulary for embodied agents. The full VRMA feed is available by category
        // through listAnimations so agents don't have to reason over hundreds of near-duplicate clips.
        animations: recommendedEmoteClipNamesSync(),
        animationIntents: [
          "idle",
          "walk",
          "run",
          "fly",
          "swim",
          "flap",
          "dance",
          "wave",
          "throw",
          "jump",
          "sit",
          "stand",
          "graze",
          "mount",
          "dismount",
        ],
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
      return [
        ...PROCEDURAL_CATALOG.map((entry) => ({
          id: entry.id,
          label: entry.label,
          kind: entry.kind,
          scatterable: true,
        })),
        ...PROCPLANT_PLACEABLE_CATALOG.map((entry) => ({
          id: entry.id,
          label: entry.label,
          kind: entry.kind,
          scatterable: true,
        })),
      ];
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
          const mountedThing = sailingThingId ? thingById(sailingThingId) : undefined;
          if (sailingThingId && !mountedThing) sailingThingId = undefined;
          if (mountedThing) {
            const previousMountPosition = { ...mountedThing.position };
            const moved = resolveBlockableAgentMoveTarget(
              a,
              mountedThing.position,
              8,
              (x, z) => movedVehiclePositionForCurrentWorld(
                mountedThing,
                x,
                z,
                mountedThing.position,
              ),
              () => null,
            );
            mountedThing.position = moved.position;
            const dx = moved.position.x - previousMountPosition.x;
            const dz = moved.position.z - previousMountPosition.z;
            const isMoving = Math.hypot(dx, dz) > 0.001;
            if (isMoving) mountedThing.rotationY = Math.atan2(dx, dz);
            updateMountedAnimation(mountedThing, isMoving, false);
            updateThingMeshPosition(mountedThing);
            visitorPosition = riderPositionForThing(mountedThing);
            publishGeneratedThing(mountedThing);
            syncAnchoredPortalsForThing(mountedThing);
            sendPresenceUpdate(true);
            publish();
            return {
              ok: true,
              worldId: runtimeConfig.worldId,
              position: { ...visitorPosition },
              mountedThingId: mountedThing.id,
              mountedPosition: { ...mountedThing.position },
              mode: vehicleMode(mountedThing),
              target: moved.target,
              distanceRemaining: moved.distanceRemaining,
              reached: moved.reached,
            };
          }
          const currentPositionIsWater = isAgentPlacementWater(visitorPosition.x, visitorPosition.z);
          const moved = resolveBlockableAgentMoveTarget(
            a,
            visitorPosition,
            8,
            (x, z) => {
              const target = isChunked ? clampChunkedPoint(x, z) : { x, z };
              return groundedPositionForCurrentSurface(target.x, target.z, visitorPosition);
            },
            (x, z) => {
              const target = isChunked ? clampChunkedPoint(x, z) : { x, z };
              if (currentPositionIsWater || !isAgentPlacementWater(target.x, target.z)) return null;
              return {
                ...target,
                kind: "water",
                reason: "moveSelf cannot enter water or ocean in this world",
              };
            },
          );
          if (moved.blocked) {
            return {
              ok: false,
              error: moved.blocked.reason,
              worldId: runtimeConfig.worldId,
              position: { ...visitorPosition },
              target: moved.target,
              distanceRemaining: moved.distanceRemaining,
              reached: false,
              blocked: moved.blocked,
            };
          }
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
          const location = nearToLocation(a.near);
          const modelKind = inferGeneratedKind(
            model.description?.trim() || model.name,
            visitorId as GenerateRequest["creatorId"],
          );
          if (
            typeof location === "object" &&
            requiresDryLand(modelKind) &&
            isAgentPlacementWater(location.x, location.z)
          ) {
            return { ok: false, error: "This asset requires dry land; move ashore before placing it" };
          }
          const thing = addLibraryAsset(model, {
            creatorId: visitorId as GenerateRequest["creatorId"],
            location,
          });
          return { ok: true, id: thing.id, reused: model.id, name: model.name };
        }
        case "listProceduralAssets":
          return { ok: true, assets: tellusAgent.listProceduralAssets() };
        case "placeProceduralAsset": {
          const archetypeId = typeof a.archetypeId === "string" ? a.archetypeId : typeof a.id === "string" ? a.id : "";
          const option = proceduralAssetOption(archetypeId);
          if (!option) return { ok: false, error: "placeProceduralAsset requires a valid archetypeId" };
          const seed = typeof a.seed === "number" && Number.isFinite(a.seed)
            ? a.seed >>> 0
            : (Math.random() * 0xffffffff) >>> 0;
          const location = nearToLocation(a.near);
          const scale = typeof a.scale === "number"
            ? a.scale
            : option.scale();
          const plantLocation =
            typeof location === "string" ? { ...visitorPosition } : location;
          if (isAgentPlacementWater(plantLocation.x, plantLocation.z)) {
            return {
              ok: false,
              error: "placeProceduralAsset requires dry land; move ashore before planting",
              position: plantLocation,
            };
          }
          const plantPlacement = placeProcPlantAsset(option, seed, plantLocation, scale);
          if (plantPlacement) {
            return { ok: true, id: plantPlacement.id, archetypeId: option.id, label: option.label, chunkedVegetation: true };
          }
          const thing = addLibraryAsset(
            {
              id: option.assetId(seed),
              name: option.label,
              description: option.description,
              modelUrl: option.modelUrl(seed),
              assetStoreModelId: option.assetStoreModelId,
              source: option.assetStoreModelId ? "asset-library" : "generated",
            },
            {
              creatorId: visitorId as GenerateRequest["creatorId"],
              location,
              scale,
            },
          );
          return { ok: true, id: thing.id, archetypeId: option.id, label: option.label };
        }
        case "scatterProceduralAsset": {
          const archetypeId = typeof a.archetypeId === "string" ? a.archetypeId : typeof a.id === "string" ? a.id : "";
          const placed = scatterProceduralAsset(archetypeId, typeof a.count === "number" ? a.count : undefined);
          if (!placed.length) {
            return {
              ok: false,
              error: proceduralAssetOption(archetypeId)
                ? "No dry planting locations were found nearby; move ashore before scattering vegetation"
                : "scatterProceduralAsset requires a valid archetypeId",
            };
          }
          return {
            ok: true,
            archetypeId,
            count: placed.length,
            ids: placed.map((placement) => placement.id),
          };
        }
        case "generate": {
          if (typeof a.prompt !== "string" || !a.prompt.trim()) return { ok: false, error: "generate requires a prompt" };
          const prompt = a.prompt.trim();
          const location = nearToLocation(a.near);
          const kind = inferGeneratedKind(prompt, visitorId as GenerateRequest["creatorId"]);
          if (
            typeof location === "object" &&
            requiresDryLand(kind) &&
            isAgentPlacementWater(location.x, location.z)
          ) {
            return { ok: false, error: "This creation requires dry land; move ashore before generating it" };
          }
          const forceNew = a.force === true || a.generateNew === true || a.variant === true;
          if (!forceNew) {
            const suggestions = await reusableAssetsForPrompt(
              prompt,
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
            prompt,
            location,
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
        case "mountAsset":
        case "boardAsset": {
          const targetId =
            typeof a.targetId === "string"
              ? a.targetId
              : typeof a.assetId === "string"
                ? a.assetId
                : typeof a.id === "string"
                  ? a.id
                  : "";
          if (!targetId.trim()) return { ok: false, error: "mountAsset requires a targetId" };
          const thing = thingById(targetId.trim());
          if (!thing) return { ok: false, error: "mountAsset target not found" };
          const mode = vehicleMode(thing);
          if (!mode) return { ok: false, error: "target is not mountable" };
          boardGenerated(thing.id);
          return { ok: true, mountedThingId: sailingThingId, mode };
        }
        case "dismount":
        case "disembark": {
          const mountedThingId = sailingThingId;
          if (!mountedThingId) return { ok: false, error: "not mounted" };
          disembark();
          return { ok: true, dismountedThingId: mountedThingId };
        }
        case "setPet":
        case "setAssetPet": {
          const targetId =
            typeof a.targetId === "string"
              ? a.targetId
              : typeof a.assetId === "string"
                ? a.assetId
                : typeof a.id === "string"
                  ? a.id
                  : "";
          if (!targetId.trim()) return { ok: false, error: "setPet requires a targetId" };
          const thing = thingById(targetId.trim());
          if (!thing) return { ok: false, error: "setPet target not found" };
          const isPet =
            typeof a.isPet === "boolean"
              ? a.isPet
              : typeof a.pet === "boolean"
                ? a.pet
                : a.follow === false
                  ? false
                  : true;
          setGeneratedPet(thing.id, isPet);
          return { ok: true, id: thing.id, pet: isPet, petOwnerId: isPet ? petOwnerId : null };
        }
        case "enterPortal": {
          const portalId =
            typeof a.portalId === "string"
              ? a.portalId
              : typeof a.id === "string"
                ? a.id
                : "";
          if (!portalId.trim()) return { ok: false, error: "enterPortal requires a portalId" };
          enterPortal(portalId.trim());
          return { ok: true, portalId: portalId.trim() };
        }
        case "playAnimation": {
          const targetId =
            typeof a.targetId === "string"
              ? a.targetId
              : typeof a.assetId === "string"
                ? a.assetId
                : "";
          const explicit = typeof a.name === "string" ? a.name : typeof a.animation === "string" ? a.animation : "";
          const intent = typeof a.intent === "string" ? a.intent : "";
          const text = typeof a.text === "string" ? a.text : typeof a.prompt === "string" ? a.prompt : "";
          const requested = intent || explicit || text;
          if (!requested.trim()) {
            return { ok: false, error: "playAnimation requires an intent, name, animation, or text" };
          }
          if (targetId.trim()) {
            return playGeneratedIntent(targetId.trim(), requested, {
              persist: a.persist === false ? false : true,
            });
          }
          // Plays on the local avatar immediately and best-effort broadcasts to nearby clients. Exact
          // clip names still work; intents/text pick from the categorized VRMA catalog first.
          const animation = intent || text ? resolveAvatarAnimationName(requested, true) : resolveAvatarAnimationName(requested);
          const ok = intent || text ? playLocalAnimationIntent(requested) : playLocalEmote(animation);
          return ok
            ? { ok: true, animation, intent: normalizeAnimationIntent(requested) ?? inferAnimationIntentFromText(requested) }
            : { ok: false, error: "No avatar animation matched" };
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
    if (portal.anchorThingId && portal.anchorOffset) {
      portalAnchorOffsets.set(portal.id, { ...portal.anchorOffset });
    } else if (!portal.anchorThingId) {
      portalAnchorOffsets.delete(portal.id);
    }
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
            portalAnchorOffsets.delete(portal.id);
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
    portalAnchorOffsets.delete(id);
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
      if (existing.anchorThingId && existing.anchorOffset) {
        portalAnchorOffsets.set(existing.id, { ...existing.anchorOffset });
      }
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
    const position = anchor
      ? {
          x: Math.round(anchor.position.x + Math.sin(yaw) * Math.max(1.2, anchor.scale * 0.8)),
          y: anchor.position.y,
          z: Math.round(anchor.position.z + Math.cos(yaw) * Math.max(1.2, anchor.scale * 0.8)),
        }
      : {
          x: Math.round(visitorPosition.x),
          y: visitorPosition.y ?? SEA_LEVEL,
          z: Math.round(visitorPosition.z),
        };
    if (!anchor) position.y = groundHeightAt(position.x, position.z) ?? position.y;
    const anchorOffset = anchor
      ? rotateXZ(
          {
            x: position.x - anchor.position.x,
            y: position.y - anchor.position.y,
            z: position.z - anchor.position.z,
          },
          -(anchor.rotationY ?? 0),
        )
      : undefined;
    const portalId = makeId("portal");
    sendPortalUpsert({
      id: portalId,
      worldId: runtimeConfig.worldId,
      label: (label || target).slice(0, 48),
      position,
      radius: 1.7,
      rotation: { x: 0, y: anchor ? yaw - (anchor.rotationY ?? 0) : yaw, z: 0 },
      target: { kind: "world", worldId: target },
      ...(anchor ? { anchorThingId: anchor.id, anchorOffset } : {}),
    });
    announcePortalSelection(portalId);
  };
  const createInteriorWallDoorAt = (
    placement: { position: Vec3; rotationY: number },
    targetWorldId: string,
    label?: string,
  ): string | null => {
    const target = targetWorldId.trim();
    if (!target) return null;
    const portalId = makeId("door");
    sendPortalUpsert({
      id: portalId,
      worldId: runtimeConfig.worldId,
      label: (label || `${runtimeConfig.worldId} to ${target} door`).slice(0, 48),
      position: placement.position,
      radius: 1.7,
      rotation: { x: 0, y: placement.rotationY, z: 0 },
      target: { kind: "world", worldId: target },
    });
    return portalId;
  };
  const createDoorHere = (label?: string, sceneUrl?: string) => {
    const interiorId = `interior-${runtimeConfig.worldId}-${makeId("room").slice(0, 12)}`;
    const roomSceneUrl = sceneUrl?.trim() || GENERATED_INTERIOR_SCENE_URL;
    const anchor = selectedThingId ? thingById(selectedThingId) : undefined;
    const target = {
      kind: "interior" as const,
      worldId: interiorId,
      spawn: interiorDoorSpawnForSceneUrl(roomSceneUrl),
      sceneUrl: roomSceneUrl,
    };
    if (interiorObject) {
      const bounds = interiorPlacementBounds(1.4);
      const x = bounds ? clamp(visitorPosition.x, bounds.minX, bounds.maxX) : visitorPosition.x;
      const z = bounds?.minZ ?? visitorPosition.z;
      const y = interiorPlacementFloorHeightAt(x, z, visitorPosition.y) ?? Math.max(0, visitorPosition.y);
      const portalId = makeId("door");
      sendPortalUpsert({
        id: portalId,
        worldId: runtimeConfig.worldId,
        label: (label || "Door").slice(0, 48),
        position: { x, y, z },
        radius: 1.7,
        rotation: { x: 0, y: 0, z: 0 },
        target,
      });
      announcePortalSelection(portalId);
      return;
    }
    const position = anchor
      ? {
          x: anchor.position.x + Math.sin(yaw) * Math.max(1.25, anchor.scale * 0.8),
          y: anchor.position.y,
          z: anchor.position.z + Math.cos(yaw) * Math.max(1.25, anchor.scale * 0.8),
        }
      : groundedPositionForCurrentSurface(
          Math.round(visitorPosition.x + Math.sin(yaw) * 1.4),
          Math.round(visitorPosition.z + Math.cos(yaw) * 1.4),
          visitorPosition,
        );
    const anchorOffset = anchor
      ? rotateXZ(
          {
            x: position.x - anchor.position.x,
            y: position.y - anchor.position.y,
            z: position.z - anchor.position.z,
          },
          -(anchor.rotationY ?? 0),
        )
      : undefined;
    const portalId = makeId("door");
    sendPortalUpsert({
      id: portalId,
      worldId: runtimeConfig.worldId,
      label: (label || "Door").slice(0, 48),
      position,
      radius: 1.7,
      rotation: { x: 0, y: anchor ? yaw - (anchor.rotationY ?? 0) : yaw, z: 0 },
      target,
      ...(anchor ? { anchorThingId: anchor.id, anchorOffset } : {}),
    });
    announcePortalSelection(portalId);
  };

  return {
    enterPortal,
    createPortalHere,
    previewPortalTarget,
    startInteriorWallDoorPlacement: setInteriorWallDoorPlacement,
    updatePortalTarget,
    movePortal,
    liftPortal,
    rotatePortal,
    scalePortal,
    attachPortalToSelected,
    attachPortalToThing,
    detachPortal,
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
    setTerrainBrush,
    setTerrainBrushRadius,
    setVegetationBrush,
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
    setWorldTriggerVolumes,
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
      procplants: procplants.stats(),
      chunkTerrain: chunkRenderer?.stats() ?? null,
      physicsBodies: ambientPhysics.activeCount(),
      rapierSolids: rapierPhysics?.stats().solids ?? 0,
    }),
    destroy: () => {
      destroyed = true;
      window.clearTimeout(loadingOverlaySafetyTimer);
      loadingOverlay.remove();
      window.clearInterval(textureRetryTimer);
      if (worldChatPollTimer !== undefined) {
        window.clearInterval(worldChatPollTimer);
      }
      agentViewTarget?.dispose();
      setWorldTriggerVolumes(null);
      vegetation.dispose();
      procplants.dispose();
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
      // Dispose placed VRM rigs (own mixer + skinned scene buffers) and clear legacy mirror bookkeeping.
      for (const rig of generatedVrmRigs.values()) {
        rig.dispose();
      }
      generatedVrmRigs.clear();
      wildlifeProxyRenderer.dispose();
      wildlifeInterpolation.clear();
      wildlifeConfigs.clear();
      resetLiveMirrors();
      // Dispose the static-duplicate instancing pools (InstancedMeshes own their own instanceMatrix buffers;
      // geometry/materials are shared with the GLB cache, so InstancedMesh.dispose() leaves those alone).
      for (const modelUrl of [...instancePools.keys()]) {
        disableInstancePool(modelUrl);
      }
      cancelAnimationFrame(animationId);
      window.clearTimeout(animationTimerId);
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
      container.removeEventListener("contextmenu", handleContextMenu);
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
      delete window.__tellusAssetLodUrls;
      delete window.__tellusViewDebug;
      delete window.__tellusThingsDebug;
      delete window.__tellusMirrorDebug;
      delete window.__tellusEnterInterior;
      delete window.__tellusExitInterior;
      delete window.__tellusPerf;
      delete window.__tellusPerfReport;
      delete window.__tellusPerfReset;
      delete window.__tellusSetLowGpu;
      delete window.__tellusSetRenderEvery;
      delete window.__tellusSetFrameDriver;
      delete window.__tellusSetRenderer;
      longTaskObserver?.disconnect();
      window.clearInterval(heartbeatTimer);
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
      scene.remove(terrainBrushPreview);
      terrainBrushPreview.geometry.dispose();
      disposeMaterial(terrainBrushPreview.material);
      scene.remove(pointWalkMarker);
      pointWalkMarkerRing.geometry.dispose();
      disposeMaterial(pointWalkMarkerRing.material);
      pointWalkMarkerDot.geometry.dispose();
      disposeMaterial(pointWalkMarkerDot.material);
      resizeObserver?.disconnect();
      transformControls?.detach();
      transformControls?.dispose();
      disposeWallDoorPlacementGhost();
      disposePortalPreview();
      disposeWebGlGpuTimer();
      const disposePondSimulation = pondWater.userData.disposePondSimulation as
        | (() => void)
        | undefined;
      disposePondSimulation?.();
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
const AVATAR_DRAWER_BATCH_SIZE = 24;
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

interface PendingPortalTransfer {
  things: WorldGeneratedThing[];
  mountedThingId?: string;
  arrival: { x: number; z: number } | null;
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

const BUILDING_MATERIAL_SWATCHES: Record<BuildingMaterialStyle, { wall: string; roof: string; trim: string; base: string; detail: string }> = {
  auto: { wall: "#d3c19a", roof: "#66717a", trim: "#4f3324", base: "#817866", detail: "#6f5846" },
  brick: { wall: "#9c4f35", roof: "#66717a", trim: "#4f3324", base: "#5b4038", detail: "#d6aa82" },
  "stone-ashlar": { wall: "#6f7068", roof: "#66717a", trim: "#4f3324", base: "#555750", detail: "#a5a69c" },
  "stone-rubble": { wall: "#5e5f56", roof: "#66717a", trim: "#4f3324", base: "#46483f", detail: "#97998e" },
  "wood-plank": { wall: "#8c6844", roof: "#6b4a2f", trim: "#5a3925", base: "#81817a", detail: "#c7ad79" },
  "timber-frame": { wall: "#d3c19a", roof: "#66717a", trim: "#4f3324", base: "#817866", detail: "#4f3324" },
  plaster: { wall: "#d7d0bd", roof: "#66717a", trim: "#5a4330", base: "#7a746b", detail: "#eee6d3" },
  stucco: { wall: "#cfc2a5", roof: "#66717a", trim: "#5a4330", base: "#83715a", detail: "#eee3c7" },
  adobe: { wall: "#b88755", roof: "#a34c2f", trim: "#4f3324", base: "#c2a772", detail: "#d0a079" },
  "desert-adobe": { wall: "#bc8559", roof: "#a34c2f", trim: "#4f3324", base: "#bc8559", detail: "#d7ad7e" },
  "log-siding": { wall: "#7b5637", roof: "#6b4a2f", trim: "#4f3324", base: "#81817a", detail: "#4f3324" },
  "cotswold-cottage": { wall: "#c9b47b", roof: "#4a3024", trim: "#4d3323", base: "#ad9868", detail: "#e0cf9b" },
  "fieldstone-cottage": { wall: "#a9aca5", roof: "#4a3024", trim: "#4d3323", base: "#8d9089", detail: "#d0d2cc" },
  "green-fieldstone-cottage": { wall: "#a9aca5", roof: "#586a45", trim: "#405137", base: "#8d9089", detail: "#d0d2cc" },
  "brick-cottage": { wall: "#a75a3c", roof: "#4a3024", trim: "#4d3323", base: "#7a3d2b", detail: "#d5a184" },
  "white-tudor": { wall: "#e8dfc7", roof: "#66717a", trim: "#35231a", base: "#83715a", detail: "#35231a" },
  "cedar-shingle": { wall: "#8b6040", roof: "#8b6040", trim: "#f2efe4", base: "#a7aaa4", detail: "#5a3827" },
  "weathered-shingle": { wall: "#8e8a7d", roof: "#8e8a7d", trim: "#f2efe4", base: "#a7aaa4", detail: "#5d5b54" },
  "blue-shingle": { wall: "#6f8791", roof: "#6f8791", trim: "#f2efe4", base: "#a7aaa4", detail: "#465c65" },
  "sage-shingle": { wall: "#7f8a73", roof: "#7f8a73", trim: "#f2efe4", base: "#a7aaa4", detail: "#4f5b48" },
};

function BuildingMaterialTile({
  option,
  selected,
  onSelect,
}: {
  option: { id: BuildingMaterialStyle; label: string };
  selected: boolean;
  onSelect: (id: BuildingMaterialStyle) => void;
}): React.ReactElement {
  const swatch = BUILDING_MATERIAL_SWATCHES[option.id];
  const style = {
    "--building-wall": swatch.wall,
    "--building-roof": swatch.roof,
    "--building-trim": swatch.trim,
    "--building-base": swatch.base,
    "--building-detail": swatch.detail,
  } as React.CSSProperties;
  return (
    <button
      type="button"
      className="building-material-tile"
      aria-pressed={selected}
      title={option.label}
      data-style={option.id}
      onClick={() => onSelect(option.id)}
    >
      <span className="building-material-thumb" style={style} aria-hidden="true">
        <span className="building-mini-roof">
          <span />
          <span />
          <span />
        </span>
        <span className="building-mini-body">
          <span className="building-mini-base" />
          <span className="building-mini-trim horizontal top" />
          <span className="building-mini-trim horizontal middle" />
          <span className="building-mini-trim vertical left" />
          <span className="building-mini-trim vertical center" />
          <span className="building-mini-trim vertical right" />
          <span className="building-mini-window one" />
          <span className="building-mini-window two" />
          <span className="building-mini-window three" />
        </span>
      </span>
      <span>{option.label}</span>
    </button>
  );
}

// One avatar-picker grid tile: store thumbnail when it loads, else a colored-initial fallback
// ("classic" has no store thumbnail and always renders the initial tile). Click = select.
interface DebugFpsValueProps {
  worldRef: React.RefObject<TellusWorldApi | null>;
}

function DebugFpsValue({ worldRef }: DebugFpsValueProps): React.ReactElement {
  const [fps, setFps] = useState(() => worldRef.current?.getFps() ?? 0);

  useEffect(() => {
    const refresh = () => setFps(worldRef.current?.getFps() ?? 0);
    refresh();
    const id = window.setInterval(refresh, 250);
    return () => window.clearInterval(id);
  }, [worldRef]);

  return <strong>{fps}</strong>;
}

interface DebugLiveRowsProps {
  worldRef: React.RefObject<TellusWorldApi | null>;
  rxEnabled: boolean;
}

function DebugLiveRows({ worldRef, rxEnabled }: DebugLiveRowsProps): React.ReactElement {
  const [p2pStats, setP2pStats] = useState<MeshStats | null>(null);
  const [ambientStats, setAmbientStats] = useState<ReturnType<
    TellusWorldApi["getAmbientStats"]
  > | null>(null);

  useEffect(() => {
    const refresh = () => {
      setP2pStats(worldRef.current?.getP2pStats() ?? null);
      setAmbientStats(worldRef.current?.getAmbientStats() ?? null);
    };
    refresh();
    const id = window.setInterval(refresh, 1000);
    return () => window.clearInterval(id);
  }, [worldRef]);

  return (
    <>
      {ambientStats && (
        <>
          <div className="debug-stats-row">
            procplants {ambientStats.procplants.chunks} chunks · {ambientStats.procplants.grassInstances} grass tufts ·{" "}
            {Math.round(ambientStats.procplants.grassTriangles)} grass tris · {ambientStats.procplants.plants} communities ·{" "}
            {ambientStats.procplants.organDraws} organ draws
          </div>
          <div className="debug-stats-row">
            branches {ambientStats.procplants.branchSegments} segments · {ambientStats.procplants.attachedLeaves} attached leaves · tree LOD{" "}
            {ambientStats.procplants.branchLod0}/{ambientStats.procplants.branchLod1}/{ambientStats.procplants.branchLod2} ·{" "}
            {ambientStats.procplants.impostors} impostors
          </div>
          <div className="debug-stats-row">
            plant work {ambientStats.procplants.lastUpdateMs} ms · build {ambientStats.procplants.lastBuildMs} ms /{" "}
            {ambientStats.procplants.maxBuildMs} max · queue {ambientStats.procplants.queuedRebuilds} · LOD{" "}
            {ambientStats.procplants.lod0}/{ambientStats.procplants.lod1}/{ambientStats.procplants.lod2} · deferred LOD{" "}
            {ambientStats.procplants.deferredLodChunks} · cold {ambientStats.procplants.deferredColdChunks} · physics{" "}
            {ambientStats.physicsBodies} · rapier {ambientStats.rapierSolids}
          </div>
        </>
      )}
      {ambientStats?.chunkTerrain && (
        <div className="debug-stats-row">
          terrain chunks {ambientStats.chunkTerrain.visible} visible / {ambientStats.chunkTerrain.active} cached ·{" "}
          {ambientStats.chunkTerrain.pending} pending · {ambientStats.chunkTerrain.failed} failed
        </div>
      )}
      <div className="debug-stats-row">
        P2P {p2pStats?.tx ? "TX on" : "TX off"} ·{" "}
        {(p2pStats?.rx ?? rxEnabled) ? "RX on" : "RX off"} · {p2pStats?.rxStreams ?? 0}/16 streams
      </div>
      {(p2pStats?.peers ?? []).slice(0, 4).map((peer) => (
        <div key={peer.id} className="debug-stats-row">
          {peer.id.slice(0, 6)} {peer.state} · {Math.round(peer.kbps)} kbps
        </div>
      ))}
    </>
  );
}

function App(): React.ReactElement {
  const { askConfirm, askPrompt, dialogs } = useDialogs();
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<TellusWorldApi | null>(null);
  const pendingPortalTransfersRef = useRef<Record<string, PendingPortalTransfer>>({});
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
  const [terrainBrushMode, setTerrainBrushMode] = useState<TerrainEditMode | null>(null);
  const defaultTerrainBrushRadius = TERRAIN_SCULPT_RADIUS * WORLD_SCALE * 0.68;
  const minTerrainBrushRadius = 0.75 * WORLD_SCALE;
  const maxTerrainBrushRadius = 24 * WORLD_SCALE;
  const [terrainBrushRadius, setTerrainBrushRadiusState] = useState(defaultTerrainBrushRadius);
  const [vegetationBrushId, setVegetationBrushId] = useState<string | null>(null);
  const [vegetationBrushMode, setVegetationBrushMode] = useState<"single" | "multi">("single");
  const clearTerrainBrush = () => {
    setTerrainBrushMode(null);
    setVegetationBrushId(null);
    setVegetationBrushMode("single");
    worldRef.current?.setTerrainBrush(null);
    worldRef.current?.setVegetationBrush(null);
  };
  const selectTerrainBrush = (mode: TerrainEditMode) => {
    if (terrainBrushMode === mode) {
      clearTerrainBrush();
      return;
    }
    const next = mode;
    setTerrainBrushMode(next);
    setVegetationBrushId(null);
    setVegetationBrushMode("single");
    worldRef.current?.setTerrainBrush(next);
  };
  const changeTerrainBrushRadius = (radius: number) => {
    const next = Math.min(maxTerrainBrushRadius, Math.max(minTerrainBrushRadius, radius));
    setTerrainBrushRadiusState(next);
    worldRef.current?.setTerrainBrushRadius(next);
  };
  const selectVegetationBrush = (archetypeId: string, mode: "single" | "multi" = "single") => {
    const next = vegetationBrushId === archetypeId && vegetationBrushMode === mode ? null : archetypeId;
    setVegetationBrushId(next);
    setVegetationBrushMode(next ? mode : "single");
    setTerrainBrushMode(null);
    worldRef.current?.setTerrainBrush(null);
    worldRef.current?.setVegetationBrush(next, mode);
  };
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
    principalKind?: SocialPrincipalKind;
    principalId?: string;
    durable?: boolean;
    currentWorld?: boolean;
    worldId?: string;
    position?: Vec3;
  } | null>(null);
  const [registryPresence, setRegistryPresence] = useState<RegistryPresence[]>([]);
  const [registryPresenceStatus, setRegistryPresenceStatus] = useState<"idle" | "loading" | "ready" | "unknown">("idle");
  const [friendsSnapshot, setFriendsSnapshot] = useState<FriendsSnapshot>(EMPTY_FRIENDS_SNAPSHOT);
  const [friendsStatus, setFriendsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [friendsNotice, setFriendsNotice] = useState<{ kind: "status" | "error"; text: string } | null>(null);
  const [friendMutationsBusy, setFriendMutationsBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [directMessageThreads, setDirectMessageThreads] = useState<DirectMessageThreadSummary[]>([]);
  const [directMessagesStatus, setDirectMessagesStatus] = useState<"idle" | "loading" | "ready" | "unavailable" | "error">("idle");
  const [directMessageThread, setDirectMessageThread] = useState<DirectMessage[]>([]);
  const [directMessageThreadStatus, setDirectMessageThreadStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [directMessageNotice, setDirectMessageNotice] = useState<{ kind: "status" | "error"; text: string } | null>(null);
  const [directMessageSending, setDirectMessageSending] = useState(false);
  const [portalTargetWorldId, setPortalTargetWorldId] = useState("");
  // Hidden FPS overlay: triple-click the "Tellus World Weaver" brand box to toggle.
  const [showFps, setShowFps] = useState(false);
  const [debugModeFlags, setDebugModeFlags] = useState<string[]>(() => readDebugModeFlags());
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
  useEffect(() => {
    const refresh = () => {
      const next = readDebugModeFlags();
      setDebugModeFlags((current) => (current.join("|") === next.join("|") ? current : next));
    };
    refresh();
    const intervalId = window.setInterval(refresh, 1000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const debugModeBadge = debugModeFlags.length ? (
    <div className="debug-mode-badge" title={`Debug flags: ${debugModeFlags.join(", ")}`}>
      <span>Debug mode</span>
      <small>{debugModeFlags.join(", ")}</small>
    </div>
  ) : null;
  const [rxEnabled, setRxEnabled] = useState(true);
  const [txEnabled, setTxEnabled] = useState(false);
  const [audioListen, setAudioListen] = useState(false); // hear peers (RX audio) — off by default (autoplay)
  const [micOn, setMicOn] = useState(true); // your mic (TX audio) active while TX is on
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState<string>("");
  const [selectedCam, setSelectedCam] = useState<string>("");
  const [p2pError, setP2pError] = useState<string | null>(null);
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
  const [avatarCatalogLoading, setAvatarCatalogLoading] = useState(false);
  const [avatarVisibleCount, setAvatarVisibleCount] = useState(AVATAR_DRAWER_BATCH_SIZE);
  useEffect(() => subscribeAvatarCatalog(() => setAvatarCatalog(avatarCatalogSync())), []);
  useEffect(() => {
    setAvatarVisibleCount((count) => Math.min(Math.max(count, AVATAR_DRAWER_BATCH_SIZE), avatarCatalog.length));
  }, [avatarCatalog.length]);
  useEffect(() => {
    if (!runtimeConfigLoaded || !assetPanelOpen || assetPanelTab !== "avatar") return;
    let cancelled = false;
    setAvatarCatalogLoading(true);
    loadAvatarCatalog()
      .then((catalog) => {
        if (!cancelled) setAvatarCatalog(catalog);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setAvatarCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runtimeConfigLoaded, assetPanelOpen, assetPanelTab]);
  const onAvatarPick = (entry: AvatarCatalogEntry) => {
    setAvatarSelection(entry.id);
    worldRef.current?.setAvatarSelection(entry.id); // persists + swaps the rig + broadcasts
  };
  const visibleAvatarCatalog = avatarCatalog.slice(0, avatarVisibleCount);
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
  // Maker-owned roster. Null means not loaded; `makerAgentsSupported=false` is the mixed-version fallback
  // while Tellus is ahead of a Hyades deployment that does not expose /api/tellus/agents yet.
  const [makerAgents, setMakerAgents] = useState<MakerAgentDirectory | null>(null);
  const [makerAgentsSupported, setMakerAgentsSupported] = useState(true);
  const [makerAgentsError, setMakerAgentsError] = useState<string | null>(null);
  const [makerAgentBusyId, setMakerAgentBusyId] = useState<string | null>(null);
  const [makerAgentCreateOpen, setMakerAgentCreateOpen] = useState(false);
  const [makerAgentNameDraft, setMakerAgentNameDraft] = useState("");
  const [makerAgentPersonaDraft, setMakerAgentPersonaDraft] = useState("");
  const [makerAgentRenameId, setMakerAgentRenameId] = useState<string | null>(null);
  const [makerAgentRenameDraft, setMakerAgentRenameDraft] = useState("");
  const [makerAgentDeleteConfirm, setMakerAgentDeleteConfirm] = useState<string | null>(null);
  const defaultMakerAgent = makerAgents?.agents.find((agent) => agent.isDefault);
  const activeAgentName = agentStatus?.displayName?.trim()
    || defaultMakerAgent?.name.trim()
    || (agentStatus?.visitorId ? friendlyVisitorName(agentStatus.visitorId) : "Agent");
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

  // ── Maker-owned roster (new plural API; singular companion UI below remains the default agent) ──
  const refreshMakerAgents = useCallback(async (signal?: AbortSignal): Promise<MakerAgentDirectory | null> => {
    if (!account?.accountId) {
      setMakerAgents(null);
      return null;
    }
    try {
      const directory = await fetchMakerAgents(signal);
      setMakerAgents(directory);
      setMakerAgentsSupported(true);
      setMakerAgentsError(null);
      return directory;
    } catch (error) {
      if (signal?.aborted) return null;
      // Safe rolling order: an older Hyades returns 404/405. Keep the existing default-companion panel
      // functional and hide only the plural controls until the backend lands.
      if (error instanceof MakerAgentApiError && (error.status === 404 || error.status === 405)) {
        setMakerAgentsSupported(false);
        setMakerAgents(null);
        return null;
      }
      // Some pre-route gateways answer 405 without CORS headers, which Fetch intentionally exposes only as
      // a TypeError. Treat that like the same mixed-version absence; the existing singular panel still owns
      // the visible connectivity error if Hyades is genuinely unreachable.
      if (error instanceof TypeError) {
        setMakerAgentsSupported(false);
        setMakerAgents(null);
        return null;
      }
      setMakerAgentsError(error instanceof Error ? error.message : "Could not load your agents.");
      return null;
    }
  }, [account?.accountId]);

  useEffect(() => {
    if (!agentPanelOpen || !account?.accountId || !makerAgentsSupported) return;
    const controller = new AbortController();
    void refreshMakerAgents(controller.signal);
    const id = window.setInterval(() => void refreshMakerAgents(controller.signal), 5_000);
    return () => {
      controller.abort();
      window.clearInterval(id);
    };
  }, [account?.accountId, agentPanelOpen, makerAgentsSupported, refreshMakerAgents]);

  const updateMakerAgentRow = useCallback((updated: MakerAgentSummary) => {
    setMakerAgents((current) => current ? {
      ...current,
      agents: current.agents.map((agent) => agent.agentId === updated.agentId
        ? { ...updated, isDefault: agent.isDefault || updated.isDefault }
        : agent),
    } : current);
  }, []);

  const previewWorldTriggerVolumes = useCallback((definitions: Parameters<TellusWorldApi["setWorldTriggerVolumes"]>[0]) => {
    worldRef.current?.setWorldTriggerVolumes(definitions);
  }, []);

  const onCreateMakerAgent = useCallback(async () => {
    const name = makerAgentNameDraft.trim();
    if (!name) {
      setMakerAgentsError("Give the new agent a name.");
      return;
    }
    setMakerAgentBusyId("create");
    setMakerAgentsError(null);
    try {
      await createMakerAgent({
        worldId: canonicalWorldId(runtimeConfig.worldId),
        name,
        persona: makerAgentPersonaDraft.trim(),
      });
      await refreshMakerAgents();
      setMakerAgentNameDraft("");
      setMakerAgentPersonaDraft("");
      setMakerAgentCreateOpen(false);
    } catch (error) {
      setMakerAgentsError(error instanceof Error ? error.message : "Could not create agent.");
    } finally {
      setMakerAgentBusyId(null);
    }
  }, [makerAgentNameDraft, makerAgentPersonaDraft, refreshMakerAgents]);

  const onMakerAgentAction = useCallback(async (
    agent: MakerAgentSummary,
    action: "start" | "stop" | "place",
  ) => {
    setMakerAgentBusyId(agent.agentId);
    setMakerAgentsError(null);
    try {
      const updated = await runMakerAgentAction(
        agent.agentId,
        action,
        action === "place" ? canonicalWorldId(runtimeConfig.worldId) : undefined,
      );
      updateMakerAgentRow(updated);
      // The existing rich companion panel addresses the directory default. Refresh it after changing the
      // default through plural controls so status/viewport/chat never lag behind the roster.
      if (agent.isDefault) setAgentStatus(null);
      await refreshMakerAgents();
    } catch (error) {
      setMakerAgentsError(error instanceof Error ? error.message : `Could not ${action} agent.`);
    } finally {
      setMakerAgentBusyId(null);
    }
  }, [refreshMakerAgents, updateMakerAgentRow]);

  const onDeleteMakerAgent = useCallback(async (agent: MakerAgentSummary) => {
    if (makerAgentDeleteConfirm !== agent.agentId) {
      setMakerAgentDeleteConfirm(agent.agentId);
      return;
    }
    setMakerAgentBusyId(agent.agentId);
    setMakerAgentsError(null);
    try {
      await deleteMakerAgent(agent.agentId);
      const directory = await refreshMakerAgents();
      setMakerAgentDeleteConfirm(null);
      if (agent.isDefault) {
        setAgentStatus(null);
        setAgentChat([]);
        agentMergedKeysRef.current = new Set();
        // If another agent became default, the singular status poll will adopt it on its next pass.
        if (!directory?.defaultAgentId) setAgentViewportOn(false);
      }
    } catch (error) {
      setMakerAgentsError(error instanceof Error ? error.message : "Could not delete agent.");
    } finally {
      setMakerAgentBusyId(null);
    }
  }, [makerAgentDeleteConfirm, refreshMakerAgents]);

  const onRenameMakerAgent = useCallback(async (agent: MakerAgentSummary) => {
    const name = makerAgentRenameDraft.trim();
    if (!name) {
      setMakerAgentsError("Give the agent a name.");
      return;
    }
    setMakerAgentBusyId(agent.agentId);
    setMakerAgentsError(null);
    try {
      const updated = await renameMakerAgent(agent.agentId, name);
      updateMakerAgentRow(updated);
      setMakerAgentRenameId(null);
      setMakerAgentRenameDraft("");
      if (agent.isDefault) {
        setAgentStatus((current) => current ? { ...current, displayName: updated.name } : current);
      }
    } catch (error) {
      setMakerAgentsError(error instanceof Error ? error.message : "Could not rename agent.");
    } finally {
      setMakerAgentBusyId(null);
    }
  }, [makerAgentRenameDraft, updateMakerAgentRow]);

  const onMakerAgentRuntimePolicy = useCallback(async (
    agent: MakerAgentSummary,
    runtimePolicy: AgentRuntimePolicy,
  ) => {
    setMakerAgentBusyId(agent.agentId);
    setMakerAgentsError(null);
    try {
      updateMakerAgentRow(await setMakerAgentRuntimePolicy(agent.agentId, runtimePolicy));
    } catch (error) {
      setMakerAgentsError(error instanceof Error ? error.message : "Could not update agent presence.");
    } finally {
      setMakerAgentBusyId(null);
    }
  }, [updateMakerAgentRow]);

  // ── "Your Agent" panel handlers (rich controls for the maker directory's default agent) ──
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
      setAgentError(`Start ${activeAgentName} before talking to them.`);
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
            ? `Start ${activeAgentName} before talking to them.`
            : `Send failed (${res.status})`,
        );
        return false;
      }
      return true;
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : "Send failed.");
      return false;
    }
  }, [activeAgentName, agentStatus?.optedIn]);

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
        <b style={{ opacity: 0.7, fontWeight: 600 }}>
          {item.who === "you" ? "You: " : `${activeAgentName}: `}
        </b>
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
    const currentMakerWorldId = canonicalWorldId(runtimeConfig.worldId);
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
            {account?.accountId && makerAgentsSupported && (
              <section className="maker-agent-roster" aria-label="Your agents">
                <div className="maker-agent-roster__header">
                  <span>
                    Your agents{makerAgents ? ` (${makerAgents.agents.length})` : ""}
                  </span>
                  <button
                    type="button"
                    disabled={makerAgentBusyId !== null}
                    onClick={() => setMakerAgentCreateOpen((open) => !open)}
                    style={p2pBtnStyle(makerAgentCreateOpen)}
                  >
                    <Plus size={12} /> {makerAgentCreateOpen ? "Cancel" : "New"}
                  </button>
                </div>

                {makerAgentCreateOpen && (
                  <div className="maker-agent-create">
                    <input
                      value={makerAgentNameDraft}
                      maxLength={80}
                      onChange={(event) => setMakerAgentNameDraft(event.target.value)}
                      placeholder="Agent name"
                      aria-label="New agent name"
                    />
                    <textarea
                      value={makerAgentPersonaDraft}
                      maxLength={8000}
                      rows={3}
                      onChange={(event) => setMakerAgentPersonaDraft(event.target.value)}
                      placeholder="Personality or role (optional)"
                      aria-label="New agent personality"
                    />
                    <button
                      type="button"
                      disabled={makerAgentBusyId !== null || !makerAgentNameDraft.trim()}
                      onClick={() => void onCreateMakerAgent()}
                      style={p2pBtnStyle(true)}
                    >
                      {makerAgentBusyId === "create" ? "Creating…" : `Create in ${worldDisplayName(currentMakerWorldId)}`}
                    </button>
                  </div>
                )}

                {!makerAgents ? (
                  <span className="maker-agent-roster__empty">Loading agents…</span>
                ) : makerAgents.agents.length === 0 ? (
                  <span className="maker-agent-roster__empty">No agents yet. Create one to inhabit this world.</span>
                ) : (
                  <div className="maker-agent-list">
                    {makerAgents.agents.map((agent) => {
                      const busy = makerAgentBusyId === agent.agentId;
                      const isHere = canonicalWorldId(agent.worldId) === currentMakerWorldId;
                      return (
                        <article key={agent.agentId} className={agent.isDefault ? "maker-agent-card is-default" : "maker-agent-card"}>
                          <div className="maker-agent-card__identity">
                            <span
                              className="maker-agent-card__dot"
                              data-running={agent.enabled ? "true" : "false"}
                              aria-hidden="true"
                            />
                            <strong>{agent.name}</strong>
                            {agent.isDefault && <span className="maker-agent-card__badge">Companion</span>}
                          </div>
                          <span className="maker-agent-card__world">
                            {isHere ? "Here" : worldDisplayName(canonicalWorldId(agent.worldId))}
                            {agent.optedIn ? (agent.enabled ? " · awake" : " · sleeping") : " · stopped"}
                          </span>
                          <label className="maker-agent-card__runtime">
                            Presence
                            <select
                              value={agent.runtimePolicy}
                              disabled={busy}
                              onChange={(event) => void onMakerAgentRuntimePolicy(agent, event.target.value as AgentRuntimePolicy)}
                              aria-label={`Presence policy for ${agent.name}`}
                            >
                              <option value="makerPresent">With me</option>
                              <option value="eventDriven">Wake for events</option>
                              <option value="resident">Always resident</option>
                            </select>
                            {agent.eventWakesLastMinute > 0 && <span>{agent.eventWakesLastMinute} event wake{agent.eventWakesLastMinute === 1 ? "" : "s"}/min</span>}
                          </label>
                          {makerAgentRenameId === agent.agentId && (
                            <div className="maker-agent-card__actions">
                              <input
                                value={makerAgentRenameDraft}
                                maxLength={80}
                                autoFocus
                                onChange={(event) => setMakerAgentRenameDraft(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") void onRenameMakerAgent(agent);
                                  if (event.key === "Escape") setMakerAgentRenameId(null);
                                }}
                                aria-label={`New name for ${agent.name}`}
                              />
                              <button
                                type="button"
                                disabled={busy || !makerAgentRenameDraft.trim()}
                                onClick={() => void onRenameMakerAgent(agent)}
                                style={p2pBtnStyle(true)}
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setMakerAgentRenameId(null)}
                                style={p2pBtnStyle(false)}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                          {agent.lastEvaluation && (
                            <div className="maker-agent-card__evaluation" data-status={agent.lastEvaluation.status}>
                              <span className="maker-agent-card__evaluation-status">
                                Evaluation: {agent.lastEvaluation.status}
                                {agent.lastEvaluation.decision ? ` · ${agent.lastEvaluation.decision}` : ""}
                              </span>
                              {agent.lastEvaluation.summary && <span>{agent.lastEvaluation.summary}</span>}
                            </div>
                          )}
                          <div className="maker-agent-card__actions">
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`Rename ${agent.name}`}
                              onClick={() => {
                                setMakerAgentRenameId(agent.agentId);
                                setMakerAgentRenameDraft(agent.name);
                                setMakerAgentDeleteConfirm(null);
                              }}
                              style={p2pBtnStyle(makerAgentRenameId === agent.agentId)}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`${agent.optedIn ? "Stop" : "Start"} ${agent.name}`}
                              onClick={() => void onMakerAgentAction(agent, agent.optedIn ? "stop" : "start")}
                              style={p2pBtnStyle(agent.optedIn)}
                            >
                              {busy ? "…" : agent.optedIn ? "Stop" : "Start"}
                            </button>
                            {!isHere && (
                              <button
                                type="button"
                                disabled={busy}
                                aria-label={`Bring ${agent.name} to ${worldDisplayName(currentMakerWorldId)}`}
                                onClick={() => void onMakerAgentAction(agent, "place")}
                                style={p2pBtnStyle(false)}
                              >
                                Bring here
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`${makerAgentDeleteConfirm === agent.agentId ? "Confirm delete" : "Delete"} ${agent.name}`}
                              title={makerAgentDeleteConfirm === agent.agentId ? "Delete permanently" : "Delete agent"}
                              onClick={() => void onDeleteMakerAgent(agent)}
                              style={{ ...p2pBtnStyle(false), flex: "0 0 auto", paddingInline: 8 }}
                            >
                              {makerAgentDeleteConfirm === agent.agentId ? "Confirm" : <Trash2 size={12} />}
                            </button>
                            {makerAgentDeleteConfirm === agent.agentId && (
                              <button
                                type="button"
                                onClick={() => setMakerAgentDeleteConfirm(null)}
                                style={{ ...p2pBtnStyle(false), flex: "0 0 auto", paddingInline: 8 }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                          <AgentCapabilitiesPanel agent={agent} />
                        </article>
                      );
                    })}
                  </div>
                )}
                {makerAgents && makerAgents.agents.length > 0 && (
                  <AgentCollaborationPanel
                    agents={makerAgents.agents}
                    currentWorldId={currentMakerWorldId}
                  />
                )}
                {makerAgents && makerAgents.agents.length > 0 && (
                  <AgentAssetWorkshopPanel agents={makerAgents.agents} />
                )}
                {makerAgents && (
                  <WorldTriggersPanel
                    worldId={currentMakerWorldId}
                    agents={makerAgents.agents}
                    visitorPosition={snapshot.visitorPosition}
                    onAgentUpdated={updateMakerAgentRow}
                    onPreview={previewWorldTriggerVolumes}
                  />
                )}
                {makerAgentsError && <span className="maker-agent-roster__error">{makerAgentsError}</span>}
              </section>
            )}

            <span style={{ fontSize: 10, opacity: 0.6 }} title="Your companion keeps its identity and memories when it moves between worlds.">
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
          placeholder={optedIn ? `Message ${activeAgentName}...` : `Start ${activeAgentName} first (Settings)`}
          disabled={!optedIn}
          rows={5}
        />
        <div className="agent-tab-actions">
          {agentSpeech.supported && (
            <button
              type="button"
              className={agentSpeech.listening ? "agent-tab-mic active" : "agent-tab-mic"}
              title={agentSpeech.listening ? "Listening..." : `Speak to ${activeAgentName}`}
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
    const scheduleTick = () => {
      if (!document.hidden) void tick();
    };
    const warmupId = window.setTimeout(scheduleTick, 6_000);
    const id = window.setInterval(scheduleTick, 12_000);
    return () => {
      cancelled = true;
      window.clearTimeout(warmupId);
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
  const [newWorldChunkSize, setNewWorldChunkSize] = useState(() =>
    defaultChunkSizeForWorldTemplate(
      parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
    ),
  );
  const [newWorldDayNightMode, setNewWorldDayNightMode] = useState<DayNightMode>(
    runtimeConfig.dayNightMode,
  );
  const [newWorldLightingMood, setNewWorldLightingMood] = useState<LightingMood>(
    runtimeConfig.lightingMood,
  );
  const [newWorldWaterSettings, setNewWorldWaterSettings] = useState<WaterSettings>(
    runtimeConfig.waterSettings,
  );
  const [doorInteriorTemplate, setDoorInteriorTemplate] =
    useState<WorldTemplateId>("interior-studio");
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
  const [legacyCleanupBusy, setLegacyCleanupBusy] = useState(false);
  const [legacyCleanupProgress, setLegacyCleanupProgress] = useState<string | null>(null);
  const [savingWorld, setSavingWorld] = useState(false);
  const pendingDeleteTimerRef = useRef<number | undefined>(undefined);
  const KNOWN_WORLDS_KEY = "tellus.knownWorlds";
  const LAST_EXTERIOR_WORLD_KEY = "tellus.lastExteriorWorldId";
  const WORLD_PROFILES_KEY = "tellus.worldProfiles";
  const HIDDEN_WORLDS_KEY = "tellus.hiddenWorlds";
  const ACTIVE_WORLD_KEY = "tellus.activeWorldId";
  const NEW_WORLD_TEMPLATE_KEY = "tellus.newWorldTemplate";
  const NEW_WORLD_SKYBOX_KEY = "tellus.newWorldSkyboxUrl";
  const NEW_WORLD_NAME_KEY = "tellus.newWorldName";
  const NEW_WORLD_PRIVATE_KEY = "tellus.newWorldPrivate";
  const NEW_WORLD_CHUNK_SIZE_KEY = "tellus.newWorldChunkSize";
  const NEW_WORLD_CHUNK_SIZE_TEMPLATE_KEY = "tellus.newWorldChunkSizeTemplate";
  const NEW_WORLD_DAY_NIGHT_MODE_KEY = "tellus.newWorldDayNightMode";
  const NEW_WORLD_LIGHTING_MOOD_KEY = "tellus.newWorldLightingMood";
  const NEW_WORLD_WATER_SETTINGS_KEY = "tellus.newWorldWaterSettings";
  const defaultWorldTemplateRef = useRef<WorldTemplateId>(
    parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus"),
  );
  const defaultSkyboxUrlRef = useRef(runtimeConfig.skyboxUrl);
  const defaultLandShapeRef = useRef<LandShapeOverrides | undefined>(runtimeConfig.landShape);
  const pendingWorldProfileOverridesRef = useRef<Record<string, { profile: WorldRenderProfile; expiresAt: number }>>({});
  const metadataWriteDeniedRef = useRef<Record<string, number>>({});
  const newWorldFormHydratedRef = useRef(false);

  interface WorldRenderProfile {
    displayName?: string;
    worldTemplate?: WorldTemplateId;
    skyboxUrl?: string;
    landShape?: LandShapeOverrides;
    isPublic?: boolean;
    ownerId?: string;
    canEdit?: boolean;
    canDelete?: boolean;
    deleteReason?: string;
    dayNightMode?: DayNightMode;
    dayNightCycleMs?: number;
    dayNightStart?: number;
    lightingMood?: LightingMood;
    waterSettings?: WaterSettings;
    sceneUrl?: string;
    activeBiomeMixes?: unknown;
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
    const canEdit =
      typeof value.canEdit === "boolean"
        ? value.canEdit
        : typeof value.can_edit === "boolean"
          ? value.can_edit
          : typeof value.canWrite === "boolean"
            ? value.canWrite
            : typeof value.can_write === "boolean"
              ? value.can_write
              : undefined;
    const ownerId =
      typeof value.ownerId === "string" && value.ownerId.trim()
        ? value.ownerId.trim()
        : typeof value.owner_id === "string" && value.owner_id.trim()
          ? value.owner_id.trim()
          : typeof value.ownerUserId === "string" && value.ownerUserId.trim()
            ? value.ownerUserId.trim()
            : typeof value.userId === "string" && value.userId.trim()
              ? value.userId.trim()
              : typeof value.user_id === "string" && value.user_id.trim()
                ? value.user_id.trim()
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
    const activeBiomeMixes = value.activeBiomeMixes ?? value.active_biome_mixes;
    return {
      displayName,
      worldTemplate,
      skyboxUrl,
      landShape,
      isPublic,
      ownerId,
      canEdit,
      canDelete,
      deleteReason,
      dayNightMode,
      dayNightCycleMs,
      dayNightStart,
      lightingMood,
      waterSettings,
      sceneUrl,
      activeBiomeMixes,
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

  const loadHiddenWorlds = (): Record<string, number> => {
    try {
      const raw = window.localStorage.getItem(HIDDEN_WORLDS_KEY);
      const value = raw ? (JSON.parse(raw) as unknown) : {};
      if (!isRecord(value)) return {};
      const now = Date.now();
      const hidden: Record<string, number> = {};
      let changed = false;
      for (const [worldId, expiresAt] of Object.entries(value)) {
        if (typeof expiresAt !== "number" || expiresAt <= now) {
          changed = true;
          continue;
        }
        hidden[canonicalWorldId(worldId)] = expiresAt;
      }
      if (changed) window.localStorage.setItem(HIDDEN_WORLDS_KEY, JSON.stringify(hidden));
      return hidden;
    } catch {
      return {};
    }
  };

  const isWorldHidden = (worldId: string): boolean =>
    (loadHiddenWorlds()[canonicalWorldId(worldId)] ?? 0) > Date.now();

  const isMainWorld = (worldId: string): boolean =>
    canonicalWorldId(worldId) === canonicalWorldId("main");

  const canEditWorldFromProfile = (profile: WorldRenderProfile | undefined): boolean =>
    Boolean(
      profile?.canEdit ||
        (profile?.ownerId && profile.ownerId === tellusUserId()) ||
        (profile?.canDelete && profile.deleteReason === "owner"),
    );

  const isFrontendVisibleWorld = (worldId: string, profile?: WorldRenderProfile): boolean => {
    const key = canonicalWorldId(worldId);
    if (isMainWorld(key) || isAdmin) return true;
    const resolvedProfile = profile ?? loadLocalWorldProfiles()[key];
    return resolvedProfile?.isPublic === true || canEditWorldFromProfile(resolvedProfile);
  };

  const hideWorldLocally = (worldId: string, ttlMs = 7 * 24 * 60 * 60 * 1000) => {
    try {
      const hidden = loadHiddenWorlds();
      hidden[canonicalWorldId(worldId)] = Date.now() + ttlMs;
      window.localStorage.setItem(HIDDEN_WORLDS_KEY, JSON.stringify(hidden));
    } catch {
      /* ignore */
    }
  };

  const unhideWorldLocally = (worldId: string) => {
    try {
      const hidden = loadHiddenWorlds();
      delete hidden[canonicalWorldId(worldId)];
      window.localStorage.setItem(HIDDEN_WORLDS_KEY, JSON.stringify(hidden));
    } catch {
      /* ignore */
    }
  };

  const protectWorldProfileOverride = (worldId: string, profile: WorldRenderProfile, ttlMs = 60_000) => {
    pendingWorldProfileOverridesRef.current[canonicalWorldId(worldId)] = {
      profile,
      expiresAt: Date.now() + ttlMs,
    };
  };

  const pendingWorldProfileOverride = (worldId: string): WorldRenderProfile | undefined => {
    const key = canonicalWorldId(worldId);
    const pending = pendingWorldProfileOverridesRef.current[key];
    if (!pending) return undefined;
    if (pending.expiresAt <= Date.now()) {
      delete pendingWorldProfileOverridesRef.current[key];
      return undefined;
    }
    return pending.profile;
  };

  const rememberWorldProfile = (worldId: string, profile: WorldRenderProfile) => {
    try {
      const key = canonicalWorldId(worldId);
      if (profile.activeBiomeMixes !== undefined) {
        applyActiveBiomeMixRegistryForWorld(key, profile.activeBiomeMixes);
      }
      const profiles = loadLocalWorldProfiles();
      profiles[key] = { ...profiles[key], ...profile };
      window.localStorage.setItem(WORLD_PROFILES_KEY, JSON.stringify(profiles));
    } catch {
      /* ignore */
    }
  };

  const rememberRemoteWorldProfile = (worldId: string, profile: WorldRenderProfile) => {
    const key = canonicalWorldId(worldId);
    const existing = loadLocalWorldProfiles()[key] ?? {};
    const pending = pendingWorldProfileOverride(worldId);
    const merged: WorldRenderProfile = {
      ...existing,
      ...profile,
      ...(pending ?? {}),
    };
    rememberWorldProfile(worldId, merged);
  };

  const worldMetadataHeaders = (): HeadersInit => {
    const token = getSession()?.token;
    return {
      "Content-Type": "application/json",
      ...(token ? { [SESSION_HEADER]: token } : {}),
    };
  };

  const worldDisplayName = (worldId: string): string =>
    loadLocalWorldProfiles()[worldId]?.displayName?.trim() || fallbackWorldDisplayName(worldId);

  const worldOptionLabel = (worldId: string): string =>
    worldPickerLabel(worldId, loadLocalWorldProfiles()[worldId]?.displayName);

  const worldDestinationDetails = (worldId: string) => {
    const profile = loadLocalWorldProfiles()[canonicalWorldId(worldId)] ?? {};
    const template = profile.worldTemplate ?? templateForWorldId(worldId, "tellus");
    const interior = Boolean(profile.sceneUrl) || isInteriorWorldTemplate(template) || worldId.startsWith("interior-");
    const home = template === "tellus" || /(^|-)main$|tellus/i.test(worldId);
    const previewCandidate = templatePreviewUrl(template) || profile.skyboxUrl;
    const previewImageUrl = previewCandidate && /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(previewCandidate)
      ? previewCandidate
      : undefined;
    return {
      previewImageUrl,
      eyebrow: home ? "Home" : interior ? "Interior" : "World",
      description: home
        ? "Your island lobby and gathering place"
        : interior
          ? "A focused destination beyond the outdoor worlds"
          : "An explorable world shaped by its visitors",
    };
  };

  const canDeleteWorld = (worldId: string): boolean => {
    if (isProtectedWorldId(worldId)) return false;
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

  const selectedCreationTemplate = (): (typeof ALL_WORLD_CREATION_TEMPLATES)[number] | undefined =>
    ALL_WORLD_CREATION_TEMPLATES.find((template) => template.id === newWorldTemplate);

  const applyNewWorldTemplate = (template: WorldTemplateId) => {
    const next = parseWorldTemplateId(template, defaultWorldTemplateRef.current);
    const preset = ALL_WORLD_CREATION_TEMPLATES.find((option) => option.id === next);
    setNewWorldTemplate(next);
    setNewWorldSkyboxUrl(
      normalizeSkyboxUrl(preset?.defaultSkyboxUrl || defaultSkyboxUrlForTemplate(next)),
    );
    if (preset) {
      setNewWorldLightingMood(preset.defaultLightingMood);
      setNewWorldDayNightMode(preset.defaultDayNightMode);
      setNewWorldChunkSize(preset.defaultChunkSize);
      if (preset.defaultWaterSettings) {
        setNewWorldWaterSettings(preset.defaultWaterSettings);
      }
    }
  };

  const currentWorldMetadataProfile = (overrides: WorldRenderProfile = {}): WorldRenderProfile => {
    const activeId = canonicalWorldId(activeWorldId ?? runtimeConfig.worldId);
    const existing = activeId ? loadLocalWorldProfiles()[activeId] ?? {} : {};
    return {
      ...existing,
      worldTemplate: currentWorldTemplate,
      skyboxUrl: currentWorldSkyboxUrl,
      landShape: runtimeConfig.landShape,
      isPublic: currentWorldPrivate ? false : true,
      dayNightMode: currentDayNightMode,
      dayNightCycleMs: currentDayNightCycleMs,
      dayNightStart: runtimeConfig.dayNightStart,
      lightingMood: currentLightingMood,
      waterSettings: currentWaterSettings,
      ...overrides,
    };
  };

  const metadataWriteDenied = (worldId: string): boolean => {
    const key = canonicalWorldId(worldId);
    const expiresAt = metadataWriteDeniedRef.current[key] ?? 0;
    if (expiresAt <= Date.now()) {
      delete metadataWriteDeniedRef.current[key];
      return false;
    }
    return true;
  };

  const describeMetadataAccount = (): string => {
    const session = getSession();
    const accountId = account?.accountId ?? session?.account?.accountId ?? tellusUserId();
    const role = account?.role ?? session?.account?.role ?? (session ? "no role" : "not logged in");
    return `${accountId.slice(0, 8)}..., ${role}`;
  };

  const patchWorldMetadata = async (
    worldId: string,
    body: object,
    actionLabel: string,
  ): Promise<WorldRenderProfile | null> => {
    if (!runtimeConfig.worldApiBase || metadataWriteDenied(worldId)) return null;
    try {
      const response = await fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(worldId)}?userId=${encodeURIComponent(tellusUserId())}`,
        {
          method: "PATCH",
          headers: worldMetadataHeaders(),
          body: JSON.stringify(body),
        },
      );
      if (response.status === 403) {
        metadataWriteDeniedRef.current[canonicalWorldId(worldId)] = Date.now() + 30_000;
        showWorldNote(
          `${actionLabel} not saved on server: not authorized (${describeMetadataAccount()})`,
          6000,
        );
        return null;
      }
      if (!response.ok) {
        showWorldNote(`${actionLabel} not saved on server: HTTP ${response.status}`, 5000);
        return null;
      }
      return parseWorldRenderProfile(await response.json().catch(() => ({})));
    } catch (error) {
      showWorldNote(`${actionLabel} not saved: ${extractErrorMessage(String(error))}`, 5000);
      return null;
    }
  };

  const activeWorldMetadataPayload = (profile: WorldRenderProfile): object => ({
    name: profile.displayName || activeWorldId || runtimeConfig.worldId,
    displayName: profile.displayName,
    isPublic: profile.isPublic,
    worldTemplate: profile.worldTemplate,
    skyboxUrl: profile.skyboxUrl,
    landShape: profile.landShape,
    dayNightMode: profile.dayNightMode,
    dayNightCycleMs: profile.dayNightCycleMs,
    dayNightStart: profile.dayNightStart,
    lightingMood: profile.lightingMood,
    waterSettings: profile.waterSettings,
    ...(profile.sceneUrl ? { sceneUrl: profile.sceneUrl } : {}),
  });

  const saveActiveTerrainToHyades = async (): Promise<boolean> => {
    if (!terrainStateLoaded) return true;
    const body = tellusStatePayload();
    saveTerrainStateLocally(body);
    try {
      return await saveTellusWorldState(body);
    } catch (error) {
      console.warn("Tellus terrain save failed", error);
      return false;
    }
  };

  const saveActiveWorldSettings = async () => {
    const id = activeWorldId ?? runtimeConfig.worldId;
    if (!id || savingWorld) return;
    setSavingWorld(true);
    try {
      const profile = currentWorldMetadataProfile();
      protectWorldProfileOverride(id, profile);
      rememberWorldProfile(id, profile);
      const terrainSaved = await saveActiveTerrainToHyades();
      if (!terrainSaved) {
        showWorldNote("Terrain not saved to Hyades", 5000);
        return;
      }
      if (!runtimeConfig.worldApiBase) {
        showWorldNote("World settings saved locally");
        return;
      }
      const savedProfile = await patchWorldMetadata(
        id,
        activeWorldMetadataPayload(profile),
        "World settings",
      );
      if (savedProfile === null) return;
      if (Object.keys(savedProfile).length > 0) {
        rememberWorldProfile(id, { ...profile, ...savedProfile });
      }
      setWorldRenderRevision((revision) => revision + 1);
      await refreshWorldList(id);
      showWorldNote("World settings saved to Hyades");
    } finally {
      setSavingWorld(false);
    }
  };

  const renameActiveWorld = async () => {
    const id = activeWorldId ?? runtimeConfig.worldId;
    if (!id) return;
    const currentName = worldDisplayName(id);
    const next = await askPrompt({
      title: "Rename world",
      label: "World name",
      defaultValue: currentName === id ? "" : currentName,
      confirmLabel: "Save",
      maxLength: 64,
    });
    if (next === null) return;
    const displayName = next.trim().slice(0, 64);
    const requestedProfile = currentWorldMetadataProfile({ displayName: displayName || undefined });
    const applyLocalRename = (profile?: WorldRenderProfile) => {
      const finalProfile = {
        ...requestedProfile,
        ...(profile ?? {}),
        displayName: displayName || undefined,
      };
      protectWorldProfileOverride(id, finalProfile);
      rememberWorldProfile(id, finalProfile);
      setWorldRenderRevision((revision) => revision + 1);
      showWorldNote(displayName ? `Renamed world to "${displayName}"` : "World name cleared");
    };
    if (!runtimeConfig.worldApiBase) {
      applyLocalRename();
      return;
    }
    void patchWorldMetadata(id, activeWorldMetadataPayload(requestedProfile), "Rename").then((profile) => {
      if (profile === null) return;
      applyLocalRename(Object.keys(profile).length > 0 ? profile : undefined);
      void refreshWorldList(id);
    });
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
    unhideWorldLocally(worldId);
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
    const deletedOnServer = new Set<string>();
    try {
      const res = await fetch(
        `${runtimeConfig.worldApiBase}/api/tellus/worlds?userId=${encodeURIComponent(tellusUserId())}`,
        { cache: "no-store", headers: worldMetadataHeaders() },
      );
      const data = (await res.json()) as unknown;
      const list = Array.isArray(data)
        ? data
        : (data as { worlds?: unknown })?.worlds;
      if (Array.isArray(list)) {
        server = list
          .map((w) => {
            if (typeof w === "string") {
              const worldId = canonicalWorldId(w);
              return isFrontendVisibleWorld(worldId) ? worldId : undefined;
            }
            const world = w as { worldId?: string; exists?: boolean };
            if (typeof world.worldId === "string" && world.worldId.length > 0) {
              const worldId = canonicalWorldId(world.worldId);
              if (world.exists === false) {
                deletedOnServer.add(worldId);
                forgetWorld(worldId);
                return undefined;
              }
              const profile = parseWorldRenderProfile(w);
              if (Object.keys(profile).length > 0) rememberRemoteWorldProfile(worldId, profile);
              if (!isFrontendVisibleWorld(worldId, profile)) return undefined;
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
    const local = loadKnownWorlds()
      .map(canonicalWorldId)
      .filter((worldId) => !deletedOnServer.has(worldId) && !isWorldHidden(worldId) && isFrontendVisibleWorld(worldId));
    const currentEntry =
      cur && !deletedOnServer.has(cur) && !isWorldHidden(cur) && isFrontendVisibleWorld(cur)
        ? [cur]
        : [];
    setWorlds([...new Set([...server, ...local, ...currentEntry])].sort());
  };
  const switchWorld = (id: string) => {
    const next = canonicalWorldId(id);
    if (!next || next === activeWorldId) return;
    const current = activeWorldId ?? runtimeConfig.worldId;
    rememberWorld(next);
    try {
      if (next.startsWith("interior-") && current && !current.startsWith("interior-")) {
        window.localStorage.setItem(LAST_EXTERIOR_WORLD_KEY, canonicalWorldId(current));
      } else if (!next.startsWith("interior-")) {
        window.localStorage.setItem(LAST_EXTERIOR_WORLD_KEY, next);
      }
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
        verticalOffset: groundRelativeOffset(thing.verticalOffset),
        vehicleMode: thing.vehicleMode,
        hasAnimations: thing.hasAnimations,
        assetStoreModelId: thing.assetStoreModelId,
        modelUrl: thing.modelUrl,
        pipelineId: thing.modelUrl ? undefined : thing.pipelineId,
        generationStatus: thing.modelUrl ? "ready" : thing.generationStatus,
        animation: thing.animation ?? "",
        petOwnerId: thing.petOwnerId,
        animationClips: thing.animationClips,
        updatedAt: new Date().toISOString(),
      };
    });
  const transferMountedThing = (
    thing: GeneratedThing | undefined,
    arrival: { x: number; z: number } | null,
  ): WorldGeneratedThing | null => {
    if (!thing) return null;
    const position = arrival
      ? {
          x: arrival.x,
          y: thing.position.y,
          z: arrival.z,
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
      verticalOffset: groundRelativeOffset(thing.verticalOffset),
      vehicleMode: thing.vehicleMode,
      hasAnimations: thing.hasAnimations,
      assetStoreModelId: thing.assetStoreModelId,
      modelUrl: thing.modelUrl,
      pipelineId: thing.modelUrl ? undefined : thing.pipelineId,
      generationStatus: thing.modelUrl ? "ready" : thing.generationStatus,
      animation: thing.animation ?? "",
      petOwnerId: thing.petOwnerId,
      animationClips: thing.animationClips,
      updatedAt: new Date().toISOString(),
    };
  };
  // TELLUS INFINITY: when the scene reports a world.portal.entered, switch to the target world and warp to the
  // portal's spawn once the new scene is up (best-effort delayed warp — the world reloads async on the id change).
  useEffect(() => {
    const ps = snapshot.portalSwitch;
    if (!ps || !ps.toWorldId || ps.toWorldId === activeWorldId) return;
    if (ps.sceneUrl) {
      pendingInteriorSceneUrlsRef.current[ps.toWorldId] = ps.sceneUrl;
    }
    const ownerIds = new Set(
      [snapshot.userId, snapshot.visitorId, tellusUserId(), tellusVisitorId()]
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    const pets = snapshot.generated.filter(
      (thing) => !!thing.petOwnerId && ownerIds.has(thing.petOwnerId) && thing.id !== snapshot.sailingThingId,
    );
    const mountedThing = snapshot.sailingThingId
      ? snapshot.generated.find((thing) => thing.id === snapshot.sailingThingId)
      : undefined;
    const arrival =
      ps.spawn && !(isChunkedWorldId(ps.toWorldId) && Math.hypot(ps.spawn.x, ps.spawn.z) < 1)
        ? portalArrivalPosition(ps.spawn.x, ps.spawn.z)
        : null;
    const petTransfers = transferPetThings(pets, arrival);
    const mountedTransfer = transferMountedThing(mountedThing, arrival);
    const transfers = mountedTransfer ? [...petTransfers, mountedTransfer] : petTransfers;
    for (const pet of pets) {
      worldRef.current?.deleteGenerated(pet.id);
    }
    if (mountedThing) {
      worldRef.current?.deleteGenerated(mountedThing.id);
    }
    if (transfers.length > 0 || arrival) {
      pendingPortalTransfersRef.current[ps.toWorldId] = {
        things: transfers,
        mountedThingId: mountedTransfer?.id,
        arrival,
      };
    }
    switchWorld(ps.toWorldId);
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
  const exitInteriorWorld = () => {
    const fallback =
      worlds.find((worldId) => worldId && !worldId.startsWith("interior-")) ??
      canonicalWorldId(runtimeConfig.worldId);
    let target = fallback;
    try {
      const stored = window.localStorage.getItem(LAST_EXTERIOR_WORLD_KEY);
      if (stored?.trim() && !canonicalWorldId(stored).startsWith("interior-")) {
        target = canonicalWorldId(stored);
      }
    } catch {
      /* ignore */
    }
    if (!target || target === canonicalWorldId(activeWorldId ?? runtimeConfig.worldId)) {
      showWorldNote("No exterior world to return to", 3500);
      return;
    }
    switchWorld(target);
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
    const canAttemptServerDelete = Boolean(runtimeConfig.worldApiBase && serverDeleteAllowed);
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
    const confirmed = await askConfirm(
      canAttemptServerDelete
        ? {
            title: `Permanently delete "${label}"?`,
            message:
              "This removes the saved world from the template/world picker and cannot be undone.",
            confirmLabel: "Delete world",
            danger: true,
          }
        : {
            title: `Remove "${label}" from your local picker?`,
            message:
              "You are not authorized to delete it from the server, but you can hide this local/test entry.",
            confirmLabel: "Remove",
          },
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
    if (!canAttemptServerDelete) {
      forgetWorld(id);
      await moveAwayFromRemovedWorld();
      showWorldNote(
        runtimeConfig.worldApiBase
          ? `Removed "${label}" from this browser; the server copy remains`
          : `Removed local world "${label}"`,
        5000,
      );
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
      if (res.status === 404 || res.status === 410) {
        forgetWorld(id);
        await moveAwayFromRemovedWorld();
        showWorldNote(`Removed stale world "${id}"`);
        return;
      }
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
  const cleanupLegacyWorlds = async () => {
    if (!isAdmin || legacyCleanupBusy || !runtimeConfig.worldApiBase) return;
    const cleanupIds = validatedLegacyWorldCleanupIds();
    const confirmed = await askConfirm({
      title: `Delete ${cleanupIds.length} legacy test worlds?`,
      message:
        "This permanently deletes the approved experimental worlds and old interior instances. Main, Earth Flight, and the indoor creation templates are preserved.",
      confirmLabel: `Delete ${cleanupIds.length} worlds`,
      danger: true,
    });
    if (!confirmed) return;

    const token = getSession()?.token;
    let deleted = 0;
    let alreadyGone = 0;
    const failed: string[] = [];
    setLegacyCleanupBusy(true);
    try {
      for (let index = 0; index < cleanupIds.length; index += 1) {
        const worldId = cleanupIds[index];
        setLegacyCleanupProgress(`${index + 1}/${cleanupIds.length}: ${worldId}`);
        try {
          const response = await fetch(
            `${runtimeConfig.worldApiBase}/api/tellus/worlds/${encodeURIComponent(worldId)}?userId=${encodeURIComponent(tellusUserId())}`,
            {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { [SESSION_HEADER]: token } : {}),
              },
              body: JSON.stringify({ confirm: worldId }),
            },
          );
          if (response.ok) {
            deleted += 1;
            forgetWorld(worldId);
          } else if (response.status === 404 || response.status === 410) {
            alreadyGone += 1;
            forgetWorld(worldId);
          } else {
            failed.push(worldId);
          }
        } catch {
          failed.push(worldId);
        }
      }

      const activeId = activeWorldId ?? runtimeConfig.worldId;
      if (cleanupIds.includes(activeId)) {
        switchWorld("main");
      } else {
        await refreshWorldList();
      }
      showWorldNote(
        `Cleanup complete: ${deleted} deleted, ${alreadyGone} already gone${failed.length ? `, ${failed.length} failed` : ""}`,
        8000,
      );
    } finally {
      setLegacyCleanupBusy(false);
      setLegacyCleanupProgress(null);
    }
  };
  const renderWorldDeleteButton = (
    target: string,
    className = "world-icon-button",
    showLabel = false,
  ) => {
    if (isProtectedWorldId(target)) return null;
    const armed = pendingDeleteWorld === target;
    const serverDeleteAllowed = Boolean(runtimeConfig.worldApiBase && canDeleteWorld(target));
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
        {deletingWorld ? (
          "..."
        ) : armed ? (
          "Confirm"
        ) : (
          <>
            <Trash2 size={14} />
            {showLabel && (serverDeleteAllowed ? "Delete world" : "Remove from picker")}
          </>
        )}
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
    const localProfile: WorldRenderProfile = {
      displayName,
      worldTemplate: pickedTemplate,
      skyboxUrl: pickedSkybox,
      isPublic: !makePrivate,
      canEdit: true,
      dayNightMode: newWorldDayNightMode,
      dayNightCycleMs: currentDayNightCycleMs,
      dayNightStart: runtimeConfig.dayNightStart,
      lightingMood: newWorldLightingMood,
      waterSettings: newWorldWaterSettings,
      sceneUrl: pickedInteriorSceneUrl,
    };
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
          headers: worldMetadataHeaders(),
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
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const profile = parseWorldRenderProfile(await response.json().catch(() => ({})));
          rememberWorldProfile(id, {
            ...localProfile,
            ...profile,
          });
          enter();
        })
        .catch((error) => {
          showWorldNote(`World create failed: ${extractErrorMessage(error)}`, 4000);
        });
    } else {
      rememberWorldProfile(id, localProfile);
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
      const profile = currentWorldMetadataProfile({ skyboxUrl: next });
      protectWorldProfileOverride(activeWorldId, profile);
      void patchWorldMetadata(activeWorldId, profile, "Skybox");
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
      const profile = currentWorldMetadataProfile({ worldTemplate: next, landShape: undefined });
      protectWorldProfileOverride(activeWorldId, profile);
      void patchWorldMetadata(activeWorldId, profile, "Terrain template");
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
      const fullProfile = currentWorldMetadataProfile(profile);
      protectWorldProfileOverride(activeWorldId, fullProfile);
      void patchWorldMetadata(activeWorldId, fullProfile, "Lighting");
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
      const profile = currentWorldMetadataProfile({ waterSettings: next });
      protectWorldProfileOverride(activeWorldId, profile);
      void patchWorldMetadata(activeWorldId, profile, "Water settings");
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
      const profile = currentWorldMetadataProfile({ landShape });
      protectWorldProfileOverride(activeWorldId, profile);
      void patchWorldMetadata(activeWorldId, profile, "Terrain tuning");
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
      const profile = currentWorldMetadataProfile({ landShape: undefined });
      protectWorldProfileOverride(activeWorldId, profile);
      void patchWorldMetadata(activeWorldId, { ...profile, landShape: null }, "Terrain tuning");
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
  const [assetAnimalAnimatedOnly, setAssetAnimalAnimatedOnly] = useState(false);
  const [procBuildingType, setProcBuildingType] = useState<ProceduralBuildingType>("simple-house");
  const [procBuildingMaterial, setProcBuildingMaterial] = useState<BuildingMaterialStyle>("auto");
  const [procBuildingLighting, setProcBuildingLighting] = useState<BuildingLightingStyle>("warm");
  const [procBuildingRoof, setProcBuildingRoof] = useState(true);
  const assetWorldId = activeWorldId ?? runtimeConfig.worldId;
  const assetPrimaryTab: Extract<AssetPanelTab, "building" | "furniture"> =
    assetWorldId.startsWith("interior-") ? "furniture" : "building";
  const assetPrimaryLabel = assetPrimaryTab === "furniture" ? "Furniture" : "Buildings";
  // Map each browse tab to the store's real asset_category values. The store categorizes animals
  // under "fauna" (not "animal"), and the browse client expands furniture into furniture + props.
  const assetCategory =
    assetPanelTab === "flora"
      ? "flora"
      : assetPanelTab === "animal"
        ? assetAnimalAnimatedOnly ? "animated" : "fauna"
        : assetPanelTab === "building"
          ? "building"
          : assetPanelTab === "furniture"
            ? "furniture"
            : "";
  useEffect(() => {
    if (!assetPanelOpen) return;
    if ((assetPanelTab === "building" || assetPanelTab === "furniture") && assetPanelTab !== assetPrimaryTab) {
      setAssetPanelTab(assetPrimaryTab);
    }
  }, [assetPanelOpen, assetPanelTab, assetPrimaryTab]);
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
  const [createImageUrl, setCreateImageUrl] = useState("");
  const [createImageName, setCreateImageName] = useState("");

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
      const ok = await askConfirm({
        title: `Remove ${dead.length} broken object${dead.length === 1 ? "" : "s"}?`,
        message: `${preview}${dead.length > 6 ? ", …" : ""}`,
        confirmLabel: "Remove",
        danger: true,
      });
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
  const [travelMenuOpen, setTravelMenuOpen] = useState(false);
  const [worldMapOpen, setWorldMapOpen] = useState(true);
  // Portals card: foldable + dismissable (was always-on with no close — the worst right-side offender).
  const [portalsPanelOpen, setPortalsPanelOpen] = useState(false);
  const [selectedPortalId, setSelectedPortalId] = useState("");
  const [mapActorList, setMapActorList] = useState<"items" | "players" | "agents" | null>(null);
  const worldMapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const createImageInputRef = useRef<HTMLInputElement | null>(null);
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
            verticalOffset: groundRelativeOffset(item.verticalOffset),
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
          vehicleMode:
            item.vehicleMode === "water" || item.vehicleMode === "air" || item.vehicleMode === "ground"
              ? item.vehicleMode
              : undefined,
          hasAnimations: typeof item.hasAnimations === "boolean" ? item.hasAnimations : undefined,
          verticalOffset:
            typeof item.verticalOffset === "number" && Number.isFinite(item.verticalOffset)
              ? groundRelativeOffset(item.verticalOffset)
              : 0,
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
          animationClips: Array.isArray(item.animationClips)
            ? (item.animationClips as AssetAnimationMetadata[])
            : undefined,
          updatedAt:
            typeof item.updatedAt === "string"
              ? item.updatedAt
              : new Date().toISOString(),
        };
      })
      .filter((thing): thing is WorldGeneratedThing => thing !== null);
  };


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
          const savedChunkSizeTemplate = window.localStorage.getItem(NEW_WORLD_CHUNK_SIZE_TEMPLATE_KEY);
          const savedDayNightMode = window.localStorage.getItem(NEW_WORLD_DAY_NIGHT_MODE_KEY);
          const savedLightingMood = window.localStorage.getItem(NEW_WORLD_LIGHTING_MOOD_KEY);
          const savedWaterSettings = window.localStorage.getItem(NEW_WORLD_WATER_SETTINGS_KEY);
          const hydratedTemplate = parseWorldTemplateId(savedTemplate, defaultWorldTemplateRef.current);
          setNewWorldTemplate(hydratedTemplate);
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
          setNewWorldChunkSize(defaultChunkSizeForWorldTemplate(hydratedTemplate));
          if (savedChunkSize && savedChunkSizeTemplate === hydratedTemplate) {
            const parsed = Math.round(Number(savedChunkSize));
            if (Number.isFinite(parsed)) {
              setNewWorldChunkSize(Math.min(64, Math.max(1, parsed)));
            }
          }
          newWorldFormHydratedRef.current = true;
        } catch {
          setNewWorldTemplate(defaultWorldTemplateRef.current);
          setNewWorldSkyboxUrl(
            defaultSkyboxUrlRef.current || defaultSkyboxUrlForTemplate(defaultWorldTemplateRef.current),
          );
          setNewWorldName("");
          setNewWorldPrivate(false);
          setNewWorldChunkSize(defaultChunkSizeForWorldTemplate(defaultWorldTemplateRef.current));
          setNewWorldDayNightMode(runtimeConfig.dayNightMode);
          setNewWorldLightingMood(runtimeConfig.lightingMood);
          setNewWorldWaterSettings(runtimeConfig.waterSettings);
          newWorldFormHydratedRef.current = true;
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
    if (!newWorldFormHydratedRef.current) return;
    try {
      window.localStorage.setItem(NEW_WORLD_TEMPLATE_KEY, newWorldTemplate);
      window.localStorage.setItem(NEW_WORLD_SKYBOX_KEY, newWorldSkyboxUrl);
      window.localStorage.setItem(NEW_WORLD_NAME_KEY, newWorldName);
      window.localStorage.setItem(NEW_WORLD_PRIVATE_KEY, newWorldPrivate ? "1" : "0");
      window.localStorage.setItem(NEW_WORLD_CHUNK_SIZE_KEY, String(newWorldChunkSize));
      window.localStorage.setItem(NEW_WORLD_CHUNK_SIZE_TEMPLATE_KEY, newWorldTemplate);
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
        const portalTransfer = pendingPortalTransfersRef.current[activeWorldId];
        if (portalTransfer) {
          delete pendingPortalTransfersRef.current[activeWorldId];
          window.setTimeout(() => {
            if (cancelled || worldRef.current !== mountedWorld) return;
            if (portalTransfer.things.length > 0) {
              mountedWorld.importGeneratedThings(portalTransfer.things);
            }
            if (portalTransfer.mountedThingId) {
              mountedWorld.boardGenerated(portalTransfer.mountedThingId);
            } else if (portalTransfer.arrival) {
              mountedWorld.warpTo(portalTransfer.arrival.x, portalTransfer.arrival.z);
            }
          }, 650);
        }
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
  const activeSelectedPortal = selectedPortalId
    ? (snapshot.portals ?? []).find((portal) => portal.id === selectedPortalId) ?? null
    : null;
  const selectedRuntimeProfile = activeSelectedThing
    ? buildWorldThingRuntimeProfile(activeSelectedThing)
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
          if (!hasH) {
            // Unloaded chunks used to share the water palette, which made the map show temporary
            // blue lakes over terrain that appeared as the player approached. A subtle checker is
            // intentionally neutral: it communicates streaming state without inventing geography.
            const checker = ((i >> 3) + (j >> 3)) % 2;
            r = checker ? 48 : 40;
            g = checker ? 55 : 47;
            b = checker ? 48 : 42;
          } else if (terrainSampleKind === "water" || hh <= SEA_LEVEL) {
            const depth = clamp((SEA_LEVEL - hh) / 12, 0, 1);
            r = lerp(56, 18, depth);
            g = lerp(128, 70, depth);
            b = lerp(114, 92, depth);
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
  const refreshFriends = useCallback(async (signal?: AbortSignal, showLoading = false) => {
    if (!account?.accountId) return false;
    if (showLoading) setFriendsStatus("loading");
    try {
      const next = await fetchFriends(signal);
      setFriendsSnapshot(next);
      setFriendsStatus("ready");
      setFriendsNotice((current) => current?.kind === "error" ? null : current);
      return true;
    } catch (error) {
      if (signal?.aborted) return;
      setFriendsStatus("error");
      setFriendsNotice({ kind: "error", text: error instanceof Error ? error.message : "Friends are temporarily unavailable." });
      return false;
    }
  }, [account?.accountId]);

  const refreshDirectMessageInbox = useCallback(async (signal?: AbortSignal, showLoading = false) => {
    if (!account?.accountId) return false;
    if (showLoading) setDirectMessagesStatus("loading");
    try {
      const threads = await fetchDirectMessageInbox(signal);
      setDirectMessageThreads(threads);
      setDirectMessagesStatus("ready");
      setDirectMessageNotice((current) => current?.kind === "error" ? null : current);
      return true;
    } catch (error) {
      if (signal?.aborted) return false;
      if (error instanceof DirectMessagesApiError && (error.status === 404 || error.status === 405)) {
        setDirectMessagesStatus("unavailable");
        return false;
      }
      setDirectMessagesStatus("error");
      setDirectMessageNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Messages are temporarily unavailable.",
      });
      return false;
    }
  }, [account?.accountId]);

  useEffect(() => {
    if (!account?.accountId) return;
    const controller = new AbortController();
    void refreshFriends(controller.signal, true);
    return () => controller.abort();
  }, [account?.accountId, refreshFriends]);

  useEffect(() => {
    if (!account?.accountId) {
      setFriendsSnapshot(EMPTY_FRIENDS_SNAPSHOT);
      setFriendsStatus("idle");
      setRegistryPresence([]);
      setRegistryPresenceStatus("idle");
      setFriendsNotice(null);
      setFriendMutationsBusy(new Set());
      setDirectMessageThreads([]);
      setDirectMessagesStatus("idle");
      setDirectMessageThread([]);
      setDirectMessageThreadStatus("idle");
      setDirectMessageNotice(null);
      setDirectMessageSending(false);
      return;
    }
    if (!worldChatOpen || chatTab !== "dm") return;
    const controller = new AbortController();
    const refreshIntervalMs = 60_000;
    setFriendsRefreshIntervalMs(refreshIntervalMs);
    void refreshFriends(controller.signal, true);
    const interval = window.setInterval(() => void refreshFriends(controller.signal), refreshIntervalMs);
    const onFocus = () => void refreshFriends(controller.signal);
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [account?.accountId, chatTab, refreshFriends, worldChatOpen]);

  useEffect(() => {
    if (!account?.accountId || !worldChatOpen || chatTab !== "dm") return;
    const controller = new AbortController();
    const refresh = (showLoading = false) => {
      if (document.visibilityState === "hidden") return;
      void refreshDirectMessageInbox(controller.signal, showLoading);
    };
    refresh(true);
    const interval = window.setInterval(() => refresh(), 15_000);
    const onFocus = () => refresh();
    const onVisibilityChange = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [account?.accountId, chatTab, refreshDirectMessageInbox, worldChatOpen]);

  useEffect(() => {
    if (
      !account?.accountId ||
      !worldChatOpen ||
      chatTab !== "dm" ||
      !worldChatDmTarget?.durable ||
      !worldChatDmTarget.principalKind ||
      !worldChatDmTarget.principalId
    ) {
      setDirectMessageThreadStatus("idle");
      return;
    }
    if (directMessagesStatus === "unavailable") {
      setDirectMessageThreadStatus("error");
      setDirectMessageNotice({ kind: "error", text: "Cross-world messages are not available on this Hyades deployment yet." });
      return;
    }
    const target = { kind: worldChatDmTarget.principalKind, principalId: worldChatDmTarget.principalId };
    const controller = new AbortController();
    setDirectMessageThread([]);
    setDirectMessageThreadStatus("loading");
    setDirectMessageNotice(null);
    void fetchDirectMessageThread(target, { limit: 50, signal: controller.signal })
      .then((page) => {
        setDirectMessageThread(page.messages);
        setDirectMessageThreadStatus("ready");
        setDirectMessageThreads((current) => current.map((thread) =>
          thread.counterpart.kind === target.kind && thread.counterpart.id === target.principalId
            ? { ...thread, unreadCount: 0 }
            : thread));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DirectMessagesApiError && (error.status === 404 || error.status === 405)) {
          setDirectMessagesStatus("unavailable");
        }
        setDirectMessageThreadStatus("error");
        setDirectMessageNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "This conversation is temporarily unavailable.",
        });
      });
    return () => controller.abort();
  }, [
    account?.accountId,
    chatTab,
    directMessagesStatus,
    worldChatDmTarget?.durable,
    worldChatDmTarget?.principalId,
    worldChatDmTarget?.principalKind,
    worldChatOpen,
  ]);

  const friendUserIds = useMemo(
    () => friendsSnapshot.friends.filter((friend) => friend.kind === "account").map((friend) => friend.principalId),
    [friendsSnapshot.friends],
  );
  useEffect(() => {
    if (!account?.accountId || !worldChatOpen || chatTab !== "dm") return;
    if (friendUserIds.length === 0) {
      setRegistryPresence([]);
      setRegistryPresenceStatus("ready");
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const pollIntervalMs = 10_000;
    setPresencePollIntervalMs(pollIntervalMs);
    const loadPresence = async (initial = false) => {
      if (initial) setRegistryPresenceStatus("loading");
      try {
        const entries = await fetchPresenceForUsers(account.accountId, friendUserIds, controller.signal);
        if (cancelled) return;
        setRegistryPresence(entries);
        setRegistryPresenceStatus("ready");
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setRegistryPresenceStatus("unknown");
      }
    };
    void loadPresence(true);
    const interval = window.setInterval(() => void loadPresence(), pollIntervalMs);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [account?.accountId, chatTab, friendUserIds.join("\n"), worldChatOpen]);

  const mutateFriendship = useCallback(async (
    action: "request" | "accept" | "decline" | "remove",
    target: SocialPrincipalTarget,
  ) => {
    const busyKey = `${action}:${target.kind}:${target.principalId}`;
    setFriendMutationsBusy((current) => new Set(current).add(busyKey));
    setFriendsNotice(null);
    try {
      const result = action === "request"
        ? await sendFriendRequest(target)
        : action === "accept"
          ? await acceptFriendRequest(target)
          : action === "decline"
            ? await declineFriendRequest(target)
            : await removeFriend(target);
      const refreshed = await refreshFriends();
      if (!refreshed) return;
      const actionLabel = action === "request" ? "Friend request updated" : action === "accept" ? "Friend added" : action === "decline" ? "Request declined" : "Friendship updated";
      setFriendsNotice({ kind: "status", text: `${actionLabel}. ${result.outcome}.` });
    } catch (error) {
      setFriendsNotice({ kind: "error", text: error instanceof Error ? error.message : "The friendship update failed." });
    } finally {
      setFriendMutationsBusy((current) => {
        const next = new Set(current);
        next.delete(busyKey);
        return next;
      });
    }
  }, [refreshFriends]);
  const doorInteriorOptions = ALL_WORLD_CREATION_TEMPLATES.filter((option) =>
    isInteriorWorldTemplate(option.id),
  );
  const portalTargetOptions = worlds.filter((worldId) => worldId && worldId !== currentWorldId);
  useEffect(() => {
    if (portalTargetWorldId && portalTargetOptions.includes(portalTargetWorldId)) return;
    setPortalTargetWorldId(portalTargetOptions[0] ?? "");
  }, [portalTargetOptions.join("\n"), portalTargetWorldId]);
  useEffect(() => {
    if (!selectedPortalId) return;
    if ((snapshot.portals ?? []).some((portal) => portal.id === selectedPortalId)) return;
    setSelectedPortalId("");
  }, [selectedPortalId, snapshot.portals]);
  useEffect(() => {
    const onPortalSelected = (event: Event) => {
      const portalId = (event as CustomEvent<string>).detail;
      if (typeof portalId !== "string" || !portalId.trim()) return;
      setSelectedPortalId(portalId);
      setPortalsPanelOpen(true);
      window.setTimeout(() => {
        document
          .querySelector<HTMLElement>(`[data-portal-id="${CSS.escape(portalId)}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 0);
    };
    window.addEventListener("tellus:portal-selected", onPortalSelected);
    return () => window.removeEventListener("tellus:portal-selected", onPortalSelected);
  }, []);
  useEffect(() => {
    const target = portalsPanelOpen ? portalTargetWorldId : "";
    worldRef.current?.previewPortalTarget(target || null);
    if (!portalsPanelOpen) worldRef.current?.startInteriorWallDoorPlacement(null);
    return () => {
      worldRef.current?.previewPortalTarget(null);
      worldRef.current?.startInteriorWallDoorPlacement(null);
    };
  }, [portalsPanelOpen, portalTargetWorldId, currentWorldId]);
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
        userId: presence.ownerUserId,
        principalKind: kind === "agent" ? "agent" : presence.ownerUserId ? "account" : undefined,
        principalId: kind === "agent"
          ? presence.visitorId.replace(/^agent:/, "")
          : presence.ownerUserId,
        name: actorName(presence),
        kind,
        worldId,
        position: presence.position,
        online: isLivePresence(presence),
        currentWorld,
        canMessage: true,
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
    const presenceByUser = new Map(registryPresence.map((entry) => [entry.userId, entry]));
    for (const friend of friendsSnapshot.friends) {
      if (friend.kind === "account" && (friend.principalId === snapshot.userId || friend.principalId === account?.accountId)) continue;
      const contactKind = friend.kind === "agent" ? "agent" : "player";
      const key = friend.kind === "agent" ? `agent:agent:${friend.principalId}` : `player:${friend.principalId}`;
      const existing = byKey.get(key);
      const presence = friend.kind === "account" ? presenceByUser.get(friend.principalId) : undefined;
      const presenceWorldId = presence?.worldId ? canonicalWorldId(presence.worldId) : undefined;
      const currentWorld = existing?.currentWorld ?? presenceWorldId === currentWorldId;
      const locallyPresent = Boolean(existing?.currentWorld && existing.online);
      const presenceKnown = friend.kind === "agent" ? Boolean(existing) : locallyPresent || registryPresenceStatus === "ready";
      const online = friend.kind === "agent"
        ? Boolean(existing?.online)
        : locallyPresent || Boolean(registryPresenceStatus === "ready" && presence?.online);
      byKey.set(key, {
        visitorId: existing?.visitorId ?? (friend.kind === "agent" ? `agent:${friend.principalId}` : `user:${friend.principalId}`),
        userId: friend.userId,
        principalKind: friend.kind,
        principalId: friend.principalId,
        name: friend.displayName || presence?.name || existing?.name || friend.principalId.slice(0, 12),
        kind: contactKind,
        worldId: existing?.worldId ?? presenceWorldId,
        position: existing?.position,
        online,
        currentWorld,
        canMessage: directMessagesStatus !== "unavailable" || Boolean(existing?.canMessage && currentWorld && online),
        lastSeenAt: existing?.lastSeenAt || presence?.lastSeenAt,
        isFriend: true,
        friendSinceMs: friend.sinceMs,
        presenceKnown,
      });
    }

    if (agentStatus?.optedIn && agentStatus.visitorId) {
      const agentWorldId = canonicalWorldId(agentStatus.worldId || currentWorldId);
      const key = `agent:${agentStatus.visitorId}`;
      const existing = byKey.get(key);
      const existingInAgentWorld =
        existing?.worldId && canonicalWorldId(existing.worldId) === agentWorldId
          ? existing
          : undefined;
      byKey.set(key, {
        visitorId: agentStatus.visitorId,
        principalKind: "agent",
        principalId: agentStatus.agentId || agentStatus.visitorId.replace(/^agent:/, ""),
        name: existingInAgentWorld?.name || actorName({
          visitorId: agentStatus.visitorId,
          name: agentStatus.displayName || activeAgentName,
        }),
        kind: "agent",
        worldId: existingInAgentWorld?.worldId || agentWorldId,
        position: existingInAgentWorld?.position,
        online: existingInAgentWorld?.online ?? Boolean(agentStatus.enabled || agentStatus.ownerPresent || agentStatus.offlinePersistence),
        currentWorld: existingInAgentWorld?.currentWorld ?? agentWorldId === currentWorldId,
        canMessage: true,
        lastSeenAt: existingInAgentWorld?.lastSeenAt || agentStatus.lastTickAt || undefined,
      });
    }

    return [...byKey.values()]
      .filter((contact) => contact.isFriend || contact.online)
      .sort((a, b) => {
        if (a.isFriend !== b.isFriend) return a.isFriend ? -1 : 1;
        if (a.online !== b.online) return a.online ? -1 : 1;
        if (a.currentWorld !== b.currentWorld) return a.currentWorld ? -1 : 1;
        if (a.kind !== b.kind) return a.kind === "agent" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [
    activeAgentName,
    agentStatus?.displayName,
    agentStatus?.enabled,
    agentStatus?.lastTickAt,
    agentStatus?.offlinePersistence,
    agentStatus?.optedIn,
    agentStatus?.ownerPresent,
    agentStatus?.visitorId,
    agentStatus?.worldId,
    registryPresence,
    registryPresenceStatus,
    directMessagesStatus,
    friendsSnapshot.friends,
    account?.accountId,
    currentWorldId,
    remoteAgents,
    remotePlayers,
    snapshot.userId,
    snapshot.visitorId,
  ]);
  const friendContacts = chatTargets.filter((contact) => contact.isFriend);
  const nearbyContacts = chatTargets.filter((contact) => !contact.isFriend && contact.currentWorld);
  const directMessageUnreadCount = directMessageThreads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  const relationshipPrincipals = useMemo(() => new Set([
    ...friendsSnapshot.friends.map((entry) => `${entry.kind}:${entry.principalId}`),
    ...friendsSnapshot.pendingIncoming.map((entry) => `${entry.kind}:${entry.principalId}`),
    ...friendsSnapshot.pendingOutgoing.map((entry) => `${entry.kind}:${entry.principalId}`),
  ]), [friendsSnapshot]);
  const selectDirectChatTarget = (target: OnlineContact) => {
    setWorldChatDmTarget({
      ...target,
      durable: Boolean(
        target.isFriend &&
        target.principalKind &&
        target.principalId &&
        directMessagesStatus !== "unavailable"
      ),
    });
    setWorldChatChannel("dm");
    setChatTab("dm");
    setWorldChatInput("");
    setDirectMessageNotice(null);
  };
  const selectDirectMessageThread = (thread: DirectMessageThreadSummary) => {
    const kind = thread.counterpart.kind;
    setWorldChatDmTarget({
      visitorId: kind === "agent" ? `agent:${thread.counterpart.id}` : `user:${thread.counterpart.id}`,
      name: thread.counterpartDisplayName || thread.counterpart.id.slice(0, 12),
      kind: kind === "agent" ? "agent" : "player",
      principalKind: kind,
      principalId: thread.counterpart.id,
      durable: true,
    });
    setWorldChatChannel("dm");
    setChatTab("dm");
    setWorldChatInput("");
    setDirectMessageNotice(null);
  };
  const openDirectChatFor = (visitor: { visitorId: string; name?: string; position?: Vec3 }) => {
    const agent = visitor.visitorId.startsWith("agent:");
    const target = {
      visitorId: visitor.visitorId,
      name: actorName(visitor),
      kind: agent ? "agent" as const : "player" as const,
      principalKind: agent ? "agent" as const : undefined,
      principalId: agent ? visitor.visitorId.replace(/^agent:/, "") : undefined,
      durable: false,
      worldId: currentWorldId,
      position: visitor.position,
    };
    setWorldChatOpen(true);
    setWorldChatChannel("dm");
    setWorldChatDmTarget(target);
    setWorldChatInput("");
  };
  const finiteContactPosition = (contact: OnlineContact): Vec3 | undefined => {
    const position = contact.position;
    return position &&
      Number.isFinite(position.x) &&
      Number.isFinite(position.z)
      ? position
      : undefined;
  };
  const goToOnlineContact = (contact: OnlineContact) => {
    if (!contact.worldId || !contact.online) return;
    const position = finiteContactPosition(contact);
    if (contact.worldId === currentWorldId) {
      if (position) worldRef.current?.warpTo(position.x, position.z);
      return;
    }
    if (!position) {
      sharedLocationRef.current = null;
      switchWorld(canonicalWorldId(contact.worldId));
      return;
    }
    const nextLocation = {
      worldId: canonicalWorldId(contact.worldId),
      x: position.x,
      z: position.z,
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
  const sendDurableDirectMessage = async () => {
    if (
      !worldChatDmTarget?.durable ||
      !worldChatDmTarget.principalKind ||
      !worldChatDmTarget.principalId ||
      !worldChatInput.trim() ||
      directMessageSending
    ) return;
    const target = {
      kind: worldChatDmTarget.principalKind,
      principalId: worldChatDmTarget.principalId,
    };
    const text = worldChatInput.trim();
    const idempotencyKey = globalThis.crypto?.randomUUID?.()
      ?? `tellus-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setDirectMessageSending(true);
    setDirectMessageNotice(null);
    try {
      const result = await sendDirectMessage(target, text, idempotencyKey);
      setDirectMessageThread((current) => current.some((message) => message.messageId === result.message.messageId)
        ? current
        : [...current, result.message]);
      setDirectMessageThreadStatus("ready");
      setWorldChatInput("");
      if (result.deliveryPending) {
        setDirectMessageNotice({
          kind: "status",
          text: result.wakeScheduled
            ? `${worldChatDmTarget.name} has been notified.`
            : "Message saved; delivery will continue in the background.",
        });
      }
      void refreshDirectMessageInbox();
    } catch (error) {
      setDirectMessageNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "The message could not be sent.",
      });
    } finally {
      setDirectMessageSending(false);
    }
  };
  const sendWorldChatMessage = () => {
    if (worldChatChannel === "dm" && !worldChatDmTarget) return;
    if (worldChatChannel === "dm" && worldChatDmTarget?.durable) {
      void sendDurableDirectMessage();
      return;
    }
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
      account?.nip05?.trim() || account?.label?.trim() || undefined,
    );
    if (sent) setWorldChatInput("");
  };
  const inventory = snapshot.generated.filter(
    (thing) => thing.ownerUserId === snapshot.userId,
  );

  const acceptCreateImageFile = (file?: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) return;
      setCreateImageUrl(result);
      setCreateImageName(file.name);
      if (!prompt.trim()) {
        setPrompt(
          assetPrimaryTab === "furniture"
            ? "make a 3D model of this product photo for an interior"
            : "make a 3D model from this reference image",
        );
      }
    };
    reader.readAsDataURL(file);
  };

  const clearCreateImage = () => {
    setCreateImageUrl("");
    setCreateImageName("");
    if (createImageInputRef.current) createImageInputRef.current.value = "";
  };

  const submitPrompt = () => {
    worldRef.current?.submitVisitorPrompt(prompt, createImageUrl || undefined);
    setPrompt("");
    clearCreateImage();
    setCreatePromptOpen(false);
  };

  const focusCreatePrompt = () => {
    setCreatePromptOpen((open) => !open);
    window.requestAnimationFrame(() => promptRef.current?.focus());
  };

  const isToolOpen = (menu: ToolMenu): boolean => openToolMenus.includes(menu);

  const toggleAssetDrawer = () => {
    setAssetPanelOpen((open) => {
      if (!open) setAssetPanelTab(assetPrimaryTab);
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
    if (menu === "terrain") clearTerrainBrush();
    setOpenToolMenus((current) => current.filter((item) => item !== menu));
  };

  const toggleToolPanel = (menu: ToolMenu) => {
    if (menu === "terrain" && isToolOpen("terrain")) clearTerrainBrush();
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

  // ⌘K / Ctrl+K opens the command palette — reach any action by name.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCmdkOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const paletteCommands: CommandItem[] = [
    { id: "create", label: "Create something", icon: <Send size={16} />, hint: "⌘K then type", group: "Create", keywords: "generate make new prompt", onRun: focusCreatePrompt },
    { id: "assets", label: `Open ${assetPrimaryLabel.toLowerCase()}`, icon: <Building2 size={16} />, group: "Create", keywords: "assets objects things drawer", onRun: toggleAssetDrawer },
    { id: "terrain", label: "Shape terrain", icon: <Mountain size={16} />, group: "Create", keywords: "sculpt ground height", onRun: () => toggleToolPanel("terrain") },
    { id: "move", label: "Move the selected object", icon: <RotateCw size={16} />, group: "Create", keywords: "transform rotate gizmo mesh", onRun: showMeshToolbar },
    { id: "chat", label: "Open world chat", icon: <MessageCircle size={16} />, group: "Connect", keywords: "talk message say", onRun: () => { setChatTab("world"); setWorldChatOpen(true); } },
    { id: "agent", label: "Talk to an agent", icon: <Bot size={16} />, group: "Connect", keywords: "ai assistant omega", onRun: () => { setChatTab("agent"); setWorldChatOpen(true); } },
    { id: "avatar", label: "Change your avatar", icon: <PersonStanding size={16} />, group: "Connect", keywords: "appearance character look", onRun: () => openAssetDrawerTab("avatar") },
    { id: "travel", label: "Travel to another world", icon: <Plane size={16} />, group: "Navigate", keywords: "portal go teleport", onRun: () => { setTravelMenuOpen(true); setWorldMenuOpen(false); } },
    { id: "portals", label: "Open the portal list", icon: <Globe2 size={16} />, group: "Navigate", keywords: "gates doors", onRun: () => setPortalsPanelOpen(true) },
    { id: "world", label: "World settings", icon: <Globe2 size={16} />, group: "Navigate", keywords: "rename delete world menu", onRun: () => { setNewWorldPanelOpen(false); setWorldMenuOpen(true); setTravelMenuOpen(false); } },
    { id: "map", label: "Open the map", icon: <MapIcon size={16} />, hint: "M", group: "Navigate", keywords: "minimap overview", onRun: () => setWorldMapOpen(true) },
  ];

  // The bottom toolbelt, migrated onto the design-system Dock — one emphasized
  // primary (Create) + a secondary group, wired to the existing HUD handlers.
  const toolbeltItems: DockItem[] = [
    { id: "create", label: "Create", icon: <Send size={18} />, primary: true, active: createPromptOpen, onSelect: focusCreatePrompt },
    { id: "assets", label: assetPrimaryLabel, icon: assetPrimaryTab === "building" ? <Building2 size={18} /> : <Box size={18} />, active: assetPanelOpen && assetPanelTab === assetPrimaryTab, onSelect: toggleAssetDrawer },
    { id: "chat", label: "Chat", icon: <MessageCircle size={18} />, active: worldChatOpen && chatTab !== "agent", onSelect: () => { setChatTab("world"); setWorldChatOpen((open) => (chatTab === "agent" ? true : !open)); } },
    { id: "travel", label: "Travel", icon: <Plane size={18} />, active: travelMenuOpen, onSelect: () => { setTravelMenuOpen((open) => !open); setWorldMenuOpen(false); } },
    { id: "world", label: "World", icon: <Globe2 size={18} />, active: worldMenuOpen, onSelect: () => { setWorldMenuOpen((open) => { const next = !open; if (next) setNewWorldPanelOpen(false); return next; }); setTravelMenuOpen(false); } },
    { id: "map", label: "Map", icon: <MapIcon size={18} />, active: worldMapOpen, onSelect: () => setWorldMapOpen((open) => !open) },
    { id: "terrain", label: "Terrain", icon: <Mountain size={18} />, active: isToolOpen("terrain"), onSelect: () => toggleToolPanel("terrain") },
    { id: "move", label: "Move", icon: <RotateCw size={18} />, active: !!activeSelectedThing, onSelect: showMeshToolbar },
    { id: "agent", label: "Agent", icon: <Bot size={18} />, active: agentPanelOpen, onSelect: () => { setChatTab("agent"); setWorldChatOpen((open) => (chatTab === "agent" ? !open : true)); } },
    { id: "avatar", label: "Avatar", icon: <PersonStanding size={18} />, active: assetPanelOpen && assetPanelTab === "avatar", onSelect: () => openAssetDrawerTab("avatar") },
  ];

  const debugPanel = showFps ? (
    <div className="debug-stats-panel" aria-label="Tellus debug stats">
      <div className="debug-stats-grid">
        <span>FPS</span>
        <DebugFpsValue worldRef={worldRef} />
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
      <DebugLiveRows worldRef={worldRef} rxEnabled={rxEnabled} />
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
      <div className="debug-stats-hint">triple-click logo or press ` to hide</div>
    </div>
  ) : null;

  useEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 36), 116)}px`;
  }, [prompt]);

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
                  ? activeAgentName
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
                  {tab === "dm" ? (
                    <>DMs{directMessageUnreadCount > 0 && <span className="mini-chat-tab-badge" aria-label={`${directMessageUnreadCount} unread messages`}>{directMessageUnreadCount}</span>}</>
                  ) : tab === "agent" ? activeAgentName : "World"}
                </button>
              ))}
            </nav>
            {chatTab === "agent" && renderAgentTab()}
            {chatTab !== "agent" && (
              <>
                {worldChatChannel === "dm" && (
              <>
              {account && (
                <section className="mini-chat-threads" aria-labelledby="mini-chat-threads-title">
                  <div className="mini-chat-friends-heading">
                    <h3 id="mini-chat-threads-title">Conversations</h3>
                    {directMessagesStatus === "loading" && <span>Syncing...</span>}
                  </div>
                  {directMessagesStatus === "unavailable" ? (
                    <p className="mini-chat-friends-empty">Cross-world messages are not enabled yet. Nearby messages still work in this world.</p>
                  ) : directMessageThreads.length > 0 ? (
                    <ul>
                      {directMessageThreads.map((thread) => {
                        const name = thread.counterpartDisplayName || thread.counterpart.id.slice(0, 12);
                        const active = worldChatDmTarget?.durable
                          && worldChatDmTarget.principalKind === thread.counterpart.kind
                          && worldChatDmTarget.principalId === thread.counterpart.id;
                        return (
                          <li key={thread.threadId}>
                            <button
                              type="button"
                              className={active ? "active" : ""}
                              aria-label={`Open conversation with ${name}${thread.unreadCount ? `, ${thread.unreadCount} unread` : ""}`}
                              onClick={() => selectDirectMessageThread(thread)}
                            >
                              <span>{name}<small>{thread.counterpart.kind === "agent" ? "Agent" : "Friend"}</small></span>
                              <span>
                                <time dateTime={new Date(thread.lastMessageAtMs).toISOString()}>{new Date(thread.lastMessageAtMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                                {thread.unreadCount > 0 && <strong aria-label={`${thread.unreadCount} unread`}>{thread.unreadCount}</strong>}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : directMessagesStatus === "ready" ? (
                    <p className="mini-chat-friends-empty">No durable conversations yet.</p>
                  ) : null}
                </section>
              )}
              <section className="mini-chat-friends" aria-labelledby="mini-chat-friends-title">
                <div className="mini-chat-friends-heading">
                  <h3 id="mini-chat-friends-title">Friends</h3>
                  {account && friendsStatus === "loading" && <span>Refreshing...</span>}
                </div>
                {!account ? (
                  <div className="mini-chat-friends-empty">
                    <span>Sign in to add friends and see when they are online.</span>
                    <button type="button" onClick={openTellusAccountPanel}>Sign in</button>
                  </div>
                ) : (
                  <>
                    {friendsNotice && (
                      <p className={`mini-chat-friends-notice ${friendsNotice.kind}`} role={friendsNotice.kind === "error" ? "alert" : "status"} aria-live="polite">
                        {friendsNotice.text}
                      </p>
                    )}
                    {friendsSnapshot.pendingIncoming.length > 0 && (
                      <div className="mini-chat-friend-group">
                        <h4>Requests</h4>
                        <ul>
                          {friendsSnapshot.pendingIncoming.map((request) => (
                            <li key={`${request.kind}:${request.principalId}`}>
                              <span title={request.principalId}>{request.displayName || request.principalId.slice(0, 16)}<small>{request.kind === "agent" ? "Agent" : "Friend"}</small></span>
                              <div>
                                <button type="button" disabled={friendMutationsBusy.has(`accept:${request.kind}:${request.principalId}`)} onClick={() => void mutateFriendship("accept", request)}>Accept</button>
                                <button type="button" disabled={friendMutationsBusy.has(`decline:${request.kind}:${request.principalId}`)} onClick={() => void mutateFriendship("decline", request)}>Decline</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {friendContacts.length > 0 ? (
                      <ul className="mini-chat-friend-list">
                        {friendContacts.map((target) => {
                          const statusText = !target.presenceKnown
                            ? registryPresenceStatus === "loading" ? "Checking status" : "Status unknown"
                            : target.online
                              ? target.currentWorld ? "Online - here" : `Online - ${target.worldId ? worldDisplayName(target.worldId) : "another world"}`
                              : "Offline";
                          return (
                            <li key={`${target.principalKind ?? target.kind}:${target.principalId ?? target.visitorId}`} className={worldChatDmTarget?.visitorId === target.visitorId ? "active" : ""}>
                              <span className={`presence-dot ${target.online ? "online" : "offline"}`} aria-hidden="true" />
                              <span className="mini-chat-friend-name" title={target.userId}>{target.name}<small>{statusText}</small></span>
                              <div className="mini-chat-friend-actions">
                                <button type="button" disabled={!target.canMessage} onClick={() => selectDirectChatTarget(target)}>Message</button>
                                <button type="button" disabled={!target.online || !target.worldId || (target.currentWorld && !finiteContactPosition(target))} onClick={() => goToOnlineContact(target)}>Go</button>
                                <button type="button" disabled={!target.principalKind || !target.principalId || friendMutationsBusy.has(`remove:${target.principalKind}:${target.principalId}`)} onClick={() => target.principalKind && target.principalId && void mutateFriendship("remove", { kind: target.principalKind, principalId: target.principalId })}>Remove</button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : friendsStatus === "ready" && friendsSnapshot.pendingIncoming.length === 0 ? (
                      <p className="mini-chat-friends-empty">No friends yet. Add someone who is here with you.</p>
                    ) : friendsStatus === "error" ? (
                      <p className="mini-chat-friends-empty">Your friends list is temporarily unavailable.</p>
                    ) : null}
                    {friendsSnapshot.pendingOutgoing.length > 0 && (
                      <div className="mini-chat-friend-group">
                        <h4>Sent</h4>
                        <ul>
                          {friendsSnapshot.pendingOutgoing.map((request) => (
                            <li key={`${request.kind}:${request.principalId}`}>
                              <span title={request.principalId}>{request.displayName || request.principalId.slice(0, 16)} <small>{request.kind === "agent" ? "Agent pending" : "Pending"}</small></span>
                              <button type="button" disabled={friendMutationsBusy.has(`remove:${request.kind}:${request.principalId}`)} onClick={() => void mutateFriendship("remove", request)}>Cancel</button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </section>
              <div className="mini-chat-dm-targets" aria-label="Nearby DM recipients">
                {nearbyContacts.length === 0 ? (
                  <span>No other players or agents are nearby.</span>
                ) : (
                  <>
                    <span>Nearby</span>
                    <div>
                      {nearbyContacts.map((target) => (
                        <div
                          key={target.visitorId}
                          className={`mini-chat-contact ${worldChatDmTarget?.visitorId === target.visitorId ? "active" : ""}`}
                          title={`${target.name} nearby`}
                        >
                          <button
                            type="button"
                            className="mini-chat-contact-main"
                            disabled={!target.canMessage}
                            aria-label={target.canMessage ? `Message ${target.name}` : `${target.name} is in another world`}
                            onClick={() => selectDirectChatTarget(target)}
                          >
                            <span className="presence-dot online" aria-hidden="true" />
                            <span>{target.name}</span>
                            <small>here</small>
                          </button>
                          {account && target.principalKind && target.principalId && !relationshipPrincipals.has(`${target.principalKind}:${target.principalId}`) && (
                            <button
                              type="button"
                              className="mini-chat-contact-go"
                              disabled={friendMutationsBusy.has(`request:${target.principalKind}:${target.principalId}`)}
                              aria-label={`Add ${target.name} as a friend`}
                              onClick={() => target.principalKind && target.principalId && void mutateFriendship("request", { kind: target.principalKind, principalId: target.principalId })}
                            >
                              Add friend
                            </button>
                          )}
                          <button
                            type="button"
                            className="mini-chat-contact-go"
                            disabled={target.currentWorld && !finiteContactPosition(target)}
                            aria-label={target.currentWorld ? `Go to ${target.name}` : `Travel to ${target.name}'s world`}
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
              </>
            )}
            {worldChatChannel === "dm" && worldChatDmTarget?.durable && directMessageNotice && (
              <p className={`mini-chat-friends-notice ${directMessageNotice.kind}`} role={directMessageNotice.kind === "error" ? "alert" : "status"} aria-live="polite">
                {directMessageNotice.text}
              </p>
            )}
            <div className="mini-chat-log" role="log" aria-live="polite">
              {worldChatChannel === "dm" && worldChatDmTarget?.durable ? directMessageThread.map((message) => {
                const fromMe = message.sender.kind === "account" && message.sender.id === account?.accountId;
                const senderName = fromMe
                  ? "You"
                  : message.senderDisplayName || worldChatDmTarget.name || message.sender.id.slice(0, 12);
                return (
                  <article key={message.messageId} className="mini-chat-entry dm">
                    <strong>
                      {senderName}
                      <span>{fromMe ? `dm to ${worldChatDmTarget.name}` : `dm from ${senderName}`}</span>
                    </strong>
                    <p>{message.text}</p>
                    <time dateTime={new Date(message.sentAtMs).toISOString()}>{new Date(message.sentAtMs).toLocaleString()}</time>
                  </article>
                );
              }) : visibleWorldChat.slice(-24).map((message) => (
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
              {worldChatChannel === "dm" && worldChatDmTarget?.durable && directMessageThreadStatus === "loading" && (
                <article className="mini-chat-entry empty"><strong>Conversation</strong><p>Loading messages...</p></article>
              )}
              {worldChatChannel === "dm" && worldChatDmTarget?.durable && directMessageThreadStatus === "ready" && directMessageThread.length === 0 && (
                <article className="mini-chat-entry empty"><strong>{worldChatDmTarget.name}</strong><p>No messages yet. Say hello.</p></article>
              )}
              {!(worldChatChannel === "dm" && worldChatDmTarget?.durable) && visibleWorldChat.length === 0 && (
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
              maxLength={worldChatChannel === "dm" && worldChatDmTarget?.durable ? 2000 : 800}
              rows={2}
              disabled={(worldChatChannel === "dm" && !worldChatDmTarget) || directMessageSending || (Boolean(worldChatDmTarget?.durable) && directMessagesStatus === "unavailable")}
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
                disabled={!worldChatInput.trim() || (worldChatChannel === "dm" && !worldChatDmTarget) || directMessageSending || (Boolean(worldChatDmTarget?.durable) && directMessagesStatus === "unavailable")}
                onClick={sendWorldChatMessage}
              >
                {directMessageSending ? "Sending..." : "Send"}
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
            {debugModeBadge}
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
        {travelMenuOpen && (
          <aside className="travel-menu-panel" aria-label="Travel menu">
            <div className="world-menu-head">
              <span>Travel</span>
              <button
                type="button"
                className="icon-button"
                title="Close travel menu"
                aria-label="Close travel menu"
                onClick={() => setTravelMenuOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="travel-menu-intro">
              <strong>Choose a destination</strong>
              <span>Step into a world or launch an expedition.</span>
            </div>
            <div className="world-destination-grid" role="list" aria-label="Destinations">
              <article className="world-destination-card earth" role="listitem">
                <button
                  type="button"
                  className="world-destination-main"
                  onClick={() => window.location.assign("/dragon-flight.html")}
                  aria-label="Launch Earth Flight"
                >
                  <span className="world-destination-art"><Globe2 size={34} /></span>
                  <span className="world-destination-copy">
                    <small>Expedition</small>
                    <strong>Earth Flight</strong>
                    <span>Fly your dragon over ancient landscapes and align with celestial rings</span>
                  </span>
                  <ArrowRight size={18} className="world-destination-arrow" />
                </button>
              </article>
              {worlds.map((worldId) => {
                const active = worldId === (activeWorldId ?? runtimeConfig.worldId);
                const details = worldDestinationDetails(worldId);
                return (
                  <article key={worldId} className={`world-destination-card${active ? " active" : ""}`} role="listitem">
                    <button
                      type="button"
                      className="world-destination-main"
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        setTravelMenuOpen(false);
                        switchWorld(worldId);
                      }}
                    >
                      <span
                        className="world-destination-art"
                        style={details.previewImageUrl ? { backgroundImage: `url(${details.previewImageUrl})` } : undefined}
                      >
                        {!details.previewImageUrl && (details.eyebrow === "Interior" ? <Building2 size={30} /> : <Mountain size={30} />)}
                      </span>
                      <span className="world-destination-copy">
                        <small>{active ? "You are here" : details.eyebrow}</small>
                        <strong>{worldDisplayName(worldId)}</strong>
                        <span>{details.description}</span>
                      </span>
                      <ArrowRight size={18} className="world-destination-arrow" />
                    </button>
                  </article>
                );
              })}
            </div>
            <div className="travel-menu-actions">
              <button
                type="button"
                className="world-action-button"
                onClick={() => {
                  setTravelMenuOpen(false);
                  setNewWorldPanelOpen(true);
                  setWorldMenuOpen(true);
                }}
              >
                <Plus size={14} />
                <span>Create a world</span>
              </button>
            </div>
          </aside>
        )}
        {worldMenuOpen && (
        <aside className="world-menu-panel" aria-label="World menu">
          <div className="world-menu-head">
            <span>{newWorldPanelOpen ? "Create world" : "World settings"}</span>
            <button
              type="button"
              className="icon-button"
              title="Close world menu"
              aria-label="Close world menu"
              onClick={() => {
                setWorldMenuOpen(false);
                setNewWorldPanelOpen(false);
              }}
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
            {debugModeBadge}
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
            <div className="world-mode-switcher" role="group" aria-label="World menu mode">
              <button
                type="button"
                className={!newWorldPanelOpen ? "active" : ""}
                aria-pressed={!newWorldPanelOpen}
                onClick={() => setNewWorldPanelOpen(false)}
              >
                <Globe2 size={14} />
                Current world
              </button>
              <button
                type="button"
                className={newWorldPanelOpen ? "active" : ""}
                aria-pressed={newWorldPanelOpen}
                onClick={() => setNewWorldPanelOpen(true)}
              >
                <Plus size={14} />
                Create new
              </button>
            </div>
            {!newWorldPanelOpen && (
              <>
                <section className="world-mode-intro" aria-labelledby="current-world-settings-title">
                  <span>Current world</span>
                  <strong id="current-world-settings-title">
                    {worldDisplayName(activeWorldId ?? runtimeConfig.worldId)}
                  </strong>
                  <small>Changes below apply only to this world.</small>
                </section>
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
                {activeWorldId && !isProtectedWorldId(activeWorldId) &&
                  (() => {
                    const target = activeWorldId;
                    const armed = pendingDeleteWorld === target;
                    const serverDeleteAllowed = Boolean(runtimeConfig.worldApiBase && canDeleteWorld(target));
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
            {isAdmin && worlds.length > 0 && (
              <details className="world-control-group world-list-group world-registry-manager">
                <summary>Manage worlds ({worlds.length})</summary>
                <p className="world-registry-note">
                  Admin cleanup. Main is protected; deleting another world is permanent.
                </p>
                <button
                  type="button"
                  className="world-action-button legacy-world-cleanup-button"
                  disabled={legacyCleanupBusy || deletingWorld}
                  onClick={() => void cleanupLegacyWorlds()}
                >
                  <Trash2 size={14} />
                  {legacyCleanupBusy ? legacyCleanupProgress ?? "Cleaning up…" : "Clean up legacy test worlds"}
                </button>
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
                            <small>{active ? `Current - ${worldId}` : worldId}</small>
                          </button>
                        {isProtectedWorldId(worldId) ? (
                          <span className="world-protected-badge">Protected</span>
                        ) : (
                          renderWorldDeleteButton(worldId, "world-icon-button world-list-delete")
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
            <div className="world-control-group world-name-edit-group">
              <span>Name</span>
              <div className="world-name-action-row">
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
                <button
                  type="button"
                  className="world-action-button"
                  title="Save world name and terrain settings to Hyades"
                  aria-label="Save world name and terrain settings to Hyades"
                  disabled={savingWorld}
                  onClick={() => void saveActiveWorldSettings()}
                >
                  <Save size={14} />
                  <span>{savingWorld ? "Saving" : "Save"}</span>
                </button>
              </div>
            </div>
            <div className="world-control-group">
              <span>World terrain</span>
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
              <Plus size={14} /> Create a copy
            </button>
            {activeWorldId && !isProtectedWorldId(activeWorldId) &&
              renderWorldDeleteButton(
                activeWorldId,
                "world-action-button active-world-delete-action",
                true,
              )}
              </>
            )}
            {newWorldPanelOpen && (
              <div className="world-create-panel" aria-label="New world setup">
                <div className="world-create-title">
                  <span>Create a new world</span>
                  <button
                    type="button"
                    className="world-icon-button"
                    title="Back to current world settings"
                    aria-label="Back to current world settings"
                    onClick={() => setNewWorldPanelOpen(false)}
                  >
                    <ArrowLeft size={14} />
                  </button>
                </div>
                <p className="world-create-explainer">
                  Choose a starting world and name it. These choices do not change the world you are in.
                </p>
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
                      newWorldWaterSettings.style} - {newWorldChunkSize} chunks
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
                    <span>Size (chunks)</span>
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
            {worldCreateNote && (
              <span className="world-create-note" role="status" aria-live="polite">
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
        </aside>
        )}
        <div className="ds-scope tellus-dock-mount">
          <Dock items={toolbeltItems} aria-label="Toolbelt" />
        </div>
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
                alt={`Latest view from ${activeAgentName}`}
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
                <span style={{ fontSize: 14, fontWeight: 600, color: "#dfe7d8" }}>Chat with {activeAgentName}</span>
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
                      ? `Say hello to ${activeAgentName} below.`
                      : `Start ${activeAgentName}, then say hello below.`}
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
                  placeholder={agentStatus?.optedIn ? `Message ${activeAgentName}…` : `Start ${activeAgentName} first`}
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
                const position = anchoredThing
                  ? (() => {
                      const offset = portal.anchorOffset ?? {
                        x: portal.position.x - anchoredThing.position.x,
                        y: portal.position.y - anchoredThing.position.y,
                        z: portal.position.z - anchoredThing.position.z,
                      };
                      const anchorYaw = portal.anchorOffset ? anchoredThing.rotationY ?? 0 : 0;
                      const cos = Math.cos(anchorYaw);
                      const sin = Math.sin(anchorYaw);
                      return {
                        x: anchoredThing.position.x + offset.x * cos - offset.z * sin,
                        y: anchoredThing.position.y + offset.y,
                        z: anchoredThing.position.z + offset.x * sin + offset.z * cos,
                      };
                    })()
                  : portal.position;
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
                const selected = selectedPortalId === p.id;
                return (
                  <article
                    key={p.id}
                    className="portal-panel-row"
                    data-portal-id={p.id}
                    onClick={() => setSelectedPortalId(p.id)}
                    style={selected ? {
                      borderColor: "rgba(255,215,106,0.65)",
                      background: "rgba(255,215,106,0.12)",
                      outline: "1px solid rgba(255,215,106,0.55)",
                    } : undefined}
                  >
                    <button type="button" title={`Enter ${p.label || worldDisplayName(p.target.worldId)} (${p.target.kind})`} onClick={() => worldRef.current?.enterPortal(p.id)} style={portalBtn}>
                      {"->"} {p.label || worldDisplayName(p.target.worldId)} <small style={{ opacity: 0.6 }}>{p.target.kind}</small>
                      {selected && <small style={{ float: "right", opacity: 0.78 }}>selected</small>}
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
                        onClick={async () => {
                          const ok = await askConfirm({
                            title: "Delete portal?",
                            message: `Delete portal ${p.label || worldDisplayName(p.target.worldId)}?`,
                            confirmLabel: "Delete",
                            danger: true,
                          });
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
              {currentWorldId.startsWith("interior-") && (
                <button
                  type="button"
                  title="Return to the last exterior world"
                  onClick={exitInteriorWorld}
                  style={{ ...portalBtn, marginTop: 6, borderColor: "rgba(255,207,106,0.65)" }}
                >
                  {"<-"} Exit interior
                </button>
              )}
              <select
                value={doorInteriorTemplate}
                aria-label="Door interior room type"
                title="Door interior room type"
                onChange={(event) =>
                  setDoorInteriorTemplate(parseWorldTemplateId(event.target.value, "interior-studio"))
                }
                style={{
                  width: "100%",
                  marginTop: 6,
                  background: "rgba(0,0,0,0.45)",
                  color: "inherit",
                  border: "1px solid rgba(255,207,106,0.45)",
                  borderRadius: 8,
                  padding: "4px 6px",
                  font: "inherit",
                }}
              >
                {doorInteriorOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    Door opens to {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                title="Create a door to the selected interior room type"
                onClick={() => {
                  const sceneUrl =
                    generatedInteriorSceneUrlForTemplate(doorInteriorTemplate) ??
                    GENERATED_INTERIOR_SCENE_URL;
                  worldRef.current?.createDoorHere(
                    `${worldDisplayName(currentWorldId)} ${worldTemplateLabel(doorInteriorTemplate)} door`,
                    sceneUrl,
                  );
                }}
                style={{ ...portalBtn, marginTop: 4, borderColor: "rgba(255,207,106,0.5)" }}
              >
                Door to {worldTemplateLabel(doorInteriorTemplate)}
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
              <button
                type="button"
                title="Place a door on an interior wall and slide it into position"
                disabled={!portalTargetWorldId}
                onClick={() => {
                  const target = portalTargetWorldId.trim();
                  if (target) {
                    worldRef.current?.startInteriorWallDoorPlacement(
                      target,
                      `${worldDisplayName(currentWorldId)} to ${worldDisplayName(target)} door`,
                    );
                  }
                }}
                style={{
                  ...portalBtn,
                  borderColor: "rgba(255,207,106,0.65)",
                  opacity: portalTargetWorldId ? 1 : 0.55,
                  cursor: portalTargetWorldId ? "crosshair" : "default",
                }}
              >
                ï¼‹ Place wall door
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
        {activeSelectedPortal && !snapshot.sailingThingId && (
          <div className="selected-transform-hud" aria-label="Selected portal controls">
            <button
              type="button"
              className="selected-transform-close"
              title="Close portal controls"
              aria-label="Close portal controls"
              onClick={() => setSelectedPortalId("")}
            >
              ×
            </button>
            <div className="selected-transform-label">
              <Globe2 size={15} />
              <select
                value={activeSelectedPortal.id}
                aria-label="Selected portal"
                onChange={(event) => setSelectedPortalId(event.target.value)}
              >
                {(snapshot.portals ?? []).map((portal) => (
                  <option key={portal.id} value={portal.id}>
                    {portal.label || worldDisplayName(portal.target.worldId)}
                  </option>
                ))}
              </select>
              <div className="selected-name-actions">
                <button
                  type="button"
                  className="selected-name-action"
                  title={`Enter ${activeSelectedPortal.label || worldDisplayName(activeSelectedPortal.target.worldId)}`}
                  onClick={() => worldRef.current?.enterPortal(activeSelectedPortal.id)}
                >
                  Enter
                </button>
                <button
                  type="button"
                  className="selected-name-action"
                  title={activeSelectedThing ? `Attach portal to ${activeSelectedThing.prompt}` : "Attach portal to nearest asset"}
                  disabled={snapshot.generated.length === 0}
                  onClick={() => worldRef.current?.attachPortalToSelected(activeSelectedPortal.id)}
                >
                  {activeSelectedThing ? "Attach" : "Attach nearest"}
                </button>
                <button
                  type="button"
                  className="selected-name-action"
                  title="Detach portal from asset"
                  disabled={!activeSelectedPortal.anchorThingId}
                  onClick={() => worldRef.current?.detachPortal(activeSelectedPortal.id)}
                >
                  Detach
                </button>
                <button
                  type="button"
                  className="selected-name-action selected-name-delete"
                  title="Delete portal"
                  onClick={async () => {
                    const ok = await askConfirm({
                      title: "Delete portal?",
                      message: `Delete portal ${activeSelectedPortal.label || worldDisplayName(activeSelectedPortal.target.worldId)}?`,
                      confirmLabel: "Delete",
                      danger: true,
                    });
                    if (ok) worldRef.current?.deletePortal(activeSelectedPortal.id);
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="selected-name-action"
                  title="Close portal controls"
                  aria-label="Close portal controls"
                  onClick={() => setSelectedPortalId("")}
                >
                  Close
                </button>
              </div>
              <select
                value={activeSelectedPortal.anchorThingId ?? ""}
                aria-label="Portal anchor asset"
                title="Attach portal to asset"
                style={{ gridColumn: 2, gridRow: 3 }}
                onChange={(event) => {
                  const thingId = event.target.value;
                  if (thingId) worldRef.current?.attachPortalToThing(activeSelectedPortal.id, thingId);
                  else worldRef.current?.detachPortal(activeSelectedPortal.id);
                }}
              >
                <option value="">Anchor: none</option>
                {snapshot.generated.map((thing) => (
                  <option key={thing.id} value={thing.id}>
                    Anchor: {thing.prompt || thing.kind}
                  </option>
                ))}
              </select>
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
                aria-label="Move portal forward"
                onClick={() => worldRef.current?.movePortal(activeSelectedPortal.id, 0, -selectedNudgeStep)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="icon-button nudge-left"
                title="Move left"
                aria-label="Move portal left"
                onClick={() => worldRef.current?.movePortal(activeSelectedPortal.id, -selectedNudgeStep, 0)}
              >
                <ArrowLeft size={16} />
              </button>
              <button
                type="button"
                className="icon-button nudge-right"
                title="Move right"
                aria-label="Move portal right"
                onClick={() => worldRef.current?.movePortal(activeSelectedPortal.id, selectedNudgeStep, 0)}
              >
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                className="icon-button nudge-down"
                title="Move backward"
                aria-label="Move portal backward"
                onClick={() => worldRef.current?.movePortal(activeSelectedPortal.id, 0, selectedNudgeStep)}
              >
                <ArrowDown size={16} />
              </button>
            </div>
            <div className="selected-place-actions" aria-label="Portal rotation controls">
              <button
                type="button"
                className="icon-button"
                title="Rotate left"
                aria-label="Rotate portal left"
                onClick={() => worldRef.current?.rotatePortal(activeSelectedPortal.id, -THREE.MathUtils.degToRad(15))}
              >
                <RotateCcw size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Rotate right"
                aria-label="Rotate portal right"
                onClick={() => worldRef.current?.rotatePortal(activeSelectedPortal.id, THREE.MathUtils.degToRad(15))}
              >
                <RotateCw size={17} />
              </button>
            </div>
            <div className="selected-transform-stack" aria-label="Height controls">
              <button
                type="button"
                className="icon-button"
                title="Raise portal"
                aria-label="Raise portal"
                onClick={() => worldRef.current?.liftPortal(activeSelectedPortal.id, selectedNudgeStep)}
              >
                <ArrowUp size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Lower portal"
                aria-label="Lower portal"
                onClick={() => worldRef.current?.liftPortal(activeSelectedPortal.id, -selectedNudgeStep)}
              >
                <ArrowDown size={17} />
              </button>
            </div>
            <div className="selected-transform-stack" aria-label="Scale controls">
              <button
                type="button"
                className="icon-button"
                title="Scale up"
                aria-label="Scale portal up"
                onClick={() => worldRef.current?.scalePortal(activeSelectedPortal.id, 1.16)}
              >
                <Plus size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                title="Scale down"
                aria-label="Scale portal down"
                onClick={() => worldRef.current?.scalePortal(activeSelectedPortal.id, 0.86)}
              >
                <Minus size={17} />
              </button>
            </div>
          </div>
        )}
        {!activeSelectedPortal && activeSelectedThing && !snapshot.sailingThingId && (
          <div className="selected-transform-hud" aria-label="Selected asset controls">
            <button
              type="button"
              className="selected-transform-close"
              title="Close asset controls"
              aria-label="Close asset controls"
              onClick={() => {
                setMoveModeActive(false);
                worldRef.current?.setMoveMode(null);
                worldRef.current?.selectGenerated(undefined);
              }}
            >
              ×
            </button>
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
                <button
                  type="button"
                  className="selected-name-action"
                  title="Close asset controls"
                  aria-label="Close asset controls"
                  onClick={() => {
                    setMoveModeActive(false);
                    worldRef.current?.setMoveMode(null);
                    worldRef.current?.selectGenerated(undefined);
                  }}
                >
                  Close
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
          <div
            className={createImageUrl ? "prompt-image-drop has-image" : "prompt-image-drop"}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              acceptCreateImageFile(event.dataTransfer.files?.[0]);
            }}
          >
            <input
              ref={createImageInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => acceptCreateImageFile(event.target.files?.[0])}
            />
            {createImageUrl ? (
              <>
                <img src={createImageUrl} alt="" />
                <span>{createImageName || "Reference image"}</span>
                <button
                  type="button"
                  className="prompt-image-clear"
                  title="Remove image"
                  aria-label="Remove image"
                  onClick={clearCreateImage}
                >
                  <X size={13} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="prompt-image-button"
                title="Add reference image"
                onClick={() => createImageInputRef.current?.click()}
              >
                <ImagePlus size={15} />
                <span>Image</span>
              </button>
            )}
          </div>
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
              <span>{assetPanelTab === "avatar" ? "Avatar" : assetPrimaryLabel}</span>
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
                className={assetPanelTab === assetPrimaryTab ? "active" : ""}
                title={assetPrimaryLabel}
                aria-label={`${assetPrimaryLabel} assets`}
                onClick={() => setAssetPanelTab(assetPrimaryTab)}
              >
                {assetPrimaryTab === "building" ? <Building2 size={17} /> : <Box size={17} />}
              </button>
            </nav>
            {assetPanelTab === "avatar" && (
              <div className="inventory-list asset-list asset-avatar-tab">
                <div className="asset-tab-note">
                  <strong>Avatar</strong>
                  <span>
                    {avatarCatalogLoading
                      ? "loading store avatars"
                      : `${visibleAvatarCatalog.length}/${avatarCatalog.length} shown`}
                  </span>
                </div>
                <div className="asset-avatar-grid">
                  {visibleAvatarCatalog.map((entry) => (
                    <AvatarTile
                      key={entry.id}
                      entry={entry}
                      selected={avatarSelection === entry.id}
                      onSelect={onAvatarPick}
                    />
                  ))}
                </div>
                {visibleAvatarCatalog.length < avatarCatalog.length && (
                  <button
                    type="button"
                    className="asset-avatar-load-more"
                    onClick={() =>
                      setAvatarVisibleCount((count) =>
                        Math.min(count + AVATAR_DRAWER_BATCH_SIZE, avatarCatalog.length),
                      )
                    }
                  >
                    Load more
                  </button>
                )}
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
            {(assetPanelTab === "animal" || assetPanelTab === "building" || assetPanelTab === "flora" || assetPanelTab === "furniture") && (
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
                    <div className="asset-proc-field">
                      <span>Style</span>
                      <div className="building-material-grid" aria-label="Building style">
                        {BUILDING_MATERIAL_OPTIONS.map((option) => (
                          <BuildingMaterialTile
                            key={option.id}
                            option={option}
                            selected={procBuildingMaterial === option.id}
                            onSelect={setProcBuildingMaterial}
                          />
                        ))}
                      </div>
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
                    placeholder={`Search ${assetPanelTab === "furniture" ? "furniture" : assetPanelTab} assets...`}
                    aria-label="Search assets"
                  />
                </label>
                {assetPanelTab === "animal" && (
                  <label className="asset-filter-toggle">
                    <input
                      type="checkbox"
                      checked={assetAnimalAnimatedOnly}
                      onChange={(event) => setAssetAnimalAnimatedOnly(event.target.checked)}
                    />
                    <span>Animated only</span>
                  </label>
                )}
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
                    No {assetPanelTab === "furniture" ? "furniture" : assetPanelTab} assets loaded yet.
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
              className={`secondary-button terrain-hold ${terrainBrushMode === "raise" ? "active" : ""}`}
              title="Use raise brush"
              aria-label="Raise terrain"
              aria-pressed={terrainBrushMode === "raise"}
              onClick={() => selectTerrainBrush("raise")}
            >
              <ArrowUp size={18} />
            </button>
            <button
              type="button"
              className={`secondary-button ${terrainBrushMode === "flatten" ? "active" : ""}`}
              title="Use flatten brush"
              aria-pressed={terrainBrushMode === "flatten"}
              onClick={() => selectTerrainBrush("flatten")}
            >
              <span>Flatten</span>
            </button>
            <button
              type="button"
              className={`secondary-button terrain-hold ${terrainBrushMode === "lower" ? "active" : ""}`}
              title="Use lower brush"
              aria-label="Lower terrain"
              aria-pressed={terrainBrushMode === "lower"}
              onClick={() => selectTerrainBrush("lower")}
            >
              <ArrowDown size={18} />
            </button>
          </div>
          <div className="terrain-subtitle-row with-rule">
            <div className="terrain-subtitle">Materials</div>
            {(terrainBrushMode || vegetationBrushId) && (
              <button
                type="button"
                className="terrain-brush-clear"
                title="Exit brush mode"
                aria-label="Exit brush mode"
                onClick={clearTerrainBrush}
              >
                <X size={14} />
                <span>Exit brush</span>
              </button>
            )}
          </div>
          <label className="terrain-brush-size" title="Terrain brush size">
            <span>
              <Brush size={13} />
              Brush size
            </span>
            <input
              type="range"
              min={minTerrainBrushRadius}
              max={maxTerrainBrushRadius}
              step={0.25}
              value={terrainBrushRadius}
              onChange={(event) => changeTerrainBrushRadius(Number(event.currentTarget.value))}
            />
            <output>{terrainBrushRadius.toFixed(1)}</output>
          </label>
          <div className="terrain-material-swatches">
            <button
              type="button"
              className={`terrain-swatch meadow ${terrainBrushMode === "meadow" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("meadow")}
            >
              <span className="terrain-swatch-preview" />
              <span>Meadow</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch grass ${terrainBrushMode === "grass" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("grass")}
            >
              <span className="terrain-swatch-preview" />
              <span>Grass</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch beach ${terrainBrushMode === "beach" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("beach")}
            >
              <span className="terrain-swatch-preview" />
              <span>Beach</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch dirt ${terrainBrushMode === "dirt" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("dirt")}
            >
              <span className="terrain-swatch-preview" />
              <span>Dirt</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch forest-floor ${terrainBrushMode === "forest-floor" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("forest-floor")}
            >
              <span className="terrain-swatch-preview" />
              <span>Forest</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch cobble ${terrainBrushMode === "stone" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("stone")}
            >
              <span className="terrain-swatch-preview" />
              <span>Cobble</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch gravel ${terrainBrushMode === "gravel" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("gravel")}
            >
              <span className="terrain-swatch-preview" />
              <span>Gravel</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch snow ${terrainBrushMode === "snow" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("snow")}
            >
              <span className="terrain-swatch-preview" />
              <span>Snow</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch desert-sand ${terrainBrushMode === "desert-sand" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("desert-sand")}
            >
              <span className="terrain-swatch-preview" />
              <span>Desert</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch flowers ${terrainBrushMode === "flowers" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("flowers")}
            >
              <span className="terrain-swatch-preview" />
              <span>Flowers</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch jungle-moss ${terrainBrushMode === "jungle-moss" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("jungle-moss")}
            >
              <span className="terrain-swatch-preview" />
              <span>Jungle</span>
            </button>
            <button
              type="button"
              className={`terrain-swatch brick ${terrainBrushMode === "brick" ? "active" : ""}`}
              onClick={() => selectTerrainBrush("brick")}
            >
              <span className="terrain-swatch-preview" />
              <span>Brick</span>
            </button>
          </div>
          <div className="terrain-subtitle with-rule">Scatter</div>
          <div className="terrain-scatter-grid">
            <a
              className="terrain-scatter-tile"
              href="/biome-mixer.html"
              target="_blank"
              rel="noreferrer"
              title="Open biome mixer"
              aria-label="Open biome mixer"
            >
              <span className="terrain-scatter-emoji" aria-hidden="true">Mix</span>
              <span className="terrain-scatter-label">Biome Mixer</span>
            </a>
            {PROCEDURAL_CATALOG.map((arch) => (
              <div key={arch.id} className={`terrain-scatter-tile ${vegetationBrushId === arch.id ? "active" : ""} ${vegetationBrushId === arch.id && vegetationBrushMode === "multi" ? "multi" : ""}`}>
                <button
                  type="button"
                  className="terrain-scatter-place"
                  title={`Place ${arch.label} exactly`}
                  aria-label={arch.label}
                  onClick={() => selectVegetationBrush(arch.id, "single")}
                >
                  <span className="terrain-scatter-emoji" aria-hidden="true">{arch.emoji}</span>
                  <span className="terrain-scatter-label">{arch.label}</span>
                </button>
                <button
                  type="button"
                  className="terrain-scatter-burst"
                  title={`Use ${arch.label} multi brush`}
                  aria-label={`Use ${arch.label} multi brush`}
                  onClick={() => selectVegetationBrush(arch.id, "multi")}
                >
                  <Sprout size={13} />
                  <span>{arch.kind === "tree" ? "x5" : arch.kind === "flower" ? "x14" : "x10"}</span>
                </button>
              </div>
            ))}
            {PROCPLANT_PLACEABLE_CATALOG.map((entry) => (
              <div key={entry.id} className={`terrain-scatter-tile ${vegetationBrushId === entry.id ? "active" : ""} ${vegetationBrushId === entry.id && vegetationBrushMode === "multi" ? "multi" : ""}`}>
                <button
                  type="button"
                  className="terrain-scatter-place"
                  title={`Place ${entry.label} exactly`}
                  aria-label={entry.label}
                  onClick={() => selectVegetationBrush(entry.id, "single")}
                >
                  <span className="terrain-scatter-emoji" aria-hidden="true">{entry.emoji}</span>
                  <span className="terrain-scatter-label">{entry.label}</span>
                </button>
                <button
                  type="button"
                  className="terrain-scatter-burst"
                  title={`Use ${entry.label} multi brush`}
                  aria-label={`Use ${entry.label} multi brush`}
                  onClick={() => selectVegetationBrush(entry.id, "multi")}
                >
                  <Sprout size={13} />
                  <span>x{entry.scatterCount}</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              className="terrain-scatter-tile"
              title="Mirror"
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

      <FirstRunCoach />
      {dialogs}
      <div className="ds-scope">
        <CommandPalette
          open={cmdkOpen}
          onClose={() => setCmdkOpen(false)}
          commands={paletteCommands}
          placeholder="Search actions…  (⌘K)"
        />
      </div>
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
