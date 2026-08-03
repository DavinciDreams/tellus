import type { WildlifeInterpolationBuffer, WildlifePresentationPose } from "./tellus-wildlife-interpolation";
import type { WildlifeLodAssignment, WildlifeRenderTier } from "./tellus-wildlife-lod";
import type { WildlifeAnimalConfig } from "./world-protocol";

export type WildlifePresentationState = {
  configs: Map<string, WildlifeAnimalConfig>;
  interpolation: Pick<WildlifeInterpolationBuffer, "remove">;
  poses: Map<string, WildlifePresentationPose>;
  tiers: Map<string, WildlifeRenderTier>;
  lastIntents: Map<string, string>;
  assignments: WildlifeLodAssignment[];
};

/** Removes every client-owned presentation record for a server-deleted animal. */
export function removeWildlifePresentationState(
  animalId: string,
  state: WildlifePresentationState,
): WildlifeLodAssignment[] {
  state.configs.delete(animalId);
  state.interpolation.remove(animalId);
  state.poses.delete(animalId);
  state.tiers.delete(animalId);
  state.lastIntents.delete(animalId);
  return state.assignments.filter((assignment) => assignment.id !== animalId);
}
