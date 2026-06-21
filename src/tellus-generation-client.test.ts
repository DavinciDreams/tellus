import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearGeneratedAssetManifestCacheForTests,
  generatedAssetManifestAssetIds,
  browseAssetLibrary,
  generatedAssetManifestEntries,
  generatedAssetManifestModelUrls,
} from "./tellus-generation-client";
import { runtimeConfig } from "./tellus-runtime-config";

describe("asset library browsing", () => {
  const originalWorldApiBase = runtimeConfig.worldApiBase;

  afterEach(() => {
    runtimeConfig.worldApiBase = originalWorldApiBase;
    clearGeneratedAssetManifestCacheForTests();
    vi.unstubAllGlobals();
  });

  it("maps the Hyades asset-store browse shape into renderable cards", async () => {
    runtimeConfig.worldApiBase = "https://hyades.example";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          has_next: true,
          total: 12,
          models: [
            {
              id: "asset-1",
              name: "Rustic Thatched Roof Cottage",
              file_format: "glb",
              has_thumbnail: true,
              has_game_optimized: true,
              tags: ["building", "cottage"],
              viewable: true,
            },
            {
              id: "asset-2",
              name: "Broken Draft",
              viewable: false,
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await browseAssetLibrary("", 1, "newest", 24, "building");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hyades.example/api/assets/models/browse?page=1&per_page=24&sort=newest&category=building",
      { cache: "no-store" },
    );
    expect(result.hasNext).toBe(true);
    expect(result.total).toBe(12);
    expect(result.models).toEqual([
      expect.objectContaining({
        id: "asset-1",
        name: "Rustic Thatched Roof Cottage",
        hasThumbnail: true,
        hasGameOptimized: true,
        source: "asset-library",
      }),
    ]);
  });

  it("caches a missing generated-asset manifest as empty", async () => {
    runtimeConfig.worldApiBase = "https://hyades.example";
    const fetchMock = vi.fn(async () => new Response("missing", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generatedAssetManifestEntries()).resolves.toEqual([]);
    await expect(generatedAssetManifestEntries()).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/generated-assets/manifest.json",
      { cache: "no-store" },
    );
  });

  it("prefers immutable asset-store ids when mapping generated manifest cards", async () => {
    runtimeConfig.worldApiBase = "https://hyades.example";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            id: "thing-1",
            prompt: "Lisa Tavern",
            modelUrl: "/generated-assets/lisa-tavern.glb",
            assetStoreModelId: "asset-123",
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const entries = await generatedAssetManifestEntries();
    const modelUrls = await generatedAssetManifestModelUrls();
    const assetIds = await generatedAssetManifestAssetIds();

    expect(entries[0]).toEqual(expect.objectContaining({ assetStoreModelId: "asset-123" }));
    expect(modelUrls.get("thing-1")).toBe("/api/assets/model/asset-123/game-optimized");
    expect(assetIds.get("thing-1")).toBe("asset-123");
  });
});
