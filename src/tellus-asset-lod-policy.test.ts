import { describe, expect, it } from "vitest";
import { assetRenderLodLevel, isLandmarkAssetForLod } from "./tellus-asset-lod-policy";

describe("asset render LOD policy", () => {
  it("keeps Tellus island buildings and pavilions at full detail across the visible island", () => {
    expect(isLandmarkAssetForLod("object", "Stained Glass Fantasy Gazebo Pavilion")).toBe(true);
    expect(
      assetRenderLodLevel({
        kind: "object",
        prompt: "Stained Glass Fantasy Gazebo Pavilion",
        distance: 180,
        worldTemplate: "tellus",
        isChunkedWorld: true,
        viewerFacing: 0.8,
      }),
    ).toBe(0);
  });

  it("lets landmarks behind the viewer downshift sooner than landmarks in front", () => {
    expect(
      assetRenderLodLevel({
        kind: "object",
        prompt: "Stained Glass Fantasy Gazebo Pavilion",
        distance: 230,
        worldTemplate: "tellus",
        isChunkedWorld: true,
        viewerFacing: 0.8,
      }),
    ).toBe(0);
    expect(
      assetRenderLodLevel({
        kind: "object",
        prompt: "Stained Glass Fantasy Gazebo Pavilion",
        distance: 230,
        worldTemplate: "tellus",
        isChunkedWorld: true,
        viewerFacing: -0.7,
      }),
    ).toBe(1);
  });

  it("lets non-landmark clutter downshift closer than buildings", () => {
    expect(
      assetRenderLodLevel({
        kind: "object",
        prompt: "small crate",
        distance: 130,
        worldTemplate: "tellus",
        isChunkedWorld: true,
        viewerFacing: 0.8,
      }),
    ).toBe(1);
  });
});
