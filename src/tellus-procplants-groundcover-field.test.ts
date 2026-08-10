import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  PROCPLANT_PLACEABLE_CATALOG,
  TELLUS_AUDITED_GROUNDCOVER_PROCPLANT_PRESETS,
  TELLUS_PLACEMENT_ONLY_GROUNDCOVER_PROCPLANT_PRESETS,
} from "./tellus-procplant-biomes";
import {
  createProcPlantVegetation,
  groundcoverTemplateLodForChunk,
  type ProcPlantVegetationSystem,
} from "./tellus-procplant-vegetation";
import {
  compileProcPlantLods,
  defaultPlantEnvironment,
  procPlantPresets,
} from "./tellus-procplants";
import type { TellusBiomeMixDefinition, TellusBiomeMixRegistry } from "./tellus-biome-mix";

const HEIGHT = 40;
const CHUNK_SIZE = 16;

const cachedSeed = (seed: number) => {
  const bucket = ((Math.trunc(seed) % 12) + 12) % 12;
  return ((bucket + 1) * 0x9e3779b1) >>> 0;
};

const settle = (
  vegetation: ProcPlantVegetationSystem,
  x: number,
  z: number,
  startMs: number,
  fps = 60,
) => {
  let nowMs = startMs;
  for (let step = 0; step < 180; step += 1) {
    vegetation.update(x, z, HEIGHT, fps, nowMs);
    const stats = vegetation.stats();
    if (stats.queuedRebuilds === 0 && stats.deferredLodChunks === 0 && stats.deferredColdChunks === 0) {
      return nowMs;
    }
    nowMs += 300;
  }
  throw new Error(`Vegetation did not settle: ${JSON.stringify(vegetation.stats())}`);
};

const chunkRenderMetrics = (scene: THREE.Scene, key: string) => {
  const chunk = scene.getObjectByName(`tellus-procplants-${key}`);
  let draws = 0;
  let triangles = 0;
  let instances = 0;
  let shadowCasters = 0;
  let shadowReceivers = 0;
  chunk?.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    const position = object.geometry.getAttribute("position");
    const perInstance = (object.geometry.getIndex()?.count ?? position?.count ?? 0) / 3;
    draws += 1;
    instances += count;
    triangles += perInstance * count;
    shadowCasters += Number(object.castShadow);
    shadowReceivers += Number(object.receiveShadow);
  });
  return { present: Boolean(chunk), draws, triangles, instances, shadowCasters, shadowReceivers };
};

const cohortMix = (includeGrass: boolean): TellusBiomeMixDefinition => ({
  version: 1,
  id: includeGrass ? "audited-groundcover-with-grass" : "audited-groundcover-field",
  label: "Audited groundcover field",
  source: "terrain-paint",
  terrainPaint: "meadow",
  targetTerrainPaint: "meadow",
  seed: 612_072,
  density: 1,
  diversity: 1,
  targetVerticesPerChunk: 120_000,
  entries: [
    ...(includeGrass ? ["furGrass"] : []),
    ...TELLUS_AUDITED_GROUNDCOVER_PROCPLANT_PRESETS,
  ].map((presetId, index) => ({
    id: `field-${presetId}`,
    label: presetId,
    source: "preset" as const,
    presetId,
    weight: 1,
    density: 1,
    scale: 1,
    environment: { light: 0.58, moisture: 0.76, crowding: 0.45, biomeWarmth: 0.6 },
    seed: 9000 + index,
    enabled: true,
  })),
});

const registryFor = (mix: TellusBiomeMixDefinition): TellusBiomeMixRegistry => ({
  version: 1,
  worldId: mix.id,
  updatedAt: new Date(0).toISOString(),
  mixesByEcologyBiome: {},
  mixesByTerrainPaint: { meadow: mix },
});

const createField = (worldId: string, mix: TellusBiomeMixDefinition, maxRing = 3) => {
  const scene = new THREE.Scene();
  const vegetation = createProcPlantVegetation({
    scene,
    worldId,
    sampleHeight: () => HEIGHT,
    samplePaint: () => "meadow",
    bounds: { minX: -64, maxX: 64, minZ: -64, maxZ: 64 },
    chunkSize: CHUNK_SIZE,
    maxRing,
    densityMultiplier: 1,
    biomeMixRegistry: registryFor(mix),
  });
  return { scene, vegetation };
};

const fieldSnapshot = (scene: THREE.Scene, vegetation: ProcPlantVegetationSystem) => {
  const stats = vegetation.stats();
  const hash = createHash("sha256");
  const coverage = new THREE.Box2();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  let draws = 0;
  let shadowCasters = 0;
  let shadowReceivers = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    draws += Number(count > 0);
    shadowCasters += Number(count > 0 && object.castShadow);
    shadowReceivers += Number(count > 0 && object.receiveShadow);
    for (let index = 0; index < count; index += 1) {
      if (object instanceof THREE.InstancedMesh) object.getMatrixAt(index, matrix);
      else matrix.copy(object.matrixWorld);
      position.setFromMatrixPosition(matrix);
      coverage.expandByPoint(new THREE.Vector2(position.x, position.z));
      hash.update(`${position.x.toFixed(4)},${position.y.toFixed(4)},${position.z.toFixed(4)};`);
    }
  });
  const size = coverage.getSize(new THREE.Vector2());
  return {
    plants: stats.plants,
    instances: stats.instances,
    grassInstances: stats.grassInstances,
    grassTriangles: stats.grassTriangles,
    renderTriangles: stats.stemTriangles + stats.organTriangles,
    organDraws: stats.organDraws,
    draws,
    shadowCasters,
    shadowReceivers,
    shadowProxies: stats.shadowProxies,
    lods: [stats.lod0, stats.lod1, stats.lod2, stats.lod3],
    coverage: [Number(size.x.toFixed(3)), Number(size.y.toFixed(3))],
    placementHash: hash.digest("hex"),
  };
};

describe("Tellus-sized audited groundcover fields", () => {
  it("migrates all eleven cohorts from detailed to clustered to four-triangle cards, then omits them", () => {
    expect(groundcoverTemplateLodForChunk(0)).toBe(0);
    expect(groundcoverTemplateLodForChunk(1)).toBe(1);
    expect(groundcoverTemplateLodForChunk(2)).toBe(2);
    expect(groundcoverTemplateLodForChunk(3)).toBeNull();
    expect(groundcoverTemplateLodForChunk(2, true)).toBe(0);

    const placements = TELLUS_AUDITED_GROUNDCOVER_PROCPLANT_PRESETS.map((presetId, index) => ({
      id: `manual-${presetId}`,
      presetId,
      seed: index,
      x: 1 + (index % 4) * 2.5,
      z: 1 + Math.floor(index / 4) * 2.5,
      scale: 1,
    }));
    const expectedTriangles = [0, 1, 2].map((level) =>
      placements.reduce((sum, placement) => {
        const lods = compileProcPlantLods(
          procPlantPresets[placement.presetId]!,
          cachedSeed(placement.seed),
          defaultPlantEnvironment(),
        );
        return sum + lods[level]!.triangles;
      }, 0));

    const scene = new THREE.Scene();
    const vegetation = createProcPlantVegetation({
      scene,
      worldId: "audited-groundcover-lod-migration",
      sampleHeight: () => HEIGHT,
      samplePaint: () => "stone",
      bounds: { minX: -80, maxX: 80, minZ: -32, maxZ: 32 },
      chunkSize: CHUNK_SIZE,
      maxRing: 3,
      densityMultiplier: 0,
    });
    vegetation.replaceManualPlants(placements, { persist: false });

    let nowMs = settle(vegetation, 0, 0, 0);
    const near = chunkRenderMetrics(scene, "0,0");
    expect(near.triangles).toBe(expectedTriangles[0]);
    expect(near.draws).toBeLessThanOrEqual(24);

    nowMs = settle(vegetation, -32, 0, nowMs + 1000);
    const mid = chunkRenderMetrics(scene, "0,0");
    expect(mid.triangles).toBe(expectedTriangles[1]);
    expect(mid.draws).toBeLessThanOrEqual(11);

    nowMs = settle(vegetation, -48, 0, nowMs + 1000);
    const far = chunkRenderMetrics(scene, "0,0");
    expect(far.triangles).toBe(expectedTriangles[2]);
    expect(far.triangles).toBe(44);
    expect(far.draws).toBeLessThanOrEqual(11);

    vegetation.update(-64, 0, HEIGHT, 60, nowMs + 4000);
    const omitted = chunkRenderMetrics(scene, "0,0");
    expect(omitted.present).toBe(false);
    for (const metrics of [near, mid, far]) {
      expect(metrics.shadowCasters).toBe(0);
      expect(metrics.shadowReceivers).toBe(0);
    }
    expect(expectedTriangles[1]).toBeLessThan(expectedTriangles[0]);
    expect(expectedTriangles[2]).toBeLessThan(expectedTriangles[1]);

    console.log("TELLUS_GROUNDCOVER_LODS", JSON.stringify({ near, mid, far }));

    vegetation.dispose();
  });

  it("keeps a 49-chunk mixed cohort field deterministic and within structural budgets", () => {
    const mix = cohortMix(false);
    const first = createField("audited-groundcover-field", mix);
    settle(first.vegetation, 0, 0, 0);
    const firstSnapshot = fieldSnapshot(first.scene, first.vegetation);

    const second = createField("audited-groundcover-field", mix);
    settle(second.vegetation, 0, 0, 0);
    const secondSnapshot = fieldSnapshot(second.scene, second.vegetation);

    expect(secondSnapshot).toEqual(firstSnapshot);
    expect(firstSnapshot.lods).toEqual([1, 24, 24, 0]);
    expect(firstSnapshot.plants).toBeGreaterThanOrEqual(140);
    expect(firstSnapshot.renderTriangles).toBeLessThanOrEqual(75_000);
    expect(firstSnapshot.draws).toBeLessThanOrEqual(220);
    expect(firstSnapshot.coverage[0]).toBeGreaterThan(100);
    expect(firstSnapshot.coverage[1]).toBeGreaterThan(100);
    expect(firstSnapshot.shadowCasters).toBe(0);
    expect(firstSnapshot.shadowReceivers).toBe(0);
    expect(firstSnapshot.shadowProxies).toBe(0);

    console.log("TELLUS_GROUNDCOVER_FIELD", JSON.stringify(firstSnapshot));
    first.vegetation.dispose();
    second.vegetation.dispose();
  });

  it("coexists with grass occupancy without duplicating shadows or exceeding a one-chunk budget", () => {
    const field = createField("audited-groundcover-grass-occupancy", cohortMix(true), 0);
    settle(field.vegetation, 0, 0, 0);
    const snapshot = fieldSnapshot(field.scene, field.vegetation);

    expect(snapshot.grassInstances).toBeGreaterThan(0);
    expect(snapshot.plants).toBeGreaterThan(1);
    expect(snapshot.renderTriangles).toBeLessThanOrEqual(100_000);
    expect(snapshot.draws).toBeLessThanOrEqual(12);
    expect(snapshot.shadowCasters).toBe(0);
    expect(snapshot.shadowReceivers).toBe(0);
    expect(snapshot.shadowProxies).toBe(0);

    console.log("TELLUS_GROUNDCOVER_GRASS", JSON.stringify(snapshot));

    field.vegetation.dispose();
  });

  it("honors low-FPS build pressure without treating timing as a real-device FPS result", () => {
    const field = createField("audited-groundcover-low-fps", cohortMix(false));
    field.vegetation.update(0, 0, HEIGHT, 18, 0);
    const pressured = field.vegetation.stats();

    expect(pressured.builtLastUpdate).toBeLessThanOrEqual(2);
    expect(pressured.queuedRebuilds).toBeGreaterThan(0);
    expect(pressured.shadowProxies).toBe(0);

    field.vegetation.dispose();
  });

  it("marks the nine non-default varieties as explicit placement-only catalog options", () => {
    const entries = new Map(PROCPLANT_PLACEABLE_CATALOG.map((entry) => [entry.presetId, entry]));
    expect(TELLUS_AUDITED_GROUNDCOVER_PROCPLANT_PRESETS).toHaveLength(11);
    expect(TELLUS_PLACEMENT_ONLY_GROUNDCOVER_PROCPLANT_PRESETS).toHaveLength(9);
    for (const presetId of TELLUS_PLACEMENT_ONLY_GROUNDCOVER_PROCPLANT_PRESETS) {
      expect(entries.get(presetId)).toMatchObject({ presetId, placementOnly: true });
    }
    expect(entries.get("phiFern")?.placementOnly).toBe(false);
    expect(entries.get("cloverGroundcover")?.placementOnly).toBe(false);
  });
});
