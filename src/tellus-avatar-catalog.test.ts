import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AVATAR_CATALOG,
  avatarThumbnailUrl,
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

  it("prefers VRM avatars over animated GLB variants when a VRM exists", async () => {
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

  it("does not cap store-loaded VRM avatars before the drawer can page them", async () => {
    runtimeConfig.worldApiBase = "https://hyades.example";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/assets/vrm-models")) {
          return new Response(
            JSON.stringify({
              avatars: Array.from({ length: 60 }, (_, index) => ({
                id: `vrm-${index}`,
                model_id: `vrm-${index}`,
                name: `VRM Avatar ${index}`,
                file_format: "vrm",
              })),
            }),
          );
        }
        if (url.endsWith("/api/assets/animated-models")) {
          return new Response(JSON.stringify({ models: [] }));
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const catalog = await loadAvatarCatalog();

    expect(catalog.filter((entry) => entry.id.startsWith("vrm:vrm-"))).toHaveLength(60);
  });

  it("normalizes store thumbnail metadata through the Tellus asset proxy", async () => {
    runtimeConfig.worldApiBase = "https://hyades.example";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/api/assets/vrm-models")) {
          return new Response(
            JSON.stringify({
              avatars: [
                {
                  id: "vrm-thumb",
                  model_id: "vrm-thumb",
                  name: "VRM With Thumbnail",
                  file_format: "vrm",
                  thumbnail_url: "/api/model/vrm-thumb/thumbnail",
                  processing_state: {
                    media_capture_ready: true,
                    needs_thumbnail: false,
                  },
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

    const catalog = await loadAvatarCatalog();
    const entry = catalog.find((item) => item.id === "vrm:vrm-thumb");

    expect(entry?.mediaCaptureReady).toBe(true);
    expect(entry ? avatarThumbnailUrl(entry) : undefined).toBe(
      "https://hyades.example/api/assets/model/vrm-thumb/thumbnail",
    );
  });
});
