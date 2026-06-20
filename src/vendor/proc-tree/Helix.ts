/**
 * Helix Calculation Utilities (for branches when curveV < 0).
 * Vendored from hyperscape/packages/procgen/src/math/Helix.ts.
 */

import * as THREE from "three";
import type { SeededRandom } from "./Random";
import { randInRange } from "./Random";

export type HelixPoints = {
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  axis: THREE.Vector3;
};

export function calcHelixPoints(
  turtleDir: THREE.Vector3,
  radius: number,
  pitch: number,
  rng: SeededRandom,
): HelixPoints {
  const points: THREE.Vector3[] = [
    new THREE.Vector3(0, -radius, -pitch / 4),
    new THREE.Vector3((4 * radius) / 3, -radius, 0),
    new THREE.Vector3((4 * radius) / 3, radius, 0),
    new THREE.Vector3(0, radius, pitch / 4),
  ];

  const trf = createTrackQuaternion(turtleDir);

  const spinAngle = randInRange(rng, 0, 2 * Math.PI);
  const rotQuat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    spinAngle,
  );

  for (const p of points) {
    p.applyQuaternion(rotQuat);
    p.applyQuaternion(trf);
  }

  return {
    p0: points[1]!.clone().sub(points[0]!),
    p1: points[2]!.clone().sub(points[0]!),
    p2: points[3]!.clone().sub(points[0]!),
    axis: turtleDir.clone(),
  };
}

function createTrackQuaternion(direction: THREE.Vector3): THREE.Quaternion {
  const forward = direction.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);

  if (Math.abs(forward.dot(up)) > 0.99) {
    up.set(1, 0, 0);
  }

  const right = new THREE.Vector3().crossVectors(up, forward).normalize();
  const actualUp = new THREE.Vector3().crossVectors(forward, right).normalize();

  const matrix = new THREE.Matrix4();
  matrix.makeBasis(right, actualUp, forward);

  const quat = new THREE.Quaternion();
  quat.setFromRotationMatrix(matrix);
  return quat;
}

export function calcHelixPitch(
  stemLength: number,
  curveRes: number,
  rng: SeededRandom,
): number {
  return ((2 * stemLength) / curveRes) * randInRange(rng, 0.8, 1.2);
}

export function calcHelixRadius(
  pitch: number,
  curveV: number,
  rng: SeededRandom,
): number {
  const tanAngle = Math.tan(((90 - Math.abs(curveV)) * Math.PI) / 180);
  return ((3 * pitch) / (16 * tanAngle)) * randInRange(rng, 0.8, 1.2);
}
