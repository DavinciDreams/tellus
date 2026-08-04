import type { AnimationIntent } from "./tellus-animation-intents";
import type { WildlifeMovementMode } from "./world-protocol";

export interface WildlifeSpeciesProfile {
  id: string;
  label: string;
  movementMode: WildlifeMovementMode;
  modelUrl: string;
  fallbackAssetStoreId?: string;
  defaultScale: number;
  populationCap: number;
  speeds: { wander: number; travel: number; flee: number };
  clipPreferences: Partial<Record<AnimationIntent, readonly string[]>>;
}

/** Verified from the user-supplied Stag.gltf and its optimized GLB on 2026-07-16. */
export const DEER_WILDLIFE_PROFILE: WildlifeSpeciesProfile = {
  id: "deer",
  label: "Stag",
  movementMode: "ground",
  modelUrl: "/wildlife/deer/stag.glb",
  fallbackAssetStoreId: "6a211103cf0cffae65faeedd",
  defaultScale: 1,
  populationCap: 12,
  speeds: { wander: 1.15, travel: 2.1, flee: 4.5 },
  clipPreferences: {
    idle: ["Idle", "Idle_2"],
    stand: ["Idle", "Idle_2"],
    graze: ["Eating", "Idle_Headlow"],
    walk: ["Walk"],
    run: ["Gallop"],
    jump: ["Gallop_Jump", "Jump_toIdle"],
    attack: ["Attack_Headbutt", "Attack_Kick"],
  },
};

const SPECIES = new Map<string, WildlifeSpeciesProfile>([
  [DEER_WILDLIFE_PROFILE.id, DEER_WILDLIFE_PROFILE],
]);

export function wildlifeSpeciesProfile(id: string): WildlifeSpeciesProfile | undefined {
  return SPECIES.get(id);
}

export function wildlifeClipNameForIntent(
  speciesProfileId: string,
  intent: AnimationIntent,
  availableClipNames: readonly string[],
): string | undefined {
  const preferences = wildlifeSpeciesProfile(speciesProfileId)?.clipPreferences[intent] ?? [];
  for (const preferred of preferences) {
    const exact = availableClipNames.find((name) => name === preferred);
    if (exact) return exact;
    const insensitive = availableClipNames.find((name) => name.toLowerCase() === preferred.toLowerCase());
    if (insensitive) return insensitive;
  }
  return undefined;
}
