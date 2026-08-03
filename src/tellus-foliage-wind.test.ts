import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  attachFoliageWindWeights,
  enableFoliageWind,
  heightWindWeights,
  clampedWindWeights,
  updateFoliageWind,
} from "./tellus-foliage-wind";

describe("foliage wind", () => {
  it("preserves authored sway while clamping invalid extremes", () => {
    expect([...clampedWindWeights(new Float32Array([0, 0.5, 2]))]).toEqual([0, 0.5, 1]);
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

  it("applies structural branch sway after thin instance scaling", () => {
    const material = new THREE.MeshLambertMaterial();
    enableFoliageWind(material, 0.18, { space: "post-instance" });
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <begin_vertex>\n#include <project_vertex>",
      fragmentShader: "",
    };

    material.onBeforeCompile(shader as never, {} as never);

    const instanceTransform = shader.vertexShader.indexOf("mvPosition = instanceMatrix * mvPosition");
    const lateralSway = shader.vertexShader.indexOf("mvPosition.x += tellusWindWave");
    expect(instanceTransform).toBeGreaterThan(-1);
    expect(lateralSway).toBeGreaterThan(instanceTransform);
    expect(shader.vertexShader).not.toContain("transformed.x += tellusWindWave");
  });
});
