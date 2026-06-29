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

  it("populates the indoor furniture browse tab from furniture and props categories", async () => {
    runtimeConfig.worldApiBase = "https://hyades.example";
    const fetchMock = vi.fn(async (url: string) => {
      const category = new URL(url).searchParams.get("category");
      return new Response(
        JSON.stringify({
          has_next: category === "props",
          total: category === "props" ? 2 : 1,
          models:
            category === "props"
              ? [
                  { id: "lamp-1", name: "Brass Desk Lamp", viewable: true },
                  { id: "chair-1", name: "Duplicate Chair", viewable: true },
                ]
              : [{ id: "chair-1", name: "Velvet Lounge Chair", viewable: true }],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await browseAssetLibrary("", 1, "newest", 24, "furniture");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://hyades.example/api/assets/models/browse?page=1&per_page=24&sort=newest&category=furniture",
      { cache: "no-store" },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://hyades.example/api/assets/models/browse?page=1&per_page=24&sort=newest&category=props",
      { cache: "no-store" },
    );
    expect(result.hasNext).toBe(true);
    expect(result.total).toBe(3);
    expect(result.models.map((model) => model.id)).toEqual(["chair-1", "lamp-1"]);
  });

  it("lets typed asset searches override the furniture category fanout", async () => {
    runtimeConfig.worldApiBase = "https://hyades.example";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          has_next: false,
          total: 1,
          models: [{ id: "chair-1", name: "Velvet Lounge Chair", viewable: true }],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await browseAssetLibrary("chair", 1, "downloads", 8, "furniture");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hyades.example/api/assets/models/browse?page=1&per_page=8&sort=downloads&search=chair",
      { cache: "no-store" },
    );
    expect(result.models.map((model) => model.id)).toEqual(["chair-1"]);
  });

  it("can filter asset browsing to animated GLBs from the direct endpoint", async () => {
    runtimeConfig.worldApiBase = "https://hyades.example";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              id: "dog-1",
              name: "Golden Retriever",
              file_format: "glb",
              has_thumbnail: true,
              has_game_optimized: true,
            },
            {
              id: "bot-1",
              name: "Robot VRM",
              file_format: "vrm",
            },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await browseAssetLibrary("", 1, "newest", 24, "animated");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hyades.example/api/assets/animated-models",
      { cache: "no-store" },
    );
    expect(result.total).toBe(1);
    expect(result.models).toEqual([
      expect.objectContaining({
        id: "dog-1",
        name: "Golden Retriever",
        file_format: "glb",
        hasThumbnail: true,
        hasGameOptimized: true,
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
