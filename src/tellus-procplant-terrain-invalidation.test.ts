import { describe, expect, it } from "vitest";
import {
  ProcPlantRegionChangeTracker,
  ProcPlantTerrainInvalidationBatch,
} from "./tellus-procplant-terrain-invalidation";

describe("ProcPlantTerrainInvalidationBatch", () => {
  it("deduplicates provisional/final chunk changes and drains only after terrain streaming settles", () => {
    const batch = new ProcPlantTerrainInvalidationBatch(100);
    const region = { minX: 0, maxX: 16, minZ: 0, maxZ: 16 };
    batch.add([region, region, { minX: 16, maxX: 32, minZ: 0, maxZ: 16 }], 10);
    expect(batch.pendingCount()).toBe(2);
    expect(batch.drainIfSettled({ pending: 1, queued: 0, inflight: 0, ready: 0 }, 200)).toEqual([]);
    expect(batch.pendingCount()).toBe(2);
    expect(batch.drainIfSettled({ pending: 0, queued: 0, inflight: 0, ready: 0 }, 50)).toEqual([]);
    expect(batch.drainIfSettled({ pending: 0, queued: 0, inflight: 0, ready: 0 }, 110)).toEqual([
      region,
      { minX: 16, maxX: 32, minZ: 0, maxZ: 16 },
    ]);
    expect(batch.pendingCount()).toBe(0);
  });

  it("bounds adversarial region growth with one conservative overflow rectangle", () => {
    const batch = new ProcPlantTerrainInvalidationBatch(0);
    batch.add(Array.from({ length: 520 }, (_, index) => ({
      minX: index * 2,
      maxX: index * 2 + 1,
      minZ: -index - 1,
      maxZ: -index,
    })), 0);
    expect(batch.pendingCount()).toBe(1);
    expect(batch.drainIfSettled({ pending: 0, queued: 0, inflight: 0, ready: 0 }, 0)).toEqual([{
      minX: 0,
      maxX: 1_039,
      minZ: -520,
      maxZ: 0,
    }]);
  });

  it("invalidates only old and new generated-object footprints", () => {
    const tracker = new ProcPlantRegionChangeTracker();
    const first = { minX: 1, maxX: 3, minZ: 2, maxZ: 4 };
    const moved = { minX: 5, maxX: 7, minZ: 6, maxZ: 8 };
    expect(tracker.update("house", first)).toEqual([first]);
    expect(tracker.update("house", { ...first })).toEqual([]);
    expect(tracker.update("house", moved)).toEqual([first, moved]);
    expect(tracker.update("house", null)).toEqual([moved]);
    expect(tracker.update("house", null)).toEqual([]);
  });
});
