/**
 * Type Definitions for Tree Generation (Weber & Penn)
 *
 * Vendored from hyperscape/packages/procgen (geometry-only subset).
 * TSL/WebGPU rendering types removed — this module produces pure geometry.
 */

import type * as THREE from "three";

// ============================================================================
// ENUMS
// ============================================================================

export const TreeShape = {
  Conical: 0,
  Spherical: 1,
  Hemispherical: 2,
  Cylindrical: 3,
  TaperedCylindrical: 4,
  Flame: 5,
  InverseConical: 6,
  TendFlame: 7,
  Envelope: 8,
} as const;

export type TreeShapeType = (typeof TreeShape)[keyof typeof TreeShape];

export const LeafShape = {
  Default: 0,
  Ovate: 1,
  Linear: 2,
  Cordate: 3,
  Maple: 4,
  Palmate: 5,
  SpikyOak: 6,
  RoundedOak: 7,
  Elliptic: 8,
  Rectangle: 9,
  Triangle: 10,
} as const;

export type LeafShapeType = (typeof LeafShape)[keyof typeof LeafShape];

export const BlossomShape = {
  Cherry: 1,
  Orange: 2,
  Magnolia: 3,
} as const;

export type BlossomShapeType = (typeof BlossomShape)[keyof typeof BlossomShape];

export const BranchMode = {
  AltOpp: 1,
  Whorled: 2,
  Fan: 3,
} as const;

export type BranchModeType = (typeof BranchMode)[keyof typeof BranchMode];

// ============================================================================
// PARAMETERS
// ============================================================================

export type LevelArray = readonly [number, number, number, number];
export type TropismVector = readonly [number, number, number];

export type TreeParams = {
  shape: TreeShapeType;
  gScale: number;
  gScaleV: number;
  levels: number;
  ratio: number;
  ratioPower: number;
  flare: number;

  baseSplits: number;
  baseSize: LevelArray;

  downAngle: LevelArray;
  downAngleV: LevelArray;
  rotate: LevelArray;
  rotateV: LevelArray;

  branches: LevelArray;
  length: LevelArray;
  lengthV: LevelArray;
  branchDist: LevelArray;

  taper: LevelArray;
  radiusMod: LevelArray;

  curveRes: LevelArray;
  bevelRes: LevelArray;
  curve: LevelArray;
  curveV: LevelArray;
  curveBack: LevelArray;
  bendV: LevelArray;

  segSplits: LevelArray;
  splitAngle: LevelArray;
  splitAngleV: LevelArray;

  tropism: TropismVector;

  pruneRatio: number;
  pruneWidth: number;
  pruneWidthPeak: number;
  prunePowerLow: number;
  prunePowerHigh: number;

  leafBlosNum: number;
  leafShape: LeafShapeType;
  leafScale: number;
  leafScaleX: number;
  leafBend: number;
  leafDistributionLevels: number;
  leafSecondaryScale: number;

  blossomShape: BlossomShapeType;
  blossomScale: number;
  blossomRate: number;
};

export type PartialTreeParams = Partial<TreeParams>;

// ============================================================================
// STEM / LEAF / TREE DATA
// ============================================================================

export type StemPoint = {
  position: THREE.Vector3;
  handleLeft: THREE.Vector3;
  handleRight: THREE.Vector3;
  radius: number;
};

export type StemData = {
  depth: number;
  points: StemPoint[];
  parentIndex: number | null;
  offset: number;
  radiusLimit: number;
  childIndices: number[];
  length: number;
  radius: number;
  lengthChildMax: number;
};

export type LeafData = {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  right: THREE.Vector3;
  isBlossom: boolean;
};

export type TreeData = {
  stems: StemData[];
  leaves: LeafData[];
  params: TreeParams;
  seed: number;
  treeScale: number;
  trunkLength: number;
  baseLength: number;
};

export type LeafShapeGeometry = {
  vertices: readonly (readonly [number, number, number])[];
  faces: readonly (readonly number[])[];
  uvs?: readonly (readonly [number, number])[];
};

export type TreeGenerationOptions = {
  seed?: number;
  generateLeaves?: boolean;
  maxDepth?: number;
};

/** Options for the geometry baker (Tellus-local, TSL-free). */
export type BakeOptions = {
  /** Radial segments for branch tubes (trunk; branches scale down). */
  radialSegments?: number;
  /** Lengthwise samples per Bezier segment along a branch tube (default 4). */
  branchSamples?: number;
  /** Generate end caps for branches. */
  branchCaps?: boolean;
  /** Maximum branch depth to bake (0 = trunk only). */
  maxBranchDepth?: number;
  /** Maximum total stems to bake. */
  maxStems?: number;
  /** Maximum leaves to bake. */
  maxLeaves?: number;
  /** Multiplier applied to each leaf card before baking. */
  leafScaleMultiplier?: number;
  /** Multiplier applied to blossom cards before baking. Defaults to leafScaleMultiplier. */
  blossomScaleMultiplier?: number;
  /** Adds deterministic crown-fill leaf cards around existing leaf anchors. */
  foliageMass?: number;
  /** Controls how many crown-fill cards are emitted per leaf anchor. */
  foliageClusterDensity?: number;
  /** Biases crown-fill toward higher/tip leaves. */
  foliageTipBias?: number;
  /** Local scatter radius for crown-fill cards, in generator units. */
  foliageSpread?: number;
};
