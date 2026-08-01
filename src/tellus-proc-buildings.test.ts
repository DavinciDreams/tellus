import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildProceduralModel,
  makeProceduralBuildingModelUrl,
  parseProceduralModelUrl,
} from "./tellus-procedural-assets";
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
      verticalOffset: 0,
      modelUrl: makeProceduralBuildingModelUrl("building-castle", 8),
      generationStatus: "ready",
    };
    expect(worldThingTargetHeight(thing)).toBe(17);
    expect(buildWorldThingRuntimeProfile(thing).collisionRadius).toBeGreaterThan(4.2);
  });
});
