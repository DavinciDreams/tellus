import { describe, expect, it } from "vitest";
import {
  ClassicTerrainProvider,
  ChunkedTerrainProvider,
  TilesTerrainProvider,
  inferSubstrate,
  selectTerrainProvider,
} from "./tellus-terrain-provider";
import { groundHeightAt, terrainKind } from "./tellus-terrain";

// TELLUS INFINITY Phase 0/1 gate: compatibility/chunked grounding must be pure delegates. If this
// drifts, agent grounding diverges from rendering.
describe("TerrainProvider parity + selection", () => {
  it("ClassicTerrainProvider.sampleHeight == groundHeightAt over a grid", () => {
    const p = new ClassicTerrainProvider();
    for (let x = -40; x <= 40; x += 8) {
      for (let z = -40; z <= 40; z += 8) {
        expect(p.sampleHeight(x, z)).toBe(groundHeightAt(x, z));
      }
    }
  });

  it("ClassicTerrainProvider.terrainKind == terrainKind over a grid", () => {
    const p = new ClassicTerrainProvider();
    for (let x = -30; x <= 30; x += 10) {
      for (let z = -30; z <= 30; z += 10) {
        const y = p.sampleHeight(x, z) ?? 0;
        expect(p.terrainKind(x, z, y)).toBe(terrainKind(x, z, y));
      }
    }
  });

  it("ChunkedTerrainProvider delegates sampleHeight verbatim, preserving the unloaded-chunk null", () => {
    const calls: Array<[number, number]> = [];
    const fake = {
      sampleHeight: (x: number, z: number) => {
        calls.push([x, z]);
        return x > 0 ? 1.5 : null; // null = chunk not loaded
      },
    };
    const p = new ChunkedTerrainProvider(fake);
    expect(p.sampleHeight(5, 5)).toBe(1.5);
    expect(p.sampleHeight(-5, 5)).toBeNull();
    expect(calls).toEqual([
      [5, 5],
      [-5, 5],
    ]);
    expect(p.terrainKind(0, 0, 0)).toBe("meadow");
  });

  it("inferSubstrate mirrors the server prefixes", () => {
    expect(inferSubstrate("chunked-8-stars")).toBe("chunked");
    expect(inferSubstrate("tiles-osm-sf")).toBe("tiles");
    expect(inferSubstrate("interior-main-tavern")).toBe("interior");
    expect(inferSubstrate("evoflow-coral-canyon")).toBe("evoflow");
    expect(inferSubstrate("main")).toBe("chunked");
  });

  it("selectTerrainProvider honors explicit kind then prefix, chunked/tiles need a renderer", () => {
    const fake = { sampleHeight: (x: number) => (x > 0 ? 2 : null) };
    expect(selectTerrainProvider("main", null, { chunkRenderer: fake }).kind).toBe("chunked");
    expect(selectTerrainProvider("chunked-5", null, { chunkRenderer: fake }).kind).toBe("chunked");
    // chunked id but no renderer → compatibility fallback (never throws)
    expect(selectTerrainProvider("chunked-5", "chunked").kind).toBe("classic");
    // explicit kind wins over prefix
    expect(selectTerrainProvider("main", "chunked", { chunkRenderer: fake }).kind).toBe("chunked");
    // tiles world grounds on the chunk-baked heightfield (gameplay substrate); no renderer → compatibility fallback.
    const tiles = selectTerrainProvider("tiles-sf", "tiles", { chunkRenderer: fake });
    expect(tiles.kind).toBe("tiles");
    expect(tiles.sampleHeight(5, 0)).toBe(2);
    expect(tiles.sampleHeight(-5, 0)).toBeNull(); // unbaked chunk → flat fallback
    expect(selectTerrainProvider("tiles-x", "tiles").kind).toBe("classic");
  });

  it("TilesTerrainProvider delegates grounding to the chunk-baked heightfield", () => {
    const p = new TilesTerrainProvider({ sampleHeight: () => 7.5 });
    expect(p.kind).toBe("tiles");
    expect(p.sampleHeight(1, 1)).toBe(7.5);
    expect(p.terrainKind(0, 0, 0)).toBe("meadow");
  });
});
