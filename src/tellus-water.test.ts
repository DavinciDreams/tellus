import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createPondWater,
  positionPondRipplePatch,
  triggerPondRipple,
  updatePondRipples,
} from "./tellus-scene-builders";
import { pondPositionToUv } from "./tellus-pond-simulation";

describe("interactive pond water", () => {
  it("starts as a calm physical surface with dormant ripple meshes", () => {
    const pond = createPondWater({
      center: { x: 10, z: -5 },
      radius: 8,
      waterLevel: 1.2,
      animated: true,
      waterSettings: { style: "lagoon", opacity: 0.68, waveStrength: 0.8 },
    });

    const surface = pond.getObjectByName("tellus-pond-surface") as THREE.Mesh;
    const ripples = pond.getObjectByName("tellus-pond-ripples") as THREE.Group;
    expect(surface.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(surface.userData.pondStillWater).toBe(true);
    expect(ripples.children).toHaveLength(7);
    expect(ripples.children.every((ripple) => !ripple.visible)).toBe(true);
  });

  it("emits a localized ripple for pond contact and fades it back into the pool", () => {
    const pond = createPondWater({ center: { x: 10, z: -5 }, radius: 8, waterLevel: 1.2 });
    expect(triggerPondRipple(pond, { x: 12, z: -4 }, 1000, 1)).toBe(true);

    const ripples = pond.getObjectByName("tellus-pond-ripples") as THREE.Group;
    const active = ripples.children.find((ripple) => ripple.visible) as THREE.Mesh;
    expect(active).toBeDefined();
    expect(active.position.x).toBeCloseTo(2);
    expect(active.position.z).toBeCloseTo(1);

    updatePondRipples(pond, 1700);
    expect(active.scale.x).toBeGreaterThan(0.2);
    expect((active.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThan(0);

    updatePondRipples(pond, 3000);
    expect(active.visible).toBe(false);
    expect(active.userData.active).toBe(false);
    expect((active.material as THREE.MeshBasicMaterial).opacity).toBe(0);
  });

  it("ignores contacts outside the pond", () => {
    const pond = createPondWater({ center: { x: 10, z: -5 }, radius: 8, waterLevel: 1.2 });
    expect(triggerPondRipple(pond, { x: 25, z: -5 }, 1000, 1)).toBe(false);
  });

  it("uses a localized height-field surface for the Basalt pond", () => {
    const pond = createPondWater({
      center: { x: 10, z: -5 },
      radius: 8,
      waterLevel: 1.2,
      simulated: true,
      waterSettings: { style: "lagoon", opacity: 0.68, waveStrength: 0.8 },
    });
    const surface = pond.getObjectByName("tellus-pond-surface") as THREE.Mesh;
    const material = surface.material as THREE.ShaderMaterial;

    expect(surface.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.userData.tellusSimulatedPond).toBe(true);
    expect(surface.userData.pondSimulatedWater).toBe(true);
    expect(triggerPondRipple(pond, { x: 12, z: -4 }, 1000, 1.2)).toBe(true);
    expect(pond.userData.pondRippleSimulation.pendingDropCount).toBe(3);
    expect(triggerPondRipple(pond, { x: 30, z: -4 }, 1000, 1.2)).toBe(true);
    expect(surface.position.x).toBe(30);

    const uv = pondPositionToUv({ x: 10, z: -5 }, 8, { x: 12, z: -4 });
    expect(uv?.x).toBeCloseTo(0.625);
    expect(uv?.y).toBeCloseTo(0.4375);

    expect(positionPondRipplePatch(pond, { x: 40, z: 20 }, 2.4)).toBe(true);
    expect(surface.position.x).toBe(40);
    expect(surface.position.y).toBe(2.4);
    expect(surface.position.z).toBe(20);
    expect(triggerPondRipple(pond, { x: 40, z: 20 }, 2000, 1)).toBe(true);
    expect(pond.userData.pondRippleSimulation.pendingDropCount).toBe(3);
    pond.userData.disposePondSimulation();
  });
});
