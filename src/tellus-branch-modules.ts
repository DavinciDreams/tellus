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
}

const UNIT_Y = new THREE.Vector3(0, 1, 0);
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
  const conifer = /fir|pine|douglas|larch|spruce|redwood/.test(speciesId);
  const slender = /birch|aspen|poplar/.test(speciesId);
  const spreading = /oak|sassafras|tupelo|acacia/.test(speciesId);
  const weeping = /willow|weeping/.test(speciesId);
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
      const bend = (0.018 + depth * 0.014) * (0.35 + random());
      direction.add(new THREE.Vector3(
        (random() - 0.5) * bend,
        (conifer && depth === 0 ? 0.025 : 0.008) - (weeping && depth > 0 ? 0.035 : 0),
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

  const trunkSegments = conifer ? 8 : slender ? 7 : 6;
  addModule(null, 0, new THREE.Vector3(), UNIT_Y, 1, conifer ? 0.052 : spreading ? 0.068 : 0.058, trunkSegments);
  const pending = [0];
  while (pending.length > 0 && modules.length < moduleBudget) {
    const parentId = pending.shift()!;
    const parent = modules[parentId]!;
    if (parent.depth >= maxDepth) continue;
    const parentSegments = parent.segmentIds.map((id) => segments[id]!).filter(Boolean);
    if (parentSegments.length === 0) continue;
    const nextDepth = parent.depth + 1;
    const desiredChildren = parent.depth === 0
      ? conifer ? 11 : spreading ? 8 : slender ? 7 : 6
      : Math.max(1, Math.round((conifer ? 3 : 2.4) - parent.depth * 0.45 + random()));
    const childCount = Math.min(desiredChildren, moduleBudget - modules.length);
    for (let child = 0; child < childCount; child++) {
      const along = parent.depth === 0
        ? 0.22 + (child + 0.35 + random() * 0.3) / Math.max(1, childCount) * 0.72
        : 0.38 + random() * 0.58;
      const segmentIndex = Math.min(
        parentSegments.length - 1,
        Math.floor(along * parentSegments.length),
      );
      const parentSegment = parentSegments[segmentIndex]!;
      const localT = THREE.MathUtils.clamp(along * parentSegments.length - segmentIndex, 0.08, 0.96);
      const start = parentSegment.start.clone().lerp(parentSegment.end, localT);
      const yaw = parent.depth === 0
        ? (child / Math.max(1, childCount)) * Math.PI * 2 + random() * 0.55
        : Math.atan2(
            parentSegment.end.z - parentSegment.start.z,
            parentSegment.end.x - parentSegment.start.x,
          ) + (random() - 0.5) * 1.8;
      const vertical = conifer
        ? 0.12 + nextDepth * 0.09
        : weeping
          ? -0.18 - nextDepth * 0.08
          : 0.28 + random() * 0.28;
      const horizontal = spreading ? 1.15 : slender ? 0.72 : conifer ? 0.92 : 0.9;
      const direction = new THREE.Vector3(
        Math.cos(yaw) * horizontal,
        vertical,
        Math.sin(yaw) * horizontal,
      ).normalize();
      if (nextDepth > 1) {
        direction.lerp(parentSegment.end.clone().sub(parentSegment.start).normalize(), 0.28).normalize();
      }
      const depthScale = Math.pow(conifer ? 0.56 : 0.62, nextDepth - 1);
      const branchLength = (conifer ? 0.28 : spreading ? 0.42 : 0.34) * depthScale * (0.82 + random() * 0.34);
      const branchRadius = Math.max(0.003, parentSegment.baseRadius * (nextDepth === 1 ? 0.5 : 0.58));
      const moduleId = addModule(
        parentId,
        nextDepth,
        start,
        direction,
        branchLength,
        branchRadius,
        nextDepth >= maxDepth ? 2 : 3,
      );
      pending.push(moduleId);
    }
  }

  const terminalSegmentIds = modules
    .filter((module) => module.childModuleIds.length === 0 || module.depth >= Math.max(1, maxDepth - 1))
    .flatMap((module) => module.segmentIds.slice(module.depth === 0 ? 2 : 0));
  const leaves: AttachedLeafInstance[] = [];
  const leafScale = (conifer ? 0.012 : slender ? 0.02 : 0.026) * (options.leafScaleMultiplier ?? 1);
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
