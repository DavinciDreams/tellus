import type { WorldTemplateId } from "./tellus-types";

export interface EvoflowTerrainSource {
  id: Extract<WorldTemplateId, "evoflow-coral-canyon" | "evoflow-coral-canyon-child">;
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
};

export function evoflowTerrainSourceFor(
  template: WorldTemplateId,
): EvoflowTerrainSource | null {
  return template in evoflowTerrainSources
    ? evoflowTerrainSources[template as EvoflowTerrainSource["id"]]
    : null;
}
