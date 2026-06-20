/**
 * Edge collapse operations for mesh decimation
 */

import type { Vec2, Vec3, EdgeMap, MapV5d, PlacementInfo5D } from "../types";
import { NULL_INDEX, VertexBundle } from "../types";
import { containsEdge, collapseEdge, renameVertex } from "../mesh/edge-map";
import {
  getHalfEdgeBundle,
  edgeCollapseIsValid,
  circulation,
} from "../mesh/half-edge";
import { twoPointsOnSameSide } from "./foldover";

/**
 * Try to collapse an edge
 *
 * @returns true if collapse succeeded, false otherwise
 */
export function tryCollapseEdge(
  e: number,
  newPlacement: PlacementInfo5D,
  V: Vec3[],
  F: [number, number, number][],
  E: [number, number][],
  EMAP: number[],
  EF: [number, number][],
  EI: [number, number][],
  TC: Vec2[],
  FT: [number, number, number][],
  seamEdges: EdgeMap,
  Vmetrics: MapV5d,
): { success: boolean; e1: number; e2: number } {
  const result = { success: false, e1: -1, e2: -1 };
  const m = F.length;

  // Helper to kill an edge (mark as deleted)
  const killEdge = (ei: number) => {
    E[ei] = [NULL_INDEX, NULL_INDEX];
    EF[ei] = [NULL_INDEX, NULL_INDEX];
    EI[ei] = [NULL_INDEX, NULL_INDEX];
  };

  // Determine source and destination (always collapse larger to smaller)
  const eflip = E[e][0] > E[e][1] ? 1 : 0;
  const s = eflip ? E[e][1] : E[e][0];
  const d = eflip ? E[e][0] : E[e][1];

  if (s === NULL_INDEX || d === NULL_INDEX) {
    return result;
  }

  const collapseOnSeam = containsEdge(seamEdges, s, d);

  // Reject if both vertices are on seams but no seam edge between them
  if (seamEdges.has(s) && seamEdges.has(d) && !collapseOnSeam) {
    return result;
  }

  // Check link condition
  if (!edgeCollapseIsValid(e, F, E, EMAP, EF, EI)) {
    return result;
  }

  // Get 1-ring neighbors of d
  const nV2Fd = circulation(e, !eflip, EMAP, EF, EI, F);
  // Get 1-ring neighbors of s
  const nV2Fs = circulation(e, !!eflip, EMAP, EF, EI, F);

  // Get half-edge bundle
  const bundle = getHalfEdgeBundle(e, E, EF, EI, F, FT);
  if (bundle.length !== 2) {
    return result;
  }

  // Get texture coordinates for s and d
  let sTc = bundle[0].p[0].tci;
  let dTc = bundle[0].p[1].tci;
  if (bundle[0].p[0].vi === d) {
    [sTc, dTc] = [dTc, sTc];
  }

  // Test for UV foldover
  if (!collapseOnSeam && newPlacement.tcs.length > 0) {
    // Check neighbors of d
    for (let i = 1; i < nV2Fd.length - 1; i++) {
      const f = nV2Fd[i];
      for (let v = 0; v < 3; v++) {
        if (F[f][v] === d) {
          const uv: Vec2 = [TC[FT[f][v]][0], TC[FT[f][v]][1]];
          const uv1: Vec2 = [
            TC[FT[f][(v + 1) % 3]][0],
            TC[FT[f][(v + 1) % 3]][1],
          ];
          const uv2: Vec2 = [
            TC[FT[f][(v + 2) % 3]][0],
            TC[FT[f][(v + 2) % 3]][1],
          ];
          if (!twoPointsOnSameSide(uv1, uv2, uv, newPlacement.tcs[0])) {
            return result;
          }
        }
      }
    }

    // Check neighbors of s
    for (let i = 1; i < nV2Fs.length - 1; i++) {
      const f = nV2Fs[i];
      for (let v = 0; v < 3; v++) {
        if (F[f][v] === s) {
          const uv: Vec2 = [TC[FT[f][v]][0], TC[FT[f][v]][1]];
          const uv1: Vec2 = [
            TC[FT[f][(v + 1) % 3]][0],
            TC[FT[f][(v + 1) % 3]][1],
          ];
          const uv2: Vec2 = [
            TC[FT[f][(v + 2) % 3]][0],
            TC[FT[f][(v + 2) % 3]][1],
          ];
          if (!twoPointsOnSameSide(uv1, uv2, uv, newPlacement.tcs[0])) {
            return result;
          }
        }
      }
    }
  }

  // Perform the collapse
  if (collapseOnSeam) {
    if (newPlacement.tcs.length !== 2 || newPlacement.metrics.length !== 2) {
      return result;
    }

    // Move both vertices to new position
    V[s] = [...newPlacement.p] as Vec3;
    V[d] = [...newPlacement.p] as Vec3;

    // Update texture coordinates
    const he0Ts =
      bundle[0].p[0].vi === d ? bundle[0].p[1].tci : bundle[0].p[0].tci;
    const he0Td =
      bundle[0].p[0].vi === d ? bundle[0].p[0].tci : bundle[0].p[1].tci;
    TC[he0Ts] = [...newPlacement.tcs[0]] as Vec2;
    TC[he0Td] = [...newPlacement.tcs[0]] as Vec2;

    const he1Ts =
      bundle[1].p[0].vi === d ? bundle[1].p[1].tci : bundle[1].p[0].tci;
    const he1Td =
      bundle[1].p[0].vi === d ? bundle[1].p[0].tci : bundle[1].p[1].tci;
    TC[he1Ts] = [...newPlacement.tcs[1]] as Vec2;
    TC[he1Td] = [...newPlacement.tcs[1]] as Vec2;

    // Update metrics
    const dMetrics = Vmetrics.get(d);
    if (dMetrics) {
      dMetrics.delete(he0Td);
      dMetrics.delete(he1Td);

      let sMetrics = Vmetrics.get(s);
      if (!sMetrics) {
        sMetrics = new Map();
        Vmetrics.set(s, sMetrics);
      }
      for (const [key, value] of dMetrics) {
        sMetrics.set(key, value);
      }
    }
    Vmetrics.delete(d);

    const sMetrics = Vmetrics.get(s)!;
    sMetrics.set(he0Ts, newPlacement.metrics[0]);
    sMetrics.set(he1Ts, newPlacement.metrics[1]);
  } else {
    if (newPlacement.tcs.length !== 1 || newPlacement.metrics.length !== 1) {
      return result;
    }

    // Move vertices
    V[s] = [...newPlacement.p] as Vec3;
    V[d] = [...newPlacement.p] as Vec3;

    // Update texture coordinates
    TC[sTc] = [...newPlacement.tcs[0]] as Vec2;
    TC[dTc] = [...newPlacement.tcs[0]] as Vec2;

    // Update metrics
    const dMetrics = Vmetrics.get(d);
    let sMetrics = Vmetrics.get(s);
    if (!sMetrics) {
      sMetrics = new Map();
      Vmetrics.set(s, sMetrics);
    }

    if (dMetrics) {
      dMetrics.delete(dTc);
      for (const [key, value] of dMetrics) {
        sMetrics.set(key, value);
      }
    }
    Vmetrics.delete(d);
    sMetrics.set(sTc, newPlacement.metrics[0]);
  }

  // Update vertex bundles for later reference
  const sPair: [VertexBundle, VertexBundle] = [
    new VertexBundle(),
    new VertexBundle(),
  ];
  const dPair: [VertexBundle, VertexBundle] = [
    new VertexBundle(),
    new VertexBundle(),
  ];

  // Update edge and face connectivity
  for (let side = 0; side < 2; side++) {
    const f = EF[e][side];
    if (f === NULL_INDEX) continue;

    const v = EI[e][side];
    const sign = (eflip === 0 ? 1 : -1) * (1 - 2 * side);

    // Find adjacent edges
    const e1 = EMAP[f + m * ((v + sign * 1 + 3) % 3)];
    const e2 = EMAP[f + m * ((v + sign * 2 + 3) % 3)];

    // Find vertex indices
    const eVi = bundle[side].p[0].vi === s ? 0 : 1;
    sPair[side] = bundle[side].p[eVi].clone();
    dPair[side] = bundle[side].p[1 - eVi].clone();

    // Kill e1
    killEdge(e1);

    // Kill face f
    F[f] = [NULL_INDEX, NULL_INDEX, NULL_INDEX];
    FT[f] = [NULL_INDEX, NULL_INDEX, NULL_INDEX];

    // Get face adjacent to e1
    const flip1 = EF[e1][1] === f;
    const f1 = flip1 ? EF[e1][0] : EF[e1][1];
    if (f1 !== NULL_INDEX && f1 !== f) {
      const v1 = flip1 ? EI[e1][0] : EI[e1][1];
      EMAP[f1 + m * v1] = e2;

      // Update e2's face reference
      const opp2 = EF[e2][0] === f ? 0 : 1;
      EF[e2][opp2] = f1;
      EI[e2][opp2] = v1;

      // Remap e2 endpoints from d to s
      if (E[e2][0] === d) E[e2][0] = s;
      if (E[e2][1] === d) E[e2][1] = s;
    }

    if (side === 0) result.e1 = e1;
    else result.e2 = e1;
  }

  // Update face indices for d's 1-ring
  for (let i = 1; i < nV2Fd.length - 1; i++) {
    const f = nV2Fd[i];
    if (F[f][0] === NULL_INDEX) continue;

    for (let v = 0; v < 3; v++) {
      if (F[f][v] === d) {
        // Update edge connectivity
        const flip1 = EF[EMAP[f + m * ((v + 1) % 3)]][0] === f ? 1 : 0;
        const flip2 = EF[EMAP[f + m * ((v + 2) % 3)]][0] === f ? 0 : 1;
        E[EMAP[f + m * ((v + 1) % 3)]][flip1] = s;
        E[EMAP[f + m * ((v + 2) % 3)]][flip2] = s;

        // Update face vertex
        F[f][v] = s;

        // Update texture coordinate reference
        if (!collapseOnSeam) {
          if (FT[f][v] === dTc) FT[f][v] = sTc;
        } else {
          if (FT[f][v] === dPair[0].tci) FT[f][v] = sPair[0].tci;
          else if (FT[f][v] === dPair[1].tci) FT[f][v] = sPair[1].tci;
        }
      }
    }
  }

  // Handle seam corners
  const seamCorner = collapseOnSeam && dPair[0].tci === dPair[1].tci;
  if (seamCorner) {
    for (let i = 1; i < nV2Fs.length - 1; i++) {
      const f = nV2Fs[i];
      for (let v = 0; v < 3; v++) {
        if (FT[f][v] === sPair[1].tci) {
          FT[f][v] = sPair[0].tci;
        }
      }
    }
  }

  // Update seam edge map
  if (seamEdges.has(d) && !seamEdges.has(s)) {
    renameVertex(seamEdges, d, s);
  }
  if (containsEdge(seamEdges, d, s)) {
    collapseEdge(seamEdges, d, s);
  }

  // Kill the collapsed edge
  killEdge(e);

  result.success = true;
  return result;
}
