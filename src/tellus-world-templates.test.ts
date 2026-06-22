import { describe, expect, it } from "vitest";
import {
  defaultSkyboxUrlForTemplate,
  parseWorldTemplateId,
  resolveLandShapeConfig,
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

  it("infers style templates from descriptive world ids", () => {
    expect(templateForWorldId("lisa-fantasy-garden")).toBe("fantasy-garden");
    expect(templateForWorldId("realistic-cove-villa")).toBe("realistic-cove");
    expect(templateForWorldId("flight-simulator-test")).toBe("flight-range");
    expect(templateForWorldId("pokemon-lowpoly-town")).toBe("low-poly-meadow");
    expect(templateForWorldId("cartoon-hills-playground")).toBe("cartoon-hills");
    expect(templateForWorldId("interior-main-room")).toBe("interior-studio");
    expect(templateForWorldId("grand-hall-gallery")).toBe("grand-hall-shell");
  });
});
