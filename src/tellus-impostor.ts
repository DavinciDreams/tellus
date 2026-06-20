/**
 * Tellus Octahedral Impostor Utility
 *
 * Standalone billboard-impostor baker harvested from hyperscape's
 * @hyperscape/impostor package. An octahedral impostor is a single camera-
 * facing billboard that samples a pre-baked atlas of the object rendered from
 * many directions, blending the 3 nearest views by the current view angle.
 * This is the cheapest possible LOD for distant clutter (trees, rocks, props):
 * one quad + one texture fetch replaces an entire mesh.
 *
 * The vendored core lives under `src/vendor/impostor/`. It is self-contained
 * (only `three` / `three/webgpu` imports, no cross-package deps).
 *
 * ============================================================================
 * !! RENDERER COMPATIBILITY — READ THIS !!
 * ----------------------------------------------------------------------------
 * Baking and the runtime impostor material are WebGPU + TSL ONLY. The baker
 * imports `three/webgpu` and builds its passes from TSL node materials
 * (MeshBasicNodeMaterial / MeshStandardNodeMaterial); the runtime material is
 * a TSL node material with no GLSL fallback.
 *
 * Tellus's primary renderer IS `WebGPURenderer` (see main.tsx), so this works
 * on the default path. On the classic `WebGLRenderer` FALLBACK path, baking
 * will NOT function — call `isImpostorBakingSupported(renderer)` first and
 * skip impostor LOD (fall back to the existing distance-fade vegetation LOD)
 * when it returns false.
 * ============================================================================
 *
 * USAGE (not wired into the render loop yet — call from an LOD/asset builder):
 *
 * ```ts
 * import {
 *   bakeImpostor,
 *   createImpostorInstance,
 *   isImpostorBakingSupported,
 * } from "./tellus-impostor";
 *
 * if (isImpostorBakingSupported(renderer)) {
 *   const handle = await bakeImpostor(treeMesh, renderer, { gridSizeX: 16, gridSizeY: 16 });
 *   const inst = createImpostorInstance(handle, { scale: 1 });
 *   scene.add(inst.mesh);
 *
 *   // each frame, after camera moves:
 *   inst.update(camera);
 *
 *   // when done:
 *   inst.dispose();
 *   handle.dispose();
 * }
 * ```
 */

import * as THREE from "three";
import {
  OctahedralImpostor,
  OctahedronType,
  type CreateInstanceOptions,
} from "./vendor/impostor/OctahedralImpostor";
import type {
  CompatibleRenderer,
} from "./vendor/impostor/ImpostorBaker";
import type {
  ImpostorBakeConfig,
  ImpostorBakeResult,
  ImpostorInstance,
  OctahedronTypeValue,
} from "./vendor/impostor/types";

export { OctahedronType };
export type {
  ImpostorBakeConfig,
  ImpostorBakeResult,
  OctahedronTypeValue,
  ImpostorInstance,
};

/**
 * Feature-detect whether a renderer can bake impostors.
 *
 * Baking renders into render targets with TSL node materials, which only the
 * WebGPU backend supports here. We detect it structurally (duck-typing) so we
 * don't have to import `WebGPURenderer` into this module's type surface.
 */
export function isImpostorBakingSupported(renderer: unknown): boolean {
  if (!renderer || typeof renderer !== "object") return false;
  const r = renderer as Record<string, unknown>;
  // WebGPURenderer exposes isWebGPURenderer / renderAsync; the baker also needs
  // render-target plumbing. WebGLRenderer lacks renderAsync.
  const isWebGPU =
    r.isWebGPURenderer === true || typeof r.renderAsync === "function";
  const hasRTApi =
    typeof r.setRenderTarget === "function" &&
    typeof r.getRenderTarget === "function";
  return isWebGPU && hasRTApi;
}

/**
 * Per-impostor-bake handle. Owns the baked atlas textures + the underlying
 * OctahedralImpostor (which owns the baker / octahedron mesh cache). Create
 * runtime billboards from it via `createImpostorInstance`, and call
 * `dispose()` to release the GPU atlases + baker resources.
 */
export interface ImpostorHandle {
  /** The bake result (atlas textures, grid dims, bounds, octahedron data). */
  readonly result: ImpostorBakeResult;
  /** The owning impostor system (shared atlas + octahedron geometry). */
  readonly impostor: OctahedralImpostor;
  /** Spawn a camera-facing billboard instance from this bake. */
  createInstance(opts?: ImpostorInstanceOptions): TellusImpostorInstance;
  /** Release baker resources. Does not auto-dispose spawned instances. */
  dispose(): void;
}

export interface ImpostorInstanceOptions extends CreateInstanceOptions {
  /** Scale applied to the source object's baked dimensions (default 1). */
  scale?: number;
}

/** A runtime billboard instance. Call `update(camera)` each frame. */
export interface TellusImpostorInstance {
  /** The billboard mesh — add this to your scene. */
  mesh: THREE.Mesh;
  /** Re-orient the billboard and select atlas views for this camera. */
  update(camera: THREE.Camera): void;
  /** Dispose the billboard geometry + material (not the shared atlas). */
  dispose(): void;
}

/**
 * Default bake configuration tuned for Tellus distant-clutter LOD.
 * 16x16 grid (256 views) at 2k atlas is a good quality/size tradeoff; HEMI
 * octahedron is correct for ground-planted objects (only seen from above the
 * horizon).
 */
export const DEFAULT_IMPOSTOR_CONFIG: Partial<ImpostorBakeConfig> = {
  atlasWidth: 2048,
  atlasHeight: 2048,
  gridSizeX: 16,
  gridSizeY: 16,
  octType: OctahedronType.HEMI,
  backgroundAlpha: 0,
};

/**
 * Bake a mesh/object into an octahedral impostor atlas.
 *
 * @param source   Mesh or Object3D to bake (instanced meshes are flattened).
 * @param renderer A WebGPURenderer (see compatibility note above). Passing a
 *                 WebGLRenderer will reject — guard with
 *                 `isImpostorBakingSupported(renderer)` first.
 * @param config   Bake overrides (atlas size, grid size, octahedron type, ...).
 * @returns An ImpostorHandle owning the baked atlas + instance factory.
 */
export async function bakeImpostor(
  source: THREE.Object3D,
  renderer: unknown,
  config: Partial<ImpostorBakeConfig> = {},
): Promise<ImpostorHandle> {
  if (!isImpostorBakingSupported(renderer)) {
    throw new Error(
      "[tellus-impostor] bakeImpostor requires a WebGPURenderer. " +
        "Guard with isImpostorBakingSupported(renderer) and fall back to " +
        "mesh LOD / distance-fade on the WebGLRenderer path.",
    );
  }

  const impostor = new OctahedralImpostor(renderer as CompatibleRenderer);
  const result = await impostor.bake(source, {
    ...DEFAULT_IMPOSTOR_CONFIG,
    ...config,
  });

  const handle: ImpostorHandle = {
    result,
    impostor,
    createInstance(opts: ImpostorInstanceOptions = {}): TellusImpostorInstance {
      const { scale = 1, ...createOpts } = opts;
      const inst: ImpostorInstance = impostor.createInstance(
        result,
        scale,
        createOpts,
      );
      return {
        mesh: inst.mesh,
        update: (camera: THREE.Camera) => inst.update(camera),
        dispose: () => inst.dispose(),
      };
    },
    dispose() {
      impostor.dispose();
    },
  };

  return handle;
}

/**
 * Convenience: spawn a runtime billboard directly from a handle.
 * Equivalent to `handle.createInstance(opts)`.
 */
export function createImpostorInstance(
  handle: ImpostorHandle,
  opts: ImpostorInstanceOptions = {},
): TellusImpostorInstance {
  return handle.createInstance(opts);
}
