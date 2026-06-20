/**
 * Quadric Error Metric computation
 *
 * Implements the QEM for 5D vertices (3D position + 2D UV)
 * Based on Section 5.1 of the Seamless paper
 */

import type { Matrix, Vec2, Vec3, Vec5, MapV5d } from "../types";
import { zeroMatrix, addMatrix, setBlock, outer } from "../math/matrix";
import { sub, dot, norm, scale, makeVec5 } from "../math/vector";

const EPS = 1e-7;

/**
 * Compute basic 4x4 quadric error metric for 3D vertices
 * Returns one 4x4 metric per vertex
 */
export function computeQuadricErrorMetric3D(
  V: Vec3[],
  F: [number, number, number][],
): Matrix[] {
  const Q: Matrix[] = [];

  // Initialize with zero matrices
  for (let i = 0; i < V.length; i++) {
    Q.push(zeroMatrix(4, 4));
  }

  // For each face, compute plane equation and accumulate metric
  for (const face of F) {
    const v1 = V[face[0]];
    const v2 = V[face[1]];
    const v3 = V[face[2]];

    // Compute plane normal
    const e1: Vec3 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    const e2: Vec3 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
    const n: Vec3 = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ];

    // Normalize
    const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
    if (len < EPS) continue; // Skip degenerate triangles

    n[0] /= len;
    n[1] /= len;
    n[2] /= len;

    // Plane equation: ax + by + cz + d = 0
    const d = -(n[0] * v1[0] + n[1] * v1[1] + n[2] * v1[2]);
    const p = [n[0], n[1], n[2], d];

    // Metric = p * p^T
    const metric = outer(p, p);

    // Add to each vertex of the face
    Q[face[0]] = addMatrix(Q[face[0]], metric);
    Q[face[1]] = addMatrix(Q[face[1]], metric);
    Q[face[2]] = addMatrix(Q[face[2]], metric);
  }

  return Q;
}

/**
 * Compute 5D metric for a single face
 * Returns a 6x6 metric matrix for vertices in (x, y, z, u, v, 1) form
 */
function computeFaceMetric5D(p1: Vec5, p2: Vec5, p3: Vec5): Matrix {
  // Paper Section 5.1: Construct orthonormal basis in 5D
  const v12 = sub(p2, p1);
  const e1Norm = norm(v12);
  if (e1Norm < EPS) {
    return zeroMatrix(6, 6);
  }
  const e1 = scale(v12, 1 / e1Norm);

  // e2 = (p3 - p1) - (e1 . (p3 - p1)) * e1, then normalize
  const v13 = sub(p3, p1);
  const proj = scale(e1, dot(e1, v13));
  const e2Raw = sub(v13, proj);
  const e2Norm = norm(e2Raw);
  if (e2Norm < EPS) {
    return zeroMatrix(6, 6);
  }
  const e2 = scale(e2Raw, 1 / e2Norm);

  // Paper Section 3.4: Construct the metric
  // A = I - e1*e1^T - e2*e2^T
  const I = [
    [1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 0, 1],
  ];
  const e1e1T = outer(e1, e1);
  const e2e2T = outer(e2, e2);

  const A: Matrix = zeroMatrix(5, 5);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      A[i][j] = I[i][j] - e1e1T[i][j] - e2e2T[i][j];
    }
  }

  // b = (p1 . e1) * e1 + (p1 . e2) * e2 - p1
  const p1DotE1 = dot(p1, e1);
  const p1DotE2 = dot(p1, e2);
  const b: number[] = [];
  for (let i = 0; i < 5; i++) {
    b.push(p1DotE1 * e1[i] + p1DotE2 * e2[i] - p1[i]);
  }

  // c = p1 . p1 - (p1 . e1)^2 - (p1 . e2)^2
  const c = dot(p1, p1) - p1DotE1 * p1DotE1 - p1DotE2 * p1DotE2;

  // Construct 6x6 metric:
  // [ A   b ]
  // [ b^T c ]
  const metric = zeroMatrix(6, 6);
  setBlock(metric, 0, 0, A);
  for (let i = 0; i < 5; i++) {
    metric[i][5] = b[i];
    metric[5][i] = b[i];
  }
  metric[5][5] = c;

  return metric;
}

/**
 * Compute 5D quadric error metric for each vertex
 * Returns a map: vertex index -> texture coord index -> 6x6 metric
 */
export function computeHalfEdgeQSlim5D(
  V: Vec3[],
  F: [number, number, number][],
  TC: Vec2[],
  FT: [number, number, number][],
): MapV5d {
  const hashQ: MapV5d = new Map();

  for (let fi = 0; fi < F.length; fi++) {
    // Construct 5D points for this face
    const p1 = makeVec5(V[F[fi][0]], TC[FT[fi][0]]);
    const p2 = makeVec5(V[F[fi][1]], TC[FT[fi][1]]);
    const p3 = makeVec5(V[F[fi][2]], TC[FT[fi][2]]);

    // Compute face metric
    const metric = computeFaceMetric5D(p1, p2, p3);

    // Assign metric to each 5D vertex (vi, ti pair)
    for (let j = 0; j < 3; j++) {
      const vi = F[fi][j];
      const ti = FT[fi][j];

      if (!hashQ.has(vi)) {
        hashQ.set(vi, new Map());
      }

      const vertexMetrics = hashQ.get(vi)!;
      if (!vertexMetrics.has(ti)) {
        vertexMetrics.set(ti, metric);
      } else {
        // Add to existing metric
        vertexMetrics.set(ti, addMatrix(vertexMetrics.get(ti)!, metric));
      }
    }
  }

  return hashQ;
}

/**
 * Get the combined metric for two vertices being merged
 */
export function getCombinedMetric(
  Vmetrics: MapV5d,
  vi1: number,
  tci1: number,
  vi2: number,
  tci2: number,
): Matrix {
  const m1 = Vmetrics.get(vi1)?.get(tci1) ?? zeroMatrix(6, 6);
  const m2 = Vmetrics.get(vi2)?.get(tci2) ?? zeroMatrix(6, 6);
  return addMatrix(m1, m2);
}
