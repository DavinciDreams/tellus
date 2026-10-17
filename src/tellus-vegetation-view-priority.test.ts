import { describe, expect, it } from "vitest";
import {
  firstNestedGrassCellIndex,
  grassFieldStrideForLod,
  travelGrassLod,
  vegetationChunkPriority,
  vegetationHorizonPrefetchOffsets,
  vegetationSightlinePrefetchOffsets,
  vegetationViewImportance,
} from "./tellus-vegetation-view-priority";

const context = {
  playerX: 0,
  playerZ: 0,
  forwardX: 0,
  forwardZ: -1,
};

describe("vegetation view priority", () => {
  it("prioritizes a farther sightline chunk over a nearer off-screen chunk", () => {
    const ahead = vegetationChunkPriority(0, -3, 16, 0, 0, context);
    const behind = vegetationChunkPriority(0, 2, 16, 0, 0, context);

    expect(ahead).toBeLessThan(behind);
  });

  it("retains a near-player safety bubble for sudden turns", () => {
    expect(vegetationViewImportance(0, 12, context)).toBeGreaterThan(0.8);
    expect(vegetationViewImportance(0, 48, context)).toBe(0);
  });

  it("prefetches only eight cheap chunks in an octant-stable forward porch", () => {
    const north = vegetationSightlinePrefetchOffsets(0, -1, 3);
    const slightlyTurned = vegetationSightlinePrefetchOffsets(0.1, -0.99, 3);

    expect(north).toHaveLength(8);
    expect(north.filter(({ dz }) => dz === -4)).toHaveLength(5);
    expect(north.filter(({ dz }) => dz === -5)).toHaveLength(3);
    expect(slightlyTurned).toEqual(north);
    expect(north.every(({ dx, dz }) => Math.max(Math.abs(dx), Math.abs(dz)) > 3)).toBe(true);
  });

  it("samples a wide, bounded, octant-stable tree horizon out to the fog line", () => {
    const north = vegetationHorizonPrefetchOffsets(0, -1, 3);
    const slightlyTurned = vegetationHorizonPrefetchOffsets(0.1, -0.99, 3);

    // ~7 per ring across 9 rings, sampled by world hash.
    expect(north.length).toBeGreaterThan(9 * 4);
    expect(north.length).toBeLessThan(9 * 11);
    expect(slightlyTurned).toEqual(north);
    expect(north.every(({ dx, dz }) => {
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      return ring >= 6 && ring <= 14;
    })).toBe(true);
    const farRows = north.filter(({ dx, dz }) => Math.max(Math.abs(dx), Math.abs(dz)) >= 12);
    expect(Math.min(...farRows.map(({ dx }) => dx))).toBeLessThan(-6);
    expect(Math.max(...farRows.map(({ dx }) => dx))).toBeGreaterThan(6);
  });

  it("keeps horizon membership anchored to world chunks as the player crosses chunk borders", () => {
    const worldSet = (centerCx: number, centerCz: number) => new Set(
      vegetationHorizonPrefetchOffsets(0, -1, 3, 14, 7, centerCx, centerCz)
        .map(({ dx, dz }) => `${centerCx + dx},${centerCz + dz}`),
    );
    const minimumAlignment = Math.cos(48 * Math.PI / 180);
    for (let step = 0; step < 20; step++) {
      const fromCz = 40 - step;
      const toCz = fromCz - 1;
      const before = worldSet(40, fromCz);
      // Walking one chunk forward: a chunk may only leave by entering the detailed rings or by
      // passing out of the view cone; anything still in the horizon band and in view must persist.
      const after = worldSet(40, toCz);
      const droppedInView = [...before].filter((key) => {
        if (after.has(key)) return false;
        const [cx, cz] = key.split(",").map(Number);
        const dx = cx! - 40;
        const dz = cz! - toCz;
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        return ring >= 6 && -dz / Math.hypot(dx, dz) >= minimumAlignment;
      });
      expect(droppedInView).toEqual([]);
    }
  });

  it("uses full travel grass only in the near bubble and central camera cone", () => {
    expect(travelGrassLod(0, -48, context)).toBe(0);
    expect(travelGrassLod(32, -32, context)).toBe(1);
    expect(travelGrassLod(0, 48, context)).toBe(2);
    expect(travelGrassLod(0, 12, context)).toBe(0);
  });

  it("keeps grass LOD cell membership nested and stable across negative coordinates", () => {
    const cells = (lod: 0 | 1 | 2) => {
      const stride = grassFieldStrideForLod(lod);
      const result: number[] = [];
      for (let cell = firstNestedGrassCellIndex(-9, stride); cell < 11; cell += stride) {
        result.push(cell);
      }
      return result;
    };
    const lod0 = new Set(cells(0));
    const lod1 = new Set(cells(1));

    expect(cells(1).every((cell) => lod0.has(cell))).toBe(true);
    expect(cells(2).every((cell) => lod1.has(cell))).toBe(true);
    expect(cells(2)).toEqual([-8, -4, 0, 4, 8]);
  });
});
