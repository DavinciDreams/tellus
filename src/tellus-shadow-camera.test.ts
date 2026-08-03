import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { fitDirectionalShadowCamera } from "./tellus-shadow-camera";

describe("fitDirectionalShadowCamera", () => {
  it("moves and expands the default directional shadow camera around distant casters", () => {
    const light = new THREE.DirectionalLight();
    const offset = new THREE.Vector3(-72, 88, 58);
    const bounds = new THREE.Box3(
      new THREE.Vector3(980, 2, 1980),
      new THREE.Vector3(1020, 30, 2020),
    );
    const fit = fitDirectionalShadowCamera(light, offset, bounds, new THREE.Vector3());
    light.shadow.updateMatrices(light);

    expect(fit.casterCountBounds).toBe(true);
    expect(fit.halfExtent).toBeGreaterThan(5);
    expect(light.target.position.x).toBeCloseTo(1_000, 0);
    expect(light.target.position.z).toBeCloseTo(2_000, 0);
    const projectedCenter = bounds.getCenter(new THREE.Vector3()).project(light.shadow.camera);
    expect(Math.abs(projectedCenter.x)).toBeLessThan(1);
    expect(Math.abs(projectedCenter.y)).toBeLessThan(1);
    expect(projectedCenter.z).toBeGreaterThanOrEqual(-1);
    expect(projectedCenter.z).toBeLessThanOrEqual(1);
  });

  it("keeps sub-texel focus movement snapped to the same light-space position", () => {
    const light = new THREE.DirectionalLight();
    const offset = new THREE.Vector3(-72, 88, 58);
    const firstBounds = new THREE.Box3(
      new THREE.Vector3(-20, 0, -20),
      new THREE.Vector3(20, 20, 20),
    );
    const first = fitDirectionalShadowCamera(light, offset, firstBounds, new THREE.Vector3());
    const secondBounds = firstBounds.clone().translate(new THREE.Vector3(first.texelWorldSize * 0.1, 0, 0));
    const second = fitDirectionalShadowCamera(light, offset, secondBounds, new THREE.Vector3());

    const forward = offset.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    const firstFocus = new THREE.Vector3(first.focus.x, first.focus.y, first.focus.z);
    const secondFocus = new THREE.Vector3(second.focus.x, second.focus.y, second.focus.z);
    expect(secondFocus.dot(right)).toBeCloseTo(firstFocus.dot(right), 5);
    expect(secondFocus.dot(up)).toBeCloseTo(firstFocus.dot(up), 5);
  });
});
