import { describe, expect, it } from "vitest";
import { WildlifeInterpolationBuffer } from "./tellus-wildlife-interpolation";
import type { WildlifePatch } from "./world-protocol";

const patch = (seq: number, timeMs: number, x: number, revision = seq): WildlifePatch => ({
  type: "wildlife.patch",
  seq,
  serverTime: new Date(timeMs).toISOString(),
  herdId: "herd-1",
  animals: [{
    id: "deer-1",
    position: { x, y: 0, z: 0 },
    rotationY: seq === 1 ? Math.PI - 0.1 : -Math.PI + 0.1,
    state: "wander",
    animationIntent: "walk",
    speedMetersPerSecond: 1,
    revision,
  }],
});

describe("WildlifeInterpolationBuffer", () => {
  it("interpolates position and yaw across the shortest arc", () => {
    const buffer = new WildlifeInterpolationBuffer({ interpolationDelayMs: 100 });
    buffer.applyPatch(patch(1, 1_000, 0));
    buffer.applyPatch(patch(2, 1_200, 2));
    const pose = buffer.sample("deer-1", 1_200);
    expect(pose?.position.x).toBeCloseTo(1);
    expect(Math.abs(pose?.rotationY ?? 0)).toBeCloseTo(Math.PI);
    expect(pose?.extrapolated).toBe(false);
  });

  it("bounds extrapolation and ignores duplicate or stale herd sequences", () => {
    const buffer = new WildlifeInterpolationBuffer({
      interpolationDelayMs: 0,
      maxExtrapolationMs: 250,
    });
    expect(buffer.applyPatch(patch(1, 1_000, 0))).toBe(true);
    expect(buffer.applyPatch(patch(2, 1_200, 2))).toBe(true);
    expect(buffer.applyPatch(patch(2, 1_300, 99, 3))).toBe(false);
    const pose = buffer.sample("deer-1", 2_000);
    expect(pose?.position.x).toBeCloseTo(4.5);
    expect(pose?.extrapolated).toBe(true);
  });

  it("snaps teleports instead of sweeping across the world", () => {
    const buffer = new WildlifeInterpolationBuffer({
      interpolationDelayMs: 100,
      teleportDistanceMeters: 5,
    });
    buffer.applyPatch(patch(1, 1_000, 0));
    buffer.applyPatch(patch(2, 1_200, 20));
    expect(buffer.sample("deer-1", 1_200)?.position.x).toBe(20);
  });
});
