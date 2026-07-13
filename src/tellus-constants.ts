import * as THREE from "three";

import type {
  GenerationProvider,
  InstantMeshTarget,
  TerrainKind,
  TerrainPaintKind,
  Vec3,
} from "./tellus-types";

// ── World scale ──────────────────────────────────────────────────────────────────────────────────
// Legacy island constants remain for compatibility helpers and old terrain math, but normal outdoor
// worlds route through chunked ids now. New world size is encoded in `chunked-<n>-<slug>`.
export const CLASSIC_WORLD_RADIUS = 72;
export let WORLD_SCALE = 1;
export let WORLD_RADIUS = 72;
export let OCEAN_RADIUS = 240;
export let CENTRAL_WALK_RADIUS = WORLD_RADIUS - 0.5;
let CLASSIC_POND_RADIUS = 7.4;
const CLASSIC_POND_CENTER: Vec3 = { x: 18, y: 0, z: -12 };
export let POND_RADIUS = CLASSIC_POND_RADIUS;
export const POND_CENTER: Vec3 = {
  x: CLASSIC_POND_CENTER.x,
  y: 0,
  z: CLASSIC_POND_CENTER.z,
};

export function worldScaleForId(worldId: string): number {
  const id = worldId.toLowerCase();
  if (/^(mega|giant)[-_]/.test(id)) return 5;
  if (/^(large|big|xl)[-_]/.test(id)) return 3;
  return 2;
}

export function setWorldScale(scale: number): void {
  WORLD_SCALE = scale;
  WORLD_RADIUS = CLASSIC_WORLD_RADIUS * scale;
  OCEAN_RADIUS = 240 * scale;
  CENTRAL_WALK_RADIUS = WORLD_RADIUS - 0.5;
  POND_RADIUS = CLASSIC_POND_RADIUS * scale;
  POND_CENTER.x = CLASSIC_POND_CENTER.x * scale;
  POND_CENTER.z = CLASSIC_POND_CENTER.z * scale;
}

export function setClassicPondShape(x: number, z: number, radius: number): void {
  CLASSIC_POND_CENTER.x = x;
  CLASSIC_POND_CENTER.z = z;
  CLASSIC_POND_RADIUS = radius;
  POND_CENTER.x = x * WORLD_SCALE;
  POND_CENTER.z = z * WORLD_SCALE;
  POND_RADIUS = radius * WORLD_SCALE;
}

/** Walk speed grows on big worlds so traversal stays fun (1× → 13, 3× → ~24.7, 5× → ~36.4). */
export function scaledPlayerSpeed(): number {
  return PLAYER_SPEED * (1 + (WORLD_SCALE - 1) * 0.45);
}

export const SEA_LEVEL = -3.35;
export const DISTANT_ISLAND_COUNT = 18;
export const TERRAIN_SEGMENTS = 96;
export const DISTANT_TERRAIN_SEGMENTS = 32;
export const DISTANT_TERRAIN_VERTEX_COUNT = DISTANT_TERRAIN_SEGMENTS + 1;
export const DISTANT_WALK_LOCAL_RADIUS = 1.02;
export const PLAYER_SPEED = 13;
export const PENDING_GENERATION_FALLBACK_MS = 3 * 60 * 1000;
export const TERRAIN_VERTEX_COUNT = TERRAIN_SEGMENTS + 1;
export const TERRAIN_SCULPT_RADIUS = 6.2;
export const TERRAIN_SCULPT_STEP = 0.72;

// Chunked-world tiling (worldId starts with "chunked-"). INDEPENDENT of the legacy
// single-grid TERRAIN_SEGMENTS; a chunk is its own 64-seg / 65-vtx square tile.
export const CHUNK_SEGMENTS = 64;
export const CHUNK_VERTEX_COUNT = CHUNK_SEGMENTS + 1; // 65 -> 4225 verts
export const CHUNK_SPAN = 96; // world-units per chunk side
export const CHUNK_UNIT = CHUNK_SPAN / CHUNK_SEGMENTS; // 1.5 world-units / segment
export const CHUNK_LOAD_RADIUS = 2; // chunks fetched/built around the center chunk (5x5)
export const CHUNK_KEEP_RADIUS = 3; // evict chunks beyond this (hysteresis vs. load radius)
export const CHUNK_LOD_NEAR_RADIUS = 1; // <= this radius -> full 64-seg; beyond -> decimated
export const CHUNK_LOD_FAR_SEGMENTS = 16; // distant chunks decimate 64 -> 16 (stride 4)

export function isChunkedWorldId(worldId: string): boolean {
  return worldId.startsWith("chunked-");
}

export function canonicalWorldId(worldId: string): string {
  const trimmed = worldId.trim();
  if (!trimmed) return trimmed;
  if (
    trimmed.startsWith("chunked-") ||
    trimmed.startsWith("tiles-") ||
    trimmed.startsWith("interior-") ||
    trimmed.startsWith("evoflow-")
  ) {
    return trimmed;
  }
  const slug = trimmed
    .toLowerCase()
    .replace(/^classic[-_]/, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `chunked-64-${slug || "world"}`;
}

// World dimensions (in chunks) learned from the /chunks manifest on chunked-world load. Lets the
// renderer upper-clamp the load ring (no fetches past the world edge) and the spawn land at world
// CENTER instead of the corner (origin is a corner for chunked worlds, not the island centre).
let chunkedWorldChunks: { w: number; h: number } | null = null;
export function setChunkedWorldChunks(v: { w: number; h: number } | null): void {
  chunkedWorldChunks = v;
}
export function getChunkedWorldChunks(): { w: number; h: number } | null {
  return chunkedWorldChunks;
}
export function chunkedWorldCenter(): { x: number; z: number } | null {
  if (!chunkedWorldChunks) return null;
  return {
    x: (chunkedWorldChunks.w * CHUNK_SPAN) / 2,
    z: (chunkedWorldChunks.h * CHUNK_SPAN) / 2,
  };
}

export const SKYBOX_FALLBACK_URLS = [
  "/skybox/free_-_skybox_basic_sky.glb",
  "/skybox/skybox_skydays_3.glb",
  "/skybox/free_-_skybox_in_the_cloud.glb",
  "/skybox/free_-_skybox_in_the_cloud/scene.gltf",
  "/skybox/tellus-storm-ocean/scene.gltf",
  "/skybox/tellus-desert-sunset/scene.gltf",
  "/skybox/tellus-alien-rings/scene.gltf",
  "/skybox/tellus-aurora-sky/scene.gltf",
];
export const SKYBOX_VERTICAL_OFFSET = 0;
export const DEFAULT_DAY_NIGHT_CYCLE_MS = 10 * 60 * 1000;
export const DEFAULT_DAY_NIGHT_START = 0.18;
export const MIN_DAY_NIGHT_CYCLE_MS = 60_000;
export const MOON_MODEL_URL = "/moon/moon.glb";
export const MOON_DISTANCE = 124;
export const MOON_SIZE = 26;
export const MOON_ARC_AZIMUTH = 0.54;
export const MOON_ARC_LATERAL_SWAY = 0.58;

export const PIXEL3D_PROVIDER = "pixel3d-gradio";

export const generationProviderLabels: Record<GenerationProvider, string> = {
  local: "Local placeholder",
  "asset-forge": "Pixel3D legacy",
  "instantmesh-gradio": "Fast asset",
  "pixal3d-gradio": "High quality",
  "anigen-gradio": "Animated",
};
export const instantMeshTargetLabels: Record<InstantMeshTarget, string> = {
  dgx: "DGX",
  local: "Local",
};
export const terrainColors: Record<TerrainKind, THREE.Color> = {
  meadow: new THREE.Color(0x76985a),
  grass: new THREE.Color(0x9fa657),
  rock: new THREE.Color(0x6f7467),
  snow: new THREE.Color(0xd4e7e2),
  beach: new THREE.Color(0xf6dcbd),
  dirt: new THREE.Color(0x8a7241),
  "forest-floor": new THREE.Color(0x3c2f22),
  flowers: new THREE.Color(0x6daa35),
  gravel: new THREE.Color(0x77766c),
  "jungle-moss": new THREE.Color(0x4f9a3a),
  stone: new THREE.Color(0x8c8d86),
  brick: new THREE.Color(0x9b4e3d),
  "desert-sand": new THREE.Color(0xd98f45),
  water: new THREE.Color(0x256f92),
};

export const terrainPaintKinds = [
  "meadow",
  "beach",
  "dirt",
  "rock",
  "snow",
  "flowers",
  "stone",
  "brick",
  "grass",
  "gravel",
  "forest-floor",
  "jungle-moss",
  "desert-sand",
] as const satisfies readonly TerrainPaintKind[];

export const waterMountTerms = [
  "dolphin",
  "porpoise",
  "orca",
  "whale",
  "sea turtle",
  "giant turtle",
  "hippocampus",
  "seahorse mount",
];

export const airMountTerms = [
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

export const groundMountTerms = [
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
