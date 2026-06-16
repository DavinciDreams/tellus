import { afterEach, describe, expect, it } from "vitest";

import {
  applyWorldTerrainTemplate,
  baseTerrainHeight,
} from "./tellus-terrain";

function sampleHeights(radius = 48): number[] {
  const points: number[] = [];
  for (let z = -radius; z <= radius; z += 16) {
    for (let x = -radius; x <= radius; x += 16) {
      points.push(baseTerrainHeight(x, z));
    }
  }
  return points;
}

function relief(heights: number[]): number {
  return Math.max(...heights) - Math.min(...heights);
}

function localVariation(heights: number[]): number {
  const rounded = new Set(heights.map((height) => height.toFixed(1)));
  return rounded.size;
}

describe("Tellus terrain defaults", () => {
  afterEach(() => {
    applyWorldTerrainTemplate("tellus");
  });

  it("adds varied procedural relief to the default island", () => {
    applyWorldTerrainTemplate("tellus");

    const heights = sampleHeights();

    expect(heights.every(Number.isFinite)).toBe(true);
    expect(localVariation(heights)).toBeGreaterThan(24);
    expect(relief(heights)).toBeGreaterThan(18);
  });

  it("makes ridge terrain rougher than lowlands", () => {
    applyWorldTerrainTemplate("lowlands");
    const lowlandRelief = relief(sampleHeights());

    applyWorldTerrainTemplate("ridge");
    const ridgeRelief = relief(sampleHeights());

    expect(ridgeRelief).toBeGreaterThan(lowlandRelief + 3);
  });
});
