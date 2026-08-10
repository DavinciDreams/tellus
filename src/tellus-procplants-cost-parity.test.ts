import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildProcPlantGraph,
  buildProcPlantInstancedParts,
  buildProcPlantTemplate,
  compileProcPlantLods,
  defaultPlantEnvironment,
  procPlantPresets,
} from "./tellus-procplants";

const SEED = 612_072;
const ENVIRONMENT = defaultPlantEnvironment();
const IDS = ["phiFern", "cloverGroundcover", "blueSpruce", "alpineFir"] as const;

const templateBounds = (positions: Float32Array) => {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let offset = 0; offset < positions.length; offset += 3) {
    bounds.expandByPoint(point.set(positions[offset]!, positions[offset + 1]!, positions[offset + 2]!));
  }
  return bounds;
};

const PREVIOUS_TRIANGLES = {
  phiFern: 6_384,
  cloverGroundcover: 1_574,
  blueSpruce: 11_840,
  alpineFir: 15_824,
} as const;

const TRIANGLE_CEILINGS = {
  phiFern: 400,
  cloverGroundcover: 1_400,
  blueSpruce: 6_000,
  alpineFir: 7_500,
} as const;

const INDEXED_LOD_METRICS = {
  phiFern: {
    triangles: [352, 264, 4, 2],
    vertices: [704, 528, 8, 4],
  },
  blueSpruce: {
    triangles: [3_934, 2_494, 4, 2],
    vertices: [4_420, 2_436, 8, 4],
  },
  alpineFir: {
    triangles: [5_190, 3_174, 4, 2],
    vertices: [5_208, 2_856, 8, 4],
  },
} as const;

describe("procplant cost parity", () => {
  it("keeps optimized presets deterministic, broad, finite, and below their former triangle costs", () => {
    const metrics = IDS.map((id) => {
      const first = buildProcPlantTemplate(procPlantPresets[id], SEED, ENVIRONMENT);
      const second = buildProcPlantTemplate(procPlantPresets[id], SEED, ENVIRONMENT);
      const size = templateBounds(first.template.pos).getSize(new THREE.Vector3());
      expect(first.template.idx).toEqual(second.template.idx);
      expect(first.template.pos).toEqual(second.template.pos);
      expect(first.template.idx.length / 3).toBeLessThan(PREVIOUS_TRIANGLES[id]);
      expect(first.template.idx.length / 3).toBeLessThanOrEqual(TRIANGLE_CEILINGS[id]);
      return {
        id,
        triangles: first.template.idx.length / 3,
        vertices: first.template.pos.length / 3,
        organs: first.graph.organs.length,
        size: size.toArray(),
      };
    });

    // Ferns use a dedicated wide-at-base, tapered frond card (fernFrond) rather than the palm's
    // mid-length-widest blade — the palm profile read as wheat at this triangle budget.
    const fern = buildProcPlantGraph(procPlantPresets.phiFern, SEED, ENVIRONMENT);
    expect(fern.organs).toHaveLength(8);
    expect(fern.organs.every((organ) => organ.kind === "fernFrond")).toBe(true);
    const fernParts = buildProcPlantInstancedParts(procPlantPresets.phiFern, SEED, ENVIRONMENT);
    // Canonical Procplants keeps one 44-triangle prototype per graph organ: 8 x 44 = 352.
    // Tellus must not re-introduce the former hidden six-card expansion.
    expect(fernParts.instances).toHaveLength(8);
    expect(fernParts.instances.every((instance) => instance.kind === "fernFrond")).toBe(true);
    expect(Math.min(metrics[0]!.size[0], metrics[0]!.size[2])).toBeGreaterThan(1.2);

    const clover = buildProcPlantGraph(procPlantPresets.cloverGroundcover, SEED, ENVIRONMENT);
    expect(Math.min(metrics[1]!.size[0], metrics[1]!.size[2])).toBeGreaterThan(1);
    expect(metrics[1]!.size[1]).toBeLessThan(0.35);

    for (const organ of [...fern.organs, ...clover.organs]) {
      expect(organ.direction.toArray().every(Number.isFinite)).toBe(true);
      expect(organ.right.toArray().every(Number.isFinite)).toBe(true);
      expect(organ.direction.length()).toBeCloseTo(1, 5);
      expect(organ.right.length()).toBeCloseTo(1, 5);
      expect(Math.abs(organ.direction.dot(organ.right))).toBeLessThan(1e-5);
    }

    expect(procPlantPresets.blueSpruce.foliage).toEqual({
      mass: 0.98,
      clusterDensity: 1.02,
      whorlDensity: 0.86,
      tipBias: 0.38,
      size: 0.78,
    });
    expect(procPlantPresets.blueSpruce.weberPenn).toMatchObject({
      maxBranchDepth: 2,
      maxStems: 64,
      maxLeaves: 160,
      radialSegments: 4,
      branchSamples: 1,
    });
    expect(procPlantPresets.alpineFir.foliage).toEqual({
      mass: 1.02,
      clusterDensity: 1.04,
      whorlDensity: 0.9,
      tipBias: 0.34,
      size: 0.7,
    });
    expect(procPlantPresets.alpineFir.weberPenn).toMatchObject({
      maxBranchDepth: 2,
      maxStems: 68,
      maxLeaves: 180,
      radialSegments: 4,
      branchSamples: 1,
    });

    console.log("PROCPLANT_COST_PARITY", JSON.stringify(metrics));
  });

  it("freezes the indexed Phi Fern and conifer LOD upload costs", () => {
    for (const [id, expected] of Object.entries(INDEXED_LOD_METRICS) as [
      keyof typeof INDEXED_LOD_METRICS,
      (typeof INDEXED_LOD_METRICS)[keyof typeof INDEXED_LOD_METRICS],
    ][]) {
      const lods = compileProcPlantLods(procPlantPresets[id], SEED, ENVIRONMENT);
      expect(lods.map(({ template }) => template.idx.length / 3)).toEqual(expected.triangles);
      expect(lods.map(({ template }) => template.pos.length / 3)).toEqual(expected.vertices);
    }
  });
});
