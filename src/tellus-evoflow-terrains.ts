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
    heightOffset: -8.5,
  },
  "evoflow-coral-canyon-child": {
    id: "evoflow-coral-canyon-child",
    label: "Evoflow Canyon Child",
    worldId: "world_0b80fecab0f7",
    concept: "mutated coral cathedral canyon",
    heightUrl: "/evoflow/demo_coral_canyon/world_0b80fecab0f7/assets/height.png",
    semanticUrl: "/evoflow/demo_coral_canyon/world_0b80fecab0f7/assets/semantic.png",
    previewUrl: "/evoflow/demo_coral_canyon/world_0b80fecab0f7/assets/preview.png",
    heightScale: 31,
    heightOffset: -8.75,
  },
  "evoflow-spires": {
    id: "evoflow-spires",
    label: "Evoflow Spires",
    worldId: "world_c5d89d03d08c",
    concept: "expanded coral canyon with sharp mineral spires",
    heightUrl: "/evoflow/coral_canyon_expanded/world_c5d89d03d08c/assets/height.png",
    semanticUrl: "/evoflow/coral_canyon_expanded/world_c5d89d03d08c/assets/semantic.png",
    previewUrl: "/evoflow/coral_canyon_expanded/world_c5d89d03d08c/assets/preview.png",
    heightScale: 34,
    heightOffset: -9.25,
  },
  "evoflow-glass-ridge": {
    id: "evoflow-glass-ridge",
    label: "Evoflow Glass Ridge",
    worldId: "world_f7fc2be95d4b",
    concept: "glass-basalt canyon with high ridges",
    heightUrl: "/evoflow/coral_canyon_expanded/world_f7fc2be95d4b/assets/height.png",
    semanticUrl: "/evoflow/coral_canyon_expanded/world_f7fc2be95d4b/assets/semantic.png",
    previewUrl: "/evoflow/coral_canyon_expanded/world_f7fc2be95d4b/assets/preview.png",
    heightScale: 35,
    heightOffset: -10.5,
  },
  "evoflow-lichen-basin": {
    id: "evoflow-lichen-basin",
    label: "Evoflow Lichen Basin",
    worldId: "world_f966d912f9ea",
    concept: "lichen concrete basin with broken canyon walls",
    heightUrl: "/evoflow/coral_canyon_expanded/world_f966d912f9ea/assets/height.png",
    semanticUrl: "/evoflow/coral_canyon_expanded/world_f966d912f9ea/assets/semantic.png",
    previewUrl: "/evoflow/coral_canyon_expanded/world_f966d912f9ea/assets/preview.png",
    heightScale: 33,
    heightOffset: -9.75,
  },
  "evoflow-copper-terraces": {
    id: "evoflow-copper-terraces",
    label: "Evoflow Copper Terraces",
    worldId: "world_be4f6e7753dc",
    concept: "sand-copper canyon terraces",
    heightUrl: "/evoflow/coral_canyon_expanded/world_be4f6e7753dc/assets/height.png",
    semanticUrl: "/evoflow/coral_canyon_expanded/world_be4f6e7753dc/assets/semantic.png",
    previewUrl: "/evoflow/coral_canyon_expanded/world_be4f6e7753dc/assets/preview.png",
    heightScale: 32,
    heightOffset: -9.35,
  },
  "evoflow-basalt-teeth": {
    id: "evoflow-basalt-teeth",
    label: "Evoflow Basalt Teeth",
    worldId: "world_b499c5e223c5",
    concept: "glass-basalt canyon teeth and ridges",
    heightUrl: "/evoflow/coral_canyon_expanded/world_b499c5e223c5/assets/height.png",
    semanticUrl: "/evoflow/coral_canyon_expanded/world_b499c5e223c5/assets/semantic.png",
    previewUrl: "/evoflow/coral_canyon_expanded/world_b499c5e223c5/assets/preview.png",
    heightScale: 34,
    heightOffset: -9.5,
  },
  "evoflow-coral-fold": {
    id: "evoflow-coral-fold",
    label: "Evoflow Coral Fold",
    worldId: "world_15b3b531fc46",
    concept: "coral-mineral folded canyon",
    heightUrl: "/evoflow/coral_canyon_expanded/world_15b3b531fc46/assets/height.png",
    semanticUrl: "/evoflow/coral_canyon_expanded/world_15b3b531fc46/assets/semantic.png",
    previewUrl: "/evoflow/coral_canyon_expanded/world_15b3b531fc46/assets/preview.png",
    heightScale: 32,
    heightOffset: -9,
  },
};

export function evoflowTerrainSourceFor(
  template: WorldTemplateId,
): EvoflowTerrainSource | null {
  return template in evoflowTerrainSources
    ? evoflowTerrainSources[template as EvoflowTerrainSource["id"]]
    : null;
}
