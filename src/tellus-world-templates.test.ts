import { describe, expect, it } from "vitest";
import {
  defaultSkyboxUrlForTemplate,
  parseOptionalWorldTemplateId,
  parseWorldTemplateId,
  resolveLandShapeConfig,
  shouldIgnoreDefaultTellusTemplate,
  templateSuppressesAutoVegetation,
  templateUsesRealisticTerrainSurface,
  templateForWorldId,
} from "./tellus-world-templates";
import { WORLD_CREATION_TEMPLATES } from "./tellus-world-options";

describe("world terrain templates", () => {
  it("parses every curated creation template and resolves its terrain defaults", () => {
    for (const template of WORLD_CREATION_TEMPLATES) {
      const id = parseWorldTemplateId(template.id, "tellus");
      const shape = resolveLandShapeConfig(id);
      expect(id, template.id).toBe(template.id);
      expect(defaultSkyboxUrlForTemplate(id), template.id).toBeTruthy();
      expect(shape.shore.startRatio, template.id).toBeGreaterThan(0);
      expect(shape.detail.scale, template.id).toBeGreaterThan(0);
    }
  });

  it("does not coerce missing or unknown optional templates to Tellus", () => {
    expect(parseOptionalWorldTemplateId(undefined)).toBeUndefined();
    expect(parseOptionalWorldTemplateId("")).toBeUndefined();
    expect(parseOptionalWorldTemplateId("not-a-template")).toBeUndefined();
    expect(parseOptionalWorldTemplateId("flight-range")).toBe("flight-range");
  });

  it("infers style templates from descriptive world ids", () => {
    expect(templateForWorldId("lisa-fantasy-garden")).toBe("fantasy-garden");
    expect(templateForWorldId("realistic-cove-villa")).toBe("realistic-cove");
    expect(templateForWorldId("flight-simulator-test")).toBe("flight-range");
    expect(templateForWorldId("64")).toBe("flight-range");
    expect(templateForWorldId("chunked-64-genesis")).toBe("flight-range");
    expect(templateForWorldId("chunked-64-main")).toBe("tellus");
    expect(templateForWorldId("chunked-64-aurora-test")).toBe("evoflow-glass-ridge");
    expect(templateForWorldId("chunked-64-copper-terraces")).toBe("evoflow-copper-terraces");
    expect(templateForWorldId("chunked-64-storm-basalt")).toBe("evoflow-basalt-teeth");
    expect(templateForWorldId("pokemon-lowpoly-town")).toBe("low-poly-meadow");
    expect(templateForWorldId("cartoon-hills-playground")).toBe("cartoon-hills");
    expect(templateForWorldId("chunked-20-yosemite-valley")).toBe("yosemite-terrain");
    expect(templateForWorldId("chunked-24-grand-canyon")).toBe("grand-canyon-terrain");
    expect(templateForWorldId("chunked-64-chaco-canyon")).toBe("chaco-canyon");
    expect(templateForWorldId("chunked-64-cahokia-mounds")).toBe("cahokia-mounds");
    expect(templateForWorldId("temple-portara-reconstruction")).toBe("temple-portara");
    expect(templateForWorldId("interior-main-room")).toBe("interior-studio");
    expect(templateForWorldId("grand-hall-gallery")).toBe("grand-hall-shell");
    expect(templateForWorldId("interior-lisa-tavern")).toBe("grand-hall-shell");
  });

  it("preserves inferred evoflow skybox defaults", () => {
    const aurora = templateForWorldId("chunked-64-aurora-test");
    const basalt = templateForWorldId("chunked-64-storm-basalt");

    expect(defaultSkyboxUrlForTemplate(aurora)).toBe("/skybox/tellus-aurora-sky/scene.gltf");
    expect(defaultSkyboxUrlForTemplate(basalt)).toBe("/skybox/tellus-storm-ocean/scene.gltf");
  });

  it("ignores stale Tellus defaults when a world id implies another template", () => {
    const inferred = templateForWorldId("chunked-64-aurora-test");

    expect(inferred).toBe("evoflow-glass-ridge");
    expect(shouldIgnoreDefaultTellusTemplate("tellus", inferred)).toBe(true);
    expect(shouldIgnoreDefaultTellusTemplate("lowlands", inferred)).toBe(false);
    expect(shouldIgnoreDefaultTellusTemplate("tellus", "tellus")).toBe(false);
  });

  it("marks real-place terrain templates as terrain-led worlds", () => {
    expect(templateUsesRealisticTerrainSurface("yosemite-terrain")).toBe(true);
    expect(templateUsesRealisticTerrainSurface("grand-canyon-terrain")).toBe(true);
    expect(templateSuppressesAutoVegetation("chaco-canyon")).toBe(true);
    expect(templateSuppressesAutoVegetation("cahokia-mounds")).toBe(true);
    expect(templateSuppressesAutoVegetation("tellus")).toBe(false);
    expect(templateUsesRealisticTerrainSurface("grassland-field")).toBe(false);
  });
});
