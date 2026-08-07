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
    expect(plan?.position.x).toBeCloseTo(14.28);
    expect(plan?.position.y).toBe(3);
    expect(plan?.position.z).toBeCloseTo(-4);
    expect(plan?.rotationY).toBe(0);
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
