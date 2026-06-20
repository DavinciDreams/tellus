/**
 * Cost and placement computation for seam-aware decimation
 *
 * Computes the cost of collapsing an edge and the optimal placement
 * of the new vertex, taking into account seam preservation.
 */

import {
  type Bundle,
  type Vec2,
  type Vec3,
  type EdgeMap,
  type MapV5d,
  PlacementInfo5D,
  type Matrix,
} from "../types";
import { zeroMatrix, cloneMatrix, quadraticForm } from "../math/matrix";
import { solveQuadprog } from "../math/quadprog";
import {
  zeros,
  norm,
  sub,
  dot,
  midpoint,
  minCoeff,
  INF,
  EPS,
} from "../math/vector";
import { containsEdge } from "../mesh/edge-map";
import { getCombinedMetric } from "./quadric";

/**
 * Check if three UV points are collinear
 */
function isCollinear(tc1: Vec2, tc2: Vec2, tc3: Vec2): boolean {
  const n1 = sub(tc2, tc1);
  const n2 = sub(tc3, tc1);
  const len1 = norm(n1);
  const len2 = norm(n2);
  if (len1 < EPS || len2 < EPS) return true;

  // Normalize
  const n1Norm: Vec2 = [n1[0] / len1, n1[1] / len1];
  const n2Norm: Vec2 = [n2[0] / len2, n2[1] / len2];

  // Check if dot product is ~1 (parallel)
  return 1 - Math.abs(dot(n1Norm, n2Norm)) < EPS;
}

/**
 * Compute edge ratio for seam-aware strictness
 */
function edgeRatio(tc1: Vec2, tc2: Vec2, tc3: Vec2): number {
  const len1 = norm(sub(tc2, tc1));
  const len2 = norm(sub(tc3, tc2));
  if (len2 < EPS) return INF;
  return len1 / len2;
}

/**
 * Compute cost and placement for an edge collapse using 5D QSlim metric
 *
 * @param bundle Half-edge bundle for the edge
 * @param V Vertex positions
 * @param F Face indices
 * @param TC Texture coordinates
 * @param FT Face texture indices
 * @param seamEdges Seam edge map
 * @param Vmetrics Per-vertex 5D metrics
 * @param seamAwareDegree Strictness level (0, 1, or 2)
 * @returns {cost, placement} - cost of collapse and optimal placement info
 */
export function costAndPlacement5D(
  bundle: Bundle,
  V: Vec3[],
  F: [number, number, number][],
  TC: Vec2[],
  FT: [number, number, number][],
  seamEdges: EdgeMap,
  Vmetrics: MapV5d,
  seamAwareDegree: 0 | 1 | 2,
): { cost: number; placement: PlacementInfo5D } {
  const placement = new PlacementInfo5D();

  // Check for infinity vertex (used for boundary handling)
  const hasInfinityVertex = V.length > 0 && minCoeff(V[V.length - 1]) === INF;

  if (bundle.length < 2) {
    return { cost: INF, placement };
  }

  // Check if either endpoint is the infinity vertex
  if (
    hasInfinityVertex &&
    (bundle[0].p[0].vi === V.length - 1 || bundle[0].p[1].vi === V.length - 1)
  ) {
    return { cost: INF, placement };
  }

  // Get the two vertex indices on one side of the edge
  const vi = [bundle[0].p[0].vi, bundle[0].p[1].vi];

  // If both vertices are seam vertices but there's no seam edge between them, don't collapse
  if (
    seamEdges.has(vi[0]) &&
    seamEdges.has(vi[1]) &&
    !containsEdge(seamEdges, vi[0], vi[1])
  ) {
    return { cost: INF, placement };
  }

  // Case 1: Edge is on a seam
  if (containsEdge(seamEdges, vi[0], vi[1])) {
    return computeSeamEdgeCost(
      bundle,
      V,
      TC,
      seamEdges,
      Vmetrics,
      seamAwareDegree,
      vi,
    );
  }

  // Case 2: Regular edge (not on seam)
  return computeRegularEdgeCost(bundle, V, TC, seamEdges, Vmetrics, vi);
}

/**
 * Compute cost for an edge that lies on a seam
 */
function computeSeamEdgeCost(
  bundle: Bundle,
  V: Vec3[],
  TC: Vec2[],
  seamEdges: EdgeMap,
  Vmetrics: MapV5d,
  seamAwareDegree: 0 | 1 | 2,
  vi: number[],
): { cost: number; placement: PlacementInfo5D } {
  const placement = new PlacementInfo5D();

  // Get endpoints for both sides
  const eP0: [{ vi: number; tci: number }, { vi: number; tci: number }] = [
    { vi: bundle[0].p[0].vi, tci: bundle[0].p[0].tci },
    { vi: bundle[1].p[0].vi, tci: bundle[1].p[0].tci },
  ];
  const eP1: [{ vi: number; tci: number }, { vi: number; tci: number }] = [
    { vi: bundle[0].p[1].vi, tci: bundle[0].p[1].tci },
    { vi: bundle[1].p[1].vi, tci: bundle[1].p[1].tci },
  ];

  // Combined metrics for both sides
  const m: Matrix[] = [];
  for (let side = 0; side < 2; side++) {
    m.push(
      getCombinedMetric(
        Vmetrics,
        eP0[side].vi,
        eP0[side].tci,
        eP1[side].vi,
        eP1[side].tci,
      ),
    );
  }

  // Check which ends are "free" to collapse
  const isFree = [false, false];

  for (let end = 0; end < 2; end++) {
    const seamNeighbors = seamEdges.get(vi[end]);
    if (!seamNeighbors || seamNeighbors.size !== 2) continue;

    for (const vj of seamNeighbors) {
      if (vj === vi[1 - end]) continue;

      const vjMetrics = Vmetrics.get(vj);
      if (!vjMetrics) continue;

      const ratio: number[] = [INF, INF];

      for (const [tcj] of vjMetrics) {
        const tc_e0_0 = TC[eP0[0].tci];
        const tc_e1_0 = TC[eP1[0].tci];
        const tc_e0_1 = TC[eP0[1].tci];
        const tc_e1_1 = TC[eP1[1].tci];
        const tcj_val = TC[tcj];

        if (isCollinear(tcj_val, tc_e0_0, tc_e1_0)) {
          ratio[0] = edgeRatio(tcj_val, tc_e0_0, tc_e1_0);
        }
        if (isCollinear(tcj_val, tc_e0_1, tc_e1_1)) {
          ratio[1] = edgeRatio(tcj_val, tc_e1_1, tc_e0_1);
        }
      }

      switch (seamAwareDegree) {
        case 0:
          isFree[end] = true;
          break;
        case 1:
          if (ratio[0] !== INF && ratio[1] !== INF) {
            isFree[end] = true;
          }
          break;
        case 2:
          if (
            ratio[0] !== INF &&
            ratio[1] !== INF &&
            Math.abs(ratio[0] - ratio[1]) <= 1e-3
          ) {
            isFree[end] = true;
          }
          break;
      }
    }
  }

  // Neither end is free - can't collapse
  if (!isFree[0] && !isFree[1]) {
    return { cost: INF, placement };
  }

  // If one end is not free, collapse to that end
  for (let end = 0; end < 2; end++) {
    if (!isFree[end]) {
      let cost = 0;
      placement.tcs = [];
      placement.metrics = [];

      for (let side = 0; side < 2; side++) {
        const v6 = [
          ...V[vi[end]],
          ...(bundle[side].p[end].vi === vi[end]
            ? TC[bundle[side].p[end].tci]
            : TC[bundle[side].p[1 - end].tci]),
          1,
        ];
        cost += quadraticForm(v6, m[side]);
        placement.p = V[vi[end]] as Vec3;
        placement.tcs.push(
          bundle[side].p[end].vi === vi[end]
            ? (TC[bundle[side].p[end].tci] as Vec2)
            : (TC[bundle[side].p[1 - end].tci] as Vec2),
        );
        placement.metrics.push(m[side]);
      }

      return { cost, placement };
    }
  }

  // Both ends are free - optimize placement along the seam
  return computeSeamOptimalPlacement(bundle, V, TC, eP0, eP1, m);
}

/**
 * Compute optimal placement when both seam endpoints are free
 */
function computeSeamOptimalPlacement(
  bundle: Bundle,
  V: Vec3[],
  TC: Vec2[],
  eP0: [{ vi: number; tci: number }, { vi: number; tci: number }],
  eP1: [{ vi: number; tci: number }, { vi: number; tci: number }],
  m: Matrix[],
): { cost: number; placement: PlacementInfo5D } {
  const placement = new PlacementInfo5D();

  // Build combined 8x8 metric for (x, y, z, u0, v0, u1, v1, 1)
  const G = zeroMatrix(8, 8);

  // Position part (3x3)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      G[i][j] = m[0][i][j] + m[1][i][j];
    }
  }

  // Side 0 UV (at positions 3,4)
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 3; j++) {
      G[3 + i][j] = m[0][3 + i][j];
      G[j][3 + i] = m[0][j][3 + i];
    }
    for (let j = 0; j < 2; j++) {
      G[3 + i][3 + j] = m[0][3 + i][3 + j];
    }
  }

  // Side 1 UV (at positions 5,6)
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 3; j++) {
      G[5 + i][j] = m[1][3 + i][j];
      G[j][5 + i] = m[1][j][3 + i];
    }
    for (let j = 0; j < 2; j++) {
      G[5 + i][5 + j] = m[1][3 + i][3 + j];
    }
  }

  // Linear terms (row/col 7)
  const b = zeros(7);
  for (let i = 0; i < 3; i++) {
    b[i] = m[0][5][i] + m[1][5][i];
  }
  for (let i = 0; i < 2; i++) {
    b[3 + i] = m[0][5][3 + i];
    b[5 + i] = m[1][5][3 + i];
  }
  for (let i = 0; i < 7; i++) {
    G[7][i] = b[i];
    G[i][7] = b[i];
  }
  G[7][7] = m[0][5][5] + m[1][5][5];

  // Add regularizer
  const w = 1e-6;
  for (let i = 0; i < 8; i++) {
    G[i][i] += w;
  }

  // Initial guess at midpoint
  const g0 = zeros(8);
  const midPos = midpoint(V[eP0[0].vi], V[eP1[0].vi]);
  const midUV0 = midpoint(TC[eP0[0].tci], TC[eP1[0].tci]);
  const midUV1 = midpoint(TC[eP0[1].tci], TC[eP1[1].tci]);
  g0[0] = -w * midPos[0];
  g0[1] = -w * midPos[1];
  g0[2] = -w * midPos[2];
  g0[3] = -w * midUV0[0];
  g0[4] = -w * midUV0[1];
  g0[5] = -w * midUV1[0];
  g0[6] = -w * midUV1[1];
  g0[7] = -w;

  // Equality constraints: x[7] = 1, and UV parameter constraints
  const vec0: Vec2 = [
    TC[eP1[0].tci][0] - TC[eP0[0].tci][0],
    TC[eP1[0].tci][1] - TC[eP0[0].tci][1],
  ];
  const vec1: Vec2 = [
    TC[eP1[1].tci][0] - TC[eP0[1].tci][0],
    TC[eP1[1].tci][1] - TC[eP0[1].tci][1],
  ];

  // Build equality constraint matrix CE (8 x 4)
  const CE = zeroMatrix(8, 4);
  const ce0 = zeros(4);

  // Constraint 1: x[7] = 1
  CE[7][0] = 1;
  ce0[0] = -1;

  // Constraints 2-4: UV parameter synchronization
  if (Math.abs(vec0[0]) > EPS) {
    CE[3][1] = -vec0[1];
    CE[4][1] = vec0[0];
    ce0[1] = vec0[1] * TC[eP0[0].tci][0] - vec0[0] * TC[eP0[0].tci][1];

    CE[3][2] = -vec1[0];
    CE[5][2] = vec0[0];
    ce0[2] = vec1[0] * TC[eP0[0].tci][0] - vec0[0] * TC[eP0[1].tci][0];

    CE[3][3] = -vec1[1];
    CE[6][3] = vec0[0];
    ce0[3] = vec1[1] * TC[eP0[0].tci][0] - vec0[0] * TC[eP0[1].tci][1];
  } else if (Math.abs(vec0[1]) > EPS) {
    CE[4][1] = -vec0[0];
    CE[3][1] = vec0[1];
    ce0[1] = vec0[0] * TC[eP0[0].tci][1] - vec0[1] * TC[eP0[0].tci][0];

    CE[4][2] = -vec1[0];
    CE[5][2] = vec0[1];
    ce0[2] = vec1[0] * TC[eP0[0].tci][1] - vec0[1] * TC[eP0[1].tci][0];

    CE[4][3] = -vec1[1];
    CE[6][3] = vec0[1];
    ce0[3] = vec1[1] * TC[eP0[0].tci][1] - vec0[1] * TC[eP0[1].tci][1];
  }

  // Inequality constraints: t in [0, 1]
  const CI = zeroMatrix(8, 2);
  const ci0 = zeros(2);

  if (Math.abs(vec0[0]) > EPS) {
    const sign = vec0[0] > 0 ? 1 : -1;
    CI[3][0] = sign;
    ci0[0] = -sign * TC[eP0[0].tci][0];
    CI[3][1] = -sign;
    ci0[1] = sign * (TC[eP0[0].tci][0] + vec0[0]);
  } else if (Math.abs(vec0[1]) > EPS) {
    const sign = vec0[1] > 0 ? 1 : -1;
    CI[4][0] = sign;
    ci0[0] = -sign * TC[eP0[0].tci][1];
    CI[4][1] = -sign;
    ci0[1] = sign * (TC[eP0[0].tci][1] + vec0[1]);
  }

  // Solve QP
  const result = solveQuadprog(G, g0, CE, ce0, CI, ci0);

  if (
    result.x.length < 7 ||
    !Number.isFinite(result.x[0]) ||
    !Number.isFinite(result.x[3])
  ) {
    return { cost: INF, placement };
  }

  placement.p = [result.x[0], result.x[1], result.x[2]];
  placement.tcs = [
    [result.x[3], result.x[4]],
    [result.x[5], result.x[6]],
  ];
  placement.metrics = [m[0], m[1]];

  // Compute cost
  const cost = quadraticForm(result.x, G);

  return { cost, placement };
}

/**
 * Compute cost for a regular (non-seam) edge
 */
function computeRegularEdgeCost(
  bundle: Bundle,
  V: Vec3[],
  TC: Vec2[],
  seamEdges: EdgeMap,
  Vmetrics: MapV5d,
  vi: number[],
): { cost: number; placement: PlacementInfo5D } {
  const placement = new PlacementInfo5D();

  // Check that both sides have the same vertices (non-seam edge)
  if (
    !bundle[0].p[0].equals(bundle[1].p[1]) ||
    !bundle[0].p[1].equals(bundle[1].p[0])
  ) {
    // This shouldn't happen for a non-seam edge
    return { cost: INF, placement };
  }

  const tci = [bundle[0].p[0].tci, bundle[0].p[1].tci];
  const newMetric = getCombinedMetric(Vmetrics, vi[0], tci[0], vi[1], tci[1]);

  // If one vertex is on a seam (but the edge is not), collapse to the seam vertex
  for (let end = 0; end < 2; end++) {
    if (seamEdges.has(vi[end]) && !seamEdges.has(vi[1 - end])) {
      const v6 = [...V[vi[end]], ...TC[tci[end]], 1];
      const cost = quadraticForm(v6, newMetric);

      placement.p = V[vi[end]] as Vec3;
      placement.tcs = [TC[tci[end]] as Vec2];
      placement.metrics = [newMetric];

      return { cost, placement };
    }
  }

  // Neither vertex is on a seam - solve for optimal position
  const w = 1e-6;
  const G = cloneMatrix(newMetric);

  // Add regularizer
  for (let i = 0; i < 6; i++) {
    G[i][i] += w;
  }

  // Initial guess at midpoint
  const g0 = zeros(6);
  const midPos = midpoint(V[vi[0]], V[vi[1]]);
  const midUV = midpoint(TC[tci[0]], TC[tci[1]]);
  g0[0] = -w * midPos[0];
  g0[1] = -w * midPos[1];
  g0[2] = -w * midPos[2];
  g0[3] = -w * midUV[0];
  g0[4] = -w * midUV[1];
  g0[5] = -w;

  // Equality constraint: x[5] = 1
  const CE = zeroMatrix(6, 1);
  CE[5][0] = 1;
  const ce0 = [-1];

  // No inequality constraints
  const CI: Matrix = [];
  const ci0: number[] = [];

  const result = solveQuadprog(G, g0, CE, ce0, CI, ci0);

  if (
    result.x.length < 5 ||
    !Number.isFinite(result.x[0]) ||
    !Number.isFinite(result.x[3])
  ) {
    // Fallback to midpoint
    placement.p = midPos;
    placement.tcs = [midUV];
    placement.metrics = [newMetric];
    const v6 = [...midPos, ...midUV, 1];
    return { cost: quadraticForm(v6, newMetric), placement };
  }

  placement.p = [result.x[0], result.x[1], result.x[2]];
  placement.tcs = [[result.x[3], result.x[4]]];
  placement.metrics = [newMetric];

  const cost = quadraticForm(result.x, newMetric);

  return { cost, placement };
}
