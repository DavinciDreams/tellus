import { describe, expect, it } from "vitest";
import { planAutomaticBuildingInteriorDoor } from "./tellus-building-interiors";

describe("automatic building interior doors", () => {
  it("places a stable anchored door on a procedural building's authored front", () => {
    const plan = planAutomaticBuildingInteriorDoor({
      worldId: "chunked-64-main",
      thingId: "shrine-Example 42",
      buildingLabel: "Stone cottage",
      position: { x: 10, y: 3, z: -4 },
      rotationY: Math.PI / 2,
      fittedDepth: 8,
    });

    expect(plan?.interiorWorldId).toBe("interior-chunked-64-main-shrine-example-42");
    expect(plan?.label).toBe("Stone cottage door");
    expect(plan?.anchorOffset).toEqual({ x: 0, y: 0, z: 4.28 });
    expect(plan?.position.x).toBeCloseTo(5.72);
    expect(plan?.position.y).toBe(3);
    expect(plan?.position.z).toBeCloseTo(-4);
    expect(plan?.rotationY).toBe(0);
  });

  it("keeps position and anchorOffset describing the same point under rotation", () => {
    // portalAnchorPosition prefers anchorOffset over position, so the two must agree or the
    // rendered door silently diverges from the planned one.
    const rotateXZ = (point: { x: number; y: number; z: number }, radians: number) => ({
      x: point.x * Math.cos(radians) - point.z * Math.sin(radians),
      y: point.y,
      z: point.x * Math.sin(radians) + point.z * Math.cos(radians),
    });
    const position = { x: 10, y: 2, z: -5 };
    for (const rotationY of [0, 0.5, Math.PI / 2, 3, -2.2]) {
      const plan = planAutomaticBuildingInteriorDoor({
        worldId: "main",
        thingId: "cabin-1",
        buildingLabel: "Cabin",
        position,
        rotationY,
        fittedDepth: 6,
      });
      const worldOffset = rotateXZ(plan!.anchorOffset, rotationY);
      expect(position.x + worldOffset.x).toBeCloseTo(plan!.position.x, 6);
      expect(position.z + worldOffset.z).toBeCloseTo(plan!.position.z, 6);
    }
  });

  it("keeps generated interior ids backend-safe and bounded", () => {
    const plan = planAutomaticBuildingInteriorDoor({
      worldId: `World ${"x".repeat(100)}`,
      thingId: `Thing ${"y".repeat(100)}`,
      buildingLabel: "House",
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      fittedDepth: 6,
    });

    expect(plan?.interiorWorldId).toMatch(/^interior-[a-z0-9_-]+$/);
    expect(plan?.interiorWorldId.length).toBeLessThanOrEqual(96);

    const sibling = planAutomaticBuildingInteriorDoor({
      worldId: `World ${"x".repeat(100)}`,
      thingId: `Thing ${"z".repeat(100)}`,
      buildingLabel: "House",
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      fittedDepth: 6,
    });
    expect(sibling?.interiorWorldId).not.toBe(plan?.interiorWorldId);
  });

  it("refuses invalid fitted geometry instead of creating a misplaced door", () => {
    expect(planAutomaticBuildingInteriorDoor({
      worldId: "main",
      thingId: "house-1",
      buildingLabel: "House",
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      fittedDepth: 0,
    })).toBeNull();
  });
});
