import { afterEach, describe, expect, it } from "vitest";

import {
  applyWorldTerrainTemplate,
  baseTerrainHeight,
  isIntentionallyElevated,
  isIntentionallyOffsetFromGround,
  terrainKind,
} from "./tellus-terrain";
import type { GeneratedThing } from "./tellus-types";

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

function thingAt(y: number): GeneratedThing {
  return {
    id: "test",
    kind: "object",
    prompt: "test object",
    creatorId: "visitor",
    position: { x: 0, y, z: 0 },
    rotationY: 0,
    scale: 1,
    color: 0xffffff,
  };
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

  it("gives lowlands a visible wetland corridor", () => {
    applyWorldTerrainTemplate("lowlands");

    const height = baseTerrainHeight(-8, -18);

    expect(terrainKind(-8, -18, height)).toBe("water");
    expect(height).toBeLessThan(1.25);
  });

  it("treats lowered objects as intentionally offset from ground", () => {
    applyWorldTerrainTemplate("tellus");
    const ground = baseTerrainHeight(0, 0);

    expect(isIntentionallyElevated(thingAt(ground + 2))).toBe(true);
    expect(isIntentionallyOffsetFromGround(thingAt(ground + 2))).toBe(true);
    expect(isIntentionallyElevated(thingAt(ground - 2))).toBe(false);
    expect(isIntentionallyOffsetFromGround(thingAt(ground - 2))).toBe(true);
    expect(isIntentionallyOffsetFromGround(thingAt(ground + 0.1))).toBe(false);
  });
});
