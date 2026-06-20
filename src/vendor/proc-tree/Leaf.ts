/**
 * Leaf Class (leaf/blossom placement) for the Weber & Penn tree algorithm.
 * Vendored from hyperscape/packages/procgen/src/core/Leaf.ts (placement subset;
 * the TSL-bound transform/bend math is omitted — leaf cards are baked directly).
 */

import type * as THREE from "three";
import type { LeafData } from "./types";

export class Leaf {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  right: THREE.Vector3;
  isBlossom: boolean;

  constructor(
    position: THREE.Vector3,
    direction: THREE.Vector3,
    right: THREE.Vector3,
    isBlossom = false,
  ) {
    this.position = position.clone();
    this.direction = direction.clone().normalize();
    this.right = right.clone().normalize();
    this.isBlossom = isBlossom;
  }

  toData(): LeafData {
    return {
      position: this.position.clone(),
      direction: this.direction.clone(),
      right: this.right.clone(),
      isBlossom: this.isBlossom,
    };
  }
}
