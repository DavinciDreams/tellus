import * as THREE from "three";
import { SEA_LEVEL, WORLD_RADIUS } from "./tellus-constants";
import type { TerrainPaintKind } from "./tellus-types";
import {
  biomePatchForEcology,
  biomePatchForPaint,
  environmentForBiomePatch,
  genomeForBiomePatch,
  treeBackendForBiomePatch,
} from "./tellus-procplant-biomes";
import { resolveEcologySample, type EcologySample } from "./tellus-ecology";
import { treeTemplateFromSpecies } from "./tellus-tree-gen";
import { buildStylizedEvergreenTemplate } from "./tellus-veg-archetypes";
import {
  buildProcPlantInstancedParts,
  createProcPlantConiferSprayGeometry,
  createProcPlantDaylilyBloomGeometry,
  defaultPlantEnvironment,
  createProcPlantFlowerCenterGeometry,
  createProcPlantFlowerDiscGeometry,
  createProcPlantFoxgloveBloomGeometry,
  createProcPlantGrassBladeGeometry,
  createProcPlantLeafGeometry,
  createProcPlantPalmFrondGeometry,
  createProcPlantPetalGeometry,
  type ProcPlantGenome,
  type ProcPlantInstance,
  type ProcPlantTemplate,
  procPlantPresets,
} from "./tellus-procplants";

export interface ProcPlantVegetationOptions {
  scene: THREE.Scene;
  worldId: string;
  sampleHeight: (x: number, z: number) => number | null;
  samplePaint: (x: number, z: number) => TerrainPaintKind | null;
  sampleEcology?: (x: number, z: number, height: number, paint: TerrainPaintKind | null, seed: number) => EcologySample;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  chunkSize?: number;
  maxRing?: number;
  densityMultiplier?: number;
  isExcluded?: (x: number, z: number, height: number) => boolean;
  viewMode?: () => "first" | "third";
  fullDetailLod?: boolean;
  shouldPauseBuild?: () => boolean;
  shouldDeferBuild?: () => boolean;
}

export interface ProcPlantVegetationStats {
  chunks: number;
  plants: number;
  manualPlants: number;
  instances: number;
  stemTriangles: number;
  organDraws: number;
  lod0: number;
  lod1: number;
  lod2: number;
  viewMode: "first" | "third";
  queuedRebuilds: number;
  terrainInvalidations: number;
  chunksCreated: number;
  chunksEvicted: number;
  chunksBuilt: number;
  lastUpdateMs: number;
  maxUpdateMs: number;
  lastBuildMs: number;
  maxBuildMs: number;
  totalBuildMs: number;
  builtLastUpdate: number;
  buildPausedForMotion: boolean;
  buildDeferred: boolean;
}

export interface ProcPlantVegetationSystem {
  update(px: number, pz: number, playerY: number, fps: number, nowMs: number): void;
  notifyTerrainChanged(): void;
  placeManualPlant(placement: ProcPlantManualPlacement, options?: { persist?: boolean }): boolean;
  replaceManualPlants(placements: ProcPlantManualPlacement[], options?: { persist?: boolean }): void;
  removeManualPlant(id: string, options?: { persist?: boolean }): boolean;
  manualPlantPlacements(): ProcPlantManualPlacement[];
  stats(): ProcPlantVegetationStats;
  dispose(): void;
}

export interface ProcPlantManualPlacement {
  id: string;
  presetId: string;
  seed: number;
  x: number;
  z: number;
  scale: number;
}

interface ChunkStats {
  plants: number;
  instances: number;
  stemTriangles: number;
  organDraws: number;
}

interface ActiveChunk {
  key: string;
  cx: number;
  cz: number;
  lod: 0 | 1 | 2;
  rev: number;
  styleRev: number;
  styleCenterCx: number;
  styleCenterCz: number;
  lastNeededMs: number;
  group: THREE.Group;
  stats: ChunkStats;
}

interface OrganBucket {
  key: string;
  geometry: THREE.BufferGeometry;
  instances: ProcPlantInstance[];
}

interface BiomeTreeTemplateOptions {
  leafScaleMultiplier?: number;
  maxLeaves?: number;
  maxStems?: number;
  maxBranchDepth?: number;
  foliageMass?: number;
  foliageClusterDensity?: number;
  foliageTipBias?: number;
  foliageSpread?: number;
}

const DEFAULT_CHUNK_SIZE = 16;
const DEFAULT_MAX_RING = 3;
const THIRD_PERSON_MAX_RING = 4;
const MAX_LOD0_PLANTS = 3;
const MAX_LOD1_PLANTS = 3;
const MAX_LOD2_PLANTS = 4;
const PROC_TREE_NEAR_SCALE = 1.85;
const PROC_TREE_MID_SCALE = 1.45;
const PROC_TREE_FAR_SCALE = 1.15;
const PROC_TREE_DETAIL_DISTANCE = 58;
const PROC_TREE_DETAIL_DISTANCE_THIRD = 72;
const PROCPLANT_RENDER_STYLE_REVISION = 3;
const FAR_CHUNK_EVICT_GRACE_MS = 2_500;
const LOW_FPS_BUILD_BUDGET = 1;
const NORMAL_BUILD_BUDGET = 2;
const LOW_FPS_BUILD_MS_BUDGET = 2.5;
const NORMAL_BUILD_MS_BUDGET = 5;
const MIN_PROCPLANT_GROUND_HEIGHT = SEA_LEVEL + 0.35;

const foliageDefaultsForTreeSpecies = (
  species: string,
): Required<Pick<BiomeTreeTemplateOptions, "foliageMass" | "foliageClusterDensity" | "foliageTipBias" | "foliageSpread">> => {
  const id = species.toLowerCase();
  if (id.includes("fir") || id.includes("pine") || id.includes("douglas") || id.includes("larch")) {
    return { foliageMass: 0.92, foliageClusterDensity: 1.24, foliageTipBias: 0.34, foliageSpread: 0.16 };
  }
  if (id.includes("cherry") || id.includes("apple") || id.includes("magnolia")) {
    return { foliageMass: 0.72, foliageClusterDensity: 1.22, foliageTipBias: 0.62, foliageSpread: 0.22 };
  }
  if (id.includes("birch") || id.includes("aspen") || id.includes("poplar")) {
    return { foliageMass: 0.58, foliageClusterDensity: 1.04, foliageTipBias: 0.72, foliageSpread: 0.2 };
  }
  if (id.includes("oak") || id.includes("sassafras") || id.includes("tupelo")) {
    return { foliageMass: 0.74, foliageClusterDensity: 1.22, foliageTipBias: 0.58, foliageSpread: 0.21 };
  }
  return { foliageMass: 0.62, foliageClusterDensity: 1.1, foliageTipBias: 0.55, foliageSpread: 0.2 };
};

const buildBiomeTreeTemplate = (
  species: string,
  seed: number,
  options: BiomeTreeTemplateOptions = {},
): ProcPlantTemplate =>
  treeTemplateFromSpecies(species, seed, {
    radialSegments: 3,
    branchSamples: 1,
    branchCaps: false,
    maxBranchDepth: options.maxBranchDepth ?? 2,
    maxStems: options.maxStems ?? 42,
    maxLeaves: options.maxLeaves ?? 170,
    leafScaleMultiplier: options.leafScaleMultiplier ?? 2,
    foliageMass: options.foliageMass,
    foliageClusterDensity: options.foliageClusterDensity,
    foliageTipBias: options.foliageTipBias,
    foliageSpread: options.foliageSpread,
    swayFrom: 0.3,
  });

const templateFromGeometry = (geometry: THREE.BufferGeometry, color: THREE.Color): ProcPlantTemplate => {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const vertexCount = position.count;
  const pos = new Float32Array(vertexCount * 3);
  const nrm = new Float32Array(vertexCount * 3);
  const col = new Float32Array(vertexCount * 3);
  const tintable = new Uint8Array(vertexCount);
  const sway = new Float32Array(vertexCount);
  const idx = new Uint32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    pos[offset] = position.getX(i);
    pos[offset + 1] = position.getY(i);
    pos[offset + 2] = position.getZ(i);
    nrm[offset] = normal?.getX(i) ?? 0;
    nrm[offset + 1] = normal?.getY(i) ?? 1;
    nrm[offset + 2] = normal?.getZ(i) ?? 0;
    col[offset] = color.r;
    col[offset + 1] = color.g;
    col[offset + 2] = color.b;
    tintable[i] = 0;
    sway[i] = 0;
    idx[i] = i;
  }
  if (source !== geometry) source.dispose();
  return { pos, nrm, col, tintable, sway, idx };
};

const cheapTreeTemplateCache = new Map<string, ProcPlantTemplate>();
const templateMinYCache = new WeakMap<ProcPlantTemplate, number>();

const templateMinY = (template: ProcPlantTemplate): number => {
  const cached = templateMinYCache.get(template);
  if (cached !== undefined) return cached;
  let minY = Infinity;
  for (let i = 1; i < template.pos.length; i += 3) minY = Math.min(minY, template.pos[i] ?? 0);
  const y = Number.isFinite(minY) ? minY : 0;
  templateMinYCache.set(template, y);
  return y;
};

const buildCheapTreeTemplate = (species: string): ProcPlantTemplate => {
  const cached = cheapTreeTemplateCache.get(species);
  if (cached) return cached;
  const conifer = /fir|pine|douglas|larch|spruce/i.test(species);
  if (conifer) {
    const template = buildStylizedEvergreenTemplate(hashString(species), undefined, {
      height: /small/i.test(species) ? 0.92 : /douglas|redwood/i.test(species) ? 1.32 : 1.14,
      width: /small/i.test(species) ? 0.36 : /douglas|redwood/i.test(species) ? 0.46 : 0.42,
      tiers: /small/i.test(species) ? 4 : /douglas|redwood/i.test(species) ? 7 : 6,
      trunkRadius: /small/i.test(species) ? 0.052 : 0.058,
    });
    cheapTreeTemplateCache.set(species, template);
    return template;
  }
  const trunk = new THREE.CylinderGeometry(0.055, 0.085, 0.78, 6);
  trunk.translate(0, 0.39, 0);
  const crown = new THREE.IcosahedronGeometry(0.58, 1);
  crown.scale(1.08, /birch|poplar|aspen/i.test(species) ? 1.34 : 0.96, 1.08);
  crown.translate(0, /birch|poplar|aspen/i.test(species) ? 1.12 : 1.02, 0);
  const trunkTemplate = templateFromGeometry(trunk, new THREE.Color(0x5c3f24));
  const crownTemplate = templateFromGeometry(crown, new THREE.Color(/cherry|apple|magnolia/i.test(species) ? 0x6f8f4a : 0x536f38));
  trunk.dispose();
  crown.dispose();
  const vertexOffset = trunkTemplate.pos.length / 3;
  const pos = new Float32Array(trunkTemplate.pos.length + crownTemplate.pos.length);
  const nrm = new Float32Array(trunkTemplate.nrm.length + crownTemplate.nrm.length);
  const col = new Float32Array(trunkTemplate.col.length + crownTemplate.col.length);
  const tintable = new Uint8Array(trunkTemplate.tintable.length + crownTemplate.tintable.length);
  const sway = new Float32Array(trunkTemplate.sway.length + crownTemplate.sway.length);
  const idx = new Uint32Array(trunkTemplate.idx.length + crownTemplate.idx.length);
  pos.set(trunkTemplate.pos, 0);
  pos.set(crownTemplate.pos, trunkTemplate.pos.length);
  nrm.set(trunkTemplate.nrm, 0);
  nrm.set(crownTemplate.nrm, trunkTemplate.nrm.length);
  col.set(trunkTemplate.col, 0);
  col.set(crownTemplate.col, trunkTemplate.col.length);
  tintable.set(trunkTemplate.tintable, 0);
  tintable.set(crownTemplate.tintable, trunkTemplate.tintable.length);
  sway.set(trunkTemplate.sway, 0);
  sway.set(crownTemplate.sway, trunkTemplate.sway.length);
  idx.set(trunkTemplate.idx, 0);
  for (let i = 0; i < crownTemplate.idx.length; i++) {
    idx[trunkTemplate.idx.length + i] = crownTemplate.idx[i] + vertexOffset;
  }
  const template = {
    pos,
    nrm,
    col,
    tintable,
    sway,
    idx,
  };
  cheapTreeTemplateCache.set(species, template);
  return template;
};

const manualPlacementStorageKey = (worldId: string): string =>
  `tellus.procplants.manual.${worldId}`;

const hashString = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const procPlantChunkSeed = (
  worldId: string,
  cx: number,
  cz: number,
  terrainRevision = 0,
): number => {
  let h = hashString(worldId);
  h = (Math.imul(h ^ cx, 2246822519) ^ Math.imul(cz, 3266489917)) >>> 0;
  h = (h ^ Math.imul(terrainRevision + 1, 668265263)) >>> 0;
  return h || 1;
};

const mulberry32 = (seed: number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const disposeGroup = (group: THREE.Group) => {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    }
  });
  group.clear();
};

const templateToGeometry = (
  entries: Array<{ template: ProcPlantTemplate; matrix: THREE.Matrix4 }>,
): THREE.BufferGeometry => {
  const totalVertices = entries.reduce((sum, entry) => sum + entry.template.pos.length / 3, 0);
  const totalIndices = entries.reduce((sum, entry) => sum + entry.template.idx.length, 0);
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const colors = new Float32Array(totalVertices * 3);
  const indices = totalVertices > 65535 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let vertexCursor = 0;
  let indexCursor = 0;
  for (const entry of entries) {
    const { template, matrix } = entry;
    const vertexCount = template.pos.length / 3;
    const indexCount = template.idx.length;
    normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < vertexCount; i++) {
      const src = i * 3;
      const dst = (vertexCursor + i) * 3;
      p.set(template.pos[src], template.pos[src + 1], template.pos[src + 2]).applyMatrix4(matrix);
      n.set(template.nrm[src], template.nrm[src + 1], template.nrm[src + 2]).applyMatrix3(normalMatrix).normalize();
      positions[dst] = p.x;
      positions[dst + 1] = p.y;
      positions[dst + 2] = p.z;
      normals[dst] = n.x;
      normals[dst + 1] = n.y;
      normals[dst + 2] = n.z;
      colors[dst] = template.col[src];
      colors[dst + 1] = template.col[src + 1];
      colors[dst + 2] = template.col[src + 2];
    }
    for (let i = 0; i < indexCount; i++) indices[indexCursor + i] = template.idx[i] + vertexCursor;
    vertexCursor += vertexCount;
    indexCursor += indexCount;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};

const geometryKeyFor = (genome: ProcPlantGenome, instance: ProcPlantInstance): string => {
  if (instance.kind === "leaf") {
    const leaf = genome.leaf;
    return `leaf:${leaf.shape}:${leaf.widthRatio.toFixed(3)}:${leaf.serration.toFixed(3)}:${leaf.curl.toFixed(3)}`;
  }
  if (instance.kind === "grassBlade") {
    return `grassBlade:${genome.leaf.widthRatio.toFixed(3)}:${genome.leaf.curl.toFixed(3)}`;
  }
  return instance.kind;
};

const geometryForKey = (key: string): THREE.BufferGeometry => {
  const [kind, shape, widthRatio, serration, curl] = key.split(":");
  switch (kind) {
    case "leaf":
      return createProcPlantLeafGeometry(
        shape as ProcPlantGenome["leaf"]["shape"],
        Number(widthRatio),
        Number(serration),
        Number(curl),
      );
    case "grassBlade":
      return createProcPlantGrassBladeGeometry(Number(shape), Number(widthRatio));
    case "petal":
      return createProcPlantPetalGeometry();
    case "flowerDisc":
      return createProcPlantFlowerDiscGeometry();
    case "daylilyBloom":
      return createProcPlantDaylilyBloomGeometry();
    case "foxgloveBloom":
      return createProcPlantFoxgloveBloomGeometry();
    case "flowerCenter":
      return createProcPlantFlowerCenterGeometry();
    case "coniferSpray":
      return createProcPlantConiferSprayGeometry();
    case "palmFrond":
      return createProcPlantPalmFrondGeometry();
    default:
      return createProcPlantPetalGeometry();
  }
};

const emptyStats = (): ProcPlantVegetationStats => ({
  chunks: 0,
  plants: 0,
  manualPlants: 0,
  instances: 0,
  stemTriangles: 0,
  organDraws: 0,
  lod0: 0,
  lod1: 0,
  lod2: 0,
  viewMode: "first",
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
});

const isFinitePlacementNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeManualPlacement = (value: unknown): ProcPlantManualPlacement | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<ProcPlantManualPlacement>;
  if (
    typeof record.id !== "string" ||
    typeof record.presetId !== "string" ||
    !isFinitePlacementNumber(record.seed) ||
    !isFinitePlacementNumber(record.x) ||
    !isFinitePlacementNumber(record.z) ||
    !isFinitePlacementNumber(record.scale) ||
    !procPlantPresets[record.presetId]
  ) {
    return null;
  }
  return {
    id: record.id,
    presetId: record.presetId,
    seed: record.seed >>> 0,
    x: record.x,
    z: record.z,
    scale: THREE.MathUtils.clamp(record.scale, 0.08, 24),
  };
};

export function createProcPlantVegetation(
  options: ProcPlantVegetationOptions,
): ProcPlantVegetationSystem {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxRing = options.maxRing ?? DEFAULT_MAX_RING;
  const densityMultiplier = THREE.MathUtils.clamp(options.densityMultiplier ?? 1, 0, 2);
  const bounds = options.bounds ?? {
    minX: -WORLD_RADIUS,
    maxX: WORLD_RADIUS,
    minZ: -WORLD_RADIUS,
    maxZ: WORLD_RADIUS,
  };
  const root = new THREE.Group();
  root.name = "tellus-procplant-vegetation";
  options.scene.add(root);

  let terrainRev = 0;
  let terrainDirty = false;
  let terrainInvalidations = 0;
  let chunksCreated = 0;
  let chunksEvicted = 0;
  let chunksBuilt = 0;
  let lastUpdateMs = 0;
  let maxUpdateMs = 0;
  let lastBuildMs = 0;
  let maxBuildMs = 0;
  let totalBuildMs = 0;
  let builtLastUpdate = 0;
  let buildDeferred = false;
  let lastPlayerX: number | null = null;
  let lastPlayerZ: number | null = null;
  let lastPlayerMovedAt = Number.NEGATIVE_INFINITY;
  let buildPausedForMotion = false;
  let disposed = false;
  const active = new Map<string, ActiveChunk>();
  const manualPlacements = new Map<string, ProcPlantManualPlacement>();
  const manualPlacementChunks = new Map<string, string>();
  const queued = new Set<string>();
  const rebuildQueue: string[] = [];
  const stemMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const organMaterial = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });

  const inBounds = (x: number, z: number) =>
    x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;

  const chunkKeyAt = (x: number, z: number) =>
    `${Math.floor(x / chunkSize)},${Math.floor(z / chunkSize)}`;

  const viewMode = () => options.viewMode?.() ?? "first";
  const fullDetailLod = options.fullDetailLod ?? false;

  const activeMaxRing = () => {
    if (options.maxRing !== undefined) return maxRing;
    return viewMode() === "third" ? Math.max(maxRing, THIRD_PERSON_MAX_RING) : maxRing;
  };

  const lodForRing = (ring: number): 0 | 1 | 2 => {
    if (fullDetailLod) return 0;
    if (viewMode() === "third") {
      if (ring === 0) return 0;
      if (ring <= 2) return 1;
      return 2;
    }
    if (ring === 0) return 0;
    if (ring <= 2) return 1;
    return 2;
  };

  const enqueue = (key: string, priority = false) => {
    if (queued.has(key)) {
      if (priority) {
        const index = rebuildQueue.indexOf(key);
        if (index > 0) {
          rebuildQueue.splice(index, 1);
          rebuildQueue.unshift(key);
        }
      }
      return;
    }
    queued.add(key);
    if (priority) rebuildQueue.unshift(key);
    else rebuildQueue.push(key);
  };

  const prioritizeRebuildQueue = (centerCx: number, centerCz: number) => {
    rebuildQueue.sort((a, b) => {
      const [ax, az] = a.split(",").map(Number);
      const [bx, bz] = b.split(",").map(Number);
      return Math.max(Math.abs(ax - centerCx), Math.abs(az - centerCz)) -
        Math.max(Math.abs(bx - centerCx), Math.abs(bz - centerCz));
    });
  };

  const rememberManualPlacement = (placement: ProcPlantManualPlacement) => {
    const key = chunkKeyAt(placement.x, placement.z);
    manualPlacements.set(placement.id, placement);
    manualPlacementChunks.set(placement.id, key);
    const chunk = active.get(key);
    if (chunk) chunk.rev = -1;
    enqueue(key, true);
  };

  const enqueueAllActive = () => {
    terrainRev++;
    for (const key of active.keys()) enqueue(key);
  };

  const estimateSlope = (x: number, z: number, height: number): number => {
    const step = 2.5;
    const hx = options.sampleHeight(x + step, z) ?? height;
    const hz = options.sampleHeight(x, z + step) ?? height;
    return THREE.MathUtils.clamp(Math.hypot(hx - height, hz - height) / step, 0, 1);
  };

  const saveManualPlacements = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        manualPlacementStorageKey(options.worldId),
        JSON.stringify([...manualPlacements.values()]),
      );
    } catch (error) {
      console.warn("Tellus manual procplant save failed", error);
    }
  };

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(manualPlacementStorageKey(options.worldId));
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const placement = normalizeManualPlacement(item);
          if (placement) rememberManualPlacement(placement);
        }
      }
    } catch (error) {
      console.warn("Tellus manual procplant load failed", error);
    }
  }

  const buildChunk = (chunk: ActiveChunk) => {
    disposeGroup(chunk.group);
    chunk.stats = { plants: 0, instances: 0, stemTriangles: 0, organDraws: 0 };
    chunk.rev = terrainRev;
    chunk.styleRev = PROCPLANT_RENDER_STYLE_REVISION;
    chunk.styleCenterCx = Math.floor((lastPlayerX ?? chunk.cx * chunkSize) / chunkSize);
    chunk.styleCenterCz = Math.floor((lastPlayerZ ?? chunk.cz * chunkSize) / chunkSize);
    const seed = procPlantChunkSeed(options.worldId, chunk.cx, chunk.cz, 0);
    const rand = mulberry32(seed);
    const plantCap = chunk.lod === 0
      ? Math.max(1, Math.round(MAX_LOD0_PLANTS * densityMultiplier))
      : chunk.lod === 1
        ? Math.max(1, Math.round(MAX_LOD1_PLANTS * densityMultiplier))
        : Math.max(1, Math.round(MAX_LOD2_PLANTS * densityMultiplier));
    const stemTemplates: Array<{ template: ProcPlantTemplate; matrix: THREE.Matrix4 }> = [];
    const organBuckets = new Map<string, OrganBucket>();
    const x0 = chunk.cx * chunkSize;
    const z0 = chunk.cz * chunkSize;
    const attempts = plantCap * 5;

    for (let i = 0; i < attempts && chunk.stats.plants < plantCap; i++) {
      const x = x0 + rand() * chunkSize;
      const z = z0 + rand() * chunkSize;
      if (!inBounds(x, z)) continue;
      const height = options.sampleHeight(x, z);
      if (height === null || height < MIN_PROCPLANT_GROUND_HEIGHT) continue;
      if (options.isExcluded?.(x, z, height)) continue;
      const paint = options.samplePaint(x, z);
      if (paint === "stone" || paint === "brick") continue;
      const patchSeed = seed ^ Math.imul(i + 1, 0x9e3779b1);
      const ecology = options.sampleEcology?.(x, z, height, paint, patchSeed) ??
        resolveEcologySample({
          seed: patchSeed,
          x,
          z,
          height,
          slope: estimateSlope(x, z, height),
          terrainPaint: paint,
        });
      const patch = biomePatchForEcology(ecology, patchSeed) ?? biomePatchForPaint(paint, patchSeed);
      const lodDensity = chunk.lod === 2 ? 0.65 : chunk.lod === 1 ? 0.52 : 0.48;
      if (!patch || rand() > patch.density * densityMultiplier * lodDensity) continue;
      const genome = genomeForBiomePatch(patch);
      const treeBackend = treeBackendForBiomePatch(patch);
      const distanceToPlayer = Math.hypot(x - (lastPlayerX ?? x), z - (lastPlayerZ ?? z));
      const detailDistance = viewMode() === "third" ? PROC_TREE_DETAIL_DISTANCE_THIRD : PROC_TREE_DETAIL_DISTANCE;
      const useDetailedTree = distanceToPlayer <= detailDistance;
      const treeScaleMultiplier = chunk.lod === 0
        ? PROC_TREE_NEAR_SCALE
        : chunk.lod === 1
          ? PROC_TREE_MID_SCALE
          : PROC_TREE_FAR_SCALE;
      if (treeBackend?.kind === "lsystem") {
        const template = useDetailedTree
          ? buildBiomeTreeTemplate(treeBackend.species, patch.seed ^ i, {
              ...foliageDefaultsForTreeSpecies(treeBackend.species),
              ...treeBackend,
            })
          : buildCheapTreeTemplate(treeBackend.species);
        const scaleMultiplier = fullDetailLod ? PROC_TREE_NEAR_SCALE : useDetailedTree ? treeScaleMultiplier : PROC_TREE_FAR_SCALE;
        const scale = patch.scale * scaleMultiplier * THREE.MathUtils.lerp(0.9, 1.24, rand());
        const matrix = new THREE.Matrix4()
          .makeRotationY(rand() * Math.PI * 2)
          .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale))
          .premultiply(new THREE.Matrix4().makeTranslation(x, height + 0.02 - templateMinY(template) * scale, z));
        stemTemplates.push({ template, matrix });
        chunk.stats.plants++;
        chunk.stats.stemTriangles += template.idx.length / 3;
        continue;
      }
      const env = environmentForBiomePatch(patch);
      const useCheapDistantTree = !useDetailedTree && patch.scale >= 1.2;
      if (useCheapDistantTree) {
        const template = buildCheapTreeTemplate(genome.weberPenn?.species ?? genome.id);
        const scale = patch.scale * PROC_TREE_FAR_SCALE * THREE.MathUtils.lerp(0.9, 1.2, rand());
        const matrix = new THREE.Matrix4()
          .makeRotationY(rand() * Math.PI * 2)
          .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale))
          .premultiply(new THREE.Matrix4().makeTranslation(x, height + 0.02 - templateMinY(template) * scale, z));
        stemTemplates.push({ template, matrix });
        chunk.stats.plants++;
        chunk.stats.stemTriangles += template.idx.length / 3;
        continue;
      }
      const built = buildProcPlantInstancedParts(genome, patch.seed ^ i, env);
      const scaleBase = patch.scale >= 1.2 ? patch.scale * treeScaleMultiplier : patch.scale;
      const scale = scaleBase * THREE.MathUtils.lerp(0.82, 1.22, rand());
      const matrix = new THREE.Matrix4()
        .makeRotationY(rand() * Math.PI * 2)
        .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale))
        .premultiply(new THREE.Matrix4().makeTranslation(x, height + 0.02 - templateMinY(built.stems) * scale, z));
      stemTemplates.push({ template: built.stems, matrix });
      chunk.stats.plants++;
      chunk.stats.stemTriangles += built.stats.stemTriangles;
      for (const instance of built.instances) {
        const key = geometryKeyFor(genome, instance);
        let bucket = organBuckets.get(key);
        if (!bucket) {
          bucket = { key, geometry: geometryForKey(key), instances: [] };
          organBuckets.set(key, bucket);
        }
        const placed = {
          ...instance,
          matrix: matrix.clone().multiply(instance.matrix),
        };
        bucket.instances.push(placed);
        chunk.stats.instances++;
      }
    }

    for (const placement of manualPlacements.values()) {
      if (manualPlacementChunks.get(placement.id) !== chunk.key) continue;
      if (!inBounds(placement.x, placement.z)) continue;
      const height = options.sampleHeight(placement.x, placement.z);
      if (height === null || height < MIN_PROCPLANT_GROUND_HEIGHT) continue;
      if (options.isExcluded?.(placement.x, placement.z, height)) continue;
      const genome = procPlantPresets[placement.presetId];
      if (!genome) continue;
      const built = buildProcPlantInstancedParts(
        genome,
        placement.seed,
        defaultPlantEnvironment(),
      );
      const matrix = new THREE.Matrix4()
        .makeRotationY(((placement.seed >>> 0) / 4294967296) * Math.PI * 2)
        .premultiply(new THREE.Matrix4().makeScale(placement.scale, placement.scale, placement.scale))
        .premultiply(new THREE.Matrix4().makeTranslation(
          placement.x,
          height + 0.02 - templateMinY(built.stems) * placement.scale,
          placement.z,
        ));
      stemTemplates.push({ template: built.stems, matrix });
      chunk.stats.plants++;
      chunk.stats.stemTriangles += built.stats.stemTriangles;
      for (const instance of built.instances) {
        const key = geometryKeyFor(genome, instance);
        let bucket = organBuckets.get(key);
        if (!bucket) {
          bucket = { key, geometry: geometryForKey(key), instances: [] };
          organBuckets.set(key, bucket);
        }
        bucket.instances.push({
          ...instance,
          matrix: matrix.clone().multiply(instance.matrix),
        });
        chunk.stats.instances++;
      }
    }

    if (stemTemplates.length > 0) {
      const geometry = templateToGeometry(stemTemplates);
      const mesh = new THREE.Mesh(geometry, stemMaterial.clone());
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      chunk.group.add(mesh);
    }

    for (const bucket of organBuckets.values()) {
      const mesh = new THREE.InstancedMesh(bucket.geometry, organMaterial.clone(), bucket.instances.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      bucket.instances.forEach((instance, index) => {
        mesh.setMatrixAt(index, instance.matrix);
        mesh.setColorAt(index, instance.color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      chunk.group.add(mesh);
      chunk.stats.organDraws++;
    }
  };

  const update = (px: number, pz: number, _playerY: number, fps: number, nowMs: number) => {
    if (disposed) return;
    const updateStartedAt = performance.now();
    builtLastUpdate = 0;
    buildDeferred = options.shouldDeferBuild?.() ?? false;
    if (
      lastPlayerX === null ||
      lastPlayerZ === null ||
      Math.hypot(px - lastPlayerX, pz - lastPlayerZ) > 0.15
    ) {
      lastPlayerMovedAt = nowMs;
      lastPlayerX = px;
      lastPlayerZ = pz;
    }
    if (buildDeferred) {
      buildPausedForMotion = false;
      lastUpdateMs = performance.now() - updateStartedAt;
      maxUpdateMs = Math.max(maxUpdateMs, lastUpdateMs);
      return;
    }
    if (terrainDirty && rebuildQueue.length > 0) {
      terrainDirty = false;
      terrainRev++;
      for (const [key, chunk] of active) {
        if (!queued.has(key)) chunk.rev = terrainRev;
      }
    } else if (terrainDirty) {
      terrainDirty = false;
      enqueueAllActive();
    }
    const centerCx = Math.floor(px / chunkSize);
    const centerCz = Math.floor(pz / chunkSize);
    const needed = new Set<string>();
    const ringLimit = activeMaxRing();
    for (let dz = -ringLimit; dz <= ringLimit; dz++) {
      for (let dx = -ringLimit; dx <= ringLimit; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        const lod = lodForRing(ring);
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        const key = `${cx},${cz}`;
        needed.add(key);
        let chunk = active.get(key);
        if (!chunk) {
          chunk = {
            key,
            cx,
            cz,
            lod,
            rev: -1,
            styleRev: 0,
            styleCenterCx: Number.NaN,
            styleCenterCz: Number.NaN,
            lastNeededMs: nowMs,
            group: new THREE.Group(),
            stats: { plants: 0, instances: 0, stemTriangles: 0, organDraws: 0 },
          };
          chunksCreated++;
          chunk.group.name = `tellus-procplants-${key}`;
          active.set(key, chunk);
          root.add(chunk.group);
        }
        chunk.lastNeededMs = nowMs;
        if (chunk.lod !== lod) {
          chunk.lod = lod;
          chunk.rev = -1;
        }
        if (
          chunk.rev !== terrainRev ||
          chunk.styleRev !== PROCPLANT_RENDER_STYLE_REVISION ||
          chunk.styleCenterCx !== centerCx ||
          chunk.styleCenterCz !== centerCz
        ) enqueue(key);
      }
    }
    for (const [key, chunk] of active) {
      if (needed.has(key)) continue;
      if (nowMs - chunk.lastNeededMs < FAR_CHUNK_EVICT_GRACE_MS) continue;
      root.remove(chunk.group);
      disposeGroup(chunk.group);
      active.delete(key);
      chunksEvicted++;
    }
    prioritizeRebuildQueue(centerCx, centerCz);
    const movementIntentActive = options.shouldPauseBuild?.() ?? false;
    const stationary = !movementIntentActive && (chunksBuilt === 0 || nowMs - lastPlayerMovedAt > 650);
    buildPausedForMotion = !stationary && rebuildQueue.length > 0;
    if (buildPausedForMotion) {
      lastUpdateMs = performance.now() - updateStartedAt;
      maxUpdateMs = Math.max(maxUpdateMs, lastUpdateMs);
      return;
    }
    const maxBuilds = stationary
      ? (fps < 28 ? LOW_FPS_BUILD_BUDGET + 1 : NORMAL_BUILD_BUDGET + 2)
      : (fps < 28 ? LOW_FPS_BUILD_BUDGET : NORMAL_BUILD_BUDGET);
    const buildMsBudget = stationary
      ? (fps < 28 ? LOW_FPS_BUILD_MS_BUDGET + 1.5 : NORMAL_BUILD_MS_BUDGET + 3)
      : (fps < 28 ? LOW_FPS_BUILD_MS_BUDGET : NORMAL_BUILD_MS_BUDGET);
    const buildStartedAt = performance.now();
    let budget = maxBuilds;
    while (budget > 0 && rebuildQueue.length > 0) {
      const key = rebuildQueue.shift()!;
      queued.delete(key);
      const chunk = active.get(key);
      if (!chunk || chunk.rev === terrainRev) continue;
      const chunkBuildStartedAt = performance.now();
      buildChunk(chunk);
      const chunkBuildMs = performance.now() - chunkBuildStartedAt;
      lastBuildMs = chunkBuildMs;
      maxBuildMs = Math.max(maxBuildMs, chunkBuildMs);
      totalBuildMs += chunkBuildMs;
      chunksBuilt++;
      builtLastUpdate++;
      budget--;
      if (performance.now() - buildStartedAt >= buildMsBudget) break;
    }
    lastUpdateMs = performance.now() - updateStartedAt;
    maxUpdateMs = Math.max(maxUpdateMs, lastUpdateMs);
  };

  const stats = (): ProcPlantVegetationStats => {
    const out = emptyStats();
    out.chunks = active.size;
    out.manualPlants = manualPlacements.size;
    out.viewMode = viewMode();
    out.queuedRebuilds = rebuildQueue.length;
    out.terrainInvalidations = terrainInvalidations;
    out.chunksCreated = chunksCreated;
    out.chunksEvicted = chunksEvicted;
    out.chunksBuilt = chunksBuilt;
    out.lastUpdateMs = Math.round(lastUpdateMs * 10) / 10;
    out.maxUpdateMs = Math.round(maxUpdateMs * 10) / 10;
    out.lastBuildMs = Math.round(lastBuildMs * 10) / 10;
    out.maxBuildMs = Math.round(maxBuildMs * 10) / 10;
    out.totalBuildMs = Math.round(totalBuildMs);
    out.builtLastUpdate = builtLastUpdate;
    out.buildPausedForMotion = buildPausedForMotion;
    out.buildDeferred = buildDeferred;
    for (const chunk of active.values()) {
      out.plants += chunk.stats.plants;
      out.instances += chunk.stats.instances;
      out.stemTriangles += chunk.stats.stemTriangles;
      out.organDraws += chunk.stats.organDraws;
      if (chunk.lod === 0) out.lod0++;
      else if (chunk.lod === 1) out.lod1++;
      else out.lod2++;
    }
    return out;
  };

  return {
    update,
    notifyTerrainChanged: () => {
      if (!terrainDirty) terrainInvalidations++;
      terrainDirty = true;
    },
    placeManualPlant: (placement, writeOptions = {}) => {
      if (disposed) return false;
      const normalized = normalizeManualPlacement(placement);
      if (!normalized) return false;
      const previousKey = manualPlacementChunks.get(normalized.id);
      rememberManualPlacement(normalized);
      if (previousKey && previousKey !== manualPlacementChunks.get(normalized.id)) enqueue(previousKey);
      if (writeOptions.persist !== false) saveManualPlacements();
      return true;
    },
    replaceManualPlants: (placements, writeOptions = {}) => {
      if (disposed) return;
      manualPlacements.clear();
      manualPlacementChunks.clear();
      enqueueAllActive();
      for (const placement of placements) {
        const normalized = normalizeManualPlacement(placement);
        if (normalized) rememberManualPlacement(normalized);
      }
      if (writeOptions.persist !== false) saveManualPlacements();
    },
    removeManualPlant: (id, writeOptions = {}) => {
      if (disposed) return false;
      const key = manualPlacementChunks.get(id);
      const removed = manualPlacements.delete(id);
      manualPlacementChunks.delete(id);
      if (key) enqueue(key);
      if (removed && writeOptions.persist !== false) saveManualPlacements();
      return removed;
    },
    manualPlantPlacements: () => [...manualPlacements.values()],
    stats,
    dispose: () => {
      disposed = true;
      for (const chunk of active.values()) disposeGroup(chunk.group);
      active.clear();
      root.clear();
      options.scene.remove(root);
      stemMaterial.dispose();
      organMaterial.dispose();
    },
  };
}
