import { describe, expect, it } from "vitest";
import { planWildlifeLod, type WildlifeRenderTier } from "./tellus-wildlife-lod";

describe("planWildlifeLod", () => {
  it("uses full rigs nearby, instances VAT-capable mid-field wildlife, and culls beyond range", () => {
    const assignments = planWildlifeLod([
      { id: "near", distanceMeters: 8, visible: true, supportsInstancedAnimation: true },
      { id: "mid", distanceMeters: 50, visible: true, supportsInstancedAnimation: true },
      { id: "fallback", distanceMeters: 50, visible: true, supportsInstancedAnimation: false },
      { id: "far", distanceMeters: 240, visible: true, supportsInstancedAnimation: true },
    ]);
    expect(Object.fromEntries(assignments.map((entry) => [entry.id, entry.tier]))).toEqual({
      near: "full",
      mid: "instanced",
      fallback: "impostor",
      far: "culled",
    });
  });

  it("enforces budgets by degrading the most distant animals", () => {
    const assignments = planWildlifeLod([
      { id: "a", distanceMeters: 2, visible: true, supportsInstancedAnimation: true },
      { id: "b", distanceMeters: 3, visible: true, supportsInstancedAnimation: true },
      { id: "c", distanceMeters: 4, visible: true, supportsInstancedAnimation: true },
    ], new Map(), { maxFull: 1, maxInstanced: 1, maxImpostors: 1 });
    expect(assignments.map(({ tier }) => tier)).toEqual(["full", "instanced", "impostor"]);
  });

  it("applies hysteresis to prevent tier thrashing at a distance boundary", () => {
    const previous = new Map<string, WildlifeRenderTier>([["deer", "full"]]);
    expect(planWildlifeLod([
      { id: "deer", distanceMeters: 27, visible: true, supportsInstancedAnimation: true },
    ], previous)[0]?.tier).toBe("full");
    expect(planWildlifeLod([
      { id: "deer", distanceMeters: 30, visible: true, supportsInstancedAnimation: true },
    ], previous)[0]?.tier).toBe("instanced");
  });
});
