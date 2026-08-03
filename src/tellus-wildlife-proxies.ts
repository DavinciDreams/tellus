import * as THREE from "three";
import type { WildlifePresentationPose } from "./tellus-wildlife-interpolation";
import type { WildlifeLodAssignment } from "./tellus-wildlife-lod";

const MAX_PROXIES = 512;

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
    const geometry = new THREE.BoxGeometry(1.35, 0.85, 0.42);
    geometry.translate(0, 0.75, 0);
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
