import { describe, expect, it } from "vitest";
import { agentViewCameraPose } from "./agent-view-camera";

describe("agentViewCameraPose", () => {
  it("faces the world origin at yaw zero and applies avatar eye height", () => {
    const pose = agentViewCameraPose({ x: 10, y: 2, z: 0 }, 2, 0, 0);
    expect(pose.eye).toEqual({ x: 10, y: 6.8, z: 0 });
    expect(pose.target.x).toBeCloseTo(-2);
    expect(pose.target.y).toBeCloseTo(6.8);
    expect(pose.target.z).toBeCloseTo(0);
  });

  it("rotates deterministically around the visitor and clamps pitch", () => {
    const left = agentViewCameraPose({ x: 10, y: 0, z: 0 }, 1, 90, 90);
    expect(left.target.x).toBeCloseTo(10);
    expect(left.target.z).toBeCloseTo(-10.3923, 3);
    expect(left.target.y).toBeCloseTo(8.4, 3);
  });

  it("uses a stable +X heading at the world origin", () => {
    const pose = agentViewCameraPose({ x: 0, y: 0, z: 0 }, Number.NaN, 0, 0);
    expect(pose.eye.y).toBeCloseTo(2.4);
    expect(pose.target.x).toBeCloseTo(12);
    expect(pose.target.z).toBeCloseTo(0);
  });
});
