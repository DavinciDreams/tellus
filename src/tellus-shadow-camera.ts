import * as THREE from "three";

export type DirectionalShadowCameraFit = {
  focus: { x: number; y: number; z: number };
  halfExtent: number;
  texelWorldSize: number;
  casterCountBounds: boolean;
  near: number;
  far: number;
};

export type DirectionalShadowCameraFitOptions = {
  padding?: number;
  fallbackRadius?: number;
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);

function corners(bounds: THREE.Box3): THREE.Vector3[] {
  const { min, max } = bounds;
  return [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z),
  ];
}

/** Fits and texel-snaps a directional shadow camera around the selected caster pool. */
export function fitDirectionalShadowCamera(
  light: THREE.DirectionalLight,
  sunOffset: THREE.Vector3,
  casterBounds: THREE.Box3 | null,
  fallbackFocus: THREE.Vector3,
  options: DirectionalShadowCameraFitOptions = {},
): DirectionalShadowCameraFit {
  const padding = Math.max(0, options.padding ?? 6);
  const fallbackRadius = Math.max(1, options.fallbackRadius ?? 24);
  const bounds = casterBounds?.isEmpty() === false
    ? casterBounds.clone()
    : new THREE.Box3(
        new THREE.Vector3(
          fallbackFocus.x - fallbackRadius,
          fallbackFocus.y - fallbackRadius * 0.5,
          fallbackFocus.z - fallbackRadius,
        ),
        new THREE.Vector3(
          fallbackFocus.x + fallbackRadius,
          fallbackFocus.y + fallbackRadius * 0.5,
          fallbackFocus.z + fallbackRadius,
        ),
      );
  const focus = bounds.getCenter(new THREE.Vector3());
  const forward = sunOffset.clone().normalize();
  const right = new THREE.Vector3().crossVectors(WORLD_UP, forward);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  else right.normalize();
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();

  let halfWidth = 0;
  let halfHeight = 0;
  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;
  for (const corner of corners(bounds)) {
    corner.sub(focus);
    halfWidth = Math.max(halfWidth, Math.abs(corner.dot(right)));
    halfHeight = Math.max(halfHeight, Math.abs(corner.dot(up)));
    const depth = corner.dot(forward);
    minDepth = Math.min(minDepth, depth);
    maxDepth = Math.max(maxDepth, depth);
  }

  const halfExtent = Math.max(1, halfWidth, halfHeight) + padding;
  const mapWidth = Math.max(1, light.shadow.mapSize.x);
  const texelWorldSize = (halfExtent * 2) / mapWidth;
  const snappedFocus = focus.clone();
  const rightCoordinate = focus.dot(right);
  const upCoordinate = focus.dot(up);
  snappedFocus
    .addScaledVector(right, Math.round(rightCoordinate / texelWorldSize) * texelWorldSize - rightCoordinate)
    .addScaledVector(up, Math.round(upCoordinate / texelWorldSize) * texelWorldSize - upCoordinate);

  light.target.position.copy(snappedFocus);
  light.position.copy(snappedFocus).add(sunOffset);
  light.target.updateMatrixWorld();
  light.updateMatrixWorld();

  const camera = light.shadow.camera;
  camera.left = -halfExtent;
  camera.right = halfExtent;
  camera.top = halfExtent;
  camera.bottom = -halfExtent;
  camera.near = 0.5;
  camera.far = Math.max(
    50,
    sunOffset.length() + Math.max(0, maxDepth - minDepth) + padding * 2,
  );
  camera.updateProjectionMatrix();

  return {
    focus: { x: snappedFocus.x, y: snappedFocus.y, z: snappedFocus.z },
    halfExtent,
    texelWorldSize,
    casterCountBounds: casterBounds?.isEmpty() === false,
    near: camera.near,
    far: camera.far,
  };
}
