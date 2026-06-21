import { describe, expect, it } from "vitest";
import {
  buildWorldThingRuntimeProfile,
  defaultScaleForRealisticKind,
  normalizeWorldThingAssetIdentity,
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
    expect(worldThingTargetHeight(thing({ kind: "tree", prompt: "magic tree" }))).toBeGreaterThan(3);
    expect(worldThingTargetHeight(thing({ prompt: "tavern building" }))).toBeGreaterThan(3);
    expect(defaultScaleForRealisticKind("object", "tavern building")).toBeGreaterThan(1);
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

  it("preserves deliberate vertical offsets as elevated placement", () => {
    const profile = buildWorldThingRuntimeProfile(
      thing({ prompt: "floating crystal", position: { x: 0, y: 7, z: 0 } }),
      { groundY: 4 },
    );
    expect(profile.placementMode).toBe("elevated");
    expect(profile.hasManualGroundOffset).toBe(true);
  });
});
