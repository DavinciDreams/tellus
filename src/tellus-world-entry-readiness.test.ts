import { describe, expect, it } from "vitest";
import {
  hasEntryVegetationCoverage,
  isWorldEntryVisuallyReady,
  WORLD_ENTRY_NEAR_CHUNK_TARGET,
} from "./tellus-world-entry-readiness";

describe("world entry visual readiness", () => {
  it("does not reveal an enabled procplant world before its center chunk is built", () => {
    expect(hasEntryVegetationCoverage(true, {
      nearChunks: 9,
      nearChunksBuilt: WORLD_ENTRY_NEAR_CHUNK_TARGET,
      centerChunkBuilt: false,
    })).toBe(false);
  });

  it("reveals after the center and a majority of the immediate neighborhood are built", () => {
    expect(hasEntryVegetationCoverage(true, {
      nearChunks: 9,
      nearChunksBuilt: WORLD_ENTRY_NEAR_CHUNK_TARGET,
      centerChunkBuilt: true,
    })).toBe(true);
  });

  it("requires all available chunks when world bounds contain fewer than the target", () => {
    expect(hasEntryVegetationCoverage(true, {
      nearChunks: 3,
      nearChunksBuilt: 2,
      centerChunkBuilt: true,
    })).toBe(false);
    expect(hasEntryVegetationCoverage(true, {
      nearChunks: 3,
      nearChunksBuilt: 3,
      centerChunkBuilt: true,
    })).toBe(true);
  });

  it("does not make vegetation a requirement when procplants are disabled", () => {
    expect(isWorldEntryVisuallyReady({
      grounded: true,
      groundedForMs: 600,
      spawnTerrainReady: true,
      avatarReady: true,
      procplantsEnabled: false,
      vegetation: { nearChunks: 0, nearChunksBuilt: 0, centerChunkBuilt: false },
    })).toBe(true);
  });

  it("keeps the overlay up until terrain, avatar, settle time, and vegetation are ready", () => {
    const ready = {
      grounded: true,
      groundedForMs: 600,
      spawnTerrainReady: true,
      avatarReady: true,
      procplantsEnabled: true,
      vegetation: { nearChunks: 9, nearChunksBuilt: 5, centerChunkBuilt: true },
    };

    expect(isWorldEntryVisuallyReady({ ...ready, groundedForMs: 599 })).toBe(false);
    expect(isWorldEntryVisuallyReady({ ...ready, spawnTerrainReady: false })).toBe(false);
    expect(isWorldEntryVisuallyReady({ ...ready, avatarReady: false })).toBe(false);
    expect(isWorldEntryVisuallyReady(ready)).toBe(true);
  });
});
