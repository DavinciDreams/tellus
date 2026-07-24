import { afterEach, describe, expect, it } from "vitest";

import {
  CLASSIC_WORLD_RADIUS,
  CHUNK_SPAN,
  SEA_LEVEL,
  setChunkedWorldChunks,
} from "./tellus-constants";
import {
  largeWorldBaseHeight,
  largeWorldSlope,
  largeWorldTerrainKind,
  evoflowContinentalLakebedHeight,
  evoflowChunkedWaterbedHeight,
  evoflowRasterEdgeBlend,
  usesContinentalChunkedTerrain,
} from "./tellus-large-world-terrain";
import { runtimeConfig } from "./tellus-runtime-config";
import {
  evoflowBiomeForSemanticLabel,
  evoflowTerrainKindForSemanticLabel,
} from "./tellus-terrain";
import type { WorldTemplateId } from "./tellus-types";

function sampleGrid(step = 96, count = 12): Array<{ x: number; z: number; h: number; slope: number }> {
  const samples: Array<{ x: number; z: number; h: number; slope: number }> = [];
  for (let z = 0; z <= count; z++) {
    for (let x = 0; x <= count; x++) {
      const wx = x * step;
      const wz = z * step;
      samples.push({
        x: wx,
        z: wz,
        h: largeWorldBaseHeight(wx, wz),
        slope: largeWorldSlope(wx, wz),
      });
    }
  }
  return samples;
}

function islandSignature(template: WorldTemplateId, chunkSize = 24): number[] {
  setChunkedWorldChunks({ w: chunkSize, h: chunkSize });
  runtimeConfig.worldId = `chunked-${chunkSize}-${template}`;
  runtimeConfig.worldTemplate = template;
  const center = { x: (chunkSize * CHUNK_SPAN) / 2, z: (chunkSize * CHUNK_SPAN) / 2 };
  const samples = [
    { x: center.x, z: center.z },
    { x: center.x - 28, z: center.z + 12 },
    { x: center.x + 24, z: center.z - 18 },
    { x: center.x + 8, z: center.z + 34 },
  ];
  return samples.map((sample) => Number(largeWorldBaseHeight(sample.x, sample.z).toFixed(2)));
}

function continentalSignature(template: WorldTemplateId): number[] {
  setChunkedWorldChunks({ w: 64, h: 64 });
  runtimeConfig.worldId = `chunked-64-${template}`;
  runtimeConfig.worldTemplate = template;
  const center = { x: (64 * CHUNK_SPAN) / 2, z: (64 * CHUNK_SPAN) / 2 };
  const samples = [
    { x: center.x, z: center.z },
    { x: center.x - 56, z: center.z + 24 },
    { x: center.x + 48, z: center.z - 36 },
    { x: center.x + 16, z: center.z + 68 },
  ];
  return samples.map((sample) => Number(largeWorldBaseHeight(sample.x, sample.z).toFixed(2)));
}

function showcaseSamples(chunkSize = 24): Array<{ x: number; z: number }> {
  const center = { x: (chunkSize * CHUNK_SPAN) / 2, z: (chunkSize * CHUNK_SPAN) / 2 };
  return [
    { x: center.x, z: center.z },
    { x: center.x - 210, z: center.z + 42 },
    { x: center.x + 180, z: center.z - 84 },
    { x: center.x + 300, z: center.z + 12 },
    { x: center.x - 96, z: center.z - 260 },
    { x: center.x + 56, z: center.z + 232 },
  ];
}

function showcaseGridSamples(chunkSize = 24): Array<{ x: number; z: number }> {
  const center = { x: (chunkSize * CHUNK_SPAN) / 2, z: (chunkSize * CHUNK_SPAN) / 2 };
  const samples: Array<{ x: number; z: number }> = [];
  for (let z = -3; z <= 3; z++) {
    for (let x = -3; x <= 3; x++) {
      samples.push({ x: center.x + x * 108, z: center.z + z * 108 });
    }
  }
  return samples;
}

describe("large-world terrain", () => {
  it("maps local Evoflow semantic labels into ecology biome families", () => {
    expect(evoflowBiomeForSemanticLabel("evoflow-copper-terraces", 1, 3)).toBe("desert");
    expect(evoflowBiomeForSemanticLabel("evoflow-lichen-basin", 4, 4)).toBe("tundra");
    expect(evoflowBiomeForSemanticLabel("evoflow-glass-ridge", 3, 18)).toBe("arctic-alpine");
    expect(evoflowBiomeForSemanticLabel("evoflow-coral-canyon", 4, 2)).toBe("grassland");
  });

  it("keeps low EvoFlow semantic water distinct from beach terrain", () => {
    expect(evoflowTerrainKindForSemanticLabel(0, -2)).toBe("water");
    expect(evoflowTerrainKindForSemanticLabel(0, -1)).toBe("meadow");
    expect(evoflowTerrainKindForSemanticLabel(2, -2)).toBe("beach");
  });

  it("places EvoFlow semantic waterbeds below the rendered ocean plane", () => {
    expect(evoflowChunkedWaterbedHeight(SEA_LEVEL + 0.45, "water")).toBeLessThan(SEA_LEVEL);
    expect(evoflowChunkedWaterbedHeight(SEA_LEVEL - 8, "water")).toBeGreaterThanOrEqual(
      SEA_LEVEL - 1.4,
    );
    expect(evoflowChunkedWaterbedHeight(SEA_LEVEL + 0.45, "beach")).toBe(SEA_LEVEL + 0.45);
  });

  it("fades continental EvoFlow rasters before their square source boundary", () => {
    expect(evoflowRasterEdgeBlend(0, 0)).toBe(1);
    expect(evoflowRasterEdgeBlend(CLASSIC_WORLD_RADIUS * 0.9, 0)).toBeGreaterThan(0);
    expect(evoflowRasterEdgeBlend(CLASSIC_WORLD_RADIUS * 0.9, 0)).toBeLessThan(1);
    expect(evoflowRasterEdgeBlend(CLASSIC_WORLD_RADIUS, 0)).toBe(0);
    expect(evoflowRasterEdgeBlend(0, CLASSIC_WORLD_RADIUS + 1)).toBe(0);
  });

  it("blends lakebeds back into continental terrain at raster edges", () => {
    const terrainHeight = 8;
    const lakeCenter = evoflowContinentalLakebedHeight(terrainHeight, -4, 1);
    const lakeTransition = evoflowContinentalLakebedHeight(terrainHeight, -4, 0.35);
    const outsideRaster = evoflowContinentalLakebedHeight(terrainHeight, -4, 0);

    expect(lakeCenter).toBeLessThan(SEA_LEVEL);
    expect(lakeTransition).toBeGreaterThan(lakeCenter);
    expect(lakeTransition).toBeLessThan(terrainHeight);
    expect(outsideRaster).toBe(terrainHeight);
  });

  afterEach(() => {
    setChunkedWorldChunks(null);
    runtimeConfig.worldId = "chunked-64-genesis";
    runtimeConfig.worldTemplate = "tellus";
    runtimeConfig.landShape = undefined;
  });

  it("creates substantial but sane relief over a chunked region", () => {
    const heights = sampleGrid().map((sample) => sample.h);
    const relief = Math.max(...heights) - Math.min(...heights);

    expect(heights.every(Number.isFinite)).toBe(true);
    expect(relief).toBeGreaterThan(24);
    expect(relief).toBeLessThan(70);
  });

  it("contains both gentle ground and ridged slopes", () => {
    const slopes = sampleGrid(48, 20).map((sample) => sample.slope);

    expect(slopes.some((slope) => slope < 0.35)).toBe(true);
    expect(slopes.some((slope) => slope > 1.05)).toBe(true);
  });

  it("classifies terrain into playable material bands", () => {
    const kinds = new Set(
      sampleGrid(48, 20).map((sample) =>
        largeWorldTerrainKind(sample.x, sample.z, sample.h),
      ),
    );

    expect(kinds.has("meadow")).toBe(true);
    expect(kinds.has("rock")).toBe(true);
    expect(kinds.has("flowers") || kinds.has("dirt")).toBe(true);
  });

  it("uses the Tellus island template when chunk bounds are known", () => {
    setChunkedWorldChunks({ w: 64, h: 64 });
    runtimeConfig.worldId = "chunked-64-main";
    runtimeConfig.worldTemplate = "tellus";

    const center = { x: (64 * CHUNK_SPAN) / 2, z: (64 * CHUNK_SPAN) / 2 };
    const translatedMainPoint = { x: center.x - 10, z: center.z - 56 };
    const oceanEdge = { x: CHUNK_SPAN, z: CHUNK_SPAN };

    expect(largeWorldBaseHeight(center.x, center.z)).toBeGreaterThan(SEA_LEVEL + 2);
    expect(largeWorldBaseHeight(translatedMainPoint.x, translatedMainPoint.z)).toBeGreaterThan(
      SEA_LEVEL,
    );
    expect(largeWorldBaseHeight(oceanEdge.x, oceanEdge.z)).toBeLessThan(SEA_LEVEL);
    expect(largeWorldTerrainKind(oceanEdge.x, oceanEdge.z)).toBe("water");
  });

  it("keeps flight-range chunked worlds continental instead of island masked", () => {
    setChunkedWorldChunks({ w: 64, h: 64 });
    runtimeConfig.worldId = "chunked-64-genesis";
    runtimeConfig.worldTemplate = "flight-range";

    const legacyLandPoint = { x: CHUNK_SPAN, z: CHUNK_SPAN };

    expect(largeWorldBaseHeight(legacyLandPoint.x, legacyLandPoint.z)).toBeGreaterThan(
      SEA_LEVEL + 2,
    );
    expect(largeWorldTerrainKind(legacyLandPoint.x, legacyLandPoint.z)).not.toBe("water");
  });

  it("keeps large non-Tellus chunked templates continental", () => {
    setChunkedWorldChunks({ w: 64, h: 64 });
    runtimeConfig.worldId = "chunked-64-desert-test-1";
    runtimeConfig.worldTemplate = "evoflow-copper-terraces";

    const legacyLandPoint = { x: CHUNK_SPAN, z: CHUNK_SPAN };

    expect(usesContinentalChunkedTerrain()).toBe(true);
    expect(largeWorldBaseHeight(legacyLandPoint.x, legacyLandPoint.z)).toBeGreaterThan(
      SEA_LEVEL + 2,
    );
    expect(largeWorldTerrainKind(legacyLandPoint.x, legacyLandPoint.z)).not.toBe("water");
  });

  it("makes large ridge chunked worlds read as mountain terrain", () => {
    setChunkedWorldChunks({ w: 64, h: 64 });
    runtimeConfig.worldId = "chunked-64-ridge";
    runtimeConfig.worldTemplate = "ridge";

    const center = { x: (64 * CHUNK_SPAN) / 2, z: (64 * CHUNK_SPAN) / 2 };
    const spine = { x: center.x, z: center.z };
    const foothill = { x: center.x + 520, z: center.z - 260 };
    const distant = { x: center.x + 920, z: center.z - 460 };
    const spineHeight = largeWorldBaseHeight(spine.x, spine.z);
    const foothillHeight = largeWorldBaseHeight(foothill.x, foothill.z);
    const distantHeight = largeWorldBaseHeight(distant.x, distant.z);
    const ridgeKinds = new Set(
      [
        spine,
        { x: center.x + 120, z: center.z + 40 },
        { x: center.x - 180, z: center.z - 30 },
        foothill,
      ].map((sample) => largeWorldTerrainKind(sample.x, sample.z)),
    );

    expect(usesContinentalChunkedTerrain()).toBe(true);
    expect(spineHeight).toBeGreaterThan(foothillHeight + 8);
    expect(spineHeight).toBeGreaterThan(distantHeight + 14);
    expect(ridgeKinds.has("rock") || ridgeKinds.has("snow")).toBe(true);
  });

  it("keeps the main Tellus chunked world island-shaped", () => {
    setChunkedWorldChunks({ w: 64, h: 64 });
    runtimeConfig.worldId = "chunked-64-main";
    runtimeConfig.worldTemplate = "tellus";

    const center = { x: (64 * CHUNK_SPAN) / 2, z: (64 * CHUNK_SPAN) / 2 };
    const innerBeach = { x: center.x + 140, z: center.z };
    const justOffshore = { x: center.x + 150, z: center.z };
    const oceanEdge = { x: CHUNK_SPAN, z: CHUNK_SPAN };

    expect(usesContinentalChunkedTerrain()).toBe(false);
    expect(largeWorldBaseHeight(innerBeach.x, innerBeach.z)).toBeGreaterThan(
      largeWorldBaseHeight(justOffshore.x, justOffshore.z),
    );
    expect(largeWorldBaseHeight(justOffshore.x, justOffshore.z)).toBeLessThan(SEA_LEVEL);
    expect(largeWorldTerrainKind(oceanEdge.x, oceanEdge.z)).toBe("water");
  });

  it("gives restored chunked templates distinct island profiles", () => {
    const tellus = islandSignature("tellus").join(",");
    const signatures = new Map<WorldTemplateId, string>(
      ([
        "lowlands",
        "ridge",
        "fantasy-garden",
        "realistic-cove",
        "low-poly-meadow",
        "cartoon-hills",
        "evoflow-glass-ridge",
        "evoflow-copper-terraces",
        "evoflow-basalt-teeth",
        "evoflow-spires",
        "evoflow-lichen-basin",
      ] as WorldTemplateId[]).map((template) => [template, islandSignature(template).join(",")]),
    );

    for (const [template, signature] of signatures) {
      expect(signature, template).not.toBe(tellus);
    }
    expect(new Set(signatures.values()).size).toBeGreaterThan(7);
  });

  it("keeps showcase templates broad instead of tiny Tellus-island clones", () => {
    const chunkSize = 24;
    setChunkedWorldChunks({ w: chunkSize, h: chunkSize });
    const center = { x: (chunkSize * CHUNK_SPAN) / 2, z: (chunkSize * CHUNK_SPAN) / 2 };
    const showcasePoint = { x: center.x + 300, z: center.z + 12 };

    runtimeConfig.worldId = "chunked-24-tellus";
    runtimeConfig.worldTemplate = "tellus";
    expect(largeWorldTerrainKind(showcasePoint.x, showcasePoint.z)).toBe("water");

    for (const template of [
      "ridge",
      "realistic-cove",
      "low-poly-meadow",
      "cartoon-hills",
      "fantasy-garden",
      "evoflow-copper-terraces",
    ] as WorldTemplateId[]) {
      runtimeConfig.worldId = `chunked-24-${template}`;
      runtimeConfig.worldTemplate = template;
      const h = largeWorldBaseHeight(showcasePoint.x, showcasePoint.z);
      expect(h, template).toBeGreaterThan(SEA_LEVEL - 0.25);
      expect(largeWorldTerrainKind(showcasePoint.x, showcasePoint.z), template).not.toBe("water");
    }
  });

  it("gives showcase templates strong relief and style-specific material bands", () => {
    const chunkSize = 24;
    setChunkedWorldChunks({ w: chunkSize, h: chunkSize });
    const samples = showcaseGridSamples(chunkSize);

    for (const template of [
      "ridge",
      "realistic-cove",
      "low-poly-meadow",
      "cartoon-hills",
      "fantasy-garden",
      "evoflow-copper-terraces",
    ] as WorldTemplateId[]) {
      runtimeConfig.worldId = `chunked-${chunkSize}-${template}`;
      runtimeConfig.worldTemplate = template;
      const heights = samples.map((sample) => largeWorldBaseHeight(sample.x, sample.z));
      const kinds = new Set(samples.map((sample) => largeWorldTerrainKind(sample.x, sample.z)));
      const relief = Math.max(...heights) - Math.min(...heights);
      const minRelief: Partial<Record<WorldTemplateId, number>> = {
        ridge: 28,
        "realistic-cove": 18,
        "low-poly-meadow": 22,
        "cartoon-hills": 22,
        "fantasy-garden": 12,
        "evoflow-copper-terraces": 12,
      };

      expect(relief, template).toBeGreaterThan(minRelief[template] ?? 8);
      expect(kinds.size, template).toBeGreaterThan(1);
      if (template === "ridge") expect(kinds.has("snow") || kinds.has("rock")).toBe(true);
      if (template === "realistic-cove") {
        expect(kinds.has("water") || kinds.has("beach")).toBe(true);
        expect(kinds.has("rock")).toBe(true);
        expect(kinds.has("dirt") || kinds.has("beach")).toBe(true);
      }
      if (template === "low-poly-meadow") expect(kinds.has("rock") || kinds.has("dirt")).toBe(false);
      if (template === "cartoon-hills") expect(kinds.has("flowers")).toBe(true);
      if (template === "fantasy-garden") {
        expect(kinds.has("flowers")).toBe(true);
        expect(kinds.has("dirt")).toBe(true);
      }
      if (template === "evoflow-copper-terraces") {
        expect(kinds.has("dirt")).toBe(true);
        expect(kinds.has("meadow")).toBe(false);
        expect(kinds.has("water")).toBe(false);
      }
    }
  });

  it("applies EvoFlow template profiles to large continental chunked worlds", () => {
    const signatures = new Map<WorldTemplateId, string>(
      ([
        "evoflow-glass-ridge",
        "evoflow-copper-terraces",
        "evoflow-basalt-teeth",
        "evoflow-spires",
        "evoflow-lichen-basin",
      ] as WorldTemplateId[]).map((template) => [template, continentalSignature(template).join(",")]),
    );

    expect(new Set(signatures.values()).size).toBe(signatures.size);
  });

  it("keeps 24-chunk EvoFlow highlands continental while coral worlds remain oceanic", () => {
    setChunkedWorldChunks({ w: 24, h: 24 });

    for (const template of [
      "evoflow-spires",
      "evoflow-glass-ridge",
      "evoflow-lichen-basin",
      "evoflow-copper-terraces",
      "evoflow-basalt-teeth",
      "evoflow-coral-canyon-child",
    ] as WorldTemplateId[]) {
      runtimeConfig.worldId = `chunked-24-${template}`;
      runtimeConfig.worldTemplate = template;
      expect(usesContinentalChunkedTerrain(), template).toBe(true);
    }

    for (const template of ["evoflow-coral-canyon", "evoflow-coral-fold"] as WorldTemplateId[]) {
      runtimeConfig.worldId = `chunked-24-${template}`;
      runtimeConfig.worldTemplate = template;
      expect(usesContinentalChunkedTerrain(), template).toBe(false);
    }
  });

  it("applies procedural land-shape overrides to large continental chunked worlds", () => {
    setChunkedWorldChunks({ w: 64, h: 64 });
    runtimeConfig.worldId = "chunked-64-flight-range";
    runtimeConfig.worldTemplate = "flight-range";
    const center = { x: (64 * CHUNK_SPAN) / 2, z: (64 * CHUNK_SPAN) / 2 };
    const before = largeWorldBaseHeight(center.x, center.z);

    runtimeConfig.landShape = {
      baseOffset: 5,
      detail: { amplitude: 2.5, ridgeAmplitude: 2, terraceAmplitude: 1.2 },
    };

    expect(largeWorldBaseHeight(center.x, center.z)).toBeGreaterThan(before + 4);
  });

  it("uses distinctive base materials for non-Tellus templates", () => {
    setChunkedWorldChunks({ w: 64, h: 64 });
    const center = { x: (64 * CHUNK_SPAN) / 2, z: (64 * CHUNK_SPAN) / 2 };

    runtimeConfig.worldId = "chunked-64-copper-terraces";
    runtimeConfig.worldTemplate = "evoflow-copper-terraces";
    expect(largeWorldTerrainKind(center.x, center.z)).not.toBe("meadow");

    runtimeConfig.worldId = "chunked-64-canyon-child";
    runtimeConfig.worldTemplate = "evoflow-coral-canyon-child";
    expect(largeWorldTerrainKind(center.x, center.z)).not.toBe("meadow");
  });
});
