import { describe, expect, it } from "vitest";
import {
  ASSET_SURFACE_CONTEXTS,
  inferAssetSurfaceContexts,
  rankReusableAssets,
} from "./tellus-asset-reuse";
import type { AssetLibraryModel } from "./tellus-types";

describe("asset reuse helpers", () => {
  it("infers surface contexts from prompt text", () => {
    expect(inferAssetSurfaceContexts("place a mossy shelf inside the library")).toEqual([
      "interior",
      "surface",
      "furniture",
    ]);
  });

  it("ranks matching models and dedupes by modelUrl", () => {
    const models: AssetLibraryModel[] = [
      {
        id: "a",
        name: "Library Shelf",
        description: "wooden indoor shelf with books",
        modelUrl: "/models/shared.glb",
        tags: ["interior", "furniture"],
      },
      {
        id: "b",
        name: "Duplicate Shelf",
        description: "same asset",
        modelUrl: "/models/shared.glb",
        tags: ["interior"],
      },
      {
        id: "c",
        name: "Forest Rock",
        description: "outdoor stone",
        modelUrl: "/models/rock.glb",
        tags: ["environment"],
      },
    ];

    const ranked = rankReusableAssets("indoor library shelf", models, "object", 4);

    expect(ranked.map((model) => model.id)).toEqual(["a"]);
    expect(ranked[0].reuseReason).toContain("interior");
  });

  it("exports the accepted context values for external parsers", () => {
    expect(ASSET_SURFACE_CONTEXTS).toContain("fauna");
    expect(ASSET_SURFACE_CONTEXTS).toContain("environment");
  });
});
