import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createOceanSurface,
  createPondWater,
  createWaterShoreDistanceField,
  disposeObject,
  positionPondRipplePatch,
  triggerPondRipple,
  updatePondRipples,
} from "./tellus-scene-builders";
import { pondPositionToUv } from "./tellus-pond-simulation";

describe("interactive pond water", () => {
  it("builds a signed shoreline distance field once and wires it into water shading", () => {
    const shore = createWaterShoreDistanceField({
      centerX: 0,
      centerZ: 0,
      width: 20,
      depth: 20,
      resolution: 40,
      distanceRange: 8,
      isWater: (x, z) => x * x + z * z >= 25,
    });
    const data = shore.texture.image.data as Uint8Array;
    const center = data[20 * 40 + 20];
    const corner = data[0];
    expect(center).toBeLessThan(128);
    expect(corner).toBeGreaterThan(128);

    const ocean = createOceanSurface(false, undefined, { shoreDistanceField: shore });
    const material = ocean.material as THREE.ShaderMaterial;
    expect(material.uniforms.uHasShoreDistanceMap.value).toBe(1);
    expect(material.uniforms.uShoreDistanceMap.value).toBe(shore.texture);
    expect(material.userData.tellusWaterShaderVariant).toBe("webgl-contour-shore-distance");
    disposeObject(ocean);
  });

  it("uses a calm bounded reflective plane for inland lakes", () => {
    const lake = createOceanSurface(false, undefined, {
      mode: "lake",
      width: 640,
      depth: 480,
    });
    const material = lake.material as THREE.ShaderMaterial;
    const reflection = lake.getObjectByName("tellus-ocean-reflection") as THREE.Mesh;

    expect(lake.name).toBe("tellus-inland-water-plane");
    expect(lake.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(material.uniforms.uPondCalm.value).toBe(1);
    expect(material.uniforms.uSkyColor.value).toBeInstanceOf(THREE.Color);
    expect(material.fragmentShader).toContain("uSkyColor");
    expect(material.fragmentShader).toContain("skyReflection");
    expect((reflection.material as THREE.ShaderMaterial).uniforms.motionStrength.value).toBe(0.22);
    disposeObject(lake);
  });

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
    expect(surface.getObjectByName("tellus-pond-reflection")).toBeDefined();
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

  it("layers a localized height-field ripple patch over reflective lake water", () => {
    const pond = createPondWater({
      center: { x: 10, z: -5 },
      radius: 8,
      waterLevel: 1.2,
      simulated: true,
      waterSettings: { style: "lagoon", opacity: 0.68, waveStrength: 0.8 },
    });
    const surface = pond.getObjectByName("tellus-pond-surface") as THREE.Mesh;
    const rippleSurface = pond.getObjectByName("tellus-pond-ripple-surface") as THREE.Mesh;
    const material = rippleSurface.material as THREE.ShaderMaterial;

    expect(surface.geometry).toBeInstanceOf(THREE.CircleGeometry);
    expect(surface.material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(surface.getObjectByName("tellus-pond-reflection")).toBeDefined();
    expect(rippleSurface.geometry).toBeInstanceOf(THREE.PlaneGeometry);
    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.userData.tellusSimulatedPond).toBe(true);
    expect(rippleSurface.userData.pondSimulatedWater).toBe(true);
    expect(triggerPondRipple(pond, { x: 12, z: -4 }, 1000, 1.2)).toBe(true);
    expect(pond.userData.pondRippleSimulation.pendingDropCount).toBe(3);
    expect(triggerPondRipple(pond, { x: 30, z: -4 }, 1000, 1.2)).toBe(true);
    expect(rippleSurface.position.x).toBe(30);

    const uv = pondPositionToUv({ x: 10, z: -5 }, 8, { x: 12, z: -4 });
    expect(uv?.x).toBeCloseTo(0.625);
    expect(uv?.y).toBeCloseTo(0.4375);

    expect(positionPondRipplePatch(pond, { x: 40, z: 20 }, 2.4)).toBe(true);
    expect(rippleSurface.position.x).toBe(40);
    expect(rippleSurface.position.y).toBe(2.4);
    expect(rippleSurface.position.z).toBe(20);
    expect(triggerPondRipple(pond, { x: 40, z: 20 }, 2000, 1)).toBe(true);
    expect(pond.userData.pondRippleSimulation.pendingDropCount).toBe(3);
    pond.userData.disposePondSimulation();
  });

  it("can render only the ripple overlay when a world supplies the reflective lake plane", () => {
    const pond = createPondWater({
      center: { x: 0, z: 0 },
      radius: 18,
      waterLevel: 0.14,
      simulated: true,
      baseSurface: false,
    });

    expect(pond.getObjectByName("tellus-pond-surface")?.visible).toBe(false);
    expect(pond.getObjectByName("tellus-pond-ripple-surface")).toBeDefined();
    pond.userData.disposePondSimulation();
  });
});
