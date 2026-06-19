import { describe, expect, it } from "vitest";
import {
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
    expect(skyboxLabel("/unknown.glb")).toBe("Custom Sky");
  });
});
