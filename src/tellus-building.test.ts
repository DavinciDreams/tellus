import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { COLLIDE_FLAG, generateInteriorRoom } from "./tellus-building";

describe("generateInteriorRoom", () => {
  it("honors larger hall dimensions and marks solids collidable", () => {
    const room = generateInteriorRoom({ width: 30, depth: 24, levels: 2, stairs: true, seed: 7 });
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
});
