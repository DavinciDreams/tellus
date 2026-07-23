/**
 * Self-contained Weber & Penn procedural tree generator (geometry only).
 *
 * Vendored from hyperscape/packages/procgen, stripped of the TSL/WebGPU leaf
 * material and GLB export so it runs under Tellus's WebGL2 fallback. Given a
 * species preset + seed it produces flat branch + leaf geometry (see bake.ts).
 */

import { Tree } from "./Tree";
import { bakeTree, type BakedTree } from "./bake";
import { PRESETS } from "./presets";
import type { TreeParams, BakeOptions, TreeData } from "./types";

export type { BakedTree, Soup } from "./bake";
export type { TreeParams, BakeOptions, TreeData } from "./types";
export { PRESETS } from "./presets";
export { bakeTree } from "./bake";

/** Canonical species id -> preset params (the 19 Weber & Penn species). */
export const SPECIES: Record<string, TreeParams> = PRESETS;

export type SpeciesId = keyof typeof PRESETS;

const TREE_DATA_CACHE_LIMIT = 8;
const treeDataCache = new Map<string, TreeData>();

const treeDataCacheKey = (
  species: TreeParams | string,
  seed: number,
  generateLeaves: boolean,
  maxDepth?: number,
): string | null => typeof species === "string"
  ? `${species}|${seed >>> 0}|${generateLeaves ? 1 : 0}|${maxDepth ?? "all"}`
  : null;

/** Generate the raw Weber & Penn tree data (stems + leaves) for a species+seed. */
export function generateTreeData(
  species: TreeParams | string,
  seed: number,
  generateLeaves = true,
  maxDepth?: number,
): TreeData {
  const params: TreeParams =
    typeof species === "string" ? (PRESETS[species] ?? PRESETS.quakingAspen!) : species;
  const tree = new Tree(params, { seed, generateLeaves, maxDepth });
  return tree.generate();
}

/**
 * Reuse the immutable growth hierarchy when only bake options (foliage mass, tube samples, colors,
 * or leaf scale) change. This is especially common in editors and keeps those variations from
 * repeating the substantially more expensive Weber-Penn growth pass.
 */
export function generateTreeDataCached(
  species: TreeParams | string,
  seed: number,
  generateLeaves = true,
  maxDepth?: number,
): TreeData {
  const key = treeDataCacheKey(species, seed, generateLeaves, maxDepth);
  if (!key) return generateTreeData(species, seed, generateLeaves, maxDepth);
  const cached = treeDataCache.get(key);
  if (cached) {
    treeDataCache.delete(key);
    treeDataCache.set(key, cached);
    return cached;
  }
  const generated = generateTreeData(species, seed, generateLeaves, maxDepth);
  treeDataCache.set(key, generated);
  if (treeDataCache.size > TREE_DATA_CACHE_LIMIT) {
    const oldest = treeDataCache.keys().next().value as string | undefined;
    if (oldest !== undefined) treeDataCache.delete(oldest);
  }
  return generated;
}

/** Generate + bake a tree into flat branch/leaf geometry (Y-up). */
export function generateBakedTree(
  species: TreeParams | string,
  seed: number,
  bakeOptions: BakeOptions = {},
  generateLeaves = true,
): BakedTree {
  const data = generateTreeDataCached(
    species,
    seed,
    generateLeaves,
    bakeOptions.maxBranchDepth,
  );
  return bakeTree(data, bakeOptions);
}
