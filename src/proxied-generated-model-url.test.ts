import { afterEach, describe, expect, it } from "vitest";
import { assetStoreIdFromModelUrl, proxiedGeneratedModelUrl } from "./tellus-urls-identity";
import { runtimeConfig } from "./tellus-runtime-config";

// The Hyades 3D backend hands back a raw asset-store URL (no CORS header); loading it cross-origin
// from the Tellus origin fails silently, so a freshly-generated model never renders until it's
// re-added from the asset library. proxiedGeneratedModelUrl routes such URLs through the configured
// world API asset proxy (CORS-safe + game-optimized) while leaving every other URL shape untouched.
describe("proxiedGeneratedModelUrl", () => {
  const originalBase = runtimeConfig.worldApiBase;
  afterEach(() => {
    runtimeConfig.worldApiBase = originalBase;
  });

  it("rewrites a raw asset-store /api/view URL to the same-origin game-optimized proxy", () => {
    runtimeConfig.worldApiBase = "https://tellus.example";
    expect(proxiedGeneratedModelUrl("https://3d.flobots.xyz/api/view/abc123")).toBe(
      "https://tellus.example/api/assets/model/abc123/game-optimized",
    );
  });

  it("rewrites a raw asset-store /api/download URL and drops the query when extracting the id", () => {
    runtimeConfig.worldApiBase = "";
    expect(proxiedGeneratedModelUrl("https://3d.flobots.xyz/api/download/xyz?token=1")).toBe(
      "/api/assets/model/xyz/game-optimized",
    );
  });

  it("leaves an already-proxied /api/assets URL unchanged", () => {
    runtimeConfig.worldApiBase = "https://tellus.example";
    const url = "https://tellus.example/api/assets/model/abc/game-optimized";
    expect(proxiedGeneratedModelUrl(url)).toBe(url);
  });

  it("reroutes an app-origin absolute /api/assets URL to the Hyades asset proxy", () => {
    runtimeConfig.worldApiBase = "https://hyades.gnostr.cloud";
    expect(proxiedGeneratedModelUrl("https://tellus.app/api/assets/model/abc/game-optimized")).toBe(
      "https://hyades.gnostr.cloud/api/assets/model/abc/game-optimized",
    );
  });

  it("routes stored relative asset proxy URLs through the configured world API", () => {
    runtimeConfig.worldApiBase = "https://hyades.gnostr.cloud";
    expect(proxiedGeneratedModelUrl("/api/assets/model/abc/game-optimized")).toBe(
      "https://hyades.gnostr.cloud/api/assets/model/abc/game-optimized",
    );
  });

  it("rewrites stale world-api /api/view URLs through the asset proxy", () => {
    runtimeConfig.worldApiBase = "https://hyades.gnostr.cloud";
    expect(proxiedGeneratedModelUrl("https://hyades.gnostr.cloud/api/view/asset-1")).toBe(
      "https://hyades.gnostr.cloud/api/assets/model/asset-1/game-optimized",
    );
  });

  it("leaves procedural://, data:, and local /generated-assets URLs unchanged", () => {
    expect(proxiedGeneratedModelUrl("procedural://mirror")).toBe("procedural://mirror");
    expect(proxiedGeneratedModelUrl("data:model/gltf-binary;base64,AAAA")).toBe(
      "data:model/gltf-binary;base64,AAAA",
    );
    expect(proxiedGeneratedModelUrl("/generated-assets/cow.glb")).toBe("/generated-assets/cow.glb");
  });

  it("leaves an absolute non-asset-store URL unchanged", () => {
    expect(proxiedGeneratedModelUrl("https://cdn.example/models/cow.glb")).toBe(
      "https://cdn.example/models/cow.glb",
    );
  });

  it("leaves non-asset-store API model URLs unchanged", () => {
    const url = "https://sketchfab.example/api/model/abc123";
    expect(proxiedGeneratedModelUrl(url)).toBe(url);
  });

  it("extracts immutable asset ids from raw and proxied model URLs", () => {
    expect(assetStoreIdFromModelUrl("https://3d.flobots.xyz/api/view/abc123?viewer=2")).toBe(
      "abc123",
    );
    expect(assetStoreIdFromModelUrl("/api/assets/model/xyz/game-optimized")).toBe("xyz");
    expect(assetStoreIdFromModelUrl("/api/assets/model/palm-1/lod/2")).toBe("palm-1");
    expect(assetStoreIdFromModelUrl("/api/assets/model/palm-1/impostor")).toBe("palm-1");
    expect(assetStoreIdFromModelUrl("/__hyades/api/assets/model/dev-proxy/game-optimized")).toBe("dev-proxy");
    expect(assetStoreIdFromModelUrl("/generated-assets/local.glb")).toBeNull();
  });
});
