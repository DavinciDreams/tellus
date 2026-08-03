import { describe, expect, it } from "vitest";
import {
  firstNestedGrassCellIndex,
  grassFieldStrideForLod,
  vegetationChunkPriority,
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
