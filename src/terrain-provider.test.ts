import { describe, expect, it } from "vitest";
import {
  ClassicTerrainProvider,
  ChunkedTerrainProvider,
  inferSubstrate,
  selectTerrainProvider,
} from "./tellus-terrain-provider";
import { groundHeightAt, terrainKind } from "./tellus-terrain";

// TELLUS INFINITY Phase 0/1 gate: the provider boundary must be a PURE DELEGATE — classic/chunked grounding
// is byte-identical to the existing math. If this drifts, agent grounding diverges from rendering.
describe("TerrainProvider parity + selection", () => {
  it("ClassicTerrainProvider.sampleHeight == groundHeightAt over a grid", () => {
    const p = new ClassicTerrainProvider();
    for (let x = -40; x <= 40; x += 8) {
      for (let z = -40; z <= 40; z += 8) {
        expect(p.sampleHeight(x, z)).toBe(groundHeightAt(x, z));
      }
    }
  });

  it("ClassicTerrainProvider.terrainKind == classic terrainKind over a grid", () => {
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
    expect(inferSubstrate("main")).toBe("classic");
  });

  it("selectTerrainProvider honors explicit kind then prefix, chunked needs a renderer", () => {
    const fake = { sampleHeight: () => 0 };
    expect(selectTerrainProvider("main", null).kind).toBe("classic");
    expect(selectTerrainProvider("chunked-5", null, { chunkRenderer: fake }).kind).toBe("chunked");
    // chunked id but no renderer → safe classic fallback (never throws)
    expect(selectTerrainProvider("chunked-5", "chunked").kind).toBe("classic");
    // explicit kind wins over prefix
    expect(selectTerrainProvider("main", "chunked", { chunkRenderer: fake }).kind).toBe("chunked");
    // tiles/interior stub → classic until their phase
    expect(selectTerrainProvider("tiles-x", "tiles").kind).toBe("classic");
  });
});
