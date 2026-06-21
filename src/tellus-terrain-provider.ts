// TELLUS INFINITY — TerrainProvider boundary (PRD Phase 0/1).
//
// Splits terrain into three layers (PRD Core Concept): RENDER substrate (what you see), GAMEPLAY substrate
// (what players + agents stand on / query / collide with), and the EDITABLE overlay (sculpt/paint/objects).
// This module owns the GAMEPLAY substrate: every system asks the ACTIVE provider for height/kind instead of
// calling the legacy terrain math directly. Per the dev decision, the provider's sampleHeight IS the
// authoritative grounding path — the SAME sampler used for rendering — so agents and players always agree
// (height = base/substrate sampler + chunk/edit overlay). ClassicTerrainProvider is now the compatibility
// fallback when a specialized renderer is not mounted yet; chunked is the default outdoor path.

import type { Camera, Ray } from "three";
import type { TerrainKind } from "./tellus-types";
import type { Vec3 } from "./world-protocol";
import { groundHeightAt, terrainKind as classicTerrainKind } from "./tellus-terrain";
import type { ChunkRenderer } from "./tellus-chunk-renderer";

export type TerrainProviderKind = "classic" | "chunked" | "tiles" | "interior" | "evoflow";

export interface TerrainHit {
  point: Vec3;
  kind: TerrainKind;
}

export interface TerrainProvider {
  readonly kind: TerrainProviderKind;
  /** Per-frame hook (load/evict chunks, advance tile LOD). No-op for compatibility terrain. */
  update?(center: Vec3, camera: Camera): void;
  /** Authoritative gameplay height at world (x,z); null when not yet known (unloaded chunk/tile). */
  sampleHeight(x: number, z: number): number | null;
  /** Surface material/kind at (x,z,y) — drives footsteps, biome reads, agent perception. */
  terrainKind(x: number, z: number, y: number): TerrainKind;
  /** Optional precise pick (tiles). Undefined when a provider has no mesh to raycast cheaply. */
  raycast?(ray: Ray): TerrainHit | null;
  stats?(): Record<string, unknown>;
  dispose?(): void;
}

/**
 * Compatibility radial-island substrate (and distant islands). groundHeightAt already folds in the Evoflow
 * raster (it rides inside terrainHeight), so an evoflow-* world reports kind 'classic' here — the raster is
 * a height prior, not a separate substrate. This wraps the existing math; it must stay a pure delegate.
 */
export class ClassicTerrainProvider implements TerrainProvider {
  readonly kind: TerrainProviderKind = "classic";
  sampleHeight(x: number, z: number): number | null {
    return groundHeightAt(x, z);
  }
  terrainKind(x: number, z: number, y: number): TerrainKind {
    return classicTerrainKind(x, z, y);
  }
}

/**
 * Chunked streamed substrate. Height comes from the chunk renderer's sampleHeight — which returns null for a
 * chunk that isn't loaded yet; that null is meaningful (caller falls back / waits) and MUST be preserved
 * exactly. Chunked worlds carry no inline grid paint, so kind is a flat 'meadow' (matches the Hyades server
 * agent-view, which hard-codes meadow for chunked).
 */
export class ChunkedTerrainProvider implements TerrainProvider {
  readonly kind: TerrainProviderKind = "chunked";
  constructor(private readonly renderer: Pick<ChunkRenderer, "sampleHeight">) {}
  sampleHeight(x: number, z: number): number | null {
    return this.renderer.sampleHeight(x, z);
  }
  terrainKind(_x: number, _z: number, _y: number): TerrainKind {
    return "meadow";
  }
}

/**
 * Tile-backed substrate (Phase 4 — experimental spike). The RENDER substrate is a 3D Tileset (a
 * `3d-tiles-renderer` mounted in the existing Three scene — a separate, flagged integration that needs the
 * lib + a tileset URL + perf measurement, per the PRD). The GAMEPLAY substrate, however, is a derived
 * heightfield BAKED into the same chunk grains the chunked provider streams — so agents + players ground on
 * the SAME sampler regardless of the fancy visual. That's why this delegates sampleHeight to the chunk
 * renderer exactly like the chunked provider: the gameplay substrate is solved + consistent today; only the
 * tileset visual is the spike. (Until a chunk is baked, sampleHeight returns null → flat fallback.)
 */
export class TilesTerrainProvider implements TerrainProvider {
  readonly kind: TerrainProviderKind = "tiles";
  constructor(private readonly renderer: Pick<ChunkRenderer, "sampleHeight">) {}
  sampleHeight(x: number, z: number): number | null {
    return this.renderer.sampleHeight(x, z);
  }
  terrainKind(_x: number, _z: number, _y: number): TerrainKind {
    return "meadow"; // a coarse slope/height-band kind is the spike's follow-up
  }
}

/**
 * Pick the gameplay provider for a world. The explicit kind (from the snapshot's terrainProviderKind, which
 * the server stamps + a persisted value wins) takes precedence; null falls back to a worldId-prefix inference
 * mirroring the client canonical-world policy. tiles/interior providers arrive in their phases and fall back
 * to the compatibility terrain until then.
 */
export function selectTerrainProvider(
  worldId: string,
  kind: TerrainProviderKind | string | null | undefined,
  deps: { chunkRenderer?: Pick<ChunkRenderer, "sampleHeight"> } = {},
): TerrainProvider {
  const resolved = kind ?? inferSubstrate(worldId);
  if (resolved === "chunked" && deps.chunkRenderer) {
    return new ChunkedTerrainProvider(deps.chunkRenderer);
  }
  if (resolved === "tiles" && deps.chunkRenderer) {
    return new TilesTerrainProvider(deps.chunkRenderer);
  }
  // Compatibility terrain only: if a chunk/tile renderer is not mounted yet, keep land visible.
  return new ClassicTerrainProvider();
}

/** Outdoor worlds are chunked by default; specialized prefixes opt into their own substrate. */
export function inferSubstrate(worldId: string): TerrainProviderKind {
  if (worldId.startsWith("tiles-")) return "tiles";
  if (worldId.startsWith("interior-")) return "interior";
  if (worldId.startsWith("evoflow-")) return "evoflow";
  if (worldId.startsWith("chunked-")) return "chunked";
  return "chunked";
}

// Active-provider holder. Systems query getActiveTerrainProvider() for height/kind; the world-load path sets
// it on each world switch. Defaults to compatibility terrain so callers are safe before the first world loads.
let activeProvider: TerrainProvider = new ClassicTerrainProvider();

export function setActiveTerrainProvider(provider: TerrainProvider): void {
  if (provider !== activeProvider) activeProvider.dispose?.();
  activeProvider = provider;
}

export function getActiveTerrainProvider(): TerrainProvider {
  return activeProvider;
}
