import { describe, expect, it } from "vitest";
import { assetImpostorViewBlend } from "./tellus-asset-impostor";
import {
  buildProcPlantInstancedParts,
  defaultPlantEnvironment,
  procPlantPresets,
} from "./tellus-procplants";
import {
  hemiOctahedralViewDirection,
  isWebGlImpostorBakingSupported,
} from "./tellus-webgl-impostor";

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
