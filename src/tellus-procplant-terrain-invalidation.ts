export interface ProcPlantTerrainChangeRegion {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ProcPlantTerrainStreamStats {
  pending: number;
  queued: number;
  inflight: number;
  ready: number;
}

const MAX_PENDING_REGIONS = 512;

function validRegion(region: ProcPlantTerrainChangeRegion): boolean {
  return Number.isFinite(region.minX) && Number.isFinite(region.maxX) &&
    Number.isFinite(region.minZ) && Number.isFinite(region.maxZ) &&
    region.maxX > region.minX && region.maxZ > region.minZ;
}

function regionKey(region: ProcPlantTerrainChangeRegion): string {
  return `${region.minX}:${region.maxX}:${region.minZ}:${region.maxZ}`;
}

/**
 * Coalesces repeated provisional/final chunk surface notifications and releases them only after the
 * terrain upload queue is idle. Procplant chunks then rebuild once from the authoritative surface
 * instead of once per intermediate terrain revision.
 */
export class ProcPlantTerrainInvalidationBatch {
  readonly #regions = new Map<string, ProcPlantTerrainChangeRegion>();
  #overflowBounds: ProcPlantTerrainChangeRegion | null = null;
  #lastAddedAt = 0;

  constructor(readonly settleDelayMs = 1_000) {
    if (!Number.isFinite(settleDelayMs) || settleDelayMs < 0 || settleDelayMs > 60_000) {
      throw new Error("settleDelayMs must be finite and between 0 and 60000");
    }
  }

  add(regions: readonly ProcPlantTerrainChangeRegion[], nowMs = performance.now()): void {
    let added = false;
    for (const region of regions) {
      if (!validRegion(region)) continue;
      added = true;
      const normalized = {
        minX: region.minX || 0,
        maxX: region.maxX || 0,
        minZ: region.minZ || 0,
        maxZ: region.maxZ || 0,
      };
      if (this.#overflowBounds) {
        this.#overflowBounds.minX = Math.min(this.#overflowBounds.minX, normalized.minX);
        this.#overflowBounds.maxX = Math.max(this.#overflowBounds.maxX, normalized.maxX);
        this.#overflowBounds.minZ = Math.min(this.#overflowBounds.minZ, normalized.minZ);
        this.#overflowBounds.maxZ = Math.max(this.#overflowBounds.maxZ, normalized.maxZ);
        continue;
      }
      this.#regions.set(regionKey(normalized), normalized);
      if (this.#regions.size <= MAX_PENDING_REGIONS) continue;
      const values = [...this.#regions.values()];
      this.#overflowBounds = {
        minX: Math.min(...values.map((item) => item.minX)),
        maxX: Math.max(...values.map((item) => item.maxX)),
        minZ: Math.min(...values.map((item) => item.minZ)),
        maxZ: Math.max(...values.map((item) => item.maxZ)),
      };
      this.#regions.clear();
    }
    if (added) this.#lastAddedAt = nowMs;
  }

  pendingCount(): number {
    return this.#overflowBounds ? 1 : this.#regions.size;
  }

  drainIfSettled(stats: ProcPlantTerrainStreamStats, nowMs = performance.now()): ProcPlantTerrainChangeRegion[] {
    if (stats.pending > 0 || stats.queued > 0 || stats.inflight > 0 || stats.ready > 0) return [];
    if (this.pendingCount() > 0 && nowMs - this.#lastAddedAt < this.settleDelayMs) return [];
    const regions = this.#overflowBounds ? [{ ...this.#overflowBounds }] : [...this.#regions.values()];
    this.#overflowBounds = null;
    this.#regions.clear();
    this.#lastAddedAt = 0;
    return regions;
  }
}

function sameRegion(a: ProcPlantTerrainChangeRegion, b: ProcPlantTerrainChangeRegion): boolean {
  return a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;
}

/**
 * Tracks the last exclusion footprint for a generated scene object. Only the previous and current
 * footprint need rebuilding when an object appears, loads its final mesh, moves, resizes, or is removed.
 */
export class ProcPlantRegionChangeTracker {
  readonly #regions = new Map<string, ProcPlantTerrainChangeRegion>();

  update(id: string, next: ProcPlantTerrainChangeRegion | null): ProcPlantTerrainChangeRegion[] {
    const previous = this.#regions.get(id) ?? null;
    const normalized = next && validRegion(next) ? { ...next } : null;
    if (previous && normalized && sameRegion(previous, normalized)) return [];
    if (normalized) this.#regions.set(id, normalized);
    else this.#regions.delete(id);
    if (previous && normalized) return [previous, normalized];
    if (previous) return [previous];
    return normalized ? [normalized] : [];
  }
}
