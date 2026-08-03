import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  attachFoliageWindWeights,
  enableFoliageWind,
  heightWindWeights,
  normalizedWindWeights,
  updateFoliageWind,
} from "./tellus-foliage-wind";

describe("foliage wind", () => {
  it("normalizes authored sway into a bounded vertex weight", () => {
    expect([...normalizedWindWeights(new Float32Array([0, 2, 4]))]).toEqual([0, 0.5, 1]);
  });

  it("anchors the bottom of height-weighted grass", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 0, 0,
      0, 1, 0,
      0, 2, 0,
    ], 3));

    const weights = heightWindWeights(geometry);
    attachFoliageWindWeights(geometry, weights);

    expect([...weights]).toEqual([0, 0.5, 1]);
    expect(geometry.getAttribute("tellusWindWeight").count).toBe(3);
  });

  it("injects beauty-pass vertex wind and updates uniforms without scene traversal", () => {
    const material = new THREE.MeshLambertMaterial();
    enableFoliageWind(material, 0.2);
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "",
    };

    material.onBeforeCompile(shader as never, {} as never);
    updateFoliageWind(material, 2_500, 0.75);

    expect(shader.vertexShader).toContain("tellusWindWeight");
    expect(shader.vertexShader).toContain("transformed.x +=");
    expect((shader.uniforms as Record<string, THREE.IUniform<number>>).tellusWindTime.value).toBe(2.5);
    expect((shader.uniforms as Record<string, THREE.IUniform<number>>).tellusWindStrength.value).toBe(0.75);
  });
});
