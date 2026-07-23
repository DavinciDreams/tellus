import { describe, expect, it } from "vitest";
import {
  ADVANCED_WORLD_TEMPLATE_OPTIONS,
  ALL_WORLD_CREATION_TEMPLATES,
  DEFAULT_WORLD_CREATION_TEMPLATE_IDS,
  WORLD_CREATION_TEMPLATES,
  WORLD_TEMPLATE_OPTIONS,
  fallbackWorldDisplayName,
  normalizeDayNightCycleMs,
  normalizeSkyboxUrl,
  parseDayNightMode,
  parseLightingMood,
  skyboxLabel,
  worldPickerLabel,
  worldTemplateLabel,
} from "./tellus-world-options";

describe("world option helpers", () => {
  it("normalizes the legacy basic sky URL", () => {
    expect(normalizeSkyboxUrl("/skybox/free_-_skybox_basic_sky/scene.gltf")).toBe(
      "/skybox/free_-_skybox_basic_sky.glb",
    );
    expect(normalizeSkyboxUrl("/skybox/free_-_skybox_in_the_cloud.glb")).toBe(
      "/skybox/free_-_skybox_in_the_cloud/scene.gltf",
    );
  });

  it("parses day-night and lighting options with fallbacks", () => {
    expect(parseDayNightMode("night")).toBe("night");
    expect(parseDayNightMode("bogus", "day")).toBe("day");
    expect(parseLightingMood("moonlit")).toBe("moonlit");
    expect(parseLightingMood("bogus", "natural")).toBe("natural");
  });

  it("clamps the day-night cycle and resolves labels", () => {
    expect(normalizeDayNightCycleMs(10, 30_000)).toBeGreaterThanOrEqual(1_000);
    expect(worldTemplateLabel("wide-island")).toBe("Wide Island");
    expect(worldTemplateLabel("fantasy-garden")).toBe("Fantasy Garden");
    expect(skyboxLabel("/unknown.glb")).toBe("Custom Sky");
  });

  it("shows Main and the new Evoflow terrains as the default creation choices", () => {
    const allIds = new Set(WORLD_TEMPLATE_OPTIONS.map((option) => option.id));
    const advancedIds = new Set(ADVANCED_WORLD_TEMPLATE_OPTIONS.map((option) => option.id));
    const curatedIds = WORLD_CREATION_TEMPLATES.map((template) => template.id);

    expect(curatedIds).toEqual(DEFAULT_WORLD_CREATION_TEMPLATE_IDS);
    expect(curatedIds).toEqual([
      "tellus",
      "evoflow-coral-canyon-child",
      "evoflow-spires",
      "evoflow-glass-ridge",
      "evoflow-lichen-basin",
      "evoflow-copper-terraces",
      "evoflow-basalt-teeth",
      "evoflow-coral-fold",
    ]);
    for (const id of curatedIds) {
      expect(allIds.has(id), id).toBe(true);
      expect(advancedIds.has(id), id).toBe(false);
    }
    expect(advancedIds.has("evoflow-coral-canyon")).toBe(true);
    expect(advancedIds.has("interior-studio")).toBe(true);
    expect(advancedIds.has("wide-island")).toBe(true);
    expect(ALL_WORLD_CREATION_TEMPLATES).toHaveLength(
      WORLD_CREATION_TEMPLATES.length + ADVANCED_WORLD_TEMPLATE_OPTIONS.length,
    );
  });

  it("uses friendly picker labels without appending internal world ids", () => {
    expect(fallbackWorldDisplayName("chunked-24-coral-archipelago")).toBe("Coral Archipelago");
    expect(worldPickerLabel("chunked-24-coral-archipelago", "Coral Isles")).toBe("Coral Isles");
    expect(worldPickerLabel("chunked-24-coral-archipelago")).toBe("Coral Archipelago");
  });
});
