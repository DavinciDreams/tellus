import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { makeProcPlantModelUrl, parseProceduralModelUrl } from "./tellus-procedural-assets";
import {
  PROCPLANT_PLACEABLE_CATALOG,
  biomePatchForPaint,
  genomeForBiomePatch,
  procPlantPlaceableById,
} from "./tellus-procplant-biomes";
import { createProcPlantVegetation, procPlantChunkSeed } from "./tellus-procplant-vegetation";

describe("procplant vegetation", () => {
  it("derives stable chunk seeds from world, chunk, and terrain revision", () => {
    const a = procPlantChunkSeed("chunked-64-main", 8, -3, 0);
    const b = procPlantChunkSeed("chunked-64-main", 8, -3, 0);
    const otherChunk = procPlantChunkSeed("chunked-64-main", 9, -3, 0);
    const otherRevision = procPlantChunkSeed("chunked-64-main", 8, -3, 1);

    expect(a).toBe(b);
    expect(a).not.toBe(otherChunk);
    expect(a).not.toBe(otherRevision);
  });

  it("maps terrain paint to compact biome patches and genomes", () => {
    const flowers = biomePatchForPaint("flowers", 1234);
    const beach = biomePatchForPaint("beach", 1234);

    expect(["daylilyFlower", "foxgloveSpike", "laceUmbel"]).toContain(flowers?.primary);
    expect(beach?.primary).toBe("foldedPalm");
    expect(beach?.scale).toBeGreaterThan(2);
    expect(biomePatchForPaint(null, 1234)).toBeNull();

    const genome = genomeForBiomePatch(flowers!);
    expect(genome.id).toContain("daylilyFlower");
  });

  it("exposes procplant presets as placeable procedural model urls", () => {
    const daylily = procPlantPlaceableById("procplant-daylilyflower");

    expect(daylily?.presetId).toBe("daylilyFlower");
    expect(PROCPLANT_PLACEABLE_CATALOG.length).toBeGreaterThan(8);

    const parsed = parseProceduralModelUrl(makeProcPlantModelUrl("daylilyFlower", 42));
    expect(parsed?.archetypeId).toBe("procplant-daylilyflower");
    expect(parsed?.seed).toBe(42);
    expect(parsed?.procPlant?.presetId).toBe("daylilyFlower");
  });

  it("renders manual procplant placements through the chunked vegetation system", () => {
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      densityMultiplier: 0,
    });

    expect(
      vegetation.placeManualPlant({
        id: "manual-daylily-1",
        presetId: "daylilyFlower",
        seed: 42,
        x: 1,
        z: 1,
        scale: 1,
      }),
    ).toBe(true);

    vegetation.update(0, 0, 1, 60, 0);
    const stats = vegetation.stats();

    expect(stats.manualPlants).toBe(1);
    expect(stats.plants).toBeGreaterThanOrEqual(1);
    expect(scene.children.some((child) => child.name === "tellus-procplant-vegetation")).toBe(true);

    vegetation.dispose();
  });
});
