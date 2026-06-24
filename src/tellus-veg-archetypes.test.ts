import { describe, expect, it } from "vitest";
import {
  buildConiferTemplate,
  buildGrassTemplate,
  buildHairGrassTemplate,
  buildPineTemplate,
  proceduralArchetype,
} from "./tellus-veg-archetypes";

describe("vegetation archetypes", () => {
  it("builds hair grass as many narrower strands than the default tuft", () => {
    const defaultGrass = buildGrassTemplate();
    const hairGrass = buildHairGrassTemplate();

    expect(hairGrass.pos.length).toBeGreaterThan(defaultGrass.pos.length);
    expect(hairGrass.idx.length).toBeGreaterThan(defaultGrass.idx.length);
    expect(maxBladeWidth(hairGrass)).toBeLessThan(maxBladeWidth(defaultGrass) * 0.4);
    expect(hairGrass.pos.every(Number.isFinite)).toBe(true);
  });

  it("builds fuller conifer species for ambient and procedural placement", () => {
    const conifer = buildConiferTemplate();
    const pine = buildPineTemplate();

    expect(conifer.pos.length).toBeGreaterThan(0);
    expect(pine.pos.length).toBeGreaterThan(0);
    expect(conifer.pos.every(Number.isFinite)).toBe(true);
    expect(pine.pos.every(Number.isFinite)).toBe(true);
    expect(proceduralArchetype("conifer")?.kind).toBe("tree");
    expect(proceduralArchetype("pine")?.kind).toBe("tree");
  });
});

const maxBladeWidth = (template: ReturnType<typeof buildGrassTemplate>) => {
  let max = 0;
  for (let i = 0; i < template.pos.length; i += 15) {
    const lx = template.pos[i];
    const lz = template.pos[i + 2];
    const rx = template.pos[i + 3];
    const rz = template.pos[i + 5];
    max = Math.max(max, Math.hypot(rx - lx, rz - lz));
  }
  return max;
};
