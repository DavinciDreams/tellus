import { describe, expect, it } from "vitest";
import {
  buildWorldThingRuntimeProfile,
  defaultScaleForRealisticKind,
  inferAssetVehicleMode,
  normalizeWorldThingAssetIdentity,
  seatPositionForWorldThing,
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
  verticalOffset: overrides.verticalOffset ?? 0,
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
      dimensions: { radius: 1.2, height: 2.1, width: 1.1, depth: 3.2 },
    });
    expect(profile.placementMode).toBe("grounded");
    expect(profile.controllerKind).toBe("quadruped");
    expect(profile.seatHeight).toBeGreaterThan(1);
    expect(profile.seatHeight).toBeLessThan(1.3);
    expect(profile.seatOffset.z).toBeLessThan(0);
    expect(profile.collisionRadius).toBeGreaterThan(0.45);
  });

  it("rotates the full local seat anchor with the mount instead of pinning every rider to its center", () => {
    const horse = thing({
      kind: "animal",
      prompt: "Stylized Saddled Chestnut Horse",
      position: { x: 10, y: 2, z: 20 },
      rotationY: Math.PI / 2,
    });
    const profile = buildWorldThingRuntimeProfile(horse, {
      dimensions: { radius: 1.6, height: 2.1, width: 1.1, depth: 3.2 },
      mounted: true,
    });
    const position = seatPositionForWorldThing(horse, profile, { x: 0.2, y: 0, z: -0.1 });

    expect(profile.placementMode).toBe("mounted");
    expect(position.x).toBeCloseTo(9.944);
    expect(position.y).toBeCloseTo(3.176);
    expect(position.z).toBeCloseTo(19.9);
  });

  it("keeps an equine seat anchor proportional when the rendered mount is resized", () => {
    const horse = thing({ kind: "animal", prompt: "Saddled Horse" });
    const normal = buildWorldThingRuntimeProfile(horse, {
      dimensions: { radius: 1.6, height: 2, width: 1, depth: 3 },
    });
    const resized = buildWorldThingRuntimeProfile(horse, {
      dimensions: { radius: 3.2, height: 4, width: 2, depth: 6 },
    });

    expect(resized.seatOffset.x).toBeCloseTo(normal.seatOffset.x * 2);
    expect(resized.seatOffset.y).toBeCloseTo(normal.seatOffset.y * 2);
    expect(resized.seatOffset.z).toBeCloseTo(normal.seatOffset.z * 2);
  });

  it("uses different semantic seat anchors for enclosed vehicles and boats", () => {
    const car = buildWorldThingRuntimeProfile(thing({ prompt: "small ground car", vehicleMode: "ground" }), {
      dimensions: { radius: 1.2, height: 1.6, depth: 3.8 },
    });
    const boat = buildWorldThingRuntimeProfile(thing({ prompt: "wooden sailing boat" }), {
      dimensions: { radius: 2.5, height: 2.4, depth: 7 },
    });

    expect(car.seatOffset.z).toBeGreaterThan(0);
    expect(car.seatHeight).toBeLessThan(1);
    expect(boat.seatOffset.z).toBeLessThan(0);
    expect(boat.seatHeight).toBeGreaterThan(car.seatHeight);
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

  it("recognizes saddled deer and harnessed bears without making every wild animal rideable", () => {
    expect(worldThingVehicleMode(thing({ kind: "animal", prompt: "Fantasy Reindeer with Saddle & Harness" }))).toBe("ground");
    expect(worldThingVehicleMode(thing({ kind: "animal", prompt: "Brown Bear with Riding Harness" }))).toBe("ground");
    expect(worldThingVehicleMode(thing({ kind: "animal", prompt: "Wild brown bear" }))).toBeNull();
  });

  it("persists an explicit mode inferred from asset-store tags", () => {
    expect(
      inferAssetVehicleMode({
        name: "Fantasy Reindeer",
        tags: ["animal", "saddle", "riding mount"],
        assetTypes: ["rigged", "animated"],
      }),
    ).toBe("ground");
    expect(worldThingVehicleMode(thing({ kind: "animal", prompt: "Unnamed creature", vehicleMode: "ground" }))).toBe("ground");
  });

  it("classifies porpoises as water actors", () => {
    expect(worldThingVehicleMode(thing({ kind: "animal", prompt: "Harbor Porpoise" }))).toBe("water");
  });

  it("preserves deliberate vertical offsets as elevated placement", () => {
    const profile = buildWorldThingRuntimeProfile(
      thing({
        prompt: "floating crystal",
        position: { x: 0, y: 7, z: 0 },
        verticalOffset: 3,
      }),
    );
    expect(profile.placementMode).toBe("elevated");
    expect(profile.hasManualGroundOffset).toBe(true);
  });
});
