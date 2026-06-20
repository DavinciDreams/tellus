/**
 * Tellus Mesh Decimation Utility
 *
 * Standalone poly-reduction / LOD helper harvested from hyperscape's
 * seam-aware QEM decimator (@hyperscape/decimation). The vendored core lives
 * under `src/vendor/decimation/` and has ZERO runtime dependencies (pure TS,
 * no Three.js, no workers) — this module is the only Three.js-facing surface.
 *
 * The decimator is a 5D seam-aware Quadric Error Metric simplifier: it
 * preserves UV seam boundaries while collapsing edges, which keeps texture
 * atlases intact on simplified vegetation / rocks / buildings.
 *
 * USAGE (not wired into the render loop yet — call from an asset/LOD builder):
 *
 * ```ts
 * import { decimateGeometry, buildLODChain } from "./tellus-decimation";
 *
 * // Reduce a geometry to ~30% of its triangles:
 * const lod1Geo = decimateGeometry(sourceGeometry, 0.3);
 * const lodMesh = new THREE.Mesh(lod1Geo, sourceMesh.material);
 *
 * // Or build a THREE.LOD-ready chain of geometries:
 * const lods = buildLODChain(sourceGeometry, [1, 0.3, 0.1]);
 * const lod = new THREE.LOD();
 * lods.forEach(({ geometry }, i) => {
 *   lod.addLevel(new THREE.Mesh(geometry, mat), i * 40); // distances are illustrative
 * });
 * ```
 *
 * NOTE ON COMPATIBILITY: the decimator operates on non-indexed OR indexed
 * geometry. It requires a `position` attribute; `uv` is optional (a flat
 * default UV set is synthesized when absent, which disables seam preservation
 * gracefully). Other attributes (normal, color, skinning, tangents) are NOT
 * carried through the collapse — normals are recomputed on the output. Use
 * this for static LOD meshes, not for skinned/animated geometry.
 */

import * as THREE from "three";
import {
  decimate as decimateMesh,
  fromBufferGeometry,
  toBufferGeometry,
  generateLODLevels,
  MeshData,
  type DecimationOptions,
  type LODLevelConfig,
} from "./vendor/decimation/index";

// Re-export the seam-aware decimate signature for advanced callers.
export { generateLODLevels };
export type { DecimationOptions, LODLevelConfig };

/** Strictness for the QEM collapse. 2 = seam-aware (default), preserves UVs. */
export type DecimationStrictness = 0 | 1 | 2;

export interface DecimateGeometryOptions {
  /**
   * 0 = fastest (no UV-shape preservation), 1 = UV-shape preservation,
   * 2 = full seam-aware (default).
   */
  strictness?: DecimationStrictness;
  /** Floor on the number of vertices the result may keep. */
  minVertices?: number;
}

/**
 * Convert a THREE.BufferGeometry into the vendored MeshData representation.
 * Handles both indexed and non-indexed geometry and synthesizes default UVs
 * when the source has none.
 */
function geometryToMeshData(geometry: THREE.BufferGeometry): MeshData {
  const posAttr = geometry.getAttribute("position");
  if (!posAttr) {
    throw new Error("[tellus-decimation] geometry has no position attribute");
  }

  const positions = new Float32Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i++) {
    positions[i * 3] = posAttr.getX(i);
    positions[i * 3 + 1] = posAttr.getY(i);
    positions[i * 3 + 2] = posAttr.getZ(i);
  }

  // Build an index array (synthesize a trivial one for non-indexed geometry).
  let indices: Uint16Array | Uint32Array;
  const idxAttr = geometry.getIndex();
  if (idxAttr) {
    indices =
      posAttr.count > 65535
        ? new Uint32Array(idxAttr.array as ArrayLike<number>)
        : new Uint16Array(idxAttr.array as ArrayLike<number>);
  } else {
    const triCount = posAttr.count;
    indices =
      triCount > 65535
        ? new Uint32Array(triCount)
        : new Uint16Array(triCount);
    for (let i = 0; i < triCount; i++) indices[i] = i;
  }

  // Optional UVs.
  let uvs: Float32Array | undefined;
  const uvAttr = geometry.getAttribute("uv");
  if (uvAttr) {
    uvs = new Float32Array(uvAttr.count * 2);
    for (let i = 0; i < uvAttr.count; i++) {
      uvs[i * 2] = uvAttr.getX(i);
      uvs[i * 2 + 1] = uvAttr.getY(i);
    }
  }

  return fromBufferGeometry(positions, indices, uvs);
}

/** Convert a decimated MeshData back into a fresh THREE.BufferGeometry. */
function meshDataToGeometry(mesh: MeshData): THREE.BufferGeometry {
  const { positions, indices, uvs } = toBufferGeometry(mesh);
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  if (uvs && uvs.length > 0) {
    out.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  }
  out.computeVertexNormals();
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/**
 * Decimate a geometry to a target fraction of its original triangle count.
 *
 * @param geometry   Source geometry (indexed or non-indexed). Not mutated.
 * @param targetRatio Fraction of vertices to KEEP, in (0, 1]. e.g. 0.3 = ~30%.
 *                    Values >= 1 return a clone of the source untouched.
 * @returns A NEW THREE.BufferGeometry. The caller owns disposal.
 */
export function decimateGeometry(
  geometry: THREE.BufferGeometry,
  targetRatio: number,
  options: DecimateGeometryOptions = {},
): THREE.BufferGeometry {
  if (!Number.isFinite(targetRatio)) {
    throw new Error("[tellus-decimation] targetRatio must be a finite number");
  }
  // No reduction requested — hand back an independent copy.
  if (targetRatio >= 1) {
    return geometry.clone();
  }

  const meshData = geometryToMeshData(geometry);

  let targetPercent = Math.max(0, Math.min(100, targetRatio * 100));
  if (options.minVertices && meshData.vertexCount > 0) {
    const minPercent = (options.minVertices / meshData.vertexCount) * 100;
    targetPercent = Math.max(targetPercent, minPercent);
  }

  const result = decimateMesh(meshData, {
    targetPercent,
    strictness: options.strictness ?? 2,
  });

  return meshDataToGeometry(result.mesh);
}

export interface LODChainEntry {
  /** Fraction of original vertices targeted for this level. */
  ratio: number;
  /** Decimated geometry for this level (level 0 is the source clone). */
  geometry: THREE.BufferGeometry;
  /** Final vertex count produced for this level. */
  vertexCount: number;
}

/**
 * Build a chain of decimated geometries suitable for feeding a THREE.LOD.
 * Each level is decimated independently from the ORIGINAL geometry (not
 * cascaded) so error does not accumulate across levels.
 *
 * @param geometry Source geometry.
 * @param ratios   Keep-fractions per level, e.g. [1, 0.3, 0.1]. A leading 1
 *                 yields a clone of the source as LOD0.
 */
export function buildLODChain(
  geometry: THREE.BufferGeometry,
  ratios: number[] = [1, 0.3, 0.1],
  options: DecimateGeometryOptions = {},
): LODChainEntry[] {
  return ratios.map((ratio) => {
    const geo =
      ratio >= 1 ? geometry.clone() : decimateGeometry(geometry, ratio, options);
    const vertexCount = geo.getAttribute("position")?.count ?? 0;
    return { ratio, geometry: geo, vertexCount };
  });
}
