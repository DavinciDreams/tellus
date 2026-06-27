import * as THREE from "three";

export interface ProcPlantTemplate {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  tintable: Uint8Array;
  sway: Float32Array;
  idx: Uint32Array;
}

export type ProcPlantHabit =
  | "grass"
  | "fern"
  | "flower"
  | "tropical"
  | "shrub"
  | "vine"
  | "tree"
  | "conifer"
  | "palm";

export type LeafShapeKind =
  | "lanceolate"
  | "ovate"
  | "cordate"
  | "palmate"
  | "spatulate"
  | "fan"
  | "linear"
  | "round"
  | "frond"
  | "blade";

export interface CurveGene {
  base: number;
  tip: number;
  curve: number;
}

export interface ProcPlantGenome {
  id: string;
  habit: ProcPlantHabit;
  nodeCount: number;
  internode: CurveGene;
  phyllotaxisAngle: number;
  branchChance: CurveGene;
  branchAngle: { mean: number; spread: number; depthDecay: number };
  apicalDominance: number;
  leaf: {
    shape: LeafShapeKind;
    length: CurveGene;
    widthRatio: number;
    density: CurveGene;
    curl: number;
    serration: number;
    venation: number;
    colorA: number;
    colorB: number;
  };
  flower?: {
    whorls: number;
    petals: number;
    radius: number;
    color: number;
    centerColor: number;
  };
  grass?: {
    blades: number;
    furBias: number;
    heightJitter: number;
  };
  fern?: {
    pinnae: number;
    leafletPairs: number;
    arch: number;
  };
  foliage?: {
    mass: number;
    clusterDensity: number;
    whorlDensity: number;
    tipBias: number;
  };
  tree?: {
    crown: "rounded" | "columnar" | "umbrella" | "propRoot";
    crownStart: number;
    leafClusterScale: number;
    exposedTrunk: number;
  };
  lightResponse: {
    shadeAvoidance: number;
    leafBoostInShade: number;
    branchSuppressionInShade: number;
    phototropism: number;
  };
}

export interface ProcPlantEnvironment {
  light: number;
  moisture: number;
  crowding: number;
  biomeWarmth: number;
}

export interface ProcPlantStats {
  stems: number;
  leaves: number;
  flowers: number;
  triangles: number;
}

export type ProcPlantInstanceKind =
  | "leaf"
  | "grassBlade"
  | "petal"
  | "flowerDisc"
  | "daylilyBloom"
  | "foxgloveBloom"
  | "flowerCenter";
export type ProcPlantFoliageClusterKind = "coniferSpray" | "palmFrond";

export interface ProcPlantInstance {
  kind: ProcPlantInstanceKind | ProcPlantFoliageClusterKind;
  matrix: THREE.Matrix4;
  color: THREE.Color;
  sway: number;
}

export interface ProcPlantInstancedParts {
  stems: ProcPlantTemplate;
  instances: ProcPlantInstance[];
  graph: ProcPlantGraph;
  stats: ProcPlantStats & {
    instances: number;
    stemTriangles: number;
  };
}

interface StemNode {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  radius: number;
  depth: number;
  t: number;
  index: number;
}

interface Organ {
  kind: "leaf" | "flower" | "grassBlade" | "fernLeaflet" | ProcPlantFoliageClusterKind;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  right: THREE.Vector3;
  scale: number;
  t: number;
  bend?: number;
}

export interface ProcPlantGraph {
  stems: StemNode[];
  segments: Array<[number, number]>;
  organs: Organ[];
}

const GOLDEN_ANGLE = THREE.MathUtils.degToRad(137.50776405);
const UP = new THREE.Vector3(0, 1, 0);

export const PHI = (1 + Math.sqrt(5)) / 2;
export const GOLDEN_ANGLE_RADIANS = GOLDEN_ANGLE;

export const defaultPlantEnvironment = (): ProcPlantEnvironment => ({
  light: 0.78,
  moisture: 0.65,
  crowding: 0.25,
  biomeWarmth: 0.7,
});

export const procPlantPresets: Record<string, ProcPlantGenome> = {
  furGrass: {
    id: "furGrass",
    habit: "grass",
    nodeCount: 9,
    internode: { base: 0.12, tip: 0.07, curve: 0.95 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.02, tip: 0, curve: 1 },
    branchAngle: { mean: 0.18, spread: 0.1, depthDecay: 0.7 },
    apicalDominance: 0.9,
    leaf: {
      shape: "blade",
      length: { base: 0.42, tip: 0.76, curve: 1.2 },
      widthRatio: 0.035,
      density: { base: 1, tip: 0.9, curve: 1 },
      curl: 0.22,
      serration: 0,
      venation: 0.15,
      colorA: 0x395f20,
      colorB: 0xa6cf62,
    },
    grass: { blades: 38, furBias: 0.9, heightJitter: 0.38 },
    lightResponse: {
      shadeAvoidance: 0.45,
      leafBoostInShade: 0.2,
      branchSuppressionInShade: 0.4,
      phototropism: 0.18,
    },
  },
  phiFern: {
    id: "phiFern",
    habit: "fern",
    nodeCount: 18,
    internode: { base: 0.09, tip: 0.055, curve: 1.1 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0, tip: 0, curve: 1 },
    branchAngle: { mean: 0.72, spread: 0.18, depthDecay: 0.55 },
    apicalDominance: 0.55,
    leaf: {
      shape: "frond",
      length: { base: 0.19, tip: 0.08, curve: 0.85 },
      widthRatio: 0.28,
      density: { base: 0.95, tip: 0.65, curve: 1 },
      curl: 0.18,
      serration: 0.15,
      venation: 0.45,
      colorA: 0x224f1d,
      colorB: 0x73b851,
    },
    fern: { pinnae: 19, leafletPairs: 5, arch: 0.72 },
    lightResponse: {
      shadeAvoidance: 0.2,
      leafBoostInShade: 0.45,
      branchSuppressionInShade: 0.1,
      phototropism: 0.1,
    },
  },
  meadowFlower: {
    id: "meadowFlower",
    habit: "flower",
    nodeCount: 10,
    internode: { base: 0.11, tip: 0.08, curve: 1.05 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.08, tip: 0.02, curve: 1.8 },
    branchAngle: { mean: 0.55, spread: 0.18, depthDecay: 0.62 },
    apicalDominance: 0.82,
    leaf: {
      shape: "lanceolate",
      length: { base: 0.42, tip: 0.2, curve: 0.75 },
      widthRatio: 0.18,
      density: { base: 0.78, tip: 0.35, curve: 1.35 },
      curl: 0.1,
      serration: 0.08,
      venation: 0.55,
      colorA: 0x315f25,
      colorB: 0x89be54,
    },
    flower: {
      whorls: 2,
      petals: 5,
      radius: 0.22,
      color: 0xffc0d7,
      centerColor: 0xf4c94c,
    },
    lightResponse: {
      shadeAvoidance: 0.72,
      leafBoostInShade: 0.18,
      branchSuppressionInShade: 0.45,
      phototropism: 0.28,
    },
  },
  echinaceaFlower: {
    id: "echinaceaFlower",
    habit: "flower",
    nodeCount: 11,
    internode: { base: 0.14, tip: 0.1, curve: 0.95 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.01, tip: 0, curve: 1.4 },
    branchAngle: { mean: 0.36, spread: 0.12, depthDecay: 0.7 },
    apicalDominance: 0.9,
    leaf: {
      shape: "lanceolate",
      length: { base: 0.48, tip: 0.18, curve: 1.25 },
      widthRatio: 0.32,
      density: { base: 0.92, tip: 0.16, curve: 2.1 },
      curl: 0.08,
      serration: 0.22,
      venation: 0.7,
      colorA: 0x31572a,
      colorB: 0x86ad59,
    },
    flower: {
      whorls: 1,
      petals: 13,
      radius: 0.25,
      color: 0xf08ae0,
      centerColor: 0xd09239,
    },
    lightResponse: {
      shadeAvoidance: 0.68,
      leafBoostInShade: 0.16,
      branchSuppressionInShade: 0.42,
      phototropism: 0.22,
    },
  },
  hibiscusBloom: {
    id: "hibiscusBloom",
    habit: "flower",
    nodeCount: 9,
    internode: { base: 0.12, tip: 0.08, curve: 0.95 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.08, tip: 0.02, curve: 1.4 },
    branchAngle: { mean: 0.48, spread: 0.18, depthDecay: 0.72 },
    apicalDominance: 0.72,
    leaf: {
      shape: "ovate",
      length: { base: 0.42, tip: 0.24, curve: 1.05 },
      widthRatio: 0.5,
      density: { base: 0.82, tip: 0.46, curve: 1.2 },
      curl: 0.12,
      serration: 0.08,
      venation: 0.72,
      colorA: 0x285b31,
      colorB: 0x78af55,
    },
    flower: {
      whorls: 1,
      petals: 5,
      radius: 0.34,
      color: 0xff4f6f,
      centerColor: 0xffd75a,
    },
    lightResponse: {
      shadeAvoidance: 0.52,
      leafBoostInShade: 0.3,
      branchSuppressionInShade: 0.24,
      phototropism: 0.18,
    },
  },
  daylilyFlower: {
    id: "daylilyFlower",
    habit: "flower",
    nodeCount: 10,
    internode: { base: 0.15, tip: 0.1, curve: 0.92 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.02, tip: 0.01, curve: 1.35 },
    branchAngle: { mean: 0.28, spread: 0.1, depthDecay: 0.72 },
    apicalDominance: 0.9,
    leaf: {
      shape: "linear",
      length: { base: 0.86, tip: 0.48, curve: 1.05 },
      widthRatio: 0.06,
      density: { base: 1, tip: 0.3, curve: 1.8 },
      curl: 0.16,
      serration: 0,
      venation: 0.28,
      colorA: 0x365e2c,
      colorB: 0xa8bf62,
    },
    flower: {
      whorls: 2,
      petals: 3,
      radius: 0.27,
      color: 0xff8f2f,
      centerColor: 0xffd158,
    },
    lightResponse: {
      shadeAvoidance: 0.58,
      leafBoostInShade: 0.12,
      branchSuppressionInShade: 0.4,
      phototropism: 0.16,
    },
  },
  foxgloveSpike: {
    id: "foxgloveSpike",
    habit: "flower",
    nodeCount: 13,
    internode: { base: 0.13, tip: 0.085, curve: 1.05 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.01, tip: 0, curve: 1.4 },
    branchAngle: { mean: 0.32, spread: 0.1, depthDecay: 0.72 },
    apicalDominance: 0.94,
    leaf: {
      shape: "ovate",
      length: { base: 0.34, tip: 0.16, curve: 1.35 },
      widthRatio: 0.42,
      density: { base: 0.82, tip: 0.18, curve: 2 },
      curl: 0.1,
      serration: 0.18,
      venation: 0.6,
      colorA: 0x2d572f,
      colorB: 0x86aa58,
    },
    flower: {
      whorls: 2,
      petals: 5,
      radius: 0.12,
      color: 0xd06ad8,
      centerColor: 0xf5d3ef,
    },
    lightResponse: {
      shadeAvoidance: 0.72,
      leafBoostInShade: 0.16,
      branchSuppressionInShade: 0.45,
      phototropism: 0.22,
    },
  },
  tulipCup: {
    id: "tulipCup",
    habit: "flower",
    nodeCount: 8,
    internode: { base: 0.13, tip: 0.09, curve: 0.95 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0, tip: 0, curve: 1 },
    branchAngle: { mean: 0.18, spread: 0.08, depthDecay: 0.7 },
    apicalDominance: 0.96,
    leaf: {
      shape: "lanceolate",
      length: { base: 0.62, tip: 0.34, curve: 1.05 },
      widthRatio: 0.2,
      density: { base: 0.9, tip: 0.22, curve: 1.8 },
      curl: 0.12,
      serration: 0.01,
      venation: 0.42,
      colorA: 0x315f30,
      colorB: 0x9fbb5f,
    },
    flower: {
      whorls: 2,
      petals: 3,
      radius: 0.24,
      color: 0xff9a66,
      centerColor: 0xffd56a,
    },
    lightResponse: {
      shadeAvoidance: 0.48,
      leafBoostInShade: 0.14,
      branchSuppressionInShade: 0.36,
      phototropism: 0.14,
    },
  },
  poppyFlower: {
    id: "poppyFlower",
    habit: "flower",
    nodeCount: 9,
    internode: { base: 0.13, tip: 0.09, curve: 0.95 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.01, tip: 0, curve: 1.3 },
    branchAngle: { mean: 0.34, spread: 0.12, depthDecay: 0.72 },
    apicalDominance: 0.88,
    leaf: {
      shape: "frond",
      length: { base: 0.3, tip: 0.14, curve: 1.25 },
      widthRatio: 0.26,
      density: { base: 0.74, tip: 0.18, curve: 2 },
      curl: 0.08,
      serration: 0.26,
      venation: 0.42,
      colorA: 0x3a612e,
      colorB: 0x95b661,
    },
    flower: {
      whorls: 1,
      petals: 4,
      radius: 0.28,
      color: 0xff2f1f,
      centerColor: 0x282414,
    },
    lightResponse: {
      shadeAvoidance: 0.66,
      leafBoostInShade: 0.14,
      branchSuppressionInShade: 0.42,
      phototropism: 0.2,
    },
  },
  sunflowerTower: {
    id: "sunflowerTower",
    habit: "flower",
    nodeCount: 14,
    internode: { base: 0.16, tip: 0.1, curve: 1 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.03, tip: 0.01, curve: 1.6 },
    branchAngle: { mean: 0.4, spread: 0.14, depthDecay: 0.7 },
    apicalDominance: 0.92,
    leaf: {
      shape: "cordate",
      length: { base: 0.42, tip: 0.24, curve: 1.2 },
      widthRatio: 0.52,
      density: { base: 0.7, tip: 0.34, curve: 1.55 },
      curl: 0.08,
      serration: 0.14,
      venation: 0.7,
      colorA: 0x31572a,
      colorB: 0x8baa4d,
    },
    flower: {
      whorls: 2,
      petals: 17,
      radius: 0.32,
      color: 0xffd22e,
      centerColor: 0x5b3b1b,
    },
    lightResponse: {
      shadeAvoidance: 0.78,
      leafBoostInShade: 0.14,
      branchSuppressionInShade: 0.42,
      phototropism: 0.24,
    },
  },
  cloverGroundcover: {
    id: "cloverGroundcover",
    habit: "vine",
    nodeCount: 12,
    internode: { base: 0.11, tip: 0.08, curve: 1.05 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.18, tip: 0.08, curve: 1.25 },
    branchAngle: { mean: 0.42, spread: 0.2, depthDecay: 0.72 },
    apicalDominance: 0.28,
    leaf: {
      shape: "round",
      length: { base: 0.14, tip: 0.1, curve: 0.9 },
      widthRatio: 0.82,
      density: { base: 0.95, tip: 0.8, curve: 1 },
      curl: 0.035,
      serration: 0.01,
      venation: 0.48,
      colorA: 0x25562d,
      colorB: 0x79b853,
    },
    flower: {
      whorls: 1,
      petals: 9,
      radius: 0.09,
      color: 0xf4e8ff,
      centerColor: 0xd8c4ee,
    },
    lightResponse: {
      shadeAvoidance: 0.18,
      leafBoostInShade: 0.32,
      branchSuppressionInShade: 0.18,
      phototropism: 0.06,
    },
  },
  laceUmbel: {
    id: "laceUmbel",
    habit: "flower",
    nodeCount: 12,
    internode: { base: 0.14, tip: 0.09, curve: 1 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.03, tip: 0.01, curve: 1.7 },
    branchAngle: { mean: 0.6, spread: 0.24, depthDecay: 0.72 },
    apicalDominance: 0.88,
    leaf: {
      shape: "frond",
      length: { base: 0.24, tip: 0.12, curve: 1.25 },
      widthRatio: 0.2,
      density: { base: 0.62, tip: 0.2, curve: 1.9 },
      curl: 0.12,
      serration: 0.2,
      venation: 0.44,
      colorA: 0x2b6234,
      colorB: 0x91bd64,
    },
    flower: {
      whorls: 1,
      petals: 5,
      radius: 0.055,
      color: 0xfff7e8,
      centerColor: 0xf1df8c,
    },
    lightResponse: {
      shadeAvoidance: 0.82,
      leafBoostInShade: 0.16,
      branchSuppressionInShade: 0.46,
      phototropism: 0.26,
    },
  },
  irisBulb: {
    id: "irisBulb",
    habit: "flower",
    nodeCount: 10,
    internode: { base: 0.16, tip: 0.1, curve: 0.92 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.01, tip: 0, curve: 1.3 },
    branchAngle: { mean: 0.22, spread: 0.08, depthDecay: 0.7 },
    apicalDominance: 0.92,
    leaf: {
      shape: "linear",
      length: { base: 0.92, tip: 0.52, curve: 1.05 },
      widthRatio: 0.075,
      density: { base: 1, tip: 0.32, curve: 1.8 },
      curl: 0.1,
      serration: 0,
      venation: 0.32,
      colorA: 0x315d36,
      colorB: 0x9dbb68,
    },
    flower: {
      whorls: 2,
      petals: 3,
      radius: 0.24,
      color: 0xb79cff,
      centerColor: 0xffd26a,
    },
    lightResponse: {
      shadeAvoidance: 0.58,
      leafBoostInShade: 0.12,
      branchSuppressionInShade: 0.4,
      phototropism: 0.16,
    },
  },
  agaveSucculent: {
    id: "agaveSucculent",
    habit: "tropical",
    nodeCount: 8,
    internode: { base: 0.04, tip: 0.025, curve: 1 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0, tip: 0, curve: 1 },
    branchAngle: { mean: 1.1, spread: 0.18, depthDecay: 0.5 },
    apicalDominance: 0.94,
    leaf: {
      shape: "spatulate",
      length: { base: 0.72, tip: 0.42, curve: 0.85 },
      widthRatio: 0.22,
      density: { base: 1, tip: 1, curve: 1 },
      curl: -0.12,
      serration: 0.08,
      venation: 0.18,
      colorA: 0x536f62,
      colorB: 0xb5c9a9,
    },
    lightResponse: {
      shadeAvoidance: 0.08,
      leafBoostInShade: 0.04,
      branchSuppressionInShade: 0.1,
      phototropism: 0.03,
    },
  },
  tropicalAroid: {
    id: "tropicalAroid",
    habit: "tropical",
    nodeCount: 13,
    internode: { base: 0.16, tip: 0.1, curve: 1 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.12, tip: 0.04, curve: 1.4 },
    branchAngle: { mean: 0.78, spread: 0.25, depthDecay: 0.55 },
    apicalDominance: 0.72,
    leaf: {
      shape: "cordate",
      length: { base: 0.72, tip: 0.46, curve: 0.8 },
      widthRatio: 0.62,
      density: { base: 0.75, tip: 0.55, curve: 1 },
      curl: 0.2,
      serration: 0.02,
      venation: 0.85,
      colorA: 0x244d2a,
      colorB: 0x66a94f,
    },
    flower: {
      whorls: 1,
      petals: 1,
      radius: 0.12,
      color: 0xe9f0c9,
      centerColor: 0xf6db6b,
    },
    lightResponse: {
      shadeAvoidance: 0.42,
      leafBoostInShade: 0.62,
      branchSuppressionInShade: 0.22,
      phototropism: 0.2,
    },
  },
  understoryShrub: {
    id: "understoryShrub",
    habit: "shrub",
    nodeCount: 15,
    internode: { base: 0.14, tip: 0.08, curve: 1.15 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.36, tip: 0.12, curve: 1.6 },
    branchAngle: { mean: 0.64, spread: 0.22, depthDecay: 0.68 },
    apicalDominance: 0.48,
    leaf: {
      shape: "ovate",
      length: { base: 0.28, tip: 0.18, curve: 1 },
      widthRatio: 0.42,
      density: { base: 0.9, tip: 0.7, curve: 1 },
      curl: 0.12,
      serration: 0.12,
      venation: 0.6,
      colorA: 0x2d5b24,
      colorB: 0x7fb449,
    },
    lightResponse: {
      shadeAvoidance: 0.38,
      leafBoostInShade: 0.32,
      branchSuppressionInShade: 0.28,
      phototropism: 0.15,
    },
  },
  reedSedge: {
    id: "reedSedge",
    habit: "grass",
    nodeCount: 11,
    internode: { base: 0.18, tip: 0.11, curve: 0.85 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.01, tip: 0, curve: 1 },
    branchAngle: { mean: 0.16, spread: 0.08, depthDecay: 0.6 },
    apicalDominance: 0.94,
    leaf: {
      shape: "linear",
      length: { base: 0.75, tip: 1.35, curve: 1.05 },
      widthRatio: 0.024,
      density: { base: 1, tip: 0.9, curve: 1 },
      curl: 0.1,
      serration: 0,
      venation: 0.2,
      colorA: 0x4a612c,
      colorB: 0xc1bd67,
    },
    grass: { blades: 26, furBias: 0.45, heightJitter: 0.22 },
    flower: {
      whorls: 1,
      petals: 1,
      radius: 0.08,
      color: 0x8a6336,
      centerColor: 0x5f3d25,
    },
    lightResponse: {
      shadeAvoidance: 0.62,
      leafBoostInShade: 0.08,
      branchSuppressionInShade: 0.5,
      phototropism: 0.12,
    },
  },
  desertRosette: {
    id: "desertRosette",
    habit: "tropical",
    nodeCount: 7,
    internode: { base: 0.045, tip: 0.03, curve: 1 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.01, tip: 0, curve: 1 },
    branchAngle: { mean: 1.02, spread: 0.18, depthDecay: 0.45 },
    apicalDominance: 0.88,
    leaf: {
      shape: "spatulate",
      length: { base: 0.62, tip: 0.42, curve: 0.78 },
      widthRatio: 0.34,
      density: { base: 1, tip: 0.95, curve: 1 },
      curl: -0.06,
      serration: 0.03,
      venation: 0.25,
      colorA: 0x5e8567,
      colorB: 0xb7cf9f,
    },
    flower: {
      whorls: 2,
      petals: 6,
      radius: 0.12,
      color: 0xffa85f,
      centerColor: 0xffe08a,
    },
    lightResponse: {
      shadeAvoidance: 0.18,
      leafBoostInShade: 0.05,
      branchSuppressionInShade: 0.15,
      phototropism: 0.04,
    },
  },
  lotusBloom: {
    id: "lotusBloom",
    habit: "flower",
    nodeCount: 8,
    internode: { base: 0.19, tip: 0.12, curve: 0.9 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.03, tip: 0.01, curve: 1.4 },
    branchAngle: { mean: 0.92, spread: 0.2, depthDecay: 0.55 },
    apicalDominance: 0.86,
    leaf: {
      shape: "palmate",
      length: { base: 0.78, tip: 0.44, curve: 0.7 },
      widthRatio: 0.72,
      density: { base: 0.7, tip: 0.42, curve: 1.15 },
      curl: 0.05,
      serration: 0.02,
      venation: 0.9,
      colorA: 0x2e6e45,
      colorB: 0x78b866,
    },
    flower: {
      whorls: 3,
      petals: 8,
      radius: 0.28,
      color: 0xffd7e8,
      centerColor: 0xffcf58,
    },
    lightResponse: {
      shadeAvoidance: 0.38,
      leafBoostInShade: 0.24,
      branchSuppressionInShade: 0.3,
      phototropism: 0.18,
    },
  },
  bambooClump: {
    id: "bambooClump",
    habit: "grass",
    nodeCount: 16,
    internode: { base: 0.22, tip: 0.16, curve: 0.92 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.02, tip: 0, curve: 1 },
    branchAngle: { mean: 0.2, spread: 0.08, depthDecay: 0.6 },
    apicalDominance: 0.96,
    leaf: {
      shape: "linear",
      length: { base: 1.0, tip: 1.8, curve: 1.1 },
      widthRatio: 0.018,
      density: { base: 1, tip: 0.95, curve: 1 },
      curl: 0.04,
      serration: 0,
      venation: 0.12,
      colorA: 0x4b7d35,
      colorB: 0xb8d46c,
    },
    grass: { blades: 18, furBias: 0.12, heightJitter: 0.12 },
    lightResponse: {
      shadeAvoidance: 0.7,
      leafBoostInShade: 0.08,
      branchSuppressionInShade: 0.38,
      phototropism: 0.12,
    },
  },
  fanPalmUnderstory: {
    id: "fanPalmUnderstory",
    habit: "tropical",
    nodeCount: 10,
    internode: { base: 0.11, tip: 0.07, curve: 1.1 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.04, tip: 0.01, curve: 1.6 },
    branchAngle: { mean: 0.88, spread: 0.28, depthDecay: 0.55 },
    apicalDominance: 0.8,
    leaf: {
      shape: "fan",
      length: { base: 0.68, tip: 0.54, curve: 0.9 },
      widthRatio: 0.82,
      density: { base: 0.8, tip: 0.68, curve: 1 },
      curl: 0.14,
      serration: 0.18,
      venation: 0.95,
      colorA: 0x286d37,
      colorB: 0x79bd4e,
    },
    lightResponse: {
      shadeAvoidance: 0.28,
      leafBoostInShade: 0.5,
      branchSuppressionInShade: 0.18,
      phototropism: 0.16,
    },
  },
  vincaVine: {
    id: "vincaVine",
    habit: "vine",
    nodeCount: 18,
    internode: { base: 0.17, tip: 0.11, curve: 1.05 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.24, tip: 0.08, curve: 1.35 },
    branchAngle: { mean: 0.48, spread: 0.18, depthDecay: 0.72 },
    apicalDominance: 0.42,
    leaf: {
      shape: "round",
      length: { base: 0.22, tip: 0.16, curve: 0.9 },
      widthRatio: 0.86,
      density: { base: 0.95, tip: 0.78, curve: 1 },
      curl: 0.05,
      serration: 0.01,
      venation: 0.5,
      colorA: 0x244f2d,
      colorB: 0x78af58,
    },
    flower: {
      whorls: 1,
      petals: 5,
      radius: 0.16,
      color: 0xb7a7ff,
      centerColor: 0xf5f0ba,
    },
    lightResponse: {
      shadeAvoidance: 0.46,
      leafBoostInShade: 0.28,
      branchSuppressionInShade: 0.24,
      phototropism: 0.1,
    },
  },
  roseBush: {
    id: "roseBush",
    habit: "shrub",
    nodeCount: 16,
    internode: { base: 0.12, tip: 0.07, curve: 1.22 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.42, tip: 0.16, curve: 1.45 },
    branchAngle: { mean: 0.58, spread: 0.22, depthDecay: 0.74 },
    apicalDominance: 0.34,
    leaf: {
      shape: "round",
      length: { base: 0.2, tip: 0.13, curve: 1 },
      widthRatio: 0.72,
      density: { base: 0.92, tip: 0.76, curve: 1 },
      curl: 0.08,
      serration: 0.28,
      venation: 0.65,
      colorA: 0x2f5b2e,
      colorB: 0x7fac4d,
    },
    flower: {
      whorls: 4,
      petals: 9,
      radius: 0.2,
      color: 0xd84d63,
      centerColor: 0xffc76a,
    },
    lightResponse: {
      shadeAvoidance: 0.34,
      leafBoostInShade: 0.18,
      branchSuppressionInShade: 0.2,
      phototropism: 0.16,
    },
  },
  oakCanopy: {
    id: "oakCanopy",
    habit: "tree",
    nodeCount: 18,
    internode: { base: 0.18, tip: 0.08, curve: 1.28 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.34, tip: 0.2, curve: 1.05 },
    branchAngle: { mean: 0.68, spread: 0.32, depthDecay: 0.72 },
    apicalDominance: 0.34,
    leaf: {
      shape: "ovate",
      length: { base: 0.26, tip: 0.2, curve: 0.9 },
      widthRatio: 0.54,
      density: { base: 0.68, tip: 0.92, curve: 0.78 },
      curl: 0.09,
      serration: 0.12,
      venation: 0.66,
      colorA: 0x2a5426,
      colorB: 0x83a94d,
    },
    tree: {
      crown: "rounded",
      crownStart: 0.34,
      leafClusterScale: 1.05,
      exposedTrunk: 0.28,
    },
    foliage: { mass: 0.78, clusterDensity: 1.35, whorlDensity: 0.45, tipBias: 0.58 },
    lightResponse: {
      shadeAvoidance: 0.42,
      leafBoostInShade: 0.18,
      branchSuppressionInShade: 0.18,
      phototropism: 0.12,
    },
  },
  birchGrove: {
    id: "birchGrove",
    habit: "tree",
    nodeCount: 20,
    internode: { base: 0.2, tip: 0.09, curve: 1.12 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.18, tip: 0.14, curve: 1 },
    branchAngle: { mean: 0.46, spread: 0.22, depthDecay: 0.76 },
    apicalDominance: 0.64,
    leaf: {
      shape: "round",
      length: { base: 0.18, tip: 0.13, curve: 0.9 },
      widthRatio: 0.68,
      density: { base: 0.48, tip: 0.82, curve: 0.72 },
      curl: 0.06,
      serration: 0.22,
      venation: 0.58,
      colorA: 0x4b7034,
      colorB: 0xb6c95e,
    },
    tree: {
      crown: "columnar",
      crownStart: 0.42,
      leafClusterScale: 0.82,
      exposedTrunk: 0.5,
    },
    foliage: { mass: 0.58, clusterDensity: 1.02, whorlDensity: 0.36, tipBias: 0.72 },
    lightResponse: {
      shadeAvoidance: 0.58,
      leafBoostInShade: 0.16,
      branchSuppressionInShade: 0.26,
      phototropism: 0.2,
    },
  },
  acaciaUmbrella: {
    id: "acaciaUmbrella",
    habit: "tree",
    nodeCount: 15,
    internode: { base: 0.18, tip: 0.075, curve: 1.25 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.14, tip: 0.34, curve: 0.78 },
    branchAngle: { mean: 0.92, spread: 0.28, depthDecay: 0.74 },
    apicalDominance: 0.42,
    leaf: {
      shape: "round",
      length: { base: 0.13, tip: 0.1, curve: 0.9 },
      widthRatio: 0.58,
      density: { base: 0.36, tip: 0.86, curve: 0.58 },
      curl: 0.08,
      serration: 0.03,
      venation: 0.36,
      colorA: 0x385d2c,
      colorB: 0xa6b75f,
    },
    tree: {
      crown: "umbrella",
      crownStart: 0.56,
      leafClusterScale: 1.14,
      exposedTrunk: 0.56,
    },
    foliage: { mass: 0.62, clusterDensity: 1.18, whorlDensity: 0.5, tipBias: 0.84 },
    lightResponse: {
      shadeAvoidance: 0.5,
      leafBoostInShade: 0.08,
      branchSuppressionInShade: 0.2,
      phototropism: 0.1,
    },
  },
  mangroveRoots: {
    id: "mangroveRoots",
    habit: "tree",
    nodeCount: 15,
    internode: { base: 0.14, tip: 0.075, curve: 1.15 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.28, tip: 0.18, curve: 1.1 },
    branchAngle: { mean: 0.72, spread: 0.25, depthDecay: 0.72 },
    apicalDominance: 0.38,
    leaf: {
      shape: "ovate",
      length: { base: 0.22, tip: 0.17, curve: 0.88 },
      widthRatio: 0.5,
      density: { base: 0.62, tip: 0.88, curve: 0.82 },
      curl: 0.1,
      serration: 0.02,
      venation: 0.58,
      colorA: 0x24573b,
      colorB: 0x82ad5a,
    },
    tree: {
      crown: "propRoot",
      crownStart: 0.36,
      leafClusterScale: 0.96,
      exposedTrunk: 0.32,
    },
    foliage: { mass: 0.72, clusterDensity: 1.22, whorlDensity: 0.44, tipBias: 0.62 },
    lightResponse: {
      shadeAvoidance: 0.34,
      leafBoostInShade: 0.24,
      branchSuppressionInShade: 0.18,
      phototropism: 0.12,
    },
  },
  blueSpruce: {
    id: "blueSpruce",
    habit: "conifer",
    nodeCount: 18,
    internode: { base: 0.22, tip: 0.085, curve: 1.28 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.22, tip: 0.08, curve: 1.18 },
    branchAngle: { mean: 0.82, spread: 0.2, depthDecay: 0.72 },
    apicalDominance: 0.72,
    leaf: {
      shape: "linear",
      length: { base: 0.78, tip: 0.32, curve: 1.15 },
      widthRatio: 0.18,
      density: { base: 0.92, tip: 0.68, curve: 0.95 },
      curl: 0.18,
      serration: 0,
      venation: 0.08,
      colorA: 0x263f32,
      colorB: 0x6f8f74,
    },
    foliage: { mass: 0.92, clusterDensity: 1.26, whorlDensity: 0.84, tipBias: 0.38 },
    lightResponse: {
      shadeAvoidance: 0.28,
      leafBoostInShade: 0.12,
      branchSuppressionInShade: 0.18,
      phototropism: 0.08,
    },
  },
  alpineFir: {
    id: "alpineFir",
    habit: "conifer",
    nodeCount: 20,
    internode: { base: 0.2, tip: 0.07, curve: 1.42 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.28, tip: 0.1, curve: 1.32 },
    branchAngle: { mean: 0.74, spread: 0.16, depthDecay: 0.74 },
    apicalDominance: 0.82,
    leaf: {
      shape: "linear",
      length: { base: 0.62, tip: 0.24, curve: 1.2 },
      widthRatio: 0.16,
      density: { base: 0.95, tip: 0.7, curve: 1.08 },
      curl: 0.22,
      serration: 0,
      venation: 0.06,
      colorA: 0x1f392e,
      colorB: 0x6b8a63,
    },
    foliage: { mass: 1.04, clusterDensity: 1.36, whorlDensity: 0.96, tipBias: 0.32 },
    lightResponse: {
      shadeAvoidance: 0.22,
      leafBoostInShade: 0.16,
      branchSuppressionInShade: 0.12,
      phototropism: 0.05,
    },
  },
  redwoodSpire: {
    id: "redwoodSpire",
    habit: "conifer",
    nodeCount: 24,
    internode: { base: 0.24, tip: 0.08, curve: 1.22 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.16, tip: 0.06, curve: 1.18 },
    branchAngle: { mean: 0.58, spread: 0.16, depthDecay: 0.78 },
    apicalDominance: 0.9,
    leaf: {
      shape: "linear",
      length: { base: 0.56, tip: 0.22, curve: 1.12 },
      widthRatio: 0.18,
      density: { base: 0.78, tip: 0.58, curve: 1 },
      curl: 0.12,
      serration: 0,
      venation: 0.06,
      colorA: 0x264735,
      colorB: 0x78965e,
    },
    foliage: { mass: 0.6, clusterDensity: 0.86, whorlDensity: 0.5, tipBias: 0.62 },
    lightResponse: {
      shadeAvoidance: 0.36,
      leafBoostInShade: 0.12,
      branchSuppressionInShade: 0.12,
      phototropism: 0.06,
    },
  },
  foldedPalm: {
    id: "foldedPalm",
    habit: "palm",
    nodeCount: 15,
    internode: { base: 0.2, tip: 0.14, curve: 0.9 },
    phyllotaxisAngle: GOLDEN_ANGLE,
    branchChance: { base: 0.01, tip: 0, curve: 1 },
    branchAngle: { mean: 0.95, spread: 0.18, depthDecay: 0.55 },
    apicalDominance: 0.95,
    leaf: {
      shape: "fan",
      length: { base: 0.85, tip: 0.62, curve: 0.85 },
      widthRatio: 0.58,
      density: { base: 1, tip: 1, curve: 1 },
      curl: 0.18,
      serration: 0.08,
      venation: 0.95,
      colorA: 0x2e7438,
      colorB: 0xa4c760,
    },
    lightResponse: {
      shadeAvoidance: 0.42,
      leafBoostInShade: 0.2,
      branchSuppressionInShade: 0.12,
      phototropism: 0.12,
    },
  },
};

const curve = (gene: CurveGene, t: number): number => {
  const u = Math.max(0, Math.min(1, t));
  const shaped = gene.curve === 1 ? u : Math.pow(u, gene.curve);
  return THREE.MathUtils.lerp(gene.base, gene.tip, shaped);
};

const rngFromSeed = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const mixCurve = (a: CurveGene, b: CurveGene, alpha: number): CurveGene => ({
  base: THREE.MathUtils.lerp(a.base, b.base, alpha),
  tip: THREE.MathUtils.lerp(a.tip, b.tip, alpha),
  curve: THREE.MathUtils.lerp(a.curve, b.curve, alpha),
});

export const hybridizePlantGenomes = (
  a: ProcPlantGenome,
  b: ProcPlantGenome,
  alpha: number,
  seed = 1,
): ProcPlantGenome => {
  const rng = rngFromSeed(seed);
  const pick = <T>(left: T, right: T): T => (rng() < alpha ? right : left);
  const habit = pick(a.habit, b.habit);
  return {
    id: `${a.id}-${b.id}-hybrid`,
    habit,
    nodeCount: Math.round(THREE.MathUtils.lerp(a.nodeCount, b.nodeCount, alpha)),
    internode: mixCurve(a.internode, b.internode, alpha),
    phyllotaxisAngle: THREE.MathUtils.lerp(a.phyllotaxisAngle, b.phyllotaxisAngle, alpha),
    branchChance: mixCurve(a.branchChance, b.branchChance, alpha),
    branchAngle: {
      mean: THREE.MathUtils.lerp(a.branchAngle.mean, b.branchAngle.mean, alpha),
      spread: THREE.MathUtils.lerp(a.branchAngle.spread, b.branchAngle.spread, alpha),
      depthDecay: THREE.MathUtils.lerp(a.branchAngle.depthDecay, b.branchAngle.depthDecay, alpha),
    },
    apicalDominance: THREE.MathUtils.lerp(a.apicalDominance, b.apicalDominance, alpha),
    leaf: {
      shape: pick(a.leaf.shape, b.leaf.shape),
      length: mixCurve(a.leaf.length, b.leaf.length, alpha),
      widthRatio: THREE.MathUtils.lerp(a.leaf.widthRatio, b.leaf.widthRatio, alpha),
      density: mixCurve(a.leaf.density, b.leaf.density, alpha),
      curl: THREE.MathUtils.lerp(a.leaf.curl, b.leaf.curl, alpha),
      serration: THREE.MathUtils.lerp(a.leaf.serration, b.leaf.serration, alpha),
      venation: THREE.MathUtils.lerp(a.leaf.venation, b.leaf.venation, alpha),
      colorA: pick(a.leaf.colorA, b.leaf.colorA),
      colorB: pick(a.leaf.colorB, b.leaf.colorB),
    },
    flower: pick(a.flower, b.flower),
    grass: pick(a.grass, b.grass),
    fern: pick(a.fern, b.fern),
    foliage:
      a.foliage || b.foliage
        ? {
            mass: THREE.MathUtils.lerp(a.foliage?.mass ?? 0.55, b.foliage?.mass ?? 0.55, alpha),
            clusterDensity: THREE.MathUtils.lerp(
              a.foliage?.clusterDensity ?? 1,
              b.foliage?.clusterDensity ?? 1,
              alpha,
            ),
            whorlDensity: THREE.MathUtils.lerp(
              a.foliage?.whorlDensity ?? 0.45,
              b.foliage?.whorlDensity ?? 0.45,
              alpha,
            ),
            tipBias: THREE.MathUtils.lerp(a.foliage?.tipBias ?? 0.5, b.foliage?.tipBias ?? 0.5, alpha),
          }
        : undefined,
    tree: pick(a.tree, b.tree),
    lightResponse: {
      shadeAvoidance: THREE.MathUtils.lerp(
        a.lightResponse.shadeAvoidance,
        b.lightResponse.shadeAvoidance,
        alpha,
      ),
      leafBoostInShade: THREE.MathUtils.lerp(
        a.lightResponse.leafBoostInShade,
        b.lightResponse.leafBoostInShade,
        alpha,
      ),
      branchSuppressionInShade: THREE.MathUtils.lerp(
        a.lightResponse.branchSuppressionInShade,
        b.lightResponse.branchSuppressionInShade,
        alpha,
      ),
      phototropism: THREE.MathUtils.lerp(
        a.lightResponse.phototropism,
        b.lightResponse.phototropism,
        alpha,
      ),
    },
  };
};

const tangentBasis = (direction: THREE.Vector3) => {
  const forward = direction.clone().normalize();
  const right =
    Math.abs(forward.dot(UP)) > 0.92
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3().crossVectors(forward, UP).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { forward, right, up };
};

const rotateFromAxis = (axis: THREE.Vector3, azimuth: number, elevation: number) => {
  const { forward, right, up } = tangentBasis(axis);
  const lateral = right
    .multiplyScalar(Math.cos(azimuth))
    .add(up.multiplyScalar(Math.sin(azimuth)))
    .normalize();
  return forward
    .multiplyScalar(Math.cos(elevation))
    .add(lateral.multiplyScalar(Math.sin(elevation)))
    .normalize();
};

const flowerLoadBend = (
  genome: ProcPlantGenome,
  position: THREE.Vector3,
  scale: number,
  variant: number,
) => {
  if (!genome.flower) return 0;
  const showyLoad = THREE.MathUtils.clamp((genome.flower.radius * scale - 0.16) / 0.22, 0, 1);
  const stemLeverage = THREE.MathUtils.clamp(position.y / 1.25, 0, 1);
  const slenderness =
    genome.id === "sunflowerTower"
      ? 0.68
      : genome.id === "poppyFlower"
        ? 1
        : genome.id === "hibiscusBloom"
          ? 0.78
          : genome.id === "daylilyFlower"
            ? 0.72
            : genome.id === "tulipCup"
              ? 0.52
              : 0.38;
  return THREE.MathUtils.clamp(showyLoad * stemLeverage * slenderness * (0.72 + variant * 0.56), 0, 0.72);
};

const bendFlowerFrame = (organ: Organ, bend: number) => {
  const forward = organ.direction.clone().normalize();
  const right = organ.right.clone().normalize();
  if (bend <= 0.001) {
    return { forward, right, up: new THREE.Vector3().crossVectors(right, forward).normalize() };
  }
  const awayFromUp = forward.clone().projectOnPlane(UP);
  const leanAxis = awayFromUp.lengthSq() > 0.0001 ? awayFromUp.normalize() : right;
  const droopAxis = new THREE.Vector3().crossVectors(leanAxis, UP).normalize();
  const angle = THREE.MathUtils.degToRad(8 + bend * 38);
  const droopedForward = forward.clone().applyAxisAngle(droopAxis, angle).normalize();
  const droopedRight = right.clone().applyAxisAngle(droopAxis, angle).normalize();
  const up = new THREE.Vector3().crossVectors(droopedRight, droopedForward).normalize();
  return { forward: droopedForward, right: droopedRight, up };
};

export const buildProcPlantGraph = (
  genome: ProcPlantGenome,
  seed = 1,
  env: ProcPlantEnvironment = defaultPlantEnvironment(),
): ProcPlantGraph => {
  const rng = rngFromSeed(seed);
  const stems: StemNode[] = [];
  const segments: Array<[number, number]> = [];
  const organs: Organ[] = [];
  const shade = 1 - THREE.MathUtils.clamp(env.light, 0, 1);
  const heightStretch = 1 + shade * genome.lightResponse.shadeAvoidance;
  const branchShadePenalty = 1 - shade * genome.lightResponse.branchSuppressionInShade;
  const lightVector = new THREE.Vector3(0.25, 1, 0.12).normalize();
  const rootDirection =
    genome.habit === "vine"
      ? new THREE.Vector3(0.62, 0.28, 0.36).normalize()
      : new THREE.Vector3(0, 1, 0);
  const rootRadius =
    genome.habit === "palm"
      ? 0.055
      : genome.habit === "conifer"
        ? 0.045
        : genome.habit === "tree"
          ? 0.052
          : genome.habit === "shrub"
          ? 0.035
          : genome.habit === "vine"
            ? 0.012
            : 0.018;
  const root: StemNode = {
    position: new THREE.Vector3(0, 0, 0),
    direction: rootDirection,
    radius: rootRadius,
    depth: 0,
    t: 0,
    index: 0,
  };
  stems.push(root);
  const foliageTraits = {
    mass: genome.foliage?.mass ?? (genome.habit === "conifer" ? 0.84 : 0.55),
    clusterDensity: genome.foliage?.clusterDensity ?? 1,
    whorlDensity: genome.foliage?.whorlDensity ?? (genome.habit === "conifer" ? 0.82 : 0.42),
    tipBias: genome.foliage?.tipBias ?? 0.5,
  };
  const addConiferFoliageMass = () => {
    const trunkNodes = stems.filter((node) => node.depth === 0 && node.t > 0.12);
    for (const node of trunkNodes) {
      const t = node.t;
      const crownEnvelope = Math.sin(Math.PI * THREE.MathUtils.clamp(t * 0.92 + 0.04, 0, 1));
      const lowerShelf = THREE.MathUtils.smoothstep(1 - t, 0.05, 0.86);
      const fill = THREE.MathUtils.clamp(
        (0.38 + crownEnvelope * 0.48 + lowerShelf * 0.18) * foliageTraits.mass,
        0,
        1.65,
      );
      const whorls = Math.max(1, Math.round(1.4 + fill * 1.85 * foliageTraits.whorlDensity));
      for (let w = 0; w < whorls; w++) {
        const yaw = (node.index + w / whorls) * genome.phyllotaxisAngle + (Math.PI * 2 * w) / whorls;
        const droop = Math.PI / 2.0 + t * 0.62 + (rng() - 0.5) * 0.12;
        const branchDir = rotateFromAxis(node.direction, yaw, droop);
        const scale =
          curve(genome.leaf.length, t) *
          (1.12 - t * 0.3) *
          (0.78 + fill * 0.22) *
          (0.78 + rng() * 0.22);
        const offset = branchDir.clone().multiplyScalar(0.035 + fill * 0.025);
        organs.push({
          kind: "coniferSpray",
          position: node.position.clone().add(offset),
          direction: branchDir,
          right: tangentBasis(node.direction).right.applyAxisAngle(node.direction, yaw).normalize(),
          scale,
          t,
        });
      }
    }
  };
  const growAxis = (
    startIndex: number,
    depth: number,
    count: number,
    lengthScale: number,
  ) => {
    let previous = stems[startIndex];
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const axisNoise = (rng() - 0.5) * 0.1;
      const photo = lightVector
        .clone()
        .multiplyScalar(genome.lightResponse.phototropism * t * (0.3 + shade));
      const vinePull =
        genome.habit === "vine"
          ? new THREE.Vector3(0.12, -0.05, 0.08).multiplyScalar(1 - t * 0.35)
          : new THREE.Vector3();
      const direction = previous.direction
        .clone()
        .add(photo)
        .add(vinePull)
        .add(new THREE.Vector3(axisNoise, 0, (rng() - 0.5) * 0.1))
        .normalize();
      const len = curve(genome.internode, t) * lengthScale * heightStretch;
      const position = previous.position.clone().add(direction.clone().multiplyScalar(len));
      const node: StemNode = {
        position,
        direction,
        radius:
          previous.radius *
          THREE.MathUtils.lerp(0.93, 0.72, t) *
          (depth === 0 ? 1 : 0.75),
        depth,
        t,
        index: stems.length,
      };
      stems.push(node);
      segments.push([previous.index, node.index]);
      previous = node;

      const azimuth = i * genome.phyllotaxisAngle;
      const { right } = tangentBasis(direction);
      const organDir = rotateFromAxis(direction, azimuth, Math.PI / 2.6);
      const organRight = right.applyAxisAngle(direction, azimuth).normalize();
      const density = curve(genome.leaf.density, t) * (1 + shade * genome.lightResponse.leafBoostInShade);
      if (genome.habit === "conifer" && t > 0.12 && rng() < density) {
        const downSweep = Math.PI / 2.05 + t * 0.52 + depth * 0.14;
        const sprayCount = depth === 0 && t < 0.88 ? 2 : 1;
        for (let s = 0; s < sprayCount; s++) {
          const sprayYaw = azimuth + s * Math.PI + (rng() - 0.5) * 0.12;
          organs.push({
            kind: "coniferSpray",
            position,
            direction: rotateFromAxis(direction, sprayYaw, downSweep),
            right: organRight.clone().applyAxisAngle(direction, s * Math.PI).normalize(),
            scale:
              curve(genome.leaf.length, t) *
              (1.12 - t * 0.38) *
              Math.pow(0.78, depth) *
              (0.84 + rng() * 0.24) *
              (s === 0 ? 1 : 0.82),
            t,
          });
        }
      } else if (
        (genome.habit !== "palm" &&
          (genome.habit !== "tree" || t > (genome.tree?.crownStart ?? 0.42)) &&
          rng() < density) ||
        genome.habit === "tropical"
      ) {
        organs.push({
          kind: "leaf",
          position,
          direction: organDir,
          right: organRight,
          scale: curve(genome.leaf.length, t) * (0.85 + rng() * 0.3),
          t,
        });
      }
      const branchChance =
        curve(genome.branchChance, t) *
        branchShadePenalty *
        Math.pow(genome.branchAngle.depthDecay, depth);
      if (
        depth < 2 &&
        i > 2 &&
        i < count - 1 &&
        rng() < branchChance * (1 - genome.apicalDominance * t)
      ) {
        const angle =
          genome.branchAngle.mean +
          (rng() - 0.5) * genome.branchAngle.spread *
            Math.pow(genome.branchAngle.depthDecay, depth);
        const branchDir = rotateFromAxis(direction, azimuth + rng() * 0.35, angle);
        const branchStart: StemNode = {
          position: position.clone(),
          direction: branchDir,
          radius: node.radius * 0.65,
          depth: depth + 1,
          t,
          index: stems.length,
        };
        stems.push(branchStart);
        segments.push([node.index, branchStart.index]);
        growAxis(branchStart.index, depth + 1, Math.max(3, Math.round(count * 0.36)), lengthScale * 0.68);
      }
    }
  };

  if (genome.habit === "grass") {
    const blades = genome.grass?.blades ?? 30;
    let tallestBlade: Organ | null = null;
    for (let i = 0; i < blades; i++) {
      const t = i / Math.max(1, blades - 1);
      const azimuth = i * genome.phyllotaxisAngle + (rng() - 0.5) * 0.16;
      const lean = 0.36 + rng() * 0.24;
      const blade: Organ = {
        kind: "grassBlade",
        position: new THREE.Vector3((rng() - 0.5) * 0.2, 0, (rng() - 0.5) * 0.2),
        direction: rotateFromAxis(UP, azimuth, lean),
        right: new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)),
        scale:
          curve(genome.leaf.length, t) *
          heightStretch *
          (1 - (genome.grass?.heightJitter ?? 0.2) * rng()),
        t,
      };
      organs.push(blade);
      if (!tallestBlade || blade.scale > tallestBlade.scale) tallestBlade = blade;
    }
    if (genome.flower && tallestBlade) {
      organs.push({
        kind: "flower",
        position: tallestBlade.position
          .clone()
          .add(tallestBlade.direction.clone().multiplyScalar(tallestBlade.scale * 0.92)),
        direction: tallestBlade.direction.clone(),
        right: tallestBlade.right.clone(),
        scale: 0.55,
        t: 1,
      });
    }
    return { stems, segments, organs };
  }

  if (genome.id === "cloverGroundcover") {
    const runners = 3;
    for (let r = 0; r < runners; r++) {
      const yaw = r * genome.phyllotaxisAngle + rng() * 0.35;
      const start: StemNode = {
        position: new THREE.Vector3((rng() - 0.5) * 0.08, 0.018, (rng() - 0.5) * 0.08),
        direction: rotateFromAxis(UP, yaw, 1.35),
        radius: root.radius * 0.42,
        depth: 0,
        t: 0,
        index: stems.length,
      };
      stems.push(start);
      segments.push([root.index, start.index]);
      let previous = start;
      const nodes = 3 + Math.round(rng() * 1.4);
      for (let i = 1; i <= nodes; i++) {
        const t = i / nodes;
        const wander = yaw + Math.sin(i * 1.7 + seed) * 0.25 + (rng() - 0.5) * 0.22;
        const direction = new THREE.Vector3(Math.cos(wander), 0.05 + shade * 0.08, Math.sin(wander)).normalize();
        const position = previous.position
          .clone()
          .add(direction.clone().multiplyScalar(curve(genome.internode, t) * (1.1 + rng() * 0.35)));
        const node: StemNode = {
          position,
          direction,
          radius: previous.radius * 0.86,
          depth: 0,
          t,
          index: stems.length,
        };
        stems.push(node);
        segments.push([previous.index, node.index]);
        previous = node;
        for (let leaf = 0; leaf < 3; leaf++) {
          const leafYaw = yaw + leaf * (Math.PI * 2 / 3) + i * 0.18;
          organs.push({
            kind: "leaf",
            position: position.clone().add(new THREE.Vector3(0, 0.025 + leaf * 0.004, 0)),
            direction: rotateFromAxis(UP, leafYaw, 1.22 + rng() * 0.12),
            right: new THREE.Vector3(Math.cos(leafYaw + Math.PI / 2), 0, Math.sin(leafYaw + Math.PI / 2)).normalize(),
            scale: curve(genome.leaf.length, t) * (0.92 + rng() * 0.18),
            t,
          });
        }
        if (genome.flower && i === nodes && rng() < 0.62 + env.moisture * 0.2) {
          organs.push({
            kind: "flower",
            position: position.clone().add(new THREE.Vector3(0, 0.13 + rng() * 0.04, 0)),
            direction: UP.clone(),
            right: tangentBasis(UP).right,
            scale: 0.68 + rng() * 0.16,
            t: 1,
          });
        }
      }
    }
    return { stems, segments, organs };
  }

  if (genome.id === "agaveSucculent") {
    const leaves = 18;
    for (let i = 0; i < leaves; i++) {
      const t = i / Math.max(1, leaves - 1);
      const azimuth = i * genome.phyllotaxisAngle + (rng() - 0.5) * 0.08;
      const lower = i < leaves * 0.45;
      organs.push({
        kind: "leaf",
        position: new THREE.Vector3(0, 0.018 + t * 0.018, 0),
        direction: rotateFromAxis(UP, azimuth, lower ? 1.18 + rng() * 0.16 : 0.78 + rng() * 0.18),
        right: new THREE.Vector3(Math.cos(azimuth + Math.PI / 2), 0, -Math.sin(azimuth + Math.PI / 2)).normalize(),
        scale: curve(genome.leaf.length, t) * (1.08 - t * 0.16) * (0.92 + rng() * 0.16),
        t,
      });
    }
    return { stems, segments, organs };
  }

  if (genome.id === "tulipCup") {
    const leaves = 5;
    for (let i = 0; i < leaves; i++) {
      const t = i / Math.max(1, leaves - 1);
      const azimuth = i * genome.phyllotaxisAngle + (rng() - 0.5) * 0.2;
      organs.push({
        kind: "leaf",
        position: new THREE.Vector3((rng() - 0.5) * 0.035, 0.018 + i * 0.015, (rng() - 0.5) * 0.035),
        direction: rotateFromAxis(UP, azimuth, 0.7 + rng() * 0.22),
        right: new THREE.Vector3(Math.cos(azimuth + Math.PI / 2), 0, -Math.sin(azimuth + Math.PI / 2)).normalize(),
        scale: curve(genome.leaf.length, t) * (0.86 + rng() * 0.16),
        t,
      });
    }
    let previous = root;
    for (let i = 1; i <= genome.nodeCount; i++) {
      const t = i / genome.nodeCount;
      const direction = UP.clone()
        .add(lightVector.clone().multiplyScalar(genome.lightResponse.phototropism * t * (0.2 + shade)))
        .add(new THREE.Vector3((rng() - 0.5) * 0.018, 0, (rng() - 0.5) * 0.018))
        .normalize();
      const node: StemNode = {
        position: previous.position.clone().add(direction.clone().multiplyScalar(curve(genome.internode, t) * heightStretch)),
        direction,
        radius: previous.radius * THREE.MathUtils.lerp(0.92, 0.74, t),
        depth: 0,
        t,
        index: stems.length,
      };
      stems.push(node);
      segments.push([previous.index, node.index]);
      previous = node;
    }
    organs.push({
      kind: "flower",
      position: previous.position.clone().add(previous.direction.clone().multiplyScalar(0.04)),
      direction: previous.direction.clone(),
      right: tangentBasis(previous.direction).right,
      scale: 1,
      t: 1,
    });
    return { stems, segments, organs };
  }

  if (genome.id === "hibiscusBloom") {
    let previous = root;
    for (let i = 1; i <= genome.nodeCount; i++) {
      const t = i / genome.nodeCount;
      const direction = UP.clone()
        .add(lightVector.clone().multiplyScalar(genome.lightResponse.phototropism * t * (0.25 + shade)))
        .add(new THREE.Vector3((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06))
        .normalize();
      const node: StemNode = {
        position: previous.position.clone().add(direction.clone().multiplyScalar(curve(genome.internode, t) * heightStretch)),
        direction,
        radius: previous.radius * THREE.MathUtils.lerp(0.93, 0.74, t),
        depth: 0,
        t,
        index: stems.length,
      };
      stems.push(node);
      segments.push([previous.index, node.index]);
      previous = node;
      if (i > 1 && i < genome.nodeCount - 1 && rng() < 0.82) {
        const azimuth = i * genome.phyllotaxisAngle;
        const { right } = tangentBasis(direction);
        organs.push({
          kind: "leaf",
          position: node.position.clone(),
          direction: rotateFromAxis(direction, azimuth, 0.78 + t * 0.18),
          right: right.applyAxisAngle(direction, azimuth).normalize(),
          scale: curve(genome.leaf.length, t) * (0.82 + rng() * 0.24),
          t,
        });
      }
    }
    const tipRight = tangentBasis(previous.direction).right;
    organs.push({
      kind: "flower",
      position: previous.position.clone().add(previous.direction.clone().multiplyScalar(0.045)),
      direction: previous.direction.clone().add(lightVector.clone().multiplyScalar(0.12)).normalize(),
      right: tipRight,
      scale: 1,
      t: 1,
    });
    if (rng() < 0.6) {
      const azimuth = genome.phyllotaxisAngle;
      organs.push({
        kind: "flower",
        position: previous.position.clone().add(rotateFromAxis(previous.direction, azimuth, 0.85).multiplyScalar(0.18)),
        direction: rotateFromAxis(previous.direction, azimuth, 0.34),
        right: tipRight.clone().applyAxisAngle(previous.direction, azimuth).normalize(),
        scale: 0.72,
        t: 1,
      });
    }
    return { stems, segments, organs };
  }

  if (genome.id === "poppyFlower") {
    const basalLeaves = 8;
    for (let i = 0; i < basalLeaves; i++) {
      const t = i / Math.max(1, basalLeaves - 1);
      const azimuth = i * genome.phyllotaxisAngle + (rng() - 0.5) * 0.24;
      organs.push({
        kind: "leaf",
        position: new THREE.Vector3((rng() - 0.5) * 0.06, 0.018 + rng() * 0.025, (rng() - 0.5) * 0.06),
        direction: rotateFromAxis(UP, azimuth, 1.0 + rng() * 0.2),
        right: new THREE.Vector3(Math.cos(azimuth + Math.PI / 2), 0, -Math.sin(azimuth + Math.PI / 2)).normalize(),
        scale: curve(genome.leaf.length, t) * (0.82 + rng() * 0.22),
        t,
      });
    }
    const stemsForPoppy = 1 + Math.round(rng() * 1.2 + env.light * 0.7);
    for (let s = 0; s < stemsForPoppy; s++) {
      const azimuth = s * genome.phyllotaxisAngle + rng() * 0.4;
      const offset = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth)).multiplyScalar(s === 0 ? 0 : 0.08 + rng() * 0.08);
      let previous: StemNode = {
        position: offset,
        direction: UP.clone(),
        radius: root.radius * 0.52,
        depth: 0,
        t: 0,
        index: stems.length,
      };
      stems.push(previous);
      segments.push([root.index, previous.index]);
      const count = genome.nodeCount - s;
      for (let i = 1; i <= count; i++) {
        const t = i / count;
        const direction = UP.clone()
          .add(lightVector.clone().multiplyScalar(genome.lightResponse.phototropism * t * (0.3 + shade)))
          .add(new THREE.Vector3((rng() - 0.5) * 0.035, 0, (rng() - 0.5) * 0.035))
          .normalize();
        const node: StemNode = {
          position: previous.position.clone().add(direction.clone().multiplyScalar(curve(genome.internode, t) * heightStretch * (s === 0 ? 1 : 0.82))),
          direction,
          radius: previous.radius * THREE.MathUtils.lerp(0.94, 0.74, t),
          depth: 0,
          t,
          index: stems.length,
        };
        stems.push(node);
        segments.push([previous.index, node.index]);
        previous = node;
      }
      organs.push({
        kind: "flower",
        position: previous.position.clone().add(previous.direction.clone().multiplyScalar(0.04)),
        direction: previous.direction.clone().add(new THREE.Vector3(0, 0.1, 0)).normalize(),
        right: tangentBasis(previous.direction).right,
        scale: s === 0 ? 1 : 0.78 + rng() * 0.12,
        t: 1,
      });
    }
    return { stems, segments, organs };
  }

  if (genome.id === "sunflowerTower") {
    let previous = root;
    for (let i = 1; i <= genome.nodeCount; i++) {
      const t = i / genome.nodeCount;
      const direction = UP.clone()
        .add(lightVector.clone().multiplyScalar(genome.lightResponse.phototropism * t * (0.35 + shade)))
        .add(new THREE.Vector3((rng() - 0.5) * 0.035, 0, (rng() - 0.5) * 0.035))
        .normalize();
      const node: StemNode = {
        position: previous.position.clone().add(direction.clone().multiplyScalar(curve(genome.internode, t) * heightStretch)),
        direction,
        radius: previous.radius * THREE.MathUtils.lerp(0.95, 0.78, t),
        depth: 0,
        t,
        index: stems.length,
      };
      stems.push(node);
      segments.push([previous.index, node.index]);
      previous = node;
      if (i > 1 && i < genome.nodeCount - 2 && i % 2 === 0) {
        const azimuth = i * genome.phyllotaxisAngle;
        const { right } = tangentBasis(direction);
        organs.push({
          kind: "leaf",
          position: node.position.clone(),
          direction: rotateFromAxis(direction, azimuth, 0.86 + t * 0.18),
          right: right.applyAxisAngle(direction, azimuth).normalize(),
          scale: curve(genome.leaf.length, t) * (0.85 + rng() * 0.2),
          t,
        });
      }
    }
    organs.push({
      kind: "flower",
      position: previous.position.clone().add(previous.direction.clone().multiplyScalar(0.05)),
      direction: previous.direction.clone().add(lightVector.clone().multiplyScalar(0.24)).normalize(),
      right: tangentBasis(previous.direction).right,
      scale: 1.15,
      t: 1,
    });
    return { stems, segments, organs };
  }

  if (genome.id === "irisBulb" || genome.id === "daylilyFlower") {
    const isDaylily = genome.id === "daylilyFlower";
    const strapLeaves = isDaylily ? 11 : 9;
    for (let i = 0; i < strapLeaves; i++) {
      const t = i / Math.max(1, strapLeaves - 1);
      const azimuth = i * genome.phyllotaxisAngle + (rng() - 0.5) * 0.18;
      organs.push({
        kind: "grassBlade",
        position: new THREE.Vector3((rng() - 0.5) * 0.05, 0, (rng() - 0.5) * 0.05),
        direction: rotateFromAxis(UP, azimuth, 0.32 + rng() * 0.28),
        right: new THREE.Vector3(Math.cos(azimuth), 0, -Math.sin(azimuth)).normalize(),
        scale: curve(genome.leaf.length, t) * heightStretch * (isDaylily ? 0.76 + rng() * 0.2 : 0.84 + rng() * 0.18),
        t,
      });
    }
    let previous = root;
    for (let i = 1; i <= genome.nodeCount; i++) {
      const t = i / genome.nodeCount;
      const direction = UP.clone()
        .add(lightVector.clone().multiplyScalar(genome.lightResponse.phototropism * t * (0.25 + shade)))
        .add(new THREE.Vector3((rng() - 0.5) * 0.025, 0, (rng() - 0.5) * 0.025))
        .normalize();
      const node: StemNode = {
        position: previous.position.clone().add(direction.clone().multiplyScalar(curve(genome.internode, t) * heightStretch)),
        direction,
        radius: previous.radius * THREE.MathUtils.lerp(0.93, 0.76, t),
        depth: 0,
        t,
        index: stems.length,
      };
      stems.push(node);
      segments.push([previous.index, node.index]);
      previous = node;
    }
    organs.push({
      kind: "flower",
      position: previous.position.clone().add(previous.direction.clone().multiplyScalar(0.04)),
      direction: previous.direction.clone(),
      right: tangentBasis(previous.direction).right,
      scale: 1,
      t: 1,
    });
    if (isDaylily && rng() < 0.85) {
      const side = tangentBasis(previous.direction).right;
      for (let i = 0; i < 2; i++) {
        const azimuth = (i + 1) * genome.phyllotaxisAngle;
        organs.push({
          kind: "flower",
          position: previous.position
            .clone()
            .add(rotateFromAxis(previous.direction, azimuth, 0.72).multiplyScalar(0.13 + i * 0.035))
            .add(previous.direction.clone().multiplyScalar(-0.04 * i)),
          direction: rotateFromAxis(previous.direction, azimuth, 0.24),
          right: side.clone().applyAxisAngle(previous.direction, azimuth).normalize(),
          scale: 0.72 - i * 0.08,
          t: 1,
        });
      }
    }
    return { stems, segments, organs };
  }

  if (genome.id === "foxgloveSpike") {
    const basalLeaves = 7;
    for (let i = 0; i < basalLeaves; i++) {
      const t = i / Math.max(1, basalLeaves - 1);
      const azimuth = i * genome.phyllotaxisAngle + (rng() - 0.5) * 0.2;
      organs.push({
        kind: "leaf",
        position: new THREE.Vector3((rng() - 0.5) * 0.055, 0.018 + rng() * 0.025, (rng() - 0.5) * 0.055),
        direction: rotateFromAxis(UP, azimuth, 0.9 + rng() * 0.24),
        right: new THREE.Vector3(Math.cos(azimuth + Math.PI / 2), 0, -Math.sin(azimuth + Math.PI / 2)).normalize(),
        scale: curve(genome.leaf.length, t) * (0.88 + rng() * 0.18),
        t,
      });
    }
    let previous = root;
    for (let i = 1; i <= genome.nodeCount; i++) {
      const t = i / genome.nodeCount;
      const direction = UP.clone()
        .add(lightVector.clone().multiplyScalar(genome.lightResponse.phototropism * t * (0.3 + shade)))
        .add(new THREE.Vector3((rng() - 0.5) * 0.035, 0, (rng() - 0.5) * 0.035))
        .normalize();
      const node: StemNode = {
        position: previous.position.clone().add(direction.clone().multiplyScalar(curve(genome.internode, t) * heightStretch)),
        direction,
        radius: previous.radius * THREE.MathUtils.lerp(0.94, 0.76, t),
        depth: 0,
        t,
        index: stems.length,
      };
      stems.push(node);
      segments.push([previous.index, node.index]);
      previous = node;
      if (i > 2 && i < genome.nodeCount - 1) {
        const ringCount = i % 2 === 0 ? 2 : 1;
        for (let f = 0; f < ringCount; f++) {
          const azimuth = i * genome.phyllotaxisAngle + f * Math.PI + (rng() - 0.5) * 0.2;
          organs.push({
            kind: "flower",
            position: node.position.clone().add(rotateFromAxis(direction, azimuth, 1.22).multiplyScalar(0.09 + rng() * 0.035)),
            direction: rotateFromAxis(direction, azimuth, 1.38).add(new THREE.Vector3(0, -0.72, 0)).normalize(),
            right: tangentBasis(direction).right.applyAxisAngle(direction, azimuth).normalize(),
            scale: (0.72 + t * 0.24) * (0.9 + rng() * 0.12),
            t,
          });
        }
      } else if (i === 2 || i === 3) {
        const azimuth = i * genome.phyllotaxisAngle;
        const { right } = tangentBasis(direction);
        organs.push({
          kind: "leaf",
          position: node.position.clone(),
          direction: rotateFromAxis(direction, azimuth, 0.9),
          right: right.applyAxisAngle(direction, azimuth).normalize(),
          scale: curve(genome.leaf.length, t) * 0.55,
          t,
        });
      }
    }
    return { stems, segments, organs };
  }

  if (genome.id === "laceUmbel") {
    let previous = root;
    for (let i = 1; i <= genome.nodeCount; i++) {
      const t = i / genome.nodeCount;
      const direction = UP.clone()
        .add(lightVector.clone().multiplyScalar(genome.lightResponse.phototropism * t * (0.35 + shade)))
        .add(new THREE.Vector3((rng() - 0.5) * 0.045, 0, (rng() - 0.5) * 0.045))
        .normalize();
      const node: StemNode = {
        position: previous.position.clone().add(direction.clone().multiplyScalar(curve(genome.internode, t) * heightStretch)),
        direction,
        radius: previous.radius * THREE.MathUtils.lerp(0.93, 0.75, t),
        depth: 0,
        t,
        index: stems.length,
      };
      stems.push(node);
      segments.push([previous.index, node.index]);
      previous = node;
      if (i % 3 === 1 && i < genome.nodeCount - 2) {
        const azimuth = i * genome.phyllotaxisAngle;
        const { right } = tangentBasis(direction);
        organs.push({
          kind: "leaf",
          position: node.position.clone(),
          direction: rotateFromAxis(direction, azimuth, 0.95),
          right: right.applyAxisAngle(direction, azimuth).normalize(),
          scale: curve(genome.leaf.length, t) * (0.8 + rng() * 0.25),
          t,
        });
      }
    }
    const tip = previous;
    const spokes = 9;
    for (let i = 0; i < spokes; i++) {
      const t = i / Math.max(1, spokes - 1);
      const azimuth = i * genome.phyllotaxisAngle;
      const spokeDir = rotateFromAxis(tip.direction, azimuth, 0.82 + rng() * 0.12);
      const spokeStart: StemNode = {
        position: tip.position.clone(),
        direction: spokeDir,
        radius: tip.radius * 0.38,
        depth: 1,
        t,
        index: stems.length,
      };
      stems.push(spokeStart);
      segments.push([tip.index, spokeStart.index]);
      const spokeEnd: StemNode = {
        position: tip.position.clone().add(spokeDir.clone().multiplyScalar(0.24 + rng() * 0.08)),
        direction: spokeDir,
        radius: tip.radius * 0.22,
        depth: 1,
        t,
        index: stems.length,
      };
      stems.push(spokeEnd);
      segments.push([spokeStart.index, spokeEnd.index]);
      const right = tangentBasis(spokeDir).right;
      for (let f = 0; f < 3; f++) {
        const floretYaw = azimuth + (f - 1) * 0.46;
        const floretOffset = rotateFromAxis(UP, floretYaw, 1.45).multiplyScalar(0.035 + f * 0.006);
        organs.push({
          kind: "flower",
          position: spokeEnd.position.clone().add(floretOffset),
          direction: UP.clone().add(spokeDir.clone().multiplyScalar(0.18)).normalize(),
          right,
          scale: 0.46 + rng() * 0.08,
          t: 1,
        });
      }
    }
    return { stems, segments, organs };
  }

  if (genome.id === "echinaceaFlower") {
    const basalLeaves = 11;
    for (let i = 0; i < basalLeaves; i++) {
      const t = i / Math.max(1, basalLeaves - 1);
      const azimuth = i * genome.phyllotaxisAngle + (rng() - 0.5) * 0.22;
      const lowAngle = 1.02 + rng() * 0.22;
      const direction = rotateFromAxis(UP, azimuth, lowAngle)
        .add(new THREE.Vector3(0, -0.05 * rng(), 0))
        .normalize();
      organs.push({
        kind: "leaf",
        position: new THREE.Vector3((rng() - 0.5) * 0.06, 0.015 + rng() * 0.025, (rng() - 0.5) * 0.06),
        direction,
        right: new THREE.Vector3(Math.cos(azimuth + Math.PI / 2), 0, -Math.sin(azimuth + Math.PI / 2)).normalize(),
        scale: curve(genome.leaf.length, t) * (0.9 + rng() * 0.28),
        t: Math.min(0.72, t * 0.55),
      });
    }

    const floweringStems = 1 + Math.round(env.moisture * 1.6 + rng() * 0.65);
    for (let s = 0; s < floweringStems; s++) {
      const azimuth = s * genome.phyllotaxisAngle + rng() * 0.4;
      const baseOffset = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth)).multiplyScalar(s === 0 ? 0 : 0.08 + rng() * 0.08);
      const start: StemNode = {
        position: baseOffset.clone(),
        direction: UP.clone(),
        radius: root.radius * (s === 0 ? 0.82 : 0.62),
        depth: 0,
        t: 0,
        index: stems.length,
      };
      stems.push(start);
      segments.push([root.index, start.index]);
      let previous = start;
      const count = Math.max(6, genome.nodeCount - s * 2);
      const stemLean = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth)).multiplyScalar(0.08 + rng() * 0.06);
      for (let i = 1; i <= count; i++) {
        const t = i / count;
        const photo = lightVector
          .clone()
          .multiplyScalar(genome.lightResponse.phototropism * t * (0.25 + shade));
        const direction = UP.clone()
          .add(stemLean.clone().multiplyScalar(t))
          .add(photo)
          .add(new THREE.Vector3((rng() - 0.5) * 0.035, 0, (rng() - 0.5) * 0.035))
          .normalize();
        const position = previous.position
          .clone()
          .add(direction.clone().multiplyScalar(curve(genome.internode, t) * heightStretch * (s === 0 ? 1 : 0.82)));
        const node: StemNode = {
          position,
          direction,
          radius: previous.radius * THREE.MathUtils.lerp(0.92, 0.76, t),
          depth: 0,
          t,
          index: stems.length,
        };
        stems.push(node);
        segments.push([previous.index, node.index]);
        previous = node;

        if (i > 1 && i < count - 2 && i % 3 === 0 && rng() < 0.65 - t * 0.28) {
          const leafAzimuth = azimuth + i * genome.phyllotaxisAngle;
          const { right } = tangentBasis(direction);
          organs.push({
            kind: "leaf",
            position,
            direction: rotateFromAxis(direction, leafAzimuth, 0.82 + t * 0.24),
            right: right.applyAxisAngle(direction, leafAzimuth).normalize(),
            scale: curve(genome.leaf.length, t) * (0.46 - t * 0.12) * (0.85 + rng() * 0.2),
            t: 0.55 + t * 0.35,
          });
        }
      }
      organs.push({
        kind: "flower",
        position: previous.position.clone().add(previous.direction.clone().multiplyScalar(0.045)),
        direction: previous.direction.clone().add(new THREE.Vector3(0, 0.18, 0)).normalize(),
        right: tangentBasis(previous.direction).right,
        scale: s === 0 ? 1 : 0.76 + rng() * 0.12,
        t: 1,
      });
    }
    return { stems, segments, organs };
  }

  growAxis(0, 0, genome.nodeCount, 1);

  if (genome.habit === "conifer") {
    addConiferFoliageMass();
  }

  if (genome.habit === "tree" && genome.tree) {
    const crownStart = genome.tree.crownStart;
    const crownNodes = stems.filter((node) => node.t >= crownStart || node.depth > 0);
    const crownLeafChance =
      genome.tree.crown === "umbrella"
        ? 0.52
        : genome.tree.crown === "columnar"
          ? 0.36
          : 0.46;
    for (const node of crownNodes) {
      const t = THREE.MathUtils.clamp((node.t - crownStart) / Math.max(0.001, 1 - crownStart), 0, 1);
      const crownBulk =
        genome.tree.crown === "umbrella"
          ? Math.sin(t * Math.PI) * 0.5 + 0.5
          : genome.tree.crown === "columnar"
            ? 0.72 + 0.28 * t
            : Math.sin(t * Math.PI) * 0.72 + 0.28;
      const clusters = Math.max(1, Math.round(genome.tree.leafClusterScale * crownBulk * (node.depth === 0 ? 1 : 1.35)));
      const massClusters = Math.max(
        1,
        Math.round(clusters * foliageTraits.clusterDensity * (0.76 + foliageTraits.mass * 0.56)),
      );
      for (let c = 0; c < massClusters; c++) {
        const tipBoost = THREE.MathUtils.lerp(1, t, foliageTraits.tipBias);
        if (rng() > crownLeafChance * tipBoost + env.moisture * 0.16 + foliageTraits.mass * 0.12) continue;
        const azimuth = (node.index + c * 0.62) * genome.phyllotaxisAngle + (rng() - 0.5) * 0.22;
        const outward =
          genome.tree.crown === "umbrella"
            ? 1.18 + rng() * 0.16
            : genome.tree.crown === "columnar"
              ? 0.84 + rng() * 0.18
              : 0.95 + rng() * 0.28;
        const position = node.position
          .clone()
          .add(rotateFromAxis(node.direction, azimuth, outward).multiplyScalar(0.05 + rng() * 0.08));
        const { right } = tangentBasis(node.direction);
        organs.push({
          kind: "leaf",
          position,
          direction: rotateFromAxis(node.direction, azimuth, outward),
          right: right.applyAxisAngle(node.direction, azimuth).normalize(),
          scale:
            curve(genome.leaf.length, node.t) *
            genome.tree.leafClusterScale *
            (0.76 + foliageTraits.mass * 0.18 + rng() * 0.42) *
            (genome.tree.crown === "umbrella" ? 1.12 : 1),
          t: node.t,
        });
      }
    }

    if (genome.tree.crown === "propRoot") {
      const roots = 7;
      for (let i = 0; i < roots; i++) {
        const t = i / Math.max(1, roots - 1);
        const azimuth = i * genome.phyllotaxisAngle + (rng() - 0.5) * 0.2;
        const rootDir = rotateFromAxis(UP, azimuth, 1.08 + rng() * 0.18);
        const rootStart: StemNode = {
          position: new THREE.Vector3(0, 0.08 + t * 0.12, 0),
          direction: rootDir,
          radius: root.radius * (0.42 + rng() * 0.16),
          depth: 1,
          t,
          index: stems.length,
        };
        stems.push(rootStart);
        segments.push([root.index, rootStart.index]);
        const rootEnd: StemNode = {
          position: rootStart.position
            .clone()
            .add(new THREE.Vector3(Math.cos(azimuth), -0.12 - rng() * 0.08, Math.sin(azimuth)).multiplyScalar(0.42 + rng() * 0.18)),
          direction: rootDir,
          radius: rootStart.radius * 0.55,
          depth: 1,
          t,
          index: stems.length,
        };
        stems.push(rootEnd);
        segments.push([rootStart.index, rootEnd.index]);
      }
    }
  }

  if (genome.habit === "palm") {
    const tip = stems.reduce((best, node) => (node.position.y > best.position.y ? node : best), stems[0]);
    const fronds = 11;
    for (let i = 0; i < fronds; i++) {
      const t = i / Math.max(1, fronds - 1);
      const azimuth = i * genome.phyllotaxisAngle;
      const umbrellaAngle = 1.72 + Math.sin(t * Math.PI) * 0.16 + (i % 2) * 0.05;
      organs.push({
        kind: "palmFrond",
        position: tip.position.clone().add(tip.direction.clone().multiplyScalar(0.08)),
        direction: rotateFromAxis(tip.direction, azimuth, umbrellaAngle),
        right: tangentBasis(tip.direction).right.applyAxisAngle(tip.direction, azimuth).normalize(),
        scale: curve(genome.leaf.length, t) * (1.05 + (i % 3) * 0.05),
        t,
      });
    }
  }

  if (genome.habit === "fern" && genome.fern) {
    const fronds = Math.max(3, Math.round(genome.fern.pinnae / 3));
    for (let f = 0; f < fronds; f++) {
      const yaw = f * genome.phyllotaxisAngle;
      const direction = rotateFromAxis(UP, yaw, 0.66);
      for (let i = 0; i < genome.fern.pinnae; i++) {
        const t = i / Math.max(1, genome.fern.pinnae - 1);
        const base = direction
          .clone()
          .multiplyScalar(t * 1.1)
          .add(new THREE.Vector3(0, Math.sin(t * Math.PI) * genome.fern.arch * 0.32, 0));
        const right = new THREE.Vector3(Math.cos(yaw + Math.PI / 2), 0, -Math.sin(yaw + Math.PI / 2));
        organs.push({
          kind: "fernLeaflet",
          position: base,
          direction,
          right,
          scale: curve(genome.leaf.length, t) * Math.sin(t * Math.PI),
          t,
        });
      }
    }
  }

  if (genome.flower) {
    const tip = stems.reduce((best, node) => (node.position.y > best.position.y ? node : best), stems[0]);
    organs.push({
      kind: "flower",
      position: tip.position.clone().add(tip.direction.clone().multiplyScalar(0.05)),
      direction: tip.direction.clone(),
      right: tangentBasis(tip.direction).right,
      scale: 1,
      t: 1,
    });
  }

  return { stems, segments, organs };
};

class TemplateBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private tintable: number[] = [];
  private sway: number[] = [];
  private idx: number[] = [];

  addQuad(
    corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3],
    color: THREE.Color,
    tintable = true,
    sway = 1,
  ) {
    const base = this.pos.length / 3;
    const normal = new THREE.Vector3()
      .subVectors(corners[1], corners[0])
      .cross(new THREE.Vector3().subVectors(corners[2], corners[0]))
      .normalize();
    for (const corner of corners) {
      this.pos.push(corner.x, corner.y, corner.z);
      this.nrm.push(normal.x, normal.y, normal.z);
      this.col.push(color.r, color.g, color.b);
      this.tintable.push(tintable ? 1 : 0);
      this.sway.push(sway);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  addTriangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color, tint = true, sway = 1) {
    const base = this.pos.length / 3;
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, b, c]) {
      this.pos.push(p.x, p.y, p.z);
      this.nrm.push(normal.x, normal.y, normal.z);
      this.col.push(color.r, color.g, color.b);
      this.tintable.push(tint ? 1 : 0);
      this.sway.push(sway);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  build(): ProcPlantTemplate {
    return {
      pos: new Float32Array(this.pos),
      nrm: new Float32Array(this.nrm),
      col: new Float32Array(this.col),
      tintable: new Uint8Array(this.tintable),
      sway: new Float32Array(this.sway),
      idx: new Uint32Array(this.idx),
    };
  }
}

const leafWidthAt = (shape: LeafShapeKind, t: number, serration: number): number => {
  const s = Math.sin(Math.PI * t);
  const notch =
    shape === "cordate" ? 1 - 0.35 * Math.exp(-(((t - 0.12) / 0.12) ** 2)) : 1;
  const tip =
    shape === "lanceolate" || shape === "linear"
      ? s ** 1.6
      : shape === "ovate"
        ? s ** 0.72
        : shape === "round"
          ? Math.sin(Math.PI * Math.min(1, t * 0.96)) ** 0.42 *
            (0.72 + 0.28 * Math.sin(Math.PI * t))
        : shape === "spatulate"
          ? Math.sin(Math.PI * Math.min(1, t * 0.82)) ** 0.55 * (0.45 + t * 0.65)
          : shape === "fan"
            ? Math.sin(Math.PI * Math.min(1, t * 0.72)) ** 0.45 * (0.3 + t)
            : s;
  const lobes =
    shape === "palmate" || shape === "fan"
      ? 0.78 + 0.22 * Math.sin(t * Math.PI * (shape === "fan" ? 14 : 8))
      : 1;
  const teeth = serration > 0 ? 1 + serration * 0.08 * Math.sin(t * Math.PI * 28) : 1;
  return Math.max(0.02, tip * notch * lobes * teeth);
};

const addLeaf = (
  builder: TemplateBuilder,
  genome: ProcPlantGenome,
  organ: Organ,
  shade: number,
) => {
  const length = organ.scale * (1 + shade * genome.lightResponse.leafBoostInShade);
  const halfWidth = length * genome.leaf.widthRatio * 0.5;
  const center = organ.position;
  const dir = organ.direction.clone().normalize();
  const right = organ.right.clone().normalize();
  const normal = new THREE.Vector3().crossVectors(right, dir).normalize();
  const color = new THREE.Color(genome.leaf.colorA).lerp(new THREE.Color(genome.leaf.colorB), organ.t);
  const segments = genome.leaf.shape === "cordate" || genome.leaf.shape === "palmate" ? 10 : 7;
  const points: THREE.Vector3[] = [];
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const curl = Math.sin(t * Math.PI) * genome.leaf.curl * length;
    spine.push(
      center
        .clone()
        .add(dir.clone().multiplyScalar((t - 0.08) * length))
        .add(normal.clone().multiplyScalar(curl)),
    );
  }
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = leafWidthAt(genome.leaf.shape, t, genome.leaf.serration) * halfWidth;
    points.push(spine[i].clone().add(right.clone().multiplyScalar(-w)));
  }
  for (let i = segments; i >= 0; i--) {
    const t = i / segments;
    const w = leafWidthAt(genome.leaf.shape, t, genome.leaf.serration) * halfWidth;
    points.push(spine[i].clone().add(right.clone().multiplyScalar(w)));
  }
  const base = spine[Math.max(0, Math.floor(segments * 0.18))];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    builder.addTriangle(base, a, b, color, true, 0.35 + organ.t * 0.65);
  }
  if (genome.leaf.venation > 0.05) {
    const veinColor = color.clone().lerp(new THREE.Color(0xd9f0ba), 0.28);
    for (let i = 1; i < spine.length; i++) {
      const a = spine[i - 1];
      const b = spine[i];
      const width = length * 0.008 * genome.leaf.venation * (1 - i / spine.length);
      builder.addQuad(
        [
          a.clone().add(right.clone().multiplyScalar(-width)),
          a.clone().add(right.clone().multiplyScalar(width)),
          b.clone().add(right.clone().multiplyScalar(width * 0.5)),
          b.clone().add(right.clone().multiplyScalar(-width * 0.5)),
        ],
        veinColor,
        false,
        0.7,
      );
    }
  }
};

const addGrassBlade = (builder: TemplateBuilder, genome: ProcPlantGenome, organ: Organ) => {
  const color = new THREE.Color(genome.leaf.colorA).lerp(new THREE.Color(genome.leaf.colorB), organ.t);
  const length = organ.scale;
  const width = length * genome.leaf.widthRatio;
  const root = organ.position;
  const dir = organ.direction.clone().normalize();
  const right = organ.right.clone().normalize();
  const mid = root.clone().add(dir.clone().multiplyScalar(length * 0.54));
  const tip = root
    .clone()
    .add(dir.clone().multiplyScalar(length))
    .add(new THREE.Vector3(0, -genome.leaf.curl * length * 0.18, 0));
  builder.addTriangle(
    root.clone().add(right.clone().multiplyScalar(-width)),
    root.clone().add(right.clone().multiplyScalar(width)),
    mid.clone().add(right.clone().multiplyScalar(width * 0.42)),
    color,
    true,
    0.45,
  );
  builder.addTriangle(
    root.clone().add(right.clone().multiplyScalar(-width)),
    mid.clone().add(right.clone().multiplyScalar(width * 0.42)),
    tip,
    color,
    true,
    1,
  );
}

const addStemSegment = (
  builder: TemplateBuilder,
  a: StemNode,
  b: StemNode,
  color: THREE.Color,
) => {
  const axis = b.position.clone().sub(a.position).normalize();
  const { right, up } = tangentBasis(axis);
  const sides = 4;
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const r0 = right.clone().multiplyScalar(Math.cos(a0)).add(up.clone().multiplyScalar(Math.sin(a0)));
    const r1 = right.clone().multiplyScalar(Math.cos(a1)).add(up.clone().multiplyScalar(Math.sin(a1)));
    builder.addQuad(
      [
        a.position.clone().add(r0.clone().multiplyScalar(a.radius)),
        a.position.clone().add(r1.clone().multiplyScalar(a.radius)),
        b.position.clone().add(r1.clone().multiplyScalar(b.radius)),
        b.position.clone().add(r0.clone().multiplyScalar(b.radius)),
      ],
      color,
      false,
      b.t * 0.5,
    );
  }
};

const addFlower = (builder: TemplateBuilder, genome: ProcPlantGenome, organ: Organ) => {
  if (!genome.flower) return;
  const isEchinacea = genome.id === "echinaceaFlower";
  const petalColor = new THREE.Color(genome.flower.color);
  const centerColor = new THREE.Color(genome.flower.centerColor);
  const radius = genome.flower.radius;
  const bendVariant =
    Math.sin(organ.position.x * 41.7 + organ.position.y * 23.1 + organ.position.z * 67.3 + organ.scale * 11.9) *
      0.5 +
    0.5;
  const frame = bendFlowerFrame(
    organ,
    organ.bend ?? flowerLoadBend(genome, organ.position, organ.scale, bendVariant),
  );
  const { forward, right, up } = frame;
  if (genome.id === "daylilyFlower") {
    const bloomForward = forward.clone().negate();
    const toWorld = (x: number, y: number, z: number) =>
      organ.position
        .clone()
        .add(right.clone().multiplyScalar(x * radius * 2.18))
        .add(up.clone().multiplyScalar(y * radius * 2.18))
        .add(bloomForward.clone().multiplyScalar(z * radius * 1.45));
    const center = toWorld(0, 0, -0.055);
    const rim: THREE.Vector3[] = [];
    for (let i = 0; i < 12; i++) {
      const a = i * (Math.PI / 6) + Math.PI / 2;
      const isTip = i % 2 === 0;
      const r = isTip ? 0.54 : 0.2;
      const fold = Math.sin(a * 3) * 0.025 + (isTip ? 0.015 : 0);
      rim.push(toWorld(Math.cos(a) * r, Math.sin(a) * r, -0.055 - fold));
    }
    for (let i = 0; i < rim.length; i++) {
      builder.addTriangle(center, rim[i], rim[(i + 1) % rim.length], petalColor, true, 0.6);
    }
    builder.addTriangle(
      toWorld(0, -0.42, 0.32),
      toWorld(-0.24, 0.1, 0.02),
      toWorld(0.24, 0.1, 0.02),
      petalColor,
      true,
      0.6,
    );
    builder.addTriangle(
      center.clone().add(right.clone().multiplyScalar(-radius * 0.13)),
      center.clone().add(right.clone().multiplyScalar(radius * 0.13)),
      center.clone().add(up.clone().multiplyScalar(radius * 0.18)),
      centerColor,
      false,
      0.2,
    );
    return;
  }
  if (genome.id === "foxgloveSpike") {
    const bloomForward = forward;
    const toWorld = (x: number, y: number, z: number) =>
      organ.position
        .clone()
        .add(right.clone().multiplyScalar(x * radius * 1.78))
        .add(up.clone().multiplyScalar(y * radius * 1.78))
        .add(bloomForward.clone().multiplyScalar(z * radius * 1.95));
    const apex = toWorld(0, 0, -0.62);
    const base: THREE.Vector3[] = [];
    for (let i = 0; i < 3; i++) {
      const a = i * (Math.PI * 2 / 3) + Math.PI / 2;
      base.push(toWorld(Math.cos(a) * 0.24, Math.sin(a) * 0.24, -0.04));
    }
    builder.addTriangle(apex, base[0], base[1], petalColor, true, 0.48);
    builder.addTriangle(apex, base[1], base[2], petalColor, true, 0.48);
    builder.addTriangle(apex, base[2], base[0], petalColor, true, 0.48);

    const center = toWorld(0, 0, 0.045);
    const diamond = [
      toWorld(0, 0.4, 0.05),
      toWorld(0.22, 0, 0.07),
      toWorld(0, -0.22, 0.04),
      toWorld(-0.22, 0, 0.07),
    ];
    for (let i = 0; i < diamond.length; i++) {
      builder.addTriangle(center, diamond[(i + 1) % diamond.length], diamond[i], petalColor, true, 0.48);
    }
    builder.addTriangle(
      center.clone().add(right.clone().multiplyScalar(-radius * 0.08)),
      center.clone().add(right.clone().multiplyScalar(radius * 0.08)),
      center.clone().add(up.clone().multiplyScalar(radius * 0.11)),
      centerColor,
      false,
      0.16,
    );
    return;
  }
  const petals = Math.max(1, genome.flower.petals);
  for (let w = 0; w < genome.flower.whorls; w++) {
    const whorlT = w / Math.max(1, genome.flower.whorls - 1);
    const whorlRadius = radius * (1.08 - whorlT * 0.42);
    const whorlLift = forward.clone().multiplyScalar(radius * whorlT * 0.1);
    const offset = (w / Math.max(1, genome.flower.whorls)) * Math.PI / petals + whorlT * 0.38;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2 + offset;
      const radial = right.clone().multiplyScalar(Math.cos(a)).add(up.clone().multiplyScalar(Math.sin(a)));
      const base = organ.position.clone().add(whorlLift).add(radial.clone().multiplyScalar(whorlRadius * 0.16));
      const tip = organ.position
        .clone()
        .add(whorlLift)
        .add(forward.clone().multiplyScalar(radius * (isEchinacea ? -0.18 - whorlT * 0.06 : 0.05 + whorlT * 0.24)))
        .add(radial.clone().multiplyScalar(whorlRadius * (isEchinacea ? 1.18 : 1.08)));
      const side = up
        .clone()
        .multiplyScalar(whorlRadius * 0.2 * Math.cos(a))
        .add(right.clone().multiplyScalar(-whorlRadius * 0.2 * Math.sin(a)));
      builder.addTriangle(base.clone().add(side), base.clone().sub(side), tip, petalColor, true, 0.7);
    }
  }
  const c = organ.position.clone().add(forward.clone().multiplyScalar(radius * 0.04));
  builder.addTriangle(
    c.clone().add(right.clone().multiplyScalar(-radius * (isEchinacea ? 0.24 : 0.16))),
    c.clone().add(right.clone().multiplyScalar(radius * (isEchinacea ? 0.24 : 0.16))),
    c.clone().add(up.clone().multiplyScalar(radius * (isEchinacea ? 0.28 : 0.18))),
    centerColor,
    false,
    0.3,
  );
};

const instanceMatrixFromFrame = (
  position: THREE.Vector3,
  right: THREE.Vector3,
  up: THREE.Vector3,
  forward: THREE.Vector3,
  scale: THREE.Vector3,
) => {
  const basis = new THREE.Matrix4().makeBasis(
    right.clone().normalize(),
    up.clone().normalize(),
    forward.clone().normalize(),
  );
  basis.scale(scale);
  basis.setPosition(position);
  return basis;
};

const leafInstance = (
  genome: ProcPlantGenome,
  organ: Organ,
  shade: number,
): ProcPlantInstance => {
  const length = organ.scale * (1 + shade * genome.lightResponse.leafBoostInShade);
  const dir = organ.direction.clone().normalize();
  const right = organ.right.clone().normalize();
  const normal = new THREE.Vector3().crossVectors(right, dir).normalize();
  normal.negate();
  const color = new THREE.Color(genome.leaf.colorA).lerp(new THREE.Color(genome.leaf.colorB), organ.t);
  return {
    kind: organ.kind === "grassBlade" ? "grassBlade" : "leaf",
    matrix: instanceMatrixFromFrame(
      organ.position,
      right,
      dir,
      normal,
      new THREE.Vector3(length, length, length),
    ),
    color,
    sway: 0.35 + organ.t * 0.65,
  };
};

const grassBladeInstance = (
  genome: ProcPlantGenome,
  organ: Organ,
): ProcPlantInstance => {
  const length = organ.scale;
  const dir = organ.direction.clone().normalize();
  const right = organ.right.clone().normalize();
  const normal = new THREE.Vector3().crossVectors(right, dir).normalize();
  normal.negate();
  const color = new THREE.Color(genome.leaf.colorA).lerp(new THREE.Color(genome.leaf.colorB), organ.t);
  return {
    kind: "grassBlade",
    matrix: instanceMatrixFromFrame(
      organ.position,
      right,
      dir,
      normal,
      new THREE.Vector3(length, length, length),
    ),
    color,
    sway: 1,
  };
};

const coniferSprayInstance = (
  genome: ProcPlantGenome,
  organ: Organ,
): ProcPlantInstance => {
  const length = organ.scale;
  const dir = organ.direction.clone().normalize();
  const right = organ.right.clone().normalize();
  const normal = new THREE.Vector3().crossVectors(right, dir).normalize();
  normal.negate();
  const color = new THREE.Color(genome.leaf.colorA).lerp(new THREE.Color(genome.leaf.colorB), 0.35 + organ.t * 0.45);
  return {
    kind: "coniferSpray",
    matrix: instanceMatrixFromFrame(
      organ.position,
      right,
      dir,
      normal,
      new THREE.Vector3(length, length, length),
    ),
    color,
    sway: 0.45 + organ.t * 0.35,
  };
};

const palmFrondInstance = (
  genome: ProcPlantGenome,
  organ: Organ,
): ProcPlantInstance => {
  const length = organ.scale;
  const dir = organ.direction.clone().normalize();
  const right = organ.right.clone().normalize();
  const normal = new THREE.Vector3().crossVectors(right, dir).normalize();
  normal.negate();
  const color = new THREE.Color(genome.leaf.colorA).lerp(new THREE.Color(genome.leaf.colorB), 0.25 + organ.t * 0.35);
  return {
    kind: "palmFrond",
    matrix: instanceMatrixFromFrame(
      organ.position,
      right,
      dir,
      normal,
      new THREE.Vector3(length, length, length),
    ),
    color,
    sway: 0.85,
  };
};

const flowerInstances = (
  genome: ProcPlantGenome,
  organ: Organ,
): ProcPlantInstance[] => {
  if (!genome.flower) return [];
  const isEchinacea = genome.id === "echinaceaFlower";
  const isDaylily = genome.id === "daylilyFlower";
  const isTulip = genome.id === "tulipCup";
  const isFoxglove = genome.id === "foxgloveSpike";
  const isPoppy = genome.id === "poppyFlower";
  const isSunflower = genome.id === "sunflowerTower";
  const isHibiscus = genome.id === "hibiscusBloom";
  const petalColor = new THREE.Color(genome.flower.color);
  const centerColor = new THREE.Color(genome.flower.centerColor);
  const radius = genome.flower.radius * organ.scale;
  const petals = Math.max(1, genome.flower.petals);
  const out: ProcPlantInstance[] = [];
  const bendVariant =
    Math.sin(organ.position.x * 41.7 + organ.position.y * 23.1 + organ.position.z * 67.3 + organ.scale * 11.9) *
      0.5 +
    0.5;
  const frame = bendFlowerFrame(
    organ,
    organ.bend ?? flowerLoadBend(genome, organ.position, organ.scale, bendVariant),
  );
  const { forward, right, up } = frame;
  if (isDaylily) {
    out.push({
      kind: "daylilyBloom",
      matrix: instanceMatrixFromFrame(
        organ.position.clone().add(forward.clone().multiplyScalar(radius * 0.02)),
        right,
        up,
        forward.clone().negate(),
        new THREE.Vector3(radius * 2.18, radius * 2.18, radius * 1.45),
      ),
      color: petalColor,
      sway: 0.6,
    });
    out.push({
      kind: "flowerCenter",
      matrix: instanceMatrixFromFrame(
        organ.position.clone().add(forward.clone().multiplyScalar(radius * 0.12)),
        right,
        up,
        forward,
        new THREE.Vector3(radius * 0.52, radius * 0.52, radius),
      ),
      color: centerColor,
      sway: 0.2,
    });
    return out;
  }
  if (isFoxglove) {
    out.push({
      kind: "foxgloveBloom",
      matrix: instanceMatrixFromFrame(
        organ.position.clone().add(forward.clone().multiplyScalar(radius * 0.02)),
        right,
        up,
        forward,
        new THREE.Vector3(radius * 1.78, radius * 1.78, radius * 1.95),
      ),
      color: petalColor,
      sway: 0.48,
    });
    out.push({
      kind: "flowerCenter",
      matrix: instanceMatrixFromFrame(
        organ.position.clone().add(forward.clone().multiplyScalar(radius * 0.1)),
        right,
        up,
        forward,
        new THREE.Vector3(radius * 0.38, radius * 0.38, radius),
      ),
      color: centerColor,
      sway: 0.16,
    });
    return out;
  }
  if (isPoppy) {
    out.push({
      kind: "flowerDisc",
      matrix: instanceMatrixFromFrame(
        organ.position.clone().add(forward.clone().multiplyScalar(radius * 0.015)),
        right,
        up,
        forward,
        new THREE.Vector3(radius * 2.15, radius * 2.15, radius),
      ),
      color: petalColor,
      sway: 0.62,
    });
    out.push({
      kind: "flowerCenter",
      matrix: instanceMatrixFromFrame(
        organ.position.clone().add(forward.clone().multiplyScalar(radius * 0.06)),
        right,
        up,
        forward,
        new THREE.Vector3(radius * 0.86, radius * 0.86, radius),
      ),
      color: centerColor,
      sway: 0.22,
    });
    return out;
  }
  for (let w = 0; w < genome.flower.whorls; w++) {
    const whorlT = w / Math.max(1, genome.flower.whorls - 1);
    const whorlRadius = radius * (1.08 - whorlT * 0.42);
    const whorlLift = forward.clone().multiplyScalar(radius * whorlT * 0.1);
    const offset = (w / Math.max(1, genome.flower.whorls)) * Math.PI / petals + whorlT * 0.38;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2 + offset;
      const radial = right.clone().multiplyScalar(Math.cos(a)).add(up.clone().multiplyScalar(Math.sin(a))).normalize();
      const side = up
        .clone()
        .multiplyScalar(Math.cos(a))
        .add(right.clone().multiplyScalar(-Math.sin(a)))
        .normalize();
      const petalAxis = isEchinacea
        ? radial.clone().multiplyScalar(1.08).add(forward.clone().multiplyScalar(-0.34 - whorlT * 0.08)).normalize()
        : isTulip
          ? radial.clone().multiplyScalar(0.48 + whorlT * 0.1).add(forward.clone().multiplyScalar(0.88 - whorlT * 0.18)).normalize()
          : isFoxglove
            ? radial.clone().multiplyScalar(0.44).add(forward.clone().multiplyScalar(0.7 - whorlT * 0.2)).normalize()
          : isDaylily
            ? radial.clone().multiplyScalar(1.08).add(forward.clone().multiplyScalar(0.18 - whorlT * 0.08)).normalize()
            : isPoppy
              ? radial.clone().multiplyScalar(1.02).add(forward.clone().multiplyScalar(0.08)).normalize()
            : isSunflower
              ? radial.clone().multiplyScalar(1.1).add(forward.clone().multiplyScalar(0.04)).normalize()
              : isHibiscus
                ? radial.clone().multiplyScalar(1.02).add(forward.clone().multiplyScalar(0.12)).normalize()
              : radial;
      const petalNormal =
        isEchinacea || isDaylily || isTulip || isFoxglove || isPoppy || isSunflower || isHibiscus
          ? new THREE.Vector3().crossVectors(petalAxis, side).normalize().lerp(forward, isTulip ? 0.7 : 0.45).normalize()
          : forward;
      const widthScale = isEchinacea ? 0.78 : isFoxglove ? 0.64 : isTulip ? 0.92 : isPoppy ? 1.35 : isSunflower ? 0.5 : isHibiscus ? 1.28 : 1;
      const lengthScale = isEchinacea ? 1.18 : isDaylily ? 1.2 : isTulip ? 0.98 : isFoxglove ? 0.82 : isPoppy ? 0.94 : isSunflower ? 1.12 : isHibiscus ? 1.05 : 1;
      out.push({
        kind: "petal",
        matrix: instanceMatrixFromFrame(
          organ.position.clone().add(whorlLift).add(radial.clone().multiplyScalar(whorlRadius * 0.16)),
          side,
          petalAxis,
          petalNormal.clone().negate(),
          new THREE.Vector3(whorlRadius * widthScale, whorlRadius * lengthScale, whorlRadius),
        ),
        color: petalColor,
        sway: 0.7,
      });
    }
  }
  out.push({
    kind: "flowerCenter",
    matrix: instanceMatrixFromFrame(
      organ.position.clone().add(forward.clone().multiplyScalar(radius * 0.04)),
      right,
      up,
      forward,
      new THREE.Vector3(
        radius * (isEchinacea ? 1.26 : isTulip ? 0.64 : isPoppy ? 0.72 : isSunflower ? 1.45 : isHibiscus ? 0.42 : 1),
        radius * (isEchinacea ? 1.26 : isTulip ? 0.64 : isPoppy ? 0.72 : isSunflower ? 1.45 : isHibiscus ? 0.42 : 1),
        radius,
      ),
    ),
    color: centerColor,
    sway: 0.25,
  });
  return out;
};

export const buildProcPlantInstancedParts = (
  genome: ProcPlantGenome,
  seed = 1,
  env: ProcPlantEnvironment = defaultPlantEnvironment(),
): ProcPlantInstancedParts => {
  const graph = buildProcPlantGraph(genome, seed, env);
  const stemBuilder = new TemplateBuilder();
  const shade = 1 - THREE.MathUtils.clamp(env.light, 0, 1);
  const stemColor = new THREE.Color(
    genome.habit === "grass" || genome.habit === "fern" ? 0x3f6d2d : 0x6d5135,
  );
  for (const [ai, bi] of graph.segments) {
    addStemSegment(stemBuilder, graph.stems[ai], graph.stems[bi], stemColor);
  }
  const instances: ProcPlantInstance[] = [];
  let leafCount = 0;
  let flowerCount = 0;
  for (const organ of graph.organs) {
    if (organ.kind === "grassBlade") {
      instances.push(grassBladeInstance(genome, organ));
      leafCount++;
    } else if (organ.kind === "coniferSpray") {
      instances.push(coniferSprayInstance(genome, organ));
      leafCount++;
    } else if (organ.kind === "palmFrond") {
      instances.push(palmFrondInstance(genome, organ));
      leafCount++;
    } else if (organ.kind === "flower") {
      const petals = flowerInstances(genome, organ);
      instances.push(...petals);
      flowerCount++;
    } else {
      instances.push(leafInstance(genome, organ, shade));
      leafCount++;
    }
  }
  const stems = stemBuilder.build();
  return {
    stems,
    instances,
    graph,
    stats: {
      stems: graph.segments.length,
      leaves: leafCount,
      flowers: flowerCount,
      stemTriangles: stems.idx.length / 3,
      instances: instances.length,
      triangles: stems.idx.length / 3 + instances.length,
    },
  };
};

export const createProcPlantLeafGeometry = (
  shape: LeafShapeKind,
  widthRatio: number,
  serration = 0,
  curl = 0,
): THREE.BufferGeometry => {
  const segments = shape === "cordate" || shape === "palmate" || shape === "fan" ? 10 : 7;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const spine: THREE.Vector3[] = [];
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    spine.push(new THREE.Vector3(0, t - 0.08, Math.sin(t * Math.PI) * curl));
  }
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = leafWidthAt(shape, t, serration) * widthRatio * 0.5;
    points.push(spine[i].clone().add(new THREE.Vector3(-w, 0, 0)));
  }
  for (let i = segments; i >= 0; i--) {
    const t = i / segments;
    const w = leafWidthAt(shape, t, serration) * widthRatio * 0.5;
    points.push(spine[i].clone().add(new THREE.Vector3(w, 0, 0)));
  }
  const base = spine[Math.max(0, Math.floor(segments * 0.18))];
  positions.push(base.x, base.y, base.z);
  normals.push(0, 0, 1);
  for (const point of points) {
    positions.push(point.x, point.y, point.z);
    normals.push(0, 0, 1);
  }
  for (let i = 1; i <= points.length; i++) {
    const next = i === points.length ? 1 : i + 1;
    indices.push(0, i, next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
};

export const createProcPlantGrassBladeGeometry = (widthRatio: number, curl = 0): THREE.BufferGeometry => {
  const width = widthRatio;
  const positions = new Float32Array([
    -width, 0, 0,
    width, 0, 0,
    width * 0.42, 0.54, 0,
    -width, 0, 0,
    width * 0.42, 0.54, 0,
    0, 1, -curl * 0.18,
  ]);
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < normals.length; i += 3) normals[i + 2] = 1;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.computeBoundingSphere();
  return geometry;
};

export const createProcPlantConiferSprayGeometry = (): THREE.BufferGeometry => {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const addQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    const base = positions.length / 3;
    const normal = new THREE.Vector3().subVectors(d, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, d, c, b]) {
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const addNeedlePlate = (
    width: number,
    length: number,
    yOffset: number,
    xOffset: number,
    zOffset: number,
    lean: number,
    ridge: number,
    droop: number,
  ) => {
    const rows = 4;
    const left: THREE.Vector3[] = [];
    const center: THREE.Vector3[] = [];
    const right: THREE.Vector3[] = [];
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const y = yOffset + t * length;
      const widthNow = Math.max(0.004, width * Math.sin(Math.PI * Math.min(1, t * 0.94 + 0.03)) * (1 - t * 0.56));
      const sweep = (t - 0.4) * lean;
      const edgeSag = -(zOffset - t * t * droop);
      const centerRise = -(zOffset + Math.sin(t * Math.PI) * ridge - t * t * droop);
      left.push(new THREE.Vector3(xOffset + sweep - widthNow, y, edgeSag));
      center.push(new THREE.Vector3(xOffset + sweep, y, centerRise));
      right.push(new THREE.Vector3(xOffset + sweep + widthNow, y, edgeSag));
    }
    for (let i = 0; i < rows; i++) {
      addQuad(left[i], center[i], center[i + 1], left[i + 1]);
      addQuad(center[i], right[i], right[i + 1], center[i + 1]);
    }
  };

  addNeedlePlate(0.085, 1.02, 0, 0, 0, 0.02, 0.035, 0.11);
  addNeedlePlate(0.06, 0.82, 0.08, -0.075, -0.022, -0.035, 0.025, 0.12);
  addNeedlePlate(0.06, 0.82, 0.12, 0.08, -0.026, 0.04, 0.025, 0.12);
  addNeedlePlate(0.045, 0.62, 0.22, -0.12, -0.042, -0.035, 0.018, 0.1);
  addNeedlePlate(0.045, 0.62, 0.26, 0.13, -0.048, 0.035, 0.018, 0.1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
};

export const createProcPlantPalmFrondGeometry = (): THREE.BufferGeometry => {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const addQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    const base = positions.length / 3;
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, b, c, d]) {
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const cuts = 13;
  for (let i = 0; i < cuts; i++) {
    const y0 = i / cuts + 0.006;
    const y1 = (i + 0.76) / cuts;
    const sag0 = -(y0 * y0) * 0.16;
    const sag1 = -(y1 * y1) * 0.16;
    const m0 = Math.sin(Math.PI * y0);
    const m1 = Math.sin(Math.PI * Math.min(1, y1));
    const w0 = m0 ** 0.62 * 0.42;
    const w1 = m1 ** 0.62 * 0.42;
    const fold0 = (i % 2 === 0 ? 1 : -1) * 0.035;
    const fold1 = -fold0;
    addQuad(
      new THREE.Vector3(0, y0, sag0),
      new THREE.Vector3(-w0, y0, fold0 + sag0),
      new THREE.Vector3(-w1, y1, fold1 + sag1),
      new THREE.Vector3(0, y1, sag1),
    );
    addQuad(
      new THREE.Vector3(0, y0, sag0),
      new THREE.Vector3(0, y1, sag1),
      new THREE.Vector3(w1, y1, -fold1 + sag1),
      new THREE.Vector3(w0, y0, -fold0 + sag0),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
};

const addTransformedGeometry = (
  builder: TemplateBuilder,
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  color: THREE.Color,
  sway = 1,
) => {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = source.getAttribute("position");
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    const a = p.fromBufferAttribute(pos, i).clone().applyMatrix4(matrix);
    const b = p.fromBufferAttribute(pos, i + 1).clone().applyMatrix4(matrix);
    const c = p.fromBufferAttribute(pos, i + 2).clone().applyMatrix4(matrix);
    builder.addTriangle(a, b, c, color, true, sway);
  }
  if (source !== geometry) source.dispose();
};

export const createProcPlantPetalGeometry = (): THREE.BufferGeometry => {
  const positions = new Float32Array([
    0, 0, 0,
    -0.16, 0.24, 0.015,
    -0.2, 0.62, 0.04,
    0, 1, 0.1,
    0.2, 0.62, 0.04,
    0.16, 0.24, 0.015,
  ]);
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < normals.length; i += 3) normals[i + 2] = 1;
  const indices = new Uint16Array([
    0, 1, 2,
    0, 2, 3,
    0, 3, 4,
    0, 4, 5,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
};

export const createProcPlantFlowerDiscGeometry = (): THREE.BufferGeometry => {
  const segments = 18;
  const positions: number[] = [0, 0, 0.035];
  const normals: number[] = [0, 0, 1];
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * 0.5;
    const y = Math.sin(a) * 0.5;
    const fold = Math.abs(y) * 0.22;
    const ripple = Math.sin(a * 2 + 0.4) * 0.008;
    positions.push(x, y, fold + ripple);
    normals.push(0, 0, 1);
  }
  for (let i = 1; i <= segments; i++) {
    const next = i === segments ? 1 : i + 1;
    indices.push(0, i, next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
};

export const createProcPlantDaylilyBloomGeometry = (): THREE.BufferGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];

  positions.push(0, -0.42, 0.32, -0.24, 0.1, 0.02, 0.24, 0.1, 0.02);
  indices.push(0, 2, 1);

  const centerIndex = positions.length / 3;
  positions.push(0, 0, -0.055);
  for (let i = 0; i < 12; i++) {
    const a = i * (Math.PI / 6) + Math.PI / 2;
    const isTip = i % 2 === 0;
    const radius = isTip ? 0.54 : 0.2;
    const fold = Math.sin(a * 3) * 0.025 + (isTip ? 0.015 : 0);
    positions.push(Math.cos(a) * radius, Math.sin(a) * radius, -0.055 - fold);
  }
  for (let i = 0; i < 12; i++) {
    const next = i === 11 ? 1 : i + 2;
    indices.push(centerIndex, centerIndex + i + 1, centerIndex + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

export const createProcPlantFoxgloveBloomGeometry = (): THREE.BufferGeometry => {
  const positions: number[] = [];
  const indices: number[] = [];

  positions.push(0, 0, -0.62);
  for (let i = 0; i < 3; i++) {
    const a = i * (Math.PI * 2 / 3) + Math.PI / 2;
    positions.push(Math.cos(a) * 0.24, Math.sin(a) * 0.24, -0.04);
  }
  indices.push(0, 1, 2, 0, 2, 3, 0, 3, 1);

  const centerIndex = positions.length / 3;
  positions.push(0, 0, 0.045);
  positions.push(0, 0.4, 0.05, 0.22, 0, 0.07, 0, -0.22, 0.04, -0.22, 0, 0.07);
  indices.push(
    centerIndex, centerIndex + 2, centerIndex + 1,
    centerIndex, centerIndex + 3, centerIndex + 2,
    centerIndex, centerIndex + 4, centerIndex + 3,
    centerIndex, centerIndex + 1, centerIndex + 4,
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
};

export const createProcPlantFlowerCenterGeometry = (): THREE.BufferGeometry => {
  const geometry = new THREE.CircleGeometry(0.16, 10);
  geometry.computeBoundingSphere();
  return geometry;
};

export const buildProcPlantTemplate = (
  genome: ProcPlantGenome,
  seed = 1,
  env: ProcPlantEnvironment = defaultPlantEnvironment(),
): { template: ProcPlantTemplate; graph: ProcPlantGraph; stats: ProcPlantStats } => {
  const graph = buildProcPlantGraph(genome, seed, env);
  const builder = new TemplateBuilder();
  const shade = 1 - THREE.MathUtils.clamp(env.light, 0, 1);
  const stemColor = new THREE.Color(
    genome.habit === "grass" || genome.habit === "fern" ? 0x3f6d2d : 0x6d5135,
  );
  for (const [ai, bi] of graph.segments) addStemSegment(builder, graph.stems[ai], graph.stems[bi], stemColor);
  let leafCount = 0;
  let flowerCount = 0;
  for (const organ of graph.organs) {
    if (organ.kind === "grassBlade") {
      addGrassBlade(builder, genome, organ);
      leafCount++;
    } else if (organ.kind === "coniferSpray") {
      const inst = coniferSprayInstance(genome, organ);
      const geo = createProcPlantConiferSprayGeometry();
      addTransformedGeometry(builder, geo, inst.matrix, inst.color, inst.sway);
      geo.dispose();
      leafCount++;
    } else if (organ.kind === "palmFrond") {
      const inst = palmFrondInstance(genome, organ);
      const geo = createProcPlantPalmFrondGeometry();
      addTransformedGeometry(builder, geo, inst.matrix, inst.color, inst.sway);
      geo.dispose();
      leafCount++;
    } else if (organ.kind === "flower") {
      addFlower(builder, genome, organ);
      flowerCount++;
    } else {
      addLeaf(builder, genome, organ, shade);
      leafCount++;
    }
  }
  const template = builder.build();
  return {
    template,
    graph,
    stats: {
      stems: graph.segments.length,
      leaves: leafCount,
      flowers: flowerCount,
      triangles: template.idx.length / 3,
    },
  };
};

export const buildProcPlantObject = (
  genome: ProcPlantGenome,
  seed = 1,
  env: ProcPlantEnvironment = defaultPlantEnvironment(),
): THREE.Group => {
  const { template } = buildProcPlantTemplate(genome, seed, env);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(template.pos.slice(), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(template.nrm.slice(), 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(template.col.slice(), 3));
  geometry.setIndex(new THREE.BufferAttribute(template.idx.slice(), 1));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = `procplant-${genome.id}`;
  group.userData.procPlant = { genomeId: genome.id, seed };
  group.add(mesh);
  return group;
};

export const procPlantPresetIds = Object.keys(procPlantPresets);
