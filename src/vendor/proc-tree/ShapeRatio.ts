/**
 * Shape Ratio Functions (tree silhouette control, Weber & Penn).
 * Vendored from hyperscape/packages/procgen/src/core/ShapeRatio.ts (core subset).
 */

import { TreeShape, type TreeShapeType, type TreeParams } from "./types";

export function shapeRatio(
  shape: TreeShapeType,
  ratio: number,
  params?: TreeParams,
): number {
  switch (shape) {
    case TreeShape.Conical:
      return 0.2 + 0.8 * ratio;
    case TreeShape.Spherical:
      return 0.2 + 0.8 * Math.sin(Math.PI * ratio);
    case TreeShape.Hemispherical:
      return 0.2 + 0.8 * Math.sin(0.5 * Math.PI * ratio);
    case TreeShape.Cylindrical:
      return 1.0;
    case TreeShape.TaperedCylindrical:
      return 0.5 + 0.5 * ratio;
    case TreeShape.Flame:
      if (ratio <= 0.7) {
        return ratio / 0.7;
      } else {
        return (1.0 - ratio) / 0.3;
      }
    case TreeShape.InverseConical:
      return 1.0 - 0.8 * ratio;
    case TreeShape.TendFlame:
      if (ratio <= 0.7) {
        return 0.5 + (0.5 * ratio) / 0.7;
      } else {
        return 0.5 + (0.5 * (1.0 - ratio)) / 0.3;
      }
    case TreeShape.Envelope:
      return envelopeShapeRatio(ratio, params);
    default:
      return 0.2 + 0.8 * ratio;
  }
}

function envelopeShapeRatio(ratio: number, params?: TreeParams): number {
  if (!params) {
    return 0.2 + 0.8 * ratio;
  }
  if (ratio < 0 || ratio > 1) {
    return 0.0;
  }
  const { pruneWidthPeak, prunePowerLow, prunePowerHigh } = params;
  if (ratio < 1 - pruneWidthPeak) {
    return Math.pow(ratio / (1 - pruneWidthPeak), prunePowerHigh);
  } else {
    return Math.pow((1 - ratio) / (1 - pruneWidthPeak), prunePowerLow);
  }
}

export function pointInsideEnvelope(
  point: { x: number; y: number; z: number },
  treeScale: number,
  baseSize: number,
  pruneWidth: number,
  params: TreeParams,
): boolean {
  const dist = Math.sqrt(point.x * point.x + point.y * point.y);
  const ratio = (treeScale - point.z) / (treeScale * (1 - baseSize));
  const envelopeRadius =
    treeScale * pruneWidth * shapeRatio(TreeShape.Envelope, ratio, params);
  return dist / treeScale < envelopeRadius / treeScale;
}
