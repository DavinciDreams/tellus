/**
 * Bezier Curve Utilities for tree branch curves.
 * Vendored from hyperscape/packages/procgen/src/math/Bezier.ts (core subset,
 * Pool dependency removed).
 */

import * as THREE from "three";

export type BezierSplinePoint = {
  co: THREE.Vector3;
  handleLeft: THREE.Vector3;
  handleRight: THREE.Vector3;
};

export function calcPointOnBezier(
  offset: number,
  startPoint: BezierSplinePoint,
  endPoint: BezierSplinePoint,
): THREE.Vector3 {
  if (offset < 0 || offset > 1) {
    throw new Error(`Bezier offset out of range: ${offset} not between 0 and 1`);
  }

  const t = offset;
  const oneMinusT = 1 - t;

  const p0 = startPoint.co;
  const p1 = startPoint.handleRight;
  const p2 = endPoint.handleLeft;
  const p3 = endPoint.co;

  const c0 = oneMinusT * oneMinusT * oneMinusT;
  const c1 = 3 * oneMinusT * oneMinusT * t;
  const c2 = 3 * oneMinusT * t * t;
  const c3 = t * t * t;

  return new THREE.Vector3(
    c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x,
    c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y,
    c0 * p0.z + c1 * p1.z + c2 * p2.z + c3 * p3.z,
  );
}

export function calcTangentToBezier(
  offset: number,
  startPoint: BezierSplinePoint,
  endPoint: BezierSplinePoint,
): THREE.Vector3 {
  if (offset < 0 || offset > 1) {
    throw new Error(`Bezier offset out of range: ${offset} not between 0 and 1`);
  }

  const t = offset;
  const oneMinusT = 1 - t;

  const p0 = startPoint.co;
  const p1 = startPoint.handleRight;
  const p2 = endPoint.handleLeft;
  const p3 = endPoint.co;

  const c0 = 3 * oneMinusT * oneMinusT;
  const c1 = 6 * oneMinusT * t;
  const c2 = 3 * t * t;

  const d0x = p1.x - p0.x;
  const d0y = p1.y - p0.y;
  const d0z = p1.z - p0.z;

  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d1z = p2.z - p1.z;

  const d2x = p3.x - p2.x;
  const d2y = p3.y - p2.y;
  const d2z = p3.z - p2.z;

  return new THREE.Vector3(
    c0 * d0x + c1 * d1x + c2 * d2x,
    c0 * d0y + c1 * d1y + c2 * d2y,
    c0 * d0z + c1 * d1z + c2 * d2z,
  );
}
