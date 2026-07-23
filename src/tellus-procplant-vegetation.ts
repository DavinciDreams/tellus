import * as THREE from "three";
import { SEA_LEVEL, WORLD_RADIUS } from "./tellus-constants";
import type { TerrainPaintKind } from "./tellus-types";
import {
  biomePatchForEcology,
  biomePatchForPaint,
  environmentForBiomePatch,
  GLOBAL_DEFAULT_FERN_ASSET_IDS,
  genomeForBiomePatch,
  treeBackendForBiomePatch,
} from "./tellus-procplant-biomes";
import { resolveEcologySample, type EcologyBiomeId, type EcologySample } from "./tellus-ecology";
import {
  branchModuleLodView,
  branchModuleTreeFromSpecies,
  branchSegmentPrototypeTemplate,
  type BranchModuleArchetype,
  type BranchModuleLodLevel,
  type BranchModuleTree,
} from "./tellus-branch-modules";
import { buildRetroCutoutTreeTemplate } from "./tellus-veg-archetypes";
import { loadBiomeAssetTemplate } from "./tellus-biome-asset-template";
import {
  createAssetStoreImpostorInstance,
  loadAssetStoreImpostor,
} from "./tellus-asset-impostor";
import {
  bakeImpostor,
  isImpostorBakingSupported,
  type ImpostorHandle,
  type TellusImpostorInstance,
} from "./tellus-impostor";
import {
  BIOME_MIX_STORAGE_EVENT,
  activeBiomeMixStorageKey,
  biomeMixRenderSignature,
  genomeForMixEntry,
  isAssetMixEntry,
  loadActiveBiomeMixRegistryForWorld,
  loadActiveBiomeMixRegistryFromServer,
  makeAuthoredEcologyBiomeMix,
  makeTerrainPaintBiomeMix,
  type TellusBiomeMixDefinition,
  type TellusBiomeAssetTemplate,
  type TellusBiomeMixEntry,
  type TellusBiomeMixRegistry,
} from "./tellus-biome-mix";
import {
  branchModuleSpreadForGenome,
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
  type ProcPlantEnvironment,
  type ProcPlantGenome,
  type ProcPlantHabit,
  type ProcPlantInstance,
  type ProcPlantInstancedParts,
  type ProcPlantTemplate,
  GOLDEN_ANGLE_RADIANS,
  procPlantPresets,
} from "./tellus-procplants";

export interface ProcPlantVegetationOptions {
  scene: THREE.Scene;
  /** Late-bound because the renderer is initialized after the vegetation system. */
  renderer?: () => unknown;
  camera?: () => THREE.Camera;
  worldId: string;
  sampleHeight: (x: number, z: number) => number | null;
  samplePaint: (x: number, z: number) => TerrainPaintKind | null;
  sampleEcology?: (x: number, z: number, height: number, paint: TerrainPaintKind | null, seed: number) => EcologySample;
  ecologyRegionKey?: (x: number, z: number) => string;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  chunkSize?: number;
  maxRing?: number;
  densityMultiplier?: number;
  isExcluded?: (x: number, z: number, height: number) => boolean;
  viewMode?: () => "first" | "third";
  fullDetailLod?: boolean;
  shouldPauseBuild?: () => boolean;
  shouldDeferBuild?: () => boolean;
  biomeMixRegistry?: TellusBiomeMixRegistry;
}

export interface ProcPlantVegetationStats {
  chunks: number;
  plants: number;
  manualPlants: number;
  instances: number;
  grassInstances: number;
  grassTriangles: number;
  stemTriangles: number;
  organDraws: number;
  branchSegments: number;
  attachedLeaves: number;
  branchLod0: number;
  branchLod1: number;
  branchLod2: number;
  impostors: number;
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
  deferredLodChunks: number;
  deferredColdChunks: number;
  lodRefreshes: number;
}

export interface ProcPlantVegetationSystem {
  update(px: number, pz: number, playerY: number, fps: number, nowMs: number): void;
  notifyTerrainChanged(): void;
  notifyRegionsChanged(regions: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }>): void;
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
  grassInstances: number;
  grassTriangles: number;
  stemTriangles: number;
  organDraws: number;
  branchSegments: number;
  attachedLeaves: number;
  branchLod0: number;
  branchLod1: number;
  branchLod2: number;
  impostors: number;
}

interface ActiveChunk {
  key: string;
  cx: number;
  cz: number;
  lod: 0 | 1 | 2;
  builtLod: 0 | 1 | 2 | null;
  rev: number;
  styleRev: number;
  needsColdRefinement: boolean;
  lastNeededMs: number;
  group: THREE.Group;
  impostors: TellusImpostorInstance[];
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
  gnarliness?: number;
  droop?: number;
  spread?: number;
  tropism?: number;
  branchDensity?: number;
  branchAngle?: number;
  vigor?: number;
  collisionBias?: number;
  junctionBlend?: number;
  palette?: BranchModuleArchetype;
  broadleafCrown?: "rounded" | "columnar" | "umbrella" | "spreading";
}

const DEFAULT_CHUNK_SIZE = 16;
const DEFAULT_MAX_RING = 3;
const THIRD_PERSON_MAX_RING = 4;
const MAX_PLANTS_PER_CHUNK = 4;
const PROC_TREE_NEAR_SCALE = 1.85;
// Tree transforms must not change when a chunk crosses an LOD ring. Geometry can simplify, but a
// different scale makes a crown visibly expand/contract and reads as a different tree popping in.
const PROC_TREE_STABLE_SCALE = PROC_TREE_NEAR_SCALE;
const PROC_TREE_DETAIL_DISTANCE = 58;
const PROC_TREE_DETAIL_DISTANCE_THIRD = 72;
const PROC_TREE_IMPOSTOR_DISTANCE_FACTOR = 0.9;
const PROC_TREE_IMPOSTOR_ATLAS_SIZE = 512;
const PROC_TREE_IMPOSTOR_GRID_SIZE = 8;
const MAX_PROC_TREE_IMPOSTOR_HANDLES = 12;
const PROC_TREE_PLACEMENT_DENSITY = 0.58;
const PROC_GROUND_PLANT_DETAIL_DISTANCE = 34;
const PROC_GROUND_PLANT_DETAIL_DISTANCE_THIRD = 42;
const PROC_GROUND_PLANT_FADE_DISTANCE = 72;
const PROC_GROUND_PLANT_FADE_DISTANCE_THIRD = 96;
const PROC_GROUND_PLANT_MIN_DENSITY = 0.22;
const PROCPLANT_RENDER_STYLE_REVISION = 11;
const FAR_CHUNK_EVICT_GRACE_MS = 2_500;
const BIOME_MIX_SERVER_REFRESH_FALLBACK_MS = 60_000;
const LOW_FPS_BUILD_BUDGET = 1;
const NORMAL_BUILD_BUDGET = 2;
const LOW_FPS_BUILD_MS_BUDGET = 2.5;
const NORMAL_BUILD_MS_BUDGET = 5;
const MIN_PROCPLANT_GROUND_HEIGHT = SEA_LEVEL + 0.35;
const GRASS_CARPET_TUFTS_LOD0 = 36;
const GRASS_CARPET_TUFTS_LOD1 = 16;
const GRASS_CARPET_TUFTS_LOD2 = 8;
const GRASS_CARPET_RADIUS_LOD0 = 4.8;
const GRASS_CARPET_RADIUS_LOD1 = 5.6;
const GRASS_CARPET_RADIUS_LOD2 = 6.4;
const GRASS_FIELD_SPACING_LOD0 = 0.34;
const GRASS_FIELD_SPACING_LOD1 = 0.68;
const GRASS_FIELD_SPACING_LOD2 = 1.18;
const GRASS_FIELD_FULL_DENSITY_RING = 2;

export const shouldUseCheapDistantTree = (
  habit: ProcPlantHabit,
  useDetailedTree: boolean,
  baseScale: number,
): boolean =>
  !useDetailedTree &&
  baseScale >= 1.2 &&
  (habit === "tree" || habit === "conifer");

export const groundPlantDistanceDensity = (
  habit: ProcPlantHabit,
  distanceToPlayer: number,
  thirdPerson: boolean,
): number => {
  const groundHabit =
    habit === "grass" ||
    habit === "fern" ||
    habit === "flower" ||
    habit === "tropical" ||
    habit === "vine";
  if (!groundHabit) return 1;
  const detailDistance = thirdPerson
    ? PROC_GROUND_PLANT_DETAIL_DISTANCE_THIRD
    : PROC_GROUND_PLANT_DETAIL_DISTANCE;
  const fadeDistance = thirdPerson
    ? PROC_GROUND_PLANT_FADE_DISTANCE_THIRD
    : PROC_GROUND_PLANT_FADE_DISTANCE;
  const fade = THREE.MathUtils.smoothstep(distanceToPlayer, detailDistance, fadeDistance);
  return THREE.MathUtils.lerp(1, PROC_GROUND_PLANT_MIN_DENSITY, fade);
};

/** Keep close trunks visually round even when low FPS reduces branch-count LOD. */
export const procPlantBranchRadialSegments = (chunkLod: number, distanceLod: BranchModuleLodLevel): number => {
  const visualLod = Math.max(chunkLod, distanceLod);
  return visualLod <= 0 ? 8 : visualLod === 1 ? 6 : 5;
};

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

// Detailed L-system trees are the single most expensive thing built during chunk streaming: a full
// genome-to-branch-graph pass per tree. The old call site seeded every instance uniquely
// (`patch.seed ^ i`), so NOTHING was ever reused and each tree paid full cost; that was the main
// source of the multi-hundred-ms (up to ~1.5s) procplants build stalls seen in the perf readout.
// Memoize connected branch graphs by species + option-signature + a small seed bucket. A handful of
// variants preserves variety while every rendered segment reuses one of four small prototype meshes.
const DETAILED_TREE_SEED_BUCKETS = 8;
const branchModuleTreeCache = new Map<string, BranchModuleTree>();
const branchModuleTreeCacheKey = (
  species: string,
  seed: number,
  options: BiomeTreeTemplateOptions = {},
): { bucket: number; key: string } => {
  const bucket =
    ((Math.trunc(seed) % DETAILED_TREE_SEED_BUCKETS) + DETAILED_TREE_SEED_BUCKETS) %
    DETAILED_TREE_SEED_BUCKETS;
  const key =
    `${species}|${bucket}|${options.maxBranchDepth ?? ""}|${options.maxStems ?? ""}|` +
    `${options.maxLeaves ?? ""}|${options.leafScaleMultiplier ?? ""}|${options.gnarliness ?? ""}|` +
    `${options.droop ?? ""}|${options.spread ?? ""}|${options.tropism ?? ""}|${options.branchDensity ?? ""}|` +
    `${options.branchAngle ?? ""}|${options.vigor ?? ""}|${options.collisionBias ?? ""}|${options.junctionBlend ?? ""}|${options.palette ?? ""}|` +
    `${options.broadleafCrown ?? ""}`;
  return { bucket, key };
};
const buildBranchModuleTreeCached = (
  species: string,
  seed: number,
  options: BiomeTreeTemplateOptions = {},
  allowColdBuild = true,
): BranchModuleTree | null => {
  const { bucket, key } = branchModuleTreeCacheKey(species, seed, options);
  let tree = branchModuleTreeCache.get(key);
  if (!tree && !allowColdBuild) return null;
  if (!tree) {
    tree = branchModuleTreeFromSpecies(species, bucket, {
      maxBranchDepth: options.maxBranchDepth,
      maxStems: options.maxStems,
      maxLeaves: options.maxLeaves,
      leafScaleMultiplier: options.leafScaleMultiplier,
      gnarliness: options.gnarliness,
      droop: options.droop,
      spread: options.spread,
      tropism: options.tropism,
      branchDensity: options.branchDensity,
      branchAngle: options.branchAngle,
      vigor: options.vigor,
      collisionBias: options.collisionBias,
      junctionBlend: options.junctionBlend,
      palette: options.palette,
      broadleafCrown: options.broadleafCrown,
    });
    branchModuleTreeCache.set(key, tree);
  }
  return tree;
};

// Same story as the detailed trees: buildProcPlantInstancedParts (flowers/shrubs/ferns/succulents)
// ran the full genome→graph→geometry pipeline per instance with a unique seed, so nothing was reused.
// After caching trees this was the remaining procplants build spike (~800ms). The output is read-only
// downstream (stems merged read-only, instances spread-copied), so memoize it by genome + a small seed
// bucket + coarsely quantized environment (light/moisture/crowding/warmth only shift the shape a
// little, so 0.25-steps are visually indistinguishable while collapsing the cache key space).
const PLANT_SEED_BUCKETS = 12;
const procPlantPartsCache = new Map<string, ProcPlantInstancedParts>();
const buildProcPlantInstancedPartsCached = (
  genome: ProcPlantGenome,
  seed: number,
  env: ProcPlantEnvironment,
  allowColdBuild = true,
): ProcPlantInstancedParts | null => {
  const bucket =
    ((Math.trunc(seed) % PLANT_SEED_BUCKETS) + PLANT_SEED_BUCKETS) % PLANT_SEED_BUCKETS;
  const q = (v: number) => Math.round(v * 4) / 4;
  const key =
    `${genome.id}|${bucket}|${q(env.light)}|${q(env.moisture)}|${q(env.crowding)}|${q(env.biomeWarmth)}`;
  let built = procPlantPartsCache.get(key);
  if (!built && !allowColdBuild) return null;
  if (!built) {
    // Derive a well-spread but deterministic seed from the bucket so each bucket is a distinct shape.
    built = buildProcPlantInstancedParts(genome, ((bucket + 1) * 0x9e3779b1) >>> 0, env);
    procPlantPartsCache.set(key, built);
  }
  return built;
};

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
const templateHeightCache = new WeakMap<ProcPlantTemplate, number>();
const assetTemplateCache = new WeakMap<TellusBiomeAssetTemplate, Map<string, ProcPlantTemplate>>();

export const procPlantTemplateFromAssetTemplate = (
  asset: TellusBiomeAssetTemplate,
  tintColor?: number,
): ProcPlantTemplate => {
  const cacheKey = tintColor === undefined ? "natural" : `tint:${tintColor.toString(16)}`;
  const cached = assetTemplateCache.get(asset)?.get(cacheKey);
  if (cached) return cached;
  const colors = new Float32Array(asset.colors);
  if (tintColor !== undefined) {
    const tint = new THREE.Color(tintColor);
    // Asset LODs may have baked black materials when their original appearance came from a
    // texture. A mix color is an explicit flat-color override, not a multiplier: multiplying
    // cannot recover color from black and made otherwise valid instanced foliage render black.
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = tint.r;
      colors[i + 1] = tint.g;
      colors[i + 2] = tint.b;
    }
  }
  const template: ProcPlantTemplate = {
    pos: new Float32Array(asset.positions),
    nrm: new Float32Array(asset.normals),
    col: colors,
    tintable: new Uint8Array(asset.vertexCount),
    sway: new Float32Array(asset.vertexCount),
    idx: new Uint32Array(asset.indices),
  };
  const templateCache = assetTemplateCache.get(asset) ?? new Map<string, ProcPlantTemplate>();
  templateCache.set(cacheKey, template);
  assetTemplateCache.set(asset, templateCache);
  return template;
};

const templateMinY = (template: ProcPlantTemplate): number => {
  const cached = templateMinYCache.get(template);
  if (cached !== undefined) return cached;
  let minY = Infinity;
  for (let i = 1; i < template.pos.length; i += 3) minY = Math.min(minY, template.pos[i] ?? 0);
  const y = Number.isFinite(minY) ? minY : 0;
  templateMinYCache.set(template, y);
  return y;
};

const templateHeight = (template: ProcPlantTemplate): number => {
  const cached = templateHeightCache.get(template);
  if (cached !== undefined) return cached;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < template.pos.length; i += 3) {
    const y = template.pos[i] ?? 0;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const height = Number.isFinite(minY) && Number.isFinite(maxY)
    ? Math.max(1e-4, maxY - minY)
    : 1;
  templateHeightCache.set(template, height);
  return height;
};

export const buildCheapTreeTemplate = (species: string, habit?: ProcPlantHabit): ProcPlantTemplate => {
  const cacheKey = habit === "conifer" ? `${species}|conifer` : species;
  const cached = cheapTreeTemplateCache.get(cacheKey);
  if (cached) return cached;
  // The regex is a best-effort species-name guess for presets (balsamFir, douglasFir, ...); habit is the
  // authoritative signal and must win for custom/mutation genomes whose id doesn't follow that convention
  // (e.g. a mixer-authored "branchModules-excurrent-conifer") — otherwise a real conifer silently falls
  // through to the generic broadleaf trunk+icosahedron silhouette at distance.
  const conifer = habit === "conifer" || /fir|pine|douglas|larch|spruce/i.test(species);
  if (conifer) {
    const template = buildRetroCutoutTreeTemplate(hashString(species), undefined, {
      height: /small/i.test(species) ? 0.98 : /douglas|redwood/i.test(species) ? 1.36 : 1.18,
      width: /small/i.test(species) ? 0.42 : /douglas|redwood/i.test(species) ? 0.56 : 0.5,
      planes: /small/i.test(species) ? 3 : 4,
      trunkRadius: /small/i.test(species) ? 0.052 : 0.058,
    });
    cheapTreeTemplateCache.set(cacheKey, template);
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
  cheapTreeTemplateCache.set(cacheKey, template);
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

const hash01 = (value: number) => {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
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
      if (!object.geometry.userData.tellusProcplantShared) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material.userData.tellusProcplantShared) material.dispose();
      }
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
  if (instance.kind === "coniferSpray") {
    return "coniferSpray";
  }
  if (instance.kind === "leaf") {
    const leaf = genome.leaf;
    return `leaf:${leaf.shape}:${leaf.widthRatio.toFixed(3)}:${leaf.serration.toFixed(3)}:${leaf.curl.toFixed(3)}:${leaf.venation.toFixed(3)}`;
  }
  if (instance.kind === "grassBlade") {
    return `grassBlade:${genome.leaf.widthRatio.toFixed(3)}:${genome.leaf.curl.toFixed(3)}`;
  }
  return instance.kind;
};

// A branch-module tree's foliage should render as clustered conifer needle sprays, not flat
// broadleaf-shaped leaf cards, whenever the genome calls for it — matching the Weber-Penn foliage-fill
// path's own foliageSource handling (see buildBranchModuleGraphTemplate in tellus-procplants.ts).
const branchModuleFoliageIsConiferSpray = (genome: ProcPlantGenome): boolean => {
  const source = genome.branchModules?.foliageSource;
  if (source) return source === "conifer-spray";
  return genome.habit === "conifer";
};

const createGrassCarpetGeometry = (bladeCount: number): THREE.BufferGeometry => {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < bladeCount; i++) {
    const yaw = i * GOLDEN_ANGLE_RADIANS + (hash01(i * 17) - 0.5) * 1.15;
    const radial = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const side = new THREE.Vector3(-radial.z, 0, radial.x);
    const height = 0.32 + hash01(i * 31 + 3) * 0.5;
    const width = 0.011 + hash01(i * 43 + 5) * 0.012;
    const baseSpread = Math.sqrt(hash01(i * 59 + 7)) * 0.11;
    const base = radial.clone().multiplyScalar(baseSpread);
    const bend = radial.clone().multiplyScalar((0.08 + hash01(i * 71 + 11) * 0.28) * height);
    const mid = base.clone().add(up.clone().multiplyScalar(height * 0.55)).add(bend.clone().multiplyScalar(0.42));
    const tip = base.clone().add(up.clone().multiplyScalar(height)).add(bend);
    const normal = new THREE.Vector3().crossVectors(side, tip.clone().sub(base)).normalize();
    const start = positions.length / 3;
    const points = [
      base.clone().add(side.clone().multiplyScalar(-width)),
      base.clone().add(side.clone().multiplyScalar(width)),
      mid.clone().add(side.clone().multiplyScalar(width * 0.58)),
      mid.clone().add(side.clone().multiplyScalar(-width * 0.58)),
      tip,
    ];
    for (const point of points) {
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3, start + 3, start + 2, start + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
};

const geometryForKey = (key: string): THREE.BufferGeometry => {
  const [kind, shape, widthRatio, serration, curl, venation] = key.split(":");
  switch (kind) {
    case "grassCarpet":
      return createGrassCarpetGeometry(Number(shape) || 12);
    case "leaf":
      const parsedVenation = Number(venation);
      return createProcPlantLeafGeometry(
        shape as ProcPlantGenome["leaf"]["shape"],
        Number(widthRatio),
        Number(serration),
        Number(curl),
        Number.isFinite(parsedVenation) ? parsedVenation : 0.5,
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
  deferredLodChunks: 0,
  deferredColdChunks: 0,
  lodRefreshes: 0,
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

const manualPlacementsEqual = (
  left: ProcPlantManualPlacement,
  right: ProcPlantManualPlacement,
): boolean =>
  left.id === right.id &&
  left.presetId === right.presetId &&
  left.seed === right.seed &&
  left.x === right.x &&
  left.z === right.z &&
  left.scale === right.scale;

const renderableEntriesForMix = (mix: TellusBiomeMixDefinition): TellusBiomeMixEntry[] =>
  mix.entries.filter((entry) =>
    entry.enabled !== false &&
    (!isAssetMixEntry(entry) || Boolean(entry.asset.template)) &&
    Math.max(0, entry.weight) > 0 &&
    Math.max(0, entry.density) > 0
  );

const chooseBiomeMixEntry = (
  mix: TellusBiomeMixDefinition,
  rand: () => number,
  densityMultiplier: number,
  lodDensity: number,
): TellusBiomeMixEntry | null => {
  const candidates = renderableEntriesForMix(mix);
  if (candidates.length === 0) return null;
  const mixDensity = THREE.MathUtils.clamp(mix.density * densityMultiplier * lodDensity, 0, 1.8);
  if (rand() > mixDensity) return null;
  const total = candidates.reduce(
    (sum, entry) => sum + Math.max(0.01, entry.weight) * Math.max(0.01, entry.density),
    0,
  );
  let roll = rand() * total;
  for (const entry of candidates) {
    roll -= Math.max(0.01, entry.weight) * Math.max(0.01, entry.density);
    if (roll <= 0) return entry;
  }
  return candidates[candidates.length - 1] ?? null;
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
  let biomeMixServerRefreshInFlight = false;
  let biomeMixServerRefreshTimer: number | null = null;
  let activeBiomeMixSignature = "";
  let lastPlayerX: number | null = null;
  let lastPlayerZ: number | null = null;
  let lastMoveDirX = 0;
  let lastMoveDirZ = 0;
  let lastPlayerMovedAt = Number.NEGATIVE_INFINITY;
  let lastMovingBuildAt = Number.NEGATIVE_INFINITY;
  let buildPausedForMotion = false;
  let currentFps = 60;
  let lastLodRefreshAt = Number.NEGATIVE_INFINITY;
  let lodRefreshes = 0;
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
  stemMaterial.userData.tellusProcplantShared = true;
  organMaterial.userData.tellusProcplantShared = true;
  const stemGeometryCache = new Map<ProcPlantTemplate, THREE.BufferGeometry>();
  const organGeometryCache = new Map<string, THREE.BufferGeometry>();
  const branchTreeImpostorHandles = new Map<string, ImpostorHandle>();
  const branchTreeImpostorBakes = new Set<string>();
  const branchTreeImpostorFailures = new Set<string>();
  const branchTreeImpostorConsumers = new Map<string, Set<string>>();
  let branchTreeImpostorBakeQueue = Promise.resolve();
  const globalAssetTemplates = new Map<string, TellusBiomeAssetTemplate>();
  const authoredDefaultMixByBiome = new Map<EcologyBiomeId, TellusBiomeMixDefinition | null>();
  const authoredDefaultMixForBiome = (biome: EcologyBiomeId): TellusBiomeMixDefinition | null => {
    if (authoredDefaultMixByBiome.has(biome)) return authoredDefaultMixByBiome.get(biome) ?? null;
    const mix = makeAuthoredEcologyBiomeMix(biome);
    authoredDefaultMixByBiome.set(biome, mix);
    return mix;
  };
  const stemGeometryForTemplate = (template: ProcPlantTemplate): THREE.BufferGeometry => {
    const cached = stemGeometryCache.get(template);
    if (cached) return cached;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(template.pos, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(template.nrm, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(template.col, 3));
    geometry.setIndex(new THREE.BufferAttribute(template.idx, 1));
    geometry.computeBoundingSphere();
    geometry.userData.tellusProcplantShared = true;
    stemGeometryCache.set(template, geometry);
    return geometry;
  };
  const organGeometryForKey = (key: string): THREE.BufferGeometry => {
    const cached = organGeometryCache.get(key);
    if (cached) return cached;
    const geometry = geometryForKey(key);
    geometry.userData.tellusProcplantShared = true;
    organGeometryCache.set(key, geometry);
    return geometry;
  };
  let activeBiomeMixRegistry: TellusBiomeMixRegistry =
    options.biomeMixRegistry ?? loadActiveBiomeMixRegistryForWorld(options.worldId);
  activeBiomeMixSignature = biomeMixRenderSignature(activeBiomeMixRegistry);

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
      const arx = ax - centerCx;
      const arz = az - centerCz;
      const brx = bx - centerCx;
      const brz = bz - centerCz;
      const ar = Math.max(Math.abs(arx), Math.abs(arz));
      const br = Math.max(Math.abs(brx), Math.abs(brz));
      const aheadA = arx * lastMoveDirX + arz * lastMoveDirZ;
      const aheadB = brx * lastMoveDirX + brz * lastMoveDirZ;
      return (ar * 10 - aheadA * 2) - (br * 10 - aheadB * 2);
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

  const buildBranchTreeImpostorSource = (
    tree: BranchModuleTree,
    leafGeometry: THREE.BufferGeometry,
    leafColor: THREE.Color,
    barkColor: THREE.ColorRepresentation,
  ): THREE.Group => {
    const source = new THREE.Group();
    const segmentsByTemplate = new Map<ProcPlantTemplate, THREE.Matrix4[]>();
    for (const segment of tree.segments) {
      const template = branchSegmentPrototypeTemplate(segment.prototypeId);
      const matrices = segmentsByTemplate.get(template) ?? [];
      matrices.push(segment.matrix);
      segmentsByTemplate.set(template, matrices);
    }
    for (const [template, matrices] of segmentsByTemplate) {
      const material = new THREE.MeshLambertMaterial({ color: barkColor, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(stemGeometryForTemplate(template), material, matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      source.add(mesh);
    }
    if (tree.leaves.length > 0) {
      const material = new THREE.MeshLambertMaterial({ color: leafColor, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(leafGeometry, material, tree.leaves.length);
      tree.leaves.forEach((leaf, index) => mesh.setMatrixAt(index, leaf.matrix));
      mesh.instanceMatrix.needsUpdate = true;
      source.add(mesh);
    }
    return source;
  };

  const scheduleBranchTreeImpostorBake = (
    cacheKey: string,
    chunkKey: string,
    tree: BranchModuleTree,
    leafGeometry: THREE.BufferGeometry,
    leafColor: THREE.Color,
    barkColor: THREE.ColorRepresentation,
  ) => {
    const renderer = options.renderer?.();
    if (!isImpostorBakingSupported(renderer)) return;
    if (branchTreeImpostorFailures.has(cacheKey)) return;
    if (branchTreeImpostorHandles.has(cacheKey)) return;
    if (
      !branchTreeImpostorBakes.has(cacheKey) &&
      branchTreeImpostorHandles.size + branchTreeImpostorBakes.size >= MAX_PROC_TREE_IMPOSTOR_HANDLES
    ) return;
    const consumers = branchTreeImpostorConsumers.get(cacheKey) ?? new Set<string>();
    consumers.add(chunkKey);
    branchTreeImpostorConsumers.set(cacheKey, consumers);
    if (branchTreeImpostorBakes.has(cacheKey)) return;
    branchTreeImpostorBakes.add(cacheKey);
    branchTreeImpostorBakeQueue = branchTreeImpostorBakeQueue
      .then(async () => {
        if (disposed) {
          branchTreeImpostorBakes.delete(cacheKey);
          branchTreeImpostorConsumers.delete(cacheKey);
          return;
        }
        const activeRenderer = options.renderer?.();
        if (!isImpostorBakingSupported(activeRenderer)) {
          branchTreeImpostorBakes.delete(cacheKey);
          branchTreeImpostorConsumers.delete(cacheKey);
          return;
        }
        const source = buildBranchTreeImpostorSource(tree, leafGeometry, leafColor, barkColor);
        try {
          const handle = await bakeImpostor(source, activeRenderer, {
            atlasWidth: PROC_TREE_IMPOSTOR_ATLAS_SIZE,
            atlasHeight: PROC_TREE_IMPOSTOR_ATLAS_SIZE,
            gridSizeX: PROC_TREE_IMPOSTOR_GRID_SIZE,
            gridSizeY: PROC_TREE_IMPOSTOR_GRID_SIZE,
            pbrMode: 0,
          });
          if (disposed) {
            handle.dispose();
            return;
          }
          branchTreeImpostorHandles.set(cacheKey, handle);
          for (const key of branchTreeImpostorConsumers.get(cacheKey) ?? []) {
            const chunk = active.get(key);
            if (!chunk) continue;
            chunk.rev = -1;
            enqueue(key);
          }
        } catch (error) {
          branchTreeImpostorFailures.add(cacheKey);
          console.warn("Tellus procplant impostor bake failed", cacheKey, error);
        } finally {
          disposeGroup(source);
          branchTreeImpostorBakes.delete(cacheKey);
          branchTreeImpostorConsumers.delete(cacheKey);
        }
      })
      .catch((error) => {
        branchTreeImpostorFailures.add(cacheKey);
        branchTreeImpostorBakes.delete(cacheKey);
        branchTreeImpostorConsumers.delete(cacheKey);
        console.warn("Tellus procplant impostor queue failed", cacheKey, error);
      });
  };

  const addBranchTreeImpostor = (
    chunk: ActiveChunk,
    cacheKey: string,
    x: number,
    groundY: number,
    z: number,
    yaw: number,
    scale: number,
  ): boolean => {
    const handle = branchTreeImpostorHandles.get(cacheKey);
    const camera = options.camera?.();
    if (!handle || !camera) return false;
    const instance = handle.createInstance({ scale });
    const center = handle.result.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3(0, 0.5, 0);
    center.multiplyScalar(scale).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    instance.mesh.position.set(x + center.x, groundY + center.y, z + center.z);
    instance.mesh.castShadow = false;
    instance.mesh.receiveShadow = false;
    instance.update(camera);
    chunk.group.add(instance.mesh);
    chunk.impostors.push(instance);
    chunk.stats.impostors++;
    return true;
  };

  const addAssetStoreImpostor = (
    chunk: ActiveChunk,
    entry: TellusBiomeMixEntry,
    x: number,
    groundY: number,
    z: number,
    yaw: number,
    scale: number,
  ): boolean => {
    if (!isAssetMixEntry(entry) || !entry.asset.impostor) return false;
    const instance = createAssetStoreImpostorInstance(entry.asset.impostor, {
      scale,
      yaw,
    });
    instance.mesh.position.set(
      x,
      groundY + instance.normalizedCenterY * scale,
      z,
    );
    const camera = options.camera?.();
    if (camera) instance.update(camera);
    chunk.group.add(instance.mesh);
    chunk.impostors.push(instance);
    chunk.stats.impostors++;
    return true;
  };

  const hydrateGlobalAssetDefaults = () => {
    if (typeof window === "undefined") return;
    void Promise.all(GLOBAL_DEFAULT_FERN_ASSET_IDS.map(async (assetId) => {
      const template = await loadBiomeAssetTemplate(assetId, "lod2");
      if (!template || disposed) return false;
      globalAssetTemplates.set(assetId, template);
      return true;
    })).then((hydrated) => {
      if (disposed || !hydrated.some(Boolean)) return;
      enqueueAllActive();
    });
  };

  const hydrateBiomeMixAssets = (registry: TellusBiomeMixRegistry) => {
    const entries = [...new Set([
      ...Object.values(registry.mixesByTerrainPaint),
      ...Object.values(registry.mixesByEcologyBiome),
    ].flatMap((mix) => mix?.entries ?? []))]
      .filter((entry) =>
        isAssetMixEntry(entry) &&
        entry.asset.runtimeOnly !== true &&
        Boolean(entry.asset.libraryId) &&
        (!entry.asset.template || !entry.asset.impostor)
      );
    if (entries.length === 0) return;
    void Promise.all(entries.map(async (entry) => {
      if (!isAssetMixEntry(entry) || !entry.asset.libraryId) return false;
      const [template, impostor] = await Promise.all([
        entry.asset.template
          ? Promise.resolve(entry.asset.template)
          : loadBiomeAssetTemplate(entry.asset.libraryId, entry.asset.lodPreference ?? "lod2"),
        entry.asset.impostor
          ? Promise.resolve(entry.asset.impostor)
          : loadAssetStoreImpostor(entry.asset.libraryId),
      ]);
      let changed = false;
      if (template && !entry.asset.template) {
        entry.asset.template = template;
        changed = true;
      }
      if (impostor && !entry.asset.impostor) {
        entry.asset.impostor = impostor;
        changed = true;
      }
      return changed;
    })).then((hydrated) => {
      if (disposed || activeBiomeMixRegistry !== registry || !hydrated.some(Boolean)) return;
      enqueueAllActive();
    });
  };

  const applyBiomeMixRegistry = (registry: TellusBiomeMixRegistry) => {
    const signature = biomeMixRenderSignature(registry);
    if (signature === activeBiomeMixSignature) return false;
    performance.mark("tellus:applyBiomeMixRegistry:enqueueAll:start");
    activeBiomeMixRegistry = registry;
    activeBiomeMixSignature = signature;
    enqueueAllActive();
    performance.mark("tellus:applyBiomeMixRegistry:enqueueAll:end");
    performance.measure(
      "tellus:applyBiomeMixRegistry:enqueueAll",
      "tellus:applyBiomeMixRegistry:enqueueAll:start",
      "tellus:applyBiomeMixRegistry:enqueueAll:end",
    );
    hydrateBiomeMixAssets(registry);
    return true;
  };

  hydrateBiomeMixAssets(activeBiomeMixRegistry);
  hydrateGlobalAssetDefaults();

  const reloadActiveBiomeMixes = () => {
    applyBiomeMixRegistry(loadActiveBiomeMixRegistryForWorld(options.worldId));
  };

  const refreshBiomeMixesFromServer = () => {
    if (typeof window === "undefined" || disposed || biomeMixServerRefreshInFlight) return;
    biomeMixServerRefreshInFlight = true;
    void loadActiveBiomeMixRegistryFromServer(options.worldId)
      .then((registry) => {
        if (!registry || disposed) return;
        applyBiomeMixRegistry(registry);
      })
      .finally(() => {
        biomeMixServerRefreshInFlight = false;
      });
  };

  const onBiomeMixStorage = (event: StorageEvent) => {
    if (event.key === activeBiomeMixStorageKey(options.worldId)) reloadActiveBiomeMixes();
  };

  const onBiomeMixCustomEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ worldId?: string }>).detail;
    if (!detail?.worldId || detail.worldId === options.worldId) reloadActiveBiomeMixes();
  };
  const onBiomeMixVisibility = () => {
    if (document.visibilityState === "visible") refreshBiomeMixesFromServer();
  };
  const onBiomeMixFocus = () => refreshBiomeMixesFromServer();

  if (typeof window !== "undefined") {
    window.addEventListener("storage", onBiomeMixStorage);
    window.addEventListener(BIOME_MIX_STORAGE_EVENT, onBiomeMixCustomEvent);
    window.addEventListener("focus", onBiomeMixFocus);
    document.addEventListener("visibilitychange", onBiomeMixVisibility);
    biomeMixServerRefreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshBiomeMixesFromServer();
    }, BIOME_MIX_SERVER_REFRESH_FALLBACK_MS);
    refreshBiomeMixesFromServer();
  }

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

  const buildChunk = (chunk: ActiveChunk, allowColdBuilds: boolean) => {
    // A streamed chunk must become visible quickly while the player is travelling. Full-density grass
    // and connected branch instances are retained for the settled build, but constructing all of their
    // matrices in one movement frame causes a visible hitch even when every source template is cached.
    // Travel builds therefore use the existing cheap tree silhouette and far-grass spacing, then mark
    // themselves for the same gradual refinement path used by cold cache entries.
    const travelBuild = !allowColdBuilds;
    disposeGroup(chunk.group);
    chunk.impostors = [];
    chunk.stats = {
      plants: 0,
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
    };
    chunk.rev = terrainRev;
    chunk.builtLod = chunk.lod;
    chunk.styleRev = PROCPLANT_RENDER_STYLE_REVISION;
    // Travel mode deliberately uses sparse grass and tree silhouettes. Mark every such chunk for a
    // settled rebuild, even when all source templates were already warm in cache; otherwise grass-only
    // chunks could remain permanently at the streaming density after movement stopped.
    chunk.needsColdRefinement = travelBuild;
    const seed = procPlantChunkSeed(options.worldId, chunk.cx, chunk.cz, 0);
    const rand = mulberry32(seed);
    // Candidate count and density are invariant across LOD rings. A lower-detail chunk renders the
    // same seeded plants with cheaper geometry instead of selecting a different forest population.
    const plantCap = Math.max(1, Math.round(MAX_PLANTS_PER_CHUNK * densityMultiplier));
    const stemTemplates: Array<{ template: ProcPlantTemplate; matrix: THREE.Matrix4 }> = [];
    const organBuckets = new Map<string, OrganBucket>();
    const x0 = chunk.cx * chunkSize;
    const z0 = chunk.cz * chunkSize;
    const attempts = plantCap * 5;
    const grassCarpetPaints = new Set<TerrainPaintKind>();
    const ecologyMixByRegion = new Map<string, {
      authored: TellusBiomeMixDefinition | null;
      custom: TellusBiomeMixDefinition | undefined;
    }>();
    const defaultMixByPaint = new Map<TerrainPaintKind, TellusBiomeMixDefinition>();
    const defaultMixForPaint = (paint: TerrainPaintKind): TellusBiomeMixDefinition => {
      let mix = defaultMixByPaint.get(paint);
      if (!mix) {
        mix = makeTerrainPaintBiomeMix(paint, seed);
        defaultMixByPaint.set(paint, mix);
      }
      return mix;
    };
    const ecologyMixAt = (
      x: number,
      z: number,
      height: number,
      paint: TerrainPaintKind | null,
      ecologySeed: number,
    ): {
      authored: TellusBiomeMixDefinition | null;
      custom: TellusBiomeMixDefinition | undefined;
    } => {
      const regionKey = options.ecologyRegionKey?.(x, z) ?? chunk.key;
      const cached = ecologyMixByRegion.get(regionKey);
      if (cached) return cached;
      const ecology = options.sampleEcology?.(x, z, height, paint, ecologySeed) ??
        resolveEcologySample({
          seed: ecologySeed,
          x,
          z,
          height,
          slope: estimateSlope(x, z, height),
          terrainPaint: paint,
        });
      const mixes = {
        authored: authoredDefaultMixForBiome(ecology.biome),
        custom: activeBiomeMixRegistry.mixesByEcologyBiome[ecology.biome],
      };
      ecologyMixByRegion.set(regionKey, mixes);
      return mixes;
    };

    const grassRing = Math.max(
      Math.abs(chunk.cx - Math.floor((lastPlayerX ?? chunk.cx * chunkSize) / chunkSize)),
      Math.abs(chunk.cz - Math.floor((lastPlayerZ ?? chunk.cz * chunkSize) / chunkSize)),
    );
    const grassLod = travelBuild
      ? 2
      : fullDetailLod || grassRing <= GRASS_FIELD_FULL_DENSITY_RING
      ? 0
      : chunk.lod === 1
        ? 1
        : 2;
    const grassSpacing = grassLod === 0
      ? GRASS_FIELD_SPACING_LOD0
      : grassLod === 1
        ? GRASS_FIELD_SPACING_LOD1
        : GRASS_FIELD_SPACING_LOD2;
    const grassStartX = Math.floor(x0 / grassSpacing) * grassSpacing + grassSpacing * 0.5;
    const grassStartZ = Math.floor(z0 / grassSpacing) * grassSpacing + grassSpacing * 0.5;
    for (let gx = grassStartX; gx < x0 + chunkSize; gx += grassSpacing) {
      for (let gz = grassStartZ; gz < z0 + chunkSize; gz += grassSpacing) {
        if (gx < x0 || gz < z0) continue;
        const cellSeed = seed ^ Math.imul(Math.floor(gx / grassSpacing) + 4099, 0x45d9f3b) ^
          Math.imul(Math.floor(gz / grassSpacing) - 8191, 0x119de1f3);
        const cellRand = mulberry32(cellSeed >>> 0);
        const jitter = grassSpacing * 0.42;
        const x = gx + (cellRand() - 0.5) * jitter;
        const z = gz + (cellRand() - 0.5) * jitter;
        if (!inBounds(x, z)) continue;
        const height = options.sampleHeight(x, z);
        if (height === null || height < MIN_PROCPLANT_GROUND_HEIGHT) continue;
        if (options.isExcluded?.(x, z, height)) continue;
        const paint = options.samplePaint(x, z);
        if (!paint || paint === "stone" || paint === "brick") continue;
        const ecologyMixes = ecologyMixAt(x, z, height, paint, cellSeed);
        const mix = ecologyMixes.custom ??
          activeBiomeMixRegistry.mixesByTerrainPaint[paint] ??
          ecologyMixes.authored ??
          defaultMixForPaint(paint);
        const grassEntries = mix.entries
          .filter((entry) => entry.enabled && !isAssetMixEntry(entry))
          .map((entry) => ({ entry, genome: genomeForMixEntry(entry) }))
          .filter((item) => item.genome.habit === "grass");
        if (grassEntries.length === 0) continue;
        const mixDensity = THREE.MathUtils.clamp(mix.density * densityMultiplier, 0, 1.65);
        const densityRoll = cellRand();
        const densityThreshold = THREE.MathUtils.clamp(0.22 + mixDensity * 0.56, 0.18, 0.92);
        if (densityRoll > densityThreshold) continue;
        const totalWeight = grassEntries.reduce((sum, item) => sum + Math.max(0.01, item.entry.weight * item.entry.density), 0);
        let pick = cellRand() * totalWeight;
        let selected = grassEntries[0]!;
        for (const item of grassEntries) {
          pick -= Math.max(0.01, item.entry.weight * item.entry.density);
          if (pick <= 0) {
            selected = item;
            break;
          }
        }
        grassCarpetPaints.add(paint);
        const { entry, genome } = selected;
        const environment = entry.environment;
        const bladeCount = Math.round(THREE.MathUtils.clamp((genome.grass?.blades ?? 32) * 0.36, 8, 18));
        const key = `grassCarpet:${bladeCount}`;
        let bucket = organBuckets.get(key);
        if (!bucket) {
          bucket = { key, geometry: organGeometryForKey(key), instances: [] };
          organBuckets.set(key, bucket);
        }
        const baseColor = new THREE.Color(genome.leaf.colorA);
        const tipColor = new THREE.Color(genome.leaf.colorB);
        const color = baseColor.clone().lerp(tipColor, 0.28 + cellRand() * 0.56);
        if (cellRand() < 0.18) color.lerp(new THREE.Color(0xd8cc76), 0.08 + cellRand() * 0.18);
        const moistureLift = THREE.MathUtils.lerp(0.82, 1.18, environment.moisture);
        const shadeStretch = THREE.MathUtils.lerp(0.92, 1.18, 1 - environment.light);
        const heightControl = entry.grassHeight ?? entry.scale;
        const spreadControl = entry.grassSpread ?? 1;
        const leanControl = entry.grassLean ?? 0.42;
        const scaleJitter = THREE.MathUtils.lerp(0.82, 1.22, cellRand());
        const widthScale = Math.max(0.55, spreadControl) * scaleJitter * moistureLift;
        const heightScale = heightControl * THREE.MathUtils.lerp(0.82, 1.32, cellRand()) * moistureLift * shadeStretch;
        const yaw = cellRand() * Math.PI * 2;
        const leanAngle = leanControl * THREE.MathUtils.lerp(0.2, 1, cellRand());
        const leanDirection = yaw + (cellRand() - 0.5) * Math.PI;
        const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
            Math.cos(leanDirection) * leanAngle,
            yaw,
            Math.sin(leanDirection) * leanAngle,
        ));
        const matrix = new THREE.Matrix4().compose(
          new THREE.Vector3(x, height + 0.015, z),
          rotation,
          new THREE.Vector3(widthScale, heightScale, widthScale),
        );
        bucket.instances.push({ kind: "grassBlade", matrix, color, sway: 0.48 + cellRand() * 0.42 });
        chunk.stats.instances++;
      }
    }
    if (grassCarpetPaints.size > 0) chunk.stats.plants += grassCarpetPaints.size;

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
      const lodDensity = PROC_TREE_PLACEMENT_DENSITY;
      const customMix = activeBiomeMixRegistry.mixesByEcologyBiome[ecology.biome] ??
        (paint ? activeBiomeMixRegistry.mixesByTerrainPaint[paint] : undefined);
      const authoredMix = customMix ? null : authoredDefaultMixForBiome(ecology.biome);
      const selectedMix = customMix ?? authoredMix;
      const customEntry = selectedMix ? chooseBiomeMixEntry(selectedMix, rand, densityMultiplier, lodDensity) : null;
      if (selectedMix && !customEntry) continue;
      const patch = customEntry ? null : biomePatchForEcology(ecology, patchSeed) ?? biomePatchForPaint(paint, patchSeed);
      if (!customEntry && (!patch || rand() > patch.density * densityMultiplier * lodDensity)) continue;
      if (customEntry && isAssetMixEntry(customEntry)) {
        const template = customEntry.asset.template
          ? procPlantTemplateFromAssetTemplate(customEntry.asset.template, customEntry.asset.color)
          : null;
        if (!template) continue;
        const baseScale = customEntry.scale;
        const scale = baseScale * THREE.MathUtils.lerp(0.82, 1.22, rand());
        const yaw = rand() * Math.PI * 2;
        if (
          !fullDetailLod &&
          chunk.lod === 2 &&
          addAssetStoreImpostor(chunk, customEntry, x, height + 0.02, z, yaw, scale)
        ) {
          chunk.stats.plants++;
          continue;
        }
        const matrix = new THREE.Matrix4()
          .makeRotationY(yaw)
          .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale))
          .premultiply(new THREE.Matrix4().makeTranslation(x, height + 0.02 - templateMinY(template) * scale, z));
        stemTemplates.push({ template, matrix });
        chunk.stats.plants++;
        chunk.stats.stemTriangles += template.idx.length / 3;
        continue;
      }
      if (patch?.asset) {
        const hydrated = globalAssetTemplates.get(patch.asset.libraryId);
        const template = hydrated
          ? procPlantTemplateFromAssetTemplate(hydrated, patch.asset.color)
          : null;
        if (!template) continue;
        const scale = patch.scale * THREE.MathUtils.lerp(0.82, 1.22, rand());
        const matrix = new THREE.Matrix4()
          .makeRotationY(rand() * Math.PI * 2)
          .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale))
          .premultiply(new THREE.Matrix4().makeTranslation(x, height + 0.02 - templateMinY(template) * scale, z));
        stemTemplates.push({ template, matrix });
        chunk.stats.plants++;
        chunk.stats.stemTriangles += template.idx.length / 3;
        continue;
      }
      const genome = customEntry ? genomeForMixEntry(customEntry) : genomeForBiomePatch(patch!);
      const treeBackend = patch ? treeBackendForBiomePatch(patch) : undefined;
      const environment = customEntry ? customEntry.environment : environmentForBiomePatch(patch!);
      const baseScale = customEntry ? customEntry.scale : patch!.scale;
      const renderSeed = customEntry
        ? authoredMix
          ? customEntry.seed
          : customEntry.seed ^ patchSeed
        : patch!.seed ^ i;
      const distanceToPlayer = Math.hypot(x - (lastPlayerX ?? x), z - (lastPlayerZ ?? z));
      const detailDistance = viewMode() === "third" ? PROC_TREE_DETAIL_DISTANCE_THIRD : PROC_TREE_DETAIL_DISTANCE;
      const distanceDensity = groundPlantDistanceDensity(
        genome.habit,
        distanceToPlayer,
        viewMode() === "third",
      );
      if (distanceDensity < 1 && rand() > distanceDensity) continue;
      if (genome.habit === "grass" && paint && grassCarpetPaints.has(paint)) continue;
      if (genome.habit === "grass") {
        const baseTuftCount = chunk.lod === 0
          ? GRASS_CARPET_TUFTS_LOD0
          : chunk.lod === 1
            ? GRASS_CARPET_TUFTS_LOD1
            : GRASS_CARPET_TUFTS_LOD2;
        const carpetRadius = chunk.lod === 0
          ? GRASS_CARPET_RADIUS_LOD0
          : chunk.lod === 1
            ? GRASS_CARPET_RADIUS_LOD1
            : GRASS_CARPET_RADIUS_LOD2;
        const density = customEntry ? customEntry.density : patch!.density;
        const tuftCount = Math.max(2, Math.round(baseTuftCount * THREE.MathUtils.clamp(densityMultiplier * density, 0.25, 1.8)));
        const bladeCount = Math.round(THREE.MathUtils.clamp((genome.grass?.blades ?? 32) * 0.36, 8, 18));
        const key = `grassCarpet:${bladeCount}`;
        let bucket = organBuckets.get(key);
        if (!bucket) {
          bucket = { key, geometry: organGeometryForKey(key), instances: [] };
          organBuckets.set(key, bucket);
        }
        const baseColor = new THREE.Color(genome.leaf.colorA);
        const tipColor = new THREE.Color(genome.leaf.colorB);
        const color = new THREE.Color();
        let placedTufts = 0;
        for (let tuft = 0; tuft < tuftCount; tuft++) {
          const angle = tuft * GOLDEN_ANGLE_RADIANS + rand() * 0.7;
          const radius = carpetRadius * Math.sqrt(rand());
          const tx = x + Math.cos(angle) * radius;
          const tz = z + Math.sin(angle) * radius;
          if (!inBounds(tx, tz)) continue;
          const tuftHeight = options.sampleHeight(tx, tz);
          if (tuftHeight === null || tuftHeight < MIN_PROCPLANT_GROUND_HEIGHT) continue;
          if (options.isExcluded?.(tx, tz, tuftHeight)) continue;
          const tuftPaint = options.samplePaint(tx, tz);
          if (tuftPaint === "stone" || tuftPaint === "brick") continue;
          if (paint && tuftPaint && tuftPaint !== paint) continue;
          const moistureLift = THREE.MathUtils.lerp(0.8, 1.18, environment.moisture);
          const shadeStretch = THREE.MathUtils.lerp(0.9, 1.16, 1 - environment.light);
          const heightControl = customEntry ? customEntry.grassHeight ?? baseScale : baseScale;
          const spreadControl = customEntry ? customEntry.grassSpread ?? 1 : baseScale;
          const leanControl = customEntry ? customEntry.grassLean ?? 0.42 : 0.28;
          const widthScale = Math.max(0.55, spreadControl) * THREE.MathUtils.lerp(0.56, 0.92, rand()) * moistureLift;
          const heightScale = heightControl * THREE.MathUtils.lerp(0.72, 1.18, rand()) * moistureLift * shadeStretch;
          const yaw = rand() * Math.PI * 2;
          const leanAngle = leanControl * THREE.MathUtils.lerp(0.2, 1, rand());
          const leanDirection = yaw + (rand() - 0.5) * Math.PI;
          const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
              Math.cos(leanDirection) * leanAngle,
              yaw,
              Math.sin(leanDirection) * leanAngle,
          ));
          const matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(tx, tuftHeight + 0.015, tz),
            rotation,
            new THREE.Vector3(widthScale, heightScale, widthScale),
          );
          color.copy(baseColor).lerp(tipColor, 0.26 + rand() * 0.58);
          if (rand() < 0.18) color.lerp(new THREE.Color(0xd8cc76), 0.08 + rand() * 0.18);
          bucket.instances.push({ kind: "grassBlade", matrix, color: color.clone(), sway: 0.5 + rand() * 0.4 });
          chunk.stats.instances++;
          placedTufts++;
        }
        if (placedTufts > 0) chunk.stats.plants++;
        continue;
      }
      const branchTreeSpecies = treeBackend?.kind === "lsystem"
        ? treeBackend.species
        : genome.branchModules
          ? genome.weberPenn?.species ?? genome.id
          : null;
      if (branchTreeSpecies) {
        const yaw = rand() * Math.PI * 2;
        const scale = baseScale * PROC_TREE_STABLE_SCALE * THREE.MathUtils.lerp(0.9, 1.24, rand());
        const treeMatrix = new THREE.Matrix4()
          .makeRotationY(yaw)
          .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale))
          .premultiply(new THREE.Matrix4().makeTranslation(x, height + 0.02, z));
        const branchTreeOptions: BiomeTreeTemplateOptions = {
          ...foliageDefaultsForTreeSpecies(branchTreeSpecies),
          maxBranchDepth: genome.branchModules?.levels,
          maxStems: genome.branchModules?.moduleBudget,
          maxLeaves: genome.branchModules
            ? Math.round(THREE.MathUtils.clamp(
                (genome.branchModules.moduleBudget ?? 140) *
                (genome.foliage?.mass ?? 0.74) *
                (genome.foliage?.clusterDensity ?? 1.1) *
                1.6,
                24,
                360,
              ))
            : undefined,
          leafScaleMultiplier: genome.foliage?.size,
          palette: genome.branchModules?.palette,
          gnarliness: genome.branchModules?.gnarliness,
          droop: genome.branchModules?.droop,
          spread: branchModuleSpreadForGenome(genome),
          tropism: genome.branchModules?.tropism,
          branchDensity: genome.branchModules?.branchDensity,
          branchAngle: genome.branchModules?.branchAngle,
          vigor: genome.branchModules?.vigor,
          collisionBias: genome.branchModules?.collisionBias,
          junctionBlend: genome.branchModules?.junctionBlend,
          broadleafCrown: genome.tree?.crown === "propRoot" ? "spreading" : genome.tree?.crown,
          ...(treeBackend?.kind === "lsystem" ? treeBackend : {}),
        };
        const { key: branchTreeKey } = branchModuleTreeCacheKey(branchTreeSpecies, renderSeed, branchTreeOptions);
        const moduleTree = buildBranchModuleTreeCached(
          branchTreeSpecies,
          renderSeed,
          branchTreeOptions,
          allowColdBuilds,
        );
        if (!moduleTree) {
          // A brand-new branch graph is still deferred during movement, but the emergency silhouette
          // is normalized to the same one-unit tree height so it cannot tower over its replacement.
          const template = buildCheapTreeTemplate(branchTreeSpecies, genome.habit);
          const fallbackScale = scale / templateHeight(template);
          const fallbackMatrix = new THREE.Matrix4()
            .makeRotationY(yaw)
            .premultiply(new THREE.Matrix4().makeScale(fallbackScale, fallbackScale, fallbackScale))
            .premultiply(new THREE.Matrix4().makeTranslation(
              x,
              height + 0.02 - templateMinY(template) * fallbackScale,
              z,
            ));
          stemTemplates.push({ template, matrix: fallbackMatrix });
          chunk.stats.plants++;
          chunk.stats.stemTriangles += template.idx.length / 3;
          chunk.needsColdRefinement = true;
          continue;
        }
        const distanceRatio = THREE.MathUtils.clamp(distanceToPlayer / detailDistance, 0, 1);
        const distanceLod: BranchModuleLodLevel = distanceRatio < 0.45 ? 0 : distanceRatio < 0.75 ? 1 : 2;
        const computeLod: BranchModuleLodLevel = currentFps < 32 ? 2 : currentFps < 48 ? 1 : 0;
        const useConiferSpray = branchModuleFoliageIsConiferSpray(genome);
        const foliageKind: "leaf" | "coniferSpray" = useConiferSpray ? "coniferSpray" : "leaf";
        const leafKey = geometryKeyFor(genome, {
          kind: foliageKind,
          matrix: new THREE.Matrix4(),
          color: new THREE.Color(),
          sway: 0,
        });
        let leafBucket = organBuckets.get(leafKey);
        if (!leafBucket) {
          leafBucket = { key: leafKey, geometry: organGeometryForKey(leafKey), instances: [] };
          organBuckets.set(leafKey, leafBucket);
        }
        const authoredLeafColor = genome.branchModules?.leafColor;
        const leafA = new THREE.Color(authoredLeafColor ?? genome.leaf.colorA);
        const leafB = new THREE.Color(genome.leaf.colorB);
        const treeHue = (hash01(renderSeed * 0.754877666) - 0.5) * 0.045;
        const treeLight = (hash01(renderSeed * 1.324717957) - 0.5) * 0.1;
        leafA.offsetHSL(treeHue, 0, treeLight);
        leafB.offsetHSL(treeHue * 0.7, 0, treeLight * 0.75);
        if (!fullDetailLod && chunk.lod === 2) {
          scheduleBranchTreeImpostorBake(
            branchTreeKey,
            chunk.key,
            moduleTree,
            leafBucket.geometry,
            leafA.clone().lerp(leafB, 0.45),
            genome.branchModules?.barkColor ?? 0x5b3d24,
          );
        }
        const useImpostor =
          !fullDetailLod &&
          chunk.lod === 2 &&
          distanceToPlayer >= detailDistance * PROC_TREE_IMPOSTOR_DISTANCE_FACTOR &&
          addBranchTreeImpostor(chunk, branchTreeKey, x, height + 0.02, z, yaw, scale);
        if (useImpostor) {
          if (leafBucket.instances.length === 0) organBuckets.delete(leafKey);
          chunk.stats.plants++;
          continue;
        }
        // During travel, reuse a warm connected graph immediately. LOD only removes branches and their
        // attached leaves; it never swaps the tree for an unrelated conifer/lollipop silhouette.
        const structuralTree = branchModuleLodView(
          moduleTree,
          Math.max(chunk.lod, distanceLod, computeLod) as BranchModuleLodLevel,
        );
        const branchRadialSegments = procPlantBranchRadialSegments(chunk.lod, distanceLod);
        chunk.stats.branchSegments += structuralTree.segments.length;
        chunk.stats.attachedLeaves += structuralTree.leaves.length;
        if (structuralTree.level === 0) chunk.stats.branchLod0++;
        else if (structuralTree.level === 1) chunk.stats.branchLod1++;
        else chunk.stats.branchLod2++;
        for (const segment of structuralTree.segments) {
          const template = branchSegmentPrototypeTemplate(segment.prototypeId, branchRadialSegments);
          stemTemplates.push({
            template,
            matrix: treeMatrix.clone().multiply(segment.matrix),
          });
          chunk.stats.stemTriangles += template.idx.length / 3;
        }
        for (const leaf of structuralTree.leaves) {
          const leafTone = hash01(renderSeed ^ Math.imul(leaf.id + 1, 2654435761));
          const leafLight = (leafTone - 0.5) * 0.075;
          leafBucket.instances.push({
            kind: foliageKind,
            matrix: treeMatrix.clone().multiply(leaf.matrix),
            color: leafA.clone().lerp(leafB, 0.2 + leafTone * 0.62).offsetHSL(0, 0, leafLight),
            sway: 0.65 + hash01(renderSeed + leaf.id * 31.17) * 0.3,
          });
          chunk.stats.instances++;
        }
        chunk.stats.plants++;
        continue;
      }
      const treeHabit = genome.habit === "tree" || genome.habit === "conifer";
      const scaleBase = treeHabit && baseScale >= 1.2
        ? baseScale * PROC_TREE_STABLE_SCALE
        : baseScale;
      const scale = scaleBase * THREE.MathUtils.lerp(0.82, 1.22, rand());
      const yaw = rand() * Math.PI * 2;
      const built = buildProcPlantInstancedPartsCached(genome, renderSeed, environment, allowColdBuilds);
      if (!built) {
        chunk.needsColdRefinement = true;
        if (shouldUseCheapDistantTree(genome.habit, false, baseScale)) {
          const template = buildCheapTreeTemplate(genome.weberPenn?.species ?? genome.id, genome.habit);
          const fallbackScale = scale / templateHeight(template);
          const matrix = new THREE.Matrix4()
            .makeRotationY(yaw)
            .premultiply(new THREE.Matrix4().makeScale(fallbackScale, fallbackScale, fallbackScale))
            .premultiply(new THREE.Matrix4().makeTranslation(
              x,
              height + 0.02 - templateMinY(template) * fallbackScale,
              z,
            ));
          stemTemplates.push({ template, matrix });
          chunk.stats.plants++;
          chunk.stats.stemTriangles += template.idx.length / 3;
        }
        continue;
      }
      const matrix = new THREE.Matrix4()
        .makeRotationY(yaw)
        .premultiply(new THREE.Matrix4().makeScale(scale, scale, scale))
        .premultiply(new THREE.Matrix4().makeTranslation(x, height + 0.02 - templateMinY(built.stems) * scale, z));
      stemTemplates.push({ template: built.stems, matrix });
      chunk.stats.plants++;
      chunk.stats.stemTriangles += built.stats.stemTriangles;
      const organStride = treeHabit ? (chunk.lod === 2 ? 4 : chunk.lod === 1 ? 2 : 1) : 1;
      for (let instanceIndex = 0; instanceIndex < built.instances.length; instanceIndex += organStride) {
        const instance = built.instances[instanceIndex]!;
        const key = geometryKeyFor(genome, instance);
        let bucket = organBuckets.get(key);
        if (!bucket) {
          bucket = { key, geometry: organGeometryForKey(key), instances: [] };
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
      const built = buildProcPlantInstancedPartsCached(
        genome,
        placement.seed,
        defaultPlantEnvironment(),
        allowColdBuilds,
      );
      if (!built) {
        chunk.needsColdRefinement = true;
        continue;
      }
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
          bucket = { key, geometry: organGeometryForKey(key), instances: [] };
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
      // Templates are already cached and immutable. Instancing their transforms avoids re-copying and
      // transforming every stem vertex into a new merged BufferGeometry whenever a streamed chunk is
      // built. Grouping by template retains batching while making repeated communities cheap.
      const stemsByTemplate = new Map<ProcPlantTemplate, THREE.Matrix4[]>();
      for (const entry of stemTemplates) {
        const matrices = stemsByTemplate.get(entry.template) ?? [];
        matrices.push(entry.matrix);
        stemsByTemplate.set(entry.template, matrices);
      }
      for (const [template, matrices] of stemsByTemplate) {
        const mesh = new THREE.InstancedMesh(
          stemGeometryForTemplate(template),
          stemMaterial,
          matrices.length,
        );
        mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
        matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        chunk.group.add(mesh);
      }
    }

    for (const bucket of organBuckets.values()) {
      const mesh = new THREE.InstancedMesh(bucket.geometry, organMaterial, bucket.instances.length);
      // Chunk vegetation is rebuilt when its contents change; its instance buffer is otherwise immutable.
      // Static usage lets the backend keep it in GPU-optimal storage instead of treating every plant organ
      // as a per-frame streaming buffer.
      mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
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
      if (bucket.key.startsWith("grassCarpet:")) {
        const vertices = bucket.geometry.getAttribute("position")?.count ?? 0;
        const trianglesPerInstance = (bucket.geometry.getIndex()?.count ?? vertices) / 3;
        chunk.stats.grassInstances += bucket.instances.length;
        chunk.stats.grassTriangles += trianglesPerInstance * bucket.instances.length;
      }
    }
  };

  const update = (px: number, pz: number, _playerY: number, fps: number, nowMs: number) => {
    if (disposed) return;
    const updateStartedAt = performance.now();
    builtLastUpdate = 0;
    currentFps = fps;
    const camera = options.camera?.();
    if (camera) {
      for (const chunk of active.values()) {
        for (const impostor of chunk.impostors) impostor.update(camera);
      }
    }
    buildDeferred = options.shouldDeferBuild?.() ?? false;
    if (
      lastPlayerX === null ||
      lastPlayerZ === null ||
      Math.hypot(px - lastPlayerX, pz - lastPlayerZ) > 0.15
    ) {
      if (lastPlayerX !== null && lastPlayerZ !== null) {
        const dx = px - lastPlayerX;
        const dz = pz - lastPlayerZ;
        const distance = Math.hypot(dx, dz);
        if (distance > 0.001) {
          lastMoveDirX = dx / distance;
          lastMoveDirZ = dz / distance;
        }
      }
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
            builtLod: null,
            rev: -1,
            styleRev: 0,
            needsColdRefinement: false,
            lastNeededMs: nowMs,
            group: new THREE.Group(),
            impostors: [],
            stats: {
              plants: 0,
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
            },
          };
          chunksCreated++;
          chunk.group.name = `tellus-procplants-${key}`;
          active.set(key, chunk);
          root.add(chunk.group);
        }
        chunk.lastNeededMs = nowMs;
        if (chunk.lod !== lod) {
          chunk.lod = lod;
        }
        if (
          chunk.rev !== terrainRev ||
          chunk.styleRev !== PROCPLANT_RENDER_STYLE_REVISION
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
    // Ring changes do not invalidate visible vegetation while moving. The existing tree graph is
    // still valid; only its ideal density changed. Once streaming catches up and the player settles,
    // refine one nearest mismatched chunk at a time so forests never disappear or rebuild in a burst.
    if (stationary && rebuildQueue.length === 0 && nowMs - lastLodRefreshAt >= 250) {
      const lodCandidate = [...active.values()]
        .filter((chunk) =>
          chunk.needsColdRefinement ||
          (chunk.builtLod !== null && chunk.builtLod !== chunk.lod)
        )
        .sort((a, b) =>
          Math.hypot(a.cx - centerCx, a.cz - centerCz) - Math.hypot(b.cx - centerCx, b.cz - centerCz)
        )[0];
      if (lodCandidate) {
        lodCandidate.rev = -1;
        enqueue(lodCandidate.key, true);
        lastLodRefreshAt = nowMs;
        lodRefreshes++;
      }
    }
    buildPausedForMotion = !stationary && rebuildQueue.length > 0;
    // Continue filling ahead during travel, but start at most one chunk at a controlled cadence. The
    // shared/instanced geometry path above keeps each build small; throttling prevents several chunks
    // from landing on one frame and avoids the old stop-then-catch-up burst.
    const movingBuildIntervalMs = fps >= 50 ? 100 : 250;
    const movingBuildAllowed =
      !stationary &&
      nowMs - lastMovingBuildAt >= movingBuildIntervalMs;
    if (!stationary && !movingBuildAllowed) {
      lastUpdateMs = performance.now() - updateStartedAt;
      maxUpdateMs = Math.max(maxUpdateMs, lastUpdateMs);
      return;
    }
    const maxBuilds = stationary
      ? (fps < 28 ? LOW_FPS_BUILD_BUDGET + 1 : NORMAL_BUILD_BUDGET + 2)
      : 1;
    const buildMsBudget = stationary
      ? (fps < 28 ? LOW_FPS_BUILD_MS_BUDGET + 1.5 : NORMAL_BUILD_MS_BUDGET + 3)
      : LOW_FPS_BUILD_MS_BUDGET;
    const buildStartedAt = performance.now();
    let budget = maxBuilds;
    while (budget > 0 && rebuildQueue.length > 0) {
      const key = rebuildQueue.shift()!;
      queued.delete(key);
      const chunk = active.get(key);
      if (!chunk || chunk.rev === terrainRev) continue;
      const chunkBuildStartedAt = performance.now();
      buildChunk(chunk, stationary);
      const chunkBuildMs = performance.now() - chunkBuildStartedAt;
      lastBuildMs = chunkBuildMs;
      maxBuildMs = Math.max(maxBuildMs, chunkBuildMs);
      totalBuildMs += chunkBuildMs;
      chunksBuilt++;
      builtLastUpdate++;
      if (!stationary) lastMovingBuildAt = nowMs;
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
    out.deferredLodChunks = 0;
    out.deferredColdChunks = 0;
    out.lodRefreshes = lodRefreshes;
    for (const chunk of active.values()) {
      out.plants += chunk.stats.plants;
      out.instances += chunk.stats.instances;
      out.grassInstances += chunk.stats.grassInstances;
      out.grassTriangles += chunk.stats.grassTriangles;
      out.stemTriangles += chunk.stats.stemTriangles;
      out.organDraws += chunk.stats.organDraws;
      out.branchSegments += chunk.stats.branchSegments;
      out.attachedLeaves += chunk.stats.attachedLeaves;
      out.branchLod0 += chunk.stats.branchLod0;
      out.branchLod1 += chunk.stats.branchLod1;
      out.branchLod2 += chunk.stats.branchLod2;
      out.impostors += chunk.stats.impostors;
      if (chunk.builtLod !== null && chunk.builtLod !== chunk.lod) out.deferredLodChunks++;
      if (chunk.needsColdRefinement) out.deferredColdChunks++;
      const renderedLod = chunk.builtLod ?? chunk.lod;
      if (renderedLod === 0) out.lod0++;
      else if (renderedLod === 1) out.lod1++;
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
    notifyRegionsChanged: (regions) => {
      if (regions.length === 0) return;
      terrainInvalidations++;
      for (const [key, chunk] of active) {
        const minX = chunk.cx * chunkSize;
        const minZ = chunk.cz * chunkSize;
        if (!regions.some((region) =>
          minX < region.maxX && minX + chunkSize > region.minX &&
          minZ < region.maxZ && minZ + chunkSize > region.minZ
        )) continue;
        chunk.rev = -1;
        enqueue(key, true);
      }
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
      const nextPlacements = new Map<string, ProcPlantManualPlacement>();
      for (const placement of placements) {
        const normalized = normalizeManualPlacement(placement);
        if (normalized) nextPlacements.set(normalized.id, normalized);
      }
      const changedChunks = new Set<string>();
      for (const [id, current] of manualPlacements) {
        const next = nextPlacements.get(id);
        if (!next || !manualPlacementsEqual(next, current)) {
          changedChunks.add(manualPlacementChunks.get(id) ?? chunkKeyAt(current.x, current.z));
          if (next) changedChunks.add(chunkKeyAt(next.x, next.z));
        }
      }
      for (const [id, next] of nextPlacements) {
        if (!manualPlacements.has(id)) changedChunks.add(chunkKeyAt(next.x, next.z));
      }
      if (changedChunks.size > 0) {
        manualPlacements.clear();
        manualPlacementChunks.clear();
        for (const placement of nextPlacements.values()) {
          manualPlacements.set(placement.id, placement);
          manualPlacementChunks.set(placement.id, chunkKeyAt(placement.x, placement.z));
        }
        for (const key of changedChunks) {
          const chunk = active.get(key);
          if (chunk) chunk.rev = -1;
          enqueue(key, true);
        }
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
      if (typeof window !== "undefined") {
        if (biomeMixServerRefreshTimer !== null) {
          window.clearInterval(biomeMixServerRefreshTimer);
          biomeMixServerRefreshTimer = null;
        }
        window.removeEventListener("storage", onBiomeMixStorage);
        window.removeEventListener(BIOME_MIX_STORAGE_EVENT, onBiomeMixCustomEvent);
        window.removeEventListener("focus", onBiomeMixFocus);
        document.removeEventListener("visibilitychange", onBiomeMixVisibility);
      }
      for (const chunk of active.values()) disposeGroup(chunk.group);
      active.clear();
      root.clear();
      options.scene.remove(root);
      for (const handle of branchTreeImpostorHandles.values()) handle.dispose();
      branchTreeImpostorHandles.clear();
      branchTreeImpostorFailures.clear();
      branchTreeImpostorConsumers.clear();
      for (const geometry of stemGeometryCache.values()) geometry.dispose();
      for (const geometry of organGeometryCache.values()) geometry.dispose();
      stemGeometryCache.clear();
      organGeometryCache.clear();
      stemMaterial.dispose();
      organMaterial.dispose();
    },
  };
}
