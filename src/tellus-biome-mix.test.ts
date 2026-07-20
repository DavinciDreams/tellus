import { describe, expect, it } from "vitest";
import {
  biomeMixRenderSignature,
  genomeForMixEntry,
  isAssetMixEntry,
  makeAuthoredEcologyBiomeMix,
  makeEcologyBiomeMix,
  makeTerrainPaintBiomeMix,
  normalizeBiomeMixDefinition,
  normalizeBiomeMixRegistry,
  serializeBiomeMixRegistryForPersistence,
} from "./tellus-biome-mix";
import {
  biomePatchesForPaint,
  ECOLOGY_BIOME_OPTIONS,
  ECOLOGY_TERRAIN_PAINT_MAP,
  treeBackendForBiomePatch,
} from "./tellus-procplant-biomes";
import { procPlantPresets } from "./tellus-procplants";

describe("Tellus biome mix normalization", () => {
  it("represents lightweight global fern substitutes as instanced asset entries", () => {
    const entries = [
      ...makeTerrainPaintBiomeMix("forest-floor", 17).entries,
      ...makeTerrainPaintBiomeMix("jungle-moss", 17).entries,
    ];
    const ferns = entries.filter(isAssetMixEntry);
    expect(ferns.map((entry) => entry.asset.libraryId).sort()).toEqual([
      "2b64b91a-cc16-4b03-afef-7f09cbf3a0cc",
      "80b4a76f-27f4-4ba3-bb63-47c54f5995b9",
    ].sort());
    expect(ferns.every((entry) => entry.asset.lodPreference === "lod2")).toBe(true);
  });

  it("does not treat server timestamps or hydrated templates as visual mix changes", () => {
    const base = normalizeBiomeMixRegistry({
      version: 1,
      worldId: "chunked-stable-biome-refresh",
      updatedAt: "2026-07-15T00:00:00.000Z",
      mixesByEcologyBiome: {},
      mixesByTerrainPaint: {
        meadow: {
          version: 1,
          id: "stable-meadow",
          label: "Stable Meadow",
          source: "terrain-paint",
          terrainPaint: "meadow",
          seed: 1,
          density: 1,
          diversity: 1,
          targetVerticesPerChunk: 12_000,
          entries: [{
            id: "meadow-asset",
            label: "Meadow Asset",
            source: "asset",
            asset: { kind: "glb", name: "meadow.glb", libraryId: "asset-1" },
            weight: 1,
            density: 1,
            scale: 1,
            environment: { light: 0.8, moisture: 0.5, crowding: 0.4, biomeWarmth: 0.6 },
            seed: 2,
            enabled: true,
          }],
        },
      },
    }, "chunked-stable-biome-refresh");
    const refreshed = structuredClone(base);
    refreshed.updatedAt = "2026-07-15T00:01:00.000Z";
    const entry = refreshed.mixesByTerrainPaint.meadow?.entries[0];
    if (entry && isAssetMixEntry(entry)) {
      entry.asset.template = {
        version: 1,
        vertexCount: 3,
        positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
        normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
        colors: [1, 1, 1, 1, 1, 1, 1, 1, 1],
        indices: [0, 1, 2],
      };
      entry.asset.impostor = { assetId: "asset-1" } as typeof entry.asset.impostor;
    }

    expect(biomeMixRenderSignature(refreshed)).toBe(biomeMixRenderSignature(base));

    refreshed.mixesByTerrainPaint.meadow!.density = 0.5;
    expect(biomeMixRenderSignature(refreshed)).not.toBe(biomeMixRenderSignature(base));
  });

  it("keeps procplants ez-tree and GLB asset entries from exported mixes", () => {
    const mix = normalizeBiomeMixDefinition({
      version: 1,
      id: "mixed-export",
      label: "Mixed Export",
      source: "custom",
      targetTerrainPaint: "grass",
      seed: 123,
      density: 1,
      diversity: 1,
      targetVerticesPerChunk: 200000,
      entries: [
        {
          id: "ez-pine",
          label: "EZ Pine",
          source: "ez-tree",
          ezTree: {
            preset: "Pine Large",
            kind: "pine",
            foliage: 1.2,
            spread: 0.8,
          },
          weight: 1,
          density: 0.8,
          scale: 8,
          environment: { light: 0.8, moisture: 0.5, crowding: 0.3, biomeWarmth: 0.4 },
          seed: 7,
          enabled: true,
        },
        {
          id: "session-glb",
          label: "Session GLB",
          source: "asset",
          asset: {
            kind: "glb",
            name: "standalone-session-tree.glb",
            libraryId: "asset-session-tree",
            lodPreference: "lod3",
            runtimeOnly: true,
          },
          weight: 1,
          density: 0.3,
          scale: 10,
          environment: { light: 0.8, moisture: 0.5, crowding: 0.3, biomeWarmth: 0.4 },
          seed: 8,
          enabled: true,
        },
      ],
    });

    expect(mix).toBeTruthy();
    expect(mix?.entries).toHaveLength(2);
    expect(mix?.entries[0]?.source).toBe("ez-tree");
    expect(mix?.entries[0]?.genome?.branchModules?.palette).toBe("excurrent-conifer");
    expect(mix?.entries[0]?.genome?.habit).toBe("conifer");
    expect(isAssetMixEntry(mix!.entries[1]!)).toBe(true);
    expect(mix?.entries[1]?.asset?.lodPreference).toBe("lod3");
    expect(mix?.entries[1]?.asset?.template).toBeUndefined();
  });

  it("keeps the one-to-one ecology biome terrain paint mapping", () => {
    expect(ECOLOGY_TERRAIN_PAINT_MAP).toEqual({
      "tropical-rain-forest": "jungle-moss",
      "temperate-rain-forest": "forest-floor",
      grassland: "grass",
      desert: "desert-sand",
      coastal: "beach",
      taiga: "dirt",
      estuary: "flowers",
      tundra: "gravel",
      "arctic-alpine": "snow",
      savanna: "meadow",
    });
  });

  it("uses the mixer-authored global ecology defaults", () => {
    const expectations = [
      ["tropical-rain-forest", "jungle-moss", 1.8, ["mutation", "mutation", "mutation", "mutation", "mutation"]],
      ["temperate-rain-forest", "forest-floor", 0.46, ["mutation", "mutation", "mutation", "mutation"]],
      ["grassland", "grass", 1.77, ["mutation", "preset", "preset"]],
      ["desert", "desert-sand", 0.72, ["preset", "preset", "mutation", "mutation"]],
      ["coastal", "beach", 0.72, ["mutation", "mutation"]],
      ["taiga", "dirt", 0.39, ["mutation", "mutation", "mutation", "mutation"]],
      ["savanna", "meadow", 1.8, ["preset", "preset", "mutation", "preset"]],
      ["estuary", "flowers", 1.8, ["mutation", "mutation", "mutation", "mutation", "mutation"]],
      ["tundra", "gravel", 0.72, ["mutation"]],
      ["arctic-alpine", "snow", 0.1, ["mutation", "mutation"]],
    ] as const;

    for (const [biome, paint, density, sources] of expectations) {
      const mix = makeEcologyBiomeMix(biome, 94321);
      expect(mix.id).toBe(`ecology-${biome}`);
      expect(mix.ecologyBiome).toBe(biome);
      expect(mix.targetTerrainPaint).toBe(paint);
      expect(mix.seed).toBe(94321);
      expect(mix.density).toBe(density);
      expect(mix.entries.map((entry) => entry.source)).toEqual([...sources]);
      expect(normalizeBiomeMixDefinition(mix)).toEqual(mix);
    }
  });

  it("keeps authored defaults isolated from callers and covers every ecology biome", () => {
    const first = makeAuthoredEcologyBiomeMix("taiga", 17);
    expect(first).toBeTruthy();
    first!.entries[0]!.density = 99;

    const second = makeAuthoredEcologyBiomeMix("taiga", 17);
    expect(second?.entries[0]?.density).not.toBe(99);
    expect(ECOLOGY_BIOME_OPTIONS.every((biome) => makeAuthoredEcologyBiomeMix(biome, 17) !== null)).toBe(true);
  });

  it("keeps the reusable tundra small-pine preset aligned with the authored default and gravel fallback", () => {
    const authored = makeAuthoredEcologyBiomeMix("tundra", 17);
    const authoredGenome = genomeForMixEntry(authored!.entries[0]!);
    const registeredGenome = procPlantPresets.tundraSmallPine;

    expect(registeredGenome.weberPenn).toEqual(authoredGenome.weberPenn);
    expect(registeredGenome.foliage).toEqual(authoredGenome.foliage);
    expect(registeredGenome.treeRealism).toEqual(authoredGenome.treeRealism);

    const gravelTree = biomePatchesForPaint("gravel", 17)
      .find((patch) => patch.primary === "tundraSmallPine");
    expect(gravelTree).toBeDefined();
    expect(treeBackendForBiomePatch(gravelTree!)?.species).toBe("smallPine");
  });

  it("persists one compact mix without baked asset geometry or session-only assets", () => {
    const mix = normalizeBiomeMixDefinition({
      version: 1,
      id: "compact-forest",
      label: "Compact Forest",
      source: "ecology",
      ecologyBiome: "temperate-rain-forest",
      targetTerrainPaint: "forest-floor",
      seed: 12,
      density: 0.8,
      diversity: 0.7,
      targetVerticesPerChunk: 100_000,
      entries: [
        {
          id: "shared-tree",
          label: "Shared Tree",
          source: "asset",
          asset: {
            kind: "glb",
            name: "tree.glb",
            libraryId: "asset-tree",
            lodPreference: "lod2",
            runtimeOnly: false,
            template: {
              version: 1,
              vertexCount: 3,
              positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
              normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
              colors: [0, 1, 0, 0, 1, 0, 0, 1, 0],
              indices: [0, 1, 2],
            },
          },
          weight: 1,
          density: 0.3,
          scale: 8,
          environment: { light: 0.8, moisture: 0.6, crowding: 0.4, biomeWarmth: 0.5 },
          seed: 2,
          enabled: true,
        },
        {
          id: "local-tree",
          label: "Local Tree",
          source: "asset",
          asset: { kind: "glb", name: "local.glb", libraryId: "blob-tree", runtimeOnly: true },
          weight: 1,
          density: 0.3,
          scale: 8,
          environment: { light: 0.8, moisture: 0.6, crowding: 0.4, biomeWarmth: 0.5 },
          seed: 3,
          enabled: true,
        },
      ],
    });
    expect(mix).toBeTruthy();
    const persisted = serializeBiomeMixRegistryForPersistence({
      version: 1,
      worldId: "chunked-compact-test",
      updatedAt: new Date(0).toISOString(),
      mixesByTerrainPaint: { "forest-floor": mix! },
      mixesByEcologyBiome: { "temperate-rain-forest": mix! },
    });

    expect(persisted.version).toBe(2);
    expect(persisted.mixes).toHaveLength(1);
    expect(persisted.terrainPaintMixIndexes["forest-floor"]).toBe(0);
    expect(persisted.ecologyBiomeMixIndexes["temperate-rain-forest"]).toBe(0);
    expect(persisted.mixes[0]?.entries).toHaveLength(1);
    expect(persisted.mixes[0]?.entries[0]?.asset?.template).toBeUndefined();
    expect(JSON.stringify(persisted)).not.toContain("positions");
    const roundTripped = normalizeBiomeMixRegistry(persisted, persisted.worldId);
    expect(roundTripped.mixesByTerrainPaint["forest-floor"]?.id).toBe("compact-forest");
    expect(roundTripped.mixesByEcologyBiome["temperate-rain-forest"]?.id).toBe("compact-forest");
  });
});
