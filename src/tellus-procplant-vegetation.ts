import * as THREE from "three";
import { SEA_LEVEL, WORLD_RADIUS } from "./tellus-constants";
import type { TerrainPaintKind } from "./tellus-types";
import {
  biomePatchForPaint,
  environmentForBiomePatch,
  genomeForBiomePatch,
} from "./tellus-procplant-biomes";
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
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  chunkSize?: number;
  maxRing?: number;
  densityMultiplier?: number;
  isExcluded?: (x: number, z: number, height: number) => boolean;
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
}

export interface ProcPlantVegetationSystem {
  update(px: number, pz: number, playerY: number, fps: number, nowMs: number): void;
  notifyTerrainChanged(): void;
  placeManualPlant(placement: ProcPlantManualPlacement): boolean;
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

interface ActiveChunk {
  key: string;
  cx: number;
  cz: number;
  lod: 0 | 1 | 2;
  rev: number;
  group: THREE.Group;
  stats: Omit<ProcPlantVegetationStats, "chunks" | "manualPlants" | "lod0" | "lod1" | "lod2">;
}

interface OrganBucket {
  key: string;
  geometry: THREE.BufferGeometry;
  instances: ProcPlantInstance[];
}

const DEFAULT_CHUNK_SIZE = 12;
const DEFAULT_MAX_RING = 2;
const MAX_LOD0_PLANTS = 16;
const MAX_LOD1_PLANTS = 6;

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
    scale: THREE.MathUtils.clamp(record.scale, 0.08, 12),
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
  let disposed = false;
  const active = new Map<string, ActiveChunk>();
  const manualPlacements = new Map<string, ProcPlantManualPlacement>();
  const manualPlacementChunks = new Map<string, string>();
  const queued = new Set<string>();
  const rebuildQueue: string[] = [];
  const stemMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const organMaterial = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });

  const inBounds = (x: number, z: number) =>
    x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;

  const chunkKeyAt = (x: number, z: number) =>
    `${Math.floor(x / chunkSize)},${Math.floor(z / chunkSize)}`;

  const enqueue = (key: string) => {
    if (queued.has(key)) return;
    queued.add(key);
    rebuildQueue.push(key);
  };

  const rememberManualPlacement = (placement: ProcPlantManualPlacement) => {
    const key = chunkKeyAt(placement.x, placement.z);
    manualPlacements.set(placement.id, placement);
    manualPlacementChunks.set(placement.id, key);
    enqueue(key);
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
    const seed = procPlantChunkSeed(options.worldId, chunk.cx, chunk.cz, terrainRev);
    const rand = mulberry32(seed);
    const plantCap = chunk.lod === 0
      ? Math.max(1, Math.round(MAX_LOD0_PLANTS * densityMultiplier))
      : chunk.lod === 1
        ? Math.max(1, Math.round(MAX_LOD1_PLANTS * densityMultiplier))
        : 0;
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
      if (height === null || height < SEA_LEVEL - 12) continue;
      if (options.isExcluded?.(x, z, height)) continue;
      const paint = options.samplePaint(x, z);
      const patch = biomePatchForPaint(paint, seed ^ Math.imul(i + 1, 0x9e3779b1));
      if (!patch || rand() > patch.density * densityMultiplier * (chunk.lod === 0 ? 1 : 0.58)) continue;
      const genome = genomeForBiomePatch(patch);
      const env = environmentForBiomePatch(patch);
      const built = buildProcPlantInstancedParts(genome, patch.seed ^ i, env);
      const scale = patch.scale * THREE.MathUtils.lerp(0.82, 1.22, rand());
      const matrix = new THREE.Matrix4()
        .makeRotationY(rand() * Math.PI * 2)
        .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale))
        .premultiply(new THREE.Matrix4().makeTranslation(x, height + 0.02, z));
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
      if (height === null || height < SEA_LEVEL - 12) continue;
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
        .premultiply(new THREE.Matrix4().makeTranslation(placement.x, height + 0.02, placement.z));
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
      mesh.castShadow = true;
      mesh.receiveShadow = true;
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
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      chunk.group.add(mesh);
      chunk.stats.organDraws++;
    }
  };

  const update = (px: number, pz: number, _playerY: number, fps: number) => {
    if (disposed) return;
    const ringCap = fps < 28 ? Math.min(1, maxRing) : maxRing;
    const centerCx = Math.floor(px / chunkSize);
    const centerCz = Math.floor(pz / chunkSize);
    const needed = new Set<string>();
    for (let dz = -ringCap; dz <= ringCap; dz++) {
      for (let dx = -ringCap; dx <= ringCap; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        const lod = ring <= 1 ? 0 : ring === 2 ? 1 : 2;
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
            group: new THREE.Group(),
            stats: { plants: 0, instances: 0, stemTriangles: 0, organDraws: 0 },
          };
          chunk.group.name = `tellus-procplants-${key}`;
          active.set(key, chunk);
          root.add(chunk.group);
        }
        if (chunk.lod !== lod) {
          chunk.lod = lod;
          chunk.rev = -1;
        }
        if (chunk.rev !== terrainRev) enqueue(key);
      }
    }
    for (const [key, chunk] of active) {
      if (needed.has(key)) continue;
      root.remove(chunk.group);
      disposeGroup(chunk.group);
      active.delete(key);
    }
    let budget = 2;
    while (budget > 0 && rebuildQueue.length > 0) {
      const key = rebuildQueue.shift()!;
      queued.delete(key);
      const chunk = active.get(key);
      if (!chunk || chunk.rev === terrainRev) continue;
      buildChunk(chunk);
      budget--;
    }
  };

  const stats = (): ProcPlantVegetationStats => {
    const out = emptyStats();
    out.chunks = active.size;
    out.manualPlants = manualPlacements.size;
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
      terrainRev++;
      for (const key of active.keys()) enqueue(key);
    },
    placeManualPlant: (placement) => {
      if (disposed) return false;
      const normalized = normalizeManualPlacement(placement);
      if (!normalized) return false;
      rememberManualPlacement(normalized);
      saveManualPlacements();
      return true;
    },
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
