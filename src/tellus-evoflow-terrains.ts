import type { WorldTemplateId } from "./tellus-types";

export interface EvoflowTerrainSource {
  id: Extract<
    WorldTemplateId,
    | "evoflow-coral-canyon"
    | "evoflow-coral-canyon-child"
    | "evoflow-spires"
    | "evoflow-glass-ridge"
    | "evoflow-lichen-basin"
    | "evoflow-copper-terraces"
    | "evoflow-basalt-teeth"
    | "evoflow-coral-fold"
  >;
  label: string;
  worldId: string;
  concept: string;
  heightUrl: string;
  semanticUrl: string;
  previewUrl: string;
  heightScale: number;
  heightOffset: number;
  waterMode: "ocean" | "lake" | "dry";
}

export const evoflowTerrainSources: Record<EvoflowTerrainSource["id"], EvoflowTerrainSource> = {
  "evoflow-coral-canyon": {
    id: "evoflow-coral-canyon",
    label: "Evoflow Coral Canyon",
    worldId: "world_1c1a355ce3af",
    concept: "coral cathedral city grown inside a canyon",
    heightUrl: "/evoflow/demo_coral_canyon/world_1c1a355ce3af/assets/height.png",
    semanticUrl: "/evoflow/demo_coral_canyon/world_1c1a355ce3af/assets/semantic.png",
    previewUrl: "/evoflow/demo_coral_canyon/world_1c1a355ce3af/assets/preview.png",
    heightScale: 30,
    heightOffset: -1.8,
    waterMode: "ocean",
  },
  "evoflow-coral-canyon-child": {
    id: "evoflow-coral-canyon-child",
    label: "Evoflow River Canyon",
    worldId: "world_river_canyon",
    concept: "a broad upland divided by a winding river canyon and tributary ravines",
    heightUrl: "/evoflow/terrain_variety/world_river_canyon/assets/height.png",
    semanticUrl: "/evoflow/terrain_variety/world_river_canyon/assets/semantic.png",
    previewUrl: "/evoflow/terrain_variety/world_river_canyon/assets/preview.png",
    heightScale: 30,
    heightOffset: -1,
    waterMode: "lake",
  },
  "evoflow-spires": {
    id: "evoflow-spires",
    label: "Evoflow Alpine Spires",
    worldId: "world_alpine_spires",
    concept: "an asymmetric alpine range with isolated spires, saddles, and open foothills",
    heightUrl: "/evoflow/terrain_variety/world_alpine_spires/assets/height.png",
    semanticUrl: "/evoflow/terrain_variety/world_alpine_spires/assets/semantic.png",
    previewUrl: "/evoflow/terrain_variety/world_alpine_spires/assets/preview.png",
    heightScale: 34,
    heightOffset: -0.4,
    waterMode: "lake",
  },
  "evoflow-glass-ridge": {
    id: "evoflow-glass-ridge",
    label: "Evoflow Glass Ridge",
    worldId: "world_glass_ridge",
    concept: "a long crystalline escarpment sweeping across quiet lowlands",
    heightUrl: "/evoflow/terrain_variety/world_glass_ridge/assets/height.png",
    semanticUrl: "/evoflow/terrain_variety/world_glass_ridge/assets/semantic.png",
    previewUrl: "/evoflow/terrain_variety/world_glass_ridge/assets/preview.png",
    heightScale: 35,
    heightOffset: -3.1,
    waterMode: "lake",
  },
  "evoflow-lichen-basin": {
    id: "evoflow-lichen-basin",
    label: "Evoflow Lichen Caldera",
    worldId: "world_lichen_caldera",
    concept: "a mossy breached caldera enclosing a sheltered basin and upland rim",
    heightUrl: "/evoflow/terrain_variety/world_lichen_caldera/assets/height.png",
    semanticUrl: "/evoflow/terrain_variety/world_lichen_caldera/assets/semantic.png",
    previewUrl: "/evoflow/terrain_variety/world_lichen_caldera/assets/preview.png",
    heightScale: 33,
    heightOffset: -0.8,
    waterMode: "lake",
  },
  "evoflow-copper-terraces": {
    id: "evoflow-copper-terraces",
    label: "Evoflow Copper Mesas",
    worldId: "world_copper_mesas",
    concept: "separated copper mesas with broad buildable tops and winding dry washes",
    heightUrl: "/evoflow/terrain_variety/world_copper_mesas/assets/height.png",
    semanticUrl: "/evoflow/terrain_variety/world_copper_mesas/assets/semantic.png",
    previewUrl: "/evoflow/terrain_variety/world_copper_mesas/assets/preview.png",
    heightScale: 32,
    heightOffset: -8.1,
    waterMode: "dry",
  },
  "evoflow-basalt-teeth": {
    id: "evoflow-basalt-teeth",
    label: "Evoflow Basalt Badlands",
    worldId: "world_basalt_badlands",
    concept: "branching basalt badlands cut by erosion channels and narrow high ridges",
    heightUrl: "/evoflow/terrain_variety/world_basalt_badlands/assets/height.png",
    semanticUrl: "/evoflow/terrain_variety/world_basalt_badlands/assets/semantic.png",
    previewUrl: "/evoflow/terrain_variety/world_basalt_badlands/assets/preview.png",
    heightScale: 34,
    heightOffset: 0.5,
    waterMode: "lake",
  },
  "evoflow-coral-fold": {
    id: "evoflow-coral-fold",
    label: "Evoflow Coral Archipelago",
    worldId: "world_coral_archipelago",
    concept: "an open coral archipelago of uneven islands, lagoons, and sheltered channels",
    heightUrl: "/evoflow/terrain_variety/world_coral_archipelago/assets/height.png",
    semanticUrl: "/evoflow/terrain_variety/world_coral_archipelago/assets/semantic.png",
    previewUrl: "/evoflow/terrain_variety/world_coral_archipelago/assets/preview.png",
    heightScale: 32,
    heightOffset: -4,
    waterMode: "ocean",
  },
};

export function evoflowTerrainSourceFor(
  template: WorldTemplateId,
): EvoflowTerrainSource | null {
  return template in evoflowTerrainSources
    ? evoflowTerrainSources[template as EvoflowTerrainSource["id"]]
    : null;
}

export function evoflowWaterModeFor(
  template: WorldTemplateId,
): EvoflowTerrainSource["waterMode"] | null {
  return evoflowTerrainSourceFor(template)?.waterMode ?? null;
}
