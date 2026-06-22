import { describe, expect, it } from "vitest";
import {
  ADVANCED_WORLD_TEMPLATE_OPTIONS,
  WORLD_CREATION_TEMPLATES,
  WORLD_TEMPLATE_OPTIONS,
  normalizeDayNightCycleMs,
  normalizeSkyboxUrl,
  parseDayNightMode,
  parseLightingMood,
  skyboxLabel,
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

  it("keeps curated creation templates registered and out of advanced terrain", () => {
    const allIds = new Set(WORLD_TEMPLATE_OPTIONS.map((option) => option.id));
    const advancedIds = new Set(ADVANCED_WORLD_TEMPLATE_OPTIONS.map((option) => option.id));
    const curatedIds = WORLD_CREATION_TEMPLATES.map((template) => template.id);

    expect(curatedIds).toEqual([
      "tellus",
      "lowlands",
      "wide-island",
      "ridge",
      "fantasy-garden",
      "realistic-cove",
      "flight-range",
      "low-poly-meadow",
      "cartoon-hills",
      "interior-studio",
      "grand-hall-shell",
      "evoflow-coral-canyon",
      "evoflow-glass-ridge",
    ]);
    for (const id of curatedIds) {
      expect(allIds.has(id), id).toBe(true);
      expect(advancedIds.has(id), id).toBe(false);
    }
  });
});
