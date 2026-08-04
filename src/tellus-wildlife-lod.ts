export type WildlifeRenderTier = "full" | "instanced" | "impostor" | "culled";

export interface WildlifeLodCandidate {
  id: string;
  distanceMeters: number;
  visible: boolean;
  supportsInstancedAnimation: boolean;
  selected?: boolean;
}

export interface WildlifeLodAssignment extends WildlifeLodCandidate {
  tier: WildlifeRenderTier;
  updateIntervalFrames: number;
}

export interface WildlifeLodBudget {
  fullDistanceMeters: number;
  instancedDistanceMeters: number;
  impostorDistanceMeters: number;
  hysteresisMeters: number;
  maxFull: number;
  maxInstanced: number;
  maxImpostors: number;
}

export const DEFAULT_WILDLIFE_LOD_BUDGET: WildlifeLodBudget = {
  fullDistanceMeters: 24,
  instancedDistanceMeters: 72,
  impostorDistanceMeters: 180,
  hysteresisMeters: 5,
  maxFull: 12,
  maxInstanced: 96,
  maxImpostors: 256,
};

function desiredTier(
  candidate: WildlifeLodCandidate,
  previous: WildlifeRenderTier | undefined,
  budget: WildlifeLodBudget,
): WildlifeRenderTier {
  if (!candidate.visible) return "culled";
  const h = budget.hysteresisMeters;
  const fullThreshold = budget.fullDistanceMeters + (previous === "full" ? h : 0);
  const instanceThreshold = budget.instancedDistanceMeters + (previous === "instanced" ? h : 0);
  const impostorThreshold = budget.impostorDistanceMeters + (previous === "impostor" ? h : 0);
  if (candidate.selected || candidate.distanceMeters <= fullThreshold) return "full";
  if (candidate.supportsInstancedAnimation && candidate.distanceMeters <= instanceThreshold) return "instanced";
  if (candidate.distanceMeters <= impostorThreshold) return "impostor";
  return "culled";
}

/** Produces stable, distance-prioritized render work without allocating Three.js objects. */
export function planWildlifeLod(
  candidates: readonly WildlifeLodCandidate[],
  previousTiers: ReadonlyMap<string, WildlifeRenderTier> = new Map(),
  overrides: Partial<WildlifeLodBudget> = {},
): WildlifeLodAssignment[] {
  const budget = { ...DEFAULT_WILDLIFE_LOD_BUDGET, ...overrides };
  const sorted = [...candidates].sort((a, b) =>
    Number(Boolean(b.selected)) - Number(Boolean(a.selected)) ||
    a.distanceMeters - b.distanceMeters ||
    a.id.localeCompare(b.id));
  const counts: Record<Exclude<WildlifeRenderTier, "culled">, number> = {
    full: 0,
    instanced: 0,
    impostor: 0,
  };

  return sorted.map((candidate) => {
    let tier = desiredTier(candidate, previousTiers.get(candidate.id), budget);
    if (tier === "full" && counts.full >= budget.maxFull) {
      tier = candidate.supportsInstancedAnimation ? "instanced" : "impostor";
    }
    if (tier === "instanced" && counts.instanced >= budget.maxInstanced) tier = "impostor";
    if (tier === "impostor" && counts.impostor >= budget.maxImpostors) tier = "culled";
    if (tier !== "culled") counts[tier] += 1;
    return {
      ...candidate,
      tier,
      updateIntervalFrames: tier === "full" ? 1 : tier === "instanced" ? 2 : tier === "impostor" ? 12 : 0,
    };
  });
}
