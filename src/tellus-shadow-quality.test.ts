import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { renderPressureSnapshotFor } from "./tellus-render-pressure";
import {
  TELLUS_SHADOW_MAP_SIZE,
  TELLUS_SHADOW_RADIUS,
  TELLUS_SHADOW_TEXEL_WORLD_SIZE,
  configureTellusSunShadow,
  createTellusShadowInvalidationController,
  focusTellusSunShadow,
  projectTellusShadowFocus,
} from "./tellus-shadow-quality";

describe("Tellus sun shadow quality", () => {
  it("configures one bounded, moderate-resolution player shadow", () => {
    const sun = new THREE.DirectionalLight();
    configureTellusSunShadow(sun);

    expect(sun.shadow.camera.left).toBe(-TELLUS_SHADOW_RADIUS);
    expect(sun.shadow.camera.right).toBe(TELLUS_SHADOW_RADIUS);
    expect(sun.shadow.mapSize.x).toBe(TELLUS_SHADOW_MAP_SIZE);
    expect(sun.shadow.mapSize.y).toBe(TELLUS_SHADOW_MAP_SIZE);
    expect(sun.shadow.autoUpdate).toBe(false);
  });

  it("snaps the focus in light-space texel units while retaining sun direction", () => {
    const direction = new THREE.Vector3(-55, 58, 42).normalize();
    const a = projectTellusShadowFocus(17.1, 2, -9.8, direction);
    const b = projectTellusShadowFocus(17.11, 2, -9.79, direction);
    expect(a.lightSpaceCellX).toBe(b.lightSpaceCellX);
    expect(a.lightSpaceCellY).toBe(b.lightSpaceCellY);
    expect(a.texelWorldSize).toBeCloseTo(TELLUS_SHADOW_TEXEL_WORLD_SIZE, 12);

    const sun = new THREE.DirectionalLight();
    sun.position.copy(direction);
    const projection = focusTellusSunShadow(sun, 17.1, 2, -9.8);
    const after = sun.position.clone().sub(sun.target.position).normalize();
    expect(after.distanceTo(direction)).toBeLessThan(1e-8);
    expect(sun.target.position.distanceTo(projection.focus)).toBeLessThan(1e-8);
  });

  it("refreshes only for invalidations and uses the shared pressure cadence", () => {
    const controller = createTellusShadowInvalidationController();
    const pressure = renderPressureSnapshotFor("balanced");
    const direction = new THREE.Vector3(-0.6, 0.65, 0.45).normalize();
    const initial = projectTellusShadowFocus(0, 0, 0, direction);
    controller.observe(initial, 0);
    expect(controller.shouldRefresh(pressure, 0)).toBe(true);
    controller.markRefreshed(0);
    expect(controller.pendingReasons()).toEqual([]);

    const tinySunTurn = direction.clone().applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(0.05),
    );
    controller.observe(projectTellusShadowFocus(0, 0, 0, tinySunTurn), 0);
    expect(controller.pendingReasons()).toEqual([]);

    controller.observe(projectTellusShadowFocus(0.01, 0, 0.01, direction), 0);
    expect(controller.shouldRefresh(pressure, 1_000)).toBe(false);

    controller.invalidate("dynamic");
    expect(controller.shouldRefresh(pressure, pressure.work.movingIntervalMs - 1)).toBe(false);
    expect(controller.shouldRefresh(pressure, pressure.work.movingIntervalMs)).toBe(true);
    controller.markRefreshed(pressure.work.movingIntervalMs);

    controller.observe(initial, 1);
    expect(controller.pendingReasons()).toContain("casters");
  });
});
