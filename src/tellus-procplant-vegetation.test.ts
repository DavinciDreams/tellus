import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { makeProcPlantModelUrl, parseProceduralModelUrl } from "./tellus-procedural-assets";
import {
  buildProcPlantInstancedParts,
  buildProcPlantTemplate,
  buildProcPlantRuntimePackage,
  procPlantPresets,
  resolveProcPlantCommunity,
  type ProcPlantTemplate,
} from "./tellus-procplants";
import {
  PROCPLANT_PLACEABLE_CATALOG,
  ECOLOGY_BIOME_OPTIONS,
  GLOBAL_DEFAULT_EXCLUDED_PROCPLANT_PRESETS,
  GLOBAL_DEFAULT_FERN_ASSET_IDS,
  biomePatchForEcology,
  biomePatchForPaint,
  biomePatchesForEcologyBiome,
  biomePatchesForPaint,
  genomeForBiomePatch,
  procPlantPlaceableById,
  treeBackendForBiomePatch,
} from "./tellus-procplant-biomes";
import {
  buildingMaterialForEcology,
  resolveEcologySample,
  worldBiomeCellBounds,
  worldBiomeCellCoordinates,
} from "./tellus-ecology";
import {
  buildCheapTreeTemplate,
  createProcPlantVegetation,
  groundPlantDistanceDensity,
  procPlantTemplateFromAssetTemplate,
  procPlantChunkSeed,
  shouldUseCheapDistantTree,
} from "./tellus-procplant-vegetation";
import { treeTemplateFromSpecies } from "./tellus-tree-gen";
import { SEA_LEVEL } from "./tellus-constants";
import type { TellusBiomeMixDefinition } from "./tellus-biome-mix";
import type { EcologyBiomeId } from "./tellus-ecology";

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
  it("uses global mix colors as flat overrides for black asset LOD materials", () => {
    const color = new THREE.Color(0x4f8f3d);
    const template = procPlantTemplateFromAssetTemplate({
      version: 1,
      vertexCount: 3,
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
      normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
      colors: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      indices: [0, 1, 2],
    }, 0x4f8f3d);

    for (let index = 0; index < template.col.length; index += 3) {
      expect(template.col[index]).toBeCloseTo(color.r, 5);
      expect(template.col[index + 1]).toBeCloseTo(color.g, 5);
      expect(template.col[index + 2]).toBeCloseTo(color.b, 5);
    }
  });

  it("never replaces distant ground plants with a tree silhouette", () => {
    expect(shouldUseCheapDistantTree(procPlantPresets.desertRosette.habit, false, 1.25)).toBe(false);
    expect(shouldUseCheapDistantTree("flower", false, 4)).toBe(false);
    expect(shouldUseCheapDistantTree("shrub", false, 4)).toBe(false);
    expect(shouldUseCheapDistantTree("palm", false, 8)).toBe(false);
    expect(shouldUseCheapDistantTree("tree", false, 4)).toBe(true);
    expect(shouldUseCheapDistantTree("conifer", false, 4)).toBe(true);
    expect(shouldUseCheapDistantTree("tree", true, 4)).toBe(false);
  });

  it("gives a custom conifer genome the conifer cutout silhouette even when its id doesn't look like a species name", () => {
    // A mutation genome exported from the biome mixer can have any id (e.g. "branchModules-excurrent-conifer"),
    // not a recognizable species name like "balsamFir" — habit must be the authoritative signal for the
    // cheap/distant silhouette, or a real conifer silently falls back to the generic broadleaf lollipop shape.
    const conifer = buildCheapTreeTemplate("branchModules-excurrent-conifer", "conifer");
    const knownConifer = buildCheapTreeTemplate("balsamFir", "conifer");
    const broadleaf = buildCheapTreeTemplate("someUnrecognizedTreeId", "tree");

    expect(conifer.pos.length).toBe(knownConifer.pos.length);
    expect(conifer.pos.length).not.toBe(broadleaf.pos.length);
  });

  it("reduces distant ground-plant density without removing the population", () => {
    expect(groundPlantDistanceDensity("tropical", 30, false)).toBe(1);
    expect(groundPlantDistanceDensity("flower", 50, false)).toBeLessThan(1);
    expect(groundPlantDistanceDensity("flower", 50, false)).toBeGreaterThan(0.22);
    expect(groundPlantDistanceDensity("fern", 200, true)).toBeCloseTo(0.22, 5);
    expect(groundPlantDistanceDensity("shrub", 100, false)).toBe(1);
    expect(groundPlantDistanceDensity("palm", 100, false)).toBe(1);
    expect(groundPlantDistanceDensity("tree", 100, false)).toBe(1);
  });
  it("keeps expensive authored-only plants out of global biome defaults", () => {
    const paints = [
      "meadow", "flowers", "grass", "beach", "dirt", "forest-floor", "desert-sand",
      "rock", "snow", "stone", "gravel", "jungle-moss", "brick",
    ] as const;
    const patches = [
      ...paints.flatMap((paint) => biomePatchesForPaint(paint, 17)),
      ...ECOLOGY_BIOME_OPTIONS.flatMap((biome) => biomePatchesForEcologyBiome(biome, 23, 20)),
    ];
    expect([...GLOBAL_DEFAULT_EXCLUDED_PROCPLANT_PRESETS]).toEqual([
      "phiFern",
      "acaciaUmbrella",
      "blueSpruce",
    ]);
    for (const patch of patches) {
      expect(GLOBAL_DEFAULT_EXCLUDED_PROCPLANT_PRESETS.has(patch.primary)).toBe(false);
      expect(patch.secondary && GLOBAL_DEFAULT_EXCLUDED_PROCPLANT_PRESETS.has(patch.secondary)).not.toBe(true);
    }
    const fernPatches = [
      ...biomePatchesForPaint("forest-floor", 17),
      ...biomePatchesForPaint("jungle-moss", 17),
    ].filter((patch) => Boolean(patch.asset));
    expect(new Set(fernPatches.map((patch) => patch.asset?.libraryId))).toEqual(
      new Set(GLOBAL_DEFAULT_FERN_ASSET_IDS),
    );
    expect(fernPatches.every((patch) => patch.asset?.lodPreference === "lod2")).toBe(true);
    expect(procPlantPlaceableById("phiFern")).toBeDefined();
    expect(procPlantPlaceableById("acaciaUmbrella")).toBeDefined();
    expect(procPlantPlaceableById("blueSpruce")).toBeDefined();
  });
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
    expect(beach).toBeTruthy();
    expect(beach?.primary).not.toBe("foldedPalm");
    expect(["reedSedge", "desertRosette"]).toContain(beach?.primary);
    expect(biomePatchForPaint("stone", 1234)).toBeNull();
    expect(biomePatchForPaint("brick", 1234)).toBeNull();
    expect(biomePatchForPaint("gravel", 1234)).toBeTruthy();
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
    expect(grassTree!.scale).toBeGreaterThanOrEqual(11.5);
    expect(snowTree!.scale).toBeGreaterThanOrEqual(14.5);
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
  }, 15_000);

  it("renders grass presets as multi-shoot clumps for biome ground cover", () => {
    const built = buildProcPlantInstancedParts(procPlantPresets.furGrass, 1234);

    expect(procPlantPresets.furGrass.clump?.count).toBeGreaterThan(1);
    expect(built.instances.length).toBeGreaterThan((procPlantPresets.furGrass.grass?.blades ?? 0) * 3);
    expect(built.stats.instances).toBe(built.instances.length);
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

  it("resolves authored biome cells into shared plant and building ecology", () => {
    const ecology = resolveEcologySample({
      seed: 7,
      x: 144,
      z: 288,
      height: 3,
      terrainPaint: "dirt",
      biomeCell: { cx: 1, cz: 3, biome: "estuary", intensity: 1 },
    });
    const patch = biomePatchForEcology(ecology, 7);

    expect(ecology.biome).toBe("estuary");
    expect(ecology.biomeWeights).toEqual({ estuary: 1 });
    expect(["reedSedge", "mangroveRoots", "furGrass"]).toContain(patch?.primary);
    expect(buildingMaterialForEcology(ecology, "simple-house")).toBe("brick-cottage");
  });

  it("normalizes legacy server biome names into ecology biomes", () => {
    const ecology = resolveEcologySample({
      seed: 9,
      x: 0,
      z: 0,
      height: 8,
      terrainPaint: "meadow",
      biomeCell: { cx: 0, cz: 0, biome: "forest", intensity: 1 },
    });

    expect(ecology.biome).toBe("temperate-rain-forest");
    expect(buildingMaterialForEcology(ecology, "simple-house")).toMatch(/shingle|timber-frame/);
  });

  it("maps finite and chunked world positions onto the authoritative 24 by 24 biome grid", () => {
    expect(worldBiomeCellCoordinates(0, 0, { chunkedWorldChunks: { w: 64, h: 64 } })).toEqual({ cx: 0, cz: 0 });
    expect(worldBiomeCellCoordinates(255, 511, { chunkedWorldChunks: { w: 64, h: 64 } })).toEqual({ cx: 0, cz: 1 });
    expect(worldBiomeCellCoordinates(256, 512, { chunkedWorldChunks: { w: 64, h: 64 } })).toEqual({ cx: 1, cz: 2 });
    expect(worldBiomeCellCoordinates(64 * 96, 64 * 96, { chunkedWorldChunks: { w: 64, h: 64 } })).toEqual({ cx: 23, cz: 23 });
    expect(worldBiomeCellCoordinates(-144, -144, { worldRadius: 144 })).toEqual({ cx: 0, cz: 0 });
    expect(worldBiomeCellCoordinates(0, 0, { worldRadius: 144 })).toEqual({ cx: 12, cz: 12 });
    expect(worldBiomeCellBounds(1, 2, { chunkedWorldChunks: { w: 64, h: 64 } })).toEqual({
      minX: 256,
      maxX: 512,
      minZ: 512,
      maxZ: 768,
    });
  });

  it("lets climate and substrate split one terrain paint into different biomes", () => {
    const coastal = resolveEcologySample({
      seed: 11,
      x: 0,
      z: 0,
      height: 0.5,
      terrainPaint: "beach",
    });
    const alpine = resolveEcologySample({
      seed: 11,
      x: 0,
      z: 900,
      height: 36,
      slope: 0.8,
      terrainPaint: "rock",
    });

    expect(coastal.biome).toBe("coastal");
    expect(alpine.biome).toBe("arctic-alpine");
    expect(buildingMaterialForEcology(coastal, "simple-house")).toBe("weathered-shingle");
    expect(buildingMaterialForEcology(alpine, "simple-house")).toBe("log-siding");
  });

  it("builds SpeedTree-like runtime packages with wind and LOD contracts", () => {
    const runtime = buildProcPlantRuntimePackage(procPlantPresets.alpineFir, 123);

    expect(runtime.architecture.backend).toBe("weber-penn");
    expect(runtime.architecture.species).toBe("balsamFir");
    expect(runtime.lods.map((lod) => lod.label)).toEqual(["full", "clustered", "billboard-cross", "impostor"]);
    expect(runtime.wind.leafFlutter).toBeGreaterThan(runtime.wind.trunkSway);
    expect(runtime.stats.triangles).toBeGreaterThan(0);
  }, 20000);

  it("exposes procplant presets as placeable procedural model urls", () => {
    const daylily = procPlantPlaceableById("procplant-daylilyflower");

    expect(daylily?.presetId).toBe("daylilyFlower");
    expect(PROCPLANT_PLACEABLE_CATALOG.length).toBeGreaterThan(8);
    expect(procPlantPlaceableById("procplant-oakcanopy")?.scale).toBeGreaterThan(12);
    expect(procPlantPlaceableById("procplant-redwoodspire")?.scale).toBeGreaterThan(16);
    expect(procPlantPlaceableById("procplant-daylilyflower")?.scale).toBeLessThan(2);

    const parsed = parseProceduralModelUrl(makeProcPlantModelUrl("daylilyFlower", 42));
    expect(parsed?.archetypeId).toBe("procplant-daylilyflower");
    expect(parsed?.seed).toBe(42);
    expect(parsed?.procPlant?.presetId).toBe("daylilyFlower");
  });

  it("maps selected procplant picker entries to asset-store replacement models", () => {
    expect(procPlantPlaceableById("furGrass")?.assetStoreModelId).toBe("3e610d94-51a5-4257-9899-34f5c8eaa0bb");
    expect(procPlantPlaceableById("meadowFlower")?.assetStoreModelId).toBe("78f6d91e-7382-4760-903c-c1b73b9c38cd");
    expect(procPlantPlaceableById("foxgloveSpike")?.assetStoreModelId).toBe("cae23ae2-7392-4ace-baec-cfaf09423ae8");
    expect(procPlantPlaceableById("phiFern")?.assetStoreModelId).toBe("2b64b91a-cc16-4b03-afef-7f09cbf3a0cc");
    expect(procPlantPlaceableById("fanPalmUnderstory")?.assetStoreModelId).toBe("c2c100e2-df7c-4da7-96e3-b4dbe33645d9");
    expect(procPlantPlaceableById("agaveSucculent")?.assetStoreModelId).toBe("73fd0d30-9023-4c85-922c-7e56e6cd10e8");
    expect(procPlantPlaceableById("reedSedge")?.assetStoreModelId).toBe("f75adff3-7810-44ac-9c86-e183c19eb616");
    expect(procPlantPlaceableById("understoryShrub")?.assetStoreModelId).toBe("124d6b49-4d5e-4b05-bc81-848ef6f7377a");
  });

  it("renders manual procplant placements through the chunked vegetation system", () => {
    const scene = new THREE.Scene();
    let height = 1;
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-test",
      sampleHeight: () => height,
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

    for (let i = 0; i < 8; i++) vegetation.update(0, 0, 1, 60, i * 16);
    const stats = vegetation.stats();

    expect(stats.manualPlants).toBe(1);
    expect(stats.plants).toBeGreaterThanOrEqual(1);
    expect(scene.children.some((child) => child.name === "tellus-procplant-vegetation")).toBe(true);

    height = 2;
    expect(
      vegetation.placeManualPlant({
        id: "manual-daylily-2",
        presetId: "daylilyFlower",
        seed: 43,
        x: 2,
        z: 2,
        scale: 1,
      }),
    ).toBe(true);
    for (let i = 0; i < 12 && vegetation.stats().plants < 2; i++) {
      vegetation.update(0, 0, 1, 60, 800 + i * 16);
    }
    expect(vegetation.stats().manualPlants).toBe(2);
    expect(vegetation.stats().plants).toBeGreaterThanOrEqual(2);

    vegetation.dispose();
  });

  it("scatters baked GLB asset entries from applied biome mixes", () => {
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-asset-biome-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      densityMultiplier: 1,
      biomeMixRegistry: {
        version: 1,
        worldId: "chunked-asset-biome-test",
        updatedAt: new Date(0).toISOString(),
        mixesByEcologyBiome: {},
        mixesByTerrainPaint: {
          meadow: {
            version: 1,
            id: "asset-meadow",
            label: "Asset Meadow",
            source: "terrain-paint",
            terrainPaint: "meadow",
            targetTerrainPaint: "meadow",
            seed: 1,
            density: 1,
            diversity: 1,
            targetVerticesPerChunk: 12000,
            entries: [{
              id: "asset-grass-clump",
              label: "Asset Grass Clump",
              source: "asset",
              asset: {
                kind: "glb",
                name: "grass-clump.glb",
                runtimeOnly: false,
                template: {
                  version: 1,
                  vertexCount: 3,
                  positions: [0, 0, 0, 0.2, 0, 0, 0.1, 0.4, 0],
                  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
                  colors: [0.2, 0.7, 0.25, 0.2, 0.7, 0.25, 0.2, 0.7, 0.25],
                  indices: [0, 1, 2],
                },
              },
              weight: 1,
              density: 1,
              scale: 1,
              environment: { light: 0.8, moisture: 0.55, crowding: 0.32, biomeWarmth: 0.62 },
              seed: 2,
              enabled: true,
            }],
          },
        },
      },
    });

    for (let i = 0; i < 12 && vegetation.stats().plants === 0; i++) {
      vegetation.update(0, 0, 1, 60, i * 16);
    }
    const stats = vegetation.stats();

    expect(stats.plants).toBeGreaterThan(0);
    expect(stats.stemTriangles).toBeGreaterThan(0);

    vegetation.dispose();
  });

  it("scatters biome grass mixes as a dense carpet instead of large clumps", () => {
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-grass-carpet-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
      densityMultiplier: 1,
      biomeMixRegistry: {
        version: 1,
        worldId: "chunked-grass-carpet-test",
        updatedAt: new Date(0).toISOString(),
        mixesByEcologyBiome: {},
        mixesByTerrainPaint: {
          meadow: {
            version: 1,
            id: "grass-meadow",
            label: "Grass Meadow",
            source: "terrain-paint",
            terrainPaint: "meadow",
            targetTerrainPaint: "meadow",
            seed: 1,
            density: 1,
            diversity: 1,
            targetVerticesPerChunk: 12000,
            entries: [{
              id: "fur-grass",
              label: "Fur Grass",
              source: "preset",
              presetId: "furGrass",
              weight: 1,
              density: 1,
              scale: 1,
              environment: { light: 0.8, moisture: 0.55, crowding: 0.32, biomeWarmth: 0.62 },
              seed: 2,
              enabled: true,
            }],
          },
        },
      },
    });

    for (let i = 0; i < 20 && vegetation.stats().plants === 0; i++) {
      vegetation.update(0, 0, 1, 60, i * 16);
    }
    const stats = vegetation.stats();

    expect(stats.plants).toBeGreaterThan(0);
    expect(stats.instances).toBeGreaterThanOrEqual(stats.plants * 20);
    expect(stats.grassInstances).toBeGreaterThan(0);
    expect(stats.grassTriangles).toBeGreaterThan(stats.grassInstances);
    expect(stats.stemTriangles).toBe(0);

    vegetation.dispose();
  });

  it("still scatters a dense grass carpet when no server or custom biome mix is set", () => {
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-no-mix-test",
      sampleHeight: () => 1,
      samplePaint: () => "grass",
      bounds: { minX: -24, maxX: 24, minZ: -24, maxZ: 24 },
      densityMultiplier: 1,
    });

    for (let i = 0; i < 20 && vegetation.stats().grassInstances === 0; i++) {
      vegetation.update(0, 0, 1, 60, i * 16);
    }
    const stats = vegetation.stats();

    expect(stats.grassInstances).toBeGreaterThan(0);
    expect(stats.grassTriangles).toBeGreaterThan(stats.grassInstances);

    vegetation.dispose();
  });

  it("samples grass ecology once per biome region while preserving region boundaries", () => {
    const grassMix = (biome: EcologyBiomeId): TellusBiomeMixDefinition => ({
      version: 1,
      id: `${biome}-grass`,
      label: `${biome} grass`,
      source: "ecology",
      ecologyBiome: biome,
      seed: 1,
      density: 1,
      diversity: 1,
      targetVerticesPerChunk: 12_000,
      entries: [{
        id: `${biome}-fur-grass`,
        label: "Fur Grass",
        source: "preset",
        presetId: "furGrass",
        weight: 1,
        density: 1,
        scale: 1,
        environment: { light: 0.8, moisture: 0.55, crowding: 0.32, biomeWarmth: 0.62 },
        seed: 2,
        enabled: true,
      }],
    });
    const sampledRegions = new Set<string>();
    let ecologySamples = 0;
    const vegetation = createProcPlantVegetation({
      scene: new THREE.Scene(),
      worldId: "chunked-biome-boundary-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      sampleEcology: (x, z, height, paint, seed) => {
        ecologySamples++;
        const region = x < 8 ? "left" : "right";
        sampledRegions.add(region);
        return resolveEcologySample({
          seed,
          x,
          z,
          height,
          terrainPaint: paint,
          biomeCell: {
            cx: region === "left" ? 0 : 1,
            cz: 0,
            biome: region === "left" ? "grassland" : "desert",
            intensity: 1,
          },
        });
      },
      ecologyRegionKey: (x) => x < 8 ? "left" : "right",
      bounds: { minX: 0, maxX: 16, minZ: 0, maxZ: 16 },
      chunkSize: 16,
      maxRing: 0,
      densityMultiplier: 1,
      biomeMixRegistry: {
        version: 1,
        worldId: "chunked-biome-boundary-test",
        updatedAt: new Date(0).toISOString(),
        mixesByTerrainPaint: {},
        mixesByEcologyBiome: {
          grassland: grassMix("grassland"),
          desert: grassMix("desert"),
        },
      },
    });

    for (let i = 0; i < 20 && vegetation.stats().chunksBuilt === 0; i++) {
      vegetation.update(1, 1, 1, 60, i * 16);
    }

    expect(sampledRegions).toEqual(new Set(["left", "right"]));
    expect(ecologySamples).toBeLessThan(25);

    vegetation.dispose();
  });

  it("keeps procplant placements out of shoreline water", () => {
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-waterline-test",
      sampleHeight: () => SEA_LEVEL + 0.1,
      samplePaint: () => "beach",
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      densityMultiplier: 0,
    });

    expect(
      vegetation.placeManualPlant({
        id: "manual-waterline-tree",
        presetId: "blueSpruce",
        seed: 99,
        x: 1,
        z: 1,
        scale: 10,
      }),
    ).toBe(true);

    for (let i = 0; i < 8; i++) vegetation.update(0, 0, 1, 60, i * 16);

    expect(vegetation.stats().manualPlants).toBe(1);
    expect(vegetation.stats().plants).toBe(0);

    vegetation.dispose();
  });

  it("keeps the procplant visual ring stable when fps dips", () => {
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-low-fps-ring-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
      densityMultiplier: 0,
    });

    vegetation.update(0, 0, 1, 60, 0);
    expect(vegetation.stats().chunks).toBe(49);
    expect(vegetation.stats().lod0).toBe(1);
    expect(vegetation.stats().lod1).toBe(24);
    expect(vegetation.stats().lod2).toBe(24);

    vegetation.update(0, 0, 1, 18, 16);
    expect(vegetation.stats().chunks).toBe(49);

    vegetation.dispose();
  });

  it("can use full-detail procplants for close Tellus-template islands", () => {
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-64-any-id",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
      densityMultiplier: 0,
      viewMode: () => "third",
      fullDetailLod: true,
    });

    vegetation.update(0, 0, 1, 60, 0);
    const stats = vegetation.stats();
    expect(stats.chunks).toBe(81);
    expect(stats.lod0).toBe(81);
    expect(stats.lod1).toBe(0);
    expect(stats.lod2).toBe(0);

    vegetation.dispose();
  });

  it("uses a wider cheaper procplant field in third person chunked worlds", () => {
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-third-person-lod-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
      densityMultiplier: 0,
      viewMode: () => "third",
    });

    vegetation.update(0, 0, 1, 60, 0);
    const stats = vegetation.stats();
    expect(stats.chunks).toBe(81);
    expect(stats.lod0).toBe(1);
    expect(stats.lod1).toBe(24);
    expect(stats.lod2).toBe(56);

    vegetation.dispose();
  });

  it("defers procplant chunks until the world visuals are ready", () => {
    let ready = false;
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-deferred-procplants-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
      densityMultiplier: 0,
      shouldDeferBuild: () => !ready,
    });

    vegetation.update(0, 0, 1, 60, 0);
    expect(vegetation.stats().chunks).toBe(0);
    expect(vegetation.stats().buildDeferred).toBe(true);

    ready = true;
    vegetation.update(0, 0, 1, 60, 16);
    expect(vegetation.stats().chunks).toBeGreaterThan(0);
    expect(vegetation.stats().buildDeferred).toBe(false);

    vegetation.dispose();
  });

  it("drains procplant terrain rebuild notifications without stale queues", () => {
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-stable-rebuild-test",
      sampleHeight: () => 1,
      samplePaint: () => "forest-floor",
      bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
      densityMultiplier: 1,
      viewMode: () => "first",
    });

    vegetation.update(0, 0, 1, 60, 0);
    for (let i = 1; i < 80 && vegetation.stats().queuedRebuilds > 0; i++) {
      vegetation.update(0, 0, 1, 60, i * 16);
    }
    const before = vegetation.stats();
    vegetation.notifyTerrainChanged();
    vegetation.update(0, 0, 1, 60, 500);
    for (let i = 1; i < 80 && vegetation.stats().queuedRebuilds > 0; i++) {
      vegetation.update(0, 0, 1, 60, 500 + i * 16);
    }
    const after = vegetation.stats();

    expect(before.chunks).toBeGreaterThan(0);
    expect(after.chunks).toBe(before.chunks);
    expect(after.queuedRebuilds).toBe(0);
    expect(after.plants).toBeGreaterThan(0);
    expect(after.stemTriangles + after.grassTriangles).toBeGreaterThan(0);

    vegetation.dispose();
  });

  it("refines sparse travel grass after movement stops", () => {
    let moving = true;
    const vegetation = createProcPlantVegetation({
      scene: new THREE.Scene(),
      worldId: "chunked-travel-grass-refinement-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
      chunkSize: 16,
      maxRing: 1,
      densityMultiplier: 1,
      shouldPauseBuild: () => moving,
      biomeMixRegistry: {
        version: 1,
        worldId: "chunked-travel-grass-refinement-test",
        updatedAt: new Date(0).toISOString(),
        mixesByEcologyBiome: {},
        mixesByTerrainPaint: {
          meadow: {
            version: 1,
            id: "travel-grass",
            label: "Travel Grass",
            source: "terrain-paint",
            terrainPaint: "meadow",
            targetTerrainPaint: "meadow",
            seed: 1,
            density: 1,
            diversity: 1,
            targetVerticesPerChunk: 12_000,
            entries: [{
              id: "travel-fur-grass",
              label: "Fur Grass",
              source: "preset",
              presetId: "furGrass",
              weight: 1,
              density: 1,
              scale: 1,
              environment: { light: 0.8, moisture: 0.55, crowding: 0.32, biomeWarmth: 0.62 },
              seed: 2,
              enabled: true,
            }],
          },
        },
      },
    });

    vegetation.update(0, 0, 1, 60, 0);
    for (let i = 1; i < 30 && vegetation.stats().queuedRebuilds > 0; i++) {
      vegetation.update(0, 0, 1, 60, i * 150);
    }
    const travel = vegetation.stats();
    expect(travel.queuedRebuilds).toBe(0);
    expect(travel.deferredColdChunks).toBeGreaterThan(0);
    expect(travel.grassInstances).toBeGreaterThan(0);

    moving = false;
    for (let i = 0; i < 30 && vegetation.stats().deferredColdChunks > 0; i++) {
      vegetation.update(0, 0, 1, 60, 5_000 + i * 300);
    }
    const refined = vegetation.stats();
    expect(refined.deferredColdChunks).toBe(0);
    expect(refined.grassInstances).toBeGreaterThan(travel.grassInstances);

    vegetation.dispose();
  });

  it("does not queue every active procplant chunk when crossing a vegetation-cell boundary", () => {
    const vegetation = createProcPlantVegetation({
      scene: new THREE.Scene(),
      worldId: "chunked-cell-crossing-test",
      sampleHeight: () => 1,
      samplePaint: () => "forest-floor",
      bounds: { minX: -120, maxX: 120, minZ: -120, maxZ: 120 },
      densityMultiplier: 0,
      viewMode: () => "first",
    });

    vegetation.update(1, 1, 1, 60, 0);
    for (let i = 1; i < 80 && vegetation.stats().queuedRebuilds > 0; i++) {
      vegetation.update(1, 1, 1, 60, i * 16);
    }
    expect(vegetation.stats().queuedRebuilds).toBe(0);
    const builtBeforeCrossing = vegetation.stats().chunksBuilt;

    vegetation.update(17, 1, 1, 60, 2_000);
    expect(vegetation.stats().queuedRebuilds).toBeGreaterThan(0);
    expect(vegetation.stats().queuedRebuilds).toBeLessThan(vegetation.stats().chunks / 2);
    expect(vegetation.stats().deferredLodChunks).toBeGreaterThan(0);
    expect(vegetation.stats().chunksBuilt).toBe(builtBeforeCrossing + 1);
    expect(vegetation.stats().buildPausedForMotion).toBe(true);

    vegetation.update(17, 1, 1, 60, 2_050);
    expect(vegetation.stats().chunksBuilt).toBe(builtBeforeCrossing + 1);

    vegetation.update(17, 1, 1, 60, 2_150);
    expect(vegetation.stats().chunksBuilt).toBe(builtBeforeCrossing + 2);

    vegetation.dispose();
  });

  it("ignores identical manual procplant snapshots", () => {
    const placement = {
      id: "manual-stable-1",
      presetId: "daylilyFlower",
      seed: 42,
      x: 1,
      z: 1,
      scale: 1,
    };
    const vegetation = createProcPlantVegetation({
      scene: new THREE.Scene(),
      worldId: "chunked-stable-manual-snapshot-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      densityMultiplier: 0,
    });

    vegetation.replaceManualPlants([placement], { persist: false });
    for (let i = 0; i < 80 && (i === 0 || vegetation.stats().queuedRebuilds > 0); i++) {
      vegetation.update(0, 0, 1, 60, i * 16);
    }
    const chunksBuilt = vegetation.stats().chunksBuilt;

    vegetation.replaceManualPlants([{ ...placement }], { persist: false });
    expect(vegetation.stats().queuedRebuilds).toBe(0);
    expect(vegetation.stats().chunksBuilt).toBe(chunksBuilt);

    vegetation.dispose();
  });

  it("rebuilds only procplant chunks intersecting a changed biome region", () => {
    const vegetation = createProcPlantVegetation({
      scene: new THREE.Scene(),
      worldId: "chunked-targeted-biome-patch-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -80, maxX: 80, minZ: -80, maxZ: 80 },
      densityMultiplier: 0,
      viewMode: () => "first",
    });
    vegetation.update(0, 0, 1, 60, 0);
    for (let i = 1; i < 80 && vegetation.stats().queuedRebuilds > 0; i++) {
      vegetation.update(0, 0, 1, 60, i * 16);
    }

    vegetation.notifyRegionsChanged([{ minX: 0, maxX: 16, minZ: 0, maxZ: 16 }]);
    expect(vegetation.stats().queuedRebuilds).toBe(1);

    vegetation.dispose();
  });
});
