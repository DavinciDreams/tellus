import {
  ECOLOGY_BIOME_OPTIONS,
  ECOLOGY_TERRAIN_PAINT_MAP,
} from "./tellus-procplant-biomes";
import { makeEcologyBiomeMix, type TellusBiomeMixDefinition } from "./tellus-biome-mix";
import type { EcologyBiomeId } from "./tellus-ecology";
import type { TerrainPaintKind } from "./tellus-types";

export interface TellusBiomeDefaultDefinition {
  biome: EcologyBiomeId;
  terrainPaint: TerrainPaintKind;
  mix: TellusBiomeMixDefinition;
}

/**
 * Read-only catalog of the authored global defaults used by the ecology
 * resolver. Keeping the viewer on this seam means mixer exports and fallback
 * ecology changes appear without maintaining a second gallery configuration.
 */
export const buildTellusBiomeDefaultCatalog = (
  seed = 612072,
): TellusBiomeDefaultDefinition[] =>
  ECOLOGY_BIOME_OPTIONS.map((biome) => ({
    biome,
    terrainPaint: ECOLOGY_TERRAIN_PAINT_MAP[biome],
    mix: makeEcologyBiomeMix(biome, seed),
  }));
