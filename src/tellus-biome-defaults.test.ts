import { describe, expect, it } from "vitest";
import { ECOLOGY_BIOME_OPTIONS } from "./tellus-procplant-biomes";
import { buildTellusBiomeDefaultCatalog } from "./tellus-biome-defaults";

describe("Tellus biome default catalog", () => {
  it("derives every viewer entry from the live ecology defaults", () => {
    const catalog = buildTellusBiomeDefaultCatalog(612072);

    expect(catalog.map((item) => item.biome)).toEqual(ECOLOGY_BIOME_OPTIONS);
    expect(catalog.every((item) => item.mix.ecologyBiome === item.biome)).toBe(true);
    expect(catalog.every((item) => item.mix.targetTerrainPaint === item.terrainPaint)).toBe(true);
    expect(catalog.every((item) => item.mix.entries.length > 0)).toBe(true);
  });

  it("shows the authored small pine in the current tundra defaults", () => {
    const tundra = buildTellusBiomeDefaultCatalog(612072).find((item) => item.biome === "tundra");
    const smallPine = tundra?.mix.entries.find((entry) => entry.label === "Small Pine");

    expect(smallPine?.source).toBe("mutation");
    expect(smallPine?.genome?.weberPenn?.species).toBe("smallPine");
  });
});
