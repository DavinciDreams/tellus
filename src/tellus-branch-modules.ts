import * as THREE from "three";
import type { TreeData } from "./vendor/proc-tree/index";
import type { ProcPlantTemplate } from "./tellus-procplants";

export type BranchSegmentPrototypeId = "taper-100" | "taper-75" | "taper-50" | "taper-25";

export interface BranchModuleInstance {
  id: number;
  parentModuleId: number | null;
  depth: number;
  childModuleIds: number[];
  segmentIds: number[];
}

export interface BranchSegmentInstance {
  id: number;
  moduleId: number;
  prototypeId: BranchSegmentPrototypeId;
  start: THREE.Vector3;
  end: THREE.Vector3;
  baseRadius: number;
  tipRadius: number;
  matrix: THREE.Matrix4;
}

export interface AttachedLeafInstance {
  id: number;
  segmentId: number;
  /** Parametric attachment position along the owning segment. */
  t: number;
  anchor: THREE.Vector3;
  direction: THREE.Vector3;
  right: THREE.Vector3;
  matrix: THREE.Matrix4;
  isBlossom: boolean;
}

export interface BranchModuleTree {
  modules: BranchModuleInstance[];
  segments: BranchSegmentInstance[];
  leaves: AttachedLeafInstance[];
  sourceStemCount: number;
  normalizedHeight: number;
}

export type BranchModuleLodLevel = 0 | 1 | 2;

export interface BranchModuleLodView {
  level: BranchModuleLodLevel;
  segments: BranchSegmentInstance[];
  leaves: AttachedLeafInstance[];
}

export interface BranchModuleTreeOptions {
  maxBranchDepth?: number;
  maxStems?: number;
  maxLeaves?: number;
  leafScaleMultiplier?: number;
  /** Per-segment direction jitter multiplier — twisted/windblown growth vs. straight limbs. Default 1. */
  gnarliness?: number;
  /** Downward pull on branch growth direction, generalized beyond the "weeping" species heuristic.
   * 0 = no extra droop (species default only), 1 = strong weeping-willow-like droop. Default 0. */
  droop?: number;
  /** Multiplies how far branches spread horizontally from the trunk. Default 1. */
  spread?: number;
  /** Consistent bias applied to every branch's growth direction, independent of local branch angle —
   * positive pulls toward vertical (upward phototropism/gravitropism), negative pulls outward/downward.
   * Default 0. */
  tropism?: number;
  /** Multiplies how many child branches each module spawns. Default 1. */
  branchDensity?: number;
  /** Multiplies the angle branches diverge from their parent's direction. Default 1. */
  branchAngle?: number;
  /** Multiplies branch length and reduces per-generation taper — a higher-vigor tree grows longer,
   * less-tapered limbs at each depth. Default 1. */
  vigor?: number;
  /** Light proxy for sibling-branch crowding avoidance: spreads a depth level's children further apart
   * in yaw so they overlap less, without true geometric collision checking. Default 0. */
  collisionBias?: number;
  /** Explicit growth archetype — the same 6 values as ProcPlantGenome.branchModules.palette. When set,
   * this overrides the species-name regex guess below; presets that don't set it keep working exactly
   * as before via that regex. */
  palette?: BranchModuleArchetype;
}

export type BranchModuleArchetype =
  | "excurrent-conifer"
  | "decurrent-broadleaf"
  | "weeping"
  | "shrub"
  | "palm-ish"
  | "vine-ish";

interface ArchetypeShape {
  /** Trunk segment count and starting radius. */
  trunkSegments: number;
  trunkRadius: number;
  /** How many first-generation limbs branch directly off the trunk. */
  firstGenChildren: number;
  /** How many limbs each later-generation module spawns (before depth falloff). */
  laterGenChildren: number;
  /** Per-segment upward push at the trunk, and how it decays/grows with depth. */
  trunkLift: number;
  depthLift: number;
  /** Downward pull applied at depth > 0, before the genome's own droop field adds more. */
  archetypeDroop: number;
  /** Outward reach multiplier for branch direction. */
  horizontalReach: number;
  /** Per-generation length/radius falloff base (lower = tapers off faster). */
  depthFalloff: number;
  /** Base length for first-generation branches, before vigor/depth scaling. */
  baseBranchLength: number;
  /** Natural leaf-card scale for this archetype (conifers get a smaller card; the actual mesh may be
   * swapped for a needle spray at the render site based on foliageSource). */
  leafScale: number;
  /** Segment count for non-terminal branch modules (conifers need more segments for their sweep). */
  branchSegmentCount: number;
}

// One config per named archetype — the params captured here reproduce the exact shapes the previous
// per-flag branching produced for excurrent-conifer/decurrent-broadleaf/weeping, plus 3 new archetypes
// (shrub, palm-ish, vine-ish) that previously had no distinct growth pattern at all and fell through to
// the generic broadleaf default regardless of habit.
const ARCHETYPE_SHAPES: Record<BranchModuleArchetype, ArchetypeShape> = {
  "excurrent-conifer": {
    trunkSegments: 8, trunkRadius: 0.052, firstGenChildren: 11, laterGenChildren: 3,
    trunkLift: 0.025, depthLift: 0.09, archetypeDroop: 0, horizontalReach: 0.92,
    depthFalloff: 0.56, baseBranchLength: 0.28, leafScale: 0.012, branchSegmentCount: 3,
  },
  "decurrent-broadleaf": {
    trunkSegments: 6, trunkRadius: 0.058, firstGenChildren: 6, laterGenChildren: 2.4,
    trunkLift: 0.008, depthLift: 0, archetypeDroop: 0, horizontalReach: 0.9,
    depthFalloff: 0.62, baseBranchLength: 0.34, leafScale: 0.026, branchSegmentCount: 3,
  },
  weeping: {
    trunkSegments: 6, trunkRadius: 0.058, firstGenChildren: 6, laterGenChildren: 2.4,
    trunkLift: 0.008, depthLift: 0, archetypeDroop: 0.18, horizontalReach: 0.9,
    depthFalloff: 0.62, baseBranchLength: 0.34, leafScale: 0.026, branchSegmentCount: 3,
  },
  // Bushy, no single dominant leader — many low, short limbs starting near ground level.
  shrub: {
    trunkSegments: 4, trunkRadius: 0.05, firstGenChildren: 9, laterGenChildren: 2.6,
    trunkLift: 0.004, depthLift: 0, archetypeDroop: 0, horizontalReach: 1.05,
    depthFalloff: 0.66, baseBranchLength: 0.24, leafScale: 0.03, branchSegmentCount: 2,
  },
  // Single tall unbranched trunk, foliage only at the very top — palms don't branch structurally at
  // all, so first-gen children model fronds directly rather than sub-branches.
  "palm-ish": {
    trunkSegments: 10, trunkRadius: 0.046, firstGenChildren: 9, laterGenChildren: 0,
    trunkLift: 0.045, depthLift: 0, archetypeDroop: 0.06, horizontalReach: 1.2,
    depthFalloff: 0.5, baseBranchLength: 0.32, leafScale: 0.05, branchSegmentCount: 2,
  },
  // Thin, long, minimally-branched trailing/climbing growth.
  "vine-ish": {
    trunkSegments: 9, trunkRadius: 0.026, firstGenChildren: 4, laterGenChildren: 1.6,
    trunkLift: 0.01, depthLift: -0.02, archetypeDroop: 0.12, horizontalReach: 0.75,
    depthFalloff: 0.72, baseBranchLength: 0.4, leafScale: 0.022, branchSegmentCount: 3,
  },
};

const archetypeFromSpeciesName = (speciesId: string): BranchModuleArchetype => {
  if (/fir|pine|douglas|larch|spruce|redwood/.test(speciesId)) return "excurrent-conifer";
  if (/willow|weeping/.test(speciesId)) return "weeping";
  if (/shrub|bush|hedge/.test(speciesId)) return "shrub";
  if (/palm/.test(speciesId)) return "palm-ish";
  if (/vine|ivy|creeper/.test(speciesId)) return "vine-ish";
  return "decurrent-broadleaf";
};

const UNIT_Y = new THREE.Vector3(0, 1, 0);
// Real branching (and phyllotaxis generally) never lands multiple limbs at the exact same height in an
// even radial spoke pattern — that mechanical regularity is what makes a procedural tree read as fake.
// The golden angle spaces successive branches so no two ever repeat the same azimuth within many turns.
const BRANCH_GOLDEN_ANGLE = THREE.MathUtils.degToRad(137.50776405);
const prototypeTemplates = new Map<BranchSegmentPrototypeId, ProcPlantTemplate>();

const prototypeForTaper = (tipRatio: number): BranchSegmentPrototypeId => {
  if (tipRatio >= 0.875) return "taper-100";
  if (tipRatio >= 0.625) return "taper-75";
  if (tipRatio >= 0.375) return "taper-50";
  return "taper-25";
};

const taperForPrototype = (id: BranchSegmentPrototypeId): number => {
  switch (id) {
    case "taper-100": return 1;
    case "taper-75": return 0.75;
    case "taper-50": return 0.5;
    case "taper-25": return 0.25;
  }
};

/** Shared low-sided branch tube used by every tree, varied only by taper bucket and instance matrix. */
export function branchSegmentPrototypeTemplate(id: BranchSegmentPrototypeId): ProcPlantTemplate {
  const cached = prototypeTemplates.get(id);
  if (cached) return cached;
  const geometry = new THREE.CylinderGeometry(
    taperForPrototype(id),
    1,
    1,
    5,
    1,
    false,
  );
  geometry.translate(0, 0.5, 0);
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const vertexCount = position.count;
  const pos = new Float32Array(vertexCount * 3);
  const nrm = new Float32Array(vertexCount * 3);
  const col = new Float32Array(vertexCount * 3);
  const tintable = new Uint8Array(vertexCount);
  const sway = new Float32Array(vertexCount);
  const bark = new THREE.Color(0x5d4327);
  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    pos[offset] = position.getX(i);
    pos[offset + 1] = position.getY(i);
    pos[offset + 2] = position.getZ(i);
    nrm[offset] = normal.getX(i);
    nrm[offset + 1] = normal.getY(i);
    nrm[offset + 2] = normal.getZ(i);
    col[offset] = bark.r;
    col[offset + 1] = bark.g;
    col[offset + 2] = bark.b;
    sway[i] = Math.max(0, position.getY(i)) ** 2;
  }
  const sourceIndex = geometry.getIndex();
  const idx = new Uint32Array(sourceIndex?.count ?? vertexCount);
  for (let i = 0; i < idx.length; i++) idx[i] = sourceIndex?.getX(i) ?? i;
  geometry.dispose();
  const template = { pos, nrm, col, tintable, sway, idx };
  prototypeTemplates.set(id, template);
  return template;
}

const closestPointOnSegment = (
  point: THREE.Vector3,
  start: THREE.Vector3,
  end: THREE.Vector3,
): { t: number; x: number; y: number; z: number; distanceSq: number } => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  const t = lengthSq > 1e-10
    ? THREE.MathUtils.clamp(
      ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / lengthSq,
      0,
      1,
    )
    : 0;
  const x = start.x + dx * t;
  const y = start.y + dy * t;
  const z = start.z + dz * t;
  const px = point.x - x;
  const py = point.y - y;
  const pz = point.z - z;
  return { t, x, y, z, distanceSq: px * px + py * py + pz * pz };
};

const normalizationForTree = (tree: TreeData) => {
  const points = tree.stems.flatMap((stem) => stem.points.map((point) => point.position));
  if (points.length === 0) return { base: new THREE.Vector3(), scale: 1 };
  const box = new THREE.Box3().setFromPoints(points);
  const height = Math.max(1e-4, box.max.y - box.min.y);
  return {
    base: new THREE.Vector3(
      (box.min.x + box.max.x) * 0.5,
      box.min.y,
      (box.min.z + box.max.z) * 0.5,
    ),
    scale: 1 / height,
  };
};

const normalizedPoint = (point: THREE.Vector3, base: THREE.Vector3, scale: number) =>
  point.clone().sub(base).multiplyScalar(scale);

/**
 * Convert raw procedural tree data into connected modules, shared tapered segment instances, and
 * leaves anchored to their nearest owning segment. No finished species mesh is produced.
 */
export function branchModuleTreeFromData(
  tree: TreeData,
  options: BranchModuleTreeOptions = {},
): BranchModuleTree {
  const maxDepth = options.maxBranchDepth ?? Number.POSITIVE_INFINITY;
  const maxStems = options.maxStems ?? Number.POSITIVE_INFINITY;
  const maxLeaves = options.maxLeaves ?? Number.POSITIVE_INFINITY;
  const selectedStemIndices = tree.stems
    .map((stem, index) => ({ stem, index }))
    .filter(({ stem }) => stem.depth <= maxDepth)
    .slice(0, maxStems);
  const selectedIndexSet = new Set(selectedStemIndices.map(({ index }) => index));
  const moduleIdForStem = new Map<number, number>();
  selectedStemIndices.forEach(({ index }, moduleId) => moduleIdForStem.set(index, moduleId));
  const { base, scale } = normalizationForTree(tree);
  const modules: BranchModuleInstance[] = [];
  const segments: BranchSegmentInstance[] = [];

  for (const { stem, index: stemIndex } of selectedStemIndices) {
    const moduleId = moduleIdForStem.get(stemIndex)!;
    const segmentIds: number[] = [];
    for (let pointIndex = 0; pointIndex < stem.points.length - 1; pointIndex++) {
      const a = stem.points[pointIndex]!;
      const b = stem.points[pointIndex + 1]!;
      const start = normalizedPoint(a.position, base, scale);
      const end = normalizedPoint(b.position, base, scale);
      const direction = end.clone().sub(start);
      const length = direction.length();
      if (length <= 1e-6) continue;
      direction.divideScalar(length);
      const baseRadius = Math.max(1e-5, a.radius * scale);
      const tipRadius = Math.max(1e-5, b.radius * scale);
      const prototypeId = prototypeForTaper(tipRadius / baseRadius);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(UNIT_Y, direction);
      const matrix = new THREE.Matrix4().compose(
        start,
        quaternion,
        new THREE.Vector3(baseRadius, length, baseRadius),
      );
      const id = segments.length;
      segments.push({ id, moduleId, prototypeId, start, end, baseRadius, tipRadius, matrix });
      segmentIds.push(id);
    }
    modules.push({
      id: moduleId,
      parentModuleId:
        stem.parentIndex !== null && selectedIndexSet.has(stem.parentIndex)
          ? moduleIdForStem.get(stem.parentIndex) ?? null
          : null,
      depth: stem.depth,
      childModuleIds: stem.childIndices
        .filter((child) => selectedIndexSet.has(child))
        .map((child) => moduleIdForStem.get(child)!),
      segmentIds,
    });
  }

  const leaves: AttachedLeafInstance[] = [];
  const leafScale = Math.max(
    0.002,
    tree.params.leafScale * scale * (options.leafScaleMultiplier ?? 1),
  );
  for (const leaf of tree.leaves.slice(0, maxLeaves)) {
    const position = normalizedPoint(leaf.position, base, scale);
    let closest: {
      segment: BranchSegmentInstance;
      t: number;
      x: number;
      y: number;
      z: number;
      distanceSq: number;
    } | null = null;
    for (const segment of segments) {
      const candidate = closestPointOnSegment(position, segment.start, segment.end);
      if (!closest || candidate.distanceSq < closest.distanceSq) {
        closest = { segment, ...candidate };
      }
    }
    if (!closest) continue;
    const direction = leaf.direction.clone().normalize();
    const right = leaf.right.clone().addScaledVector(direction, -leaf.right.dot(direction));
    if (right.lengthSq() < 1e-8) {
      right.copy(Math.abs(direction.y) < 0.9 ? UNIT_Y : new THREE.Vector3(1, 0, 0)).cross(direction);
    }
    right.normalize();
    const normal = right.clone().cross(direction).normalize();
    const anchor = new THREE.Vector3(closest.x, closest.y, closest.z);
    const matrix = new THREE.Matrix4().makeBasis(right, direction, normal);
    matrix.scale(new THREE.Vector3(leafScale, leafScale, leafScale));
    matrix.setPosition(anchor);
    leaves.push({
      id: leaves.length,
      segmentId: closest.segment.id,
      t: closest.t,
      anchor,
      direction,
      right,
      matrix,
      isBlossom: leaf.isBlossom,
    });
  }

  return {
    modules,
    segments,
    leaves,
    sourceStemCount: tree.stems.length,
    normalizedHeight: 1,
  };
}

/**
 * Select a connected structural view of a tree. This is geometry LOD, not a replacement mesh:
 * every retained segment still uses the same shared branch prototypes as the full tree.
 */
export function branchModuleLodView(
  tree: BranchModuleTree,
  level: BranchModuleLodLevel,
): BranchModuleLodView {
  if (level === 0) return { level, segments: tree.segments, leaves: tree.leaves };

  const retainedModules = new Set<number>();
  const maxRadius = tree.segments.reduce((largest, segment) => Math.max(largest, segment.baseRadius), 0);
  const moduleById = new Map(tree.modules.map((module) => [module.id, module]));
  const retainModuleAndAncestors = (moduleId: number) => {
    let current: number | null = moduleId;
    while (current !== null && !retainedModules.has(current)) {
      retainedModules.add(current);
      current = moduleById.get(current)?.parentModuleId ?? null;
    }
  };

  for (const module of tree.modules) {
    const widestRadius = module.segmentIds.reduce(
      (largest, id) => Math.max(largest, tree.segments[id]?.baseRadius ?? 0),
      0,
    );
    const relativeRadius = maxRadius > 0 ? widestRadius / maxRadius : 0;
    const retain = level === 1
      ? module.depth <= 1 || relativeRadius >= 0.08 || (module.depth === 2 && module.id % 2 === 0)
      : module.depth === 0 || relativeRadius >= 0.16 || (module.depth === 1 && module.id % 2 === 0);
    if (retain) retainModuleAndAncestors(module.id);
  }

  const segments = tree.segments.filter((segment) => retainedModules.has(segment.moduleId));
  const retainedSegments = new Set(segments.map((segment) => segment.id));
  const leafStride = level === 1 ? 2 : 4;
  const leaves = tree.leaves.filter(
    (leaf) => retainedSegments.has(leaf.segmentId) && leaf.id % leafStride === 0,
  );
  return { level, segments, leaves };
}

export function branchModuleTreeFromSpecies(
  species: string,
  seed: number,
  options: BranchModuleTreeOptions = {},
): BranchModuleTree {
  const speciesId = species.toLowerCase();
  const archetype = options.palette ?? archetypeFromSpeciesName(speciesId);
  const shape = ARCHETYPE_SHAPES[archetype];
  const conifer = archetype === "excurrent-conifer";
  const weeping = archetype === "weeping";
  // Sub-variants within decurrent-broadleaf — narrower species-name hints that tweak proportions
  // without warranting their own archetype (they don't change the branching *pattern*, just scale).
  const slender = archetype === "decurrent-broadleaf" && /birch|aspen|poplar/.test(speciesId);
  const spreading = archetype === "decurrent-broadleaf" && /oak|sassafras|tupelo|acacia/.test(speciesId);
  const blossom = /cherry|apple|magnolia/.test(speciesId);
  let speciesHash = 2166136261;
  for (let i = 0; i < speciesId.length; i++) {
    speciesHash ^= speciesId.charCodeAt(i);
    speciesHash = Math.imul(speciesHash, 16777619);
  }
  let randomState = (seed ^ speciesHash) >>> 0;
  const random = () => {
    randomState = (randomState + 0x6d2b79f5) >>> 0;
    let value = randomState;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const maxDepth = Math.max(1, Math.min(4, Math.round(options.maxBranchDepth ?? 3)));
  const moduleBudget = Math.max(6, Math.min(180, Math.round(options.maxStems ?? 72)));
  const leafBudget = Math.max(0, Math.min(360, Math.round(options.maxLeaves ?? 180)));
  const gnarliness = THREE.MathUtils.clamp(options.gnarliness ?? 1, 0, 3);
  const droop = THREE.MathUtils.clamp(options.droop ?? 0, 0, 2);
  const spreadMul = THREE.MathUtils.clamp(options.spread ?? 1, 0.3, 2.5);
  const tropism = THREE.MathUtils.clamp(options.tropism ?? 0, -1, 1);
  const branchDensityMul = THREE.MathUtils.clamp(options.branchDensity ?? 1, 0.3, 2.5);
  const branchAngleMul = THREE.MathUtils.clamp(options.branchAngle ?? 1, 0.3, 2);
  const vigor = THREE.MathUtils.clamp(options.vigor ?? 1, 0.4, 2);
  const collisionBias = THREE.MathUtils.clamp(options.collisionBias ?? 0, 0, 1.5);
  const modules: BranchModuleInstance[] = [];
  const segments: BranchSegmentInstance[] = [];

  const addSegment = (
    moduleId: number,
    start: THREE.Vector3,
    end: THREE.Vector3,
    baseRadius: number,
    tipRadius: number,
  ): number => {
    const direction = end.clone().sub(start);
    const length = Math.max(1e-5, direction.length());
    direction.divideScalar(length);
    const matrix = new THREE.Matrix4().compose(
      start,
      new THREE.Quaternion().setFromUnitVectors(UNIT_Y, direction),
      new THREE.Vector3(baseRadius, length, baseRadius),
    );
    const id = segments.length;
    segments.push({
      id,
      moduleId,
      prototypeId: prototypeForTaper(tipRadius / Math.max(baseRadius, 1e-5)),
      start: start.clone(),
      end: end.clone(),
      baseRadius,
      tipRadius,
      matrix,
    });
    return id;
  };

  const addModule = (
    parentModuleId: number | null,
    depth: number,
    start: THREE.Vector3,
    initialDirection: THREE.Vector3,
    length: number,
    baseRadius: number,
    segmentCount: number,
  ): number => {
    const id = modules.length;
    const module: BranchModuleInstance = {
      id,
      parentModuleId,
      depth,
      childModuleIds: [],
      segmentIds: [],
    };
    modules.push(module);
    if (parentModuleId !== null) modules[parentModuleId]?.childModuleIds.push(id);
    let point = start.clone();
    let direction = initialDirection.clone().normalize();
    for (let index = 0; index < segmentCount; index++) {
      const segmentT = index / Math.max(1, segmentCount - 1);
      const bend = (0.018 + depth * 0.014) * (0.35 + random()) * gnarliness;
      // weeping species keep their own stronger built-in droop; droop generalizes the same downward
      // pull to any species so a non-weeping genome can still be tuned toward a drooping silhouette.
      const droopPull = (droop * (0.02 + depth * 0.02)) + (weeping && depth > 0 ? 0.035 : 0);
      // tropism is a constant bias applied every segment, independent of depth or species — positive
      // steadily reorients growth upward (phototropism), negative pulls it back down/outward.
      direction.add(new THREE.Vector3(
        (random() - 0.5) * bend,
        (conifer && depth === 0 ? 0.025 : 0.008) - droopPull + tropism * 0.02,
        (random() - 0.5) * bend,
      )).normalize();
      const step = length / segmentCount * (0.9 + random() * 0.2);
      const end = point.clone().addScaledVector(direction, step);
      const radiusA = Math.max(0.0025, baseRadius * (1 - segmentT * 0.68));
      const radiusB = Math.max(0.0015, baseRadius * (1 - (index + 1) / segmentCount * 0.72));
      module.segmentIds.push(addSegment(id, point, end, radiusA, radiusB));
      point = end;
    }
    return id;
  };

  const trunkSegments = slender ? 7 : shape.trunkSegments;
  const trunkRadius = spreading ? 0.068 : shape.trunkRadius;
  addModule(null, 0, new THREE.Vector3(), UNIT_Y, 1, trunkRadius, trunkSegments);
  const pending = [0];
  while (pending.length > 0 && modules.length < moduleBudget) {
    const parentId = pending.shift()!;
    const parent = modules[parentId]!;
    if (parent.depth >= maxDepth) continue;
    const parentSegments = parent.segmentIds.map((id) => segments[id]!).filter(Boolean);
    if (parentSegments.length === 0) continue;
    const nextDepth = parent.depth + 1;
    const firstGenChildren = spreading ? 8 : slender ? 7 : shape.firstGenChildren;
    const desiredChildren = Math.max(1, Math.round(
      (parent.depth === 0
        ? firstGenChildren
        : Math.max(1, shape.laterGenChildren - parent.depth * 0.45 + random())) * branchDensityMul,
    ));
    // palm-ish trees don't branch structurally past the trunk — desiredChildren models fronds at the
    // crown, so later generations should stop rather than keep subdividing.
    if (archetype === "palm-ish" && parent.depth > 0) continue;
    const childCount = Math.min(desiredChildren, moduleBudget - modules.length);
    // collisionBias approximates sibling-crowding avoidance without real geometric checks: it widens
    // the yaw gap enforced between a depth level's children, spreading them further apart around the
    // parent so branches visually overlap less as the tree fills in.
    const collisionYawPad = collisionBias * 0.4;
    // A fixed evenly-spaced "along" term (child/childCount) put every depth-0 branch at one of a small
    // number of exact heights, and an evenly-divided yaw put them all at one of a small number of exact
    // azimuths — together that reproduces a mechanical stacked-wheel silhouette (flat branch "tiers"
    // evenly spun around the trunk) rather than a real tree's irregular canopy. Real randomization
    // (not a small perturbation on an even grid) plus golden-angle azimuth spacing removes both patterns
    // while keeping branches spread across the trunk's height and around its circumference on average.
    for (let child = 0; child < childCount; child++) {
      const along = parent.depth === 0
        ? 0.2 + random() * 0.74
        : 0.32 + random() * 0.62;
      const segmentIndex = Math.min(
        parentSegments.length - 1,
        Math.floor(along * parentSegments.length),
      );
      const parentSegment = parentSegments[segmentIndex]!;
      const localT = THREE.MathUtils.clamp(along * parentSegments.length - segmentIndex, 0.08, 0.96);
      const start = parentSegment.start.clone().lerp(parentSegment.end, localT);
      const yawSpread = 1 + collisionYawPad;
      const yaw = parent.depth === 0
        ? child * BRANCH_GOLDEN_ANGLE * yawSpread + random() * 0.4
        : Math.atan2(
            parentSegment.end.z - parentSegment.start.z,
            parentSegment.end.x - parentSegment.start.x,
          ) + (random() - 0.5) * 1.8 * yawSpread;
      // Base vertical lean per archetype: conifers sweep gently upward with depth, weeping/vine trail
      // downward, palms angle fronds outward-and-up from the crown, everything else (broadleaf, shrub)
      // reaches up-and-out at a loose random angle. shape.archetypeDroop and the genome's own droop/
      // tropism fields then adjust this base lean, same as before.
      const baseVertical = conifer
        ? shape.trunkLift + nextDepth * shape.depthLift
        : weeping
          ? -0.18 - nextDepth * 0.08
          : archetype === "palm-ish"
            ? shape.trunkLift
            : 0.28 + random() * 0.28;
      const vertical = baseVertical - shape.archetypeDroop * nextDepth * 0.09 - droop * 0.22 + tropism * 0.16;
      const horizontal = (spreading ? 1.15 : slender ? 0.72 : shape.horizontalReach) * spreadMul;
      const direction = new THREE.Vector3(
        Math.cos(yaw) * horizontal,
        vertical * branchAngleMul,
        Math.sin(yaw) * horizontal,
      ).normalize();
      if (nextDepth > 1) {
        direction.lerp(parentSegment.end.clone().sub(parentSegment.start).normalize(), 0.28).normalize();
      }
      // Higher vigor grows longer limbs that taper more slowly across generations (a well-fed tree
      // keeps investing in branch length instead of shrinking fast); lower vigor tapers off faster.
      const depthScale = Math.pow(shape.depthFalloff * THREE.MathUtils.lerp(1.18, 0.88, THREE.MathUtils.clamp((vigor - 0.4) / 1.6, 0, 1)), nextDepth - 1);
      const branchLength = (spreading ? 0.42 : shape.baseBranchLength) * depthScale * (0.82 + random() * 0.34) * vigor;
      const branchRadius = Math.max(0.003, parentSegment.baseRadius * (nextDepth === 1 ? 0.5 : 0.58));
      const moduleId = addModule(
        parentId,
        nextDepth,
        start,
        direction,
        branchLength,
        branchRadius,
        nextDepth >= maxDepth ? 2 : shape.branchSegmentCount,
      );
      pending.push(moduleId);
    }
  }

  const terminalSegmentIds = modules
    .filter((module) => module.childModuleIds.length === 0 || module.depth >= Math.max(1, maxDepth - 1))
    .flatMap((module) => module.segmentIds.slice(module.depth === 0 ? 2 : 0));
  const leaves: AttachedLeafInstance[] = [];
  // Both createProcPlantLeafGeometry() and createProcPlantConiferSprayGeometry() build their meshes at
  // a similar ~1-unit natural scale (a unit-tall leaf spine vs. ~1-1.2-unit needle plates), so the same
  // per-species scale applies whichever foliage mesh the render site (tellus-procplant-vegetation.ts)
  // ends up choosing based on genome.branchModules?.foliageSource.
  const leafScale = (slender ? 0.02 : shape.leafScale) * (options.leafScaleMultiplier ?? 1);
  for (let index = 0; index < leafBudget && terminalSegmentIds.length > 0; index++) {
    const segmentId = terminalSegmentIds[index % terminalSegmentIds.length]!;
    const segment = segments[segmentId]!;
    const t = 0.18 + random() * 0.8;
    const anchor = segment.start.clone().lerp(segment.end, t);
    const branchDirection = segment.end.clone().sub(segment.start).normalize();
    const azimuth = random() * Math.PI * 2;
    const direction = new THREE.Vector3(Math.cos(azimuth), 0.35 + random() * 0.65, Math.sin(azimuth)).normalize();
    if (conifer) direction.lerp(branchDirection, 0.45).normalize();
    const right = new THREE.Vector3().crossVectors(
      Math.abs(direction.y) < 0.92 ? UNIT_Y : new THREE.Vector3(1, 0, 0),
      direction,
    ).normalize();
    const normal = right.clone().cross(direction).normalize();
    const matrix = new THREE.Matrix4().makeBasis(right, direction, normal);
    matrix.scale(new THREE.Vector3(leafScale, leafScale, leafScale));
    matrix.setPosition(anchor);
    leaves.push({
      id: leaves.length,
      segmentId,
      t,
      anchor,
      direction,
      right,
      matrix,
      isBlossom: blossom && index % 5 === 0,
    });
  }

  return {
    modules,
    segments,
    leaves,
    sourceStemCount: modules.length,
    normalizedHeight: 1,
  };
}
