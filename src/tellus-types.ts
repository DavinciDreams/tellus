import type { createRoot } from "react-dom/client";
import type * as THREE from "three";
import type { MeshStats } from "./webrtc-mesh";
import type { WorldGeneratedThing, WorldPresence } from "./world-protocol";

export type AgentId = "johnny" | "mira" | "sol" | "atlas";

export type TerrainKind =
  | "meadow"
  | "rock"
  | "snow"
  | "beach"
  | "dirt"
  | "flowers"
  | "water";
export type TerrainPaintKind = Exclude<TerrainKind, "water">;
export type TerrainEditMode = "raise" | "lower" | "flatten" | TerrainPaintKind;
export type WorldTemplateId = "tellus" | "wide-island" | "lowlands" | "ridge";

export interface TerrainMountainShape {
  height: number;
  radius: number;
  exponent: number;
}

export interface TerrainBumpShape {
  x: number;
  z: number;
  height: number;
  radius: number;
}

export interface TerrainRidgeShape {
  sinScale: number;
  cosScale: number;
  diagonalScale: number;
}

export interface TerrainShoreShape {
  startRatio: number;
  widthRatio: number;
  drop: number;
}

export interface TerrainPondShape {
  x: number;
  z: number;
  radius: number;
  depth: number;
  falloff: number;
}

export interface LandShapeConfig {
  mountain: TerrainMountainShape;
  shoulder: TerrainBumpShape;
  southernRise: TerrainBumpShape;
  ridge: TerrainRidgeShape;
  shore: TerrainShoreShape;
  pond: TerrainPondShape;
  baseOffset: number;
}

export interface LandShapeOverrides {
  mountain?: Partial<TerrainMountainShape>;
  shoulder?: Partial<TerrainBumpShape>;
  southernRise?: Partial<TerrainBumpShape>;
  ridge?: Partial<TerrainRidgeShape>;
  shore?: Partial<TerrainShoreShape>;
  pond?: Partial<Omit<TerrainPondShape, "falloff">> & { falloff?: number };
  baseOffset?: number;
}

export type GenerationProvider =
  | "local"
  | "asset-forge"
  | "instantmesh-gradio"
  | "pixal3d-gradio"
  | "anigen-gradio";
export type DirectGenerationProvider = Extract<
  GenerationProvider,
  "instantmesh-gradio" | "pixal3d-gradio" | "anigen-gradio"
>;
export type RoleGenerationProvider = DirectGenerationProvider | "local";
export type InstantMeshTarget = "dgx" | "local";
export type GeneratedKind =
  | "tree"
  | "flower"
  | "stone"
  | "animal"
  | "path"
  | "shrine"
  | "seed"
  | "balloon"
  | "object";

export type ToolName = "generate" | "interact";
export type AssetPanelTab = "search" | "world-assets" | "inventory" | "procedural";
export type ToolMenu = "terrain";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GeneratedThing {
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
  /** Embedded clip name to loop on the loaded model ("" / absent = the default idle-ish
   * heuristic pick). Synced over generated.upsert; missing clips fall back to the heuristic. */
  animation?: string;
}

export interface AssetLibraryModel {
  id: string;
  name: string;
  description?: string;
  file_format?: string;
  file_size?: number;
  download_count?: number;
  modelUrl?: string;
  source?: "asset-library" | "generated";
  /** Store browse-card extras (3D Asset Manager /models/browse). */
  hasThumbnail?: boolean;
  hasGameOptimized?: boolean;
  /** Store reports the model can actually be rendered/served (conversion done, a view URL exists). */
  viewable?: boolean;
  tags?: string[];
}

export interface AssetLibraryResponse {
  models?: AssetLibraryModel[];
}

export interface DistantIslandSpec {
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

export interface TellusLog {
  id: string;
  tick: number;
  agentId: AgentId | "visitor" | "world";
  agentName: string;
  tool: ToolName;
  text: string;
  screenshotUrl?: string;
}

export interface GenerateRequest {
  prompt: string;
  location: Vec3 | "near-agent" | "near-mountain" | "near-pond";
  scale?: number;
  creatorId: AgentId | "visitor";
  ownerUserId?: string;
}

export interface InteractRequest {
  targetId: string;
  intent: string;
  actorId: AgentId | "visitor";
}

export interface TellusSnapshot {
  generated: GeneratedThing[];
  logs: TellusLog[];
  generationProvider: GenerationProvider;
  playerGenerationProvider: RoleGenerationProvider;
  agentGenerationProvider: RoleGenerationProvider;
  instantMeshTarget: InstantMeshTarget;
  userId: string;
  visitorPosition?: Vec3;
  visitorYaw?: number;
  viewDistance?: number;
  remoteVisitors: WorldPresence[];
  selectedThingId?: string;
  sailingThingId?: string;
}

export interface TellusWorldApi {
  generate(request: GenerateRequest): GeneratedThing;
  addLibraryAsset(model: AssetLibraryModel): GeneratedThing;
  interact(request: InteractRequest): TellusLog;
  selectGenerated(id?: string): void;
  goToGenerated(id: string): void;
  moveGenerated(id: string, dx: number, dz: number): void;
  warpTo(x: number, z: number): void;
  rotateGenerated(id: string, radians: number, axis?: "x" | "y" | "z"): void;
  scaleGenerated(id: string, multiplier: number): void;
  resetGeneratedScale(id: string): void;
  liftGenerated(id: string, amount: number): void;
  groundGenerated(id: string): void;
  deleteGenerated(id: string): void;
  cloneGenerated(id: string): void;
  moveGeneratedToWater(id: string): void;
  boardGenerated(id: string): void;
  disembark(): void;
  sculptTerrain(mode: TerrainEditMode): void;
  importGeneratedThings(things: WorldGeneratedThing[]): void;
  setGenerationProvider(provider: GenerationProvider): void;
  setPlayerGenerationProvider(provider: RoleGenerationProvider): void;
  setAgentGenerationProvider(provider: RoleGenerationProvider): void;
  setInstantMeshTarget(target: InstantMeshTarget): void;
  submitVisitorPrompt(prompt: string): void;
  snapshot(): TellusSnapshot;
  getFps(): number;
  // ── P2P video controls (RX inbound video, TX local camera) ──
  setRxEnabled(on: boolean): void;
  setTxEnabled(on: boolean): Promise<boolean>;
  setP2pDevices(audioDeviceId?: string, videoDeviceId?: string): Promise<void>;
  setRemoteAudioEnabled(on: boolean): void;
  setMicEnabled(on: boolean): void;
  getP2pStats(): MeshStats | null;
  getSelfStream(): MediaStream | null;
  // ── Avatar picker ──
  // Select a catalog avatar ("classic" | "vrm:<storeId>" | "glb:<storeId>"; "" = deterministic
  // default). Rebuilds the local rig immediately, persists to localStorage and broadcasts over
  // presence so other players swap your avatar too.
  setAvatarSelection(avatarId: string): void;
  getAvatarSelection(): string;
  // Avatar size multiplier (the picker "Size" slider; clamped [0.1, 8], 1 = default). VISUAL-ONLY
  // — physics/collision/movement are untouched. Rescales the local silhouette live (no rig
  // rebuild), persists to localStorage "tellus.avatarScale" and broadcasts over presence.
  setAvatarScale(scale: number): void;
  getAvatarScale(): number;
  // ── Camera mode (presentation-only; physics/movement are untouched) ──
  // "third" = the classic orbit camera; "first" = the main camera rides the LOCAL avatar's head
  // (own avatar + TV hidden locally; others still see you). Persists in localStorage
  // "tellus.cameraMode"; toolbelt Eye button + the V key toggle it.
  setCameraMode(mode: "first" | "third"): void;
  getCameraMode(): "first" | "third";
  // ── Per-thing animation (placed models with embedded clips) ──
  // Clip names of the loaded model for the selected-object HUD ([] = none loaded / no clips).
  getGeneratedClipNames(id: string): string[];
  // Loop a specific embedded clip on a placed thing ("" = back to the default heuristic pick).
  // Persists on the thing and syncs over generated.upsert so every client converges.
  setGeneratedAnimation(id: string, animation: string): void;
  // Picture-in-picture POV view of the scene from a remote-presence avatar (the player's server-side agent).
  // Pass the agent's visitorId to show its viewport; pass null to hide it.
  setAgentViewport(visitorId: string | null): void;
  // True when that remote-presence avatar mesh is currently in the scene (false => the PiP falls
  // back to the server-held remote-view snapshot instead of a locally rendered POV).
  hasVisitorAvatar(visitorId: string): boolean;
  // Ballistic throw of a placed thing (tumbles, bounces off terrain or splashes + floats, then
  // settles; the rest pose publishes through the normal upsert path). Bound to G when selected.
  throwGenerated(id: string): void;
  // Explicit Move mode: while set, any press/drag on the world repositions that thing (camera orbit
  // suspended). Pass null to exit. Driven by the selected-object "Move" button.
  setMoveMode(id: string | null): void;
  // Agent vision: render the agent avatar's first-person view into a small offscreen target and
  // return it as a JPEG data URL (null when the avatar isn't present). The app uploads this to
  // Hyades so the agent's LLM turn can actually SEE — no headless browser involved.
  captureAgentView(visitorId: string): Promise<string | null>;
  // Live counters for the procedural vegetation + ambient physics (debug overlay).
  getAmbientStats(): {
    vegetation: { tier: number; chunks: number; grassIndices: number; trees: number };
    physicsBodies: number;
  };
  destroy(): void;
}

export interface TellusRuntimeConfig {
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
  worldTemplate: WorldTemplateId;
  landShape?: LandShapeOverrides;
  dayNightCycleMs: number;
  dayNightStart: number;
  // When true, fold non-selected static (no-animation) duplicate generated placements that share a modelUrl
  // into a shared THREE.InstancedMesh per sub-mesh to cut draw calls. Default OFF — opt in via
  // VITE_TELLUS_INSTANCE_STATIC=true or a runtime-config `instanceStaticDuplicates: true`.
  instanceStaticDuplicates: boolean;
}

export interface AssetForgePipelineStart {
  pipelineId: string;
  status: string;
  message: string;
}

export interface AssetForgePipelineStatus {
  id: string;
  status: "initializing" | "processing" | "completed" | "failed" | string;
  progress: number;
  finalAsset?: {
    modelUrl?: string;
  };
  error?: string;
}

export interface DirectGenerationResponse {
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

export interface GeneratedAssetManifestEntry {
  id?: string;
  prompt?: string;
  kind?: string;
  createdAt?: string;
  modelUrl?: string;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export interface SpeechRecognitionLike extends EventTarget {
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

export type MaterialWithTextureMaps = THREE.Material & {
  map?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
};

export type VehicleMode = "water" | "air" | "ground";

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
    // Diagnostics for the rigged-VRM avatar upgrade (consumed by smoke tests / the console).
    __tellusAvatarDebug?: () => {
      localVisitorId: string;
      /** The applied catalog selection for the local player ("" = deterministic default). */
      localAvatarId: string;
      rigIds: string[];
      localSkinnedMeshes: number;
      localBodyHidden: boolean;
      /** The local user scale currently APPLIED (mid-lerp value; target once settled). */
      localScale: number;
      /** World-space Y scale of the local silhouette node (mounted model, else the torso). */
      localModelWorldScaleY: number;
      /** Per-remote-visitor applied user scale (presence-fed). */
      remoteScales: Record<string, number>;
    };
    __tellusImportGenerated?: (things: unknown) => number;
    __tellusImportSnapshot?: (snapshot: unknown) => number;
    __tellusSaveGeneratedPlacements?: () => number;
    // Diagnostics for generated/world things (smoke tests / console). Cheap: walks the thing list
    // only when called; no per-frame cost.
    __tellusThingsDebug?: () => Array<{
      id: string;
      kind: string;
      prompt: string;
      status: string;
      hasMesh: boolean;
      meshVisible: boolean;
      inScene: boolean;
      /** True once the thing's GLB (matching thing.modelUrl) is the mounted mesh. */
      loaded: boolean;
      /** True while the placeholder generation swirl is mounted instead of a model. */
      swirl: boolean;
      /** True when the regular mesh is hidden behind a static-duplicate instance slot. */
      instanced: boolean;
      worldPos?: { x: number; y: number; z: number };
      worldScale?: number;
      /** Embedded clip count of the loaded file (VRM autons are clip-less → 0). */
      clipCount: number;
      /** True when the thing is a placed VRM rendered through the VRM rig. */
      vrm?: boolean;
      /** Retargeted VRMA catalog clip names available on a VRM thing. */
      vrmaClips?: string[];
      /** Skinned-mesh count of the mounted model (a VRM auton has ≥1). */
      skinnedMeshCount?: number;
      /** True while an embedded-clip mixer OR a VRM rig is advancing this thing. */
      playing: boolean;
    }>;
    // Diagnostics for placed mirrors (smoke tests / console): how many render live (Reflector) vs as
    // static tinted glass, and the live-mirror cap.
    __tellusMirrorDebug?: () => {
      live: number;
      glass: number;
      liveCap: number;
      trackedLive: number;
    };
    // Diagnostics for the camera/viewport work (smoke tests / console): drive the agent-POV PiP
    // and the 1st/3rd-person camera without a live agent, and inject a synthetic remote presence
    // so the PiP has an avatar to render from.
    __tellusViewDebug?: {
      setAgentViewport: (visitorId: string | null) => void;
      hasVisitorAvatar: (visitorId: string) => boolean;
      setCameraMode: (mode: "first" | "third") => void;
      getCameraMode: () => "first" | "third";
      injectRemotePresence: (visitorId: string, x: number, z: number, avatarScale?: number) => void;
    };
  }
}
