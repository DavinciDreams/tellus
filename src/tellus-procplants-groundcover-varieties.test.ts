import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildProcPlantGraph,
  buildProcPlantTemplate,
  defaultPlantEnvironment,
  procPlantPresets,
} from "./tellus-procplants";
import {
  ECOLOGY_BIOME_OPTIONS,
  PROCPLANT_PLACEABLE_CATALOG,
  biomePatchesForEcologyBiome,
  biomePatchesForPaint,
} from "./tellus-procplant-biomes";

const SEED = 0x6a09e667;
const ENVIRONMENT = { ...defaultPlantEnvironment(), light: 0.58, moisture: 0.78, crowding: 0.34 };
const IDS = ["maidenhairFernPatch", "cloverGroundcover", "woodlandVioletCarpet"] as const;
const TRIANGLE_CEILINGS: Record<(typeof IDS)[number], number> = {
  maidenhairFernPatch: 2_500,
  cloverGroundcover: 1_400,
  woodlandVioletCarpet: 2_500,
};

const templateSize = (positions: Float32Array) => {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let offset = 0; offset < positions.length; offset += 3) {
    bounds.expandByPoint(point.set(positions[offset]!, positions[offset + 1]!, positions[offset + 2]!));
  }
  return bounds.getSize(new THREE.Vector3());
};

describe("opt-in non-grass groundcover varieties", () => {
  it("keeps fern, clover, and flowering carpets deterministic, broad, and bounded", () => {
    const metrics = IDS.map((id) => {
      const genome = procPlantPresets[id];
      expect(genome).toBeDefined();
      expect(genome.habit).not.toBe("grass");
      expect(genome.groundcover).toBeDefined();

      const first = buildProcPlantTemplate(genome, SEED, ENVIRONMENT);
      const second = buildProcPlantTemplate(genome, SEED, ENVIRONMENT);
      expect(first.template.pos).toEqual(second.template.pos);
      expect(first.template.idx).toEqual(second.template.idx);

      const triangles = first.template.idx.length / 3;
      const size = templateSize(first.template.pos);
      expect(triangles).toBeGreaterThan(0);
      expect(triangles).toBeLessThanOrEqual(TRIANGLE_CEILINGS[id]);
      expect(Math.min(size.x, size.z)).toBeGreaterThanOrEqual(genome.groundcover!.radius * 1.05);
      expect(Math.max(size.x, size.z)).toBeLessThanOrEqual(genome.groundcover!.radius * 2.8);
      expect(size.y).toBeGreaterThan(0.08);
      expect(size.y).toBeLessThan(0.75);

      const graph = buildProcPlantGraph(genome, SEED, ENVIRONMENT);
      expect(graph.organs.length).toBeGreaterThanOrEqual(20);
      for (const organ of graph.organs) {
        expect(organ.direction.toArray().every(Number.isFinite)).toBe(true);
        expect(organ.right.toArray().every(Number.isFinite)).toBe(true);
        expect(organ.direction.length()).toBeCloseTo(1, 5);
        expect(organ.right.length()).toBeCloseTo(1, 5);
        expect(Math.abs(organ.direction.dot(organ.right))).toBeLessThan(1e-5);
      }

      return { id, triangles, vertices: first.template.pos.length / 3, organs: graph.organs.length, size: size.toArray() };
    });

    expect(new Set(metrics.map((metric) => JSON.stringify(metric.size))).size).toBe(IDS.length);
    expect(procPlantPresets.cloverGroundcover.groundcover?.runners).toBe(true);
    expect(buildProcPlantGraph(procPlantPresets.cloverGroundcover, SEED, ENVIRONMENT).segments.length).toBeGreaterThanOrEqual(7);
    expect(buildProcPlantGraph(procPlantPresets.woodlandVioletCarpet, SEED, ENVIRONMENT)
      .organs.some((organ) => organ.kind === "flower")).toBe(true);
    console.log("PROCPLANT_GROUNDCOVER_VARIETIES", JSON.stringify(metrics));
  });

  it("exposes the new varieties for explicit placement without adding them to automatic biome patches", () => {
    const placeablePresetIds = new Set(PROCPLANT_PLACEABLE_CATALOG.map((entry) => entry.presetId));
    for (const id of IDS) expect(placeablePresetIds.has(id)).toBe(true);

    const automaticIds = new Set<string>();
    const paints = [
      "meadow", "flowers", "grass", "beach", "dirt", "forest-floor", "desert-sand",
      "rock", "snow", "stone", "gravel", "jungle-moss", "brick",
    ] as const;
    for (let seed = 0; seed < 64; seed++) {
      for (const paint of paints) {
        for (const patch of biomePatchesForPaint(paint, seed)) {
          automaticIds.add(patch.primary);
          if (patch.secondary) automaticIds.add(patch.secondary);
        }
      }
      for (const biome of ECOLOGY_BIOME_OPTIONS) {
        for (const patch of biomePatchesForEcologyBiome(biome, seed, 20)) {
          automaticIds.add(patch.primary);
          if (patch.secondary) automaticIds.add(patch.secondary);
        }
      }
    }
    expect(automaticIds.has("maidenhairFernPatch")).toBe(false);
    expect(automaticIds.has("woodlandVioletCarpet")).toBe(false);
  });
});
