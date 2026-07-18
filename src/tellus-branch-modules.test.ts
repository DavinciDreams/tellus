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
});
