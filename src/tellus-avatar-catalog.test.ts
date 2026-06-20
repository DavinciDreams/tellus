import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_CATALOG,
  catalogEntryById,
  loadAvatarCatalog,
  resetAvatarCatalogForTests,
} from "./tellus-avatar-catalog";
import { runtimeConfig } from "./tellus-runtime-config";

describe("avatar catalog loading", () => {
  const originalWorldApiBase = runtimeConfig.worldApiBase;

  afterEach(() => {
    runtimeConfig.worldApiBase = originalWorldApiBase;
    resetAvatarCatalogForTests();
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

  it("classifies animated store assets with VRM variants as VRM avatars", async () => {
    runtimeConfig.worldApiBase = "https://hyades.example";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/assets/vrm-models")) {
          return new Response(JSON.stringify({ avatars: [] }));
        }
        if (url.endsWith("/api/assets/animated-models")) {
          return new Response(
            JSON.stringify({
              models: [
                {
                  id: "7cddee11cafefeed",
                  name: "Store VRM Avatar",
                  file_format: "glb",
                  has_vrm_variant: true,
                },
              ],
            }),
          );
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const catalog = await loadAvatarCatalog();

    expect(catalog.some((entry) => entry.id === "vrm:7cddee11cafefeed")).toBe(true);
    expect(catalog.some((entry) => entry.id === "glb:7cddee11cafefeed")).toBe(false);

    const staleGlbSelection = catalogEntryById("glb:7cddee11cafefeed");
    expect(staleGlbSelection?.kind).toBe("vrm");
    expect(staleGlbSelection?.id).toBe("vrm:7cddee11cafefeed");
  });
});
