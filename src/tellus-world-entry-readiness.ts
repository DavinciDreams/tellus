export interface EntryVegetationCoverage {
  nearChunks: number;
  nearChunksBuilt: number;
  centerChunkBuilt: boolean;
}

export interface WorldEntryReadiness {
  grounded: boolean;
  groundedForMs: number;
  spawnTerrainReady: boolean;
  avatarReady: boolean;
  procplantsEnabled: boolean;
  vegetation: EntryVegetationCoverage;
}

export const WORLD_ENTRY_SETTLE_MS = 600;
export const WORLD_ENTRY_NEAR_CHUNK_TARGET = 5;

/**
 * Entry needs the center vegetation chunk plus a majority of the immediate 3x3
 * neighborhood. Distant chunks are intentionally excluded: they can stream after
 * reveal without making the spawn area read as a bare island.
 */
export function hasEntryVegetationCoverage(
  enabled: boolean,
  coverage: EntryVegetationCoverage,
): boolean {
  if (!enabled) return true;
  if (!coverage.centerChunkBuilt || coverage.nearChunks <= 0) return false;
  return coverage.nearChunksBuilt >= Math.min(WORLD_ENTRY_NEAR_CHUNK_TARGET, coverage.nearChunks);
}

export function isWorldEntryVisuallyReady(readiness: WorldEntryReadiness): boolean {
  return (
    readiness.grounded &&
    readiness.groundedForMs >= WORLD_ENTRY_SETTLE_MS &&
    readiness.spawnTerrainReady &&
    readiness.avatarReady &&
    hasEntryVegetationCoverage(readiness.procplantsEnabled, readiness.vegetation)
  );
}
