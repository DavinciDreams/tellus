// ── Weber & Penn tree → Tellus Template adapter ───────────────────────────────────────────────────
//
// Bakes a generated Weber & Penn tree (branches + leaf cards) into Tellus's flat vertex-soup
// `Template` (pos/nrm/col/tintable/sway/idx). The tree is normalized to unit-ish height (total height
// ≈ 1) and recentered so its base sits at the origin, matching the hand-built template convention used
// by the ambient field and the placeable-object pipeline. Pure geometry — no TSL/WebGPU nodes, so it
// renders fine under Tellus's WebGL2 fallback with the existing vertex-colored Lambert material.

import * as THREE from "three";
import { generateBakedTree, type BakeOptions } from "./vendor/proc-tree/index";
import type { Template } from "./tellus-veg-archetypes";

export type { BakeOptions } from "./vendor/proc-tree/index";

/** Tunables for turning a baked tree into a Template. */
export interface TreeTemplateOptions extends BakeOptions {
  /** Bark color (branches; baked, not tintable). */
  barkColor?: number;
  /** Leaf base color (multiplied by the stamp tint at scatter/ambient time). */
  leafColor?: number;
  /** Leaves are tintable (default true). Branches are never tintable. */
  leafTintable?: boolean;
  /** Sway starts ramping from this fraction of normalized height (default 0.25). */
  swayFrom?: number;
  /** Extra sway boost applied to leaf verts on top of the height ramp (default 1.0). */
  leafSwayBoost?: number;
}

const DEFAULT_BARK = 0x5d4327;
const DEFAULT_LEAF = 0x4f8c3a;

/**
 * Build a Tellus Template from a Weber & Penn species preset + seed.
 *
 * @param species  preset id (e.g. "douglasFir", "blackOak", "palm") or a TreeParams object
 * @param seed     deterministic seed
 * @param opts     bake budget (radialSegments / maxBranchDepth / maxLeaves / maxStems) + colors
 */
export function treeTemplateFromSpecies(
  species: string,
  seed: number,
  opts: TreeTemplateOptions = {},
): Template {
  const bakeOpts: BakeOptions = {
    radialSegments: opts.radialSegments,
    branchSamples: opts.branchSamples,
    branchCaps: opts.branchCaps,
    maxBranchDepth: opts.maxBranchDepth,
    maxStems: opts.maxStems,
    maxLeaves: opts.maxLeaves,
    leafScaleMultiplier: opts.leafScaleMultiplier,
    blossomScaleMultiplier: opts.blossomScaleMultiplier,
  };
  const generateLeaves = (opts.maxLeaves ?? 1) !== 0;
  const baked = generateBakedTree(species, seed >>> 0, bakeOpts, generateLeaves);

  const barkColor = new THREE.Color(opts.barkColor ?? DEFAULT_BARK);
  const leafColor = new THREE.Color(opts.leafColor ?? DEFAULT_LEAF);
  const leafTintable = opts.leafTintable ?? true;
  const swayFrom = opts.swayFrom ?? 0.25;
  const leafSwayBoost = opts.leafSwayBoost ?? 1.0;

  // Normalize: scale so total height ≈ 1, recenter base to origin in XZ.
  const height = Math.max(1e-4, baked.max.y - baked.min.y);
  const scale = 1 / height;
  const cx = (baked.min.x + baked.max.x) * 0.5;
  const cz = (baked.min.z + baked.max.z) * 0.5;
  const baseY = baked.min.y;

  const branchVerts = baked.branches.positions.length / 3;
  const leafVerts = baked.leaves.positions.length / 3;
  const totalVerts = branchVerts + leafVerts;
  const totalIdx = baked.branches.indices.length + baked.leaves.indices.length;

  const pos = new Float32Array(totalVerts * 3);
  const nrm = new Float32Array(totalVerts * 3);
  const col = new Float32Array(totalVerts * 3);
  const tintable = new Uint8Array(totalVerts);
  const sway = new Float32Array(totalVerts);
  const idx = new Uint32Array(totalIdx);

  // Branches first.
  const bp = baked.branches.positions;
  const bn = baked.branches.normals;
  for (let i = 0; i < branchVerts; i++) {
    const o = i * 3;
    const ny = (bp[o + 1]! - baseY) * scale;
    pos[o] = (bp[o]! - cx) * scale;
    pos[o + 1] = ny;
    pos[o + 2] = (bp[o + 2]! - cz) * scale;
    nrm[o] = bn[o]!;
    nrm[o + 1] = bn[o + 1]!;
    nrm[o + 2] = bn[o + 2]!;
    col[o] = barkColor.r;
    col[o + 1] = barkColor.g;
    col[o + 2] = barkColor.b;
    tintable[i] = 0;
    const w = Math.max(0, (ny - swayFrom) / Math.max(1e-4, 1 - swayFrom));
    sway[i] = w * w;
  }

  // Leaves second.
  const lp = baked.leaves.positions;
  const ln = baked.leaves.normals;
  for (let i = 0; i < leafVerts; i++) {
    const src = i * 3;
    const dst = (branchVerts + i) * 3;
    const di = branchVerts + i;
    const ny = (lp[src + 1]! - baseY) * scale;
    pos[dst] = (lp[src]! - cx) * scale;
    pos[dst + 1] = ny;
    pos[dst + 2] = (lp[src + 2]! - cz) * scale;
    nrm[dst] = ln[src]!;
    nrm[dst + 1] = ln[src + 1]!;
    nrm[dst + 2] = ln[src + 2]!;
    col[dst] = leafColor.r;
    col[dst + 1] = leafColor.g;
    col[dst + 2] = leafColor.b;
    tintable[di] = leafTintable ? 1 : 0;
    const w = Math.max(0, (ny - swayFrom) / Math.max(1e-4, 1 - swayFrom));
    sway[di] = Math.min(1, w * w + leafSwayBoost * w);
  }

  // Indices: branches keep their offsets, leaves shift by branchVerts.
  baked.branches.indices.forEach((v, i) => {
    idx[i] = v;
  });
  const off = baked.branches.indices.length;
  baked.leaves.indices.forEach((v, i) => {
    idx[off + i] = v + branchVerts;
  });

  return { pos, nrm, col, tintable, sway, idx };
}
