import * as THREE from "three";
import type {
  TerrainKind,
  TerrainPaintKind,
  TerrainEditMode,
  Vec3,
  GeneratedThing,
  DistantIslandSpec,
  VehicleMode,
} from "./tellus-types";
import {
  WORLD_RADIUS,
  WORLD_SCALE,
  CLASSIC_WORLD_RADIUS,
  OCEAN_RADIUS,
  SEA_LEVEL,
  DISTANT_ISLAND_COUNT,
  TERRAIN_SEGMENTS,
  DISTANT_TERRAIN_SEGMENTS,
  DISTANT_TERRAIN_VERTEX_COUNT,
  CENTRAL_WALK_RADIUS,
  DISTANT_WALK_LOCAL_RADIUS,
  PENDING_GENERATION_FALLBACK_MS,
  POND_CENTER,
  TERRAIN_VERTEX_COUNT,
  setChunkedWorldChunks,
  setClassicPondShape,
  terrainColors,
  terrainPaintKinds,
  waterMountTerms,
  airMountTerms,
  groundMountTerms,
} from "./tellus-constants";
import { clamp, rand, isRecord, promptIncludesAny } from "./tellus-utils";
import { runtimeConfig } from "./tellus-runtime-config";
import {
  tellusApiUrl,
  tellusWorldHttpUrl,
  tellusWorldChunksManifestUrl,
  tellusVisitorId,
} from "./tellus-urls-identity";
import {
  type TellusTerrainState,
  type WorldGeneratedThing,
  type WorldPresence,
  type WorldPatch,
  isTellusTerrainState,
  isWorldGeneratedThing,
} from "./world-protocol";
import {
  parseWorldTemplateId,
  resolveLandShapeConfig,
} from "./tellus-world-templates";
import type {
  LandShapeOverrides,
  WorldTemplateId,
} from "./tellus-types";

export const terrainSculptOffsets = new Float32Array(
  TERRAIN_VERTEX_COUNT * TERRAIN_VERTEX_COUNT,
);
export const terrainPaint = new Uint8Array(TERRAIN_VERTEX_COUNT * TERRAIN_VERTEX_COUNT);
export let terrainSaveTimer: number | undefined;
export let terrainStateDirty = false;
export let terrainStateLoaded = false;
export let terrainStateRevision = 0;
export let tellusWorldBackendAvailable = false;

// Chunked worlds have NO radial island — they're a flat tiled plane (chunk base y=0) + per-chunk
// sculpts. When set (non-null), grounding ignores the classic origin-centred island math and returns
// this flat base, so the player stands ON the chunk terrain (y=0 is above SEA_LEVEL=-3.35) at the
// world centre instead of sinking into the origin ocean. Null = classic single-grid world.
// (Walking the sculpted height is a later refinement; alpha walks the flat base.)
let chunkedFlatGround: number | null = null;
export function setChunkedFlatGround(y: number | null): void {
  chunkedFlatGround = y;
}

// Optional sculpted-height sampler for chunked worlds: returns the actual chunk heightfield at
// (x,z) where that chunk is loaded, or null to fall back to the flat base. Only consulted in
// chunked mode (chunkedFlatGround !== null). main.tsx wires this to the ChunkRenderer.
let chunkedHeightProvider: ((x: number, z: number) => number | null) | null = null;
export function setChunkedHeightProvider(
  fn: ((x: number, z: number) => number | null) | null,
): void {
  chunkedHeightProvider = fn;
}

// Chunked grounding height: the sampled sculpted height where a chunk is loaded, else the flat base.
function chunkedGroundY(x: number, z: number): number {
  return chunkedHeightProvider?.(x, z) ?? (chunkedFlatGround as number);
}

/// Learn a chunked world's dimensions from the /chunks manifest, then arm the chunk bounds (renderer
/// upper-clamp + spawn-centring) and flat grounding. For a classic world it clears both. Best-effort:
/// a manifest miss still streams (no upper clamp) and still grounds flat.
export async function loadChunkedWorldBounds(): Promise<void> {
  if (!runtimeConfig.worldId.startsWith("chunked-")) {
    setChunkedWorldChunks(null);
    setChunkedFlatGround(null);
    setChunkedHeightProvider(null);
    return;
  }
  try {
    const res = await fetch(tellusWorldChunksManifestUrl(0, 0, 0), { cache: "no-store" });
    if (res.ok) {
      const m = await res.json();
      if (typeof m?.width === "number" && typeof m?.height === "number") {
        setChunkedWorldChunks({ w: m.width, h: m.height });
      }
    }
  } catch {
    /* ignore — the streamer still works, just without an edge clamp */
  }
  setChunkedFlatGround(0);
}

let activeTemplate: WorldTemplateId = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
let activeLandShape = resolveLandShapeConfig(
  activeTemplate,
  runtimeConfig.landShape,
);
setClassicPondShape(
  activeLandShape.pond.x,
  activeLandShape.pond.z,
  activeLandShape.pond.radius,
);

export function applyWorldTerrainTemplate(
  template: WorldTemplateId,
  overrides?: LandShapeOverrides,
): void {
  activeTemplate = template;
  activeLandShape = resolveLandShapeConfig(template, overrides);
  setClassicPondShape(
    activeLandShape.pond.x,
    activeLandShape.pond.z,
    activeLandShape.pond.radius,
  );
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return fade(t);
}

function hash2(x: number, z: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return (ab + (cd - ab) * tz) * 2 - 1;
}

function fbm2(x: number, z: number, octaves: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise2(x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return norm > 0 ? total / norm : 0;
}

function terrainDetailHeight(cx: number, cz: number, r: number): number {
  const detail = activeLandShape.detail;
  if (detail.amplitude <= 0 && detail.ridgeAmplitude <= 0 && detail.terraceAmplitude <= 0) {
    return 0;
  }

  const shoreFade = 1 - smoothstep(
    CLASSIC_WORLD_RADIUS * activeLandShape.shore.startRatio,
    CLASSIC_WORLD_RADIUS * 0.98,
    r,
  );
  const pondDistance = Math.hypot(cx - activeLandShape.pond.x, cz - activeLandShape.pond.z);
  const pondFade = smoothstep(
    activeLandShape.pond.radius * 0.72,
    activeLandShape.pond.radius * 1.65,
    pondDistance,
  );
  const landMask = shoreFade * pondFade;
  if (landMask <= 0.001) return 0;

  const warpA = fbm2(cx * detail.scale * 0.55 + 31.7, cz * detail.scale * 0.55 - 14.2, 3);
  const warpB = fbm2(cx * detail.scale * 0.55 - 8.1, cz * detail.scale * 0.55 + 27.4, 3);
  const wx = cx + warpA * detail.warp;
  const wz = cz + warpB * detail.warp;

  const macro = fbm2(wx * detail.scale, wz * detail.scale, 5) * detail.amplitude;
  const micro = fbm2(wx * detail.scale * 2.7 + 7.5, wz * detail.scale * 2.7 - 19.5, 3) *
    detail.amplitude *
    0.32;
  const ridgeNoise = fbm2(wx * detail.scale * 1.45 - 41, wz * detail.scale * 1.45 + 18, 4);
  const ridgeFold = (1 - Math.abs(ridgeNoise)) * 2 - 1;
  const ridges = ridgeFold * detail.ridgeAmplitude;
  const terraceBase = macro + ridges * 0.45;
  const terraces =
    Math.sin(terraceBase * detail.terraceFrequency) * detail.terraceAmplitude;

  return (macro + micro + ridges + terraces) * landMask;
}

export function terrainPaintCode(kind: TerrainPaintKind): number {
  return terrainPaintKinds.indexOf(kind) + 1;
}

export function terrainPaintKindFromCode(code: number): TerrainPaintKind | null {
  return terrainPaintKinds[code - 1] ?? null;
}

export function isTerrainPaintMode(mode: TerrainEditMode): mode is TerrainPaintKind {
  return terrainPaintKinds.includes(mode as TerrainPaintKind);
}

export function terrainVertexColor(
  kind: TerrainKind,
  x: number,
  z: number,
  seed: number,
): THREE.Color {
  const color = terrainColors[kind].clone();
  if (kind === "flowers") {
    const fleck = rand(seed * 7 + 2309);
    if (fleck > 0.92) return new THREE.Color(0xffd36a);
    if (fleck > 0.84) return new THREE.Color(0xf2a6cc);
    if (fleck > 0.78) return new THREE.Color(0xc8dfff);
    color.lerp(new THREE.Color(0x89b84a), 0.35);
  } else if (kind === "rock") {
    const pebble = rand(seed * 5 + 7919);
    color.lerp(
      pebble > 0.66 ? new THREE.Color(0xa8956a) : new THREE.Color(0x46505a),
      0.24,
    );
  }
  const noise = 0.9 + rand(seed + Math.floor(x * 13) + Math.floor(z * 17)) * 0.18;
  return color.multiplyScalar(noise);
}

export function terrainGridIndex(xIndex: number, zIndex: number): number {
  return zIndex * TERRAIN_VERTEX_COUNT + xIndex;
}

export function distantTerrainGridIndex(xIndex: number, zIndex: number): number {
  return zIndex * DISTANT_TERRAIN_VERTEX_COUNT + xIndex;
}

export function terrainSculptOffsetAt(x: number, z: number): number {
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

export function centralTerrainGridCoords(
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

export function centralTerrainPaintAt(x: number, z: number): TerrainPaintKind | null {
  const { xIndex, zIndex } = centralTerrainGridCoords(x, z);
  return terrainPaintKindFromCode(terrainPaint[terrainGridIndex(xIndex, zIndex)]);
}

export function distantIslandLocalPoint(
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

export function distantIslandWorldPoint(
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

export function createDistantIslandSpec(index: number): DistantIslandSpec {
  const seed = 1800 + index * 43;
  const angle =
    (index / DISTANT_ISLAND_COUNT) * Math.PI * 2 + rand(900 + index) * 0.32;
  // The archipelago ring scales with the world (else a large island would swallow it).
  const distance = (58 + rand(1400 + index) * 72) * WORLD_SCALE;
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

export let distantIslandSpecs = Array.from(
  { length: DISTANT_ISLAND_COUNT },
  (_, index) => createDistantIslandSpec(index),
);

/** Rebuild the archipelago for the current world scale (call AFTER setWorldScale, BEFORE the world
 * loads — saved island sculpts are re-applied on top by the subsequent state load). */
export function rebuildDistantIslandSpecs(): void {
  distantIslandSpecs = Array.from(
    { length: DISTANT_ISLAND_COUNT },
    (_, index) => createDistantIslandSpec(index),
  );
}

export function distantIslandLocalRadius(
  spec: DistantIslandSpec,
  x: number,
  z: number,
): number {
  const { x: localX, z: localZ } = distantIslandLocalPoint(spec, x, z);
  const radiusX = spec.bottomRadius * 0.92;
  const radiusZ = radiusX * spec.scaleZ;
  return Math.hypot(localX / radiusX, localZ / radiusZ);
}

export function distantIslandSculptOffsetAt(
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

export function distantIslandGridWorldPoint(
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

export function distantTerrainGridCoords(
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

export function distantTerrainPaintAt(
  spec: DistantIslandSpec,
  x: number,
  z: number,
): TerrainPaintKind | null {
  const { xIndex, zIndex } = distantTerrainGridCoords(spec, x, z);
  return terrainPaintKindFromCode(
    spec.paint[distantTerrainGridIndex(xIndex, zIndex)],
  );
}

export function nearestDistantIsland(
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

export function distantIslandHeight(spec: DistantIslandSpec, x: number, z: number): number {
  const localRadius = clamp(distantIslandLocalRadius(spec, x, z), 0, 1);
  const crown = Math.pow(1 - localRadius, 1.75) * spec.height * 0.72;
  return SEA_LEVEL + 0.28 + crown + distantIslandSculptOffsetAt(spec, x, z);
}

export function groundedPosition(x: number, z: number, fallback?: Vec3): Vec3 {
  if (chunkedFlatGround !== null) return { x, y: chunkedGroundY(x, z), z };
  if (Math.hypot(x, z) <= CENTRAL_WALK_RADIUS) {
    return { x, y: terrainHeight(x, z), z };
  }
  const distantIsland = nearestDistantIsland(x, z, DISTANT_WALK_LOCAL_RADIUS);
  if (distantIsland) {
    return { x, y: distantIslandHeight(distantIsland, x, z), z };
  }
  return fallback ? { ...fallback } : normalizedDiscPosition(x, z);
}

export function groundHeightAt(x: number, z: number): number | null {
  if (chunkedFlatGround !== null) return chunkedGroundY(x, z);
  if (Math.hypot(x, z) <= CENTRAL_WALK_RADIUS) return terrainHeight(x, z);
  const distantIsland = nearestDistantIsland(x, z, DISTANT_WALK_LOCAL_RADIUS);
  return distantIsland ? distantIslandHeight(distantIsland, x, z) : null;
}

export function isIntentionallyElevated(thing: GeneratedThing): boolean {
  const groundY = groundHeightAt(thing.position.x, thing.position.z);
  return groundY !== null && thing.position.y > groundY + 0.35;
}

export function normalizedDiscPosition(x: number, z: number): Vec3 {
  if (chunkedFlatGround !== null) return { x, y: chunkedGroundY(x, z), z };
  const radius = Math.hypot(x, z);
  if (radius <= CENTRAL_WALK_RADIUS) {
    return { x, y: terrainHeight(x, z), z };
  }
  const scale = CENTRAL_WALK_RADIUS / radius;
  const nx = x * scale;
  const nz = z * scale;
  return { x: nx, y: terrainHeight(nx, nz), z: nz };
}

export function oceanPosition(x: number, z: number): Vec3 {
  const radius = Math.hypot(x, z);
  const maxRadius = OCEAN_RADIUS - 12;
  if (radius <= maxRadius) return { x, y: SEA_LEVEL + 0.14, z };
  const scale = maxRadius / radius;
  return { x: x * scale, y: SEA_LEVEL + 0.14, z: z * scale };
}

export function waterBlockedByLand(position: Vec3): boolean {
  if (Math.hypot(position.x, position.z) < WORLD_RADIUS + 1.2) return true;
  return Boolean(nearestDistantIsland(position.x, position.z, 1.08));
}

export function waterVehiclePosition(x: number, z: number, fallback?: Vec3): Vec3 {
  const position = oceanPosition(x, z);
  if (!waterBlockedByLand(position)) return position;
  return fallback ? { ...fallback } : oceanPosition(WORLD_RADIUS + 5, 0);
}

export function distantIslandShorePosition(spec: DistantIslandSpec, x: number, z: number): Vec3 {
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

export function vehicleMode(thing: GeneratedThing): VehicleMode | null {
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

export function isMountThing(thing: GeneratedThing): boolean {
  return thing.kind === "animal" && vehicleMode(thing) !== null;
}

export function isVehicleThing(thing: GeneratedThing): boolean {
  return vehicleMode(thing) !== null;
}

export function isFreeMovingVehicle(thing: GeneratedThing): boolean {
  const mode = vehicleMode(thing);
  return mode === "water" || mode === "air";
}

export function airPosition(x: number, z: number): Vec3 {
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

export function movedVehiclePosition(
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

export function baseTerrainHeight(x: number, z: number): number {
  // Classic-space transform: the feature math always runs at the classic 72-radius scale, so on a
  // scaled-up world the mountain/ridge/pond stretch with the island (heights unchanged). The Hyades
  // server's terrain port applies the IDENTICAL transform — keep the two in lockstep.
  const cx = x / WORLD_SCALE;
  const cz = z / WORLD_SCALE;
  const shape = activeLandShape;
  const r = Math.hypot(cx, cz);
  const mountain = Math.max(0, 1 - r / shape.mountain.radius);
  const mound = Math.pow(mountain, shape.mountain.exponent) * shape.mountain.height;
  const shoulder =
    Math.exp(
      -((cx - shape.shoulder.x) ** 2 + (cz - shape.shoulder.z) ** 2) /
      shape.shoulder.radius,
    ) * shape.shoulder.height;
  const southernRise =
    Math.exp(
      -((cx - shape.southernRise.x) ** 2 + (cz - shape.southernRise.z) ** 2) /
      shape.southernRise.radius,
    ) * shape.southernRise.height;
  const ridge =
    Math.sin(cx * 0.22 + cz * 0.08) * shape.ridge.sinScale +
    Math.cos(cz * 0.2 - cx * 0.06) * shape.ridge.cosScale +
    Math.sin((cx + cz) * 0.11) * shape.ridge.diagonalScale;
  const rimStart = CLASSIC_WORLD_RADIUS * shape.shore.startRatio;
  const rimWidth = CLASSIC_WORLD_RADIUS * shape.shore.widthRatio;
  const rimDrop = Math.max(0, (r - rimStart) / rimWidth) * shape.shore.drop;
  const pond =
    Math.exp(
      -((cx - shape.pond.x) ** 2 + (cz - shape.pond.z) ** 2) /
      shape.pond.falloff,
    ) * shape.pond.depth;
  const detail = terrainDetailHeight(cx, cz, r);
  return mound + shoulder + southernRise + ridge + detail - rimDrop - pond + shape.baseOffset;
}

export function terrainHeight(x: number, z: number): number {
  return baseTerrainHeight(x, z) + terrainSculptOffsetAt(x, z);
}

export function terrainKind(x: number, z: number, y: number): TerrainKind {
  const painted = centralTerrainPaintAt(x, z);
  if (painted) return painted;
  // Classic-space: kind bands follow the scaled island features (matches the server port).
  const cx = x / WORLD_SCALE;
  const cz = z / WORLD_SCALE;
  const pondDistance = Math.hypot(cx - activeLandShape.pond.x, cz - activeLandShape.pond.z);
  if (pondDistance < activeLandShape.pond.radius && y < 1.9) return "water";
  if (y > 13.5) return "snow";
  if (y > 6.8) return "rock";
  const pathBand = Math.abs(Math.sin(Math.atan2(cz, cx) * 3 + 0.5)) < 0.13;
  if (pathBand && Math.hypot(cx, cz) > 8) return "dirt";
  return "meadow";
}

export function pondWaterLevel(): number {
  return baseTerrainHeight(POND_CENTER.x, POND_CENTER.z) + 0.55;
}

export function terrainOffsetsPayload(): number[] {
  return Array.from(terrainSculptOffsets, (value) => Number(value.toFixed(4)));
}

export function terrainPaintPayload(): number[] {
  return Array.from(terrainPaint);
}

export function distantTerrainOffsetsPayload(): Record<string, number[]> {
  return Object.fromEntries(
    distantIslandSpecs.map((spec) => [
      String(spec.seed),
      Array.from(spec.sculptOffsets, (value) => Number(value.toFixed(4))),
    ]),
  );
}

export function distantTerrainPaintPayload(): Record<string, number[]> {
  return Object.fromEntries(
    distantIslandSpecs.map((spec) => [String(spec.seed), Array.from(spec.paint)]),
  );
}

export function tellusState(): TellusTerrainState {
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

export function tellusStatePayload(): string {
  return JSON.stringify(tellusState());
}

export function terrainStorageKey(): string {
  return `tellus.terrain.${runtimeConfig.worldId}`;
}

export function isResetTerrainState(value: unknown): boolean {
  return isRecord(value) && value.savedAt === "reset-after-smoke";
}

export function saveTerrainStateLocally(body: string): void {
  try {
    window.localStorage.setItem(terrainStorageKey(), body);
  } catch (error) {
    console.warn("Tellus local terrain save failed", error);
  }
}

export function loadTerrainStateLocally(): TellusTerrainState | null {
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

export function applyTellusTerrainState(parsed: unknown): boolean {
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

export function terrainFromWorldPatch(parsed: unknown): TellusTerrainState | null {
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

export function presenceFromWorldPatch(parsed: unknown): WorldPresence[] | null {
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

export function generatedFromWorldPatch(parsed: unknown): WorldGeneratedThing[] | null {
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

export let initialWorldGeneratedThings: WorldGeneratedThing[] = [];

export async function loadTellusWorldState(): Promise<boolean> {
  if (!runtimeConfig.worldApiBase) return false;
  const response = await fetch(tellusWorldHttpUrl("state"), { cache: "no-store" });
  if (!response.ok) return false;
  const parsed = await response.json();

  // Chunked worlds serve terrain per-chunk (state.terrain === null). A 200 means the world
  // backend is live: extract generated things, skip the single-grid terrain apply, and let
  // the chunk streamer take over. tellusWorldBackendAvailable=true keeps /live + saves working.
  if (runtimeConfig.worldId.startsWith("chunked-")) {
    initialWorldGeneratedThings = generatedFromWorldPatch(parsed) ?? [];
    return true;
  }

  const terrain = terrainFromWorldPatch(parsed);
  if (!terrain) return false;
  initialWorldGeneratedThings = generatedFromWorldPatch(parsed) ?? [];
  applyTellusTerrainState(terrain);
  return true;
}

export async function saveTellusWorldState(body: string, keepalive = false): Promise<boolean> {
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

export async function loadTellusState(): Promise<void> {
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

export function saveTellusStateSoon(): void {
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

export function saveTellusStateNow(): void {
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

export function isStalePendingGeneratedThing(thing: WorldGeneratedThing): boolean {
  if (thing.modelUrl) return false;
  if (
    thing.generationStatus !== "queued" &&
    thing.generationStatus !== "generating"
  ) {
    return false;
  }
  const updatedAt = Date.parse(thing.updatedAt);
  return (
    Number.isFinite(updatedAt) &&
    Date.now() - updatedAt > PENDING_GENERATION_FALLBACK_MS
  );
}

// Setters for the two mutable flags that main.tsx also reassigns (an imported binding can't be
// assigned directly across modules).
export function setTerrainStateDirty(value: boolean): void {
  terrainStateDirty = value;
}
export function setInitialWorldGeneratedThings(value: WorldGeneratedThing[]): void {
  initialWorldGeneratedThings = value;
}
