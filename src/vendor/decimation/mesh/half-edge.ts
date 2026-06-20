/**
 * Half-edge data structure and utilities
 */

import {
  type Bundle,
  EdgeFlaps,
  HalfEdge,
  VertexBundle,
  NULL_INDEX,
} from "../types";

/**
 * Build edge flap data structure from face indices
 * This creates edge-face connectivity for efficient mesh traversal
 */
export function buildEdgeFlaps(F: [number, number, number][]): EdgeFlaps {
  const numFaces = F.length;
  const result = new EdgeFlaps(0, numFaces);

  // Map from sorted edge vertices to edge index
  const edgeMap = new Map<string, number>();

  // For each face and each edge (corner)
  for (let fi = 0; fi < numFaces; fi++) {
    for (let ki = 0; ki < 3; ki++) {
      const v1 = F[fi][ki];
      const v2 = F[fi][(ki + 1) % 3];
      const minV = Math.min(v1, v2);
      const maxV = Math.max(v1, v2);
      const key = `${minV}_${maxV}`;

      let ei = edgeMap.get(key);
      if (ei === undefined) {
        // New edge
        ei = result.E.length;
        edgeMap.set(key, ei);
        result.E.push([minV, maxV]);
        result.EF.push([NULL_INDEX, NULL_INDEX]);
        result.EI.push([NULL_INDEX, NULL_INDEX]);
      }

      // This face corner maps to this edge
      result.EMAP[ki * numFaces + fi] = ei;

      // Record which side of the edge this face is on
      // Side 0: v1 < v2 (matches sorted order)
      // Side 1: v1 > v2 (opposite order)
      const side = v1 < v2 ? 0 : 1;
      result.EF[ei][side] = fi;
      // Store the corner OPPOSITE to the edge (not the starting corner)
      // Edge goes from ki to (ki+1)%3, so opposite is at (ki+2)%3
      result.EI[ei][side] = (ki + 2) % 3;
    }
  }

  return result;
}

/**
 * Get the half-edge bundle for an edge
 * Returns both half-edges (one for each adjacent face)
 */
export function getHalfEdgeBundle(
  e: number,
  E: [number, number][],
  EF: [number, number][],
  EI: [number, number][],
  F: [number, number, number][],
  FT: [number, number, number][],
): Bundle {
  const result: Bundle = [];

  for (let side = 0; side < 2; side++) {
    const faceIndex = EF[e][side];
    const oppositeVertex = EI[e][side];

    if (faceIndex === NULL_INDEX) continue;

    const he = new HalfEdge(faceIndex, oppositeVertex);

    // Get the two vertices of the edge (opposite to ki)
    const v1 = F[faceIndex][(oppositeVertex + 1) % 3];
    const t1 = FT[faceIndex][(oppositeVertex + 1) % 3];
    const v2 = F[faceIndex][(oppositeVertex + 2) % 3];
    const t2 = FT[faceIndex][(oppositeVertex + 2) % 3];

    he.p[0] = new VertexBundle(v1, t1);
    he.p[1] = new VertexBundle(v2, t2);

    result.push(he);
  }

  return result;
}

/**
 * Circulate around a vertex to get adjacent faces
 * This follows the edge-face connectivity around a vertex
 */
export function circulation(
  e: number,
  ccw: boolean,
  EMAP: number[],
  EF: [number, number][],
  EI: [number, number][],
  F: [number, number, number][],
): number[] {
  const m = F.length;
  const result: number[] = [];

  // Start at one of the edge's faces
  const startSide = ccw ? 0 : 1;
  const f0 = EF[e][startSide];
  if (f0 === NULL_INDEX) return result;

  let fi = f0;
  let ei = e;
  const visited = new Set<number>();

  do {
    if (visited.has(fi)) break;
    visited.add(fi);
    result.push(fi);

    // Move to next face around vertex
    const side = EF[ei][0] === fi ? 1 : 0;
    const v = EI[ei][side];
    fi = EF[ei][side];
    if (fi === NULL_INDEX) break;

    // Get next edge
    const dir = ccw ? -1 : 1;
    ei = EMAP[fi + m * ((v + dir + 3) % 3)];
  } while (fi !== f0 && fi !== NULL_INDEX);

  return result;
}

/**
 * Check if an edge collapse is valid (link condition)
 * The edge (s, d) can be collapsed if and only if the link of s ∩ link of d = link of edge(s,d)
 */
export function edgeCollapseIsValid(
  e: number,
  F: [number, number, number][],
  E: [number, number][],
  EMAP: number[],
  EF: [number, number][],
  EI: [number, number][],
): boolean {
  if (E[e][0] === NULL_INDEX || E[e][1] === NULL_INDEX) {
    return false;
  }

  const s = E[e][0];
  const d = E[e][1];

  // Get vertices in 1-ring of s
  const Ns = new Set<number>();
  const facesS = circulation(e, true, EMAP, EF, EI, F);
  for (const fi of facesS) {
    if (F[fi][0] !== NULL_INDEX) {
      for (let k = 0; k < 3; k++) {
        if (F[fi][k] !== s) Ns.add(F[fi][k]);
      }
    }
  }

  // Get vertices in 1-ring of d
  const Nd = new Set<number>();
  const facesD = circulation(e, false, EMAP, EF, EI, F);
  for (const fi of facesD) {
    if (F[fi][0] !== NULL_INDEX) {
      for (let k = 0; k < 3; k++) {
        if (F[fi][k] !== d) Nd.add(F[fi][k]);
      }
    }
  }

  // Intersection of Ns and Nd (excluding s and d themselves)
  const intersection = new Set<number>();
  for (const v of Ns) {
    if (Nd.has(v) && v !== s && v !== d) {
      intersection.add(v);
    }
  }

  // Link of edge should be exactly 2 vertices (the opposite corners of the two faces)
  // For boundary edges, this could be 1 vertex
  // The collapse is valid if intersection.size <= 2
  return intersection.size <= 2;
}
