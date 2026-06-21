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
} from "./tellus-large-world-terrain";
import { runtimeConfig } from "./tellus-runtime-config";

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
});
