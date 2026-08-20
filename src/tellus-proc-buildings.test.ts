import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildProceduralModel,
  makeCustomHomePlanModelUrl,
  makeHomePlanModelUrl,
  makeProceduralBuildingModelUrl,
  parseProceduralModelUrl,
} from "./tellus-procedural-assets";
import { createCustomHomePlan } from "./home-planner";
import {
  PROCEDURAL_BUILDING_CATALOG,
  makeProceduralBuildingArchetypeId,
} from "./tellus-proc-buildings";
import { buildWorldThingRuntimeProfile, worldThingTargetHeight } from "./tellus-world-object-profile";
import type { GeneratedThing } from "./tellus-types";

const countMeshes = (model: THREE.Object3D): number => {
  let count = 0;
  model.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) count += 1;
  });
  return count;
};

const countColliders = (model: THREE.Object3D): number => {
  let count = 0;
  model.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && obj.userData.collide) count += 1;
  });
  return count;
};

describe("procedural building assets", () => {
  it("parses building material, lighting, roof, and seed options", () => {
    const url = makeProceduralBuildingModelUrl("building-bank", 42, {
      material: "stone-rubble",
      lighting: "lantern",
      roof: false,
    });
    const parsed = parseProceduralModelUrl(url);
    expect(parsed?.archetypeId).toBe("building-bank");
    expect(parsed?.seed).toBe(42);
    expect(parsed?.building).toEqual({
      recipeId: "bank",
      material: "stone-rubble",
      lighting: "lantern",
      roof: false,
    });
  });

  it("builds every ported building preset as a collidable model", () => {
    expect(PROCEDURAL_BUILDING_CATALOG).toHaveLength(16);
    for (const recipe of PROCEDURAL_BUILDING_CATALOG) {
      const archetypeId = makeProceduralBuildingArchetypeId(recipe.id);
      const url = makeProceduralBuildingModelUrl(archetypeId, 1234, {
        material: "auto",
        lighting: "warm",
        roof: true,
      });
      const model = buildProceduralModel(url);
      expect(model, recipe.id).not.toBeNull();
      expect(countMeshes(model!), recipe.id).toBeGreaterThan(4);
      expect(countColliders(model!), recipe.id).toBeGreaterThan(0);
    }
  });

  it("rejects unknown building archetypes", () => {
    expect(parseProceduralModelUrl("procedural://building-not-a-real-one?seed=1")).toBeNull();
  });

  it("parses and builds home-plan fixtures as collidable procedural models", () => {
    const url = makeHomePlanModelUrl("l-shaped-house", 99);
    const parsed = parseProceduralModelUrl(url);
    expect(parsed?.archetypeId).toBe("home-plan-l-shaped-house");
    expect(parsed?.seed).toBe(99);
    expect(parsed?.homePlan).toEqual({ fixtureId: "l-shaped-house" });
    const model = buildProceduralModel(url);
    expect(model).not.toBeNull();
    expect(countMeshes(model!)).toBeGreaterThan(8);
    expect(countColliders(model!)).toBeGreaterThan(8);
  });

  it("parses and builds custom measured home plans as procedural models", () => {
    const plan = createCustomHomePlan({
      id: "my-house",
      label: "My House",
      shape: "l-shape",
      widthM: 10,
      depthM: 8,
      wingWidthM: 4,
      wingDepthM: 4,
      floorHeightM: 3,
      wallThicknessM: 0.16,
      style: { wallColor: 0xcfc2a5, floorColor: 0x83715a, trimColor: 0x5a4330 },
    });
    const url = makeCustomHomePlanModelUrl(plan, 77);
    const parsed = parseProceduralModelUrl(url);
    expect(parsed?.archetypeId).toBe("home-plan-custom");
    expect(parsed?.seed).toBe(77);
    expect(parsed?.homePlan?.plan?.label).toBe("My House");
    const model = buildProceduralModel(url);
    expect(model).not.toBeNull();
    expect(countMeshes(model!)).toBeGreaterThan(6);
    expect(countColliders(model!)).toBeGreaterThan(6);
  });

  it("uses recipe-aware target heights and building-scale collision", () => {
    const thing: GeneratedThing = {
      id: "castle",
      kind: "object",
      prompt: "Castle",
      creatorId: "visitor",
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      scale: 1,
      color: 0xffffff,
      modelUrl: makeProceduralBuildingModelUrl("building-castle", 8),
      generationStatus: "ready",
    };
    expect(worldThingTargetHeight(thing)).toBe(17);
    expect(buildWorldThingRuntimeProfile(thing).collisionRadius).toBeGreaterThan(4.2);
  });

  it("uses building-scale profiles for home-plan fixture placements", () => {
    const thing: GeneratedThing = {
      id: "home-plan",
      kind: "object",
      prompt: "L-Shaped House",
      creatorId: "visitor",
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      scale: 1,
      color: 0xffffff,
      modelUrl: makeHomePlanModelUrl("l-shaped-house", 8),
      generationStatus: "ready",
    };
    expect(worldThingTargetHeight(thing)).toBeGreaterThan(3);
    expect(buildWorldThingRuntimeProfile(thing).collisionRadius).toBeGreaterThan(1);
  });
});
