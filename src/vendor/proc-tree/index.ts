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

/** Canonical species id -> preset params (the 19 Weber & Penn species). */
export const SPECIES: Record<string, TreeParams> = PRESETS;

export type SpeciesId = keyof typeof PRESETS;

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

/** Generate + bake a tree into flat branch/leaf geometry (Y-up). */
export function generateBakedTree(
  species: TreeParams | string,
  seed: number,
  bakeOptions: BakeOptions = {},
  generateLeaves = true,
): BakedTree {
  const data = generateTreeData(
    species,
    seed,
    generateLeaves,
    bakeOptions.maxBranchDepth,
  );
  return bakeTree(data, bakeOptions);
}
