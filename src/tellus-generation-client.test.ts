import { afterEach, describe, expect, it, vi } from "vitest";
import { browseAssetLibrary } from "./tellus-generation-client";
import { runtimeConfig } from "./tellus-runtime-config";

describe("asset library browsing", () => {
  const originalWorldApiBase = runtimeConfig.worldApiBase;

  afterEach(() => {
    runtimeConfig.worldApiBase = originalWorldApiBase;
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
});
