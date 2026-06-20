/**
 * Stem Class (trunk or branch) for the Weber & Penn tree algorithm.
 * Vendored from hyperscape/packages/procgen/src/core/Stem.ts (core subset).
 */

import type { BezierSplinePoint } from "./Bezier";
import type { StemData, StemPoint } from "./types";

export class Stem {
  depth: number;
  curvePoints: BezierSplinePoint[];
  parent: Stem | null;
  offset: number;
  radiusLimit: number;
  children: Stem[];
  length: number;
  radius: number;
  lengthChildMax: number;
  index: number;

  constructor(
    depth: number,
    parent: Stem | null = null,
    offset = 0,
    radiusLimit = -1,
  ) {
    this.depth = depth;
    this.curvePoints = [];
    this.parent = parent;
    this.offset = offset;
    this.radiusLimit = radiusLimit;
    this.children = [];
    this.length = 0;
    this.radius = 0;
    this.lengthChildMax = 0;
    this.index = -1;
  }

  addChild(child: Stem): void {
    this.children.push(child);
  }

  copy(): Stem {
    const newStem = new Stem(
      this.depth,
      this.parent,
      this.offset,
      this.radiusLimit,
    );
    newStem.length = this.length;
    newStem.radius = this.radius;
    newStem.lengthChildMax = this.lengthChildMax;
    return newStem;
  }

  toData(radiusArray: number[]): StemData {
    if (radiusArray.length < this.curvePoints.length) {
      throw new Error(
        `[Stem.toData] radiusArray length (${radiusArray.length}) must match curvePoints length (${this.curvePoints.length})`,
      );
    }
    const points: StemPoint[] = this.curvePoints.map((cp, i) => ({
      position: cp.co.clone(),
      handleLeft: cp.handleLeft.clone(),
      handleRight: cp.handleRight.clone(),
      radius: radiusArray[i]!,
    }));

    return {
      depth: this.depth,
      points,
      parentIndex: this.parent?.index ?? null,
      offset: this.offset,
      radiusLimit: this.radiusLimit,
      childIndices: this.children.map((c) => c.index),
      length: this.length,
      radius: this.radius,
      lengthChildMax: this.lengthChildMax,
    };
  }
}

export function scaleBezierHandlesForFlare(
  stem: Stem,
  maxPointsPerSeg: number,
): void {
  for (const point of stem.curvePoints) {
    const handleLeftOffset = point.handleLeft.clone().sub(point.co);
    const handleRightOffset = point.handleRight.clone().sub(point.co);
    handleLeftOffset.divideScalar(maxPointsPerSeg);
    handleRightOffset.divideScalar(maxPointsPerSeg);
    point.handleLeft.copy(point.co).add(handleLeftOffset);
    point.handleRight.copy(point.co).add(handleRightOffset);
  }
}
