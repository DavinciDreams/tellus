import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WildlifePresentationPose } from "./tellus-wildlife-interpolation";
import type { WildlifeLodAssignment } from "./tellus-wildlife-lod";

const MAX_PROXIES = 512;

const segmentGeometry = (
  start: THREE.Vector3,
  end: THREE.Vector3,
  radiusStart: number,
  radiusEnd = radiusStart,
  radialSegments = 5,
): THREE.BufferGeometry => {
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const direction = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(
    radiusEnd,
    radiusStart,
    direction.length(),
    radialSegments,
    1,
    false,
  );
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    THREE.Object3D.DEFAULT_UP,
    direction.normalize(),
  ));
  geometry.translate(midpoint.x, midpoint.y, midpoint.z);
  return geometry;
};

/** A bounded one-material stag silhouette for the mid/far single-draw wildlife tier. */
export const createWildlifeProxyGeometry = (): THREE.BufferGeometry => {
  const body = new THREE.SphereGeometry(0.5, 8, 6);
  body.scale(0.72, 0.65, 1.4);
  body.translate(0, 1.03, 0);
  const neck = segmentGeometry(
    new THREE.Vector3(0, 1.08, 0.42),
    new THREE.Vector3(0, 1.64, 0.72),
    0.19,
    0.13,
    6,
  );
  const head = new THREE.SphereGeometry(0.5, 7, 5);
  head.scale(0.25, 0.31, 0.43);
  head.translate(0, 1.73, 0.91);
  const muzzle = new THREE.SphereGeometry(0.5, 6, 4);
  muzzle.scale(0.16, 0.14, 0.3);
  muzzle.translate(0, 1.67, 1.2);
  const parts: THREE.BufferGeometry[] = [body, neck, head, muzzle];
  for (const x of [-0.24, 0.24]) {
    for (const z of [-0.38, 0.38]) {
      parts.push(segmentGeometry(
        new THREE.Vector3(x, 0.94, z),
        new THREE.Vector3(x * 1.05, 0.08, z + (z > 0 ? 0.08 : -0.04)),
        0.075,
        0.045,
        5,
      ));
    }
  }
  for (const x of [-0.15, 0.15]) {
    const ear = new THREE.ConeGeometry(0.095, 0.28, 4);
    ear.rotateZ(x < 0 ? 0.42 : -0.42);
    ear.translate(x, 2.0, 0.88);
    parts.push(ear);
    const antlerRoot = new THREE.Vector3(x * 0.55, 1.94, 0.82);
    const antlerTop = new THREE.Vector3(x * 1.3, 2.34, 0.72);
    parts.push(segmentGeometry(antlerRoot, antlerTop, 0.032, 0.022, 4));
    parts.push(segmentGeometry(
      antlerTop,
      new THREE.Vector3(x * 2.1, 2.55, 0.67),
      0.023,
      0.012,
      4,
    ));
    parts.push(segmentGeometry(
      new THREE.Vector3(x * 1.15, 2.2, 0.75),
      new THREE.Vector3(x * 2.0, 2.34, 0.94),
      0.021,
      0.01,
      4,
    ));
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error("Failed to build wildlife proxy geometry");
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
};

/**
 * One-draw fallback for wildlife outside the skinned near field. A future VAT deer
 * renderer can replace this class without changing simulation, interpolation, or LOD.
 */
export class WildlifeProxyRenderer {
  readonly #mesh: THREE.InstancedMesh;
  readonly #matrix = new THREE.Matrix4();
  readonly #position = new THREE.Vector3();
  readonly #rotation = new THREE.Quaternion();
  readonly #scale = new THREE.Vector3();
  readonly #color = new THREE.Color();

  constructor(scene: THREE.Scene, capacity = MAX_PROXIES) {
    const geometry = createWildlifeProxyGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: 0x9a7044,
      roughness: 0.92,
      metalness: 0,
    });
    this.#mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
    this.#mesh.name = "tellus-wildlife-proxies";
    this.#mesh.castShadow = false;
    this.#mesh.receiveShadow = false;
    this.#mesh.frustumCulled = true;
    this.#mesh.count = 0;
    this.#mesh.userData.wildlifeProxy = true;
    scene.add(this.#mesh);
  }

  sync(assignments: readonly WildlifeLodAssignment[], poses: ReadonlyMap<string, WildlifePresentationPose>): void {
    let slot = 0;
    for (const assignment of assignments) {
      if (assignment.tier !== "instanced" && assignment.tier !== "impostor") continue;
      const pose = poses.get(assignment.id);
      if (!pose || slot >= this.#mesh.instanceMatrix.count) continue;
      this.#position.set(pose.position.x, pose.position.y, pose.position.z);
      this.#rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, pose.rotationY);
      const scale = assignment.tier === "instanced" ? 1 : 0.82;
      this.#scale.setScalar(scale);
      this.#matrix.compose(this.#position, this.#rotation, this.#scale);
      this.#mesh.setMatrixAt(slot, this.#matrix);
      this.#color.set(pose.state === "flee" ? 0xb86c38 : pose.state === "graze" ? 0x83633f : 0x9a7044);
      this.#mesh.setColorAt(slot, this.#color);
      slot++;
    }
    this.#mesh.count = slot;
    this.#mesh.visible = slot > 0;
    this.#mesh.instanceMatrix.needsUpdate = true;
    if (this.#mesh.instanceColor) this.#mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.#mesh.removeFromParent();
    this.#mesh.geometry.dispose();
    const material = this.#mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material.dispose();
  }
}
