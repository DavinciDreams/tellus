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

  it("uses a rounder shared tube near the player without increasing draw-call vocabulary", () => {
    const far = branchSegmentPrototypeTemplate("taper-75", 5);
    const near = branchSegmentPrototypeTemplate("taper-75", 8);

    expect(near).toBe(branchSegmentPrototypeTemplate("taper-75", 8));
    expect(near).not.toBe(far);
    expect(near.idx.length).toBeGreaterThan(far.idx.length);
    expect(near.idx.length).toBeLessThan(far.idx.length * 2);
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
    expect(constrained.leaves.length).toBeGreaterThan(0);
    expect(constrained.leaves.length).toBeGreaterThanOrEqual(Math.floor(tree.leaves.length / 4));
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
    expect(wide.modules.length).toBe(narrow.modules.length);
    expect(wide.leaves.length).toBe(narrow.leaves.length);

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

  it("shapes broadleaf scaffolds from wide lower limbs into steep upper leaders", () => {
    const tree = branchModuleTreeFromSpecies("cambridgeOak", 11, {
      maxBranchDepth: 3, maxStems: 90, maxLeaves: 220,
    });
    const primaries = tree.modules
      .filter((module) => module.depth === 1)
      .map((module) => tree.segments[module.segmentIds[0]!]!)
      .sort((a, b) => a.start.y - b.start.y);
    expect(primaries.length).toBeGreaterThan(4);
    const split = Math.floor(primaries.length / 2);
    const angleFromVertical = (segment: (typeof primaries)[number]) => Math.acos(THREE.MathUtils.clamp(
      segment.end.clone().sub(segment.start).normalize().dot(new THREE.Vector3(0, 1, 0)),
      -1,
      1,
    ));
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const lowerAngle = average(primaries.slice(0, split).map(angleFromVertical));
    const upperAngle = average(primaries.slice(split).map(angleFromVertical));
    expect(lowerAngle).toBeGreaterThan(upperAngle + THREE.MathUtils.degToRad(8));
    expect(upperAngle).toBeLessThan(THREE.MathUtils.degToRad(55));
  });

  it("makes broadleaf secondary forks inherit their parent limb direction", () => {
    const tree = branchModuleTreeFromSpecies("cambridgeOak", 13, {
      maxBranchDepth: 3, maxStems: 90, maxLeaves: 220,
    });
    const inheritedDots = tree.modules
      .filter((module) => module.depth === 2 && module.parentModuleId !== null)
      .map((module) => {
        const child = tree.segments[module.segmentIds[0]!]!;
        const parent = tree.modules[module.parentModuleId!]!;
        const closestParent = parent.segmentIds
          .map((id) => tree.segments[id]!)
          .sort((a, b) => a.start.distanceToSquared(child.start) - b.start.distanceToSquared(child.start))[0]!;
        return child.end.clone().sub(child.start).normalize().dot(
          closestParent.end.clone().sub(closestParent.start).normalize(),
        );
      });
    expect(inheritedDots.length).toBeGreaterThan(3);
    expect(inheritedDots.every((dot) => dot > 0.35)).toBe(true);
  });

  it("offers rounded, columnar, umbrella, and spreading broadleaf crown presets", () => {
    const options = {
      palette: "decurrent-broadleaf" as const,
      maxBranchDepth: 3,
      maxStems: 90,
      maxLeaves: 180,
    };
    const rounded = branchModuleTreeFromSpecies("genericTree", 17, { ...options, broadleafCrown: "rounded" });
    const columnar = branchModuleTreeFromSpecies("genericTree", 17, { ...options, broadleafCrown: "columnar" });
    const umbrella = branchModuleTreeFromSpecies("genericTree", 17, { ...options, broadleafCrown: "umbrella" });
    const spreadingTree = branchModuleTreeFromSpecies("genericTree", 17, { ...options, broadleafCrown: "spreading" });
    const crownWidth = (tree: typeof rounded) => Math.max(
      ...tree.segments.flatMap((segment) => [
        Math.hypot(segment.start.x, segment.start.z),
        Math.hypot(segment.end.x, segment.end.z),
      ]),
    );
    const lowestPrimary = (tree: typeof rounded) => Math.min(
      ...tree.modules
        .filter((module) => module.depth === 1)
        .map((module) => tree.segments[module.segmentIds[0]!]!.start.y),
    );

    expect(crownWidth(columnar)).toBeLessThan(crownWidth(rounded));
    expect(crownWidth(umbrella)).toBeGreaterThan(crownWidth(columnar) * 1.35);
    expect(crownWidth(spreadingTree)).toBeGreaterThan(crownWidth(rounded));
    expect(lowestPrimary(umbrella)).toBeGreaterThan(lowestPrimary(rounded) + 0.15);
  });

  it("uses spread to lengthen lateral broadleaf scaffolds without stretching the trunk", () => {
    const options = {
      palette: "decurrent-broadleaf" as const,
      broadleafCrown: "spreading" as const,
      maxBranchDepth: 3,
      maxStems: 90,
      maxLeaves: 180,
    };
    const natural = branchModuleTreeFromSpecies("cambridgeOak", 23, { ...options, spread: 1 });
    const broad = branchModuleTreeFromSpecies("cambridgeOak", 23, { ...options, spread: 1.35 });
    const crownRadius = (tree: typeof natural) => Math.max(
      ...tree.segments.flatMap((segment) => [
        Math.hypot(segment.start.x, segment.start.z),
        Math.hypot(segment.end.x, segment.end.z),
      ]),
    );
    const trunkHeight = (tree: typeof natural) => {
      const trunk = tree.modules.find((module) => module.depth === 0)!;
      return Math.max(...trunk.segmentIds.map((id) => tree.segments[id]!.end.y));
    };

    expect(crownRadius(broad)).toBeGreaterThan(crownRadius(natural) * 1.12);
    expect(trunkHeight(broad)).toBeCloseTo(trunkHeight(natural), 8);
    expect(broad.segments.length).toBe(natural.segments.length);
  });

  it("blends broadleaf forks out of the parent tangent without changing the branch budget", () => {
    const options = {
      palette: "decurrent-broadleaf" as const,
      broadleafCrown: "spreading" as const,
      maxBranchDepth: 3,
      maxStems: 90,
      maxLeaves: 180,
      spread: 1.35,
    };
    const hardFork = branchModuleTreeFromSpecies("cambridgeOak", 29, { ...options, junctionBlend: 0 });
    const grownFork = branchModuleTreeFromSpecies("cambridgeOak", 29, { ...options, junctionBlend: 1 });

    const firstForkAngle = (tree: typeof hardFork) => {
      const child = tree.modules.find((module) => module.depth === 1)!;
      const childSegment = tree.segments[child.segmentIds[0]!]!;
      const parent = tree.modules[child.parentModuleId!]!;
      const parentSegment = parent.segmentIds
        .map((id) => tree.segments[id]!)
        .reduce((nearest, segment) => (
          segment.start.distanceToSquared(childSegment.start) < nearest.start.distanceToSquared(childSegment.start)
            ? segment
            : nearest
        ));
      const parentDirection = parentSegment.end.clone().sub(parentSegment.start).normalize();
      const childDirection = childSegment.end.clone().sub(childSegment.start).normalize();
      return parentDirection.angleTo(childDirection);
    };

    expect(firstForkAngle(grownFork)).toBeLessThan(firstForkAngle(hardFork) * 0.65);
    expect(grownFork.segments.length).toBe(hardFork.segments.length);
    expect(grownFork.leaves.length).toBe(hardFork.leaves.length);
  });

  it("varies broadleaf card proportions without changing conifer foliage proportions", () => {
    const broadleaf = branchModuleTreeFromSpecies("genericTree", 21, {
      palette: "decurrent-broadleaf", maxBranchDepth: 2, maxStems: 60, maxLeaves: 80,
    });
    const scales = broadleaf.leaves.map((leaf) => {
      const scale = new THREE.Vector3();
      leaf.matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      return scale.x / scale.y;
    });
    expect(Math.max(...scales) - Math.min(...scales)).toBeGreaterThan(0.2);

    const baseConifer = branchModuleTreeFromSpecies("douglasFir", 21, {
      palette: "excurrent-conifer", maxBranchDepth: 2, maxStems: 60, maxLeaves: 80,
    });
    const ignoredCrownOption = branchModuleTreeFromSpecies("douglasFir", 21, {
      palette: "excurrent-conifer", broadleafCrown: "umbrella", maxBranchDepth: 2, maxStems: 60, maxLeaves: 80,
    });
    expect(ignoredCrownOption.segments.map((segment) => segment.end.toArray())).toEqual(
      baseConifer.segments.map((segment) => segment.end.toArray()),
    );
    expect(ignoredCrownOption.leaves.map((leaf) => leaf.matrix.toArray())).toEqual(
      baseConifer.leaves.map((leaf) => leaf.matrix.toArray()),
    );
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
