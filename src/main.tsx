import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Flower2,
  Hammer,
  Home,
  Layers,
  Leaf,
  LogOut,
  Map as MapIcon,
  Menu,
  MessageCircle,
  Mic,
  Minus,
  Mountain,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Send,
  Settings,
  Ship,
  Sparkles,
  Sprout,
  Trash2,
  Waves,
} from "lucide-react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
  type TellusTerrainState,
  type WorldGeneratedThing,
  type WorldPresence,
  type WorldPatch,
  isTellusTerrainState,
  isWorldGeneratedThing,
} from "./world-protocol";
import "./styles.css";

type AgentId = "johnny" | "mira" | "sol" | "atlas";

type TerrainKind = "meadow" | "rock" | "snow" | "beach" | "dirt" | "water";
type TerrainPaintKind = Exclude<TerrainKind, "water">;
type TerrainEditMode = "raise" | "lower" | "flatten" | TerrainPaintKind;
type GenerationProvider =
  | "local"
  | "asset-forge"
  | "instantmesh-gradio"
  | "pixal3d-gradio"
  | "anigen-gradio";
type DirectGenerationProvider = Extract<
  GenerationProvider,
  "instantmesh-gradio" | "pixal3d-gradio" | "anigen-gradio"
>;
type RoleGenerationProvider = DirectGenerationProvider | "local";
type InstantMeshTarget = "dgx" | "local";
type GeneratedKind =
  | "tree"
  | "flower"
  | "stone"
  | "animal"
  | "path"
  | "shrine"
  | "seed"
  | "balloon"
  | "object";

type ToolName = "generate" | "interact";

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface TellusAgent {
  id: AgentId;
  name: string;
  epithet: string;
  color: number;
  goal: string;
  avatarUrl?: string;
  position: Vec3;
  target: Vec3;
  nextActionAt: number;
  nextReflectionAt: number;
}

interface GeneratedThing {
  id: string;
  kind: GeneratedKind;
  prompt: string;
  creatorId: AgentId | "visitor";
  ownerUserId?: string;
  position: Vec3;
  rotationX?: number;
  rotationY: number;
  rotationZ?: number;
  scale: number;
  color: number;
  modelUrl?: string;
  pipelineId?: string;
  generationStatus?: "local" | "queued" | "generating" | "ready" | "failed";
}

interface AssetLibraryModel {
  id: string;
  name: string;
  description?: string;
  file_format?: string;
  file_size?: number;
  download_count?: number;
  modelUrl?: string;
  source?: "asset-library" | "generated";
}

interface AssetLibraryResponse {
  models?: AssetLibraryModel[];
}

interface DistantIslandSpec {
  seed: number;
  angle: number;
  distance: number;
  x: number;
  z: number;
  size: number;
  topRadius: number;
  bottomRadius: number;
  height: number;
  scaleZ: number;
  rotationY: number;
  sculptOffsets: Float32Array;
  paint: Uint8Array;
}

interface TellusLog {
  id: string;
  tick: number;
  agentId: AgentId | "visitor" | "world";
  agentName: string;
  tool: ToolName;
  text: string;
  screenshotUrl?: string;
}

interface GenerateRequest {
  prompt: string;
  location: Vec3 | "near-agent" | "near-mountain" | "near-pond";
  scale?: number;
  creatorId: AgentId | "visitor";
  ownerUserId?: string;
}

interface InteractRequest {
  targetId: string;
  intent: string;
  actorId: AgentId | "visitor";
}

interface TellusSnapshot {
  agents: TellusAgent[];
  generated: GeneratedThing[];
  logs: TellusLog[];
  paused: boolean;
  generationProvider: GenerationProvider;
  playerGenerationProvider: RoleGenerationProvider;
  agentGenerationProvider: RoleGenerationProvider;
  instantMeshTarget: InstantMeshTarget;
  userId: string;
  visitorPosition?: Vec3;
  remoteVisitors: WorldPresence[];
  selectedThingId?: string;
  sailingThingId?: string;
}

interface TellusWorldApi {
  generate(request: GenerateRequest): GeneratedThing;
  addLibraryAsset(model: AssetLibraryModel): GeneratedThing;
  interact(request: InteractRequest): TellusLog;
  selectGenerated(id?: string): void;
  moveGenerated(id: string, dx: number, dz: number): void;
  rotateGenerated(id: string, radians: number, axis?: "x" | "y" | "z"): void;
  scaleGenerated(id: string, multiplier: number): void;
  resetGeneratedScale(id: string): void;
  liftGenerated(id: string, amount: number): void;
  groundGenerated(id: string): void;
  deleteGenerated(id: string): void;
  moveGeneratedToWater(id: string): void;
  boardGenerated(id: string): void;
  disembark(): void;
  sculptTerrain(mode: TerrainEditMode): void;
  talkToAgent(agentId: AgentId, message: string): void;
  updateAgentGoal(agentId: AgentId, goal: string): void;
  importGeneratedThings(things: WorldGeneratedThing[]): void;
  setGenerationProvider(provider: GenerationProvider): void;
  setPlayerGenerationProvider(provider: RoleGenerationProvider): void;
  setAgentGenerationProvider(provider: RoleGenerationProvider): void;
  setInstantMeshTarget(target: InstantMeshTarget): void;
  setPaused(paused: boolean): void;
  submitVisitorPrompt(prompt: string): void;
  snapshot(): TellusSnapshot;
  destroy(): void;
}

interface TellusRuntimeConfig {
  apiBase: string;
  assetForgeApiBase: string;
  agentModel: string;
  generationProvider: GenerationProvider;
  playerGenerationProvider: RoleGenerationProvider;
  agentGenerationProvider: RoleGenerationProvider;
  instantMeshTarget: InstantMeshTarget;
  instantMeshTargets: Record<InstantMeshTarget, string>;
  worldApiBase: string;
  worldId: string;
  skyboxUrl: string;
  dayNightCycleMs: number;
  dayNightStart: number;
  enabledAgents: AgentId[];
  avatars: Partial<Record<AgentId, string>>;
}

interface AgentDecision {
  action?: "generate" | "moveSelf" | "sculptTerrain" | "moveAsset" | "rotateAsset" | "scaleAsset" | "moveAssetToWater";
  prompt: string;
  intent?: string;
  speech?: string;
  terrainMode?: TerrainEditMode;
  targetId?: string;
  dx?: number;
  dz?: number;
  rotation?: number;
  scaleMultiplier?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
}

interface WorldFeedbackResponse {
  summary?: string;
  error?: string;
}

interface AssetForgePipelineStart {
  pipelineId: string;
  status: string;
  message: string;
}

interface AssetForgePipelineStatus {
  id: string;
  status: "initializing" | "processing" | "completed" | "failed" | string;
  progress: number;
  finalAsset?: {
    modelUrl?: string;
  };
  error?: string;
}

interface DirectGenerationResponse {
  jobId: string;
  status?: "queued" | "generating" | "completed" | "failed";
  modelUrl?: string;
  provider: string;
  rawModelUrl?: string;
  storedModelUrl?: string;
  storedModelPath?: string;
  sourceImageUrl?: string;
  sourceImagePath?: string;
  textImageProvider?: string;
  manifestUrl?: string;
  error?: string;
}

interface GeneratedAssetManifestEntry {
  id?: string;
  prompt?: string;
  kind?: string;
  createdAt?: string;
  modelUrl?: string;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    __tellusRoot?: ReturnType<typeof createRoot>;
    // Optional identity a host (e.g. a headless-browser agent sidecar) can pin BEFORE the app boots, so an
    // embodied external agent appears as a stable, distinct visitor instead of a fresh random one.
    __hyadesIdentity?: { visitorId?: string; avatarUrl?: string };
    // Stable agent-control hook (attached in createTellusWorld). Lets an external driver read world state and
    // take actions through the same in-world dispatch the built-in agents use. Object-literal property names
    // survive the production build (esbuild does not mangle keys / member access by default).
    tellusAgent?: {
      getState: (radius?: number) => unknown;
      getNearby: (radius?: number) => unknown;
      sendAction: (verb: string, args?: Record<string, unknown>) => unknown;
    };
    __tellusSnapshot?: () => TellusSnapshot;
    __tellusImportGenerated?: (things: unknown) => number;
    __tellusImportSnapshot?: (snapshot: unknown) => number;
    __tellusSaveGeneratedPlacements?: () => number;
  }
}

const WORLD_RADIUS = 72;
const OCEAN_RADIUS = 240;
const SEA_LEVEL = -3.35;
const DISTANT_ISLAND_COUNT = 18;
const TERRAIN_SEGMENTS = 96;
const DISTANT_TERRAIN_SEGMENTS = 32;
const DISTANT_TERRAIN_VERTEX_COUNT = DISTANT_TERRAIN_SEGMENTS + 1;
const CENTRAL_WALK_RADIUS = WORLD_RADIUS - 0.5;
const DISTANT_WALK_LOCAL_RADIUS = 1.02;
const AGENT_SPEED = 5.2;
const PLAYER_SPEED = 13;
const AUTONOMOUS_ASSET_INTERVAL_MS = 60_000;
const AUTONOMOUS_REFLECTION_OFFSET_MS = AUTONOMOUS_ASSET_INTERVAL_MS / 2;
const POND_CENTER: Vec3 = { x: 18, y: 0, z: -12 };
const POND_RADIUS = 7.4;
const TERRAIN_VERTEX_COUNT = TERRAIN_SEGMENTS + 1;
const TERRAIN_SCULPT_RADIUS = 6.2;
const TERRAIN_SCULPT_STEP = 0.72;
const WORLD_FEEDBACK_INTERVAL_MS = 75_000;
const WORLD_FEEDBACK_START_DELAY_MS = 14_000;
const SKYBOX_FALLBACK_URLS = [
  "/skybox/free_-_skybox_in_the_cloud/scene.gltf",
  "/skybox/free_-_skybox_in_the_cloud.glb",
  "/skybox/skybox_skydays_3.glb",
  "/skybox/free_-_skybox_basic_sky.glb",
];
const SKYBOX_VERTICAL_OFFSET = 0;
const DEFAULT_DAY_NIGHT_CYCLE_MS = 10 * 60 * 1000;
const DEFAULT_DAY_NIGHT_START = 0.18;
const MIN_DAY_NIGHT_CYCLE_MS = 60_000;
const MOON_MODEL_URL = "/moon/moon.glb";
const MOON_DISTANCE = 124;
const MOON_SIZE = 26;
const MOON_ARC_AZIMUTH = 0.54;
const MOON_ARC_LATERAL_SWAY = 0.58;
const terrainSculptOffsets = new Float32Array(
  TERRAIN_VERTEX_COUNT * TERRAIN_VERTEX_COUNT,
);
const terrainPaint = new Uint8Array(TERRAIN_VERTEX_COUNT * TERRAIN_VERTEX_COUNT);
let terrainSaveTimer: number | undefined;
let terrainStateDirty = false;
let terrainStateLoaded = false;
let terrainStateRevision = 0;
let pageVisitorId: string | undefined;
let stableUserId: string | undefined;
const PIXEL3D_PROVIDER = "pixel3d-gradio";
let tellusWorldBackendAvailable = false;

function boundedNumber(
  value: string | number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

const runtimeConfig: TellusRuntimeConfig = {
  apiBase:
    import.meta.env.VITE_TELLUS_API_BASE?.replace(/\/+$/, "") ?? "",
  assetForgeApiBase:
    import.meta.env.VITE_ASSET_FORGE_API_BASE?.replace(/\/+$/, "") ?? "",
  agentModel:
    import.meta.env.VITE_TELLUS_AGENT_MODEL ??
    "GLM-5.1",
  generationProvider:
    (import.meta.env.VITE_TELLUS_GENERATION_PROVIDER as
      | TellusRuntimeConfig["generationProvider"]
      | undefined) ?? "instantmesh-gradio",
  playerGenerationProvider:
    (import.meta.env.VITE_TELLUS_PLAYER_GENERATION_PROVIDER as
      | RoleGenerationProvider
      | undefined) ?? "instantmesh-gradio",
  agentGenerationProvider:
    (import.meta.env.VITE_TELLUS_AGENT_GENERATION_PROVIDER as
      | RoleGenerationProvider
      | undefined) ?? "pixal3d-gradio",
  instantMeshTarget:
    (import.meta.env.VITE_TELLUS_INSTANTMESH_TARGET as InstantMeshTarget | undefined) ??
    "dgx",
  instantMeshTargets: {
    dgx:
      import.meta.env.VITE_TELLUS_INSTANTMESH_DGX_URL?.replace(/\/+$/, "") ??
      "http://192.168.1.177:43839",
    local:
      import.meta.env.VITE_TELLUS_INSTANTMESH_LOCAL_URL?.replace(/\/+$/, "") ??
      "http://127.0.0.1:43839",
  },
  worldApiBase:
    import.meta.env.VITE_TELLUS_WORLD_API_BASE?.replace(/\/+$/, "") ?? "",
  worldId: import.meta.env.VITE_TELLUS_WORLD_ID ?? "main",
  skyboxUrl: import.meta.env.VITE_TELLUS_SKYBOX_URL ?? "",
  dayNightCycleMs: boundedNumber(
    import.meta.env.VITE_TELLUS_DAY_NIGHT_CYCLE_MS,
    DEFAULT_DAY_NIGHT_CYCLE_MS,
    MIN_DAY_NIGHT_CYCLE_MS,
    60 * 60 * 1000,
  ),
  dayNightStart: boundedNumber(
    import.meta.env.VITE_TELLUS_DAY_NIGHT_START,
    DEFAULT_DAY_NIGHT_START,
    0,
    1,
  ),
  enabledAgents: ["johnny"],
  avatars: {
    johnny: import.meta.env.VITE_TELLUS_JOHNNY_AVATAR_URL,
    mira: import.meta.env.VITE_TELLUS_MIRA_AVATAR_URL,
    sol: import.meta.env.VITE_TELLUS_SOL_AVATAR_URL,
  },
};
const gltfObjectCache = new Map<string, Promise<THREE.Object3D>>();
const generationProviderLabels: Record<GenerationProvider, string> = {
  local: "Local placeholder",
  "asset-forge": "Pixel3D legacy",
  "instantmesh-gradio": "Fast asset",
  "pixal3d-gradio": "High quality",
  "anigen-gradio": "Animated",
};
const instantMeshTargetLabels: Record<InstantMeshTarget, string> = {
  dgx: "DGX",
  local: "Local",
};
const allAgentIds = ["johnny", "mira", "sol", "atlas"] as const;

type MaterialWithTextureMaps = THREE.Material & {
  map?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
};

const terrainColors: Record<TerrainKind, THREE.Color> = {
  meadow: new THREE.Color(0x5fa22e),
  rock: new THREE.Color(0x5f7074),
  snow: new THREE.Color(0xd4e7e2),
  beach: new THREE.Color(0xf6dcbd),
  dirt: new THREE.Color(0x8a7241),
  water: new THREE.Color(0x256f92),
};

const terrainPaintKinds = [
  "meadow",
  "beach",
  "dirt",
  "rock",
  "snow",
] as const satisfies readonly TerrainPaintKind[];

function terrainPaintCode(kind: TerrainPaintKind): number {
  return terrainPaintKinds.indexOf(kind) + 1;
}

function terrainPaintKindFromCode(code: number): TerrainPaintKind | null {
  return terrainPaintKinds[code - 1] ?? null;
}

function isTerrainPaintMode(mode: TerrainEditMode): mode is TerrainPaintKind {
  return terrainPaintKinds.includes(mode as TerrainPaintKind);
}

function createAgentSeeds(): TellusAgent[] {
  const seeds: TellusAgent[] = [
    {
      id: "johnny",
      name: "Johnny",
      epithet: "world-forger",
      color: 0x7ec850,
      goal: "Freely imagine and generate any useful 3D asset for Tellus: terrain features, plants, animals, buildings, tools, vehicles, paths, water features, landmarks, habitats, companions, or strange beautiful objects.",
      avatarUrl: runtimeConfig.avatars.johnny,
      position: { x: -15, y: 0, z: 11 },
      target: { x: -11, y: 0, z: 9 },
      nextActionAt: 0,
      nextReflectionAt: 0,
    },
    {
      id: "mira",
      name: "Mira",
      epithet: "animal-lover",
      color: 0xe8b86d,
      goal: "Create creatures, animals, birds, fish, and reptiles each with a corresponding habitat, make homes for creatures great and small.",
      avatarUrl: runtimeConfig.avatars.mira,
      position: { x: 18, y: 0, z: 6 },
      target: { x: 13, y: 0, z: 4 },
      nextActionAt: 800,
      nextReflectionAt: 0,
    },
    {
      id: "sol",
      name: "Sol",
      epithet: "",
      color: 0x98a7ff,
      goal: "Build housing, shrines, and holy places in special spots that pay homage to nature.",
      avatarUrl: runtimeConfig.avatars.sol,
      position: { x: -5, y: 0, z: -21 },
      target: { x: -3, y: 0, z: -17 },
      nextActionAt: 1600,
      nextReflectionAt: 0,
    },
     {
      id: "atlas",
      name: "atlas",
      epithet: "",
      color: 0x98a7ff,
      goal: "Build roads, bridges, paths, trails, to connect the islands together, and create boats, hot air balloons, horses, waterways, streams, rivers, ponds, lagoons, wells, waterfalls and aquaducts.",
      avatarUrl: runtimeConfig.avatars.sol,
      position: { x: -5, y: 0, z: -21 },
      target: { x: -3, y: 0, z: -17 },
      nextActionAt: 2400,
      nextReflectionAt: 0,
    },
  ];
  const enabled = new Set(runtimeConfig.enabledAgents);
  return seeds.filter((agent) => enabled.has(agent.id));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rand(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function terrainGridIndex(xIndex: number, zIndex: number): number {
  return zIndex * TERRAIN_VERTEX_COUNT + xIndex;
}

function distantTerrainGridIndex(xIndex: number, zIndex: number): number {
  return zIndex * DISTANT_TERRAIN_VERTEX_COUNT + xIndex;
}

function terrainSculptOffsetAt(x: number, z: number): number {
  const gx = clamp(
    ((x / (WORLD_RADIUS * 2)) + 0.5) * TERRAIN_SEGMENTS,
    0,
    TERRAIN_SEGMENTS,
  );
  const gz = clamp(
    ((z / (WORLD_RADIUS * 2)) + 0.5) * TERRAIN_SEGMENTS,
    0,
    TERRAIN_SEGMENTS,
  );
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(TERRAIN_SEGMENTS, x0 + 1);
  const z1 = Math.min(TERRAIN_SEGMENTS, z0 + 1);
  const tx = gx - x0;
  const tz = gz - z0;
  const a = terrainSculptOffsets[terrainGridIndex(x0, z0)];
  const b = terrainSculptOffsets[terrainGridIndex(x1, z0)];
  const c = terrainSculptOffsets[terrainGridIndex(x0, z1)];
  const d = terrainSculptOffsets[terrainGridIndex(x1, z1)];
  return (
    a * (1 - tx) * (1 - tz) +
    b * tx * (1 - tz) +
    c * (1 - tx) * tz +
    d * tx * tz
  );
}

function centralTerrainGridCoords(
  x: number,
  z: number,
): { xIndex: number; zIndex: number } {
  return {
    xIndex: Math.round(
      clamp(
        ((x / (WORLD_RADIUS * 2)) + 0.5) * TERRAIN_SEGMENTS,
        0,
        TERRAIN_SEGMENTS,
      ),
    ),
    zIndex: Math.round(
      clamp(
        ((z / (WORLD_RADIUS * 2)) + 0.5) * TERRAIN_SEGMENTS,
        0,
        TERRAIN_SEGMENTS,
      ),
    ),
  };
}

function centralTerrainPaintAt(x: number, z: number): TerrainPaintKind | null {
  const { xIndex, zIndex } = centralTerrainGridCoords(x, z);
  return terrainPaintKindFromCode(terrainPaint[terrainGridIndex(xIndex, zIndex)]);
}

function distantIslandLocalPoint(
  spec: DistantIslandSpec,
  x: number,
  z: number,
): { x: number; z: number } {
  const dx = x - spec.x;
  const dz = z - spec.z;
  const cos = Math.cos(-spec.rotationY);
  const sin = Math.sin(-spec.rotationY);
  return {
    x: dx * cos - dz * sin,
    z: dx * sin + dz * cos,
  };
}

function distantIslandWorldPoint(
  spec: DistantIslandSpec,
  localX: number,
  localZ: number,
): { x: number; z: number } {
  const cos = Math.cos(spec.rotationY);
  const sin = Math.sin(spec.rotationY);
  return {
    x: spec.x + localX * cos - localZ * sin,
    z: spec.z + localX * sin + localZ * cos,
  };
}

function distance2D(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function createDistantIslandSpec(index: number): DistantIslandSpec {
  const seed = 1800 + index * 43;
  const angle =
    (index / DISTANT_ISLAND_COUNT) * Math.PI * 2 + rand(900 + index) * 0.32;
  const distance = 58 + rand(1400 + index) * 72;
  const isDestinationIsland = index % 5 === 1 || index % 7 === 4;
  const size = isDestinationIsland
    ? 2.05 + rand(2500 + index) * 0.85
    : 0.9 + rand(2600 + index) * 0.42;
  const topRadius = (4.6 + rand(seed + 1) * 4) * size;
  const bottomRadius = (8.5 + rand(seed + 2) * 7) * size;
  return {
    seed,
    angle,
    distance,
    x: Math.cos(angle) * distance,
    z: Math.sin(angle) * distance,
    size,
    topRadius,
    bottomRadius,
    height: 1.2 + rand(seed + 3) * 0.9,
    scaleZ: 0.55 + rand(seed + 5) * 0.65,
    rotationY: rand(seed + 6) * Math.PI,
    sculptOffsets: new Float32Array(
      DISTANT_TERRAIN_VERTEX_COUNT * DISTANT_TERRAIN_VERTEX_COUNT,
    ),
    paint: new Uint8Array(
      DISTANT_TERRAIN_VERTEX_COUNT * DISTANT_TERRAIN_VERTEX_COUNT,
    ),
  };
}

const distantIslandSpecs = Array.from(
  { length: DISTANT_ISLAND_COUNT },
  (_, index) => createDistantIslandSpec(index),
);

function distantIslandLocalRadius(
  spec: DistantIslandSpec,
  x: number,
  z: number,
): number {
  const { x: localX, z: localZ } = distantIslandLocalPoint(spec, x, z);
  const radiusX = spec.bottomRadius * 0.92;
  const radiusZ = radiusX * spec.scaleZ;
  return Math.hypot(localX / radiusX, localZ / radiusZ);
}

function distantIslandSculptOffsetAt(
  spec: DistantIslandSpec,
  x: number,
  z: number,
): number {
  const { x: localX, z: localZ } = distantIslandLocalPoint(spec, x, z);
  const radiusX = spec.bottomRadius * 0.92;
  const radiusZ = radiusX * spec.scaleZ;
  const gx = clamp(
    ((localX / (radiusX * 2)) + 0.5) * DISTANT_TERRAIN_SEGMENTS,
    0,
    DISTANT_TERRAIN_SEGMENTS,
  );
  const gz = clamp(
    ((localZ / (radiusZ * 2)) + 0.5) * DISTANT_TERRAIN_SEGMENTS,
    0,
    DISTANT_TERRAIN_SEGMENTS,
  );
  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(DISTANT_TERRAIN_SEGMENTS, x0 + 1);
  const z1 = Math.min(DISTANT_TERRAIN_SEGMENTS, z0 + 1);
  const tx = gx - x0;
  const tz = gz - z0;
  const a = spec.sculptOffsets[distantTerrainGridIndex(x0, z0)];
  const b = spec.sculptOffsets[distantTerrainGridIndex(x1, z0)];
  const c = spec.sculptOffsets[distantTerrainGridIndex(x0, z1)];
  const d = spec.sculptOffsets[distantTerrainGridIndex(x1, z1)];
  return (
    a * (1 - tx) * (1 - tz) +
    b * tx * (1 - tz) +
    c * (1 - tx) * tz +
    d * tx * tz
  );
}

function distantIslandGridWorldPoint(
  spec: DistantIslandSpec,
  xIndex: number,
  zIndex: number,
): { localX: number; localZ: number; x: number; z: number; localRadius: number } {
  const radiusX = spec.bottomRadius * 0.92;
  const radiusZ = radiusX * spec.scaleZ;
  const localX =
    (xIndex / DISTANT_TERRAIN_SEGMENTS - 0.5) * radiusX * 2;
  const localZ =
    (zIndex / DISTANT_TERRAIN_SEGMENTS - 0.5) * radiusZ * 2;
  const world = distantIslandWorldPoint(spec, localX, localZ);
  return {
    localX,
    localZ,
    x: world.x,
    z: world.z,
    localRadius: Math.hypot(localX / radiusX, localZ / radiusZ),
  };
}

function distantTerrainGridCoords(
  spec: DistantIslandSpec,
  x: number,
  z: number,
): { xIndex: number; zIndex: number } {
  const { x: localX, z: localZ } = distantIslandLocalPoint(spec, x, z);
  const radiusX = spec.bottomRadius * 0.92;
  const radiusZ = radiusX * spec.scaleZ;
  return {
    xIndex: Math.round(
      clamp(
        ((localX / (radiusX * 2)) + 0.5) * DISTANT_TERRAIN_SEGMENTS,
        0,
        DISTANT_TERRAIN_SEGMENTS,
      ),
    ),
    zIndex: Math.round(
      clamp(
        ((localZ / (radiusZ * 2)) + 0.5) * DISTANT_TERRAIN_SEGMENTS,
        0,
        DISTANT_TERRAIN_SEGMENTS,
      ),
    ),
  };
}

function distantTerrainPaintAt(
  spec: DistantIslandSpec,
  x: number,
  z: number,
): TerrainPaintKind | null {
  const { xIndex, zIndex } = distantTerrainGridCoords(spec, x, z);
  return terrainPaintKindFromCode(
    spec.paint[distantTerrainGridIndex(xIndex, zIndex)],
  );
}

function nearestDistantIsland(
  x: number,
  z: number,
  maxLocalRadius = 1,
): DistantIslandSpec | undefined {
  let nearest: DistantIslandSpec | undefined;
  let nearestLocalRadius = Infinity;
  for (const spec of distantIslandSpecs) {
    const localRadius = distantIslandLocalRadius(spec, x, z);
    if (localRadius <= maxLocalRadius && localRadius < nearestLocalRadius) {
      nearest = spec;
      nearestLocalRadius = localRadius;
    }
  }
  return nearest;
}

function distantIslandHeight(spec: DistantIslandSpec, x: number, z: number): number {
  const localRadius = clamp(distantIslandLocalRadius(spec, x, z), 0, 1);
  const crown = Math.pow(1 - localRadius, 1.75) * spec.height * 0.72;
  return SEA_LEVEL + 0.28 + crown + distantIslandSculptOffsetAt(spec, x, z);
}

function groundedPosition(x: number, z: number, fallback?: Vec3): Vec3 {
  if (Math.hypot(x, z) <= CENTRAL_WALK_RADIUS) {
    return { x, y: terrainHeight(x, z), z };
  }
  const distantIsland = nearestDistantIsland(x, z, DISTANT_WALK_LOCAL_RADIUS);
  if (distantIsland) {
    return { x, y: distantIslandHeight(distantIsland, x, z), z };
  }
  return fallback ? { ...fallback } : normalizedDiscPosition(x, z);
}

function groundHeightAt(x: number, z: number): number | null {
  if (Math.hypot(x, z) <= CENTRAL_WALK_RADIUS) return terrainHeight(x, z);
  const distantIsland = nearestDistantIsland(x, z, DISTANT_WALK_LOCAL_RADIUS);
  return distantIsland ? distantIslandHeight(distantIsland, x, z) : null;
}

function isIntentionallyElevated(thing: GeneratedThing): boolean {
  const groundY = groundHeightAt(thing.position.x, thing.position.z);
  return groundY !== null && thing.position.y > groundY + 0.35;
}

function normalizedDiscPosition(x: number, z: number): Vec3 {
  const radius = Math.hypot(x, z);
  if (radius <= CENTRAL_WALK_RADIUS) {
    return { x, y: terrainHeight(x, z), z };
  }
  const scale = CENTRAL_WALK_RADIUS / radius;
  const nx = x * scale;
  const nz = z * scale;
  return { x: nx, y: terrainHeight(nx, nz), z: nz };
}

function oceanPosition(x: number, z: number): Vec3 {
  const radius = Math.hypot(x, z);
  const maxRadius = OCEAN_RADIUS - 12;
  if (radius <= maxRadius) return { x, y: SEA_LEVEL + 0.14, z };
  const scale = maxRadius / radius;
  return { x: x * scale, y: SEA_LEVEL + 0.14, z: z * scale };
}

function waterBlockedByLand(position: Vec3): boolean {
  if (Math.hypot(position.x, position.z) < WORLD_RADIUS + 1.2) return true;
  return Boolean(nearestDistantIsland(position.x, position.z, 1.08));
}

function waterVehiclePosition(x: number, z: number, fallback?: Vec3): Vec3 {
  const position = oceanPosition(x, z);
  if (!waterBlockedByLand(position)) return position;
  return fallback ? { ...fallback } : oceanPosition(WORLD_RADIUS + 5, 0);
}

function distantIslandShorePosition(spec: DistantIslandSpec, x: number, z: number): Vec3 {
  const dx = x - spec.x;
  const dz = z - spec.z;
  const cos = Math.cos(-spec.rotationY);
  const sin = Math.sin(-spec.rotationY);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  const angle = Math.atan2(localZ / spec.scaleZ, localX) || 0.2;
  const radiusX = spec.bottomRadius * 0.68;
  const radiusZ = radiusX * spec.scaleZ;
  const shoreLocalX = Math.cos(angle) * radiusX;
  const shoreLocalZ = Math.sin(angle) * radiusZ;
  const worldCos = Math.cos(spec.rotationY);
  const worldSin = Math.sin(spec.rotationY);
  const shoreX = spec.x + shoreLocalX * worldCos - shoreLocalZ * worldSin;
  const shoreZ = spec.z + shoreLocalX * worldSin + shoreLocalZ * worldCos;
  return {
    x: shoreX,
    y: distantIslandHeight(spec, shoreX, shoreZ),
    z: shoreZ,
  };
}

type VehicleMode = "water" | "air" | "ground";

const waterMountTerms = [
  "dolphin",
  "orca",
  "whale",
  "sea turtle",
  "giant turtle",
  "hippocampus",
  "seahorse mount",
];

const airMountTerms = [
  "giant eagle",
  "eagle",
  "griffin",
  "gryphon",
  "dragon",
  "wyvern",
  "pegasus",
  "roc",
  "flying mount",
];

const groundMountTerms = [
  "horse",
  "pony",
  "stag",
  "elk",
  "camel",
  "llama",
  "giant wolf",
  "mount",
  "rideable",
];

function promptIncludesAny(prompt: string, terms: string[]): boolean {
  return terms.some((term) => prompt.includes(term));
}

function vehicleMode(thing: GeneratedThing): VehicleMode | null {
  const lower = thing.prompt.toLowerCase();
  if (
    thing.kind === "balloon" ||
    promptIncludesAny(lower, airMountTerms) ||
    lower.includes("balloon") ||
    lower.includes("airship") ||
    lower.includes("zeppelin") ||
    lower.includes("glider") ||
    lower.includes("flying") ||
    lower.includes("air boat")
  ) {
    return "air";
  }
  if (
    promptIncludesAny(lower, waterMountTerms) ||
    lower.includes("boat") ||
    lower.includes("ship") ||
    lower.includes("sail") ||
    lower.includes("canoe") ||
    lower.includes("raft") ||
    lower.includes("skiff") ||
    lower.includes("dinghy")
  ) {
    return "water";
  }
  if (
    promptIncludesAny(lower, groundMountTerms) ||
    lower.includes("vehicle") ||
    lower.includes("cart") ||
    lower.includes("wagon") ||
    lower.includes("carriage") ||
    lower.includes("car ") ||
    lower.includes("truck")
  ) {
    return "ground";
  }
  return null;
}

function isMountThing(thing: GeneratedThing): boolean {
  return thing.kind === "animal" && vehicleMode(thing) !== null;
}

function isVehicleThing(thing: GeneratedThing): boolean {
  return vehicleMode(thing) !== null;
}

function isFreeMovingVehicle(thing: GeneratedThing): boolean {
  const mode = vehicleMode(thing);
  return mode === "water" || mode === "air";
}

function airPosition(x: number, z: number): Vec3 {
  const radius = Math.hypot(x, z);
  const maxRadius = OCEAN_RADIUS - 14;
  const scale = radius > maxRadius ? maxRadius / radius : 1;
  const nx = x * scale;
  const nz = z * scale;
  const groundY =
    Math.hypot(nx, nz) <= WORLD_RADIUS
      ? terrainHeight(nx, nz)
      : SEA_LEVEL;
  return { x: nx, y: groundY + 12, z: nz };
}

function movedVehiclePosition(
  thing: GeneratedThing,
  x: number,
  z: number,
  fallback?: Vec3,
): Vec3 {
  const mode = vehicleMode(thing);
  if (mode === "air") return airPosition(x, z);
  if (mode === "water") return waterVehiclePosition(x, z, fallback);
  return groundedPosition(x, z, fallback);
}

function baseTerrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const mountain = Math.max(0, 1 - r / 20);
  const mound = Math.pow(mountain, 2.2) * 21;
  const shoulder = Math.exp(-((x + 16) ** 2 + (z - 12) ** 2) / 190) * 4.2;
  const southernRise = Math.exp(-((x - 9) ** 2 + (z + 24) ** 2) / 160) * 3.1;
  const ridge =
    Math.sin(x * 0.22 + z * 0.08) * 1.05 +
    Math.cos(z * 0.2 - x * 0.06) * 0.72 +
    Math.sin((x + z) * 0.11) * 0.42;
  const rimStart = WORLD_RADIUS * 0.72;
  const rimWidth = WORLD_RADIUS * 0.28;
  const rimDrop = Math.max(0, (r - rimStart) / rimWidth) * 5.8;
  const pond = Math.exp(-((x - 18) ** 2 + (z + 12) ** 2) / 65) * 2.5;
  return mound + shoulder + southernRise + ridge - rimDrop - pond - 0.65;
}

function terrainHeight(x: number, z: number): number {
  return baseTerrainHeight(x, z) + terrainSculptOffsetAt(x, z);
}

function terrainKind(x: number, z: number, y: number): TerrainKind {
  const painted = centralTerrainPaintAt(x, z);
  if (painted) return painted;
  const pondDistance = Math.hypot(x - 18, z + 12);
  if (pondDistance < 7 && y < 1.9) return "water";
  if (y > 13.5) return "snow";
  if (y > 6.8) return "rock";
  const pathBand = Math.abs(Math.sin(Math.atan2(z, x) * 3 + 0.5)) < 0.13;
  if (pathBand && Math.hypot(x, z) > 8) return "dirt";
  return "meadow";
}

function pondWaterLevel(): number {
  return baseTerrainHeight(POND_CENTER.x, POND_CENTER.z) + 0.55;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function browserUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return makeId("uuid");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyRuntimeConfig(config: unknown): void {
  if (!isRecord(config)) return;

  const assetForgeApiBase = config.assetForgeApiBase;
  if (
    !import.meta.env.VITE_ASSET_FORGE_API_BASE?.trim() &&
    typeof assetForgeApiBase === "string" &&
    assetForgeApiBase.trim()
  ) {
    runtimeConfig.assetForgeApiBase = assetForgeApiBase.trim().replace(/\/+$/, "");
  }

  const apiBase = config.apiBase;
  if (
    !import.meta.env.VITE_TELLUS_API_BASE?.trim() &&
    typeof apiBase === "string"
  ) {
    runtimeConfig.apiBase = apiBase.trim().replace(/\/+$/, "");
  }

  const agentModel = config.agentModel;
  if (
    !import.meta.env.VITE_TELLUS_AGENT_MODEL?.trim() &&
    typeof agentModel === "string" &&
    agentModel.trim()
  ) {
    runtimeConfig.agentModel = agentModel.trim();
  }

  const generationProvider = config.generationProvider;
  if (
    !import.meta.env.VITE_TELLUS_GENERATION_PROVIDER?.trim() &&
    (generationProvider === "local" ||
      generationProvider === "asset-forge" ||
      generationProvider === "instantmesh-gradio" ||
      generationProvider === "pixal3d-gradio" ||
      generationProvider === "anigen-gradio")
  ) {
    runtimeConfig.generationProvider = generationProvider;
  }

  const playerGenerationProvider = config.playerGenerationProvider;
  if (
    !import.meta.env.VITE_TELLUS_PLAYER_GENERATION_PROVIDER?.trim() &&
    (playerGenerationProvider === "local" ||
      playerGenerationProvider === "instantmesh-gradio" ||
      playerGenerationProvider === "pixal3d-gradio" ||
      playerGenerationProvider === "anigen-gradio")
  ) {
    runtimeConfig.playerGenerationProvider = playerGenerationProvider;
  }

  const agentGenerationProvider = config.agentGenerationProvider;
  if (
    !import.meta.env.VITE_TELLUS_AGENT_GENERATION_PROVIDER?.trim() &&
    (agentGenerationProvider === "local" ||
      agentGenerationProvider === "instantmesh-gradio" ||
      agentGenerationProvider === "pixal3d-gradio" ||
      agentGenerationProvider === "anigen-gradio")
  ) {
    runtimeConfig.agentGenerationProvider = agentGenerationProvider;
  }

  const instantMeshTarget = config.instantMeshTarget;
  if (
    !import.meta.env.VITE_TELLUS_INSTANTMESH_TARGET?.trim() &&
    (instantMeshTarget === "dgx" || instantMeshTarget === "local")
  ) {
    runtimeConfig.instantMeshTarget = instantMeshTarget;
  }

  const instantMeshTargets = config.instantMeshTargets;
  if (isRecord(instantMeshTargets)) {
    for (const target of ["dgx", "local"] as const) {
      const baseUrl = instantMeshTargets[target];
      if (typeof baseUrl === "string" && baseUrl.trim()) {
        runtimeConfig.instantMeshTargets[target] = baseUrl.trim().replace(/\/+$/, "");
      }
    }
  }

  const skyboxUrl = config.skyboxUrl;
  if (typeof skyboxUrl === "string" && skyboxUrl.trim()) {
    runtimeConfig.skyboxUrl = skyboxUrl.trim();
  }

  const dayNightCycleMs = config.dayNightCycleMs;
  if (typeof dayNightCycleMs === "number") {
    runtimeConfig.dayNightCycleMs = boundedNumber(
      dayNightCycleMs,
      runtimeConfig.dayNightCycleMs,
      MIN_DAY_NIGHT_CYCLE_MS,
      60 * 60 * 1000,
    );
  }

  const dayNightStart = config.dayNightStart;
  if (typeof dayNightStart === "number") {
    runtimeConfig.dayNightStart = boundedNumber(
      dayNightStart,
      runtimeConfig.dayNightStart,
      0,
      1,
    );
  }

  const worldApiBase = config.worldApiBase;
  if (
    !import.meta.env.VITE_TELLUS_WORLD_API_BASE?.trim() &&
    typeof worldApiBase === "string"
  ) {
    runtimeConfig.worldApiBase = worldApiBase.trim().replace(/\/+$/, "");
  }

  const worldId = config.worldId;
  if (
    !import.meta.env.VITE_TELLUS_WORLD_ID?.trim() &&
    typeof worldId === "string" &&
    worldId.trim()
  ) {
    runtimeConfig.worldId = worldId.trim();
  }

  const enabledAgents = config.enabledAgents;
  if (Array.isArray(enabledAgents)) {
    const configuredAgentIds = enabledAgents.filter(
      (agentId): agentId is AgentId =>
        typeof agentId === "string" &&
        allAgentIds.includes(agentId as AgentId),
    );
    if (configuredAgentIds.length > 0) {
      runtimeConfig.enabledAgents = [...new Set(configuredAgentIds)];
    }
  }

  const avatars = config.avatars;
  if (!isRecord(avatars)) return;

  for (const agentId of allAgentIds) {
    const avatarUrl = avatars[agentId];
    if (typeof avatarUrl === "string" && avatarUrl.trim()) {
      runtimeConfig.avatars[agentId] = avatarUrl.trim();
    }
  }
}

async function loadRuntimeConfigFile(path: string): Promise<void> {
  const response = await fetch(path, { cache: "no-store" });
  if (response.status === 404) return;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return;
  applyRuntimeConfig(await readJsonResponse<unknown>(response));
}

async function loadRuntimeConfig(): Promise<void> {
  await loadRuntimeConfigFile("/tellus-config.json");
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    await loadRuntimeConfigFile("/tellus-config.local.json");
  }
}

function terrainOffsetsPayload(): number[] {
  return Array.from(terrainSculptOffsets, (value) => Number(value.toFixed(4)));
}

function terrainPaintPayload(): number[] {
  return Array.from(terrainPaint);
}

function distantTerrainOffsetsPayload(): Record<string, number[]> {
  return Object.fromEntries(
    distantIslandSpecs.map((spec) => [
      String(spec.seed),
      Array.from(spec.sculptOffsets, (value) => Number(value.toFixed(4))),
    ]),
  );
}

function distantTerrainPaintPayload(): Record<string, number[]> {
  return Object.fromEntries(
    distantIslandSpecs.map((spec) => [String(spec.seed), Array.from(spec.paint)]),
  );
}

function tellusState(): TellusTerrainState {
  return {
    version: 2,
    revision: terrainStateRevision,
    terrainSculptOffsets: terrainOffsetsPayload(),
    terrainPaint: terrainPaintPayload(),
    distantIslandSculptOffsets: distantTerrainOffsetsPayload(),
    distantIslandPaint: distantTerrainPaintPayload(),
    savedAt: new Date().toISOString(),
  };
}

function tellusStatePayload(): string {
  return JSON.stringify(tellusState());
}

function terrainStorageKey(): string {
  return `tellus.terrain.${runtimeConfig.worldId}`;
}

function isResetTerrainState(value: unknown): boolean {
  return isRecord(value) && value.savedAt === "reset-after-smoke";
}

function saveTerrainStateLocally(body: string): void {
  try {
    window.localStorage.setItem(terrainStorageKey(), body);
  } catch (error) {
    console.warn("Tellus local terrain save failed", error);
  }
}

function loadTerrainStateLocally(): TellusTerrainState | null {
  try {
    const raw = window.localStorage.getItem(terrainStorageKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isTellusTerrainState(parsed) && !isResetTerrainState(parsed)
      ? parsed
      : null;
  } catch (error) {
    console.warn("Tellus local terrain load failed", error);
    return null;
  }
}

function tellusWorldHttpUrl(route: "state" | "action"): string {
  return `${runtimeConfig.worldApiBase}/api/world/${encodeURIComponent(runtimeConfig.worldId)}/${route}`;
}

function tellusAssetLibraryUrl(path: string): string {
  return `${runtimeConfig.worldApiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

async function loadAssetLibraryModels(): Promise<AssetLibraryModel[]> {
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
        : [];
    })(),
    generatedAssetManifestEntries().catch(() => []),
  ]);
  const generatedModels = generatedEntries
    .map((entry): AssetLibraryModel | null => {
      if (typeof entry.id !== "string" || typeof entry.modelUrl !== "string") {
        return null;
      }
      const modelUrl = entry.modelUrl;
      const prompt =
        typeof entry.prompt === "string" && entry.prompt.trim()
          ? entry.prompt.trim()
          : "generated asset";
      return {
        id: `generated:${entry.id}`,
        name: prompt,
        description: prompt,
        file_format: "glb",
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

function tellusWorldWebSocketUrl(visitorId: string): string {
  const httpUrl = new URL(tellusWorldHttpUrl("state"), window.location.href);
  httpUrl.pathname = httpUrl.pathname.replace(/\/state\/?$/, "/live");
  httpUrl.searchParams.set("visitorId", visitorId);
  httpUrl.protocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  return httpUrl.toString();
}

function tellusVisitorId(): string {
  if (!pageVisitorId) {
    // Honor a host-pinned identity (window.__hyadesIdentity or a ?visitorId= query param) before falling
    // back to a fresh random id — lets an embodied external agent join as a stable, distinct visitor.
    const injected =
      window.__hyadesIdentity?.visitorId ??
      new URLSearchParams(window.location.search).get("visitorId") ??
      undefined;
    pageVisitorId = injected && injected.trim() ? injected.trim() : browserUuid();
  }
  return pageVisitorId;
}

function tellusUserId(): string {
  if (stableUserId) return stableUserId;
  const storageKey = "tellus.userId";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) {
    stableUserId = existing;
    return stableUserId;
  }
  stableUserId = browserUuid();
  window.localStorage.setItem(storageKey, stableUserId);
  return stableUserId;
}

function speakTellusText(text: string): void {
  if (!("speechSynthesis" in window)) return;
  const trimmed = text.trim();
  if (!trimmed) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(trimmed);
  utterance.rate = 0.96;
  utterance.pitch = 1.04;
  window.speechSynthesis.speak(utterance);
}

function applyTellusTerrainState(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return false;
  }
  const offsets = (parsed as { terrainSculptOffsets?: unknown }).terrainSculptOffsets;
  const paint = (parsed as { terrainPaint?: unknown }).terrainPaint;
  terrainSculptOffsets.fill(0);
  terrainPaint.fill(0);
  if (Array.isArray(offsets)) {
    for (let i = 0; i < Math.min(offsets.length, terrainSculptOffsets.length); i++) {
      const value = offsets[i];
      terrainSculptOffsets[i] = typeof value === "number" && Number.isFinite(value)
        ? clamp(value, -9, 9)
        : 0;
    }
  }
  if (Array.isArray(paint)) {
    for (let i = 0; i < Math.min(paint.length, terrainPaint.length); i++) {
      const value = paint[i];
      terrainPaint[i] =
        typeof value === "number" && Number.isFinite(value)
          ? clamp(Math.round(value), 0, terrainPaintKinds.length)
          : 0;
    }
  }
  const distantOffsets = (parsed as {
    distantIslandSculptOffsets?: unknown;
  }).distantIslandSculptOffsets;
  const distantPaint = (parsed as {
    distantIslandPaint?: unknown;
  }).distantIslandPaint;
  for (const spec of distantIslandSpecs) {
    spec.sculptOffsets.fill(0);
    spec.paint.fill(0);
    if (distantOffsets && typeof distantOffsets === "object") {
      const values = (distantOffsets as Record<string, unknown>)[String(spec.seed)];
      if (Array.isArray(values)) {
        for (let i = 0; i < Math.min(values.length, spec.sculptOffsets.length); i++) {
          const value = values[i];
          spec.sculptOffsets[i] =
            typeof value === "number" && Number.isFinite(value)
              ? clamp(value, -9, 9)
              : 0;
        }
      }
    }
    if (distantPaint && typeof distantPaint === "object") {
      const values = (distantPaint as Record<string, unknown>)[String(spec.seed)];
      if (Array.isArray(values)) {
        for (let i = 0; i < Math.min(values.length, spec.paint.length); i++) {
          const value = values[i];
          spec.paint[i] =
            typeof value === "number" && Number.isFinite(value)
              ? clamp(Math.round(value), 0, terrainPaintKinds.length)
              : 0;
        }
      }
    }
  }
  const revision = (parsed as { revision?: unknown }).revision;
  terrainStateRevision =
    typeof revision === "number" && Number.isFinite(revision)
      ? Math.max(terrainStateRevision, revision)
      : terrainStateRevision;
  return true;
}

function terrainFromWorldPatch(parsed: unknown): TellusTerrainState | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const patch = parsed as Partial<WorldPatch>;
  if (
    (patch.type === "world.snapshot" || patch.type === "terrain.updated") &&
    isTellusTerrainState(patch.terrain)
  ) {
    return patch.terrain;
  }
  return null;
}

function presenceFromWorldPatch(parsed: unknown): WorldPresence[] | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const patch = parsed as Partial<WorldPatch>;
  if (
    (patch.type === "world.snapshot" || patch.type === "presence.updated") &&
    Array.isArray(patch.presence)
  ) {
    return patch.presence.filter(
      (presence): presence is WorldPresence =>
        typeof presence.visitorId === "string" &&
        typeof presence.connectedAt === "string" &&
        typeof presence.lastSeenAt === "string",
    );
  }
  return null;
}

function generatedFromWorldPatch(parsed: unknown): WorldGeneratedThing[] | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const patch = parsed as Partial<WorldPatch>;
  if (patch.type === "world.snapshot" && Array.isArray(patch.generated)) {
    return patch.generated.filter(isWorldGeneratedThing);
  }
  if (patch.type === "generated.updated" && isWorldGeneratedThing(patch.thing)) {
    return [patch.thing];
  }
  return null;
}

let initialWorldGeneratedThings: WorldGeneratedThing[] = [];

async function loadTellusWorldState(): Promise<boolean> {
  if (!runtimeConfig.worldApiBase) return false;
  const response = await fetch(tellusWorldHttpUrl("state"), { cache: "no-store" });
  if (!response.ok) return false;
  const parsed = await response.json();
  const terrain = terrainFromWorldPatch(parsed);
  if (!terrain) return false;
  initialWorldGeneratedThings = generatedFromWorldPatch(parsed) ?? [];
  applyTellusTerrainState(terrain);
  return true;
}

async function saveTellusWorldState(body: string, keepalive = false): Promise<boolean> {
  if (!tellusWorldBackendAvailable) return false;
  const response = await fetch(tellusWorldHttpUrl("action"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "terrain.replace",
      visitorId: tellusVisitorId(),
      terrain: JSON.parse(body) as TellusTerrainState,
    }),
    keepalive,
  });
  if (!response.ok) {
    tellusWorldBackendAvailable = false;
    return false;
  }
  return true;
}

async function loadTellusState(): Promise<void> {
  terrainStateLoaded = false;
  try {
    try {
      tellusWorldBackendAvailable = await loadTellusWorldState();
      if (tellusWorldBackendAvailable) return;
    } catch (error) {
      tellusWorldBackendAvailable = false;
      console.warn("Tellus world backend failed to load", error);
    }

    const localSavedTerrain = loadTerrainStateLocally();
    if (localSavedTerrain) {
      applyTellusTerrainState(localSavedTerrain);
      return;
    }

    const response = await fetch(tellusApiUrl("/api/tellus-state"), { cache: "no-store" });
    if (!response.ok) {
      terrainStateLoaded = true;
      terrainStateDirty = false;
      return;
    }
    const localTerrainState = await response.json();
    if (isResetTerrainState(localTerrainState)) {
      terrainStateLoaded = true;
      terrainStateDirty = false;
      return;
    }
    if (!applyTellusTerrainState(localTerrainState)) {
      terrainStateLoaded = true;
      terrainStateDirty = false;
    }
  } finally {
    terrainStateLoaded = true;
    terrainStateDirty = false;
  }
}

function saveTellusStateSoon(): void {
  terrainStateDirty = true;
  terrainStateRevision++;
  if (!terrainStateLoaded) return;
  if (terrainSaveTimer !== undefined) {
    window.clearTimeout(terrainSaveTimer);
  }
  const saveRevision = terrainStateRevision;
  terrainSaveTimer = window.setTimeout(() => {
    terrainSaveTimer = undefined;
    const body = tellusStatePayload();
    saveTerrainStateLocally(body);
    void saveTellusWorldState(body)
      .then((savedToWorld) => {
        if (savedToWorld) return new Response(null, { status: 204 });
        return fetch(tellusApiUrl("/api/tellus-state"), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        });
      })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`state save returned ${response.status}`);
        }
        if (terrainStateRevision === saveRevision) {
          terrainStateDirty = false;
        }
      })
      .catch((error) => {
        console.warn("Tellus state save failed", error);
      });
  }, 650);
}

function saveTellusStateNow(): void {
  if (!terrainStateDirty || !terrainStateLoaded) return;
  if (terrainSaveTimer !== undefined) {
    window.clearTimeout(terrainSaveTimer);
    terrainSaveTimer = undefined;
  }
  const body = tellusStatePayload();
  saveTerrainStateLocally(body);
  const saveRevision = terrainStateRevision;
  void saveTellusWorldState(body, true)
    .then((savedToWorld) => {
      if (savedToWorld) return new Response(null, { status: 204 });
      if (!runtimeConfig.apiBase && navigator.sendBeacon?.("/api/tellus-state", new Blob([body], {
        type: "application/json",
      }))) {
        terrainStateDirty = false;
        return new Response(null, { status: 204 });
      }
      return fetch(tellusApiUrl("/api/tellus-state"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`state save returned ${response.status}`);
      }
      if (terrainStateRevision === saveRevision) {
        terrainStateDirty = false;
      }
    })
    .catch((error) => {
      console.warn("Tellus state save failed", error);
    });
}

function toAssetId(prompt: string, prefix: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
  return `tellus-${prefix}-${slug || "creation"}-${Date.now().toString(36)}`;
}

function absoluteAssetForgeUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${runtimeConfig.assetForgeApiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function tellusApiUrl(path: string): string {
  return `${runtimeConfig.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function absoluteTellusApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return tellusApiUrl(path);
}

let generatedAssetManifestCache:
  | { loadedAt: number; entries: GeneratedAssetManifestEntry[]; byId: Map<string, string> }
  | undefined;

async function generatedAssetManifestEntries(): Promise<GeneratedAssetManifestEntry[]> {
  const now = Date.now();
  if (generatedAssetManifestCache && now - generatedAssetManifestCache.loadedAt < 5000) {
    return generatedAssetManifestCache.entries;
  }
  const response = await fetch(tellusApiUrl("/generated-assets/manifest.json"), {
    cache: "no-store",
  });
  if (!response.ok) return [];
  const parsed = (await response.json()) as unknown;
  const entries = Array.isArray(parsed)
    ? (parsed as GeneratedAssetManifestEntry[]).filter(
        (entry) =>
          typeof entry.id === "string" &&
          typeof entry.modelUrl === "string",
      )
    : [];
  const byId = new Map<string, string>();
  for (const entry of entries) {
    byId.set(entry.id as string, absoluteTellusApiUrl(entry.modelUrl as string));
  }
  generatedAssetManifestCache = { loadedAt: now, entries, byId };
  return entries;
}

async function generatedAssetManifestModelUrls(): Promise<Map<string, string>> {
  await generatedAssetManifestEntries();
  const byId = generatedAssetManifestCache?.byId ?? new Map<string, string>();
  return byId;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    const message = extractErrorMessage(body);
    throw new Error(`${response.status}${message ? ` ${message}` : ""}`);
  }
  return (await response.json()) as T;
}

function captureCanvasDataUrl(canvas: HTMLCanvasElement): string {
  const maxSide = 768;
  const sourceWidth = Math.max(1, canvas.width);
  const sourceHeight = Math.max(1, canvas.height);
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.floor(sourceWidth * scale));
  const height = Math.max(1, Math.floor(sourceHeight * scale));
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Could not create image capture context");
  context.drawImage(canvas, 0, 0, width, height);
  return output.toDataURL("image/jpeg", 0.72);
}

async function requestWorldFeedback(imageDataUrl: string): Promise<string> {
  const response = await fetch(tellusApiUrl("/api/world-feedback"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageDataUrl,
      prompt:
        "Describe the visible Tellus world in 4-6 concise bullet points for an autonomous in-world agent. Focus on visible terrain, water, generated objects, agent/avatar positions, spatial relationships, and anything that looks unfinished or surprising.",
    }),
  });
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `World feedback service returned ${response.status} ${
        response.statusText || "non-JSON response"
      }`.trim(),
    );
  }
  const payload = (await response.json()) as WorldFeedbackResponse;
  if (!response.ok) {
    throw new Error(
      payload.error ||
        `World feedback service returned ${response.status} ${
          response.statusText || "error"
        }`.trim(),
    );
  }
  if (!payload.summary?.trim()) {
    throw new Error(payload.error || "World feedback returned no summary");
  }
  return payload.summary.trim().slice(0, 1600);
}

function extractErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (isRecord(parsed) && typeof parsed.error === "string") {
      return sanitizeLogText(parsed.error);
    }
  } catch {
    // Fall through to text cleanup.
  }
  return sanitizeLogText(body);
}

function sanitizeLogText(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

async function startPixel3DGeneration(
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

async function waitForPixel3DModelUrl(
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

function hasExternalGenerationProvider(provider = runtimeConfig.generationProvider): boolean {
  if (provider === "asset-forge") {
    return Boolean(runtimeConfig.assetForgeApiBase);
  }
  return (
    provider === "instantmesh-gradio" ||
    provider === "pixal3d-gradio" ||
    provider === "anigen-gradio"
  );
}

function isMissingApiRouteError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /\b(404|405)\b/.test(error.message) || error.message.includes("endpoint unavailable");
}

function generationProviderForThing(thing: GeneratedThing): GenerationProvider {
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

async function startDirectInstantMeshGeneration(
  thing: GeneratedThing,
  provider: DirectGenerationProvider,
  signal?: AbortSignal,
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

async function waitForDirectGeneration(
  initial: DirectGenerationResponse,
  signal?: AbortSignal,
  onStatus?: (status: DirectGenerationResponse["status"]) => void,
): Promise<DirectGenerationResponse> {
  if (initial.modelUrl && initial.status !== "failed") return initial;
  const deadline = Date.now() + 22 * 60 * 1000;
  let lastStatus = initial.status;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    await new Promise((resolve) => window.setTimeout(resolve, 4000));
    signal?.throwIfAborted();
    const response = await fetch(
      tellusApiUrl(`/api/generate-3d?jobId=${encodeURIComponent(initial.jobId)}`),
      { signal },
    );
    const contentType = response.headers.get("Content-Type") ?? "";
    if ((response.status === 404 || response.status === 405) && !contentType.includes("application/json")) {
      throw new Error("Direct generation endpoint unavailable");
    }
    const status = await readJsonResponse<DirectGenerationResponse>(response);
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

function cancelDirectGeneration(jobId?: string): void {
  if (!jobId) return;
  void fetch(tellusApiUrl(`/api/generate-3d?jobId=${encodeURIComponent(jobId)}`), {
    method: "DELETE",
    keepalive: true,
  }).catch(() => undefined);
}

function createTerrainGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let z = 0; z <= TERRAIN_SEGMENTS; z++) {
    const vz = (z / TERRAIN_SEGMENTS - 0.5) * WORLD_RADIUS * 2;
    for (let x = 0; x <= TERRAIN_SEGMENTS; x++) {
      const vx = (x / TERRAIN_SEGMENTS - 0.5) * WORLD_RADIUS * 2;
      const r = Math.hypot(vx, vz);
      const inside = r <= WORLD_RADIUS;
      const edgeScale = inside ? 1 : WORLD_RADIUS / r;
      const px = vx * edgeScale;
      const pz = vz * edgeScale;
      const py = inside ? terrainHeight(px, pz) : -4.5;
      const kind = inside ? terrainKind(px, pz, py) : "rock";
      const color = terrainColors[kind].clone();
      const noise = 0.9 + rand(x * 1009 + z * 9176) * 0.18;
      color.multiplyScalar(noise);
      positions.push(px, py, pz);
      colors.push(color.r, color.g, color.b);
    }
  }

  const row = TERRAIN_SEGMENTS + 1;
  for (let z = 0; z < TERRAIN_SEGMENTS; z++) {
    for (let x = 0; x < TERRAIN_SEGMENTS; x++) {
      const a = z * row + x;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFloatingRim(): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(
    WORLD_RADIUS,
    WORLD_RADIUS * 0.82,
    9,
    128,
    1,
    true,
  );
  geometry.translate(0, -6.5, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6a5b48,
    roughness: 0.9,
    metalness: 0,
  });
  return new THREE.Mesh(geometry, material);
}

function createFallbackOceanMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x49a8d8,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

function createOceanSurface(useBackdropWater: boolean): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(OCEAN_RADIUS, 192);
  const material = useBackdropWater
    ? createBackdropWaterMaterial()
    : createFallbackOceanMaterial();
  const ocean = new THREE.Mesh(geometry, material);
  ocean.name = "tellus-surrounding-ocean";
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = SEA_LEVEL;
  ocean.renderOrder = -4;
  return ocean;
}

function createDistantIslandTerrainGeometry(
  spec: DistantIslandSpec,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let zIndex = 0; zIndex <= DISTANT_TERRAIN_SEGMENTS; zIndex++) {
    for (let xIndex = 0; xIndex <= DISTANT_TERRAIN_SEGMENTS; xIndex++) {
      const point = distantIslandGridWorldPoint(spec, xIndex, zIndex);
      const y = distantIslandHeight(spec, point.x, point.z) - SEA_LEVEL;
      positions.push(point.localX, y, point.localZ);
      const painted = distantTerrainPaintAt(spec, point.x, point.z);
      const color = painted
        ? terrainColors[painted].clone()
        : new THREE.Color(0x5a9735).lerp(
            new THREE.Color(0x7a6a4a),
            clamp(point.localRadius * 0.42, 0, 0.42),
          );
      const noise = 0.9 + rand(spec.seed + xIndex * 41 + zIndex * 83) * 0.14;
      color.multiplyScalar(noise);
      colors.push(color.r, color.g, color.b);
    }
  }

  const row = DISTANT_TERRAIN_VERTEX_COUNT;
  for (let z = 0; z < DISTANT_TERRAIN_SEGMENTS; z++) {
    for (let x = 0; x < DISTANT_TERRAIN_SEGMENTS; x++) {
      const a = z * row + x;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      const aPoint = distantIslandGridWorldPoint(spec, x, z);
      const bPoint = distantIslandGridWorldPoint(spec, x + 1, z);
      const cPoint = distantIslandGridWorldPoint(spec, x, z + 1);
      const dPoint = distantIslandGridWorldPoint(spec, x + 1, z + 1);
      if (
        Math.max(
          aPoint.localRadius,
          bPoint.localRadius,
          cPoint.localRadius,
          dPoint.localRadius,
        ) > 1
      ) {
        continue;
      }
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createDistantIsland(spec: DistantIslandSpec): THREE.Group {
  const group = new THREE.Group();
  group.name = `tellus-distant-island-${spec.seed}`;
  group.position.set(spec.x, SEA_LEVEL - 0.02, spec.z);

  const islandColor = new THREE.Color(0x4f8b2e).lerp(
    new THREE.Color(0x243d35),
    rand(spec.seed + 4) * 0.45,
  );
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(
      spec.topRadius,
      spec.bottomRadius,
      spec.height,
      18,
      1,
    ),
    new THREE.MeshStandardMaterial({
      color: islandColor,
      roughness: 0.94,
      metalness: 0,
    }),
  );
  island.position.y = spec.height * 0.42;
  island.scale.z = spec.scaleZ;
  island.rotation.y = spec.rotationY;
  group.add(island);

  const topTerrain = new THREE.Mesh(
    createDistantIslandTerrainGeometry(spec),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
    }),
  );
  topTerrain.name = `tellus-distant-terrain-${spec.seed}`;
  topTerrain.rotation.y = spec.rotationY;
  topTerrain.receiveShadow = true;
  group.add(topTerrain);

  const hillCount = 2 + Math.floor(rand(spec.seed + 7) * (spec.size > 1.5 ? 5 : 3));
  const hillMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x5d8f42).lerp(
      new THREE.Color(0x7a6a4a),
      rand(spec.seed + 11) * 0.28,
    ),
    roughness: 0.92,
    metalness: 0,
  });
  for (let i = 0; i < hillCount; i++) {
    const localAngle = rand(spec.seed + i * 19) * Math.PI * 2;
    const localRadius = (1.2 + rand(spec.seed + i * 23) * 5.2) * spec.size;
    const localX = Math.cos(localAngle) * localRadius;
    const localZ = Math.sin(localAngle) * localRadius * spec.scaleZ;
    const world = distantIslandWorldPoint(spec, localX, localZ);
    const surfaceY = distantIslandHeight(spec, world.x, world.z) - SEA_LEVEL;
    const hillRadius = (1.9 + rand(spec.seed + i * 13) * 3.6) *
      (0.7 + spec.size * 0.2);
    const hillHeight = (0.55 + rand(spec.seed + i * 17) * 1.5) *
      (0.8 + spec.size * 0.22);
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 10),
      hillMaterial.clone(),
    );
    hill.position.set(localX, surfaceY + hillHeight * 0.28, localZ);
    hill.scale.set(hillRadius, hillHeight, hillRadius * (0.72 + spec.scaleZ * 0.24));
    hill.rotation.y = rand(spec.seed + i * 29) * Math.PI;
    group.add(hill);
  }
  return group;
}

function createDistantArchipelago(): THREE.Group {
  const group = new THREE.Group();
  group.name = "tellus-distant-archipelago";
  for (const spec of distantIslandSpecs) {
    group.add(createDistantIsland(spec));
  }
  return group;
}

function createSkyDome(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(320, 48, 24);
  const material = new THREE.MeshBasicMaterial({
    color: 0xa9c8f2,
    side: THREE.BackSide,
  });
  return new THREE.Mesh(geometry, material);
}

function createMoonHorizonOccluderTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);

  const verticalFade = context.createLinearGradient(0, 0, 0, canvas.height);
  verticalFade.addColorStop(0, "rgba(255, 255, 255, 0)");
  verticalFade.addColorStop(0.2, "rgba(255, 255, 255, 0.28)");
  verticalFade.addColorStop(0.44, "rgba(255, 255, 255, 0.82)");
  verticalFade.addColorStop(1, "rgba(255, 255, 255, 1)");
  context.fillStyle = verticalFade;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const edgeFade = context.createLinearGradient(0, 0, canvas.width, 0);
  edgeFade.addColorStop(0, "rgba(0, 0, 0, 0)");
  edgeFade.addColorStop(0.2, "rgba(0, 0, 0, 1)");
  edgeFade.addColorStop(0.8, "rgba(0, 0, 0, 1)");
  edgeFade.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = edgeFade;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMoonCloudVeil(): {
  group: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
} {
  const group = new THREE.Group();
  group.name = "tellus-moon-cloud-veil";
  group.renderOrder = -70;
  group.visible = false;
  const materials: THREE.MeshBasicMaterial[] = [];
  const material = new THREE.MeshBasicMaterial({
    map: createMoonHorizonOccluderTexture(),
    color: 0x3a2376,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const cloud = new THREE.Mesh(
    new THREE.PlaneGeometry(MOON_SIZE * 5.2, MOON_SIZE * 1.45),
    material,
  );
  cloud.renderOrder = -70;
  cloud.position.y = -MOON_SIZE * 0.26;
  cloud.position.z = 0.08;
  materials.push(material);
  group.add(cloud);
  return { group, materials };
}

function createBackdropWaterMaterial(): MeshBasicNodeMaterial {
  const t = time.mul(0.62);
  const waterUV = positionWorld.xzy;
  const broadFlow = mx_worley_noise_float(waterUV.mul(0.36).add(t.mul(0.52)));
  const waveCells = mx_worley_noise_float(
    waterUV.mul(1.35).add(broadFlow.mul(0.38)).add(t),
  );
  const surfaceIntensity = waveCells.mul(broadFlow).mul(1.18);
  const waterColor = surfaceIntensity.mix(color(0x0476b7), color(0x7bd7f5));
  const illuminatedColor = waterColor.add(
    color(0xb7f6ff).mul(surfaceIntensity.mul(0.12)),
  );

  const depth = linearDepth();
  const depthWater = viewportLinearDepth.sub(depth);
  const depthEffect = depthWater.remapClamp(-0.002, 0.045);
  const refractionUV = screenUV.add(
    vec2(
      broadFlow.sub(0.5).mul(0.0035),
      surfaceIntensity.sub(0.5).mul(0.055),
    ),
  );
  const depthTestForRefraction = linearDepth(
    viewportDepthTexture(refractionUV),
  ).sub(depth);
  const depthRefraction = depthTestForRefraction.remapClamp(0, 0.1);
  const finalUV = depthTestForRefraction.lessThan(0).select(screenUV, refractionUV);
  const viewportTexture = viewportSharedTexture(finalUV);

  const material = new MeshBasicNodeMaterial();
  material.colorNode = illuminatedColor;
  material.backdropNode = depthEffect.mix(
    viewportSharedTexture(),
    viewportTexture.mul(depthRefraction.mix(1, illuminatedColor)),
  );
  material.backdropAlphaNode = depthRefraction.oneMinus().mul(0.86);
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  return material;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
    return;
  }
  material.dispose();
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    disposeMaterial(child.material);
  });
}

function fitModelToHeight(model: THREE.Object3D, targetHeight: number): THREE.Object3D {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = size.y > 0 ? targetHeight / size.y : 1;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  model.traverse((child) => {
    child.frustumCulled = false;
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return model;
}

function placeObjectAboveGround(
  object: THREE.Object3D,
  position: Vec3,
  clearance = 0.04,
): void {
  object.position.set(position.x, position.y, position.z);
  const bounds = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(bounds.min.y)) return;
  object.position.y += position.y - bounds.min.y + clearance;
}

async function loadGltfObject(url: string): Promise<THREE.Object3D> {
  const cached =
    gltfObjectCache.get(url) ??
    new GLTFLoader().loadAsync(url).then((gltf) => gltf.scene);
  gltfObjectCache.set(url, cached);
  return (await cached).clone(true);
}

async function loadGeneratedGltfObject(
  url: string,
): Promise<{ model: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return { model: gltf.scene, animations: gltf.animations };
}

function prepareSkyboxModel(model: THREE.Object3D): THREE.Object3D {
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const largestAxis = Math.max(size.x, size.y, size.z);
  const scale = largestAxis > 0 ? 520 / largestAxis : 1;

  model.name = "tellus-external-skybox";
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  model.scale.setScalar(scale);
  model.renderOrder = -100;
  model.userData.skyboxBoundsCenter = center;
  model.userData.skyboxBoundsScale = scale;

  model.traverse((child) => {
    child.frustumCulled = false;
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const skyMaterials = materials.map((material) => {
      const mappedMaterial = material as MaterialWithTextureMaps;
      const map = mappedMaterial.map ?? mappedMaterial.emissiveMap ?? null;
      const skyMaterial = new THREE.MeshBasicMaterial({
        map,
        color: map ? 0xffffff : 0xaac8f2,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
      });
      material.side = THREE.DoubleSide;
      material.depthWrite = false;
      return skyMaterial;
    });
    child.material = Array.isArray(child.material) ? skyMaterials : skyMaterials[0];
  });

  return model;
}

function collectSkyboxTintMaterials(
  model: THREE.Object3D,
): THREE.MeshBasicMaterial[] {
  const materials: THREE.MeshBasicMaterial[] = [];
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const meshMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of meshMaterials) {
      if (material instanceof THREE.MeshBasicMaterial) {
        materials.push(material);
      }
    }
  });
  return materials;
}

function prepareMoonModel(model: THREE.Object3D): {
  model: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
} {
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const largestAxis = Math.max(size.x, size.y, size.z);
  const scale = largestAxis > 0 ? MOON_SIZE / largestAxis : 1;
  const moonMaterials: THREE.MeshStandardMaterial[] = [];

  model.name = "tellus-moon";
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  model.renderOrder = -80;

  model.traverse((child) => {
    child.frustumCulled = false;
    if (!(child instanceof THREE.Mesh)) return;
    child.renderOrder = -80;
    child.castShadow = false;
    child.receiveShadow = false;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const preparedMaterials = materials.map((material) => {
      const mappedMaterial = material as MaterialWithTextureMaps;
      const moonMaterial = new THREE.MeshStandardMaterial({
        map: mappedMaterial.map ?? null,
        emissiveMap: mappedMaterial.map ?? null,
        color: 0xf4f0e6,
        emissive: 0xffffff,
        emissiveIntensity: 1.8,
        roughness: 0.72,
        metalness: 0,
        transparent: false,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
      });
      moonMaterials.push(moonMaterial);
      return moonMaterial;
    });
    child.material = Array.isArray(child.material)
      ? preparedMaterials
      : preparedMaterials[0];
  });

  return { model, materials: moonMaterials };
}

async function loadSkyboxModel(): Promise<
  { model: THREE.Object3D; url: string } | null
> {
  const urls = [
    runtimeConfig.skyboxUrl,
    ...SKYBOX_FALLBACK_URLS,
  ].filter(
    (url, index, all): url is string =>
      typeof url === "string" &&
      url.trim().length > 0 &&
      all.indexOf(url) === index,
  );

  for (const url of urls) {
    try {
      return { model: prepareSkyboxModel(await loadGltfObject(url)), url };
    } catch {
      continue;
    }
  }

  return null;
}

async function loadAgentAvatar(agent: TellusAgent): Promise<THREE.Object3D | null> {
  if (!agent.avatarUrl) return null;
  const avatar = await loadGltfObject(agent.avatarUrl);
  avatar.name = `avatar-${agent.id}`;
  return fitModelToHeight(avatar, 2.45);
}

function assetTargetHeight(thing: GeneratedThing): number {
  const lower = thing.prompt.toLowerCase();
  const variation = clamp(thing.scale, 0.25, 12);
  const mode = vehicleMode(thing);
  if (mode === "air") return clamp(4.8 * variation, 1.6, 54);
  if (mode === "water") return clamp(1.45 * variation, 0.45, 18);
  if (mode === "ground") return clamp(2.05 * variation, 0.65, 24);
  if (thing.kind === "tree") return clamp(4.2 * variation, 0.8, 52);
  if (
    lower.includes("hut") ||
    lower.includes("house") ||
    lower.includes("cottage") ||
    lower.includes("cabin") ||
    lower.includes("workshop") ||
    lower.includes("building")
  ) {
    return clamp(3.6 * variation, 0.9, 48);
  }
  if (lower.includes("tower")) return clamp(5.2 * variation, 1.2, 64);
  if (
    lower.includes("bridge") ||
    lower.includes("dock") ||
    lower.includes("pier") ||
    lower.includes("path") ||
    lower.includes("road") ||
    thing.kind === "path"
  ) {
    return clamp(0.42 * variation, 0.12, 8);
  }
  if (thing.kind === "animal") return clamp(1.55 * variation, 0.45, 24);
  if (thing.kind === "flower") return clamp(0.58 * variation, 0.16, 9);
  if (thing.kind === "stone") return clamp(1.0 * variation, 0.25, 18);
  if (thing.kind === "shrine") return clamp(2.2 * variation, 0.55, 32);
  return clamp(1.35 * variation, 0.35, 24);
}

async function loadGeneratedModel(url: string, thing: GeneratedThing): Promise<THREE.Object3D> {
  const { model, animations } = await loadGeneratedGltfObject(url);
  model.name = `pixel3d-${thing.id}`;
  const fitted = fitModelToHeight(model, assetTargetHeight(thing));
  fitted.userData = { ...fitted.userData, tellusId: thing.id, kind: thing.kind };
  if (animations.length > 0) {
    fitted.userData.animations = animations;
  }
  applyThingRotation(fitted, thing);
  if (isFreeMovingVehicle(thing)) {
    fitted.position.set(thing.position.x, thing.position.y, thing.position.z);
  } else {
    placeObjectAboveGround(fitted, thing.position, 0.08);
  }
  return fitted;
}

function createPondWater(): THREE.Group {
  const group = new THREE.Group();
  group.name = "tellus-pond-water";
  group.userData = { waterSurface: true };

  const waterLevel = pondWaterLevel();
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND_RADIUS, 96),
    new THREE.MeshBasicMaterial({
      color: 0x6fb7d7,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  water.name = "tellus-pond-surface";
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND_CENTER.x, waterLevel, POND_CENTER.z);
  water.renderOrder = 2;

  const rippleMaterial = new THREE.MeshBasicMaterial({
    color: 0xd3f2ff,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const rippleGeometry = new THREE.RingGeometry(0.88, 0.93, 96);
  const ripples = new THREE.Group();
  ripples.name = "tellus-pond-ripples";
  ripples.position.set(POND_CENTER.x, waterLevel + 0.035, POND_CENTER.z);
  ripples.rotation.x = -Math.PI / 2;

  for (let i = 0; i < 4; i++) {
    const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial.clone());
    const scale = POND_RADIUS * (0.28 + i * 0.18);
    ripple.scale.setScalar(scale);
    ripple.userData = { rippleIndex: i };
    ripples.add(ripple);
  }

  const shore = new THREE.Mesh(
    new THREE.RingGeometry(POND_RADIUS * 0.96, POND_RADIUS * 1.08, 128),
    new THREE.MeshStandardMaterial({
      color: 0x7b6b48,
      roughness: 0.95,
      metalness: 0,
    }),
  );
  shore.name = "tellus-pond-shore";
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(POND_CENTER.x, waterLevel - 0.035, POND_CENTER.z);

  group.add(shore, water, ripples);
  return group;
}

function createAgentMesh(agent: TellusAgent): THREE.Group {
  const group = new THREE.Group();
  group.name = `agent-${agent.id}`;
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: agent.color,
    roughness: 0.72,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x182018,
    roughness: 0.8,
  });
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 1.25, 6, 12),
    bodyMaterial,
  );
  body.position.y = 1.15;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 16, 12),
    bodyMaterial,
  );
  head.position.y = 2.25;
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.035, 8, 32),
    darkMaterial,
  );
  halo.position.y = 2.8;
  halo.rotation.x = Math.PI / 2;
  group.add(body, head, halo);
  return group;
}

function createVisitorMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0d39a,
    roughness: 0.68,
  });
  const robeMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f5947,
    roughness: 0.8,
  });
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.2, 6, 12),
    robeMaterial,
  );
  body.position.y = 1.1;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.43, 16, 12),
    bodyMaterial,
  );
  head.position.y = 2.15;
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.5, 16),
    bodyMaterial,
  );
  marker.position.set(0, 2.72, 0);
  group.add(body, head, marker);
  return group;
}

function createRemoteVisitorMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x8fb8ff,
    roughness: 0.7,
  });
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5f0b8,
    emissive: 0x334466,
    emissiveIntensity: 0.35,
    roughness: 0.55,
  });
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.46, 1.08, 6, 12),
    bodyMaterial,
  );
  body.position.y = 1.02;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 16, 12),
    bodyMaterial,
  );
  head.position.y = 1.98;
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.035, 8, 28),
    markerMaterial,
  );
  marker.position.y = 2.58;
  marker.rotation.x = Math.PI / 2;
  group.add(body, head, marker);
  return group;
}

function inferGeneratedKind(
  prompt: string,
  agentId: AgentId | "visitor",
): GeneratedKind {
  const lower = prompt.toLowerCase();
  if (
    lower.includes("creature") ||
    lower.includes("companion") ||
    lower.includes("beast") ||
    lower.includes("critter") ||
    lower.includes("animal") ||
    lower.includes("fox") ||
    lower.includes("bird") ||
    lower.includes("eagle") ||
    lower.includes("horse") ||
    lower.includes("dolphin") ||
    lower.includes("orca") ||
    lower.includes("whale") ||
    lower.includes("fish") ||
    lower.includes("reptile")
  )
    return "animal";
  if (
    lower.includes("hut") ||
    lower.includes("house") ||
    lower.includes("workshop") ||
    lower.includes("building") ||
    lower.includes("cottage") ||
    lower.includes("cabin") ||
    lower.includes("tower") ||
    lower.includes("lantern") ||
    lower.includes("bridge") ||
    lower.includes("dock") ||
    lower.includes("boat") ||
    lower.includes("tool") ||
    lower.includes("vehicle") ||
    lower.includes("statue") ||
    lower.includes("object") ||
    lower.includes("prop")
  )
    return "object";
  if (
    lower.includes("tree") ||
    lower.includes("apple") ||
    lower.includes("forest") ||
    lower.includes("sapling")
  )
    return "tree";
  if (
    lower.includes("balloon") ||
    lower.includes("airship") ||
    lower.includes("zeppelin")
  )
    return "balloon";
  if (lower.includes("flower") || lower.includes("moss")) return "flower";
  if (
    lower.includes("stone") ||
    lower.includes("rock") ||
    lower.includes("cairn")
  )
    return "stone";
  if (lower.includes("path") || lower.includes("trail")) return "path";
  if (lower.includes("shrine") || lower.includes("altar")) return "shrine";
  if (lower.includes("seed")) return "seed";
  if (agentId === "sol") return rand(Date.now()) > 0.55 ? "stone" : "shrine";
  if (agentId === "mira") return rand(Date.now()) > 0.5 ? "animal" : "flower";
  return "object";
}

function promptAccent(prompt: string): number {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const color = new THREE.Color().setHSL(hue / 360, 0.55, 0.58);
  return color.getHex();
}

function kindColor(kind: GeneratedKind, prompt: string): number {
  if (kind === "tree")
    return prompt.toLowerCase().includes("apple") ? 0x68a845 : 0x4f8f3a;
  if (kind === "flower") return 0xe7a0cf;
  if (kind === "stone") return 0x9b9b90;
  if (kind === "animal") return 0xb9824b;
  if (kind === "path") return 0x9a7447;
  if (kind === "shrine") return 0x7d83b5;
  if (kind === "balloon") return 0xf0a65f;
  if (kind === "object") return promptAccent(prompt);
  return 0xd3c17a;
}

function createGeneratedMesh(thing: GeneratedThing): THREE.Object3D {
  const material = new THREE.MeshStandardMaterial({
    color: thing.color,
    roughness: 0.85,
    metalness: 0,
  });
  const group = new THREE.Group();
  group.name = thing.id;
  group.userData = { tellusId: thing.id, kind: thing.kind };

  if (thing.kind === "tree") {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x6d4a2d }),
    );
    trunk.position.y = 0.8 * thing.scale;
    trunk.scale.multiplyScalar(thing.scale);
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 14, 10),
      material,
    );
    crown.position.y = 1.95 * thing.scale;
    crown.scale.setScalar(thing.scale);
    const fruit = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xb9352d }),
    );
    fruit.position.set(
      0.35 * thing.scale,
      2.1 * thing.scale,
      0.32 * thing.scale,
    );
    group.add(trunk, crown, fruit);
  } else if (thing.kind === "flower") {
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.035, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: 0x407a35 }),
    );
    stem.position.y = 0.28;
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 * thing.scale, 10, 8),
      material,
    );
    bloom.position.y = 0.62;
    group.add(stem, bloom);
  } else if (thing.kind === "animal") {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 8),
      material,
    );
    body.scale.set(1.5, 0.75, 0.8);
    body.position.y = 0.5;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8),
      material,
    );
    head.position.set(0.62, 0.58, 0);
    group.add(body, head);
  } else if (thing.kind === "path") {
    const path = new THREE.Mesh(
      new THREE.CylinderGeometry(
        1.2 * thing.scale,
        1.2 * thing.scale,
        0.05,
        18,
      ),
      material,
    );
    path.scale.z = 0.45;
    path.position.y = 0.03;
    group.add(path);
  } else if (thing.kind === "shrine") {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.9, 0.35, 6),
      material,
    );
    base.position.y = 0.18;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 6), material);
    top.position.y = 0.9;
    group.add(base, top);
  } else if (thing.kind === "balloon") {
    const envelope = new THREE.Mesh(
      new THREE.SphereGeometry(0.72 * thing.scale, 24, 16),
      material,
    );
    envelope.scale.set(0.9, 1.18, 0.9);
    envelope.position.y = 2.05 * thing.scale;

    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.52 * thing.scale, 0.035 * thing.scale, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xffe2a8, roughness: 0.7 }),
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = 2.02 * thing.scale;

    const basket = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.48 * thing.scale,
        0.34 * thing.scale,
        0.42 * thing.scale,
      ),
      new THREE.MeshStandardMaterial({ color: 0x8b5c35, roughness: 0.9 }),
    );
    basket.position.y = 0.72 * thing.scale;

    const ropeMaterial = new THREE.MeshStandardMaterial({
      color: 0x4c3b2a,
      roughness: 0.8,
    });
    const ropeOffsets = [
      [-0.26, -0.2],
      [0.26, -0.2],
      [-0.26, 0.2],
      [0.26, 0.2],
    ] as const;
    for (const [x, z] of ropeOffsets) {
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.012 * thing.scale,
          0.012 * thing.scale,
          1.08 * thing.scale,
          6,
        ),
        ropeMaterial,
      );
      rope.position.set(x * thing.scale, 1.2 * thing.scale, z * thing.scale);
      group.add(rope);
    }

    group.add(envelope, band, basket);
  } else if (thing.kind === "object") {
    const hash = Array.from(thing.prompt).reduce(
      (sum, char) => sum + char.charCodeAt(0),
      0,
    );
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: promptAccent(`${thing.prompt}:accent`),
      roughness: 0.72,
      metalness: 0.03,
    });
    const base =
      hash % 3 === 0
        ? new THREE.Mesh(
            new THREE.BoxGeometry(
              0.78 * thing.scale,
              0.5 * thing.scale,
              0.78 * thing.scale,
            ),
            material,
          )
        : hash % 3 === 1
          ? new THREE.Mesh(
              new THREE.IcosahedronGeometry(0.48 * thing.scale, 1),
              material,
            )
          : new THREE.Mesh(
              new THREE.CylinderGeometry(
                0.46 * thing.scale,
                0.58 * thing.scale,
                0.62 * thing.scale,
                7,
              ),
              material,
            );
    base.position.y = 0.36 * thing.scale;

    const crown =
      hash % 2 === 0
        ? new THREE.Mesh(
            new THREE.ConeGeometry(0.4 * thing.scale, 0.8 * thing.scale, 7),
            accentMaterial,
          )
        : new THREE.Mesh(
            new THREE.SphereGeometry(0.32 * thing.scale, 12, 8),
            accentMaterial,
          );
    crown.position.y = 0.98 * thing.scale;

    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.48 * thing.scale, 0.025 * thing.scale, 8, 28),
      new THREE.MeshStandardMaterial({
        color: 0xf7ead1,
        roughness: 0.55,
        metalness: 0.02,
      }),
    );
    marker.rotation.x = Math.PI / 2;
    marker.position.y = 0.18 * thing.scale;

    group.add(base, crown, marker);
  } else {
    const seed = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35 * thing.scale, 1),
      material,
    );
    seed.position.y = 0.32;
    group.add(seed);
  }

  if (
    isFreeMovingVehicle(thing) ||
    isIntentionallyElevated(thing) ||
    Math.hypot(thing.position.x, thing.position.z) > WORLD_RADIUS
  ) {
    group.position.set(thing.position.x, thing.position.y, thing.position.z);
  } else {
    placeObjectAboveGround(group, thing.position, 0.025);
  }
  const targetHeight = assetTargetHeight(thing);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  if (size.y > 0) {
    const scale = clamp(targetHeight / size.y, 0.45, 3.6);
    group.scale.multiplyScalar(scale);
    if (
      isFreeMovingVehicle(thing) ||
      isIntentionallyElevated(thing) ||
      Math.hypot(thing.position.x, thing.position.z) > WORLD_RADIUS
    ) {
      group.position.set(thing.position.x, thing.position.y, thing.position.z);
    } else {
      placeObjectAboveGround(group, thing.position, 0.025);
    }
  }
  applyThingRotation(group, thing);
  return group;
}

function createGenerationSwirl(thing: GeneratedThing): THREE.Object3D {
  const group = new THREE.Group();
  group.name = thing.id;
  group.userData = { tellusId: thing.id, kind: thing.kind, generatingSwirl: true };

  const primary = new THREE.Color(thing.color);
  const light = primary.clone().lerp(new THREE.Color(0xffffff), 0.58);
  const material = new THREE.MeshBasicMaterial({
    color: light,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const ringGeometry = new THREE.TorusGeometry(0.52, 0.018, 8, 56);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(ringGeometry, material.clone());
    ring.userData = { swirlRing: i };
    ring.rotation.x = Math.PI / 2 + i * 0.62;
    ring.rotation.y = i * 0.48;
    ring.position.y = 0.55 + i * 0.22;
    ring.scale.setScalar(0.72 + i * 0.18);
    group.add(ring);
  }

  const sparkMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparkGeometry = new THREE.SphereGeometry(0.045, 8, 6);
  for (let i = 0; i < 7; i++) {
    const spark = new THREE.Mesh(sparkGeometry, sparkMaterial.clone());
    const angle = (i / 7) * Math.PI * 2;
    spark.userData = { swirlSpark: i, baseAngle: angle };
    spark.position.set(Math.cos(angle) * 0.56, 0.72 + i * 0.09, Math.sin(angle) * 0.56);
    group.add(spark);
  }

  group.position.set(thing.position.x, thing.position.y + 0.08, thing.position.z);
  group.userData.baseY = group.position.y;
  return group;
}

function shouldShowGenerationSwirl(thing: GeneratedThing): boolean {
  if (thing.generationStatus === "queued" || thing.generationStatus === "generating") {
    return true;
  }
  if (thing.generationStatus === "failed" && !thing.modelUrl) {
    return true;
  }
  return Boolean(thing.modelUrl && thing.generationStatus === "ready");
}

function applyThingRotation(object: THREE.Object3D, thing: GeneratedThing): void {
  object.rotation.set(thing.rotationX ?? 0, thing.rotationY, thing.rotationZ ?? 0);
}

const johnnyFallbackIdeas = [
  "a sunlit footbridge made of pale cedar crossing a small stream",
  "a tiny workshop hut with mossy shingles and brass tools outside",
  "a gentle stone creature curled beside a patch of blue flowers",
  "a hot air balloon moored beside a garden path",
  "a clear pond with lilies, stepping stones, and a little wooden dock",
  "a spiral lantern tower that glows softly near the mountain",
  "a weathered sailboat with a folded cream canvas sail",
  "a copper rain collector shaped like a broad leaf",
  "a carved stone waygate with glowing moss in its grooves",
  "a tiny apiary box painted yellow beside wildflowers",
  "a driftwood fishing pier with rope-wrapped posts",
  "a round observatory hut with a brass telescope on top",
  "a blue ceramic fountain shaped like a moon shell",
  "a small windmill pump with white wooden blades",
  "a low stone bridge with fern-filled cracks",
  "a mossy outdoor workbench covered with clay pots",
  "a floating lantern buoy tethered to a wooden stake",
  "a red berry tree with a hollow doorway in its trunk",
  "a tiny clay kiln with stacked firewood beside it",
  "a curved boardwalk segment made from dark wet planks",
  "a one-seat glider with leaf-shaped green wings",
  "a crystal marker obelisk set into a grassy mound",
  "a striped canvas market awning on two cedar poles",
  "a little stone well with a wooden crank and bucket",
];

function normalizeAssetPrompt(prompt: string): string {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(
      /\b(a|an|the|with|and|of|made|from|for|near|beside|next|to|little|tiny|small)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function promptAlreadyExists(prompt: string, generated: GeneratedThing[]): boolean {
  const normalized = normalizeAssetPrompt(prompt);
  if (!normalized) return false;
  return generated.some((thing) => normalizeAssetPrompt(thing.prompt) === normalized);
}

function terrainEditModeFromValue(value: unknown): TerrainEditMode | undefined {
  if (value === "raise" || value === "lower" || value === "flatten") {
    return value;
  }
  if (typeof value === "string" && isTerrainPaintMode(value as TerrainEditMode)) {
    return value as TerrainPaintKind;
  }
  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function agentDecisionAction(value: unknown): AgentDecision["action"] {
  return value === "moveSelf" ||
    value === "sculptTerrain" ||
    value === "moveAsset" ||
    value === "rotateAsset" ||
    value === "scaleAsset" ||
    value === "moveAssetToWater"
    ? value
    : "generate";
}

function chooseAgentPrompt(
  agent: TellusAgent,
  generated: GeneratedThing[],
): string {
  if (agent.id === "johnny") {
    const start = generated.length % johnnyFallbackIdeas.length;
    for (let i = 0; i < johnnyFallbackIdeas.length; i++) {
      const idea = johnnyFallbackIdeas[(start + i) % johnnyFallbackIdeas.length];
      if (!promptAlreadyExists(idea, generated)) return idea;
    }
    return `a unique carved island relic number ${generated.length + 1} with a distinct silhouette`;
  }
  if (agent.id === "mira") {
    return generated.length % 2 === 0
      ? "a curious amber fox nosing around the meadow"
      : "a patch of blue flowers where animals can rest";
  }
  return generated.length % 2 === 0
    ? "a hand-placed stone cairn that points toward the summit"
    : "a narrow dirt path spiraling gently toward the mountain";
}

function ensureNovelAgentDecision(
  decision: AgentDecision,
  agent: TellusAgent,
  generated: GeneratedThing[],
): AgentDecision {
  if (decision.action && decision.action !== "generate") {
    return decision;
  }
  const prompt = decision.prompt.trim();
  if (!promptAlreadyExists(prompt, generated)) {
    return { ...decision, action: decision.action ?? "generate", prompt };
  }
  const replacementPrompt = chooseAgentPrompt(agent, generated);
  return {
    ...decision,
    action: "generate",
    prompt: replacementPrompt,
    intent:
      decision.intent ??
      "study what should live near here next and how this new asset changes the world",
    speech:
      decision.speech ??
      "I will add something different so this place keeps unfolding.",
  };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    } catch {
      return null;
    }
  }
}

function parseAgentDecision(content: string, fallbackPrompt: string): AgentDecision {
  const parsed = extractJsonObject(content);
  if (isRecord(parsed)) {
    const action = agentDecisionAction(parsed.action);
    const prompt = parsed.prompt;
    const intent = parsed.intent;
    const speech = parsed.speech;
    return {
      action,
      prompt: typeof prompt === "string" && prompt.trim() ? prompt.trim() : fallbackPrompt,
      intent: typeof intent === "string" && intent.trim() ? intent.trim() : undefined,
      speech: typeof speech === "string" && speech.trim() ? speech.trim() : undefined,
      terrainMode: terrainEditModeFromValue(parsed.terrainMode),
      targetId: typeof parsed.targetId === "string" && parsed.targetId.trim()
        ? parsed.targetId.trim()
        : undefined,
      dx: finiteNumber(parsed.dx),
      dz: finiteNumber(parsed.dz),
      rotation: finiteNumber(parsed.rotation),
      scaleMultiplier: finiteNumber(parsed.scaleMultiplier),
    };
  }
  return { action: "generate", prompt: content.trim() || fallbackPrompt };
}

function chooseAgentLocation(
  agent: TellusAgent,
  prompt: string,
): GenerateRequest["location"] {
  const lower = prompt.toLowerCase();
  if (
    lower.includes("mountain") ||
    lower.includes("summit") ||
    lower.includes("tower") ||
    lower.includes("shrine") ||
    lower.includes("cairn")
  ) {
    return "near-mountain";
  }
  if (
    lower.includes("pond") ||
    lower.includes("water") ||
    lower.includes("stream") ||
    lower.includes("river") ||
    lower.includes("dock") ||
    lower.includes("boat") ||
    lower.includes("lily") ||
    lower.includes("fish")
  ) {
    return "near-pond";
  }
  if (agent.id === "sol") return "near-mountain";
  if (agent.id === "mira") return "near-pond";
  return "near-agent";
}

function compassDirection(from: Vec3, to: Vec3): string {
  const angle = Math.atan2(to.z - from.z, to.x - from.x);
  const directions = ["east", "southeast", "south", "southwest", "west", "northwest", "north", "northeast"];
  const index = Math.round(((angle + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % directions.length;
  return directions[index];
}

function describeAgentPerception(
  agent: TellusAgent,
  generated: GeneratedThing[],
  logs: TellusLog[],
  visualFeedback: string,
): string {
  const groundHeight = terrainHeight(agent.position.x, agent.position.z);
  const localTerrain = terrainKind(agent.position.x, agent.position.z, groundHeight);
  const distanceToPond = Math.hypot(
    agent.position.x - POND_CENTER.x,
    agent.position.z - POND_CENTER.z,
  );
  const distanceToSummit = Math.hypot(agent.position.x, agent.position.z);
  const distanceToShore = Math.max(0, WORLD_RADIUS - Math.hypot(agent.position.x, agent.position.z));
  const nearby = generated
    .map((thing) => ({
      thing,
      distance: distance2D(agent.position, thing.position),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8)
    .map(({ thing, distance }) => {
      const status = thing.generationStatus && thing.generationStatus !== "ready"
        ? `, ${thing.generationStatus}`
        : "";
      return `- id ${thing.id}: ${Math.round(distance)}m ${compassDirection(agent.position, thing.position)}: ${thing.kind} "${thing.prompt}"${status}, ${thing.scale.toFixed(1)}x`;
    })
    .join("\n");
  const lastOwnAsset = [...generated]
    .reverse()
    .find((thing) => thing.creatorId === agent.id);
  const pending = generated
    .filter(
      (thing) =>
        thing.generationStatus === "queued" ||
        thing.generationStatus === "generating",
    )
    .map((thing) => `- ${thing.kind} "${thing.prompt}" by ${thing.creatorId}: ${thing.generationStatus}`)
    .join("\n");
  const recentChanges = logs
    .filter(
      (log) =>
        log.tool === "generate" ||
        log.text.includes("terrain") ||
        log.text.includes("Loaded") ||
        log.text.includes("deleted"),
    )
    .slice(-6)
    .map((log) => `- ${log.agentName}: ${log.text}`)
    .join("\n");

  return [
    `You are at x ${agent.position.x.toFixed(1)}, z ${agent.position.z.toFixed(1)}, on ${localTerrain} terrain at height ${groundHeight.toFixed(1)}.`,
    `Landmarks: pond ${Math.round(distanceToPond)}m away, mountain summit ${Math.round(distanceToSummit)}m away, shore ${Math.round(distanceToShore)}m away.`,
    `Nearby visible assets:\n${nearby || "none nearby"}`,
    `Your last generated asset: ${lastOwnAsset ? `${lastOwnAsset.kind} "${lastOwnAsset.prompt}" (${lastOwnAsset.generationStatus ?? "local"})` : "none yet"}`,
    `Pending asset generation:\n${pending || "none"}`,
    `Recent visible world changes:\n${recentChanges || "none"}`,
    `Visual world feedback from your stable body camera:\n${visualFeedback || "not captured yet"}`,
  ].join("\n\n");
}

function chatContent(completion: ChatCompletionResponse): string {
  return completion.choices?.[0]?.message?.content?.trim() ?? "";
}

async function askAgentForDecision(
  agent: TellusAgent,
  generated: GeneratedThing[],
  logs: TellusLog[],
  visualFeedback: string,
): Promise<AgentDecision> {
  const fallbackPrompt = chooseAgentPrompt(agent, generated);
  const recentObjects = generated
    .slice(-12)
    .map((thing) => `${thing.kind}: ${thing.prompt}`)
    .join("\n");
  const forbiddenPrompts = generated
    .slice(-24)
    .map((thing) => `- ${thing.prompt}`)
    .join("\n");
  const recentLogs = logs
    .slice(-8)
    .map((log) => `${log.agentName}: ${log.text}`)
    .join("\n");
  const perception = describeAgentPerception(agent, generated, logs, visualFeedback);
  const controllableObjects = generated
    .slice(-16)
    .map(
      (thing) =>
        `- id ${thing.id}: ${thing.kind} "${thing.prompt}" at x ${thing.position.x.toFixed(1)}, z ${thing.position.z.toFixed(1)}, scale ${thing.scale.toFixed(2)}x`,
    )
    .join("\n");

  const response = await fetch(tellusApiUrl("/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: runtimeConfig.agentModel,
      temperature: 0.85,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "You are an enabled autonomous AI inside Tellus, a tiny living WebGPU world. You can perceive a textual view and a visual screenshot from your own stable body camera, not the visitor camera. Choose exactly one world action. Return only JSON. Use action \"moveSelf\" with dx and dz between -8 and 8 to walk your own body to a better viewpoint. Use action \"generate\" with keys prompt, intent, speech to add one single asset. Or use action \"sculptTerrain\" with terrainMode one of raise, lower, flatten, meadow, beach, dirt, rock, snow. Or use action \"moveAsset\" with targetId plus dx and dz between -4 and 4. Or use action \"rotateAsset\" with targetId plus rotation between -1 and 1 radians. Or use action \"scaleAsset\" with targetId plus scaleMultiplier between 0.65 and 1.5. Or use action \"moveAssetToWater\" with targetId. Do not repeat existing generated objects. The speech should be one short in-character sentence said aloud before you act.",
        },
        {
          role: "user",
          content: [
            `Agent: ${agent.name}, ${agent.epithet}`,
            `Goal: ${agent.goal}`,
            `Current perception:\n${perception}`,
            `Current generated count: ${generated.length}`,
            `Recent objects:\n${recentObjects || "none yet"}`,
            `Controllable object ids:\n${controllableObjects || "none yet"}`,
            `Do not generate these again, even as near synonyms:\n${forbiddenPrompts || "none yet"}`,
            `Recent logs:\n${recentLogs || "none yet"}`,
            `Fallback idea: ${fallbackPrompt}`,
          ].join("\n\n"),
        },
      ],
    }),
  });
  const completion = await readJsonResponse<ChatCompletionResponse>(response);
  const content = chatContent(completion);
  if (!content) return { prompt: fallbackPrompt };
  return ensureNovelAgentDecision(
    parseAgentDecision(content, fallbackPrompt),
    agent,
    generated,
  );
}

async function askAgentForReply(
  agent: TellusAgent,
  message: string,
  generated: GeneratedThing[],
  logs: TellusLog[],
  visualFeedback: string,
): Promise<string> {
  const perception = describeAgentPerception(agent, generated, logs, visualFeedback);
  const recentObjects = generated
    .slice(-10)
    .map((thing) => `${thing.kind}: ${thing.prompt}`)
    .join("\n");
  const recentLogs = logs
    .slice(-10)
    .map((log) => `${log.agentName}: ${log.text}`)
    .join("\n");
  const response = await fetch(tellusApiUrl("/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: runtimeConfig.agentModel,
      temperature: 0.75,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "You are a living agent inside Tellus. Reply in character in one or two short sentences. Do not return JSON. Be concrete about what you see, want, or will do next.",
        },
        {
          role: "user",
          content: [
            `Agent: ${agent.name}, ${agent.epithet}`,
            `Goal: ${agent.goal}`,
            `Current perception:\n${perception}`,
            `Visitor says: ${message}`,
            `Recent objects:\n${recentObjects || "none yet"}`,
            `Recent logs:\n${recentLogs || "none yet"}`,
          ].join("\n\n"),
        },
      ],
    }),
  });
  const completion = await readJsonResponse<ChatCompletionResponse>(response);
  const content = chatContent(completion);
  return content || `${agent.name} listens, then turns back toward the world with a new idea.`;
}

function createTellusWorld(
  container: HTMLElement,
  onSnapshot: (snapshot: TellusSnapshot) => void,
): TellusWorldApi {
  let destroyed = false;
  let paused = false;
  let animationId = 0;
  let lastTime = performance.now();
  let tick = 0;
  let renderer: THREE.WebGLRenderer | WebGPURenderer | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let renderIssueLogged = false;

  const agents = createAgentSeeds().map((agent) => ({
    ...agent,
    position: { ...agent.position },
    target: { ...agent.target },
    nextActionAt: performance.now() + AUTONOMOUS_ASSET_INTERVAL_MS,
    nextReflectionAt: performance.now() + AUTONOMOUS_REFLECTION_OFFSET_MS,
  }));
  const generated: GeneratedThing[] = [];
  const logs: TellusLog[] = [];
  const generatedMeshes = new Map<string, THREE.Object3D>();
  const generatedAnimationMixers = new Map<string, THREE.AnimationMixer>();
  const agentMeshes = new Map<AgentId, THREE.Group>();
  const skyboxTintMaterials = new Set<THREE.MeshBasicMaterial>();
  const pendingAgentDecisions = new Set<AgentId>();
  const pendingGenerationControllers = new Map<string, AbortController>();
  const pendingManifestReconciliations = new Set<string>();
  const keys = new Set<string>();
  let selectedThingId: string | undefined;
  let sailingThingId: string | undefined;
  let externalSkybox: THREE.Object3D | null = null;
  let moonModel: THREE.Object3D | null = null;
  const moonMaterials = new Set<THREE.MeshStandardMaterial>();
  const moonCloudVeil = createMoonCloudVeil();
  let visualFeedback = "";
  let nextWorldFeedbackAt =
    performance.now() + WORLD_FEEDBACK_START_DELAY_MS;
  let worldFeedbackPending = false;
  let worldFeedbackIssueLogged = false;
  let worldFeedbackAvailable = true;
  let directGenerationAvailable = true;
  let worldSocket: WebSocket | null = null;
  let worldSocketReconnectTimer: number | undefined;
  let worldSocketClosedByDestroy = false;
  const visitorId = tellusVisitorId();
  const userId = tellusUserId();
  const remoteVisitorMeshes = new Map<string, THREE.Group>();
  const remoteVisitors = new Map<string, WorldPresence>();
  let lastPresenceSentAt = 0;

  const hasPendingGeneratedAsset = (creatorId?: AgentId | "visitor"): boolean =>
    generated.some(
      (thing) =>
        (!creatorId || thing.creatorId === creatorId) &&
        (thing.generationStatus === "queued" ||
          thing.generationStatus === "generating"),
    );

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa7c3ef);
  scene.fog = new THREE.Fog(0xa7c3ef, 72, 230);

  const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 720);
  const agentVisionCamera = new THREE.PerspectiveCamera(58, 1, 0.1, 260);
  const fallbackSky = createSkyDome();
  if (fallbackSky.material instanceof THREE.MeshBasicMaterial) {
    skyboxTintMaterials.add(fallbackSky.material);
  }
  const useWebGPU = "gpu" in navigator;
  const ocean = createOceanSurface(useWebGPU);
  const archipelago = createDistantArchipelago();
  const terrain = new THREE.Mesh(
    createTerrainGeometry(),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
    }),
  );
  terrain.receiveShadow = true;
  const pondWater = createPondWater();
  scene.add(
    fallbackSky,
    ocean,
    archipelago,
    terrain,
    pondWater,
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

  for (const agent of agents) {
    const mesh = createAgentMesh(agent);
    agentMeshes.set(agent.id, mesh);
    scene.add(mesh);
  }

  const visitor = createVisitorMesh();
  let visitorPosition = normalizedDiscPosition(-20, 20);
  scene.add(visitor);

  let yaw = 0.72;
  let pitch = -0.28;
  let zoom = 33;
  let isDragging = false;
  let pointerX = 0;
  let pointerY = 0;
  let pointerTravel = 0;
  const pointerNdc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  const snapshot = (): TellusSnapshot => ({
    agents: agents.map((agent) => ({
      ...agent,
      position: { ...agent.position },
      target: { ...agent.target },
    })),
    generated: generated.map((thing) => ({
      ...thing,
      position: { ...thing.position },
    })),
    logs: logs.slice(-80),
    paused,
    generationProvider: runtimeConfig.generationProvider,
    playerGenerationProvider: runtimeConfig.playerGenerationProvider,
    agentGenerationProvider: runtimeConfig.agentGenerationProvider,
    instantMeshTarget: runtimeConfig.instantMeshTarget,
    userId,
    visitorPosition: { ...visitorPosition },
    remoteVisitors: Array.from(remoteVisitors.values()).map((presence) => ({
      ...presence,
      position: presence.position ? { ...presence.position } : undefined,
    })),
    selectedThingId,
    sailingThingId,
  });

  const publish = () => onSnapshot(snapshot());

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

  const refreshTerrainGeometry = () => {
    const positions = terrain.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const colors = terrain.geometry.getAttribute("color") as THREE.BufferAttribute;
    for (let zIndex = 0; zIndex <= TERRAIN_SEGMENTS; zIndex++) {
      const vz = (zIndex / TERRAIN_SEGMENTS - 0.5) * WORLD_RADIUS * 2;
      for (let xIndex = 0; xIndex <= TERRAIN_SEGMENTS; xIndex++) {
        const vx = (xIndex / TERRAIN_SEGMENTS - 0.5) * WORLD_RADIUS * 2;
        const radius = Math.hypot(vx, vz);
        const inside = radius <= WORLD_RADIUS;
        const edgeScale = inside ? 1 : WORLD_RADIUS / radius;
        const px = vx * edgeScale;
        const pz = vz * edgeScale;
        const py = inside ? terrainHeight(px, pz) : -4.5;
        const index = terrainGridIndex(xIndex, zIndex);
        positions.setXYZ(index, px, py, pz);
        const color = terrainColors[inside ? terrainKind(px, pz, py) : "rock"].clone();
        const noise = 0.9 + rand(xIndex * 1009 + zIndex * 9176) * 0.18;
        color.multiplyScalar(noise);
        colors.setXYZ(index, color.r, color.g, color.b);
      }
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    terrain.geometry.computeVertexNormals();
  };

  const refreshDistantIslandGeometry = (spec: DistantIslandSpec) => {
    const island = archipelago.getObjectByName(`tellus-distant-island-${spec.seed}`);
    const mesh = island?.getObjectByName(`tellus-distant-terrain-${spec.seed}`);
    if (!(mesh instanceof THREE.Mesh)) return;
    mesh.geometry.dispose();
    mesh.geometry = createDistantIslandTerrainGeometry(spec);
  };

  const applyRemoteTerrainState = (terrainState: TellusTerrainState) => {
    if (!applyTellusTerrainState(terrainState)) return;
    terrainStateDirty = false;
    refreshTerrainGeometry();
    for (const spec of distantIslandSpecs) {
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
      remoteVisitors.set(remote.visitorId, {
        ...remote,
        position: { ...remote.position },
      });
      let mesh = remoteVisitorMeshes.get(remote.visitorId);
      if (!mesh) {
        mesh = createRemoteVisitorMesh();
        remoteVisitorMeshes.set(remote.visitorId, mesh);
        scene.add(mesh);
      }
      const position = groundedPosition(
        remote.position.x,
        remote.position.z,
        remote.position,
      );
      mesh.position.set(position.x, position.y, position.z);
      mesh.userData.lastSeenAt = remote.lastSeenAt;
    }
    for (const [remoteId, mesh] of remoteVisitorMeshes) {
      if (activeRemoteIds.has(remoteId)) continue;
      scene.remove(mesh);
      remoteVisitorMeshes.delete(remoteId);
      remoteVisitors.delete(remoteId);
    }
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
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        (parsed as Partial<WorldPatch>).type === "generated.deleted" &&
        typeof (parsed as { id?: unknown }).id === "string"
      ) {
        applyRemoteGeneratedDelete((parsed as { id: string }).id);
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
      for (let zIndex = 0; zIndex <= TERRAIN_SEGMENTS; zIndex++) {
        const z = (zIndex / TERRAIN_SEGMENTS - 0.5) * WORLD_RADIUS * 2;
        for (let xIndex = 0; xIndex <= TERRAIN_SEGMENTS; xIndex++) {
          const x = (xIndex / TERRAIN_SEGMENTS - 0.5) * WORLD_RADIUS * 2;
          if (Math.hypot(x, z) > WORLD_RADIUS) continue;
          const distance = Math.hypot(x - center.x, z - center.z);
          if (distance > TERRAIN_SCULPT_RADIUS) continue;
          const falloff =
            (1 + Math.cos((distance / TERRAIN_SCULPT_RADIUS) * Math.PI)) * 0.5;
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
      refreshTerrainGeometry();
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

  const sculptTerrain = (mode: TerrainEditMode) => {
    sculptTerrainAt(mode, visitorPosition, "visitor", "Visitor");
  };

  const abortPendingGeneration = () => {
    for (const controller of pendingGenerationControllers.values()) {
      controller.abort();
    }
    pendingGenerationControllers.clear();
  };

  const thingById = (id: string): GeneratedThing | undefined =>
    generated.find((thing) => thing.id === id);

  const stopGeneratedAnimation = (id: string) => {
    const mixer = generatedAnimationMixers.get(id);
    if (!mixer) return;
    mixer.stopAllAction();
    generatedAnimationMixers.delete(id);
  };

  const startGeneratedAnimation = (id: string, model: THREE.Object3D) => {
    stopGeneratedAnimation(id);
    const animations = model.userData.animations;
    if (!Array.isArray(animations) || animations.length === 0) return;
    const mixer = new THREE.AnimationMixer(model);
    for (const clip of animations) {
      if (clip instanceof THREE.AnimationClip) {
        mixer.clipAction(clip).play();
      }
    }
    generatedAnimationMixers.set(id, mixer);
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
      updateSelectionIndicator();
      return;
    }
    placeObjectAboveGround(mesh, thing.position, 0.04);
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
    updatedAt: new Date().toISOString(),
  });

  const normalizeGeneratedThing = (thing: WorldGeneratedThing): WorldGeneratedThing => {
    const modelUrl = thing.generationStatus === "failed"
      ? undefined
      : thing.modelUrl
        ? absoluteTellusApiUrl(thing.modelUrl)
        : undefined;
    return {
      ...thing,
      modelUrl,
      pipelineId: modelUrl ? undefined : thing.pipelineId,
      generationStatus: modelUrl ? "ready" : thing.generationStatus,
    };
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
    void loadGeneratedModel(thing.modelUrl, thing)
      .then((model) => {
        if (destroyed || !thingById(thing.id)) {
          disposeObject(model);
          return;
        }
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
    if (currentMesh && Boolean(currentMesh.userData.generatingSwirl) === wantsSwirl) {
      return;
    }
    if (currentMesh) {
      stopGeneratedAnimation(thing.id);
      scene.remove(currentMesh);
      disposeObject(currentMesh);
    }
    const nextMesh = wantsSwirl ? createGenerationSwirl(thing) : createGeneratedMesh(thing);
    generatedMeshes.set(thing.id, nextMesh);
    scene.add(nextMesh);
    syncTransformControls();
    updateThingMeshPosition(thing);
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
      existing.modelUrl = normalized.modelUrl;
      existing.pipelineId = normalized.pipelineId;
      existing.generationStatus = normalized.generationStatus;
      ensureGeneratedVisual(existing);
      updateThingMeshPosition(existing);
      loadRemoteGeneratedModel(existing);
      reconcileRemoteGeneratedManifest(existing);
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
    generated.splice(index, 1);
    const mesh = generatedMeshes.get(id);
    if (mesh) {
      stopGeneratedAnimation(id);
      scene.remove(mesh);
      disposeObject(mesh);
      generatedMeshes.delete(id);
    }
    if (selectedThingId === id) selectedThingId = undefined;
    syncTransformControls();
    if (sailingThingId === id) sailingThingId = undefined;
    saveGeneratedPlacementSnapshot();
    publish();
  };

  if (tellusWorldBackendAvailable && initialWorldGeneratedThings.length > 0) {
    applyRemoteGeneratedThings(initialWorldGeneratedThings);
    initialWorldGeneratedThings = [];
  }

  connectTellusWorldRealtime();
  if (!tellusWorldBackendAvailable && !recoverGeneratedFromPlacementSnapshot()) {
    recoverGeneratedFromManifest();
  }

  const selectGenerated = (id?: string) => {
    selectedThingId = id && thingById(id) ? id : undefined;
    updateSelectionIndicator();
    syncTransformControls();
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
    const [thing] = generated.splice(index, 1);
    pendingGenerationControllers.get(id)?.abort();
    pendingGenerationControllers.delete(id);
    const mesh = generatedMeshes.get(id);
    if (mesh) {
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
    sailingThingId = id;
    selectedThingId = id;
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
    const agent = agents.find((item) => item.id === request.creatorId);
    const origin = agent?.position ?? visitorPosition;
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

    const actor = agents.find((agent) => agent.id === request.creatorId);
    addLog({
      agentId: request.creatorId,
      agentName: actor?.name ?? "Visitor",
      tool: "generate",
      text: `${actor?.name ?? "Visitor"} generated ${thing.kind}: ${request.prompt}`,
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
          if (destroyed || paused || !thingById(thing.id)) return;
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
          if (destroyed || paused || !thingById(thing.id)) return;
          thing.modelUrl = modelUrl;
          addLog({
            agentId: "world",
            agentName: "Pixel3D",
            tool: "generate",
            text: `Pixel3D returned a model URL for ${thing.kind}; loading it into Tellus.`,
          });
          const model = await loadGeneratedModel(modelUrl, thing);
          if (destroyed || paused || !thingById(thing.id)) {
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
          if (paused || generationController.signal.aborted) {
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
          if (destroyed || paused || !thingById(thing.id)) return;
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
              if (destroyed || paused || !thingById(thing.id)) return;
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
          if (destroyed || paused || !thingById(thing.id)) return;
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
          const model = await loadGeneratedModel(thing.modelUrl, thing);
          if (destroyed || paused || !thingById(thing.id)) {
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
          if (paused || generationController.signal.aborted) {
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
    const modelUrl =
      model.modelUrl ??
      tellusAssetLibraryUrl(`/api/assets/download/${encodeURIComponent(model.id)}`);
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
    selectedThingId = thing.id;
    syncTransformControls();
    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "generate",
      text: `added ${model.source === "generated" ? "generated" : "library"} asset: ${model.name}`,
    });
    publishGeneratedThing(thing);
    publish();
    void loadGeneratedModel(modelUrl, thing)
      .then((modelObject) => {
        if (destroyed) return;
        const oldMesh = generatedMeshes.get(thing.id);
        if (oldMesh) {
          scene.remove(oldMesh);
          disposeObject(oldMesh);
        }
        generatedMeshes.set(thing.id, modelObject);
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
    const actor = agents.find((agent) => agent.id === request.actorId);
    const target = generated.find((thing) => thing.id === request.targetId);
    return addLog({
      agentId: request.actorId,
      agentName: actor?.name ?? "Visitor",
      tool: "interact",
      text: `${actor?.name ?? "Visitor"} interacts with ${target?.kind ?? "the world"}: ${request.intent}`,
    });
  };

  const talkToAgent = (agentId: AgentId, message: string) => {
    const trimmed = message.trim();
    const agent = agents.find((candidate) => candidate.id === agentId);
    if (!trimmed || !agent) return;
    if (paused) {
      addLog({
        agentId: "world",
        agentName: "Tellus",
        tool: "interact",
        text: "Paused: agent chatter is stopped.",
      });
      return;
    }

    addLog({
      agentId: "visitor",
      agentName: "Visitor",
      tool: "interact",
      text: `asks ${agent.name}: ${trimmed}`,
    });

    void askAgentForReply(agent, trimmed, generated, logs, visualFeedback)
      .then((reply) => {
        if (destroyed || paused) return;
        addLog({
          agentId: agent.id,
          agentName: agent.name,
          tool: "interact",
          text: `${agent.name} says: ${reply}`,
        });
        speakTellusText(reply);
      })
      .catch((error) => {
        if (destroyed || paused) return;
        addLog({
          agentId: agent.id,
          agentName: agent.name,
          tool: "interact",
          text: `${agent.name} tries to answer, but the voice link is quiet (${
            error instanceof Error ? error.message : "unknown error"
          })`,
        });
      });
  };

  const submitVisitorPrompt = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (paused) {
      addLog({
        agentId: "world",
        agentName: "Tellus",
        tool: "generate",
        text: "Paused: generation is stopped.",
      });
      return;
    }
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

  const updateAgentGoal = (agentId: AgentId, goal: string) => {
    const agent = agents.find((candidate) => candidate.id === agentId);
    if (!agent) return;
    agent.goal = goal;
    publish();
  };

  const setPaused = (nextPaused: boolean) => {
    if (paused === nextPaused) return;
    paused = nextPaused;
    if (paused) {
      abortPendingGeneration();
      for (const thing of generated) {
        if (
          thing.generationStatus === "queued" ||
          thing.generationStatus === "generating"
        ) {
          cancelDirectGeneration(thing.pipelineId);
          thing.generationStatus = "local";
          thing.pipelineId = undefined;
        }
      }
    }
    if (!paused) {
      const now = performance.now();
      nextWorldFeedbackAt = now + 4_000;
      for (const agent of agents) {
        agent.nextActionAt = now + AUTONOMOUS_ASSET_INTERVAL_MS;
        agent.nextReflectionAt = now + AUTONOMOUS_REFLECTION_OFFSET_MS;
      }
    }
    addLog({
      agentId: "world",
      agentName: "Tellus",
      tool: "interact",
      text: paused
        ? "Paused: agent chatter and generation are stopped."
        : "Resumed: agents may talk and generate again.",
    });
    publish();
  };

  const agentActionTarget = (
    agent: TellusAgent,
    decision: AgentDecision,
  ): GeneratedThing | undefined => {
    if (decision.targetId) {
      const explicit = thingById(decision.targetId);
      if (explicit) return explicit;
    }
    return (
      [...generated].reverse().find((thing) => thing.creatorId === agent.id) ??
      generated[generated.length - 1]
    );
  };

  const runAgentWorldAction = (
    agent: TellusAgent,
    decision: AgentDecision,
  ): boolean => {
    const action = decision.action ?? "generate";
    if (action === "generate") return false;

    if (action === "moveSelf") {
      const dx = clamp(decision.dx ?? 0, -8, 8);
      const dz = clamp(decision.dz ?? 4, -8, 8);
      agent.target = groundedPosition(
        agent.position.x + dx,
        agent.position.z + dz,
        agent.position,
      );
      addLog({
        agentId: agent.id,
        agentName: agent.name,
        tool: "interact",
        text: `${agent.name} walks toward x ${agent.target.x.toFixed(1)}, z ${agent.target.z.toFixed(1)} for a steadier look`,
      });
      return true;
    }

    if (action === "sculptTerrain") {
      const mode = decision.terrainMode ?? "flatten";
      sculptTerrainAt(mode, agent.position, agent.id, agent.name);
      return true;
    }

    const target = agentActionTarget(agent, decision);
    if (!target) return false;
    selectedThingId = target.id;

    if (action === "moveAsset") {
      const dx = clamp(decision.dx ?? 0, -4, 4);
      const dz = clamp(decision.dz ?? -2, -4, 4);
      moveGenerated(target.id, dx, dz);
      addLog({
        agentId: agent.id,
        agentName: agent.name,
        tool: "interact",
        text: `${agent.name} moved ${target.kind} "${target.prompt}" by x ${dx.toFixed(1)}, z ${dz.toFixed(1)}`,
      });
      return true;
    }

    if (action === "rotateAsset") {
      const radians = clamp(decision.rotation ?? Math.PI / 8, -1, 1);
      rotateGenerated(target.id, radians);
      addLog({
        agentId: agent.id,
        agentName: agent.name,
        tool: "interact",
        text: `${agent.name} rotated ${target.kind} "${target.prompt}" ${radians.toFixed(2)} radians`,
      });
      return true;
    }

    if (action === "scaleAsset") {
      const multiplier = clamp(decision.scaleMultiplier ?? 1.15, 0.65, 1.5);
      scaleGenerated(target.id, multiplier);
      addLog({
        agentId: agent.id,
        agentName: agent.name,
        tool: "interact",
        text: `${agent.name} scaled ${target.kind} "${target.prompt}" to ${target.scale.toFixed(2)}x`,
      });
      return true;
    }

    if (action === "moveAssetToWater") {
      moveGeneratedToWater(target.id);
      addLog({
        agentId: agent.id,
        agentName: agent.name,
        tool: "interact",
        text: `${agent.name} repositioned ${target.kind} "${target.prompt}" toward the water or island edge`,
      });
      return true;
    }

    return false;
  };

  const runAgentTurn = async (agent: TellusAgent): Promise<void> => {
    if (paused) return;
    if (pendingAgentDecisions.has(agent.id)) return;
    pendingAgentDecisions.add(agent.id);
    try {
      if (paused) return;
      const decision = await askAgentForDecision(
        agent,
        generated,
        logs,
        visualFeedback,
      );
      if (destroyed || paused) return;
      if (decision.speech) {
        addLog({
          agentId: agent.id,
          agentName: agent.name,
          tool: "interact",
          text: `${agent.name} says: ${decision.speech}`,
        });
      }
      if (runAgentWorldAction(agent, decision)) return;
      const thing = generate({
        prompt: decision.prompt,
        location: chooseAgentLocation(agent, decision.prompt),
        creatorId: agent.id,
      });
      if (decision.intent) {
        if (paused) return;
        interact({
          targetId: thing.id,
          actorId: agent.id,
          intent: decision.intent,
        });
      }
    } catch (error) {
      if (destroyed || paused) return;
      addLog({
        agentId: "world",
        agentName: "Hyades",
        tool: "interact",
        text: `Agent model unavailable; using local behavior (${
          error instanceof Error ? error.message : "unknown error"
        })`,
      });
      const fallbackPrompt = chooseAgentPrompt(agent, generated);
      generate({
        prompt: fallbackPrompt,
        location: chooseAgentLocation(agent, fallbackPrompt),
        creatorId: agent.id,
      });
    } finally {
      pendingAgentDecisions.delete(agent.id);
    }
  };

  const runAgentReflection = (agent: TellusAgent): void => {
    if (paused || generated.length === 0) return;
    const target =
      generated[
        Math.floor(rand(performance.now() + agent.position.x) * generated.length)
      ];
    interact({
      targetId: target.id,
      actorId: agent.id,
      intent:
        agent.id === "johnny"
          ? "study what should live near here next and how this asset changes the world"
          : agent.id === "mira"
            ? "study what should live near here next and how this asset changes the local habitat"
            : "study what should live near here next and whether it belongs in the mountain pattern",
    });
  };

  const resize = () => {
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    agentVisionCamera.aspect = width / height;
    agentVisionCamera.updateProjectionMatrix();
    renderer?.setSize(width, height, false);
  };

  const moveVisitor = (delta: number) => {
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const movement = new THREE.Vector3();
    if (keys.has("w") || keys.has("arrowup")) movement.add(forward);
    if (keys.has("s") || keys.has("arrowdown")) movement.sub(forward);
    if (keys.has("a") || keys.has("arrowright")) movement.add(right);
    if (keys.has("d") || keys.has("arrowleft")) movement.sub(right);
    if (movement.lengthSq() === 0) return;
    movement.normalize().multiplyScalar(PLAYER_SPEED * delta);
    if (sailingThingId) {
      const boat = thingById(sailingThingId);
      if (!boat) {
        sailingThingId = undefined;
        return;
      }
      boat.position = movedVehiclePosition(
        boat,
        boat.position.x + movement.x,
        boat.position.z + movement.z,
        boat.position,
      );
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
    visitorPosition = groundedPosition(
      visitorPosition.x + movement.x,
      visitorPosition.z + movement.z,
      visitorPosition,
    );
    sendPresenceUpdate();
  };

  const moveAgents = (now: number, delta: number) => {
    for (const agent of agents) {
      if (distance2D(agent.position, agent.target) < 1.2) {
        if (agent.id === "johnny") {
          agent.target = { ...agent.position };
        } else {
          const angle = rand(now * 0.001 + agent.position.x) * Math.PI * 2;
          const radius = 7 + rand(now * 0.002 + agent.position.z) * 22;
          agent.target = normalizedDiscPosition(
            Math.cos(angle) * radius,
            Math.sin(angle) * radius,
          );
        }
      }
      const direction = new THREE.Vector3(
        agent.target.x - agent.position.x,
        0,
        agent.target.z - agent.position.z,
      );
      if (direction.lengthSq() > 0.001) {
        direction.normalize().multiplyScalar(AGENT_SPEED * delta);
        agent.position = normalizedDiscPosition(
          agent.position.x + direction.x,
          agent.position.z + direction.z,
        );
      }

      if (!paused && now >= agent.nextActionAt) {
        if (hasPendingGeneratedAsset(agent.id)) {
          agent.nextActionAt = now + 15_000;
          if (now >= agent.nextReflectionAt) {
            runAgentReflection(agent);
            agent.nextReflectionAt = now + AUTONOMOUS_ASSET_INTERVAL_MS;
          }
          continue;
        }
        void runAgentTurn(agent);
        agent.nextActionAt = now + AUTONOMOUS_ASSET_INTERVAL_MS;
        agent.nextReflectionAt = now + AUTONOMOUS_REFLECTION_OFFSET_MS;
      } else if (!paused && now >= agent.nextReflectionAt) {
        runAgentReflection(agent);
        agent.nextReflectionAt = now + AUTONOMOUS_ASSET_INTERVAL_MS;
      }
    }
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

    for (const agent of agents) {
      const mesh = agentMeshes.get(agent.id);
      if (!mesh) continue;
      mesh.position.set(agent.position.x, agent.position.y, agent.position.z);
      mesh.lookAt(agent.target.x, agent.position.y, agent.target.z);
      mesh.position.y += Math.sin(now * 0.004 + agent.color) * 0.08;
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
      scene.fog.near = 54 + daylight * 18;
      scene.fog.far = 176 + daylight * 54;
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

  const agentVisionLookTarget = (agent: TellusAgent): Vec3 => {
    if (distance2D(agent.position, agent.target) > 1.2) {
      return agent.target;
    }
    const nearest = generated
      .map((thing) => ({
        thing,
        distance: distance2D(agent.position, thing.position),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.thing;
    if (nearest) return nearest.position;
    if (agent.id === "johnny") return POND_CENTER;
    return normalizedDiscPosition(agent.position.x + 1, agent.position.z + 1);
  };

  const updateAgentVisionCamera = (agent: TellusAgent) => {
    const lookTarget = agentVisionLookTarget(agent);
    const lookDirection = new THREE.Vector3(
      lookTarget.x - agent.position.x,
      0,
      lookTarget.z - agent.position.z,
    );
    if (lookDirection.lengthSq() < 0.001) {
      lookDirection.set(0, 0, 1);
    }
    lookDirection.normalize();
    const eyeHeight = terrainHeight(agent.position.x, agent.position.z) + 2.2;
    const targetHeight = terrainHeight(lookTarget.x, lookTarget.z) + 1.4;
    agentVisionCamera.position.set(
      agent.position.x + lookDirection.x * 0.35,
      eyeHeight,
      agent.position.z + lookDirection.z * 0.35,
    );
    agentVisionCamera.lookAt(lookTarget.x, targetHeight, lookTarget.z);
  };

  const captureAgentVisionScreenshot = (agent: TellusAgent): string => {
    if (!renderer) throw new Error("Renderer is not ready");
    updateAgentVisionCamera(agent);
    const agentMesh = agentMeshes.get(agent.id);
    const wasVisible = agentMesh?.visible;
    if (agentMesh) agentMesh.visible = false;
    try {
      syncExternalSkyboxToCamera(agentVisionCamera.position);
      renderer.render(scene, agentVisionCamera);
      return captureCanvasDataUrl(renderer.domElement);
    } finally {
      if (agentMesh && wasVisible !== undefined) {
        agentMesh.visible = wasVisible;
      }
      syncExternalSkyboxToCamera(camera.position);
      renderer.render(scene, camera);
    }
  };

  const updateCamera = () => {
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

  const refreshWorldFeedback = (now: number) => {
    if (
      paused ||
      !worldFeedbackAvailable ||
      worldFeedbackPending ||
      now < nextWorldFeedbackAt ||
      !renderer
    ) {
      return;
    }
    nextWorldFeedbackAt = now + WORLD_FEEDBACK_INTERVAL_MS;
    worldFeedbackPending = true;
    const feedbackAgent =
      agents.find((agent) => agent.id === "johnny") ?? agents[0];
    if (!feedbackAgent) {
      worldFeedbackPending = false;
      return;
    }
    let screenshotUrl = "";
    try {
      screenshotUrl = captureAgentVisionScreenshot(feedbackAgent);
    } catch (error) {
      worldFeedbackPending = false;
      if (!worldFeedbackIssueLogged) {
        worldFeedbackIssueLogged = true;
        addLog({
          agentId: "world",
          agentName: "Z.ai Vision",
          tool: "interact",
          text: `${feedbackAgent.name} vision capture unavailable: ${
            error instanceof Error ? error.message : "unknown capture error"
          }`,
        });
      }
      return;
    }
    void requestWorldFeedback(screenshotUrl)
      .then((summary) => {
        if (destroyed || paused) return;
        visualFeedback = summary;
        worldFeedbackIssueLogged = false;
        addLog({
          agentId: "world",
          agentName: "Z.ai Vision",
          tool: "interact",
          text: `${feedbackAgent.name} vision updated: ${sanitizeLogText(summary).slice(0, 180)}`,
          screenshotUrl,
        });
      })
      .catch((error) => {
        if (destroyed || paused || worldFeedbackIssueLogged) return;
        if (isMissingApiRouteError(error)) {
          worldFeedbackAvailable = false;
          return;
        }
        worldFeedbackIssueLogged = true;
        addLog({
          agentId: "world",
          agentName: "Z.ai Vision",
          tool: "interact",
          text: `${feedbackAgent.name} vision unavailable: ${
            error instanceof Error ? error.message : "unknown vision error"
          }`,
          screenshotUrl,
        });
      })
      .finally(() => {
        worldFeedbackPending = false;
      });
  };

  const animate = async () => {
    if (destroyed || !renderer) return;
    const now = performance.now();
    const delta = clamp((now - lastTime) / 1000, 0, 0.05);
    lastTime = now;
    tick++;
    moveVisitor(delta);
    moveAgents(now, delta);
    for (const mixer of generatedAnimationMixers.values()) {
      mixer.update(delta);
    }
    syncMeshes(now);
    updateSelectionIndicator(now);
    syncTransformControls();
    updateCamera();
    updateDayNightCycle(Date.now(), now);
    try {
      renderer.render(scene, camera);
      refreshWorldFeedback(now);
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
    isDragging = true;
    pointerTravel = 0;
    pointerX = event.clientX;
    pointerY = event.clientY;
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (transformDragging || !isDragging) return;
    const dx = event.clientX - pointerX;
    const dy = event.clientY - pointerY;
    pointerTravel += Math.hypot(dx, dy);
    pointerX = event.clientX;
    pointerY = event.clientY;
    yaw -= dx * 0.006;
    pitch = clamp(pitch - dy * 0.003, -1.05, 1.05);
  };
  const selectGeneratedAtPointer = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointerNdc, camera);
    const intersections = raycaster.intersectObjects(
      [...generatedMeshes.values()],
      true,
    );
    for (const intersection of intersections) {
      let object: THREE.Object3D | null = intersection.object;
      while (object) {
        const tellusId = object.userData.tellusId;
        if (typeof tellusId === "string") {
          selectGenerated(tellusId);
          return;
        }
        object = object.parent;
      }
    }
    selectGenerated(undefined);
  };
  const handlePointerUp = (event: PointerEvent) => {
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
      for (const agent of agents) {
        void loadAgentAvatar(agent)
          .then((avatar) => {
            if (!avatar || destroyed) return;
            const agentRoot = agentMeshes.get(agent.id);
            if (!agentRoot) return;
            for (const child of [...agentRoot.children]) {
              agentRoot.remove(child);
              disposeObject(child);
            }
            agentRoot.add(avatar);
            addLog({
              agentId: "world",
              agentName: "Tellus",
              tool: "interact",
              text: `Loaded avatar for ${agent.name}`,
            });
          })
          .catch((error) => {
            addLog({
              agentId: "world",
              agentName: "Tellus",
              tool: "interact",
              text: `Avatar load failed for ${agent.name}: ${
                error instanceof Error ? error.message : "unknown avatar error"
              }`,
            });
          });
      }
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
      for (const agent of agents) {
        addLog({
          agentId: agent.id,
          agentName: agent.name,
          tool: "interact",
          text: `${agent.name} arrives: ${agent.goal}`,
        });
      }
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
            creatorId: "visitor",
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
    moveGenerated,
    rotateGenerated,
    scaleGenerated,
    resetGeneratedScale,
    liftGenerated,
    groundGenerated,
    deleteGenerated,
    moveGeneratedToWater,
    boardGenerated,
    disembark,
    sculptTerrain,
    talkToAgent,
    updateAgentGoal,
    importGeneratedThings,
    setGenerationProvider,
    setPlayerGenerationProvider,
    setAgentGenerationProvider,
    setInstantMeshTarget,
    setPaused,
    submitVisitorPrompt,
    snapshot,
    destroy: () => {
      destroyed = true;
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
      for (const mesh of remoteVisitorMeshes.values()) {
        scene.remove(mesh);
      }
      remoteVisitorMeshes.clear();
      remoteVisitors.clear();
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

function App(): React.ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<TellusWorldApi | null>(null);
  const [snapshot, setSnapshot] = useState<TellusSnapshot>({
    agents: createAgentSeeds(),
    generated: [],
    logs: [],
    paused: false,
    generationProvider: runtimeConfig.generationProvider,
    playerGenerationProvider: runtimeConfig.playerGenerationProvider,
    agentGenerationProvider: runtimeConfig.agentGenerationProvider,
    instantMeshTarget: runtimeConfig.instantMeshTarget,
    userId: tellusUserId(),
    remoteVisitors: [],
  });
  const [prompt, setPrompt] = useState("");
  const [chatPrompt, setChatPrompt] = useState("");
  const [assetLibrary, setAssetLibrary] = useState<AssetLibraryModel[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentId>("johnny");
  const [meshToolsOpen, setMeshToolsOpen] = useState(false);
  const [toolMenu, setToolMenu] = useState<
    "mesh" | "inventory" | "world-assets" | "terrain" | "ai"
  >("mesh");
  const [worldLogOpen, setWorldLogOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const { listening, supported, start } = useSpeechInput((text) =>
    setPrompt(text),
  );
  const {
    listening: chatListening,
    supported: chatSupported,
    start: startChatVoice,
  } = useSpeechInput((text) =>
    setChatPrompt((current) => `${current ? `${current} ` : ""}${text}`),
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let world: TellusWorldApi | null = null;
    void loadRuntimeConfig()
      .then(async () => {
        const [models] = await Promise.all([
          loadAssetLibraryModels().catch(() => []),
          loadTellusState(),
        ]);
        if (!cancelled) setAssetLibrary(models);
      })
      .catch((error) => {
        console.warn("Tellus startup state failed to load", error);
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
  }, []);

  const selected = useMemo(
    () =>
      snapshot.agents.find((agent) => agent.id === selectedAgent) ??
      snapshot.agents[0],
    [selectedAgent, snapshot.agents],
  );
  const selectedThing = useMemo(
    () =>
      snapshot.generated.find((thing) => thing.id === snapshot.selectedThingId) ??
      snapshot.generated[snapshot.generated.length - 1],
    [snapshot.generated, snapshot.selectedThingId],
  );
  const activeSelectedThing = snapshot.selectedThingId ? selectedThing : null;
  const selectedThingVehicleMode = selectedThing ? vehicleMode(selectedThing) : null;
  const selectedThingIsMount = selectedThing ? isMountThing(selectedThing) : false;
  const mapRadius = OCEAN_RADIUS * 0.42;
  const mapPointStyle = (position: Vec3): React.CSSProperties => ({
    left: `${clamp(((position.x / (mapRadius * 2)) + 0.5) * 100, 0, 100)}%`,
    top: `${clamp(((position.z / (mapRadius * 2)) + 0.5) * 100, 0, 100)}%`,
  });
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
  };

  const focusCreatePrompt = () => {
    promptRef.current?.focus();
  };

  const askSelectedAgent = () => {
    if (!chatPrompt.trim() || !selected) return;
    worldRef.current?.talkToAgent(selected.id, chatPrompt);
    setChatPrompt("");
  };

  useEffect(() => {
    const textarea = promptRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 36), 116)}px`;
  }, [prompt]);

  useEffect(() => {
    if (!snapshot.selectedThingId) {
      setMeshToolsOpen(false);
    }
  }, [snapshot.selectedThingId]);

  const recentLogs = snapshot.logs.slice(-10).reverse();
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
        meshToolsOpen ? "" : "mesh-tools-hidden",
        worldLogOpen ? "" : "world-log-hidden",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <section className="world-panel" aria-label="Tellus world">
        <div ref={containerRef} className="world-canvas" />
        <div className="world-top-bar">
          <div className="top-left-cluster">
            <details className="main-menu">
              <summary className="icon-button top-menu-button" title="Main menu" aria-label="Main menu">
                <Menu size={18} />
              </summary>
              <nav className="main-menu-list" aria-label="Main menu">
                <button type="button"><Home size={15} /><span>Home</span></button>
                <button
                  type="button"
                  onClick={() => {
                    setToolMenu("terrain");
                    setMeshToolsOpen(true);
                  }}
                >
                  <Mountain size={15} />
                  <span>Terrain</span>
                </button>
                <button type="button" onClick={focusCreatePrompt}><Sparkles size={15} /><span>Creation</span></button>
                <button type="button" onClick={() => setMeshToolsOpen(true)}><Hammer size={15} /><span>Mesh Tools</span></button>
                <button
                  type="button"
                  onClick={() => {
                    setToolMenu("ai");
                    setMeshToolsOpen(true);
                  }}
                >
                  <Bot size={15} />
                  <span>AI</span>
                </button>
                <details className="settings-menu">
                  <summary>
                    <Settings size={15} />
                    <span>Settings</span>
                  </summary>
                  <div className="settings-menu-panel">
                    <label>
                      <span>Players</span>
                      <select
                        className="asset-select"
                        value={snapshot.playerGenerationProvider}
                        onChange={(event) =>
                          worldRef.current?.setPlayerGenerationProvider(
                            event.target.value as RoleGenerationProvider,
                          )
                        }
                      >
                        <option value="instantmesh-gradio">Fast asset</option>
                        <option value="pixal3d-gradio">High quality</option>
                        <option value="anigen-gradio">Animated</option>
                        <option value="local">Local fallback</option>
                      </select>
                    </label>
                    <label>
                      <span>Agents</span>
                      <select
                        className="asset-select"
                        value={snapshot.agentGenerationProvider}
                        onChange={(event) =>
                          worldRef.current?.setAgentGenerationProvider(
                            event.target.value as RoleGenerationProvider,
                          )
                        }
                      >
                        <option value="pixal3d-gradio">High quality</option>
                        <option value="instantmesh-gradio">Fast asset</option>
                        <option value="anigen-gradio">Animated</option>
                        <option value="local">Local fallback</option>
                      </select>
                    </label>
                    {(snapshot.playerGenerationProvider === "instantmesh-gradio" ||
                      snapshot.agentGenerationProvider === "instantmesh-gradio") && (
                      <label>
                        <span>InstantMesh</span>
                        <select
                          className="asset-select"
                          value={snapshot.instantMeshTarget}
                          onChange={(event) =>
                            worldRef.current?.setInstantMeshTarget(
                              event.target.value as InstantMeshTarget,
                            )
                          }
                        >
                          <option value="dgx">DGX</option>
                          <option value="local">Local</option>
                        </select>
                      </label>
                    )}
                  </div>
                </details>
                <button type="button"><LogOut size={15} /><span>Exit</span></button>
              </nav>
            </details>
            <div className="brand-mark">
              <span className="brand-sigil">T</span>
              <span>Tellus</span>
              <small>World Weaver</small>
            </div>
          </div>
          <div aria-hidden="true" />
          <div className="top-right-cluster">
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
        <div className="bottom-control-cluster" aria-label="World controls">
          <button
            type="button"
            className="icon-button stat-pause-button"
            title={snapshot.paused ? "Resume agents" : "Pause agents"}
            onClick={() => worldRef.current?.setPaused(!snapshot.paused)}
          >
            {snapshot.paused ? <Play size={18} /> : <Pause size={18} />}
          </button>
        </div>
        <aside className="world-left-toolbelt" aria-label="Toolbelt">
          <button type="button" className="toolbelt-button" title="Build" onClick={() => setMeshToolsOpen(true)}>
            <Hammer size={18} />
            <span>Build</span>
          </button>
          <button
            type="button"
            className="toolbelt-button"
            title="Terrain"
            onClick={() => {
              setToolMenu("terrain");
              setMeshToolsOpen(true);
            }}
          >
            <Mountain size={18} />
            <span>Terrain</span>
          </button>
          <button type="button" className="toolbelt-button" title="Flora" onClick={() => setPrompt("wildflowers and moss")}>
            <Flower2 size={18} />
            <span>Flora</span>
          </button>
          <button type="button" className="toolbelt-button" title="Fauna" onClick={() => setPrompt("gentle forest animal")}>
            <Leaf size={18} />
            <span>Fauna</span>
          </button>
          <button
            type="button"
            className="toolbelt-button"
            title="Objects"
            onClick={() => {
              setToolMenu("world-assets");
              setMeshToolsOpen(true);
            }}
          >
            <Layers size={18} />
            <span>Objects</span>
          </button>
          <button
            type="button"
            className="toolbelt-button"
            title="Inventory"
            onClick={() => {
              setToolMenu("inventory");
              setMeshToolsOpen(true);
            }}
          >
            <Backpack size={18} />
            <span>Inventory</span>
          </button>
          <button type="button" className="toolbelt-button" title="Chat" onClick={() => setWorldLogOpen(true)}>
            <MessageCircle size={18} />
            <span>Chat</span>
          </button>
          <button type="button" className="toolbelt-button" title="Map">
            <MapIcon size={18} />
            <span>Map</span>
          </button>
        </aside>
        <aside className="world-right-hud" aria-label="World systems">
          <section className="world-map" aria-label="World map">
            <div className="world-map-disc" />
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
            {snapshot.agents.map((agent) => (
              <span
                key={agent.id}
                className="map-marker agent"
                style={{
                  ...mapPointStyle(agent.position),
                  backgroundColor: `#${agent.color.toString(16).padStart(6, "0")}`,
                }}
                title={`${agent.name} - ${agent.epithet}`}
              />
            ))}
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
                <div><dt>Agents</dt><dd>{snapshot.agents.length}</dd></div>
                <div><dt>Players</dt><dd>{snapshot.remoteVisitors.length + 1}</dd></div>
                <div><dt>AI</dt><dd>{snapshot.paused ? "Paused" : "Active"}</dd></div>
              </dl>
            </section>
          </section>
          <section className="creation-panel" aria-label="Creation panel">
            <header>
              <h2>Creation Panel</h2>
              <button
                type="button"
                className="panel-mini-button"
                onClick={() => setMeshToolsOpen(true)}
              >
                Mesh
              </button>
            </header>
            <div className="creation-tabs" aria-label="Creation types">
              <button type="button" className="active">Assets</button>
              <button type="button">Terrain</button>
              <button type="button">Flora</button>
              <button type="button">AI</button>
            </div>
            <div className="creation-grid">
              {assetLibrary.slice(0, 6).map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className="creation-tile"
                  onClick={() => worldRef.current?.addLibraryAsset(model)}
                >
                  <Box size={21} />
                  <span>{model.name.slice(0, 18)}</span>
                </button>
              ))}
              {assetLibrary.length === 0 && (
                <>
                  <button type="button" className="creation-tile" onClick={() => setPrompt("stone arch")}>
                    <Mountain size={21} />
                    <span>Stone Arch</span>
                  </button>
                  <button type="button" className="creation-tile" onClick={() => setPrompt("pine tree")}>
                    <Sprout size={21} />
                    <span>Pine Tree</span>
                  </button>
                  <button type="button" className="creation-tile" onClick={() => setPrompt("deer")}>
                    <Leaf size={21} />
                    <span>Deer</span>
                  </button>
                  <button type="button" className="creation-tile" onClick={() => setPrompt("small cottage")}>
                    <Home size={21} />
                    <span>House</span>
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              className="primary-button wide-button"
              onClick={submitPrompt}
              disabled={!prompt.trim()}
            >
              <Send size={15} />
              <span>Place</span>
            </button>
          </section>
          <section className="ai-monitor-panel" aria-label="AI monitor">
            <h2>AI Monitor</h2>
            <p><strong>Tellus AI</strong> {snapshot.paused ? "standing by" : "weaving world actions"}</p>
            <div className="monitor-meter">
              <span style={{ width: `${Math.min(100, pendingGenerated.length * 33)}%` }} />
            </div>
            <small>{pendingGenerated.length} generation tasks queued</small>
          </section>
        </aside>
        {worldLogOpen && (
          <section className="world-mini-chat" aria-label="World chat">
            <header>
              <strong>World Chat</strong>
              <button
                type="button"
                title="Hide world chat"
                aria-label="Hide world chat"
                onClick={() => setWorldLogOpen(false)}
              >
                x
              </button>
            </header>
            <div className="mini-chat-log">
              {recentLogs.slice(0, 4).map((log) => (
                <article key={log.id} className={`mini-chat-entry ${log.tool}`}>
                  <strong>{log.agentName}</strong>
                  <p>{log.text}</p>
                </article>
              ))}
            </div>
            <textarea
              className="mini-chat-input"
              value={chatPrompt}
              rows={2}
              placeholder={selected ? `Ask ${selected.name}...` : "Ask an agent..."}
              onChange={(event) => setChatPrompt(event.target.value)}
            />
            <div className="mini-chat-actions">
              <button
                type="button"
                className="secondary-button prompt-icon-button"
                title={chatListening ? "Listening" : "Speak to chat"}
                aria-label={chatListening ? "Listening" : "Speak to chat"}
                disabled={!chatSupported || chatListening}
                onClick={startChatVoice}
              >
                <Mic size={16} />
              </button>
              <button
                type="button"
                className="secondary-button wide-button mini-chat-submit"
                disabled={!chatPrompt.trim() || !selected}
                onClick={askSelectedAgent}
                title={selected ? `Ask ${selected.name}` : "Ask"}
                aria-label={selected ? `Ask ${selected.name}` : "Ask"}
              >
                <MessageCircle size={16} />
              </button>
            </div>
          </section>
        )}
        {!worldLogOpen && (
          <button
            type="button"
            className="chat-reopen-button"
            title="Show world chat"
            aria-label="Show world chat"
            onClick={() => setWorldLogOpen(true)}
          >
            <MessageCircle size={18} />
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
                  Ride
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
        <section className="prompt-card world-prompt-card">
          <label htmlFor="tellus-prompt">Create</label>
          <textarea
            id="tellus-prompt"
            ref={promptRef}
            value={prompt}
            rows={1}
            placeholder="make a crooked apple tree with golden moss..."
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
      </section>

      <aside className="tool-panel" aria-label="Mesh tools">
        <div className="panel-strip">
          <span>
            {toolMenu === "mesh"
              ? "Mesh Tools"
              : toolMenu === "inventory"
                ? "Inventory"
                : toolMenu === "world-assets"
                  ? "World Assets"
                  : toolMenu === "terrain"
                    ? "Terrain"
                    : "AI"}
          </span>
          <button
            type="button"
            className="icon-button"
            title="Hide mesh tools"
            aria-label="Hide mesh tools"
            onClick={() => setMeshToolsOpen(false)}
          >
            <ArrowLeft size={17} />
          </button>
        </div>
        <nav className="tool-panel-tabs" aria-label="Tool menus">
          <button
            type="button"
            className={toolMenu === "mesh" ? "active" : ""}
            onClick={() => setToolMenu("mesh")}
          >
            <Box size={15} />
            <span>Mesh</span>
          </button>
          <button
            type="button"
            className={toolMenu === "inventory" ? "active" : ""}
            onClick={() => setToolMenu("inventory")}
          >
            <Backpack size={15} />
            <span>Inventory</span>
          </button>
          <button
            type="button"
            className={toolMenu === "world-assets" ? "active" : ""}
            onClick={() => setToolMenu("world-assets")}
          >
            <Sparkles size={15} />
            <span>Assets</span>
          </button>
          <button
            type="button"
            className={toolMenu === "terrain" ? "active" : ""}
            onClick={() => setToolMenu("terrain")}
          >
            <Mountain size={15} />
            <span>Terrain</span>
          </button>
          <button
            type="button"
            className={toolMenu === "ai" ? "active" : ""}
            onClick={() => setToolMenu("ai")}
          >
            <Bot size={15} />
            <span>AI</span>
          </button>
        </nav>
        {toolMenu === "mesh" && (
        <section className="asset-card">
          <div className="section-heading">
            <Box size={16} />
            <span>Mesh Tools</span>
          </div>
          <select
            className="asset-select"
            value={selectedThing?.id ?? ""}
            disabled={snapshot.generated.length === 0}
            onChange={(event) =>
              worldRef.current?.selectGenerated(event.target.value)
            }
          >
            {snapshot.generated.length === 0 && (
              <option value="">No generated meshes</option>
            )}
            {snapshot.generated.map((thing) => (
              <option key={thing.id} value={thing.id}>
                {thing.kind}: {thing.prompt.slice(0, 42)}
              </option>
            ))}
          </select>
          <div className="asset-meta">
            {selectedThing ? (
              <>
                <span>{selectedThing.generationStatus ?? "local"}</span>
                <span>
                  x {selectedThing.position.x.toFixed(1)} y{" "}
                  {selectedThing.position.y.toFixed(1)} z{" "}
                  {selectedThing.position.z.toFixed(1)}
                </span>
                <span>{selectedThing.scale.toFixed(2)}x</span>
              </>
            ) : (
              <>
                <span>no mesh selected</span>
                <span>generate or choose an asset</span>
              </>
            )}
          </div>
          <div className="asset-orb-control" aria-label="Asset position">
            <button
              type="button"
              className="orb-button orb-up"
              title="Move forward"
              aria-label="Move forward"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.moveGenerated(selectedThing.id, 0, -2)}
            >
              <ArrowUp size={17} />
            </button>
            <button
              type="button"
              className="orb-button orb-left"
              title="Move left"
              aria-label="Move left"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.moveGenerated(selectedThing.id, -2, 0)}
            >
              <ArrowLeft size={17} />
            </button>
            <button
              type="button"
              className="orb-button orb-center"
              title="Ground asset"
              aria-label="Ground asset"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.groundGenerated(selectedThing.id)}
            >
              <Mountain size={17} />
            </button>
            <button
              type="button"
              className="orb-button orb-right"
              title="Move right"
              aria-label="Move right"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.moveGenerated(selectedThing.id, 2, 0)}
            >
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="orb-button orb-down"
              title="Move backward"
              aria-label="Move backward"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.moveGenerated(selectedThing.id, 0, 2)}
            >
              <ArrowDown size={17} />
            </button>
          </div>
          <div className="height-actions">
            <button
              type="button"
              className="secondary-button"
              title="Raise height"
              aria-label="Raise height"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.liftGenerated(selectedThing.id, 1)}
            >
              <ArrowUp size={17} />
              <span>Up</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              title="Lower height"
              aria-label="Lower height"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.liftGenerated(selectedThing.id, -1)}
            >
              <ArrowDown size={17} />
              <span>Down</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              title="Ground"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.groundGenerated(selectedThing.id)}
            >
              <Mountain size={17} />
              <span>Ground</span>
            </button>
          </div>
          <div className="rotation-orb-control" aria-label="Asset rotation">
            <button
              type="button"
              className="rotation-orb-button rotation-pitch-up"
              title="Pitch up"
              aria-label="Pitch up"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.rotateGenerated(selectedThing.id, -Math.PI / 12, "x")}
            >
              <ArrowUp size={16} />
            </button>
            <button
              type="button"
              className="rotation-orb-button rotation-roll-left"
              title="Roll left"
              aria-label="Roll left"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.rotateGenerated(selectedThing.id, -Math.PI / 12, "z")}
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              className="rotation-orb-button rotation-level"
              title="Level asset"
              aria-label="Level asset"
              disabled={!selectedThing}
              onClick={() => {
                if (!selectedThing) return;
                worldRef.current?.rotateGenerated(
                  selectedThing.id,
                  -(selectedThing.rotationX ?? 0),
                  "x",
                );
                worldRef.current?.rotateGenerated(
                  selectedThing.id,
                  -(selectedThing.rotationZ ?? 0),
                  "z",
                );
              }}
            >
              <span>Level</span>
            </button>
            <button
              type="button"
              className="rotation-orb-button rotation-roll-right"
              title="Roll right"
              aria-label="Roll right"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.rotateGenerated(selectedThing.id, Math.PI / 12, "z")}
            >
              <RotateCw size={16} />
            </button>
            <button
              type="button"
              className="rotation-orb-button rotation-pitch-down"
              title="Pitch down"
              aria-label="Pitch down"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.rotateGenerated(selectedThing.id, Math.PI / 12, "x")}
            >
              <ArrowDown size={16} />
            </button>
            <button
              type="button"
              className="rotation-orb-button rotation-yaw-left"
              title="Yaw left"
              aria-label="Yaw left"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.rotateGenerated(selectedThing.id, -Math.PI / 12, "y")}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              type="button"
              className="rotation-orb-button rotation-yaw-right"
              title="Yaw right"
              aria-label="Yaw right"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.rotateGenerated(selectedThing.id, Math.PI / 12, "y")}
            >
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="transform-actions">
            <button
              type="button"
              className="secondary-button"
              title="Move to water"
              aria-label="Move asset to water"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.moveGeneratedToWater(selectedThing.id)}
            >
              <Waves size={17} />
              <span>Water</span>
            </button>
          </div>
          <div className="scale-actions">
            <button
              type="button"
              className="secondary-button"
              title="Scale down"
              aria-label="Scale down"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.scaleGenerated(selectedThing.id, 0.72)}
            >
              <Minus size={17} />
            </button>
            <button
              type="button"
              className="secondary-button"
              title="Reset scale"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.resetGeneratedScale(selectedThing.id)}
            >
              <span>1x</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              title="Scale up"
              aria-label="Scale up"
              disabled={!selectedThing}
              onClick={() => selectedThing && worldRef.current?.scaleGenerated(selectedThing.id, 1.38)}
            >
              <Plus size={17} />
            </button>
          </div>
          <button
            type="button"
            className="danger-button wide-button"
            disabled={!selectedThing}
            onClick={() => selectedThing && worldRef.current?.deleteGenerated(selectedThing.id)}
          >
            <Trash2 size={16} />
            <span>Delete Asset</span>
          </button>
          {selectedThing && selectedThingVehicleMode && (
            <button
              type="button"
              className="primary-button wide-button"
              onClick={() =>
                snapshot.sailingThingId === selectedThing.id
                  ? worldRef.current?.disembark()
                  : worldRef.current?.boardGenerated(selectedThing.id)
              }
            >
              <Ship size={16} />
              <span>
                {snapshot.sailingThingId === selectedThing.id
                  ? "Disembark"
                  : selectedThingIsMount
                    ? "Mount and Ride"
                    : "Board and Pilot"}
              </span>
            </button>
          )}
        </section>
        )}

        {toolMenu === "inventory" && (
        <section className="tool-card inventory-card">
          <div className="tool-title">
            <Box size={16} />
            <span>Inventory</span>
          </div>
          <div className="inventory-meta">
            <span>{inventory.length} owned assets</span>
            <code>{snapshot.userId.slice(0, 8)}</code>
          </div>
          <div className="inventory-list">
            {inventory.length > 0 ? (
              inventory.map((thing) => (
                <button
                  key={thing.id}
                  type="button"
                  className={
                    thing.id === selectedThing?.id
                      ? "inventory-item active"
                      : "inventory-item"
                  }
                  onClick={() => worldRef.current?.selectGenerated(thing.id)}
                >
                  <span>
                    <strong>{thing.prompt.slice(0, 28)}</strong>
                    <small>{thing.kind} · {thing.generationStatus ?? "local"}</small>
                  </span>
                </button>
              ))
            ) : (
              <span className="inventory-empty">Create or import an asset to start your inventory.</span>
            )}
          </div>
        </section>
        )}

        {toolMenu === "world-assets" && (
        <section className="tool-card inventory-card">
          <div className="tool-title">
            <Sparkles size={16} />
            <span>World Assets</span>
          </div>
          <div className="inventory-list">
            {assetLibrary.length > 0 ? (
              assetLibrary.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className="inventory-item"
                  onClick={() => worldRef.current?.addLibraryAsset(model)}
                >
                  <span>
                    <strong>{model.name.slice(0, 30)}</strong>
                    <small>
                      {model.source === "generated"
                        ? "Generated"
                        : (model.file_format ?? "model").toUpperCase()}
                      {model.source !== "generated" && typeof model.download_count === "number"
                        ? ` · ${model.download_count} downloads`
                        : ""}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <span className="inventory-empty">No library assets loaded yet.</span>
            )}
          </div>
        </section>
        )}

        {toolMenu === "ai" && (
          <section className="tool-card ai-card">
            <div className="tool-title">
              <Bot size={16} />
              <span>AI Agents</span>
            </div>
            <div className="agent-list compact">
              {snapshot.agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={
                    agent.id === selectedAgent
                      ? "agent-row active"
                      : "agent-row"
                  }
                  onClick={() => setSelectedAgent(agent.id)}
                >
                  <span
                    className="agent-dot"
                    style={{
                      backgroundColor: `#${agent.color.toString(16).padStart(6, "0")}`,
                    }}
                  />
                  <span>
                    <strong>{agent.name}</strong>
                    <small>{agent.epithet || "Tellus agent"}</small>
                  </span>
                </button>
              ))}
            </div>
            {selected && (
              <div className="ai-agent-editor">
                <div className="ai-avatar-card">
                  <div
                    className="ai-avatar-orb"
                    style={{
                      backgroundColor: `#${selected.color.toString(16).padStart(6, "0")}`,
                    }}
                  >
                    {selected.name.slice(0, 1)}
                  </div>
                  <span>
                    <strong>{selected.name}</strong>
                    <small>{selected.avatarUrl ? "Avatar loaded" : "Fallback avatar"}</small>
                  </span>
                </div>
                <label className="ai-prompt-field">
                  <span>Agent prompt</span>
                  <textarea
                    value={selected.goal}
                    rows={7}
                    onChange={(event) =>
                      worldRef.current?.updateAgentGoal(
                        selected.id,
                        event.target.value,
                      )
                    }
                  />
                </label>
                <div className="asset-meta">
                  <span>
                    x {selected.position.x.toFixed(1)} z{" "}
                    {selected.position.z.toFixed(1)}
                  </span>
                  <span>{selected.epithet || "agent"}</span>
                </div>
              </div>
            )}
          </section>
        )}

        {toolMenu === "terrain" && (
        <section className="tool-card">
          <div className="tool-title">
            <Mountain size={16} />
            <span>Terrain</span>
          </div>
          <div className="terrain-actions compact">
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
              <span>Flat</span>
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
            <button
              type="button"
              className="secondary-button"
              onClick={() => worldRef.current?.sculptTerrain("meadow")}
            >
              <span>Meadow</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => worldRef.current?.sculptTerrain("beach")}
            >
              <span>Beach</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => worldRef.current?.sculptTerrain("dirt")}
            >
              <span>Dirt</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => worldRef.current?.sculptTerrain("rock")}
            >
              <span>Rock</span>
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => worldRef.current?.sculptTerrain("snow")}
            >
              <span>Snow</span>
            </button>
          </div>
        </section>
        )}

      </aside>

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
