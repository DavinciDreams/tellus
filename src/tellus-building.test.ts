import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  COLLIDE_FLAG,
  generateInteriorRoom,
  normalizeInteriorBiomeMaterial,
} from "./tellus-building";

describe("generateInteriorRoom", () => {
  it("honors larger hall dimensions and marks solids collidable", () => {
    const room = generateInteriorRoom({
      width: 30,
      depth: 24,
      levels: 2,
      stairs: true,
      seed: 7,
    });
    const box = new THREE.Box3().setFromObject(room);
    const size = new THREE.Vector3();
    box.getSize(size);
    let collidableMeshes = 0;

    room.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh && mesh.userData[COLLIDE_FLAG] === true) {
        collidableMeshes++;
      }
    });

    expect(size.x).toBeGreaterThanOrEqual(30);
    expect(size.x).toBeLessThan(31);
    expect(size.z).toBeGreaterThanOrEqual(24);
    expect(size.z).toBeLessThan(25);
    expect(size.y).toBeGreaterThan(8);
    expect(collidableMeshes).toBeGreaterThan(8);
  });

  it("exposes inset placement bounds for room-aware object placement", () => {
    const room = generateInteriorRoom({
      width: 30,
      depth: 24,
      levels: 2,
      stairs: true,
      seed: 7,
    });
    const bounds = room.userData.placementBounds;

    expect(bounds).toMatchObject({
      minX: expect.any(Number),
      maxX: expect.any(Number),
      minZ: expect.any(Number),
      maxZ: expect.any(Number),
      levels: 2,
    });
    expect(bounds.minX).toBeGreaterThan(-15);
    expect(bounds.maxX).toBeLessThan(15);
    expect(bounds.minZ).toBeGreaterThan(-12);
    expect(bounds.maxZ).toBeLessThan(12);
  });

  it("exposes doorway and window anchors without making trim collidable", () => {
    const room = generateInteriorRoom({
      width: 30,
      depth: 24,
      levels: 2,
      stairs: true,
      seed: 7,
    });
    const openings = room.userData.openings;

    expect(openings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "door", wall: "-z" }),
        expect.objectContaining({ kind: "window", wall: "-x" }),
        expect.objectContaining({ kind: "window", wall: "+x" }),
        expect.objectContaining({ kind: "window", wall: "+z" }),
      ]),
    );
    expect(room.userData.portalDoorAnchor).toMatchObject({
      kind: "door",
      wall: "-z",
    });
    expect(
      openings.filter((opening: { kind: string }) => opening.kind === "window"),
    ).toHaveLength(4);

    let visualOpeningMeshes = 0;
    room.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData[COLLIDE_FLAG] === true) return;
      if (mesh.material instanceof THREE.MeshStandardMaterial)
        visualOpeningMeshes++;
    });
    expect(visualOpeningMeshes).toBeGreaterThanOrEqual(10);
  });

  it("records the selected real-biome material palette", () => {
    const desertRoom = generateInteriorRoom({ biome: "desert", seed: 11 });
    const tropicalRoom = generateInteriorRoom({
      biome: "tropical rain forest",
      seed: 11,
    });

    expect(desertRoom.userData.materialBiome).toBe("desert");
    expect(tropicalRoom.userData.materialBiome).toBe("tropical-rain-forest");
    expect(normalizeInteriorBiomeMaterial("savannah thatch")).toBe("savanna");
  });
});
