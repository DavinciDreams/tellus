import * as THREE from "three";
import type { WorldTriggerVolumeSpec } from "./tellus-types";

const ACTIVE_COLOR = 0xf1cf61;
const DISABLED_COLOR = 0x8a929d;

export function createWorldTriggerVolumeGroup(
  definitions: readonly WorldTriggerVolumeSpec[],
): THREE.Group {
  const group = new THREE.Group();
  group.name = "tellus-world-trigger-volumes";
  group.renderOrder = 80;

  const sphereGeometry = new THREE.SphereGeometry(1, 16, 10);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const activeMaterial = new THREE.MeshBasicMaterial({
    color: ACTIVE_COLOR,
    transparent: true,
    opacity: 0.62,
    wireframe: true,
    depthWrite: false,
    toneMapped: false,
  });
  const disabledMaterial = new THREE.MeshBasicMaterial({
    color: DISABLED_COLOR,
    transparent: true,
    opacity: 0.34,
    wireframe: true,
    depthWrite: false,
    toneMapped: false,
  });

  for (const definition of definitions) {
    const { shape } = definition;
    const geometry = shape.kind === "box" ? boxGeometry : sphereGeometry;
    const mesh = new THREE.Mesh(geometry, definition.enabled ? activeMaterial : disabledMaterial);
    mesh.name = `tellus-world-trigger:${definition.triggerId}`;
    mesh.userData.triggerId = definition.triggerId;
    mesh.position.set(shape.center.x, shape.center.y, shape.center.z);
    if (shape.kind === "box") {
      mesh.scale.set(
        Math.max(0.02, shape.halfExtents.x * 2),
        Math.max(0.02, shape.halfExtents.y * 2),
        Math.max(0.02, shape.halfExtents.z * 2),
      );
      mesh.rotation.y = THREE.MathUtils.degToRad(shape.yawDegrees);
    } else {
      const diameter = Math.max(0.02, shape.radius * 2);
      mesh.scale.setScalar(diameter / 2);
    }
    group.add(mesh);
  }

  group.userData.disposeWorldTriggerVolumes = () => {
    sphereGeometry.dispose();
    boxGeometry.dispose();
    activeMaterial.dispose();
    disabledMaterial.dispose();
    group.clear();
  };
  return group;
}

export function disposeWorldTriggerVolumeGroup(group: THREE.Group | null | undefined): void {
  if (!group) return;
  const dispose = group.userData.disposeWorldTriggerVolumes;
  if (typeof dispose === "function") dispose();
}
