import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  HOME_PLAN_FIXTURES,
  lShapedHomePlanFixture,
  rectangularHomePlanFixture,
} from "./fixtures";
import { createCustomHomePlan } from "./custom-plan";
import { buildHomePlanModel } from "./plan-to-building";
import { validateHomePlan, type HomePlan } from "./plan-schema";

const countMeshes = (object: THREE.Object3D): number => {
  let count = 0;
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) count++;
  });
  return count;
};

const countColliders = (object: THREE.Object3D): number => {
  let count = 0;
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.userData.collide === true) count++;
  });
  return count;
};

const boundsFor = (object: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(object);

describe("home planner plan-to-building", () => {
  it("validates the starter fixtures", () => {
    for (const fixture of HOME_PLAN_FIXTURES) {
      expect(validateHomePlan(fixture), fixture.id).toEqual([]);
    }
  });

  it("builds rectangular plans as collidable wall and floor primitives", () => {
    const model = buildHomePlanModel(rectangularHomePlanFixture);
    expect(model.name).toBe("tellus-home-plan-fixture-rectangular-cabin");
    expect(countMeshes(model)).toBeGreaterThan(6);
    expect(countColliders(model)).toBeGreaterThanOrEqual(7);
    expect(model.userData.homePlan.stats).toMatchObject({
      levels: 1,
      walls: 4,
      openings: 2,
    });
  });

  it("preserves L-shaped footprint bounds", () => {
    const model = buildHomePlanModel(lShapedHomePlanFixture);
    const bounds = boundsFor(model);
    expect(bounds.min.x).toBeCloseTo(-5.12, 1);
    expect(bounds.max.x).toBeCloseTo(6.12, 1);
    expect(bounds.min.z).toBeCloseTo(-4.12, 1);
    expect(bounds.max.z).toBeCloseTo(4.12, 1);
    expect(countColliders(model)).toBeGreaterThanOrEqual(10);
  });

  it("creates measured custom plans with optional interior partitions", () => {
    const plan = createCustomHomePlan({
      id: "custom-test",
      label: "Custom Test",
      shape: "rectangle",
      widthM: 9.75,
      depthM: 7.31,
      floorHeightM: 3.05,
      wallThicknessM: 0.15,
      partitionEnabled: true,
      partitionOffsetM: 3.65,
      style: { wallColor: 0xd8c7a4, floorColor: 0x7f725f, trimColor: 0x4f3324 },
    });
    expect(validateHomePlan(plan)).toEqual([]);
    expect(plan.levels[0].walls.some((wall) => wall.kind === "interior")).toBe(true);
    const model = buildHomePlanModel(plan);
    expect(countColliders(model)).toBeGreaterThan(7);
    expect(model.userData.homePlan.stats).toMatchObject({
      levels: 1,
      walls: 5,
      openings: 3,
    });
  });

  it("creates multiple interior walls and wall-hosted openings", () => {
    const plan = createCustomHomePlan({
      id: "custom-rooms",
      label: "Custom Rooms",
      shape: "rectangle",
      widthM: 12,
      depthM: 9,
      floorHeightM: 3,
      wallThicknessM: 0.15,
      frontDoorWallId: "exterior-4",
      frontDoorCenterM: 3.5,
      rearWindowWallId: "exterior-2",
      rearWindowCenterM: 4,
      interiorWalls: [
        { id: "wall-a", orientation: "vertical", offsetM: 4, openingCenterM: 4.5, openingWidthM: 1.2 },
        { id: "wall-b", orientation: "vertical", offsetM: 8, openingCenterM: 4.5, openingWidthM: 1.2 },
      ],
      style: { wallColor: 0xd8c7a4, floorColor: 0x7f725f, trimColor: 0x4f3324 },
    });
    expect(validateHomePlan(plan)).toEqual([]);
    expect(plan.levels[0].walls.filter((wall) => wall.kind === "interior")).toHaveLength(2);
    expect(plan.levels[0].rooms).toHaveLength(3);
    expect(plan.levels[0].openings.find((opening) => opening.id === "front-door")?.wallId).toBe("exterior-4");
    expect(plan.levels[0].openings.find((opening) => opening.id === "rear-window")?.wallId).toBe("exterior-2");
    const model = buildHomePlanModel(plan);
    expect(countColliders(model)).toBeGreaterThan(10);
  });

  it("can build a closed wall shell when openings are disabled", () => {
    const withOpenings = buildHomePlanModel(rectangularHomePlanFixture, { includeOpenings: true });
    const closed = buildHomePlanModel(rectangularHomePlanFixture, { includeOpenings: false });
    expect(countColliders(closed)).toBeLessThan(countColliders(withOpenings));
    expect(countMeshes(closed)).toBeLessThan(countMeshes(withOpenings));
  });

  it("rejects openings that do not fit their host wall", () => {
    const invalid: HomePlan = {
      ...rectangularHomePlanFixture,
      levels: [
        {
          ...rectangularHomePlanFixture.levels[0],
          openings: [
            {
              id: "bad-door",
              wallId: "south",
              centerM: 99,
              widthM: 1,
              kind: "door",
            },
          ],
        },
      ],
    };
    expect(validateHomePlan(invalid).map((issue) => issue.path)).toContain("levels.0.openings.0.centerM");
    expect(() => buildHomePlanModel(invalid)).toThrow(/Invalid HomePlan/);
  });
});
