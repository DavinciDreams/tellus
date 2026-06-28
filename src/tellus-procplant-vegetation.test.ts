import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { makeProcPlantModelUrl, parseProceduralModelUrl } from "./tellus-procedural-assets";
import {
  buildProcPlantTemplate,
  buildProcPlantRuntimePackage,
  procPlantPresets,
  resolveProcPlantCommunity,
  type ProcPlantTemplate,
} from "./tellus-procplants";
import {
  PROCPLANT_PLACEABLE_CATALOG,
  biomePatchForPaint,
  genomeForBiomePatch,
  procPlantPlaceableById,
  treeBackendForBiomePatch,
} from "./tellus-procplant-biomes";
import { createProcPlantVegetation, procPlantChunkSeed } from "./tellus-procplant-vegetation";
import { treeTemplateFromSpecies } from "./tellus-tree-gen";

const templateBounds = (template: ProcPlantTemplate) => {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < template.pos.length; i += 3) {
    min.x = Math.min(min.x, template.pos[i]!);
    min.y = Math.min(min.y, template.pos[i + 1]!);
    min.z = Math.min(min.z, template.pos[i + 2]!);
    max.x = Math.max(max.x, template.pos[i]!);
    max.y = Math.max(max.y, template.pos[i + 1]!);
    max.z = Math.max(max.z, template.pos[i + 2]!);
  }
  return { min, max, width: max.x - min.x, depth: max.z - min.z };
};

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

    expect(["daylilyFlower", "foxgloveSpike", "laceUmbel", "hillCherry"]).toContain(flowers?.primary);
    expect(beach?.primary).toBe("foldedPalm");
    expect(beach?.scale).toBeGreaterThan(2);
    expect(biomePatchForPaint(null, 1234)).toBeNull();

    const genome = genomeForBiomePatch(flowers!);
    expect(genome.id).toBeTruthy();
  });

  it("can route biome tree patches to wrapped L-system tree archetypes", () => {
    const seeds = Array.from(
      { length: 4096 },
      (_, index) => procPlantChunkSeed("chunked-tree-biome-test", index % 64, Math.floor(index / 64), 0) ^ Math.imul(index + 1, 0x9e3779b1),
    );
    const grassTree = seeds
      .map((seed) => biomePatchForPaint("grass", seed))
      .find((patch) => patch && treeBackendForBiomePatch(patch));
    const snowTree = seeds
      .map((seed) => biomePatchForPaint("snow", seed))
      .find((patch) => patch && treeBackendForBiomePatch(patch));

    expect(grassTree).toBeTruthy();
    expect(snowTree).toBeTruthy();
    expect(treeBackendForBiomePatch(grassTree!)?.species).toMatch(/cambridgeOak|silverBirch/);
    expect(treeBackendForBiomePatch(snowTree!)?.species).toMatch(/balsamFir|douglasFir/);
  });

  it("can apply procplant foliage mass to wrapped L-system tree templates", () => {
    const sparse = treeTemplateFromSpecies("balsamFir", 123, {
      radialSegments: 3,
      branchSamples: 1,
      maxBranchDepth: 2,
      maxStems: 44,
      maxLeaves: 120,
      leafScaleMultiplier: 2.4,
    });
    const full = treeTemplateFromSpecies("balsamFir", 123, {
      radialSegments: 3,
      branchSamples: 1,
      maxBranchDepth: 2,
      maxStems: 44,
      maxLeaves: 120,
      leafScaleMultiplier: 2.4,
      foliageMass: 1,
      foliageClusterDensity: 1.25,
      foliageTipBias: 0.35,
    });

    expect(full.idx.length).toBeGreaterThan(sparse.idx.length);
    expect(full.idx.length).toBeLessThanOrEqual(sparse.idx.length + 120 * 4 * 6);
  });

  it("applies procplant tree realism traits to Weber-Penn genomes", () => {
    const baseGenome = procPlantPresets.oakCanopy;
    const compact = buildProcPlantTemplate({
      ...baseGenome,
      treeRealism: {
        crownSpread: 0,
        crownTaper: 0.9,
        trunkFlare: 0,
        trunkBend: 0,
        branchGnarl: 0,
        windFlex: 0.2,
        colorVariance: 0,
      },
    }, 99).template;
    const broad = buildProcPlantTemplate({
      ...baseGenome,
      treeRealism: {
        crownSpread: 1,
        crownTaper: 0.15,
        trunkFlare: 0.8,
        trunkBend: 0.3,
        branchGnarl: 0.5,
        windFlex: 0.7,
        colorVariance: 0.2,
      },
    }, 99).template;

    expect(templateBounds(broad).width).toBeGreaterThan(templateBounds(compact).width);
    expect(templateBounds(broad).depth).toBeGreaterThan(templateBounds(compact).depth);
    expect(broad.idx.length).toBe(compact.idx.length);
  });

  it("scores ecological communities for biome and substrate suitability", () => {
    const taiga = resolveProcPlantCommunity({
      biome: "taiga",
      substrate: "granite",
      elevation: 0.62,
      slope: 0.22,
      warmth: 0.2,
      moisture: 0.62,
      seasonality: 0.74,
      salinity: 0,
      wind: 0.28,
      light: 0.72,
    }, 4);
    const estuary = resolveProcPlantCommunity({
      biome: "estuary",
      substrate: "silt",
      elevation: 0.04,
      slope: 0.04,
      warmth: 0.74,
      moisture: 0.92,
      seasonality: 0.28,
      salinity: 0.48,
      wind: 0.36,
      light: 0.76,
    }, 4);

    expect(taiga.map((entry) => entry.presetId)).toContain("alpineFir");
    expect(estuary.map((entry) => entry.presetId)).toContain("mangroveRoots");
    expect(taiga[0]?.score).toBeGreaterThan(0);
    expect(estuary[0]?.score).toBeGreaterThan(0);
  });

  it("builds SpeedTree-like runtime packages with wind and LOD contracts", () => {
    const runtime = buildProcPlantRuntimePackage(procPlantPresets.alpineFir, 123);

    expect(runtime.architecture.backend).toBe("weber-penn");
    expect(runtime.architecture.species).toBe("balsamFir");
    expect(runtime.lods.map((lod) => lod.label)).toEqual(["full", "clustered", "billboard-cross", "impostor"]);
    expect(runtime.wind.leafFlutter).toBeGreaterThan(runtime.wind.trunkSway);
    expect(runtime.stats.triangles).toBeGreaterThan(0);
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
