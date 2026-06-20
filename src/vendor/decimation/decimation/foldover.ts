/**
 * Foldover detection utilities
 *
 * Detects when an edge collapse would cause UV triangles to flip orientation
 */

import type { Vec2 } from "../types";

const EPS = 1e-10;

/**
 * Check if two points are on the same side of a line
 * Line is defined by two points uv1 and uv2
 * @returns true if p1 and p2 are on the same side of line(uv1, uv2)
 */
export function twoPointsOnSameSide(
  uv1: Vec2,
  uv2: Vec2,
  p1: Vec2,
  p2: Vec2,
): boolean {
  // Handle degenerate case where uv1 == uv2
  if (Math.abs(uv1[0] - uv2[0]) < EPS && Math.abs(uv1[1] - uv2[1]) < EPS) {
    return true;
  }

  // If the line is vertical (x coordinates are same)
  if (Math.abs(uv1[0] - uv2[0]) < EPS) {
    // Check if p1 and p2 are on opposite sides
    const d1 = uv1[0] - p1[0];
    const d2 = uv1[0] - p2[0];
    return d1 * d2 > -EPS;
  }

  // General case: line equation y = kx + b
  const k = (uv2[1] - uv1[1]) / (uv2[0] - uv1[0]);
  const b = uv1[1] - uv1[0] * k;

  // Distance from line (signed)
  const d1 = p1[0] * k + b - p1[1];
  const d2 = p2[0] * k + b - p2[1];

  // Same side if both distances have the same sign (or one is zero)
  return d1 * d2 > -EPS;
}

/**
 * Compute the signed area of a 2D triangle
 * Positive if counter-clockwise, negative if clockwise
 */
export function signedTriangleArea(a: Vec2, b: Vec2, c: Vec2): number {
  return 0.5 * ((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
}

/**
 * Check if moving a vertex would cause any of its adjacent triangles to fold over
 * @param oldUV Original UV position
 * @param newUV New UV position after collapse
 * @param neighborUVs UVs of the vertices forming the boundary of the 1-ring
 * @returns true if no foldover would occur
 */
export function checkNoFoldover(
  oldUV: Vec2,
  newUV: Vec2,
  neighborUVs: [Vec2, Vec2][],
): boolean {
  for (const [uv1, uv2] of neighborUVs) {
    // The triangle (oldUV, uv1, uv2) should have the same orientation as (newUV, uv1, uv2)
    const oldArea = signedTriangleArea(oldUV, uv1, uv2);
    const newArea = signedTriangleArea(newUV, uv1, uv2);

    // If signs differ, orientation flipped (foldover)
    if (oldArea * newArea < -EPS) {
      return false;
    }
  }
  return true;
}

/**
 * Check if a proposed edge collapse would cause UV foldover
 * Uses the same-side test for boundary edges
 */
export function wouldCauseFoldover(
  vertexUV: Vec2,
  newUV: Vec2,
  boundaryEdgeUV1: Vec2,
  boundaryEdgeUV2: Vec2,
): boolean {
  return !twoPointsOnSameSide(
    boundaryEdgeUV1,
    boundaryEdgeUV2,
    vertexUV,
    newUV,
  );
}
