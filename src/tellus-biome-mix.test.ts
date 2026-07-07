import { describe, expect, it } from "vitest";
import {
  isAssetMixEntry,
  normalizeBiomeMixDefinition,
} from "./tellus-biome-mix";
import { ECOLOGY_TERRAIN_PAINT_MAP } from "./tellus-procplant-biomes";

describe("Tellus biome mix normalization", () => {
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
});
