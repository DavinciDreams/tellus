import * as THREE from "three";
import type { RenderPressureSnapshot } from "./tellus-render-pressure";

// A 112 m span keeps the broader grounding seen in review while improving effective texel density
// from ~14 cm to ~11 cm at the existing 1024-square map. Raising the map to 2048 would quadruple
// shadow-map pixels, so nearby structural casters stay in a smaller participation radius instead.
export const TELLUS_SHADOW_RADIUS = 56;
export const TELLUS_SHADOW_MAP_SIZE = 1024;
export const TELLUS_SHADOW_TEXEL_WORLD_SIZE =
  (TELLUS_SHADOW_RADIUS * 2) / TELLUS_SHADOW_MAP_SIZE;
export const TELLUS_SHADOW_SUN_INVALIDATION_RADIANS = THREE.MathUtils.degToRad(0.2);

const DEFAULT_SUN_DIRECTION = new THREE.Vector3(-0.6, 0.65, 0.45).normalize();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface TellusShadowProjection {
  desiredFocus: THREE.Vector3;
  focus: THREE.Vector3;
  direction: THREE.Vector3;
  lightSpaceCellX: number;
  lightSpaceCellY: number;
  texelWorldSize: number;
}

export type TellusShadowInvalidationReason =
  | "configuration"
  | "region"
  | "sun"
  | "casters"
  | "dynamic";

export interface TellusShadowInvalidationController {
  invalidate(reason: TellusShadowInvalidationReason): void;
  observe(projection: TellusShadowProjection, casterRevision: number): void;
  shouldRefresh(pressure: RenderPressureSnapshot, nowMs: number): boolean;
  markRefreshed(nowMs: number): void;
  pendingReasons(): TellusShadowInvalidationReason[];
}

/** Keep one useful, bounded sun shadow around the player. */
export const configureTellusSunShadow = (sun: THREE.DirectionalLight): void => {
  const camera = sun.shadow.camera;
  camera.left = -TELLUS_SHADOW_RADIUS;
  camera.right = TELLUS_SHADOW_RADIUS;
  camera.top = TELLUS_SHADOW_RADIUS;
  camera.bottom = -TELLUS_SHADOW_RADIUS;
  camera.near = 1;
  camera.far = 240;
  camera.updateProjectionMatrix();
  sun.shadow.mapSize.set(TELLUS_SHADOW_MAP_SIZE, TELLUS_SHADOW_MAP_SIZE);
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.035;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
};

const lightSpaceBasis = (direction: THREE.Vector3) => {
  const right = new THREE.Vector3().crossVectors(WORLD_UP, direction);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  else right.normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  return { right, up };
};

/**
 * Snap the player focus in the shadow camera's light-space plane. This ties movement to exact
 * shadow-map texels for every sun angle; world-axis snapping cannot provide that guarantee.
 */
export const projectTellusShadowFocus = (
  x: number,
  y: number,
  z: number,
  directionInput: THREE.Vector3,
): TellusShadowProjection => {
  const direction = directionInput.lengthSq() > 1e-8
    ? directionInput.clone().normalize()
    : DEFAULT_SUN_DIRECTION.clone();
  const desired = new THREE.Vector3(x, y, z);
  const { right, up } = lightSpaceBasis(direction);
  const lightSpaceX = desired.dot(right);
  const lightSpaceY = desired.dot(up);
  const lightSpaceDepth = desired.dot(direction);
  const lightSpaceCellX = Math.round(lightSpaceX / TELLUS_SHADOW_TEXEL_WORLD_SIZE);
  const lightSpaceCellY = Math.round(lightSpaceY / TELLUS_SHADOW_TEXEL_WORLD_SIZE);
  const focus = right.multiplyScalar(lightSpaceCellX * TELLUS_SHADOW_TEXEL_WORLD_SIZE)
    .addScaledVector(up, lightSpaceCellY * TELLUS_SHADOW_TEXEL_WORLD_SIZE)
    // Translation along the light ray does not shift the map's texel grid, so preserve it exactly.
    .addScaledVector(direction, lightSpaceDepth);
  return {
    desiredFocus: desired,
    focus,
    direction,
    lightSpaceCellX,
    lightSpaceCellY,
    texelWorldSize: TELLUS_SHADOW_TEXEL_WORLD_SIZE,
  };
};

/**
 * The day/night cycle writes the sun position as a direction vector around world origin. Rebase
 * that vector onto a texel-stable player focus while retaining its lighting direction.
 */
export const focusTellusSunShadow = (
  sun: THREE.DirectionalLight,
  x: number,
  y: number,
  z: number,
): TellusShadowProjection => {
  const direction = sun.position.lengthSq() > 0.001
    ? sun.position.clone().normalize()
    : DEFAULT_SUN_DIRECTION.clone();
  const projection = projectTellusShadowFocus(x, y, z, direction);
  sun.target.position.copy(projection.focus);
  sun.position.copy(projection.focus).addScaledVector(projection.direction, 140);
  sun.target.updateMatrixWorld();
  return projection;
};

/**
 * Invalidation owns *when* a shadow pass is useful. The shared render-pressure snapshot owns the
 * cadence, avoiding a second FPS policy while still coalescing movement, actor, and streaming churn.
 */
export const createTellusShadowInvalidationController = (): TellusShadowInvalidationController => {
  const pending = new Set<TellusShadowInvalidationReason>(["configuration"]);
  let latestProjection: TellusShadowProjection | null = null;
  let renderedProjection: TellusShadowProjection | null = null;
  let latestCasterRevision = 0;
  let renderedCasterRevision = -1;
  let lastRefreshMs = Number.NEGATIVE_INFINITY;

  const invalidate = (reason: TellusShadowInvalidationReason) => pending.add(reason);

  const observe = (projection: TellusShadowProjection, casterRevision: number) => {
    latestProjection = {
      ...projection,
      desiredFocus: projection.desiredFocus.clone(),
      focus: projection.focus.clone(),
      direction: projection.direction.clone(),
    };
    latestCasterRevision = casterRevision;
    if (!renderedProjection) {
      invalidate("configuration");
      return;
    }
    // Reproject the last rendered player focus into the *current* light basis. Comparing raw cell
    // indices from two different sun bases would falsely classify slow daylight rotation as travel.
    const renderedInCurrentBasis = projectTellusShadowFocus(
      renderedProjection.desiredFocus.x,
      renderedProjection.desiredFocus.y,
      renderedProjection.desiredFocus.z,
      projection.direction,
    );
    if (
      projection.lightSpaceCellX !== renderedInCurrentBasis.lightSpaceCellX ||
      projection.lightSpaceCellY !== renderedInCurrentBasis.lightSpaceCellY
    ) invalidate("region");
    if (projection.direction.angleTo(renderedProjection.direction) >= TELLUS_SHADOW_SUN_INVALIDATION_RADIANS) {
      invalidate("sun");
    }
    if (casterRevision !== renderedCasterRevision) invalidate("casters");
  };

  const shouldRefresh = (pressure: RenderPressureSnapshot, nowMs: number) =>
    pending.size > 0 && (
      !Number.isFinite(lastRefreshMs) ||
      nowMs - lastRefreshMs >= pressure.work.movingIntervalMs
    );

  const markRefreshed = (nowMs: number) => {
    if (!latestProjection) return;
    renderedProjection = {
      ...latestProjection,
      desiredFocus: latestProjection.desiredFocus.clone(),
      focus: latestProjection.focus.clone(),
      direction: latestProjection.direction.clone(),
    };
    renderedCasterRevision = latestCasterRevision;
    lastRefreshMs = nowMs;
    pending.clear();
  };

  return {
    invalidate,
    observe,
    shouldRefresh,
    markRefreshed,
    pendingReasons: () => [...pending],
  };
};
