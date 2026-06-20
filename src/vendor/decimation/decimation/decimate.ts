/**
 * Main decimation algorithm
 *
 * Implements seam-aware mesh decimation using half-edge QSlim
 */

import {
  type Vec2,
  type Vec3,
  MeshData,
  type DecimationOptions,
  type EdgeMap,
  type MapV5d,
  type PlacementInfo5D,
  NULL_INDEX,
} from "../types";
import { INF } from "../math/vector";
import {
  buildEdgeFlaps,
  getHalfEdgeBundle,
  circulation,
} from "../mesh/half-edge";
import { buildSeamEdges } from "../mesh/edge-map";
import { computeHalfEdgeQSlim5D } from "./quadric";
import { costAndPlacement5D } from "./cost-placement";
import { tryCollapseEdge } from "./collapse";

/**
 * Reason why decimation stopped
 */
export type StopReason =
  | "target_reached" // Reached target vertex count
  | "empty_queue" // No more edges to collapse
  | "all_infinite_cost" // All remaining edges have infinite cost (seam preservation)
  | "no_progress"; // Internal error - edge collapse made no progress

/**
 * Internal decimation result with detailed information
 */
export interface InternalDecimationResult {
  mesh: MeshData;
  collapses: number;
  stopReason: StopReason;
  finalVertexCount: number;
}

/**
 * Priority queue entry for edge collapse
 */
type PQEntry = { cost: number; edgeIndex: number };

/**
 * Create a priority queue (min-heap) for edge collapse
 */
class PriorityQueue {
  private heap: PQEntry[] = [];
  private indexMap = new Map<number, number>(); // edgeIndex -> heap position

  insert(cost: number, edgeIndex: number): void {
    const entry = { cost, edgeIndex };
    this.heap.push(entry);
    const pos = this.heap.length - 1;
    this.indexMap.set(edgeIndex, pos);
    this.bubbleUp(pos);
  }

  extractMin(): PQEntry | null {
    if (this.heap.length === 0) return null;
    const min = this.heap[0];
    this.indexMap.delete(min.edgeIndex);

    if (this.heap.length === 1) {
      this.heap.pop();
      return min;
    }

    this.heap[0] = this.heap.pop()!;
    this.indexMap.set(this.heap[0].edgeIndex, 0);
    this.bubbleDown(0);
    return min;
  }

  peekMin(): PQEntry | null {
    return this.heap.length > 0 ? this.heap[0] : null;
  }

  update(edgeIndex: number, newCost: number): void {
    const pos = this.indexMap.get(edgeIndex);
    if (pos === undefined) {
      this.insert(newCost, edgeIndex);
      return;
    }

    const oldCost = this.heap[pos].cost;
    this.heap[pos].cost = newCost;

    if (newCost < oldCost) {
      this.bubbleUp(pos);
    } else {
      this.bubbleDown(pos);
    }
  }

  remove(edgeIndex: number): void {
    const pos = this.indexMap.get(edgeIndex);
    if (pos === undefined) return;

    this.indexMap.delete(edgeIndex);

    if (pos === this.heap.length - 1) {
      this.heap.pop();
      return;
    }

    this.heap[pos] = this.heap.pop()!;
    this.indexMap.set(this.heap[pos].edgeIndex, pos);
    this.bubbleUp(pos);
    this.bubbleDown(pos);
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  private bubbleUp(pos: number): void {
    while (pos > 0) {
      const parent = Math.floor((pos - 1) / 2);
      if (this.heap[parent].cost <= this.heap[pos].cost) break;
      this.swap(parent, pos);
      pos = parent;
    }
  }

  private bubbleDown(pos: number): void {
    const n = this.heap.length;
    while (true) {
      const left = 2 * pos + 1;
      const right = 2 * pos + 2;
      let smallest = pos;

      if (left < n && this.heap[left].cost < this.heap[smallest].cost) {
        smallest = left;
      }
      if (right < n && this.heap[right].cost < this.heap[smallest].cost) {
        smallest = right;
      }

      if (smallest === pos) break;
      this.swap(smallest, pos);
      pos = smallest;
    }
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];
    this.indexMap.set(this.heap[i].edgeIndex, i);
    this.indexMap.set(this.heap[j].edgeIndex, j);
  }
}

/**
 * Clean mesh by removing NULL faces and degenerate faces
 */
function cleanMesh(
  V: Vec3[],
  F: [number, number, number][],
  TC: Vec2[],
  FT: [number, number, number][],
): MeshData {
  // Find valid faces (non-NULL and non-degenerate)
  const validFaces: [number, number, number][] = [];
  const validFT: [number, number, number][] = [];

  for (let fi = 0; fi < F.length; fi++) {
    const f = F[fi];
    // Skip NULL faces
    if (f[0] === NULL_INDEX || f[1] === NULL_INDEX || f[2] === NULL_INDEX) {
      continue;
    }
    // Skip degenerate faces (where two or more vertices are the same)
    if (f[0] === f[1] || f[1] === f[2] || f[2] === f[0]) {
      continue;
    }
    validFaces.push(f);
    validFT.push(FT[fi]);
  }

  // Find used vertices
  const usedV = new Set<number>();
  const usedTC = new Set<number>();

  for (const face of validFaces) {
    usedV.add(face[0]);
    usedV.add(face[1]);
    usedV.add(face[2]);
  }

  for (const face of validFT) {
    usedTC.add(face[0]);
    usedTC.add(face[1]);
    usedTC.add(face[2]);
  }

  // Create remapping
  const vMap = new Map<number, number>();
  const tcMap = new Map<number, number>();

  const newV: Vec3[] = [];
  for (const vi of usedV) {
    vMap.set(vi, newV.length);
    newV.push(V[vi]);
  }

  const newTC: Vec2[] = [];
  for (const ti of usedTC) {
    tcMap.set(ti, newTC.length);
    newTC.push(TC[ti]);
  }

  // Remap faces
  const newF: [number, number, number][] = validFaces.map((face) => [
    vMap.get(face[0])!,
    vMap.get(face[1])!,
    vMap.get(face[2])!,
  ]);

  const newFT: [number, number, number][] = validFT.map((face) => [
    tcMap.get(face[0])!,
    tcMap.get(face[1])!,
    tcMap.get(face[2])!,
  ]);

  return new MeshData(newV, newF, newTC, newFT);
}

/**
 * Perform seam-aware mesh decimation
 *
 * @param input Input mesh data with vertices, faces, texture coordinates
 * @param options Decimation options (target vertices/percent, strictness)
 * @returns Internal decimation result with mesh, collapse count, and stop reason
 */
export function decimate(
  input: MeshData,
  options: DecimationOptions = {},
): InternalDecimationResult {
  const { targetVertices, targetPercent = 50, strictness = 2 } = options;

  // Determine target vertex count
  const originalVertexCount = input.V.length;
  let target =
    targetVertices ?? Math.floor((originalVertexCount * targetPercent) / 100);
  target = Math.max(4, target); // Need at least 4 vertices for a tetrahedron

  if (target >= originalVertexCount) {
    // No decimation needed
    return {
      mesh: new MeshData(
        input.V.map((v) => [...v] as Vec3),
        input.F.map((f) => [...f] as [number, number, number]),
        input.TC.map((t) => [...t] as Vec2),
        input.FT.map((f) => [...f] as [number, number, number]),
      ),
      collapses: 0,
      stopReason: "target_reached",
      finalVertexCount: originalVertexCount,
    };
  }

  // Make working copies
  const V = input.V.map((v) => [...v] as Vec3);
  const F = input.F.map((f) => [...f] as [number, number, number]);
  const TC = input.TC.map((t) => [...t] as Vec2);
  const FT = input.FT.map((f) => [...f] as [number, number, number]);

  // Build edge connectivity
  const { E, EMAP, EF, EI } = buildEdgeFlaps(F);

  // Build seam edge map
  const seamEdges: EdgeMap = buildSeamEdges(F, FT);

  // Compute per-vertex metrics
  const Vmetrics: MapV5d = computeHalfEdgeQSlim5D(V, F, TC, FT);

  // Initialize priority queue with edge costs
  const Q = new PriorityQueue();
  const placements: PlacementInfo5D[] = new Array(E.length);

  for (let e = 0; e < E.length; e++) {
    const bundle = getHalfEdgeBundle(e, E, EF, EI, F, FT);
    const { cost, placement } = costAndPlacement5D(
      bundle,
      V,
      F,
      TC,
      FT,
      seamEdges,
      Vmetrics,
      strictness,
    );
    placements[e] = placement;
    Q.insert(cost, e);
  }

  // Main decimation loop
  let remainingVertices = V.length;
  let prevE = -1;
  let stopReason: StopReason = "target_reached";

  while (remainingVertices > target) {
    const entry = Q.peekMin();
    if (!entry) {
      stopReason = "empty_queue";
      break;
    }

    if (entry.cost === INF) {
      stopReason = "all_infinite_cost";
      break;
    }

    // Extract the minimum cost edge
    Q.extractMin();
    const e = entry.edgeIndex;

    // Skip if edge already collapsed
    if (E[e][0] === NULL_INDEX || E[e][1] === NULL_INDEX) {
      continue;
    }

    // Try to collapse
    const collapseResult = tryCollapseEdge(
      e,
      placements[e],
      V,
      F,
      E,
      EMAP,
      EF,
      EI,
      TC,
      FT,
      seamEdges,
      Vmetrics,
    );

    if (collapseResult.success) {
      remainingVertices--;

      // Get affected edges in 1-ring
      const affectedEdges = new Set<number>();
      const _eflip = E[e][0] > E[e][1];

      // Get circulation around the collapsed edge's vertices
      const neighbors = new Set<number>();
      const ne1 = circulation(e, true, EMAP, EF, EI, F);
      const ne2 = circulation(e, false, EMAP, EF, EI, F);
      ne1.forEach((f) => neighbors.add(f));
      ne2.forEach((f) => neighbors.add(f));

      for (const fi of neighbors) {
        if (
          F[fi][0] !== NULL_INDEX &&
          F[fi][1] !== NULL_INDEX &&
          F[fi][2] !== NULL_INDEX
        ) {
          for (let v = 0; v < 3; v++) {
            const ei = EMAP[v * F.length + fi];
            if (ei >= 0 && ei < E.length) {
              affectedEdges.add(ei);
            }
          }
        }
      }

      // Remove collapsed edges from queue
      Q.remove(collapseResult.e1);
      Q.remove(collapseResult.e2);

      // Update affected edges
      for (const ei of affectedEdges) {
        if (E[ei][0] !== NULL_INDEX && E[ei][1] !== NULL_INDEX) {
          const bundle = getHalfEdgeBundle(ei, E, EF, EI, F, FT);
          const { cost, placement } = costAndPlacement5D(
            bundle,
            V,
            F,
            TC,
            FT,
            seamEdges,
            Vmetrics,
            strictness,
          );
          placements[ei] = placement;
          Q.update(ei, cost);
        }
      }

      prevE = e;
    } else if (prevE === e) {
      // No progress - should not happen with proper stopping conditions
      stopReason = "no_progress";
      break;
    } else {
      // Reinsert with infinite cost
      Q.insert(INF, e);
      prevE = e;
    }
  }

  // Clean up and return result
  const resultMesh = cleanMesh(V, F, TC, FT);

  return {
    mesh: resultMesh,
    // collapses = actual vertex reduction (not edge operations, which can differ due to mesh cleaning)
    collapses: originalVertexCount - resultMesh.V.length,
    stopReason,
    finalVertexCount: resultMesh.V.length,
  };
}

/**
 * Decimates a mesh to a target face count
 */
export function decimateToFaceCount(
  input: MeshData,
  targetFaces: number,
  strictness: 0 | 1 | 2 = 2,
): MeshData {
  // Approximate target vertices from target faces
  // For manifold meshes: V ≈ F/2 + 2 (Euler formula)
  const targetVertices = Math.max(4, Math.floor(targetFaces / 2) + 2);
  const result = decimate(input, { targetVertices, strictness });
  return result.mesh;
}
