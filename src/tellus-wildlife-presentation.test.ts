import { describe, expect, it, vi } from "vitest";
import { removeWildlifePresentationState } from "./tellus-wildlife-presentation";
import type { WildlifeAnimalConfig } from "./world-protocol";

describe("removeWildlifePresentationState", () => {
  it("clears a deleted animal from every presentation store and assignment", () => {
    const animalId = "deer-1";
    const otherId = "deer-2";
    const remove = vi.fn();
    const configs = new Map([[animalId, { animalId } as WildlifeAnimalConfig]]);
    const poses = new Map([[animalId, { id: animalId } as never]]);
    const tiers = new Map([[animalId, "instanced" as const]]);
    const lastIntents = new Map([[animalId, "walk"]]);

    const assignments = removeWildlifePresentationState(animalId, {
      configs,
      interpolation: { remove },
      poses,
      tiers,
      lastIntents,
      assignments: [
        {
          id: animalId,
          tier: "instanced",
          distanceMeters: 12,
          updateIntervalFrames: 2,
          visible: true,
          supportsInstancedAnimation: true,
        },
        {
          id: otherId,
          tier: "full",
          distanceMeters: 4,
          updateIntervalFrames: 1,
          visible: true,
          supportsInstancedAnimation: false,
        },
      ],
    });

    expect(configs.has(animalId)).toBe(false);
    expect(remove).toHaveBeenCalledWith(animalId);
    expect(poses.has(animalId)).toBe(false);
    expect(tiers.has(animalId)).toBe(false);
    expect(lastIntents.has(animalId)).toBe(false);
    expect(assignments).toEqual([{
      id: otherId,
      tier: "full",
      distanceMeters: 4,
      updateIntervalFrames: 1,
      visible: true,
      supportsInstancedAnimation: false,
    }]);
  });
});
