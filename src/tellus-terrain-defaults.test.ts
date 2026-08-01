import { afterEach, describe, expect, it } from "vitest";

import {
  applyWorldTerrainTemplate,
  baseTerrainHeight,
  groundHeightAt,
  groundedPosition,
  isIntentionallyElevated,
  isIntentionallyOffsetFromGround,
  movedVehiclePosition,
  setChunkedFlatGround,
  setChunkedHeightProvider,
  terrainKind,
  waterVehiclePosition,
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
    verticalOffset: 0,
  };
}

function mountAt(y: number): GeneratedThing {
  return {
    ...thingAt(y),
    kind: "animal",
    prompt: "rideable horse mount",
  };
}

function waterMountAt(y: number): GeneratedThing {
  return {
    ...thingAt(y),
    prompt: "wooden sailing boat",
  };
}

describe("Tellus terrain defaults", () => {
  afterEach(() => {
    applyWorldTerrainTemplate("tellus");
    setChunkedHeightProvider(null);
    setChunkedFlatGround(null);
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

  it("uses explicit offsets instead of inferring intent from a possibly stale position y", () => {
    applyWorldTerrainTemplate("tellus");
    const ground = baseTerrainHeight(0, 0);

    expect(isIntentionallyElevated({ ...thingAt(ground + 2), verticalOffset: 2 })).toBe(true);
    expect(isIntentionallyOffsetFromGround({ ...thingAt(ground + 2), verticalOffset: 2 })).toBe(true);
    expect(isIntentionallyElevated({ ...thingAt(ground - 2), verticalOffset: -2 })).toBe(false);
    expect(isIntentionallyOffsetFromGround({ ...thingAt(ground - 2), verticalOffset: -2 })).toBe(true);
    expect(isIntentionallyOffsetFromGround(thingAt(ground + 2))).toBe(false);
    expect(isIntentionallyOffsetFromGround(thingAt(ground + 0.1))).toBe(false);
  });

  it("uses the explicit vertical-offset contract even below the old grounding epsilon", () => {
    const explicitlyLifted = { ...thingAt(0.02), verticalOffset: 0.02 };
    const explicitlyGrounded = { ...thingAt(0), verticalOffset: 0 };

    expect(isIntentionallyOffsetFromGround(explicitlyLifted)).toBe(true);
    expect(isIntentionallyOffsetFromGround({ ...explicitlyLifted, verticalOffset: 0.08 })).toBe(true);
    expect(isIntentionallyOffsetFromGround(explicitlyGrounded)).toBe(false);
  });

  it("preserves manual height offsets when moving ground mounts", () => {
    setChunkedFlatGround(3);
    const lifted = movedVehiclePosition(
      { ...mountAt(5), verticalOffset: 2 },
      12,
      18,
      { x: 0, y: 5, z: 0 },
    );
    expect(lifted.y).toBe(5);

    const grounded = movedVehiclePosition(
      { ...mountAt(9), verticalOffset: 0 },
      12,
      18,
      { x: 0, y: 9, z: 0 },
    );
    expect(grounded.y).toBe(3);
  });

  it("preserves raised and lowered water offsets instead of snapping to the surface", () => {
    const surfaceY = waterVehiclePosition(400, 0).y;
    const raised = movedVehiclePosition(
      { ...waterMountAt(2.14), verticalOffset: 2 },
      400,
      0,
      { x: 380, y: 2.14, z: 0 },
    );
    const lowered = movedVehiclePosition(
      { ...waterMountAt(-1.86), verticalOffset: -2 },
      400,
      0,
      { x: 380, y: -1.86, z: 0 },
    );

    expect(raised.y).toBeCloseTo(surfaceY + 2);
    expect(lowered.y).toBeCloseTo(surfaceY - 2);
  });

  it("keeps ground mounts moving when terrain height cannot resolve the next spot", () => {
    const next = movedVehiclePosition(mountAt(6), 3200, 3210, { x: 3075, y: 6, z: 3075 });

    expect(next.x).toBe(3200);
    expect(next.z).toBe(3210);
    expect(next.y).toBe(6);
  });
});

// Regression: chunked grounding height MUST be finite. It flows into visitorPosition.y and then the
// Rapier controller; a NaN there panics world.step() (the terrain-paint `unreachable` crash). The
// height provider returns null for not-yet-loaded chunks (mid-reload during a paint stroke) and can
// transiently return non-finite values, so groundedPosition/groundHeightAt must never emit NaN.
describe("chunked grounding is NaN-safe", () => {
  afterEach(() => {
    setChunkedHeightProvider(null);
    setChunkedFlatGround(null);
  });

  it("falls back to a finite base when the provider returns null (chunk mid-reload)", () => {
    setChunkedFlatGround(0);
    setChunkedHeightProvider(() => null);
    const g = groundedPosition(120, 240);
    expect(Number.isFinite(g.y)).toBe(true);
    expect(g.y).toBe(0);
    expect(groundHeightAt(120, 240)).toBe(0);
  });

  it("never emits NaN even if the provider itself returns NaN", () => {
    setChunkedFlatGround(0);
    setChunkedHeightProvider(() => NaN);
    expect(Number.isFinite(groundedPosition(5, 5).y)).toBe(true);
    expect(Number.isFinite(groundHeightAt(5, 5) as number)).toBe(true);
  });

  it("uses the sculpted height when the provider returns a finite value", () => {
    setChunkedFlatGround(0);
    setChunkedHeightProvider(() => 7.5);
    expect(groundedPosition(5, 5).y).toBe(7.5);
  });
});
