import type { WildlifeUiAnimal } from "./tellus-types";

export interface WildlifePopulationPolicy {
  count: number;
  radiusMeters: number;
}

export interface WildlifePopulationSummary {
  herdId: string;
  speciesProfileId: string;
  movementMode: WildlifeUiAnimal["movementMode"];
  total: number;
  enabled: number;
  states: string[];
  animals: WildlifeUiAnimal[];
}

export function normalizeWildlifePopulationPolicy(
  count: number,
  radiusMeters: number,
  populationCap = 12,
): WildlifePopulationPolicy {
  const safeCap = Number.isFinite(populationCap) ? Math.max(1, Math.floor(populationCap)) : 12;
  return {
    count: Number.isFinite(count) ? Math.max(1, Math.min(safeCap, Math.round(count))) : 6,
    radiusMeters: Number.isFinite(radiusMeters)
      ? Math.max(8, Math.min(2_000, Math.round(radiusMeters)))
      : 48,
  };
}

export function summarizeWildlifePopulations(
  animals: readonly WildlifeUiAnimal[],
): WildlifePopulationSummary[] {
  const populations = new Map<string, WildlifePopulationSummary>();
  for (const animal of animals) {
    const herdId = animal.herdId?.trim() || `individual:${animal.animalId}`;
    let population = populations.get(herdId);
    if (!population) {
      population = {
        herdId,
        speciesProfileId: animal.speciesProfileId,
        movementMode: animal.movementMode,
        total: 0,
        enabled: 0,
        states: [],
        animals: [],
      };
      populations.set(herdId, population);
    }
    population.total += 1;
    if (animal.enabled) population.enabled += 1;
    const state = animal.pose?.state?.trim();
    if (state && !population.states.includes(state)) population.states.push(state);
    population.animals.push(animal);
  }

  return [...populations.values()]
    .map((population) => ({
      ...population,
      states: population.states.sort((left, right) => left.localeCompare(right)),
      animals: population.animals.sort((left, right) => left.animalId.localeCompare(right.animalId)),
    }))
    .sort((left, right) => left.herdId.localeCompare(right.herdId));
}
