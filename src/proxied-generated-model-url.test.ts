import { afterEach, describe, expect, it } from "vitest";
import { proxiedGeneratedModelUrl } from "./tellus-urls-identity";
import { runtimeConfig } from "./tellus-runtime-config";

// The Hyades 3D backend hands back a raw asset-store URL (no CORS header); loading it cross-origin
// from the Tellus origin fails silently, so a freshly-generated model never renders until it's
// re-added from the asset library. proxiedGeneratedModelUrl routes such URLs through the same-origin
// /api/assets proxy (CORS-safe + game-optimized) while leaving every other URL shape untouched.
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
    const url = "https://tellus.example/api/assets/model/abc/game-optimized";
    expect(proxiedGeneratedModelUrl(url)).toBe(url);
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
});
