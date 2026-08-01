import { describe, expect, it } from "vitest";
import {
  groundRelativeOffset,
  groundRelativeOffsetFromSurface,
  hasAuthoredGroundRelativeOffset,
  positionAtGroundRelativeOffset,
} from "./tellus-grounding";

describe("authoritative ground-relative placement", () => {
  it("migrates missing legacy offsets to grounded instead of inferring intent from stale y", () => {
    expect(groundRelativeOffset(undefined)).toBe(0);
    expect(positionAtGroundRelativeOffset({ x: 3, y: 27, z: 4 }, 6, undefined)).toEqual({
      x: 3,
      y: 6,
      z: 4,
    });
  });

  it("keeps custom height relative to the live surface as terrain changes", () => {
    const placement = { x: 2, y: 0, z: 5 };

    expect(positionAtGroundRelativeOffset(placement, 4, 1.75).y).toBe(5.75);
    expect(positionAtGroundRelativeOffset(placement, 11, 1.75).y).toBe(12.75);
    expect(positionAtGroundRelativeOffset(placement, 11, -0.5).y).toBe(10.5);
  });

  it("keeps the same custom height while dragging across a different surface", () => {
    const moved = positionAtGroundRelativeOffset({ x: 18, y: 9, z: -12 }, 9, 2.25);

    expect(moved).toEqual({ x: 18, y: 11.25, z: -12 });
  });

  it("derives and clamps authored offsets at the editing boundary", () => {
    expect(groundRelativeOffsetFromSurface(7.5, 5)).toBe(2.5);
    expect(groundRelativeOffsetFromSurface(-100, 5)).toBe(-40);
    expect(groundRelativeOffsetFromSurface(100, 5)).toBe(40);
  });

  it("distinguishes an explicit custom height from grounded zero", () => {
    expect(hasAuthoredGroundRelativeOffset(0)).toBe(false);
    expect(hasAuthoredGroundRelativeOffset(undefined)).toBe(false);
    expect(hasAuthoredGroundRelativeOffset(0.02)).toBe(true);
    expect(hasAuthoredGroundRelativeOffset(-0.02)).toBe(true);
  });
});
