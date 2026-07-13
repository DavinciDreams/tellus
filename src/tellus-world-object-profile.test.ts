import { describe, expect, it } from "vitest";
import {
  buildWorldThingRuntimeProfile,
  defaultScaleForRealisticKind,
  normalizeWorldThingAssetIdentity,
  STANDARD_HUMANOID_HEIGHT,
  worldThingVehicleMode,
  worldThingTargetHeight,
} from "./tellus-world-object-profile";
import type { GeneratedThing } from "./tellus-types";

const thing = (overrides: Partial<GeneratedThing>): GeneratedThing => ({
  id: "thing-test",
  kind: "object",
  prompt: "object",
  creatorId: "visitor",
  position: { x: 1, y: 2, z: 3 },
  rotationY: 0,
  scale: 1,
  color: 0xffffff,
  ...overrides,
});

describe("world object runtime profile", () => {
  it("resolves immutable asset-store identity ahead of cached model urls", () => {
    expect(
      normalizeWorldThingAssetIdentity(
        "https://3d.flobots.xyz/api/view/old-title",
        "6a20e488cf0cffae65faec69",
      ),
    ).toEqual({
      assetStoreModelId: "6a20e488cf0cffae65faec69",
      modelUrl: "/api/assets/model/6a20e488cf0cffae65faec69/game-optimized",
      stableKey: "asset-store:6a20e488cf0cffae65faec69",
      source: "asset-store",
    });
  });

  it("keeps tiny flora short and buildings larger than the avatar", () => {
    expect(worldThingTargetHeight(thing({ kind: "flower", prompt: "yellow wildflower" }))).toBeLessThan(1);
    expect(worldThingTargetHeight(thing({ kind: "tree", prompt: "magic tree" }))).toBeGreaterThan(
      STANDARD_HUMANOID_HEIGHT,
    );
    expect(worldThingTargetHeight(thing({ prompt: "tavern building" }))).toBeGreaterThan(
      STANDARD_HUMANOID_HEIGHT,
    );
    expect(defaultScaleForRealisticKind("object", "tavern building")).toBeGreaterThan(1);
  });

  it("normalizes humanoid generated assets to the standard avatar ruler", () => {
    expect(worldThingTargetHeight(thing({ prompt: "friendly humanoid villager" }))).toBeCloseTo(
      STANDARD_HUMANOID_HEIGHT,
    );
    expect(worldThingTargetHeight(thing({ prompt: "tiny human NPC", scale: 0.5 }))).toBeCloseTo(
      STANDARD_HUMANOID_HEIGHT * 0.5,
    );
    expect(worldThingTargetHeight(thing({ kind: "tree", prompt: "japanese maple" }))).toBeGreaterThan(
      STANDARD_HUMANOID_HEIGHT * 2,
    );
  });

  it("uses real-world semantic rulers for common fauna, vessels, monuments, and cottages", () => {
    expect(worldThingTargetHeight(thing({ kind: "animal", prompt: "Golden Retriever dog" }))).toBeCloseTo(0.85);
    expect(worldThingTargetHeight(thing({ kind: "animal", prompt: "Pacific white-sided dolphin" }))).toBeCloseTo(2.2);
    expect(worldThingTargetHeight(thing({ kind: "animal", prompt: "Humpback whale" }))).toBeCloseTo(8);
    expect(worldThingTargetHeight(thing({ prompt: "wooden sailing ship" }))).toBeCloseTo(7);
    expect(worldThingTargetHeight(thing({ kind: "stone", prompt: "Olmec colossal head" }))).toBeCloseTo(2.8);
    expect(worldThingTargetHeight(thing({ prompt: "rustic cottage" }))).toBeCloseTo(5.4);
  });

  it("classifies placement and mount controller from one shared contract", () => {
    const horse = thing({
      kind: "animal",
      prompt: "Stylized Saddled Chestnut Horse",
      position: { x: 0, y: 4, z: 0 },
    });
    const profile = buildWorldThingRuntimeProfile(horse, {
      dimensions: { radius: 1.2, height: 2.1 },
      groundY: 4,
    });
    expect(profile.placementMode).toBe("grounded");
    expect(profile.controllerKind).toBe("quadruped");
    expect(profile.seatHeight).toBeGreaterThan(0.6);
    expect(profile.seatHeight).toBeLessThan(1);
    expect(profile.collisionRadius).toBeGreaterThan(0.45);
  });

  it("does not classify mountain dogs as mounts", () => {
    expect(
      worldThingVehicleMode(
        thing({
          kind: "animal",
          prompt: "Realistic Bernese Mountain Dog companion",
        }),
      ),
    ).toBeNull();
    expect(
      worldThingVehicleMode(
        thing({
          kind: "animal",
          prompt: "Rideable mountain horse",
        }),
      ),
    ).toBe("ground");
  });

  it("preserves deliberate vertical offsets as elevated placement", () => {
    const profile = buildWorldThingRuntimeProfile(
      thing({ prompt: "floating crystal", position: { x: 0, y: 7, z: 0 } }),
      { groundY: 4 },
    );
    expect(profile.placementMode).toBe("elevated");
    expect(profile.hasManualGroundOffset).toBe(true);
  });
});
