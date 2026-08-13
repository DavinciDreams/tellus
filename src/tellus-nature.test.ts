import { describe, expect, it } from "vitest";
import type { WildlifeUiAnimal } from "./tellus-types";
import {
  normalizeWildlifePopulationPolicy,
  summarizeWildlifePopulations,
} from "./tellus-nature";

function animal(
  animalId: string,
  herdId: string | undefined,
  enabled = true,
  state?: string,
): WildlifeUiAnimal {
  return {
    animalId,
    enabled,
    speciesProfileId: "deer",
    movementMode: "ground",
    herdId,
    seed: 1,
    revision: 1,
    pose: state ? { state, animationIntent: state } : null,
    renderTier: "full",
  };
}

describe("normalizeWildlifePopulationPolicy", () => {
  it("rounds and clamps population policy to the supported runtime limits", () => {
    expect(normalizeWildlifePopulationPolicy(99.8, 2, 12)).toEqual({ count: 12, radiusMeters: 8 });
    expect(normalizeWildlifePopulationPolicy(3.4, 4_000, 12)).toEqual({ count: 3, radiusMeters: 2_000 });
  });

  it("uses safe defaults for non-finite input", () => {
    expect(normalizeWildlifePopulationPolicy(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      count: 6,
      radiusMeters: 48,
    });
  });
});

describe("summarizeWildlifePopulations", () => {
  it("groups managed animals by herd and exposes enabled and behavior summaries", () => {
    const summaries = summarizeWildlifePopulations([
      animal("doe-2", "north-herd", false, "idle"),
      animal("doe-1", "north-herd", true, "graze"),
      animal("stag-1", "south-herd", true, "travel"),
    ]);

    expect(summaries.map((summary) => summary.herdId)).toEqual(["north-herd", "south-herd"]);
    expect(summaries[0]).toMatchObject({ total: 2, enabled: 1, states: ["graze", "idle"] });
    expect(summaries[0]?.animals.map((entry) => entry.animalId)).toEqual(["doe-1", "doe-2"]);
  });

  it("keeps ungrouped managed animals visible as individual populations", () => {
    expect(summarizeWildlifePopulations([animal("fox-1", undefined)])[0]?.herdId).toBe("individual:fox-1");
  });
});
