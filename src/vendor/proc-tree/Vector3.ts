/**
 * Vector3 utilities for tree generation (Weber & Penn).
 * Vendored from hyperscape/packages/procgen/src/math/Vector3.ts (core subset).
 */

import type * as THREE from "three";

/** Declination angle (degrees) from +Z axis. */
export function declination(v: THREE.Vector3): number {
  const horizontalDist = Math.sqrt(v.x * v.x + v.y * v.y);
  return (Math.atan2(horizontalDist, v.z) * 180) / Math.PI;
}

export const DEG_TO_RAD = Math.PI / 180;

export function radians(degrees: number): number {
  return degrees * DEG_TO_RAD;
}
