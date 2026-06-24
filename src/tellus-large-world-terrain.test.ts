import { afterEach, describe, expect, it } from "vitest";

import {
  CHUNK_SPAN,
  SEA_LEVEL,
  setChunkedWorldChunks,
} from "./tellus-constants";
import {
  largeWorldBaseHeight,
  largeWorldSlope,
  largeWorldTerrainKind,
  usesContinentalChunkedTerrain,
} from "./tellus-large-world-terrain";
import { runtimeConfig } from "./tellus-runtime-config";
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

describe("large-world terrain", () => {
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

  it("keeps the main Tellus chunked world island-shaped", () => {
    setChunkedWorldChunks({ w: 64, h: 64 });
    runtimeConfig.worldId = "chunked-64-main";
    runtimeConfig.worldTemplate = "tellus";

    const oceanEdge = { x: CHUNK_SPAN, z: CHUNK_SPAN };

    expect(usesContinentalChunkedTerrain()).toBe(false);
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
