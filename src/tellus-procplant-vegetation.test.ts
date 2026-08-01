import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { makeProcPlantModelUrl, parseProceduralModelUrl } from "./tellus-procedural-assets";
import {
  buildProcPlantInstancedParts,
  buildProcPlantGraph,
  buildProcPlantTemplate,
  buildProcPlantRuntimePackage,
  branchModuleSpreadForGenome,
  createProcPlantConiferSprayGeometry,
  createProcPlantLeafGeometry,
  defaultPlantEnvironment,
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
  branchModuleLodForTree,
  createProcPlantVegetation,
  groundPlantDistanceDensity,
  procPlantBranchRadialSegments,
  procPlantAllowsColdBuilds,
  procPlantBuildWorkBudget,
  procPlantStartupTerrainReady,
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
  return { min, max, width: max.x - min.x, height: max.y - min.y, depth: max.z - min.z };
};

describe("procplant vegetation", () => {
  it("keeps nearby branch trunks round independently of compute-pressure LOD", () => {
    expect(procPlantBranchRadialSegments(0, 0)).toBe(8);
    expect(procPlantBranchRadialSegments(0, 1)).toBe(6);
    expect(procPlantBranchRadialSegments(1, 0)).toBe(6);
    expect(procPlantBranchRadialSegments(2, 0)).toBe(5);
  });

  it("keeps authored close-tree presets above box-like radial budgets", () => {
    const treePresets = Object.values(procPlantPresets).filter((genome) => genome.weberPenn);
    expect(treePresets.length).toBeGreaterThan(0);
    expect(treePresets.every((genome) => (genome.weberPenn?.radialSegments ?? 6) >= 6)).toBe(true);
  });

  it("protects nearby branch-module crowns from chunk and low-FPS LOD pressure", () => {
    const detailDistance = 72;

    // Near trees can simplify their connected crown once, but cannot collapse to sparse LOD2.
    expect(branchModuleLodForTree(2, 12, detailDistance, 20)).toBe(1);
    expect(branchModuleLodForTree(2, 30, detailDistance, 20)).toBe(1);
    expect(branchModuleLodForTree(0, 12, detailDistance, 60)).toBe(0);
    // Far trees still respond to the existing chunk, distance, and low-FPS pressure.
    expect(branchModuleLodForTree(0, 52, detailDistance, 20)).toBe(2);
    expect(branchModuleLodForTree(1, 52, detailDistance, 60)).toBe(1);
  });

  it("keeps conifer sprays full-sized and distributed through the crown", () => {
    const base = procPlantPresets.alpineFir;
    const baseline = buildProcPlantGraph({
      ...base,
      foliage: { ...base.foliage!, mass: 1, tipBias: 0, size: 1 },
    }, 73);
    const curated = buildProcPlantGraph({
      ...base,
      foliage: { ...base.foliage!, mass: 1, tipBias: 0.9, size: 0.25 },
    }, 73);
    const baselineSprays = baseline.organs.filter((organ) => organ.kind === "coniferSpray");
    const curatedSprays = curated.organs.filter((organ) => organ.kind === "coniferSpray");

    expect(curatedSprays.length).toBeGreaterThan(8);
    expect(curatedSprays.length).toBe(baselineSprays.length);
    expect(curated.organs.some((organ) => organ.kind === "leaf")).toBe(false);
    expect(Math.min(...curatedSprays.map((organ) => organ.t))).toBeLessThan(0.26);
    for (let index = 0; index < curatedSprays.length; index++) {
      expect(curatedSprays[index]!.scale).toBeCloseTo(baselineSprays[index]!.scale, 6);
    }
  });

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

  it("uses the dense authored conifer throughout the alpine mix", () => {
    const scene = new THREE.Scene();
    const alpineEcology = resolveEcologySample({
      seed: 1,
      x: 0,
      z: 0,
      height: 40,
      slope: 0.4,
      terrainPaint: "snow",
    });
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-conifer-spray-test",
      sampleHeight: () => 40,
      samplePaint: () => "snow",
      sampleEcology: () => alpineEcology,
      bounds: { minX: -64, maxX: 64, minZ: -64, maxZ: 64 },
      densityMultiplier: 4,
    });

    // Hold a fixed position and advance past travel mode so the authored replacement graph is built.
    for (let i = 0; i < 40; i++) {
      vegetation.update(0, 0, 1, 60, 1000 + i * 900);
    }
    expect(vegetation.stats().plants).toBeGreaterThan(0);
    expect(vegetation.stats().stemTriangles).toBeGreaterThan(0);

    const sprayGeometry = createProcPlantConiferSprayGeometry();
    const meshes: THREE.InstancedMesh[] = [];
    scene.traverse((child) => {
      if (child instanceof THREE.InstancedMesh) meshes.push(child);
    });
    const hasSprayMesh = meshes.some(
      (mesh) => mesh.geometry.getAttribute("position").count === sprayGeometry.getAttribute("position").count,
    );
    const hasProcplantLeafCard = meshes.some((mesh) => {
      const count = mesh.geometry.getAttribute("position").count;
      // A "fan"/"ovate"/etc leaf card from createProcPlantLeafGeometry has a much smaller, odd
      // (2*segments+2) vertex count than the multi-plate conifer spray mesh.
      return count === createProcPlantLeafGeometry("fan", 1, 0, 0).getAttribute("position").count;
    });

    // Every alpine tree slot now uses the dense hybrid graph. Its conifer habit renders authored-size
    // sprays rather than broad folded fan cards; zero branch LOD trees proves the sparse mutation is gone.
    expect(hasSprayMesh).toBe(true);
    expect(hasProcplantLeafCard).toBe(false);
    expect(vegetation.stats().branchLod0 + vegetation.stats().branchLod1 + vegetation.stats().branchLod2)
      .toBe(0);

    vegetation.dispose();
  });

  it("builds reusable deciduous leaf cards as folded surfaces with a narrow petiole", () => {
    const geometry = createProcPlantLeafGeometry("ovate", 0.54, 0.12, 0.09, 0.66);
    const repeated = createProcPlantLeafGeometry("ovate", 0.54, 0.12, 0.09, 0.66);
    const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
    const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;
    const metadata = geometry.userData.tellusLeafSurface as {
      rowCount: number;
      petioleRatio: number;
      triangleCount: number;
    };

    expect(Array.from(positions.array)).toEqual(
      Array.from((repeated.getAttribute("position") as THREE.BufferAttribute).array),
    );
    expect(metadata.rowCount).toBe(9);
    expect(metadata.petioleRatio).toBeCloseTo(0.12, 6);
    expect(metadata.triangleCount).toBeLessThanOrEqual(44);

    const rowWidth = (row: number) =>
      positions.getX(row * 3 + 2) - positions.getX(row * 3);
    const widestRow = Math.max(...Array.from({ length: metadata.rowCount }, (_, row) => rowWidth(row)));
    expect(widestRow).toBeGreaterThan(rowWidth(0) * 10);
    expect(positions.getY(0)).toBeCloseTo(0, 8);
    expect(positions.getY((metadata.rowCount - 1) * 3 + 1)).toBeCloseTo(1, 8);

    const middleRow = Math.floor(metadata.rowCount / 2);
    const leftZ = positions.getZ(middleRow * 3);
    const midribZ = positions.getZ(middleRow * 3 + 1);
    const rightZ = positions.getZ(middleRow * 3 + 2);
    expect(midribZ - (leftZ + rightZ) * 0.5).toBeGreaterThan(0.02);

    const normalDirections = new Set(
      Array.from({ length: normals.count }, (_, index) =>
        `${normals.getX(index).toFixed(3)}:${normals.getY(index).toFixed(3)}:${normals.getZ(index).toFixed(3)}`),
    );
    expect(normalDirections.size).toBeGreaterThan(4);
  });

  it("uses authored venation to deepen the midrib fold without changing the leaf budget", () => {
    const subtle = createProcPlantLeafGeometry("round", 0.68, 0.22, 0.06, 0.1);
    const pronounced = createProcPlantLeafGeometry("round", 0.68, 0.22, 0.06, 0.9);
    const subtlePositions = subtle.getAttribute("position") as THREE.BufferAttribute;
    const pronouncedPositions = pronounced.getAttribute("position") as THREE.BufferAttribute;
    const rowCount = (pronounced.userData.tellusLeafSurface as { rowCount: number }).rowCount;
    const row = Math.floor(rowCount / 2);
    const fold = (positions: THREE.BufferAttribute) =>
      positions.getZ(row * 3 + 1) - (positions.getZ(row * 3) + positions.getZ(row * 3 + 2)) * 0.5;

    expect(fold(pronouncedPositions)).toBeGreaterThan(fold(subtlePositions) * 1.8);
    expect(pronouncedPositions.count).toBe(subtlePositions.count);
    expect(pronounced.getIndex()?.count).toBe(subtle.getIndex()?.count);
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
  it("gives shrub-habit presets enough branch structure and density to read as a bush, not a single stalk", () => {
    const understoryShrub = buildProcPlantTemplate(procPlantPresets.understoryShrub, 1, defaultPlantEnvironment());
    const roseBush = buildProcPlantTemplate(procPlantPresets.roseBush, 1, defaultPlantEnvironment());
    // A single unbranched stalk would produce roughly genome.nodeCount stems; a real bush needs several
    // multiples of that from repeated branching off the main stem.
    expect(understoryShrub.stats.stems).toBeGreaterThan(procPlantPresets.understoryShrub.nodeCount * 3);
    expect(understoryShrub.stats.leaves).toBeGreaterThan(50);
    expect(roseBush.stats.stems).toBeGreaterThan(procPlantPresets.roseBush.nodeCount * 3);
    expect(roseBush.stats.leaves).toBeGreaterThan(50);
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
    const fixtureBudget = {
      radialSegments: 3,
      branchSamples: 1,
      maxBranchDepth: 2,
      maxStems: 20,
      maxLeaves: 48,
      leafScaleMultiplier: 2.4,
    } as const;
    const sparse = treeTemplateFromSpecies("balsamFir", 123, {
      ...fixtureBudget,
    });
    const full = treeTemplateFromSpecies("balsamFir", 123, {
      ...fixtureBudget,
      foliageMass: 1,
      foliageClusterDensity: 1.25,
      foliageTipBias: 0.35,
    });

    expect(full.idx.length).toBeGreaterThan(sparse.idx.length);
    expect(full.idx.length).toBeLessThanOrEqual(sparse.idx.length + fixtureBudget.maxLeaves * 4 * 6);
  });

  it("renders grass presets as multi-shoot clumps for biome ground cover", () => {
    const built = buildProcPlantInstancedParts(procPlantPresets.furGrass, 1234);

    expect(procPlantPresets.furGrass.clump?.count).toBeGreaterThan(1);
    expect(built.instances.length).toBeGreaterThan((procPlantPresets.furGrass.grass?.blades ?? 0) * 3);
    expect(built.stats.instances).toBe(built.instances.length);
  });

  it("applies procplant tree realism traits to Weber-Penn genomes", () => {
    const baseGenome = procPlantPresets.oakCanopy;
    const fixtureGenome = {
      ...baseGenome,
      weberPenn: {
        ...baseGenome.weberPenn!,
        radialSegments: 3,
        branchSamples: 1,
        maxBranchDepth: 2,
        maxStems: 36,
        maxLeaves: 96,
      },
    };
    const compact = buildProcPlantTemplate({
      ...fixtureGenome,
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
      ...fixtureGenome,
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
    expect(templateBounds(broad).width).toBeGreaterThan(templateBounds(compact).width * 1.1);
  });

  it("maps authored deciduous crown spread into live branch-module trees", () => {
    const oak = procPlantPresets.oakCanopy;
    const birch = procPlantPresets.birchGrove;

    expect(oak.tree?.crown).toBe("spreading");
    expect(branchModuleSpreadForGenome(oak)).toBeGreaterThan(1.25);
    expect(branchModuleSpreadForGenome(oak)).toBeGreaterThan(branchModuleSpreadForGenome(birch)!);

    const explicit = {
      ...oak,
      branchModules: {
        palette: "decurrent-broadleaf" as const,
        spread: 1.9,
      },
    };
    expect(branchModuleSpreadForGenome(explicit)).toBe(1.9);
  });

  it("makes branch-module preview spread widen rounded deciduous crowns without increasing geometry", () => {
    const previewGenome = {
      ...procPlantPresets.oakCanopy,
      weberPenn: undefined,
      tree: { ...procPlantPresets.oakCanopy.tree!, crown: "rounded" as const },
      branchModules: {
        palette: "decurrent-broadleaf" as const,
        moduleBudget: 132,
        levels: 4,
        branchDensity: 2.06,
        branchAngle: 0.99,
        droop: 0.18,
        tropism: 0.48,
        gnarliness: 0.38,
        junctionBlend: 0.23,
      },
    };
    const compactBuilt = buildProcPlantTemplate({
      ...previewGenome,
      branchModules: { ...previewGenome.branchModules, spread: 0.6 },
    }, 47);
    const broadBuilt = buildProcPlantTemplate({
      ...previewGenome,
      branchModules: { ...previewGenome.branchModules, spread: 1.46 },
    }, 47);
    const compact = compactBuilt.template;
    const broad = broadBuilt.template;
    const compactBounds = templateBounds(compact);
    const broadBounds = templateBounds(broad);
    const trunkTop = Math.max(...broadBuilt.graph.stems.filter((stem) => stem.depth === 0).map((stem) => stem.position.y));
    const upperPrimary = Math.max(...broadBuilt.graph.stems.filter((stem) => stem.depth === 1).map((stem) => stem.position.y));

    expect(broadBounds.width).toBeGreaterThan(compactBounds.width * 1.2);
    expect(broadBounds.depth).toBeGreaterThan(compactBounds.depth * 1.2);
    expect(broadBounds.width / broadBounds.height).toBeGreaterThan(compactBounds.width / compactBounds.height);
    expect(upperPrimary).toBeGreaterThan(trunkTop * 0.82);
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

  it("resolves authored biome cells into shared plant and building ecology when the paint has no 1:1 biome mapping", () => {
    // "rock" isn't one of ECOLOGY_TERRAIN_PAINT_MAP's paints, so it carries no biome declaration of
    // its own — the authored cell is free to resolve the biome here.
    const ecology = resolveEcologySample({
      seed: 7,
      x: 144,
      z: 288,
      height: 3,
      terrainPaint: "rock",
      biomeCell: { cx: 1, cz: 3, biome: "estuary", intensity: 1 },
    });
    const patch = biomePatchForEcology(ecology, 7);

    expect(ecology.biome).toBe("estuary");
    expect(ecology.biomeWeights).toEqual({ estuary: 1 });
    expect(patch).toBeTruthy();
  });

  it("resolves an authored biome cell into the expected building material when paint carries no biome of its own", () => {
    // "dirt" now maps 1:1 to taiga (see the override test below), so use "brick" — plant-suppressing on
    // the live terrain-vegetation path, but resolveEcologySample itself doesn't apply that suppression —
    // to isolate the authored-cell fallback with the same clay substrate the original test exercised.
    const ecology = resolveEcologySample({
      seed: 7,
      x: 144,
      z: 288,
      height: 3,
      terrainPaint: "brick",
      biomeCell: { cx: 1, cz: 3, biome: "estuary", intensity: 1 },
    });

    expect(ecology.biome).toBe("estuary");
    expect(buildingMaterialForEcology(ecology, "simple-house")).toBe("brick-cottage");
  });

  it("lets a directly-painted biome override a stale authored biome cell", () => {
    // Repainting terrain is the player directly declaring a biome for that spot — it must win over
    // a coarser authored/evolved biome-cell assignment that hasn't been repainted to match, or
    // hand-painting terrain would silently leave the old biome (and its plant mix) in place.
    const ecology = resolveEcologySample({
      seed: 7,
      x: 144,
      z: 288,
      height: 3,
      terrainPaint: "flowers",
      biomeCell: { cx: 1, cz: 3, biome: "arctic-alpine", intensity: 1 },
    });

    expect(ecology.biome).toBe("estuary");
    expect(ecology.biomeWeights).toEqual({ estuary: 1 });
  });

  it("normalizes legacy server biome names into ecology biomes when the paint has no 1:1 biome mapping", () => {
    const ecology = resolveEcologySample({
      seed: 9,
      x: 0,
      z: 0,
      height: 8,
      terrainPaint: "rock",
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
    const alpineFir = procPlantPresets.alpineFir;
    const runtime = buildProcPlantRuntimePackage({
      ...alpineFir,
      weberPenn: {
        ...alpineFir.weberPenn!,
        radialSegments: 3,
        branchSamples: 1,
        maxBranchDepth: 1,
        maxStems: 16,
        maxLeaves: 32,
      },
    }, 123);

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

  it("caps low-FPS startup work at one chunk and the baseline time budget", () => {
    expect(procPlantBuildWorkBudget(true, 18)).toEqual({
      maxBuilds: 1,
      maxMs: 2.5,
    });
    expect(procPlantBuildWorkBudget(false, 18)).toEqual({
      maxBuilds: 1,
      maxMs: 2.5,
    });
  });

  it("waits for initial chunked terrain hydration before admitting procplant builds", () => {
    expect(procPlantStartupTerrainReady(false, undefined)).toBe(true);
    expect(procPlantStartupTerrainReady(true, undefined)).toBe(false);
    expect(procPlantStartupTerrainReady(true, { active: 1, pending: 24 })).toBe(false);
    expect(procPlantStartupTerrainReady(true, { active: 25, pending: 1 })).toBe(false);
    expect(procPlantStartupTerrainReady(true, { active: 25, pending: 0 })).toBe(true);
  });

  it("keeps cold procedural graph generation out of initial and low-FPS population passes", () => {
    expect(procPlantAllowsColdBuilds(true, true, 60, 5_000)).toBe(false);
    expect(procPlantAllowsColdBuilds(true, false, 18, 5_000)).toBe(false);
    expect(procPlantAllowsColdBuilds(false, false, 60, 5_000)).toBe(false);
    expect(procPlantAllowsColdBuilds(true, false, 60, 2_999)).toBe(false);
    expect(procPlantAllowsColdBuilds(true, false, 60, 3_000)).toBe(true);
  });

  it("coalesces repeated terrain hydration invalidations into one rebuild per affected chunk", () => {
    const vegetation = createProcPlantVegetation({
      scene: new THREE.Scene(),
      worldId: "chunked-terrain-hydration-coalescing-test",
      sampleHeight: () => 1,
      samplePaint: () => "meadow",
      bounds: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
      chunkSize: 16,
      maxRing: 1,
      densityMultiplier: 0,
      viewMode: () => "first",
    });

    vegetation.update(0, 0, 1, 18, 0);
    const initiallyBuilt = vegetation.stats().chunksBuilt;
    const loadedRegion = [{ minX: -16, maxX: 16, minZ: -16, maxZ: 16 }];
    for (let index = 0; index < 12; index++) {
      vegetation.notifyRegionsChanged(loadedRegion);
    }

    expect(vegetation.stats().queuedRebuilds).toBeLessThanOrEqual(vegetation.stats().chunks);
    for (
      let index = 0;
      index < 80 && (
        vegetation.stats().queuedRebuilds > 0 ||
        vegetation.stats().deferredColdChunks > 0
      );
      index++
    ) {
      vegetation.update(0, 0, 1, 18, 1_000 + index * 1_000);
    }
    const settled = vegetation.stats();
    expect(settled.queuedRebuilds).toBe(0);
    expect(settled.deferredColdChunks).toBe(0);
    expect(settled.chunksBuilt).toBeLessThanOrEqual(settled.chunks + initiallyBuilt);

    for (let index = 0; index < 20; index++) {
      vegetation.update(0, 0, 1, 18, 30_000 + index * 300);
    }
    expect(vegetation.stats().chunksBuilt).toBe(settled.chunksBuilt);

    vegetation.dispose();
  });

  it("keeps a deterministic forest chunk within the procplant loading structure budget", () => {
    const worldId = "chunked-forest-loading-budget-test";
    const forestMix: TellusBiomeMixDefinition = {
      version: 1,
      id: "forest-loading-budget",
      label: "Forest Loading Budget",
      source: "terrain-paint",
      terrainPaint: "forest-floor",
      targetTerrainPaint: "forest-floor",
      seed: 73,
      density: 1,
      diversity: 1,
      targetVerticesPerChunk: 12_000,
      entries: [{
        id: "forest-loading-blue-spruce",
        label: "Blue Spruce",
        source: "preset",
        presetId: "blueSpruce",
        weight: 1,
        density: 1,
        scale: 1,
        environment: { light: 0.72, moisture: 0.58, crowding: 0.44, biomeWarmth: 0.35 },
        seed: 91,
        enabled: true,
      }],
    };
    const vegetation = createProcPlantVegetation({
      scene: new THREE.Scene(),
      worldId,
      sampleHeight: () => 12,
      samplePaint: () => "forest-floor",
      bounds: { minX: 0, maxX: 16, minZ: 0, maxZ: 16 },
      chunkSize: 16,
      maxRing: 0,
      densityMultiplier: 1,
      viewMode: () => "first",
      biomeMixRegistry: {
        version: 1,
        worldId,
        updatedAt: new Date(0).toISOString(),
        mixesByEcologyBiome: {},
        mixesByTerrainPaint: { "forest-floor": forestMix },
      },
    });

    for (
      let index = 0;
      index < 20 && (
        index === 0 ||
        vegetation.stats().queuedRebuilds > 0 ||
        vegetation.stats().deferredColdChunks > 0
      );
      index++
    ) {
      vegetation.update(8, 8, 12, 60, 1_000 + index * 1_000);
    }
    const stats = vegetation.stats();

    expect(stats.chunks).toBe(1);
    expect(stats.queuedRebuilds).toBe(0);
    expect(stats.chunksBuilt).toBe(2);
    expect(stats.plants).toBe(4);
    expect(stats.stemTriangles).toBeLessThanOrEqual(50_000);
    expect(stats.organDraws).toBeLessThanOrEqual(4);

    vegetation.dispose();
  });

  it("drains procplant terrain rebuild notifications without stale queues", () => {
    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "chunked-stable-rebuild-test",
      sampleHeight: () => 1,
      samplePaint: () => "forest-floor",
      bounds: { minX: -16, maxX: 16, minZ: -16, maxZ: 16 },
      chunkSize: 16,
      maxRing: 0,
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
    for (let i = 0; i < 120 && vegetation.stats().deferredColdChunks > 0; i++) {
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
