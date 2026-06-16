import { describe, expect, it } from "vitest";
import { buildAgentMapLocation, resolveAgentMoveTarget } from "./tellus-agent-location";
import type { Vec3 } from "./tellus-types";

const ground = (x: number, z: number): Vec3 => ({ x, y: 1, z });

describe("buildAgentMapLocation", () => {
  it("exposes world id, rounded coordinates, map axes, and classic-world bounds", () => {
    const location = buildAgentMapLocation({
      worldId: "large-garden",
      position: { x: 12.345, y: 3.2, z: -7.891 },
      worldScale: 3,
      worldRadius: 216,
      oceanRadius: 720,
      terrainType: "meadow",
      terrainHeight: 3.1,
      pondCenter: { x: 54, y: 0, z: -36 },
      chunkSpan: 96,
    });

    expect(location.worldId).toBe("large-garden");
    expect(location.coordinates).toEqual({
      x: 12.35,
      y: 3.2,
      z: -7.89,
      units: "world units",
    });
    expect(location.mapLocation.origin).toBe("world center");
    expect(location.mapLocation.axes.z).toContain("south positive");
    expect(location.world).toMatchObject({ id: "large-garden", scale: 3, radius: 216 });
  });

  it("uses chunk dimensions for chunked-world map bounds", () => {
    const location = buildAgentMapLocation({
      worldId: "chunked-main",
      position: { x: 144, y: 0, z: 96 },
      worldScale: 2,
      worldRadius: 144,
      oceanRadius: 480,
      terrainType: "grass",
      terrainHeight: 0,
      pondCenter: { x: 36, y: 0, z: -24 },
      chunkedWorldChunks: { w: 4, h: 3 },
      chunkSpan: 96,
    });

    expect(location.mapLocation.origin).toBe("northwest corner");
    expect(location.mapLocation.bounds).toEqual({ minX: 0, minZ: 0, maxX: 384, maxZ: 288 });
    expect(location.world.chunks).toEqual({ w: 4, h: 3 });
  });
});

describe("resolveAgentMoveTarget", () => {
  it("keeps existing dx/dz movement with per-axis clamping", () => {
    expect(
      resolveAgentMoveTarget({ dx: 20, dz: -3 }, { x: 1, y: 0, z: 2 }, 8, ground).position,
    ).toEqual({ x: 9, y: 1, z: -1 });
  });

  it("supports compass direction movement", () => {
    expect(
      resolveAgentMoveTarget({ north: 3, east: 2 }, { x: 10, y: 0, z: 10 }, 8, ground).position,
    ).toEqual({ x: 12, y: 1, z: 7 });
    expect(
      resolveAgentMoveTarget({ direction: "southwest", distance: 4 }, { x: 10, y: 0, z: 10 }, 8, ground)
        .position,
    ).toEqual({ x: 6, y: 1, z: 14 });
  });

  it("steps toward absolute map coordinates and reports remaining distance", () => {
    const result = resolveAgentMoveTarget(
      { target: { x: 30, z: 40 } },
      { x: 0, y: 0, z: 0 },
      10,
      ground,
    );

    expect(result.position).toEqual({ x: 6, y: 1, z: 8 });
    expect(result.target).toEqual({ x: 30, z: 40 });
    expect(result.distanceRemaining).toBe(40);
    expect(result.reached).toBe(false);
  });

  it("lands directly on nearby absolute coordinates", () => {
    const result = resolveAgentMoveTarget(
      { x: 3, z: 4 },
      { x: 0, y: 0, z: 0 },
      8,
      ground,
    );

    expect(result.position).toEqual({ x: 3, y: 1, z: 4 });
    expect(result.distanceRemaining).toBe(0);
    expect(result.reached).toBe(true);
  });
});
