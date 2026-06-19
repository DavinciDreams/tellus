import { afterEach, describe, expect, it, vi } from "vitest";
import { AVATAR_CATALOG, loadAvatarCatalog } from "./tellus-avatar-catalog";
import { runtimeConfig } from "./tellus-runtime-config";

describe("avatar catalog loading", () => {
  const originalWorldApiBase = runtimeConfig.worldApiBase;

  afterEach(() => {
    runtimeConfig.worldApiBase = originalWorldApiBase;
    vi.unstubAllGlobals();
  });

  it("does not cache the fallback catalog before runtime config is loaded", async () => {
    runtimeConfig.worldApiBase = "";
    const fallback = await loadAvatarCatalog();
    expect(fallback).toHaveLength(AVATAR_CATALOG.length);

    runtimeConfig.worldApiBase = "https://hyades.example";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/assets/vrm-models")) {
          return new Response(
            JSON.stringify({
              avatars: [
                {
                  id: "vrm-1",
                  model_id: "vrm-1",
                  name: "Ancient Auton",
                  file_format: "vrm",
                },
              ],
            }),
          );
        }
        if (url.endsWith("/api/assets/animated-models")) {
          return new Response(JSON.stringify({ models: [] }));
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const withStore = await loadAvatarCatalog();

    expect(withStore.some((entry) => entry.id === "vrm:vrm-1")).toBe(true);
  });
});
