/**
 * tellus-building.ts — TELLUS INFINITY interior building geometry (Track B).
 *
 * Generates real, multi-surface interior rooms (floor slabs, perimeter walls with a doorway gap,
 * a stepped staircase connecting levels, ceiling, a warm light) as a single THREE.Group. The
 * physics layer (Track A, runs AFTER this) bakes the solid surfaces into a Rapier trimesh so the
 * room is walkable — including up the stairs between levels.
 *
 * SHARED INTERFACE CONTRACT (honored by both tracks — do NOT deviate):
 *   - Every solid surface mesh (floor / wall / stair / ramp) carries mesh.userData.collide === true.
 *     Track A traverses the group and extracts the WORLD-SPACE geometry of exactly those meshes as a
 *     static trimesh collider. Meshes without userData.collide (lights, decorative ceiling) are
 *     visual-only and are NOT collided.
 *   - Plain THREE.MeshStandardMaterial only (WebGL-safe — no TSL / WebGPU node materials).
 *   - Deterministic from `spec.seed` (same seed ⇒ byte-identical layout).
 *
 * This file is self-contained: it only imports `three`. It does NOT touch tellus-rapier-physics.ts.
 */
import * as THREE from "three";

/** Spec for {@link generateInteriorRoom}. All fields optional; deterministic from `seed`. */
export interface InteriorRoomSpec {
  /** Deterministic seed; same seed ⇒ identical room. Default 1. */
  seed?: number;
  /** Interior width (X span, metres). Default 16. */
  width?: number;
  /** Interior depth (Z span, metres). Default 16. */
  depth?: number;
  /** Number of walkable floor levels. 1 = single room; >1 adds a staircase. Default 1. */
  levels?: number;
  /** Force-enable the staircase even at a single level (mostly for testing). Default: levels > 1. */
  stairs?: boolean;
  /** Real-world biome/material language for generated floors, walls, trim, and stairs. */
  biome?: InteriorBiomeMaterial | string;
}

export type InteriorBiomeMaterial =
  | "tropical-rain-forest"
  | "temperate-rain-forest"
  | "desert"
  | "tundra"
  | "taiga"
  | "grassland"
  | "savanna"
  | "estuary"
  | "coastal";

interface InteriorTextureSet {
  color: string;
  normal: string;
  roughness: string;
  repeat: readonly [number, number];
  normalScale: number;
}

interface InteriorMaterialSlot {
  color: number;
  roughness: number;
  texture?: InteriorTextureSet;
}

interface InteriorMaterialPalette {
  floor: InteriorMaterialSlot;
  wall: InteriorMaterialSlot;
  stair: InteriorMaterialSlot;
  trim: InteriorMaterialSlot;
  ceiling: InteriorMaterialSlot;
  light: number;
}

export const INTERIOR_BIOME_MATERIALS: readonly InteriorBiomeMaterial[] = [
  "tropical-rain-forest",
  "temperate-rain-forest",
  "desert",
  "tundra",
  "taiga",
  "grassland",
  "savanna",
  "estuary",
  "coastal",
] as const;

/** Marker key Track A reads to decide which meshes become static colliders. */
export const COLLIDE_FLAG = "collide" as const;

/** Tag a mesh as a SOLID surface (floor/wall/stair/ramp). Track A collides exactly these. */
function markSolid(mesh: THREE.Mesh): THREE.Mesh {
  mesh.userData[COLLIDE_FLAG] = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Small deterministic PRNG (mulberry32) so a seed yields a stable layout. */
function makeRng(seed: number): () => number {
  let a = seed | 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per-level vertical rise (metres) — also the ceiling height of a single-level room. */
const LEVEL_HEIGHT = 4;
/** Wall / floor slab thickness (metres). */
const SLAB = 0.3;
/** Doorway gap width in the entrance wall (metres) — the visitor enters here. */
const DOOR_WIDTH = 2.4;
/** Doorway clearance height (metres). */
const DOOR_HEIGHT = 3;
/** Window opening size (metres). */
const WINDOW_WIDTH = 2.4;
const WINDOW_HEIGHT = 1.35;
const WINDOW_BOTTOM = 1.35;

const INTERIOR_TEXTURE_BASE = "/textures/interiors";
const INTERIOR_TEXTURES = {
  woodFloor: {
    color: `${INTERIOR_TEXTURE_BASE}/WoodFloor051_1K-PNG_Color.png`,
    normal: `${INTERIOR_TEXTURE_BASE}/WoodFloor051_1K-PNG_NormalGL.png`,
    roughness: `${INTERIOR_TEXTURE_BASE}/WoodFloor051_1K-PNG_Roughness.png`,
    repeat: [5.5, 5.5] as const,
    normalScale: 0.55,
  },
  lightWood: {
    color: `${INTERIOR_TEXTURE_BASE}/Wood092_1K-PNG_Color.png`,
    normal: `${INTERIOR_TEXTURE_BASE}/Wood092_1K-PNG_NormalGL.png`,
    roughness: `${INTERIOR_TEXTURE_BASE}/Wood092_1K-PNG_Roughness.png`,
    repeat: [2.6, 2.6] as const,
    normalScale: 0.42,
  },
  splitfaceStone: {
    color: `${INTERIOR_TEXTURE_BASE}/StoneBricksSplitface001_COL_1K.jpg`,
    normal: `${INTERIOR_TEXTURE_BASE}/StoneBricksSplitface001_NRM_1K.jpg`,
    roughness: `${INTERIOR_TEXTURE_BASE}/StoneBricksSplitface001_ROUGH_1K.jpg`,
    repeat: [3.4, 1.8] as const,
    normalScale: 0.32,
  },
  clay: {
    color: `${INTERIOR_TEXTURE_BASE}/Clay002_1K-PNG_Color.png`,
    normal: `${INTERIOR_TEXTURE_BASE}/Clay002_1K-PNG_NormalGL.png`,
    roughness: `${INTERIOR_TEXTURE_BASE}/Clay002_1K-PNG_Roughness.png`,
    repeat: [3.2, 2.2] as const,
    normalScale: 0.22,
  },
  plaster: {
    color: `${INTERIOR_TEXTURE_BASE}/PaintedPlaster017_1K-PNG_Color.png`,
    normal: `${INTERIOR_TEXTURE_BASE}/PaintedPlaster017_1K-PNG_NormalGL.png`,
    roughness: `${INTERIOR_TEXTURE_BASE}/PaintedPlaster017_1K-PNG_Roughness.png`,
    repeat: [2.4, 1.6] as const,
    normalScale: 0.18,
  },
  bamboo: {
    color: `${INTERIOR_TEXTURE_BASE}/Bamboo001B_1K-PNG_Color.png`,
    normal: `${INTERIOR_TEXTURE_BASE}/Bamboo001B_1K-PNG_NormalGL.png`,
    roughness: `${INTERIOR_TEXTURE_BASE}/Bamboo001B_1K-PNG_Roughness.png`,
    repeat: [2.4, 2.4] as const,
    normalScale: 0.38,
  },
  thatch: {
    color: `${INTERIOR_TEXTURE_BASE}/ThatchedRoof001A_1K-PNG_Color.png`,
    normal: `${INTERIOR_TEXTURE_BASE}/ThatchedRoof001A_1K-PNG_NormalGL.png`,
    roughness: `${INTERIOR_TEXTURE_BASE}/ThatchedRoof001A_1K-PNG_Roughness.png`,
    repeat: [3.8, 2.4] as const,
    normalScale: 0.42,
  },
  woodSiding: {
    color: `${INTERIOR_TEXTURE_BASE}/WoodSiding002_1K-PNG_Color.png`,
    normal: `${INTERIOR_TEXTURE_BASE}/WoodSiding002_1K-PNG_NormalGL.png`,
    roughness: `${INTERIOR_TEXTURE_BASE}/WoodSiding002_1K-PNG_Roughness.png`,
    repeat: [2.2, 1.7] as const,
    normalScale: 0.34,
  },
};

const interiorTextureCache = new Map<string, THREE.Texture>();

let interiorTextureLoader: THREE.TextureLoader | null = null;

function canLoadInteriorTextures(): boolean {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

function textureLoader(): THREE.TextureLoader | null {
  if (!canLoadInteriorTextures()) return null;
  interiorTextureLoader ??= new THREE.TextureLoader();
  return interiorTextureLoader;
}

function loadInteriorTexture(
  url: string,
  repeat: readonly [number, number],
  colorMap = false,
): THREE.Texture | undefined {
  const loader = textureLoader();
  if (!loader) return undefined;
  const key = `${url}|${repeat[0]}x${repeat[1]}|${colorMap ? "srgb" : "linear"}`;
  const cached = interiorTextureCache.get(key);
  if (cached) return cached;
  const texture = loader.load(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  if (colorMap) texture.colorSpace = THREE.SRGBColorSpace;
  interiorTextureCache.set(key, texture);
  return texture;
}

function applyInteriorTextureSet(
  material: THREE.MeshStandardMaterial,
  textureSet?: InteriorTextureSet,
): THREE.MeshStandardMaterial {
  if (!textureSet) return material;
  const colorMap = loadInteriorTexture(
    textureSet.color,
    textureSet.repeat,
    true,
  );
  if (!colorMap) return material;
  material.map = colorMap;
  material.normalMap =
    loadInteriorTexture(textureSet.normal, textureSet.repeat) ?? null;
  material.roughnessMap =
    loadInteriorTexture(textureSet.roughness, textureSet.repeat) ?? null;
  material.normalScale.set(textureSet.normalScale, textureSet.normalScale);
  material.needsUpdate = true;
  return material;
}

export function normalizeInteriorBiomeMaterial(
  value: unknown,
): InteriorBiomeMaterial {
  if (typeof value !== "string") return "temperate-rain-forest";
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (INTERIOR_BIOME_MATERIALS.includes(normalized as InteriorBiomeMaterial)) {
    return normalized as InteriorBiomeMaterial;
  }
  if (
    normalized.includes("tropical") ||
    normalized.includes("bamboo") ||
    normalized.includes("palm")
  ) {
    return "tropical-rain-forest";
  }
  if (
    normalized.includes("temperate") ||
    normalized.includes("forest") ||
    normalized.includes("plaster")
  ) {
    return "temperate-rain-forest";
  }
  if (
    normalized.includes("desert") ||
    normalized.includes("adobe") ||
    normalized.includes("mudbrick") ||
    normalized.includes("dune")
  ) {
    return "desert";
  }
  if (
    normalized.includes("tundra") ||
    normalized.includes("sod") ||
    normalized.includes("hearth")
  ) {
    return "tundra";
  }
  if (
    normalized.includes("taiga") ||
    normalized.includes("boreal") ||
    normalized.includes("log")
  ) {
    return "taiga";
  }
  if (
    normalized.includes("savanna") ||
    normalized.includes("savannah") ||
    normalized.includes("woven")
  ) {
    return "savanna";
  }
  if (
    normalized.includes("grassland") ||
    normalized.includes("thatch") ||
    normalized.includes("wattle")
  ) {
    return "grassland";
  }
  if (
    normalized.includes("estuary") ||
    normalized.includes("marsh") ||
    normalized.includes("delta")
  ) {
    return "estuary";
  }
  if (
    normalized.includes("coast") ||
    normalized.includes("cove") ||
    normalized.includes("beach") ||
    normalized.includes("island")
  ) {
    return "coastal";
  }
  return "temperate-rain-forest";
}

function interiorMaterialPaletteFor(value: unknown): InteriorMaterialPalette {
  const biome = normalizeInteriorBiomeMaterial(value);
  const t = INTERIOR_TEXTURES;
  switch (biome) {
    case "tropical-rain-forest":
      return {
        floor: { color: 0x7c5a32, roughness: 0.9, texture: t.bamboo },
        wall: { color: 0x8a6b3e, roughness: 0.92, texture: t.woodSiding },
        stair: { color: 0x7c5a32, roughness: 0.9, texture: t.bamboo },
        trim: { color: 0x9c7a43, roughness: 0.9, texture: t.thatch },
        ceiling: { color: 0x6e653b, roughness: 0.96, texture: t.thatch },
        light: 0xffd991,
      };
    case "desert":
      return {
        floor: { color: 0xb87849, roughness: 0.98, texture: t.clay },
        wall: { color: 0xc48756, roughness: 0.98, texture: t.clay },
        stair: { color: 0xa9683d, roughness: 0.97, texture: t.clay },
        trim: { color: 0x8f623b, roughness: 0.9, texture: t.lightWood },
        ceiling: { color: 0xbb8055, roughness: 0.98, texture: t.plaster },
        light: 0xffc07a,
      };
    case "tundra":
      return {
        floor: { color: 0x7e7564, roughness: 0.96, texture: t.clay },
        wall: { color: 0x6f6f62, roughness: 0.98, texture: t.plaster },
        stair: { color: 0x6c5d48, roughness: 0.94, texture: t.woodFloor },
        trim: { color: 0x76634d, roughness: 0.94, texture: t.lightWood },
        ceiling: { color: 0x5f5848, roughness: 0.98, texture: t.thatch },
        light: 0xffb36b,
      };
    case "taiga":
      return {
        floor: { color: 0x695035, roughness: 0.9, texture: t.woodFloor },
        wall: { color: 0x6d5539, roughness: 0.92, texture: t.woodSiding },
        stair: { color: 0x5f4a32, roughness: 0.9, texture: t.woodFloor },
        trim: { color: 0x4f3d2c, roughness: 0.9, texture: t.lightWood },
        ceiling: { color: 0x5c5243, roughness: 0.96, texture: t.thatch },
        light: 0xffc985,
      };
    case "grassland":
      return {
        floor: { color: 0x9f7b3b, roughness: 0.94, texture: t.lightWood },
        wall: { color: 0xb8955b, roughness: 0.97, texture: t.plaster },
        stair: { color: 0x8e6b35, roughness: 0.92, texture: t.lightWood },
        trim: { color: 0xb99a54, roughness: 0.96, texture: t.thatch },
        ceiling: { color: 0xa9884c, roughness: 0.98, texture: t.thatch },
        light: 0xffd384,
      };
    case "savanna":
      return {
        floor: { color: 0x9f773a, roughness: 0.94, texture: t.thatch },
        wall: { color: 0xb98f50, roughness: 0.97, texture: t.thatch },
        stair: { color: 0x826034, roughness: 0.92, texture: t.bamboo },
        trim: { color: 0x8a6a38, roughness: 0.92, texture: t.bamboo },
        ceiling: { color: 0xb49255, roughness: 0.98, texture: t.thatch },
        light: 0xffcd7b,
      };
    case "estuary":
      return {
        floor: { color: 0x83664f, roughness: 0.98, texture: t.clay },
        wall: { color: 0x9d8064, roughness: 0.98, texture: t.plaster },
        stair: { color: 0x6f563c, roughness: 0.93, texture: t.woodSiding },
        trim: { color: 0x6c5639, roughness: 0.92, texture: t.bamboo },
        ceiling: { color: 0x80715e, roughness: 0.98, texture: t.thatch },
        light: 0xffc98f,
      };
    case "coastal":
      return {
        floor: { color: 0xa48b61, roughness: 0.9, texture: t.woodFloor },
        wall: { color: 0x9a9d92, roughness: 0.96, texture: t.splitfaceStone },
        stair: { color: 0x8b744f, roughness: 0.9, texture: t.lightWood },
        trim: { color: 0x9b7f52, roughness: 0.88, texture: t.woodSiding },
        ceiling: { color: 0xa8aa9c, roughness: 0.96, texture: t.plaster },
        light: 0xffdda6,
      };
    case "temperate-rain-forest":
    default:
      return {
        floor: { color: 0x80623c, roughness: 0.92, texture: t.woodFloor },
        wall: { color: 0x76736a, roughness: 0.96, texture: t.splitfaceStone },
        stair: { color: 0x725231, roughness: 0.9, texture: t.lightWood },
        trim: { color: 0x6e4c2c, roughness: 0.86, texture: t.lightWood },
        ceiling: { color: 0x8c8878, roughness: 0.96, texture: t.plaster },
        light: 0xffdfaa,
      };
  }
}

function makeInteriorMaterial(
  slot: InteriorMaterialSlot,
): THREE.MeshStandardMaterial {
  return applyInteriorTextureSet(
    new THREE.MeshStandardMaterial({
      color: slot.color,
      roughness: slot.roughness,
      metalness: 0,
    }),
    slot.texture,
  );
}

interface WallOpening {
  center: number;
  width: number;
  bottom: number;
  height: number;
}

interface InteriorOpeningAnchor {
  kind: "door" | "window";
  wall: "-z" | "+z" | "-x" | "+x";
  position: { x: number; y: number; z: number };
  rotationY: number;
  width: number;
  height: number;
}

/**
 * Build a solid box (BoxGeometry) centred at (cx,cy,cz), flagged collidable, with the given material.
 * Returns the mesh so the caller can add it to the room group.
 */
function solidBox(
  sx: number,
  sy: number,
  sz: number,
  cx: number,
  cy: number,
  cz: number,
  mat: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(cx, cy, cz);
  return markSolid(mesh);
}

/** Build a visual-only box (trim, glass, threshold) that never becomes a physics collider. */
function visualBox(
  sx: number,
  sy: number,
  sz: number,
  cx: number,
  cy: number,
  cz: number,
  mat: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addWallPanel(
  out: THREE.Mesh[],
  axis: "x" | "z",
  offset: number,
  from: number,
  to: number,
  bottom: number,
  top: number,
  mat: THREE.Material,
): void {
  const span = to - from;
  const h = top - bottom;
  if (span <= 0.02 || h <= 0.02) return;
  const center = (from + to) / 2;
  const cy = (bottom + top) / 2;
  if (axis === "x") out.push(solidBox(span, h, SLAB, center, cy, offset, mat));
  else out.push(solidBox(SLAB, h, span, offset, cy, center, mat));
}

function openingContains(
  opening: WallOpening,
  pos: number,
  y: number,
): boolean {
  const min = opening.center - opening.width / 2;
  const max = opening.center + opening.width / 2;
  const bottom = opening.bottom;
  const top = opening.bottom + opening.height;
  return pos > min && pos < max && y > bottom && y < top;
}

/**
 * Build one perimeter wall along an axis, leaving a centred doorway gap when `doorway` is set.
 * The wall runs the full `length` on the given axis at fixed `offset` on the other horizontal axis.
 *   axis "x" → wall spans X, sits at z = offset (a wall on the -Z/+Z side).
 *   axis "z" → wall spans Z, sits at x = offset (a wall on the -X/+X side).
 * Pushes the resulting mesh(es) into `out`.
 */
function addWall(
  out: THREE.Mesh[],
  axis: "x" | "z",
  offset: number,
  length: number,
  baseY: number,
  height: number,
  mat: THREE.Material,
  doorway: boolean,
  openings: WallOpening[] = [],
): void {
  const wallOpenings = doorway
    ? [
        { center: 0, width: DOOR_WIDTH, bottom: baseY, height: DOOR_HEIGHT },
        ...openings,
      ]
    : openings;
  if (wallOpenings.length === 0) {
    if (axis === "x")
      out.push(
        solidBox(length, height, SLAB, 0, baseY + height / 2, offset, mat),
      );
    else
      out.push(
        solidBox(SLAB, height, length, offset, baseY + height / 2, 0, mat),
      );
    return;
  }

  const minPos = -length / 2;
  const maxPos = length / 2;
  const minY = baseY;
  const maxY = baseY + height;
  const posCuts = [minPos, maxPos];
  const yCuts = [minY, maxY];
  for (const opening of wallOpenings) {
    posCuts.push(
      Math.max(minPos, opening.center - opening.width / 2),
      Math.min(maxPos, opening.center + opening.width / 2),
    );
    yCuts.push(
      Math.max(minY, opening.bottom),
      Math.min(maxY, opening.bottom + opening.height),
    );
  }
  const positions = Array.from(new Set(posCuts)).sort((a, b) => a - b);
  const ys = Array.from(new Set(yCuts)).sort((a, b) => a - b);

  for (let pi = 0; pi < positions.length - 1; pi++) {
    for (let yi = 0; yi < ys.length - 1; yi++) {
      const from = positions[pi];
      const to = positions[pi + 1];
      const bottom = ys[yi];
      const top = ys[yi + 1];
      const center = (from + to) / 2;
      const cy = (bottom + top) / 2;
      if (wallOpenings.some((opening) => openingContains(opening, center, cy)))
        continue;
      addWallPanel(out, axis, offset, from, to, bottom, top, mat);
    }
  }
}

function addWindowTrim(
  room: THREE.Group,
  axis: "x" | "z",
  offset: number,
  center: number,
  opening: WallOpening,
  trimMat: THREE.Material,
  glassMat: THREE.Material,
): void {
  const frame = 0.12;
  const depth = SLAB + 0.08;
  const bottom = opening.bottom;
  const top = opening.bottom + opening.height;
  const y = bottom + opening.height / 2;
  if (axis === "x") {
    room.add(
      visualBox(
        opening.width + frame * 2,
        frame,
        depth,
        center,
        top,
        offset,
        trimMat,
      ),
    );
    room.add(
      visualBox(
        opening.width + frame * 2,
        frame,
        depth,
        center,
        bottom,
        offset,
        trimMat,
      ),
    );
    room.add(
      visualBox(
        frame,
        opening.height,
        depth,
        center - opening.width / 2,
        y,
        offset,
        trimMat,
      ),
    );
    room.add(
      visualBox(
        frame,
        opening.height,
        depth,
        center + opening.width / 2,
        y,
        offset,
        trimMat,
      ),
    );
    room.add(
      visualBox(
        opening.width * 0.96,
        opening.height * 0.9,
        0.035,
        center,
        y,
        offset,
        glassMat,
      ),
    );
  } else {
    room.add(
      visualBox(
        depth,
        frame,
        opening.width + frame * 2,
        offset,
        top,
        center,
        trimMat,
      ),
    );
    room.add(
      visualBox(
        depth,
        frame,
        opening.width + frame * 2,
        offset,
        bottom,
        center,
        trimMat,
      ),
    );
    room.add(
      visualBox(
        depth,
        opening.height,
        frame,
        offset,
        y,
        center - opening.width / 2,
        trimMat,
      ),
    );
    room.add(
      visualBox(
        depth,
        opening.height,
        frame,
        offset,
        y,
        center + opening.width / 2,
        trimMat,
      ),
    );
    room.add(
      visualBox(
        0.035,
        opening.height * 0.9,
        opening.width * 0.96,
        offset,
        y,
        center,
        glassMat,
      ),
    );
  }
}

function addDoorTrim(
  room: THREE.Group,
  offset: number,
  trimMat: THREE.Material,
): void {
  const frame = 0.14;
  const depth = SLAB + 0.14;
  const y = DOOR_HEIGHT / 2;
  room.add(
    visualBox(frame, DOOR_HEIGHT, depth, -DOOR_WIDTH / 2, y, offset, trimMat),
  );
  room.add(
    visualBox(frame, DOOR_HEIGHT, depth, DOOR_WIDTH / 2, y, offset, trimMat),
  );
  room.add(
    visualBox(
      DOOR_WIDTH + frame * 2,
      frame,
      depth,
      0,
      DOOR_HEIGHT,
      offset,
      trimMat,
    ),
  );
  room.add(
    visualBox(DOOR_WIDTH + 0.5, 0.08, 0.8, 0, 0.04, offset + 0.25, trimMat),
  );
}

/**
 * Build a stepped staircase that climbs from `baseY` up `rise` metres over a run starting at
 * (startX, startZ) and advancing along +Z. Each step is a solid collidable box; the physics layer's
 * autostep climbs them. Returns the array of step meshes.
 */
function buildStaircase(
  baseY: number,
  rise: number,
  startX: number,
  startZ: number,
  stairWidth: number,
  mat: THREE.Material,
): THREE.Mesh[] {
  const steps: THREE.Mesh[] = [];
  const STEP_RISE = 0.35; // below the physics autostep budget (0.45) with comfortable margin
  const STEP_RUN = 0.55; // deeper tread so each step is unambiguously a separate walkable surface
  const count = Math.max(1, Math.round(rise / STEP_RISE));
  for (let i = 0; i < count; i++) {
    // Each step is a box whose TOP sits at the tread height; it fills down to baseY so the
    // stair is a solid wedge (no gaps underneath for the trimesh).
    const treadTop = baseY + (i + 1) * (rise / count);
    const h = treadTop - baseY;
    const cz = startZ + i * STEP_RUN + STEP_RUN / 2;
    steps.push(
      solidBox(stairWidth, h, STEP_RUN, startX, baseY + h / 2, cz, mat),
    );
  }
  return steps;
}

/**
 * Generate a multi-surface interior room as a THREE.Group.
 *
 * Geometry produced (all per the contract):
 *   - One floor slab per level (stacked LEVEL_HEIGHT apart). Upper levels are a partial mezzanine
 *     covering the far half (leaving a stairwell opening above the staircase).
 *   - Perimeter walls around the ground level; the entrance wall (−Z) has a centred doorway gap.
 *   - A stepped staircase climbing from the ground floor to each successive level (when levels > 1
 *     or spec.stairs).
 *   - A ceiling slab capping the top level.
 *   - A warm PointLight + soft AmbientLight (visual-only, never collided).
 *
 * @returns a THREE.Group named "tellus-interior-room"; solid meshes carry userData.collide === true.
 */
export function generateInteriorRoom(spec: InteriorRoomSpec = {}): THREE.Group {
  const seed = spec.seed ?? 1;
  const width = Math.max(6, spec.width ?? 16);
  const depth = Math.max(6, spec.depth ?? 16);
  const levels = Math.max(1, Math.floor(spec.levels ?? 1));
  const wantStairs = spec.stairs ?? levels > 1;
  const rng = makeRng(seed);
  const biome = normalizeInteriorBiomeMaterial(spec.biome);
  const palette = interiorMaterialPaletteFor(biome);

  const room = new THREE.Group();
  room.name = "tellus-interior-room";

  const floorMat = makeInteriorMaterial(palette.floor);
  const wallMat = makeInteriorMaterial(palette.wall);
  const stairMat = makeInteriorMaterial(palette.stair);
  const ceilMat = makeInteriorMaterial(palette.ceiling);
  const trimMat = makeInteriorMaterial(palette.trim);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fd8ff,
    roughness: 0.2,
    metalness: 0.0,
    transparent: true,
    opacity: 0.34,
    side: THREE.DoubleSide,
  });

  const hx = width / 2;
  const hz = depth / 2;
  const solids: THREE.Mesh[] = [];
  room.userData.placementBounds = {
    minX: -hx + 0.8,
    maxX: hx - 0.8,
    minZ: -hz + 0.8,
    maxZ: hz - 0.8,
    levels,
    levelHeight: LEVEL_HEIGHT,
  };
  room.userData.materialBiome = biome;
  const openingAnchors: InteriorOpeningAnchor[] = [];
  const windowZ = Math.max(-hz + 3.2, -hz * 0.35);
  const backWindowLeft = Math.max(-hx + 3, -hx * 0.55);
  const backWindowRight = Math.min(hx - 3, hx * 0.55);
  const sideWindowOpening = {
    center: windowZ,
    width: Math.min(WINDOW_WIDTH, Math.max(1.4, depth * 0.18)),
    bottom: WINDOW_BOTTOM,
    height: WINDOW_HEIGHT,
  };
  const backWindowOpening = {
    center: 0,
    width: Math.min(WINDOW_WIDTH, Math.max(1.4, width * 0.16)),
    bottom: WINDOW_BOTTOM,
    height: WINDOW_HEIGHT,
  };
  openingAnchors.push(
    {
      kind: "door",
      wall: "-z",
      position: { x: 0, y: DOOR_HEIGHT / 2, z: -hz },
      rotationY: 0,
      width: DOOR_WIDTH,
      height: DOOR_HEIGHT,
    },
    {
      kind: "window",
      wall: "-x",
      position: { x: -hx, y: WINDOW_BOTTOM + WINDOW_HEIGHT / 2, z: windowZ },
      rotationY: Math.PI / 2,
      width: sideWindowOpening.width,
      height: sideWindowOpening.height,
    },
    {
      kind: "window",
      wall: "+x",
      position: { x: hx, y: WINDOW_BOTTOM + WINDOW_HEIGHT / 2, z: windowZ },
      rotationY: -Math.PI / 2,
      width: sideWindowOpening.width,
      height: sideWindowOpening.height,
    },
    {
      kind: "window",
      wall: "+z",
      position: {
        x: backWindowLeft,
        y: WINDOW_BOTTOM + WINDOW_HEIGHT / 2,
        z: hz,
      },
      rotationY: Math.PI,
      width: backWindowOpening.width,
      height: backWindowOpening.height,
    },
    {
      kind: "window",
      wall: "+z",
      position: {
        x: backWindowRight,
        y: WINDOW_BOTTOM + WINDOW_HEIGHT / 2,
        z: hz,
      },
      rotationY: Math.PI,
      width: backWindowOpening.width,
      height: backWindowOpening.height,
    },
  );
  room.userData.openings = openingAnchors;
  room.userData.portalDoorAnchor = openingAnchors[0];

  // ── Floor slabs (one per level) ──────────────────────────────────────────────────────────────
  // Ground floor: full slab, top surface at y = 0 (player grounds on y ≈ 0, matching applyInterior).
  solids.push(solidBox(width, SLAB, depth, 0, -SLAB / 2, 0, floorMat));
  // Upper floors: a mezzanine covering the FAR half (+Z) of the footprint; the near half stays open
  // above the staircase so the player can climb up into it.
  for (let lvl = 1; lvl < levels; lvl++) {
    const y = lvl * LEVEL_HEIGHT;
    const mezDepth = depth / 2;
    solids.push(
      solidBox(
        width,
        SLAB,
        mezDepth,
        0,
        y - SLAB / 2,
        hz - mezDepth / 2,
        floorMat,
      ),
    );
  }

  // ── Perimeter walls (ground level) ───────────────────────────────────────────────────────────
  const wallHeight = levels * LEVEL_HEIGHT;
  // Entrance wall on −Z has the doorway gap; the other three are solid.
  addWall(solids, "x", -hz, width, 0, wallHeight, wallMat, true);
  addWall(solids, "x", hz, width, 0, wallHeight, wallMat, false, [
    { ...backWindowOpening, center: backWindowLeft },
    { ...backWindowOpening, center: backWindowRight },
  ]);
  addWall(solids, "z", -hx, depth, 0, wallHeight, wallMat, false, [
    sideWindowOpening,
  ]);
  addWall(solids, "z", hx, depth, 0, wallHeight, wallMat, false, [
    sideWindowOpening,
  ]);
  addDoorTrim(room, -hz, trimMat);
  addWindowTrim(
    room,
    "x",
    hz,
    backWindowLeft,
    backWindowOpening,
    trimMat,
    glassMat,
  );
  addWindowTrim(
    room,
    "x",
    hz,
    backWindowRight,
    backWindowOpening,
    trimMat,
    glassMat,
  );
  addWindowTrim(room, "z", -hx, windowZ, sideWindowOpening, trimMat, glassMat);
  addWindowTrim(room, "z", hx, windowZ, sideWindowOpening, trimMat, glassMat);

  // ── Staircase(s) between levels ──────────────────────────────────────────────────────────────
  // Each flight climbs along +Z from the near (open) half up to the next mezzanine, hugging the −X
  // side so it does not block the doorway. Width is a fraction of the room, clamped sensibly.
  if (wantStairs && levels > 1) {
    const stairWidth = Math.min(3, width * 0.4);
    const stairX = -hx + SLAB + stairWidth / 2 + 0.2; // hug the −X wall
    const STEP_RUN = 0.55; // must match buildStaircase
    const STEP_RISE = 0.35;
    for (let lvl = 1; lvl < levels; lvl++) {
      const baseY = (lvl - 1) * LEVEL_HEIGHT;
      const rise = LEVEL_HEIGHT;
      const stepCount = Math.max(1, Math.round(rise / STEP_RISE));
      const runLength = stepCount * STEP_RUN;
      const mezEdgeZ = hz - depth / 2; // = 0: where the mezzanine (far half) begins
      // Anchor the run so its top tread reaches just PAST the mezzanine edge — overlap, never a gap.
      const startZ = mezEdgeZ - runLength + 0.3;
      solids.push(
        ...buildStaircase(baseY, rise, stairX, startZ, stairWidth, stairMat),
      );
      // Generous flat landing at the top level, overlapping BOTH the last tread and the mezzanine, so
      // the climb-to-walk transition is continuous (no lip to get stuck on / jump over). Spans from a
      // bit before the mezzanine edge to a bit into the mezzanine, at the exact mezzanine floor height.
      const topY = baseY + rise;
      const landFrom = mezEdgeZ - 1.0; // overlap the last couple of treads
      const landTo = mezEdgeZ + 0.8; // overlap into the mezzanine
      const landingDepth = landTo - landFrom;
      solids.push(
        solidBox(
          stairWidth,
          SLAB,
          landingDepth,
          stairX,
          topY - SLAB / 2,
          (landFrom + landTo) / 2,
          stairMat,
        ),
      );
    }
  }

  // ── Ceiling (caps the top level) ─────────────────────────────────────────────────────────────
  const ceilY = wallHeight;
  solids.push(solidBox(width, SLAB, depth, 0, ceilY + SLAB / 2, 0, ceilMat));

  for (const m of solids) room.add(m);

  // ── Lighting (visual-only — NEVER flagged collidable) ────────────────────────────────────────
  const light = new THREE.PointLight(
    0xffe0b0,
    1.2,
    Math.max(width, depth) * 3,
    1.4,
  );
  light.position.set(0, wallHeight - 0.8, 0);
  light.castShadow = false;
  room.add(light);
  room.add(new THREE.AmbientLight(0xfff2e0, 0.4));

  return room;
}
