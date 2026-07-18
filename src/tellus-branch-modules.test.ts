import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  branchModuleLodView,
  branchModuleTreeFromSpecies,
  branchSegmentPrototypeTemplate,
} from "./tellus-branch-modules";

describe("branch module trees", () => {
  it("converts different species into the same small segment-prototype vocabulary", () => {
    const oak = branchModuleTreeFromSpecies("blackOak", 12, {
      maxBranchDepth: 2,
      maxStems: 80,
      maxLeaves: 120,
    });
    const fir = branchModuleTreeFromSpecies("douglasFir", 34, {
      maxBranchDepth: 2,
      maxStems: 80,
      maxLeaves: 120,
    });
    const ids = new Set([...oak.segments, ...fir.segments].map((segment) => segment.prototypeId));
    expect(oak.modules.length).toBeGreaterThan(1);
    expect(fir.modules.length).toBeGreaterThan(1);
    expect(ids.size).toBeLessThanOrEqual(4);
    expect([...ids].every((id) => branchSegmentPrototypeTemplate(id).idx.length > 0)).toBe(true);
  });

  it("keeps module parent and child links internally consistent", () => {
    const tree = branchModuleTreeFromSpecies("quakingAspen", 55, {
      maxBranchDepth: 3,
      maxStems: 120,
      maxLeaves: 160,
    });
    for (const module of tree.modules) {
      for (const childId of module.childModuleIds) {
        expect(tree.modules[childId]?.parentModuleId).toBe(module.id);
      }
      for (const segmentId of module.segmentIds) {
        expect(tree.segments[segmentId]?.moduleId).toBe(module.id);
      }
    }
  });

  it("anchors every rendered leaf to a real branch segment", () => {
    const tree = branchModuleTreeFromSpecies("blackOak", 91, {
      maxBranchDepth: 3,
      maxStems: 160,
      maxLeaves: 220,
    });
    expect(tree.leaves.length).toBeGreaterThan(0);
    for (const leaf of tree.leaves) {
      const segment = tree.segments[leaf.segmentId];
      expect(segment).toBeDefined();
      expect(leaf.t).toBeGreaterThanOrEqual(0);
      expect(leaf.t).toBeLessThanOrEqual(1);
      const expected = segment!.start.clone().lerp(segment!.end, leaf.t);
      expect(leaf.anchor.distanceTo(expected)).toBeLessThan(1e-6);
    }
  });

  it("reduces connected branch structure without leaving floating leaves", () => {
    const tree = branchModuleTreeFromSpecies("blackOak", 111, {
      maxBranchDepth: 3,
      maxStems: 180,
      maxLeaves: 260,
    });
    const balanced = branchModuleLodView(tree, 1);
    const constrained = branchModuleLodView(tree, 2);
    expect(balanced.segments.length).toBeLessThan(tree.segments.length);
    expect(constrained.segments.length).toBeLessThanOrEqual(balanced.segments.length);
    expect(constrained.leaves.length).toBeLessThanOrEqual(balanced.leaves.length);
    const constrainedSegmentIds = new Set(constrained.segments.map((segment) => segment.id));
    expect(constrained.segments.some((segment) => tree.modules[segment.moduleId]?.depth === 0)).toBe(true);
    expect(constrained.leaves.every((leaf) => constrainedSegmentIds.has(leaf.segmentId))).toBe(true);
  });

  it("uses genome shape fields (gnarliness, droop, spread, tropism, branchDensity, branchAngle, vigor, collisionBias) to actually shape the tree", () => {
    const baseOptions = { maxBranchDepth: 3, maxStems: 90, maxLeaves: 140 };
    const baseline = branchModuleTreeFromSpecies("blackOak", 7, baseOptions);

    const gnarled = branchModuleTreeFromSpecies("blackOak", 7, { ...baseOptions, gnarliness: 3 });
    const straight = branchModuleTreeFromSpecies("blackOak", 7, { ...baseOptions, gnarliness: 0 });
    const gnarlDeviation = (tree: typeof baseline) =>
      tree.segments.reduce((sum, s) => sum + s.end.clone().sub(s.start).normalize().distanceTo(new THREE.Vector3(0, 1, 0)), 0);
    expect(gnarlDeviation(gnarled)).toBeGreaterThan(gnarlDeviation(straight));

    const drooping = branchModuleTreeFromSpecies("blackOak", 7, { ...baseOptions, droop: 2 });
    const avgY = (tree: typeof baseline) =>
      tree.segments.reduce((sum, s) => sum + (s.end.y - s.start.y), 0) / tree.segments.length;
    expect(avgY(drooping)).toBeLessThan(avgY(baseline));

    const wide = branchModuleTreeFromSpecies("blackOak", 7, { ...baseOptions, spread: 2.5 });
    const narrow = branchModuleTreeFromSpecies("blackOak", 7, { ...baseOptions, spread: 0.3 });
    const maxRadius = (tree: typeof baseline) =>
      Math.max(...tree.segments.map((s) => Math.hypot(s.end.x, s.end.z)));
    expect(maxRadius(wide)).toBeGreaterThan(maxRadius(narrow));

    const dense = branchModuleTreeFromSpecies("blackOak", 7, { ...baseOptions, branchDensity: 2.5 });
    const sparse = branchModuleTreeFromSpecies("blackOak", 7, { ...baseOptions, branchDensity: 0.3 });
    expect(dense.modules.length).toBeGreaterThan(sparse.modules.length);

    const vigorous = branchModuleTreeFromSpecies("blackOak", 7, { ...baseOptions, vigor: 2 });
    const stunted = branchModuleTreeFromSpecies("blackOak", 7, { ...baseOptions, vigor: 0.4 });
    const totalLength = (tree: typeof baseline) =>
      tree.segments.reduce((sum, s) => sum + s.end.distanceTo(s.start), 0);
    expect(totalLength(vigorous)).toBeGreaterThan(totalLength(stunted));

    const crowded = branchModuleTreeFromSpecies("blackOak", 7, { ...baseOptions, collisionBias: 1.5 });
    expect(crowded.modules.length).toBeGreaterThan(1);

    // Unset fields must reproduce the exact pre-existing shape (no behavior change for existing presets).
    const explicitDefaults = branchModuleTreeFromSpecies("blackOak", 7, {
      ...baseOptions,
      gnarliness: 1,
      droop: 0,
      spread: 1,
      tropism: 0,
      branchDensity: 1,
      branchAngle: 1,
      vigor: 1,
      collisionBias: 0,
    });
    expect(explicitDefaults.segments.length).toBe(baseline.segments.length);
    expect(explicitDefaults.modules.length).toBe(baseline.modules.length);
  });

  it("gives shrub, palm-ish, and vine-ish archetypes real distinct shapes instead of the generic broadleaf default", () => {
    const options = { maxBranchDepth: 3, maxStems: 90, maxLeaves: 140 };
    const broadleaf = branchModuleTreeFromSpecies("genericTree", 5, { ...options, palette: "decurrent-broadleaf" });
    const shrub = branchModuleTreeFromSpecies("genericTree", 5, { ...options, palette: "shrub" });
    const palm = branchModuleTreeFromSpecies("genericTree", 5, { ...options, palette: "palm-ish" });
    const vine = branchModuleTreeFromSpecies("genericTree", 5, { ...options, palette: "vine-ish" });

    // Palms don't branch structurally past the trunk — every module beyond depth 0 should be a
    // first-generation frond, never a second generation growing off a frond.
    const palmMaxDepth = Math.max(...palm.modules.map((m) => m.depth));
    expect(palmMaxDepth).toBeLessThanOrEqual(1);
    expect(broadleaf.modules.some((m) => m.depth >= 2)).toBe(true);

    // Shrubs start branching almost at ground level (very short trunk before the first branch point).
    const shrubTrunk = shrub.modules.find((m) => m.depth === 0)!;
    const broadleafTrunk = broadleaf.modules.find((m) => m.depth === 0)!;
    const trunkHeight = (tree: typeof shrub, trunk: typeof shrubTrunk) =>
      Math.max(...trunk.segmentIds.map((id) => tree.segments[id]!.end.y));
    expect(trunkHeight(shrub, shrubTrunk)).toBeLessThan(trunkHeight(broadleaf, broadleafTrunk));

    // Vines lean toward a thinner, longer, more downward-drooping growth than upright broadleaf.
    const avgRadius = (tree: typeof vine) =>
      tree.segments.reduce((sum, s) => sum + s.baseRadius, 0) / tree.segments.length;
    expect(avgRadius(vine)).toBeLessThan(avgRadius(broadleaf));

    // All four archetypes must still produce valid, internally-consistent trees.
    for (const tree of [broadleaf, shrub, palm, vine]) {
      expect(tree.segments.length).toBeGreaterThan(0);
      expect(tree.leaves.length).toBeGreaterThan(0);
    }
  });

  it("lets an explicit palette override species-name guessing", () => {
    // "oakTree" would normally guess decurrent-broadleaf via the species regex; forcing palette to
    // excurrent-conifer should produce the conifer's tighter, upward-swept trunk instead.
    const guessed = branchModuleTreeFromSpecies("oakTree", 9, { maxBranchDepth: 2, maxStems: 60, maxLeaves: 80 });
    const forced = branchModuleTreeFromSpecies("oakTree", 9, {
      maxBranchDepth: 2, maxStems: 60, maxLeaves: 80, palette: "excurrent-conifer",
    });
    const trunkSegments = (tree: typeof guessed) => tree.modules.find((m) => m.depth === 0)!.segmentIds.length;
    expect(trunkSegments(forced)).not.toBe(trunkSegments(guessed));
  });

  it("spaces branches irregularly instead of an evenly-tiered wagon-wheel pattern", () => {
    // The old formula placed every trunk branch at (child/childCount)*height and yaw evenly divided
    // around a full circle — a small random perturbation on top of an even grid still reads as a
    // mechanically regular stack of flat branch "tiers" once rendered. Real irregular spacing should
    // have gap sizes whose standard deviation is comparable to (not tiny relative to) the mean gap.
    const tree = branchModuleTreeFromSpecies("cambridgeOak", 1, {
      maxBranchDepth: 3, maxStems: 90, maxLeaves: 320,
    });
    const depth1 = tree.modules.filter((m) => m.depth === 1);
    expect(depth1.length).toBeGreaterThan(3);
    const heights = depth1
      .map((m) => tree.segments[m.segmentIds[0]!]!.start.y)
      .sort((a, b) => a - b);
    const gaps = heights.slice(1).map((h, i) => h - heights[i]!);
    const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((sum, g) => sum + (g - meanGap) ** 2, 0) / gaps.length;
    const coefficientOfVariation = Math.sqrt(variance) / meanGap;
    expect(coefficientOfVariation).toBeGreaterThan(0.4);
  });
});
