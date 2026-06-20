/**
 * Vendored entry for the seam-aware QEM mesh decimator
 * (harvested from @hyperscape/decimation, pure-TS core only).
 *
 * The upstream package index also re-exports an `./optimized` subtree
 * (Web Workers, WebGPU compute, WASM SIMD, SharedArrayBuffer pools). That
 * subtree was intentionally NOT vendored — it is heavily environment-coupled
 * and unnecessary for synchronous, main-thread LOD generation. This entry
 * exposes only the dependency-free core: BufferGeometry <-> MeshData
 * conversion, single-shot decimation, and batch LOD generation.
 */

import {
  type Vec2,
  type Vec3,
  MeshData,
  type DecimationOptions,
} from "./types";
import {
  decimate as decimateInternal,
  type StopReason,
} from "./decimation/decimate";

export * from "./types";
export type { StopReason };

/** Decimation result with statistics. */
export interface DecimationResult {
  mesh: MeshData;
  originalVertices: number;
  finalVertices: number;
  originalFaces: number;
  finalFaces: number;
  collapses: number;
  stopReason: StopReason;
}

/**
 * Decimate a mesh to reduce vertex/face count while preserving UV seams.
 */
export function decimate(
  mesh: MeshData,
  options: DecimationOptions = {},
): DecimationResult {
  const originalVertices = mesh.V.length;
  const originalFaces = mesh.F.length;

  const internalResult = decimateInternal(mesh, options);

  return {
    mesh: internalResult.mesh,
    originalVertices,
    finalVertices: internalResult.finalVertexCount,
    originalFaces,
    finalFaces: internalResult.mesh.F.length,
    collapses: internalResult.collapses,
    stopReason: internalResult.stopReason,
  };
}

/** Convert Three.js buffer arrays to MeshData. UVs default to (0,0) when absent. */
export function fromBufferGeometry(
  positions: Float32Array,
  indices: Uint16Array | Uint32Array,
  uvs?: Float32Array,
): MeshData {
  const V: Vec3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    V.push([positions[i], positions[i + 1], positions[i + 2]]);
  }

  const F: [number, number, number][] = [];
  for (let i = 0; i < indices.length; i += 3) {
    F.push([indices[i], indices[i + 1], indices[i + 2]]);
  }

  const TC: Vec2[] = [];
  if (uvs) {
    for (let i = 0; i < uvs.length; i += 2) {
      TC.push([uvs[i], uvs[i + 1]]);
    }
  } else {
    for (let i = 0; i < V.length; i++) {
      TC.push([0, 0]);
    }
  }

  const FT: [number, number, number][] = F.map(
    (f) => [...f] as [number, number, number],
  );

  return new MeshData(V, F, TC, FT);
}

/** Convert MeshData back to arrays suitable for THREE.BufferGeometry. */
export function toBufferGeometry(mesh: MeshData): {
  positions: Float32Array;
  indices: Uint32Array;
  uvs: Float32Array;
} {
  const positions = new Float32Array(mesh.V.length * 3);
  for (let i = 0; i < mesh.V.length; i++) {
    positions[i * 3] = mesh.V[i][0];
    positions[i * 3 + 1] = mesh.V[i][1];
    positions[i * 3 + 2] = mesh.V[i][2];
  }

  const indices = new Uint32Array(mesh.F.length * 3);
  for (let i = 0; i < mesh.F.length; i++) {
    indices[i * 3] = mesh.F[i][0];
    indices[i * 3 + 1] = mesh.F[i][1];
    indices[i * 3 + 2] = mesh.F[i][2];
  }

  const uvs = new Float32Array(mesh.TC.length * 2);
  for (let i = 0; i < mesh.TC.length; i++) {
    uvs[i * 2] = mesh.TC[i][0];
    uvs[i * 2 + 1] = mesh.TC[i][1];
  }

  return { positions, indices, uvs };
}

// =============================================================================
// BATCH LOD GENERATION
// =============================================================================

export interface LODLevelConfig {
  name: string;
  targetPercent: number;
  minVertices?: number;
  strictness?: 0 | 1 | 2;
}

export interface LODLevelResult {
  name: string;
  mesh: MeshData;
  originalVertices: number;
  finalVertices: number;
  originalFaces: number;
  finalFaces: number;
  reductionPercent: number;
  processingTimeMs: number;
}

export interface BatchLODResult {
  levels: LODLevelResult[];
  totalProcessingTimeMs: number;
  summary: {
    originalVertices: number;
    originalFaces: number;
    verticesByLevel: Record<string, number>;
    facesByLevel: Record<string, number>;
  };
}

/**
 * Generate multiple LOD levels from a single mesh. Each level is decimated
 * from the ORIGINAL mesh (not cascaded) for consistent quality.
 */
export function generateLODLevels(
  mesh: MeshData,
  levels: LODLevelConfig[],
): BatchLODResult {
  const totalStartTime = performance.now();
  const originalVertices = mesh.V.length;
  const originalFaces = mesh.F.length;

  const results: LODLevelResult[] = [];
  const verticesByLevel: Record<string, number> = {};
  const facesByLevel: Record<string, number> = {};

  for (const levelConfig of levels) {
    const levelStartTime = performance.now();

    let effectiveTargetPercent = levelConfig.targetPercent;
    if (levelConfig.minVertices && originalVertices > 0) {
      const minPercent = (levelConfig.minVertices / originalVertices) * 100;
      effectiveTargetPercent = Math.max(effectiveTargetPercent, minPercent);
    }

    const meshCopy = mesh.clone();

    const decimationResult = decimate(meshCopy, {
      targetPercent: effectiveTargetPercent,
      strictness: levelConfig.strictness ?? 2,
    });

    const levelEndTime = performance.now();
    const reductionPercent =
      originalVertices > 0
        ? ((originalVertices - decimationResult.finalVertices) /
            originalVertices) *
          100
        : 0;

    results.push({
      name: levelConfig.name,
      mesh: decimationResult.mesh,
      originalVertices,
      finalVertices: decimationResult.finalVertices,
      originalFaces,
      finalFaces: decimationResult.finalFaces,
      reductionPercent,
      processingTimeMs: levelEndTime - levelStartTime,
    });
    verticesByLevel[levelConfig.name] = decimationResult.finalVertices;
    facesByLevel[levelConfig.name] = decimationResult.finalFaces;
  }

  return {
    levels: results,
    totalProcessingTimeMs: performance.now() - totalStartTime,
    summary: {
      originalVertices,
      originalFaces,
      verticesByLevel,
      facesByLevel,
    },
  };
}
