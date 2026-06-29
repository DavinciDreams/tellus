import * as THREE from "three";
import { MeshLambertNodeMaterial } from "three/webgpu";
import {
  attribute,
  dot,
  float,
  length,
  max,
  positionLocal,
  sin,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { SEA_LEVEL, WORLD_RADIUS } from "./tellus-constants";
import { createGltfLoader } from "./tellus-generation-client";
import type { TerrainPaintKind } from "./tellus-types";
import {
  type StampCursor,
  type StampTarget,
  type Template,
  buildBoulderTemplate,
  buildBirchTemplate,
  buildBroadleafTemplate,
  buildBushTemplate,
  buildConiferTemplate,
  buildCrystalTemplate,
  buildDeadTreeTemplate,
  buildFernTemplate,
  buildFlowerTemplate,
  buildGrassTemplate,
  buildHairGrassTemplate,
  buildMushroomTemplate,
  buildPalmTemplate,
  buildPineTemplate,
  buildReedTemplate,
  buildRockTemplate,
  cellSeed,
  mulberry32,
  stampTemplate,
} from "./tellus-veg-archetypes";

// ── Ambient procedural vegetation ─────────────────────────────────────────────────────────────────
// Crysis-style ground cover, deterministic from the synced terrain state (fixed seeds + chunk/sector
// coords), so every client grows the identical world with no protocol changes. Two layers:
//
//  • CHUNKS (12u, streamed around the player): optional grass tufts stamped into pre-allocated
//    merged buffers — one draw call per chunk, wind sway / gust / player-bend / distance-fade in a
//    TSL node material on WebGPU (static Lambert on the WebGL fallback).
//
//  • SECTORS (72u, island-wide, frustum-culled): trees (conifer/broadleaf/pine/birch/palm/dead),
//    rebuilt only when the terrain changes. Sector granularity keeps huge worlds
//    (large-*/mega-*) from paying vertex cost for off-screen forests. Trunks feed the
//    player-collision circle list.
//
// Density adapts to the live FPS through quality tiers (MIN→ULTRA); scatter density is per-paint-kind
// (meadow lush, beach palms, snow pines, …) and respects height/slope/water/pond rules.

export interface VegetationOptions {
  scene: THREE.Scene;
  useWebGPU: boolean;
  sampleHeight: (x: number, z: number) => number;
  samplePaint: (x: number, z: number) => TerrainPaintKind | null;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  sectorsEnabled?: boolean;
  grassOnly?: boolean;
  suppressGrass?: boolean;
  suppressSmallFlora?: boolean;
  maxFlowersPerChunk?: number;
  initialTier?: number;
  maxTier?: number;
  /** Extra exclusion test (the pond bowl) — return true to keep this spot clear. */
  isExcluded: (x: number, z: number, height: number) => boolean;
  /** Pond ring info for reed placement. */
  pondRing?: { x: number; z: number; radius: number; level: number };
}

export interface VegetationStats {
  tier: number;
  chunks: number;
  grassIndices: number;
  trees: number;
  sectors: number;
}

export interface TreeCollider {
  x: number;
  z: number;
  r: number;
}

export interface VegetationSystem {
  update(px: number, pz: number, playerY: number, fps: number, nowMs: number): void;
  notifyTerrainChanged(): void;
  getTreeColliders(): TreeCollider[];
  stats(): VegetationStats;
  dispose(): void;
}

const CHUNK = 12;
const SECTOR = 72;
const MAX_TUFTS = 320;
const MAX_FLOWERS = 0;
const MAX_EXTRAS = 0;
const TUFT_CANDIDATES = 460;

// Quality tiers — radius streams fewer chunks AND trims the per-chunk cap. The accepted-candidate
// prefix is tier-independent, so tier flips trim/extend growth without reshuffling it.
// The controller targets a 30fps floor (operator call: "30fps or greater, no issues") — it sheds
// below ~32 and keeps climbing toward GIGA whenever there's sustained headroom, so strong GPUs fill
// a huge radius and weak ones settle wherever they hold 30+.
// Operator-tuned: RANGE is the luxury, thickness isn't — densities stay moderate at every tier so
// huge radii cost less (cover thins; the distance fade hides it).
const TIERS = [
  { radius: 18, density: 0.35 }, // 0 MIN
  { radius: 27, density: 0.5 }, // 1 LOW
  { radius: 36, density: 0.6 }, // 2 MED
  { radius: 48, density: 0.7 }, // 3 HIGH
  { radius: 64, density: 0.78 }, // 4 ULTRA
  { radius: 84, density: 0.85 }, // 5 GIGA — the WebGPU default
  { radius: 108, density: 0.85 }, // 6 TERA
  { radius: 136, density: 0.85 }, // 7 COSMIC (only with sustained headroom)
] as const;

const GRASS_BY_PAINT: Record<string, { accept: number; tint: number; tall: number }> = {
  meadow: { accept: 0.92, tint: 0x77ab40, tall: 1.0 },
  grass: { accept: 0.92, tint: 0x76b33f, tall: 1.0 },
  flowers: { accept: 0.85, tint: 0x86b148, tall: 0.92 },
  dirt: { accept: 0.3, tint: 0x9a9a52, tall: 0.7 },
  beach: { accept: 0.1, tint: 0xb9c46a, tall: 0.55 },
  rock: { accept: 0.05, tint: 0x7d9a55, tall: 0.6 },
  snow: { accept: 0.04, tint: 0xa9c9a0, tall: 0.5 },
  stone: { accept: 0, tint: 0x76866d, tall: 0.35 },
  brick: { accept: 0, tint: 0x8a7a55, tall: 0.3 },
};

const FLOWER_PALETTE = [0xffffff, 0xffd7e8, 0xffe9a8, 0xc9b8ff, 0xffb0a0, 0x9fd8ff];
const CRYSTAL_PALETTE = [0xbef0ff, 0xffc9f0, 0xfff3b8, 0xc9ffd6];
type TexturedTreeAssetId = "pine5" | "common3" | "retro1" | "retro3";

interface TexturedTreeSubmesh {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

interface TexturedTreeAsset {
  id: TexturedTreeAssetId;
  submeshes: TexturedTreeSubmesh[];
}

interface TexturedTreePlacement {
  assetId: TexturedTreeAssetId;
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
}

const TEXTURED_TREE_ASSETS: Record<TexturedTreeAssetId, string> = {
  pine5: "/vegetation/quaternius-megakit/pine_5.gltf",
  common3: "/vegetation/quaternius-megakit/common_tree_3.gltf",
  retro1: "/vegetation/retro-tree-pack/retro_low_1.glb",
  retro3: "/vegetation/retro-tree-pack/retro_low_3.glb",
};

interface PooledMesh extends StampTarget {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
}

interface ActiveChunk {
  key: string;
  cx: number;
  cz: number;
  pooled: PooledMesh;
  rev: number;
  tier: number;
}

const cloneVegetationMaterial = (material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] => {
  const cloneOne = (source: THREE.Material): THREE.Material => {
    const clone = source.clone();
    if ("side" in clone) clone.side = THREE.DoubleSide;
    return clone;
  };
  return Array.isArray(material) ? material.map(cloneOne) : cloneOne(material);
};

const buildTexturedTreeAsset = (id: TexturedTreeAssetId, root: THREE.Object3D): TexturedTreeAsset | null => {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0.001) return null;
  const centerX = (bounds.min.x + bounds.max.x) * 0.5;
  const centerZ = (bounds.min.z + bounds.max.z) * 0.5;
  const normalize = new THREE.Matrix4()
    .makeTranslation(-centerX, -bounds.min.y, -centerZ)
    .premultiply(new THREE.Matrix4().makeScale(1 / height, 1 / height, 1 / height));
  const submeshes: TexturedTreeSubmesh[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.applyMatrix4(normalize);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    const material = cloneVegetationMaterial(object.material);
    submeshes.push({ geometry, material });
  });
  return submeshes.length > 0 ? { id, submeshes } : null;
};

export function createVegetation(options: VegetationOptions): VegetationSystem {
  const { scene, useWebGPU, sampleHeight, samplePaint, isExcluded, pondRing } = options;
  const grassOnly = options.grassOnly ?? false;
  const suppressGrass = options.suppressGrass ?? false;
  const suppressSmallFlora = options.suppressSmallFlora ?? false;
  const maxFlowersPerChunk = Math.max(0, Math.floor(options.maxFlowersPerChunk ?? MAX_FLOWERS));

  // World geometry captured at construction (setWorldScale ran before the world was created).
  const minWorldX = options.bounds?.minX ?? -WORLD_RADIUS;
  const maxWorldX = options.bounds?.maxX ?? WORLD_RADIUS;
  const minWorldZ = options.bounds?.minZ ?? -WORLD_RADIUS;
  const maxWorldZ = options.bounds?.maxZ ?? WORLD_RADIUS;
  const spanX = maxWorldX - minWorldX;
  const spanZ = maxWorldZ - minWorldZ;
  const classicDiscBounds = !options.bounds;
  const halfWorld = WORLD_RADIUS;
  const gridX = Math.ceil(spanX / CHUNK);
  const gridZ = Math.ceil(spanZ / CHUNK);
  const sectorsPerSideX = Math.ceil(spanX / SECTOR);
  const sectorsPerSideZ = Math.ceil(spanZ / SECTOR);
  const sectorsEnabled = options.sectorsEnabled ?? true;
  const inWorld = (x: number, z: number, margin = 0) => {
    if (!classicDiscBounds) {
      return (
        x >= minWorldX + margin &&
        x <= maxWorldX - margin &&
        z >= minWorldZ + margin &&
        z <= maxWorldZ - margin
      );
    }
    return x * x + z * z <= (halfWorld - margin) * (halfWorld - margin);
  };

  // Templates
  const grassTpl = grassOnly ? buildHairGrassTemplate() : buildGrassTemplate();
  const flowerTpl = buildFlowerTemplate();
  const fernTpl = buildFernTemplate();
  const reedTpl = buildReedTemplate();
  const bushTpl = buildBushTemplate();
  const mushroomTpl = buildMushroomTemplate();
  const crystalTpl = buildCrystalTemplate();
  const rockTpl = buildRockTemplate();
  const boulderTpl = buildBoulderTemplate();
  const treeTpls: Record<string, Template> = {
    conifer: buildConiferTemplate(),
    broadleaf: buildBroadleafTemplate(),
    pine: buildPineTemplate(),
    birch: buildBirchTemplate(),
    palm: buildPalmTemplate(),
    deadtree: buildDeadTreeTemplate(),
  };
  const maxTreeVerts = Math.max(...Object.values(treeTpls).map((t) => t.pos.length / 3));
  const maxTreeIdx = Math.max(...Object.values(treeTpls).map((t) => t.idx.length));

  // Shared uniforms
  const uPlayer = uniform(new THREE.Vector3(0, -100, 0));
  const uCamXZ = uniform(new THREE.Vector2(0, 0));
  const uFade = uniform(new THREE.Vector2(30, 42));
  const uWindDir = uniform(new THREE.Vector2(0.83, 0.55));

  const makeSwayMaterial = (windAmp: number, bend: boolean, fade: boolean): THREE.Material => {
    if (!useWebGPU) {
      return new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    }
    const material = new MeshLambertNodeMaterial();
    material.vertexColors = true;
    material.side = THREE.DoubleSide;
    const root = vec4(attribute("aVegRoot", "vec4"));
    const rootXZ = vec2(root.x, root.y);
    const phase = root.z;
    const swayW = root.w;
    const gust = sin(time.mul(0.55).add(dot(rootXZ, uWindDir).mul(0.09))).mul(0.5).add(0.5);
    const flutter = sin(time.mul(1.9).add(phase))
      .mul(0.6)
      .add(sin(time.mul(3.7).add(phase.mul(1.7))).mul(0.25));
    const amp = float(windAmp).mul(gust.mul(0.85).add(0.25)).mul(swayW);
    let offset = vec3(uWindDir.x, 0, uWindDir.y).mul(flutter.mul(amp));
    if (bend) {
      const toVert = rootXZ.sub(vec2(uPlayer.x, uPlayer.z));
      const dist = length(toVert);
      const press = smoothstep(1.9, 0.3, dist).mul(swayW).mul(0.85);
      const dir = toVert.div(max(dist, 0.001));
      offset = offset.add(vec3(dir.x, press.mul(-0.22), dir.y).mul(press));
    }
    let position = vec3(positionLocal);
    if (fade) {
      const d = length(rootXZ.sub(uCamXZ));
      const f = smoothstep(uFade.y, uFade.x, d);
      position = vec3(
        positionLocal.x.sub(root.x).mul(f).add(root.x),
        positionLocal.y.mul(f.mul(0.85).add(0.15)),
        positionLocal.z.sub(root.y).mul(f).add(root.y),
      );
      offset = offset.mul(f);
    }
    material.positionNode = position.add(offset);
    return material;
  };

  const grassMaterial = makeSwayMaterial(0.16, true, true);
  const treeMaterial = makeSwayMaterial(0.05, false, false);
  const rockMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });

  const group = new THREE.Group();
  group.name = "tellus-vegetation";
  scene.add(group);
  const texturedTreeAssets = new Map<TexturedTreeAssetId, TexturedTreeAsset>();
  let texturedTreeLoadStarted = false;
  const requestTexturedTreeAssets = () => {
    if (texturedTreeLoadStarted || typeof window === "undefined") return;
    texturedTreeLoadStarted = true;
    const loader = createGltfLoader();
    let pending = Object.keys(TEXTURED_TREE_ASSETS).length;
    let loadedAny = false;
    const finishOne = () => {
      pending--;
      if (pending === 0 && loadedAny) terrainRev++;
    };
    (Object.entries(TEXTURED_TREE_ASSETS) as Array<[TexturedTreeAssetId, string]>).forEach(([id, url]) => {
      loader.load(
        url,
        (gltf) => {
          const asset = buildTexturedTreeAsset(id, gltf.scene);
          if (asset) {
            texturedTreeAssets.set(id, asset);
            loadedAny = true;
          }
          finishOne();
        },
        undefined,
        (error) => {
          console.warn(`[vegetation] failed to load textured tree asset ${id}`, error);
          finishOne();
        },
      );
    });
  };
  requestTexturedTreeAssets();

  const chunkTuftCap = suppressGrass ? 0 : grassOnly ? Math.round(MAX_TUFTS * 1.65) : MAX_TUFTS;
  const chunkFlowerCap = grassOnly ? 0 : maxFlowersPerChunk;
  const chunkExtraCap = grassOnly || suppressSmallFlora ? 0 : MAX_EXTRAS;
  const chunkVertCap =
    chunkTuftCap * (grassTpl.pos.length / 3) +
    chunkFlowerCap * (flowerTpl.pos.length / 3) +
    chunkExtraCap * 200;
  const chunkIdxCap =
    chunkTuftCap * grassTpl.idx.length +
    chunkFlowerCap * flowerTpl.idx.length +
    chunkExtraCap * 320;

  const makePooled = (vertCap: number, idxCap: number, material: THREE.Material): PooledMesh => {
    const geometry = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(vertCap * 3), 3);
    const nrm = new THREE.BufferAttribute(new Float32Array(vertCap * 3), 3);
    const col = new THREE.BufferAttribute(new Float32Array(vertCap * 3), 3);
    const root = new THREE.BufferAttribute(new Float32Array(vertCap * 4), 4);
    const index = new THREE.BufferAttribute(new Uint32Array(idxCap), 1);
    for (const a of [pos, nrm, col, root, index]) a.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", pos);
    geometry.setAttribute("normal", nrm);
    geometry.setAttribute("color", col);
    geometry.setAttribute("aVegRoot", root);
    geometry.setIndex(index);
    geometry.setDrawRange(0, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, geometry, pos, nrm, col, root, index };
  };

  const markPooledUpdated = (pooled: PooledMesh, indexCount: number) => {
    pooled.pos.needsUpdate = true;
    pooled.nrm.needsUpdate = true;
    pooled.col.needsUpdate = true;
    pooled.root.needsUpdate = true;
    pooled.index.needsUpdate = true;
    pooled.geometry.setDrawRange(0, indexCount);
    pooled.mesh.visible = indexCount > 0;
  };

  const setBounds = (pooled: PooledMesh, cx: number, cz: number, size: number, minY: number, maxY: number) => {
    let sphere = pooled.geometry.boundingSphere;
    if (!sphere) {
      sphere = new THREE.Sphere();
      pooled.geometry.boundingSphere = sphere;
    }
    if (!Number.isFinite(minY)) {
      minY = 0;
      maxY = 1;
    }
    sphere.center.set(cx, (minY + maxY) / 2, cz);
    sphere.radius = Math.hypot(size * 0.75, (maxY - minY) / 2 + 2) + 1;
  };

  const freePool: PooledMesh[] = [];
  const acquirePooled = (): PooledMesh => freePool.pop() ?? makePooled(chunkVertCap, chunkIdxCap, grassMaterial);
  const releasePooled = (p: PooledMesh) => {
    p.mesh.visible = false;
    p.geometry.setDrawRange(0, 0);
    freePool.push(p);
  };

  const active = new Map<string, ActiveChunk>();
  let terrainRev = 1;
  let tier = Math.min(options.initialTier ?? (useWebGPU ? 5 : 1), TIERS.length - 1);
  const maxTier = Math.min(options.maxTier ?? (useWebGPU ? 7 : 2), TIERS.length - 1);
  let tierGoodSince = 0;
  let tierLowSince = 0;
  let lastTierDropAt = 0;
  let lastDiffAt = 0;
  let lastDiffX = Infinity;
  let lastDiffZ = Infinity;
  const rebuildQueue: string[] = [];
  const queued = new Set<string>();
  let disposed = false;

  const slopeAt = (x: number, z: number, h: number) => {
    const dx = sampleHeight(x + 0.9, z) - h;
    const dz = sampleHeight(x, z + 0.9) - h;
    return Math.sqrt(dx * dx + dz * dz) / 0.9;
  };

  const inPondRing = (x: number, z: number): boolean => {
    if (!pondRing) return false;
    const d = Math.hypot(x - pondRing.x, z - pondRing.z);
    return d > pondRing.radius - 1 && d < pondRing.radius + 2.4;
  };

  const tintColor = new THREE.Color();
  const flowerPaintWeight = (x: number, z: number): number => {
    if (samplePaint(x, z) === "flowers") return 1;
    const near = 0.9;
    if (
      samplePaint(x + near, z) === "flowers" ||
      samplePaint(x - near, z) === "flowers" ||
      samplePaint(x, z + near) === "flowers" ||
      samplePaint(x, z - near) === "flowers"
    ) {
      return 0.72;
    }
    const far = 1.8;
    if (
      samplePaint(x + far, z + far) === "flowers" ||
      samplePaint(x - far, z + far) === "flowers" ||
      samplePaint(x + far, z - far) === "flowers" ||
      samplePaint(x - far, z - far) === "flowers"
    ) {
      return 0.38;
    }
    return 0;
  };

  // ── Chunk build: optional grass tufts ──
  const buildChunk = (chunk: ActiveChunk) => {
    const { cx, cz, pooled } = chunk;
    const ox = minWorldX + cx * CHUNK;
    const oz = minWorldZ + cz * CHUNK;
    const rng = mulberry32(cellSeed(cx, cz, 0x5eed));
    const cur: StampCursor = { v: 0, i: 0 };
    const tierCap = Math.round(chunkTuftCap * TIERS[tier].density);
    const tuftCandidates = grassOnly ? TUFT_CANDIDATES * 2 : TUFT_CANDIDATES;
    let placed = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    const track = (h: number, top: number) => {
      if (h < minY) minY = h;
      if (h + top > maxY) maxY = h + top;
    };
    for (let i = 0; i < tuftCandidates && placed < tierCap; i++) {
      const x = ox + rng() * CHUNK;
      const z = oz + rng() * CHUNK;
      const roll = rng();
      const sJit = rng();
      const yawJit = rng();
      const tintJit = rng();
      const phaseJit = rng();
      if (!inWorld(x, z, 1.2)) continue;
      const h = sampleHeight(x, z);
      if (h < SEA_LEVEL + 0.45) continue;
      if (isExcluded(x, z, h)) continue;
      const paint = samplePaint(x, z);
      const styleKey = grassOnly && paint === "flowers" ? "meadow" : paint ?? "meadow";
      const style = GRASS_BY_PAINT[styleKey] ?? GRASS_BY_PAINT.meadow;
      if (roll > style.accept) continue;
      if (slopeAt(x, z, h) > 1.15) continue;
      tintColor.setHex(style.tint);
      tintColor.offsetHSL((tintJit - 0.5) * 0.045, (tintJit - 0.5) * 0.1, (sJit - 0.5) * 0.07);
      const scale = (grassOnly ? 0.46 + sJit * 0.34 : 0.7 + sJit * 0.55) * style.tall;
      const sink = grassOnly ? 0.035 : 0.02;
      if (!stampTemplate(pooled, cur, grassTpl, x, h - sink, z, scale, yawJit * Math.PI * 2, tintColor, phaseJit * Math.PI * 2, 1)) break;
      placed++;
      track(h, scale);
    }
    // Flowers: bright old-style card blooms, placed from a jittered grid so paint strokes fill in
    // predictably instead of depending on a sparse random lottery.
    let flowers = 0;
    const stampFlowerCluster = (
      x: number,
      z: number,
      h: number,
      clusterCount: number,
      basePick: number,
      baseYaw: number,
      baseScale: number,
    ) => {
      for (let c = 0; c < clusterCount && flowers < chunkFlowerCap; c++) {
        const angle = baseYaw * Math.PI * 2 + c * 2.399963 + (rng() - 0.5) * 0.5;
        const radius = c === 0 ? 0 : 0.12 + rng() * 0.2;
        const fx = x + Math.cos(angle) * radius;
        const fz = z + Math.sin(angle) * radius;
        if (!inWorld(fx, fz, 1.2)) continue;
        const fh = c === 0 ? h : sampleHeight(fx, fz);
        if (fh < SEA_LEVEL + 0.45 || isExcluded(fx, fz, fh) || slopeAt(fx, fz, fh) > 0.92) continue;
        const pick = (basePick + rng() * 0.65 + c * 0.17) % 1;
        const scale = baseScale * (c === 0 ? 1 : 0.72 + rng() * 0.24);
        tintColor.setHex(FLOWER_PALETTE[Math.floor(pick * FLOWER_PALETTE.length) % FLOWER_PALETTE.length]);
        if (!stampTemplate(pooled, cur, flowerTpl, fx, fh - 0.015, fz, scale, angle, tintColor, pick * Math.PI * 2, 0.8)) {
          return false;
        }
        flowers++;
        track(fh, scale);
      }
      return true;
    };
    const flowerStep = 0.95;
    for (
      let gz = flowerStep * 0.5;
      gz < CHUNK && flowers < chunkFlowerCap;
      gz += flowerStep
    ) {
      for (
        let gx = flowerStep * 0.5;
        gx < CHUNK && flowers < chunkFlowerCap;
        gx += flowerStep
      ) {
        const jitter = flowerStep * 0.42;
        const x = ox + gx + (rng() - 0.5) * jitter;
        const z = oz + gz + (rng() - 0.5) * jitter;
        const pick = rng();
        const roll = rng();
        const yawJit = rng();
        if (!inWorld(x, z, 1.2)) continue;
        const paintWeight = flowerPaintWeight(x, z);
        const paint = paintWeight > 0 ? "flowers" : samplePaint(x, z);
        const accept = paintWeight > 0 ? 0.98 * paintWeight : paint === "meadow" || paint === null ? 0.012 : 0;
        if (roll > accept * (0.78 + TIERS[tier].density * 0.22)) continue;
        const h = sampleHeight(x, z);
        if (h < SEA_LEVEL + 0.45 || isExcluded(x, z, h) || slopeAt(x, z, h) > 0.92) continue;
        const clusterCount = paintWeight > 0 ? 3 : pick > 0.78 ? 2 : 1;
        if (!stampFlowerCluster(x, z, h, clusterCount, pick, yawJit, 0.72 + pick * 0.24)) break;
      }
    }
    // A few extra random blooms keep meadows from feeling perfectly tiled.
    for (let i = 0; i < chunkFlowerCap && flowers < chunkFlowerCap; i++) {
      const x = ox + rng() * CHUNK;
      const z = oz + rng() * CHUNK;
      const roll = rng();
      const pick = rng();
      const yawJit = rng();
      if (!inWorld(x, z, 1.2)) continue;
      const paint = samplePaint(x, z);
      const accept = paint === "flowers" ? 0.5 : paint === "meadow" || paint === null ? 0.025 : 0;
      if (roll > accept * TIERS[tier].density) continue;
      const h = sampleHeight(x, z);
      if (h < SEA_LEVEL + 0.45 || isExcluded(x, z, h) || slopeAt(x, z, h) > 0.9) continue;
      const clusterCount = paint === "flowers" ? 3 : pick > 0.84 ? 2 : 1;
      if (!stampFlowerCluster(x, z, h, clusterCount, pick, yawJit, 0.68 + pick * 0.28)) break;
    }
    // small flora: bushes / ferns / mushrooms / reeds (waterline + pond ring) / rare crystals
    let extras = 0;
    for (let i = 0; i < chunkExtraCap * 3 && extras < chunkExtraCap; i++) {
      const x = ox + rng() * CHUNK;
      const z = oz + rng() * CHUNK;
      const roll = rng();
      const pick = rng();
      const yawJit = rng();
      if (!inWorld(x, z, 1.2)) continue;
      const h = sampleHeight(x, z);
      if (isExcluded(x, z, h)) continue;
      const paint = samplePaint(x, z);
      const coastal = h > SEA_LEVEL + 0.05 && h < SEA_LEVEL + 0.9;
      const pondEdge = inPondRing(x, z);
      let tpl: Template | null = null;
      let scale = 1;
      let sway = 0;
      let tint = 0xffffff;
      if ((coastal || pondEdge) && roll < 0.5) {
        tpl = reedTpl;
        scale = 1.4 + pick * 1.1;
        sway = 0.9;
        tint = 0xf0f6d8;
      } else if (h >= SEA_LEVEL + 0.45 && slopeAt(x, z, h) <= 0.8) {
        if ((paint === "meadow" || paint === null) && roll < 0.075) {
          tpl = pick < 0.55 ? bushTpl : fernTpl;
          scale = tpl === bushTpl ? 1.2 + pick * 1.4 : 1.1 + pick * 0.9;
          sway = tpl === bushTpl ? 0.25 : 0.8;
          tint = 0xe9ffd9;
        } else if (paint === "dirt" && roll < 0.08) {
          tpl = pick < 0.6 ? mushroomTpl : fernTpl;
          scale = tpl === mushroomTpl ? 0.4 + pick * 0.6 : 1.0 + pick * 0.8;
          sway = tpl === mushroomTpl ? 0 : 0.8;
          tint = tpl === mushroomTpl ? 0xffd9c9 : 0xddf6cc;
        } else if ((paint === "rock" || paint === "snow") && roll < 0.028) {
          tpl = crystalTpl;
          scale = 1.0 + pick * 1.6;
          sway = 0;
          tint = CRYSTAL_PALETTE[Math.floor(pick * CRYSTAL_PALETTE.length) % CRYSTAL_PALETTE.length];
        }
      }
      if (!tpl) continue;
      tintColor.setHex(tint);
      tintColor.offsetHSL((pick - 0.5) * 0.05, 0, (yawJit - 0.5) * 0.08);
      if (!stampTemplate(pooled, cur, tpl, x, h - 0.02, z, scale, yawJit * Math.PI * 2, tintColor, pick * Math.PI * 2, sway)) break;
      extras++;
      track(h, scale * 1.2);
    }
    markPooledUpdated(pooled, cur.i);
    if (cur.i > 0) setBounds(pooled, ox + CHUNK / 2, oz + CHUNK / 2, CHUNK, minY, maxY);
    chunk.rev = terrainRev;
    chunk.tier = tier;
  };

  // ── Sectors: trees, island-wide, frustum-culled, rebuilt on terrain change ──
  const TREES_PER_SECTOR = 56;
  const ROCKS_PER_SECTOR = 0;
  interface Sector {
    sx: number;
    sz: number;
    trees: PooledMesh | null;
    rocks: PooledMesh | null;
    texturedTrees: THREE.Group | null;
  }
  const sectors: Sector[] = [];
  if (sectorsEnabled) {
    for (let sx = 0; sx < sectorsPerSideX; sx++) {
      for (let sz = 0; sz < sectorsPerSideZ; sz++) {
        const centerX = minWorldX + sx * SECTOR + SECTOR / 2;
        const centerZ = minWorldZ + sz * SECTOR + SECTOR / 2;
        // skip sectors entirely outside the island disc
        if (classicDiscBounds && Math.hypot(centerX, centerZ) - SECTOR * 0.71 > halfWorld) continue;
        sectors.push({ sx, sz, trees: null, rocks: null, texturedTrees: null });
      }
    }
  }
  let treeColliders: TreeCollider[] = [];
  let treeCount = 0;
  let globalsRev = 0;
  let sectorBuildIndex = 0;
  let sectorColliders: TreeCollider[] = [];

  const disposeTexturedSector = (sector: Sector) => {
    if (!sector.texturedTrees) return;
    group.remove(sector.texturedTrees);
    sector.texturedTrees.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    sector.texturedTrees.clear();
    sector.texturedTrees = null;
  };

  const buildTexturedSector = (sector: Sector, placements: TexturedTreePlacement[]) => {
    disposeTexturedSector(sector);
    if (placements.length === 0) return;
    const byAsset = new Map<TexturedTreeAssetId, TexturedTreePlacement[]>();
    for (const placement of placements) {
      const asset = texturedTreeAssets.get(placement.assetId);
      if (!asset) continue;
      let list = byAsset.get(asset.id);
      if (!list) {
        list = [];
        byAsset.set(asset.id, list);
      }
      list.push(placement);
    }
    if (byAsset.size === 0) return;
    const texturedGroup = new THREE.Group();
    texturedGroup.name = `tellus-textured-trees-${sector.sx}:${sector.sz}`;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    for (const [assetId, assetPlacements] of byAsset) {
      const asset = texturedTreeAssets.get(assetId);
      if (!asset) continue;
      for (const submesh of asset.submeshes) {
        const mesh = new THREE.InstancedMesh(submesh.geometry, submesh.material, assetPlacements.length);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        assetPlacements.forEach((placement, index) => {
          position.set(placement.x, placement.y, placement.z);
          quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.yaw);
          scale.setScalar(placement.scale);
          matrix.compose(position, quaternion, scale);
          mesh.setMatrixAt(index, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        texturedGroup.add(mesh);
      }
    }
    sector.texturedTrees = texturedGroup;
    group.add(texturedGroup);
  };

  const pickTree = (paint: TerrainPaintKind | null, h: number, r1: number, r2: number): { tpl: Template; scale: number; assetId?: TexturedTreeAssetId } | null => {
    const meadowish = paint === "meadow" || paint === "grass" || paint === null || paint === "flowers";
    if (paint === "beach" || paint === "desert-sand") {
      if (r1 > 0.16) return null;
      return paint === "desert-sand" && r2 < 0.55
        ? { tpl: treeTpls.deadtree, scale: 3.8 + r2 * 3.2 }
        : { tpl: treeTpls.palm, scale: 5.5 + r2 * 3 };
    }
    if (paint === "snow" || paint === "rock" || h > 10.5) {
      if (r1 > 0.16) return null;
      return r2 < 0.6
        ? { tpl: treeTpls.pine, scale: 8.5 + r2 * 5.5, assetId: "pine5" }
        : { tpl: treeTpls.conifer, scale: 10 + r2 * 7.5, assetId: "common3" };
    }
    if (paint === "forest-floor" || paint === "jungle-moss") {
      if (r1 > (paint === "jungle-moss" ? 0.42 : 0.34)) return null;
      if (paint === "jungle-moss" && r2 > 0.68) return { tpl: treeTpls.palm, scale: 6.8 + r2 * 3.4 };
      if (r2 < 0.46) return { tpl: treeTpls.broadleaf, scale: 5.6 + r2 * 3.6 };
      return { tpl: treeTpls.birch, scale: 5.4 + r2 * 3.8 };
    }
    if (paint === "dirt") {
      if (r1 > 0.26) return null;
      if (r2 < 0.16) return { tpl: treeTpls.deadtree, scale: 4.2 + r2 * 4.5 };
      return { tpl: treeTpls.broadleaf, scale: 4.8 + r2 * 3.2 };
    }
    if (paint === "stone" || paint === "brick") return null;
    if (paint === "gravel") {
      if (r1 > 0.12) return null;
      return r2 < 0.62
        ? { tpl: treeTpls.pine, scale: 8 + r2 * 4.8, assetId: "pine5" }
        : { tpl: treeTpls.conifer, scale: 6.8 + r2 * 3.8, assetId: "retro3" };
    }
    if (meadowish) {
      const accept = paint === "flowers" ? 0.14 : 0.34;
      if (r1 > accept) return null;
      if (r2 < 0.36) return { tpl: treeTpls.birch, scale: 5 + r2 * 4.5 };
      return { tpl: treeTpls.broadleaf, scale: 4.8 + r2 * 3.1 };
    }
    return null;
  };

  const buildSector = (sector: Sector) => {
    const ox = minWorldX + sector.sx * SECTOR;
    const oz = minWorldZ + sector.sz * SECTOR;
    // trees
    sector.trees ??= makePooled(TREES_PER_SECTOR * maxTreeVerts, TREES_PER_SECTOR * maxTreeIdx, treeMaterial);
    sector.trees.mesh.castShadow = false;
    const cur: StampCursor = { v: 0, i: 0 };
    let minY = Infinity;
    let maxY = -Infinity;
    let stamped = 0;
    const texturedPlacements: TexturedTreePlacement[] = [];
    for (let gx = ox + 3; gx < ox + SECTOR && stamped < TREES_PER_SECTOR; gx += 7.5) {
      for (let gz = oz + 3; gz < oz + SECTOR && stamped < TREES_PER_SECTOR; gz += 7.5) {
        const rng = mulberry32(cellSeed(Math.round(gx * 3), Math.round(gz * 3), 0x7ee5));
        const x = gx + rng() * 6;
        const z = gz + rng() * 6;
        if (x < ox || z < oz || x >= ox + SECTOR || z >= oz + SECTOR) continue;
        if (!inWorld(x, z, 3)) continue;
        const h = sampleHeight(x, z);
        if (h < SEA_LEVEL + 0.45) continue;
        if (isExcluded(x, z, h)) continue;
        if (slopeAt(x, z, h) > 0.62) continue;
        const paint = samplePaint(x, z);
        if (paint === "beach" && h > SEA_LEVEL + 2.4) continue;
        const choice = pickTree(paint, h, rng(), rng());
        if (!choice) continue;
        tintColor.setHex(0xffffff);
        tintColor.offsetHSL((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.18, (rng() - 0.5) * 0.1);
        const yaw = rng() * Math.PI * 2;
        if (choice.assetId && texturedTreeAssets.has(choice.assetId)) {
          texturedPlacements.push({ assetId: choice.assetId, x, y: h - 0.02, z, scale: choice.scale, yaw });
        } else if (!stampTemplate(sector.trees, cur, choice.tpl, x, h - 0.06, z, choice.scale, yaw, tintColor, rng() * Math.PI * 2, 1)) {
          break;
        }
        sectorColliders.push({ x, z, r: Math.max(0.42, choice.scale * 0.11) });
        stamped++;
        if (h < minY) minY = h;
        if (h + choice.scale > maxY) maxY = h + choice.scale;
      }
    }
    markPooledUpdated(sector.trees, cur.i);
    if (cur.i > 0) setBounds(sector.trees, ox + SECTOR / 2, oz + SECTOR / 2, SECTOR, minY, maxY);
    buildTexturedSector(sector, texturedPlacements);
    treeCount += stamped;

    if (ROCKS_PER_SECTOR > 0) {
      // rocks + boulders
      sector.rocks ??= makePooled(
        ROCKS_PER_SECTOR * (boulderTpl.pos.length / 3),
        ROCKS_PER_SECTOR * boulderTpl.idx.length,
        rockMaterial,
      );
      sector.rocks.mesh.castShadow = false;
      const rcur: StampCursor = { v: 0, i: 0 };
      let rMinY = Infinity;
      let rMaxY = -Infinity;
      let rocks = 0;
      for (let gx = ox + 2; gx < ox + SECTOR && rocks < ROCKS_PER_SECTOR; gx += 5.5) {
        for (let gz = oz + 2; gz < oz + SECTOR && rocks < ROCKS_PER_SECTOR; gz += 5.5) {
          const rng = mulberry32(cellSeed(Math.round(gx * 5), Math.round(gz * 5), 0x9bb1));
          const x = gx + rng() * 4.4;
          const z = gz + rng() * 4.4;
          if (x < ox || z < oz || x >= ox + SECTOR || z >= oz + SECTOR) continue;
          if (!inWorld(x, z, 2)) continue;
          const h = sampleHeight(x, z);
          if (h < SEA_LEVEL + 0.3) continue;
          if (isExcluded(x, z, h)) continue;
          const paint = samplePaint(x, z);
          const accept =
            paint === "stone" || paint === "brick"
              ? 0
              : paint === "rock" ? 0.55 : paint === "dirt" ? 0.22 : paint === "beach" ? 0.18 : paint === "snow" ? 0.2 : 0.07;
          if (rng() > accept) continue;
          const isBoulder = (paint === "rock" || paint === "dirt") && rng() < 0.16;
          tintColor.setHex(paint === "snow" ? 0xc9cdd4 : 0x8d8a84);
          tintColor.offsetHSL(0, 0, (rng() - 0.5) * 0.14);
          const scale = isBoulder ? 1.6 + rng() * 2.4 : 0.22 + rng() * rng() * 0.8;
          const tpl = isBoulder ? boulderTpl : rockTpl;
          // sink stones well into the ground so a slope never opens a see-through gap under the rim
          if (!stampTemplate(sector.rocks, rcur, tpl, x, h + scale * (isBoulder ? 0.22 : 0.12), z, scale, rng() * Math.PI * 2, tintColor, 0, 0)) break;
          if (isBoulder) sectorColliders.push({ x, z, r: scale * 0.72 });
          rocks++;
          if (h < rMinY) rMinY = h;
          if (h + scale > rMaxY) rMaxY = h + scale;
        }
      }
      markPooledUpdated(sector.rocks, rcur.i);
      if (rcur.i > 0) setBounds(sector.rocks, ox + SECTOR / 2, oz + SECTOR / 2, SECTOR, rMinY, rMaxY);
    }
  };

  // ── streaming + adaptive tier ──
  const chunkKey = (cx: number, cz: number) => `${cx}:${cz}`;
  const enqueueRebuild = (key: string) => {
    if (!queued.has(key)) {
      queued.add(key);
      rebuildQueue.push(key);
    }
  };

  const diffChunks = (px: number, pz: number) => {
    const radius = TIERS[tier].radius;
    const reach = radius + CHUNK * 0.71;
    const minCx = Math.max(0, Math.floor((px - reach - minWorldX) / CHUNK));
    const maxCx = Math.min(gridX - 1, Math.floor((px + reach - minWorldX) / CHUNK));
    const minCz = Math.max(0, Math.floor((pz - reach - minWorldZ) / CHUNK));
    const maxCz = Math.min(gridZ - 1, Math.floor((pz + reach - minWorldZ) / CHUNK));
    const wanted = new Set<string>();
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const dx = minWorldX + cx * CHUNK + CHUNK / 2 - px;
        const dz = minWorldZ + cz * CHUNK + CHUNK / 2 - pz;
        if (dx * dx + dz * dz > reach * reach) continue;
        const key = chunkKey(cx, cz);
        wanted.add(key);
        if (!active.has(key)) {
          active.set(key, { key, cx, cz, pooled: acquirePooled(), rev: 0, tier: -1 });
          enqueueRebuild(key);
        }
      }
    }
    for (const [key, chunk] of active) {
      if (!wanted.has(key)) {
        releasePooled(chunk.pooled);
        active.delete(key);
        queued.delete(key);
      }
    }
  };

  const update = (px: number, pz: number, playerY: number, fps: number, nowMs: number) => {
    if (disposed) return;
    uPlayer.value.set(px, playerY, pz);
    uCamXZ.value.set(px, pz);
    uFade.value.set(TIERS[tier].radius * 0.7, TIERS[tier].radius);

    if (fps > 0) {
      // Hitch-proof shedding: a single GLB-decode stall used to crash several tiers in under a
      // second (outer chunks popped off, then slowly re-grew). Dropping now requires fps < 32
      // SUSTAINED for 1.2s, at most one tier per 2.5s.
      if (fps < 32) {
        if (tierLowSince === 0) tierLowSince = nowMs;
        if (tier > 0 && nowMs - tierLowSince > 1200 && nowMs - lastTierDropAt > 2500) {
          tier--;
          lastTierDropAt = nowMs;
        }
        tierGoodSince = 0;
      } else if (fps > 42 && tier < maxTier) {
        tierLowSince = 0;
        if (tierGoodSince === 0) tierGoodSince = nowMs;
        else if (nowMs - tierGoodSince > 3000) {
          tier++;
          tierGoodSince = 0;
        }
      } else {
        tierLowSince = 0;
        tierGoodSince = 0;
      }
    }

    // sector rebuild on terrain change: reset then time-slice (one sector per frame)
    if (globalsRev !== terrainRev) {
      globalsRev = terrainRev;
      sectorBuildIndex = 0;
      sectorColliders = [];
      treeCount = 0;
    }
    if (sectorBuildIndex < sectors.length) {
      buildSector(sectors[sectorBuildIndex]);
      sectorBuildIndex++;
      if (sectorBuildIndex === sectors.length) treeColliders = sectorColliders;
    }

    const moved = Math.hypot(px - lastDiffX, pz - lastDiffZ);
    if (nowMs - lastDiffAt > 250 && (moved > 3 || nowMs - lastDiffAt > 1500)) {
      lastDiffAt = nowMs;
      lastDiffX = px;
      lastDiffZ = pz;
      diffChunks(px, pz);
    }

    // chunk-rebuild budget per frame: shed work when struggling, fill faster with headroom
    let budget = fps > 0 && fps < 40 ? 1 : fps > 52 ? 3 : 2;
    while (budget > 0 && rebuildQueue.length > 0) {
      const key = rebuildQueue.shift()!;
      queued.delete(key);
      const chunk = active.get(key);
      if (!chunk) continue;
      if (chunk.rev === terrainRev && chunk.tier === tier) continue;
      buildChunk(chunk);
      budget--;
    }
    if (rebuildQueue.length === 0) {
      for (const chunk of active.values()) {
        if (chunk.rev !== terrainRev || chunk.tier !== tier) enqueueRebuild(chunk.key);
      }
    }
  };

  return {
    update,
    notifyTerrainChanged: () => {
      terrainRev++;
    },
    getTreeColliders: () => treeColliders,
    stats: () => {
      let indices = 0;
      for (const chunk of active.values()) indices += chunk.pooled.geometry.drawRange.count;
      return { tier, chunks: active.size, grassIndices: indices, trees: treeCount, sectors: sectors.length };
    },
    dispose: () => {
      disposed = true;
      for (const chunk of active.values()) chunk.pooled.geometry.dispose();
      active.clear();
      for (const p of freePool) p.geometry.dispose();
      freePool.length = 0;
      for (const sector of sectors) {
        disposeTexturedSector(sector);
        sector.trees?.geometry.dispose();
        sector.rocks?.geometry.dispose();
      }
      scene.remove(group);
      grassMaterial.dispose();
      treeMaterial.dispose();
      rockMaterial.dispose();
      for (const asset of texturedTreeAssets.values()) {
        for (const submesh of asset.submeshes) {
          submesh.geometry.dispose();
          const materials = Array.isArray(submesh.material) ? submesh.material : [submesh.material];
          for (const material of materials) material.dispose();
        }
      }
      texturedTreeAssets.clear();
    },
  };
}
