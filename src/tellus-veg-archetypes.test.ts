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
    expect(conifer.idx.length).toBeLessThan(900);
    expect(pine.idx.length).toBeLessThan(1100);
    expect(canopyRadius(conifer)).toBeGreaterThan(0.3);
    expect(canopyRadius(pine)).toBeGreaterThan(0.28);
    expect(proceduralArchetype("conifer")?.kind).toBe("tree");
    expect(proceduralArchetype("pine")?.kind).toBe("tree");
  });

  it("uses compact stylized templates for evergreen placeables", () => {
    const douglasFir = proceduralArchetype("douglasfir")?.build(123);
    const larch = proceduralArchetype("europeanlarch")?.build(123);
    const smallPine = proceduralArchetype("smallpine")?.build(123);

    expect(douglasFir).toBeTruthy();
    expect(larch).toBeTruthy();
    expect(smallPine).toBeTruthy();
    expect(douglasFir!.idx.length).toBeLessThan(1200);
    expect(larch!.idx.length).toBeLessThan(1200);
    expect(smallPine!.idx.length).toBeLessThan(900);
    expect(canopyRadius(douglasFir!)).toBeGreaterThan(0.28);
    expect(canopyRadius(larch!)).toBeGreaterThan(0.25);
    expect(canopyRadius(smallPine!)).toBeGreaterThan(0.25);
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

const canopyRadius = (template: ReturnType<typeof buildGrassTemplate>) => {
  let maxY = 0;
  for (let i = 1; i < template.pos.length; i += 3) maxY = Math.max(maxY, template.pos[i]);
  let radius = 0;
  for (let i = 0; i < template.pos.length; i += 3) {
    const y = template.pos[i + 1];
    if (y < maxY * 0.35) continue;
    radius = Math.max(radius, Math.hypot(template.pos[i], template.pos[i + 2]));
  }
  return radius;
};
