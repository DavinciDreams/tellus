/**
 * Edge map utilities for tracking seam edges
 */

import type { EdgeMap } from "../types";

/**
 * Check if an edge exists between two vertices in the edge map
 * @throws Error if edge map is inconsistent (edge present in one direction only)
 */
export function containsEdge(edges: EdgeMap, v1: number, v2: number): boolean {
  const set1 = edges.get(v1);
  const set2 = edges.get(v2);

  const result1 = set1?.has(v2) ?? false;
  const result2 = set2?.has(v1) ?? false;

  // Sanity check: edge should be present in both directions or neither
  if (result1 !== result2) {
    throw new Error(
      `Edge map inconsistency: edge (${v1}, ${v2}) is present in one direction only. ` +
        `v1->v2: ${result1}, v2->v1: ${result2}`,
    );
  }

  return result1;
}

/**
 * Insert an edge between two vertices
 */
export function insertEdge(edges: EdgeMap, v1: number, v2: number): void {
  if (!edges.has(v1)) {
    edges.set(v1, new Set());
  }
  if (!edges.has(v2)) {
    edges.set(v2, new Set());
  }
  edges.get(v1)!.add(v2);
  edges.get(v2)!.add(v1);
}

/**
 * Collapse an edge by removing vertex_to_remove and merging its connections
 * into vertex_collapsing_into
 */
export function collapseEdge(
  edges: EdgeMap,
  vertexToRemove: number,
  vertexCollapsingInto: number,
): void {
  if (!containsEdge(edges, vertexToRemove, vertexCollapsingInto)) {
    throw new Error(
      `No edge between ${vertexToRemove} and ${vertexCollapsingInto}`,
    );
  }

  // Get all neighbors of the vertex to remove
  const neighbors = edges.get(vertexToRemove);
  if (!neighbors) return;

  // Copy neighbors to avoid modification during iteration
  const neighborList = Array.from(neighbors);

  // For every neighbor, replace vertexToRemove with vertexCollapsingInto
  for (const n of neighborList) {
    const neighborSet = edges.get(n);
    if (!neighborSet) {
      throw new Error(
        `Edge map inconsistency: neighbor vertex ${n} not found in edge map during collapse`,
      );
    }
    neighborSet.delete(vertexToRemove);
    neighborSet.add(vertexCollapsingInto);
  }

  // Add all neighbors to vertexCollapsingInto
  const targetSet = edges.get(vertexCollapsingInto) ?? new Set();
  for (const n of neighborList) {
    targetSet.add(n);
  }
  edges.set(vertexCollapsingInto, targetSet);

  // Remove self-reference
  targetSet.delete(vertexCollapsingInto);

  // Remove the collapsed vertex
  edges.delete(vertexToRemove);
}

/**
 * Rename a vertex in the edge map (useful when a seam vertex changes index)
 */
export function renameVertex(
  edges: EdgeMap,
  oldName: number,
  newName: number,
): void {
  const neighbors = edges.get(oldName);
  if (!neighbors) {
    throw new Error(`Vertex ${oldName} not found in edge map`);
  }
  if (edges.has(newName)) {
    throw new Error(`Vertex ${newName} already exists in edge map`);
  }

  // Copy neighbors
  const neighborList = Array.from(neighbors);

  // Update all neighbors to point to the new name
  for (const n of neighborList) {
    const neighborSet = edges.get(n);
    if (!neighborSet) {
      throw new Error(
        `Edge map inconsistency: neighbor vertex ${n} not found in edge map during rename`,
      );
    }
    neighborSet.delete(oldName);
    neighborSet.add(newName);
  }

  // Move neighbors to new vertex
  edges.set(newName, new Set(neighborList));
  edges.delete(oldName);
}

/**
 * Create an edge map from face data, identifying seam edges
 * Seam edges are edges that appear with different UV coordinates on different faces
 */
export function buildSeamEdges(
  F: [number, number, number][],
  FT: [number, number, number][],
): EdgeMap {
  const edges: EdgeMap = new Map();

  // Map of geometric edge -> set of UV edge pairs
  // Key format: "minV_maxV"
  const edgeUVs = new Map<string, Set<string>>();

  for (let fi = 0; fi < F.length; fi++) {
    for (let j = 0; j < 3; j++) {
      const v1 = F[fi][j];
      const v2 = F[fi][(j + 1) % 3];
      const t1 = FT[fi][j];
      const t2 = FT[fi][(j + 1) % 3];

      const minV = Math.min(v1, v2);
      const maxV = Math.max(v1, v2);
      const edgeKey = `${minV}_${maxV}`;

      // Order UV indices consistently
      const minT = v1 < v2 ? t1 : t2;
      const maxT = v1 < v2 ? t2 : t1;
      const uvKey = `${minT}_${maxT}`;

      if (!edgeUVs.has(edgeKey)) {
        edgeUVs.set(edgeKey, new Set());
      }
      edgeUVs.get(edgeKey)!.add(uvKey);
    }
  }

  // Seam edges are those with multiple different UV pairs
  for (const [edgeKey, uvSet] of edgeUVs.entries()) {
    if (uvSet.size > 1) {
      const [minV, maxV] = edgeKey.split("_").map(Number);
      insertEdge(edges, minV, maxV);
    }
  }

  return edges;
}
