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
    expect(light.target.position.x).toBeCloseTo(fit.focus.x, 5);
    expect(light.target.position.z).toBeCloseTo(fit.focus.z, 5);
    expect(Math.abs(light.target.position.x - 1_000)).toBeLessThan(30);
    expect(Math.abs(light.target.position.z - 2_000)).toBeLessThan(30);
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

  it("fits the ground receiver footprint of a tall foreground caster", () => {
    const light = new THREE.DirectionalLight();
    const offset = new THREE.Vector3(-72, 88, 58);
    const bounds = new THREE.Box3(
      new THREE.Vector3(-1, 0, -1),
      new THREE.Vector3(1, 14, 1),
    );
    fitDirectionalShadowCamera(light, offset, bounds, new THREE.Vector3(0, 0, 0));
    light.shadow.updateMatrices(light);

    const lightRay = offset.clone().normalize().negate();
    const crown = new THREE.Vector3(1, 14, 1);
    const receiver = crown.clone().addScaledVector(lightRay, crown.y / -lightRay.y);
    const projectedReceiver = receiver.project(light.shadow.camera);

    expect(Math.abs(projectedReceiver.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(projectedReceiver.y)).toBeLessThanOrEqual(1);
    expect(projectedReceiver.z).toBeGreaterThanOrEqual(-1);
    expect(projectedReceiver.z).toBeLessThanOrEqual(1);
  });
});
