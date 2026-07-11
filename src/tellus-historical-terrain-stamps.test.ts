import { describe, expect, it } from "vitest";
import {
  historicalTerrainSiteForWorldId,
  historicalTerrainStampOffsetAt,
  historicalTerrainStampsForWorldId,
} from "./tellus-historical-terrain-stamps";

const WORLD_SPAN = 64 * 96;

describe("historical terrain stamps", () => {
  it("does not affect ordinary Tellus worlds", () => {
    expect(historicalTerrainSiteForWorldId("chunked-64-main")).toBeNull();
    expect(historicalTerrainStampsForWorldId("chunked-64-main")).toEqual([]);
    expect(historicalTerrainStampOffsetAt(WORLD_SPAN / 2, WORLD_SPAN / 2, "chunked-64-main")).toBe(0);
  });

  it("raises Cahokia mound terrain around the site center", () => {
    const center = historicalTerrainStampOffsetAt(
      WORLD_SPAN * 0.5,
      WORLD_SPAN * 0.49,
      "chunked-64-cahokia",
      WORLD_SPAN,
      WORLD_SPAN,
    );
    const edge = historicalTerrainStampOffsetAt(
      WORLD_SPAN * 0.1,
      WORLD_SPAN * 0.1,
      "chunked-64-cahokia",
      WORLD_SPAN,
      WORLD_SPAN,
    );

    expect(center).toBeGreaterThan(15);
    expect(edge).toBe(0);
  });

  it("lowers Chaco great-house terrain around the site center", () => {
    const center = historicalTerrainStampOffsetAt(
      WORLD_SPAN * 0.5,
      WORLD_SPAN * 0.5,
      "chunked-64-chaco-canyon",
      WORLD_SPAN,
      WORLD_SPAN,
    );
    const edge = historicalTerrainStampOffsetAt(
      WORLD_SPAN * 0.1,
      WORLD_SPAN * 0.1,
      "chunked-64-chaco-canyon",
      WORLD_SPAN,
      WORLD_SPAN,
    );

    expect(center).toBeLessThan(-3);
    expect(edge).toBe(0);
  });
});
