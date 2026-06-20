/**
 * 3D Turtle Graphics for tree branch generation (Weber & Penn).
 * Vendored from hyperscape/packages/procgen/src/core/Turtle.ts (core subset).
 *
 * Coordinate system: dir forward, right perpendicular, up = dir × right.
 * The algorithm works in Z-up (Blender) space; conversion to Y-up happens at bake.
 */

import * as THREE from "three";
import { radians } from "./Vector3";

export class Turtle {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  right: THREE.Vector3;
  width: number;

  constructor(other?: Turtle) {
    if (other) {
      this.pos = other.pos.clone();
      this.dir = other.dir.clone();
      this.right = other.right.clone();
      this.width = other.width;
    } else {
      this.pos = new THREE.Vector3(0, 0, 0);
      this.dir = new THREE.Vector3(0, 0, 1);
      this.right = new THREE.Vector3(1, 0, 0);
      this.width = 0;
    }
  }

  get up(): THREE.Vector3 {
    return new THREE.Vector3().crossVectors(this.dir, this.right).normalize();
  }

  turnRight(angle: number): void {
    const axis = new THREE.Vector3()
      .crossVectors(this.dir, this.right)
      .normalize();
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(
      axis,
      radians(angle),
    );
    this.dir.applyQuaternion(rotQuat).normalize();
    this.right.applyQuaternion(rotQuat).normalize();
  }

  turnLeft(angle: number): void {
    this.turnRight(-angle);
  }

  pitchUp(angle: number): void {
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(
      this.right,
      radians(angle),
    );
    this.dir.applyQuaternion(rotQuat).normalize();
  }

  pitchDown(angle: number): void {
    this.pitchUp(-angle);
  }

  rollRight(angle: number): void {
    const rotQuat = new THREE.Quaternion().setFromAxisAngle(
      this.dir,
      radians(angle),
    );
    this.right.applyQuaternion(rotQuat).normalize();
  }

  move(distance: number): void {
    this.pos.addScaledVector(this.dir, distance);
  }

  clone(): Turtle {
    return new Turtle(this);
  }
}

export function applyTropism(
  turtle: Turtle,
  tropismVector: THREE.Vector3,
): void {
  const hCrossT = new THREE.Vector3().crossVectors(turtle.dir, tropismVector);
  const alpha = 10 * hCrossT.length();
  if (alpha < 0.0001) {
    return;
  }
  hCrossT.normalize();
  const rotQuat = new THREE.Quaternion().setFromAxisAngle(
    hCrossT,
    radians(alpha),
  );
  turtle.dir.applyQuaternion(rotQuat).normalize();
  turtle.right.applyQuaternion(rotQuat).normalize();
}

export function makeBranchPosTurtle(dirTurtle: Turtle, radius: number): Turtle {
  const posTurtle = new Turtle(dirTurtle);
  posTurtle.pitchDown(90);
  posTurtle.move(radius);
  return posTurtle;
}

export function makeBranchDirTurtle(
  parentTurtle: Turtle,
  tangent: THREE.Vector3,
  isHelix: boolean,
): Turtle {
  const branchTurtle = new Turtle();
  branchTurtle.dir.copy(tangent).normalize();

  if (isHelix) {
    const tangentD = tangent.clone().normalize();
    branchTurtle.right.crossVectors(branchTurtle.dir, tangentD);
  } else {
    const parentUp = new THREE.Vector3().crossVectors(
      parentTurtle.dir,
      parentTurtle.right,
    );
    branchTurtle.right.crossVectors(parentUp, branchTurtle.dir);
  }

  if (branchTurtle.right.lengthSq() < 0.001) {
    branchTurtle.right.set(1, 0, 0);
    if (Math.abs(branchTurtle.dir.x) > 0.9) {
      branchTurtle.right.set(0, 1, 0);
    }
    branchTurtle.right.crossVectors(branchTurtle.right, branchTurtle.dir);
  }
  branchTurtle.right.normalize();

  return branchTurtle;
}
