import { describe, expect, it } from "vitest";
import { DEER_WILDLIFE_PROFILE, wildlifeClipNameForIntent } from "./tellus-wildlife-species";

describe("deer wildlife species profile", () => {
  const clips = [
    "Attack_Headbutt", "Attack_Kick", "Gallop", "Gallop_Jump", "Idle", "Idle_2",
    "Idle_Headlow", "Idle_HitReact1", "Jump_toIdle", "Walk",
  ];

  it("binds the verified production asset and locomotion clips", () => {
    expect(DEER_WILDLIFE_PROFILE.modelUrl).toBe("/wildlife/deer/stag.glb");
    expect(DEER_WILDLIFE_PROFILE.fallbackAssetStoreId).toBe("6a211103cf0cffae65faeedd");
    expect(wildlifeClipNameForIntent("deer", "idle", clips)).toBe("Idle");
    expect(wildlifeClipNameForIntent("deer", "walk", clips)).toBe("Walk");
    expect(wildlifeClipNameForIntent("deer", "run", clips)).toBe("Gallop");
  });

  it("prefers the Stag eating clip for grazing presentation", () => {
    expect(wildlifeClipNameForIntent("deer", "graze", ["Idle_Headlow", "Eating"])).toBe("Eating");
  });
});
