import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { assetImpostorViewBlend } from "./tellus-asset-impostor";
import {
  buildProcPlantInstancedParts,
  defaultPlantEnvironment,
  procPlantPresets,
} from "./tellus-procplants";
import {
  bakeWebGlImpostor,
  hemiOctahedralViewDirection,
  isWebGlImpostorBakingSupported,
} from "./tellus-webgl-impostor";

/** Records where the bake source sits during each cell render, without needing a GL context. */
const recordingRenderer = (source: THREE.Object3D) => {
  const boxes: THREE.Box3[] = [];
  const renderer = {
    getRenderTarget: () => null,
    getViewport: (target: THREE.Vector4) => target.set(0, 0, 1, 1),
    getScissor: (target: THREE.Vector4) => target.set(0, 0, 1, 1),
    getScissorTest: () => false,
    getClearColor: (target: THREE.Color) => target.set(0),
    getClearAlpha: () => 1,
    autoClear: true,
    setRenderTarget: () => undefined,
    setClearColor: () => undefined,
    setViewport: () => undefined,
    setScissor: () => undefined,
    setScissorTest: () => undefined,
    clear: () => undefined,
    render: (scene: THREE.Scene) => {
      scene.updateMatrixWorld(true);
      boxes.push(new THREE.Box3().setFromObject(source));
    },
  };
  return { renderer: renderer as unknown as THREE.WebGLRenderer, boxes };
};

describe("WebGL Weber-Penn impostor atlas", () => {
  it("round-trips every baked hemi-octahedral cell through runtime selection", () => {
    const gridSize = 8;
    for (let row = 0; row < gridSize; row++) {
      for (let column = 0; column < gridSize; column++) {
        const direction = hemiOctahedralViewDirection(
          (column + 0.5) / gridSize,
          (row + 0.5) / gridSize,
        );
        const blend = assetImpostorViewBlend(direction, gridSize, gridSize, "hemi");
        const indices = blend.faceIndices.toArray();
        const weights = blend.faceWeights.toArray();
        const strongest = weights.indexOf(Math.max(...weights));
        expect(indices[strongest]).toBe(row * gridSize + column);
        expect(weights[strongest]).toBeCloseTo(1, 5);
      }
    }
  });

  it("keeps every baked camera above the horizon", () => {
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        const direction = hemiOctahedralViewDirection((column + 0.5) / 8, (row + 0.5) / 8);
        expect(direction.y).toBeGreaterThanOrEqual(0);
        expect(direction.length()).toBeCloseTo(1, 6);
      }
    }
  });

  it("centres a tall, offset source inside the orthographic bake frame and restores it", () => {
    const source = new THREE.Mesh(new THREE.BoxGeometry(2, 9, 3));
    source.position.set(4, 4.5, -2);
    source.scale.set(1.5, 1.5, 1.5);
    const { renderer, boxes } = recordingRenderer(source);

    const handle = bakeWebGlImpostor(source, renderer, { atlasSize: 128, gridSize: 2 });

    expect(boxes).toHaveLength(4);
    for (const box of boxes) {
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      expect(center.length()).toBeLessThan(1e-6);
      // The camera frame spans [-0.5, 0.5]; the tallest axis must fit inside it with padding.
      expect(Math.max(size.x, size.y, size.z)).toBeLessThan(1);
      expect(Math.max(size.x, size.y, size.z)).toBeGreaterThan(0.7);
    }
    expect(source.position.toArray()).toEqual([4, 4.5, -2]);
    expect(source.scale.toArray()).toEqual([1.5, 1.5, 1.5]);
    handle.dispose();
  });

  it("only enables the runtime baker for WebGL renderers", () => {
    expect(isWebGlImpostorBakingSupported(null)).toBe(false);
    expect(isWebGlImpostorBakingSupported({ isWebGPURenderer: true })).toBe(false);
    expect(isWebGlImpostorBakingSupported({ isWebGLRenderer: true })).toBe(true);
  });

  it("replaces the costly Weber-Penn LOD2 mesh with a two-triangle quad", () => {
    const built = buildProcPlantInstancedParts(
      procPlantPresets.blueSpruce,
      1,
      defaultPlantEnvironment(),
    );
    expect(built.stats.stemTriangles).toBeGreaterThan(2);
    expect(2 / built.stats.stemTriangles).toBeLessThan(0.001);
  });
});
