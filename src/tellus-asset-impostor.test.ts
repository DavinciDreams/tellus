import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assetImpostorViewBlend,
  createAssetStoreImpostorInstance,
  loadAssetStoreImpostor,
  normalizeAssetImpostorVariant,
  type AssetStoreImpostorTemplate,
} from "./tellus-asset-impostor";
import { runtimeConfig } from "./tellus-runtime-config";

describe("Asset Store WebGL impostors", () => {
  const originalWorldApiBase = runtimeConfig.worldApiBase;

  afterEach(() => {
    runtimeConfig.worldApiBase = originalWorldApiBase;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("normalizes the atlas metadata and original model bounds", () => {
    const metadata = normalizeAssetImpostorVariant({
      file_format: "webp",
      status: "ready",
      settings: {
        type: "octahedral_atlas",
        atlas_width: 2046,
        atlas_height: 2046,
        grid_size_x: 31,
        grid_size_y: 31,
        cell_size: 66,
        view_count: 961,
        octahedron_type: "hemi",
        bounds: {
          min: [-2, 0, -1],
          max: [2, 8, 1],
          center: [0, 4, 0],
          size: [4, 8, 2],
          max_dimension: 8,
          effective_radius: 4.6,
        },
      },
      url: "/api/assets/model/tree-1/impostor",
    });

    expect(metadata).toEqual(expect.objectContaining({
      type: "octahedral_atlas",
      grid_size_x: 31,
      grid_size_y: 31,
      view_count: 961,
      octahedron_type: "hemi",
      url: "/api/assets/model/tree-1/impostor",
      bounds: expect.objectContaining({ max_dimension: 8, effective_radius: 4.6 }),
    }));
  });

  it("selects cells using the inverse of the Asset Store HEMI encoding", () => {
    const overhead = assetImpostorViewBlend(new THREE.Vector3(0, 1, 0), 31, 31, "hemi");
    expect(overhead.faceIndices.toArray()).toEqual([480, 481, 511]);
    expect(overhead.faceWeights.toArray()).toEqual([1, 0, 0]);

    const right = assetImpostorViewBlend(new THREE.Vector3(1, 0, 0), 31, 31, "hemi");
    expect(right.faceIndices.x).toBe(30);

    const forward = assetImpostorViewBlend(new THREE.Vector3(0, 0, 1), 31, 31, "hemi");
    expect(forward.faceIndices.x).toBe(960);
  });

  it("loads the image through Hyades and derives the normalized grounded plane", async () => {
    runtimeConfig.worldApiBase = "https://hyades.example";
    const texture = new THREE.Texture({ width: 2046, height: 2046 } as HTMLImageElement);
    const textureLoad = vi.spyOn(THREE.TextureLoader.prototype, "loadAsync").mockResolvedValue(texture);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: {
        impostor: {
          status: "ready",
          type: "octahedral_atlas",
          atlas_width: 2046,
          atlas_height: 2046,
          grid_size_x: 31,
          grid_size_y: 31,
          octahedron_type: "hemi",
          url: "/api/assets/model/tree-load-test/impostor",
          settings: {
            bounds: {
              min: [-2, 2, -1],
              max: [2, 10, 1],
              center: [0, 6, 0],
              size: [4, 8, 2],
              max_dimension: 8,
              effective_radius: 4.6,
            },
          },
        },
      },
    })));
    vi.stubGlobal("fetch", fetchMock);

    const template = await loadAssetStoreImpostor("tree-load-test");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hyades.example/api/assets/model/tree-load-test",
      { cache: "force-cache" },
    );
    expect(textureLoad).toHaveBeenCalledWith(
      "https://hyades.example/api/assets/model/tree-load-test/impostor",
    );
    expect(template).toEqual(expect.objectContaining({
      gridSizeX: 31,
      gridSizeY: 31,
      normalizedCenterY: 0.5,
      normalizedDiameter: 1.15,
    }));
  });

  it("keeps the baked normalized diameter and updates its WebGL view uniforms", () => {
    const texture = new THREE.Texture({ width: 2046, height: 2046 } as HTMLImageElement);
    const template: AssetStoreImpostorTemplate = {
      assetId: "tree-1",
      texture,
      gridSizeX: 31,
      gridSizeY: 31,
      octahedronType: "hemi",
      normalizedCenterY: 0.5,
      normalizedDiameter: 1.15,
      metadata: {
        type: "octahedral_atlas",
        atlas_width: 2046,
        atlas_height: 2046,
        grid_size_x: 31,
        grid_size_y: 31,
        octahedron_type: "hemi",
      },
    };
    const instance = createAssetStoreImpostorInstance(template, { scale: 10, yaw: 0 });
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 4, 20);
    camera.updateMatrixWorld(true);
    instance.mesh.updateMatrixWorld(true);
    instance.update(camera);

    const size = new THREE.Vector3();
    instance.mesh.geometry.computeBoundingBox();
    instance.mesh.geometry.boundingBox!.getSize(size);
    expect(size.x).toBeCloseTo(11.5);
    const material = instance.mesh.material as THREE.ShaderMaterial;
    expect((material.uniforms.gridSize!.value as THREE.Vector2).toArray()).toEqual([31, 31]);
    const weights = material.uniforms.faceWeights!.value as THREE.Vector3;
    expect(weights.x + weights.y + weights.z).toBeCloseTo(1);

    instance.dispose();
    texture.dispose();
  });
});
