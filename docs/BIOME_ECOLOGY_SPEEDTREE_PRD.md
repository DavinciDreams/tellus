# Tellus Biome Ecology and Procedural Tree Realism PRD

**Status (2026-07): implemented baseline, active realism work.** The shared
ecology resolver, ten authored biome defaults, procedural-tree realism traits,
biome-aware building materials, stable vegetation LOD, and impostor seams are
shipped. The far-canopy aggregation and richer forestry/seasonality work remain
future phases.

## Summary

Tellus now uses an ecological resolver rather than direct terrain-paint-only vegetation rules. It maps terrain, substrate, climate, moisture, seasonality, elevation, and local light into vegetation communities and building material palettes. The same biome model drives procplant species selection, forest composition, and local construction materials.

The tree layer remains the highest-impact realism surface. Procplants supports procedural genomes, connected branch-module graphs, and Weber-Penn tree skeletons, with species suitability, crown mass, branch/crown art direction, deterministic variation, structural LOD, and impostor integration. The long-term direction remains a browser-native equivalent of the useful authoring and runtime parts of SpeedTree rather than a clone.

## Current Runtime Flow

1. `resolveEcologySample()` combines explicit terrain paint, authored/evolved
   biome cells, terrain height and slope, and deterministic environmental
   heuristics. A one-to-one painted biome wins over a coarser biome cell; an
   authored cell wins over the heuristic fallback.
2. `resolveProcPlantCommunity()` scores registered plant profiles by biome,
   substrate, warmth, moisture, elevation, seasonality, salinity, wind, light,
   and authored dominance.
3. The vegetation renderer applies a saved custom biome mix when present,
   otherwise the authored default for the resolved ecology biome, with legacy
   terrain fallbacks retained for older worlds.
4. The same ecology sample feeds building material defaults through
   `buildingMaterialForEcology()`.
5. Chunk seeds keep placement deterministic. Geometry can simplify across LOD
   rings, but tree positions and scale remain stable.

## Goals

- Model 8-10 Earth-like biome families with enough fidelity to produce believable forest, grassland, wetland, desert, alpine, and coastal transitions.
- Let substrate and terrain paint influence vegetation without treating paint as the biome itself.
- Select tree species by ecological suitability so multiple biomes can be forested but visibly distinct.
- Blend biome edges by weighted suitability, not hard terrain boundaries.
- Feed the same biome resolver into building generation so local materials and form language match nearby vegetation and terrain.
- Build tree realism around reusable procedural genomes rather than isolated handcrafted archetypes.
- Keep all output deterministic per world/chunk/seed.
- Maintain performance through capped geometry budgets, instancing, cached templates, bounded chunk builds, structural LOD, and impostors.

## Non-Goals

- Full scientific ecology simulation.
- Real-time plant growth simulation for every plant instance.
- Replacing the current terrain painter UI in the first phase.
- Photorealistic tree assets or offline DCC dependency.
- WebGPU-only rendering requirements; the baseline must continue to work in WebGL.

## Biome Families

Tellus should support these biome archetypes as first-class ecology outputs:

- Tropical rain forest: warm, wet, low seasonality, broadleaf canopy, palms, vines, ferns, bamboo, dense understory.
- Temperate rain forest: cool to mild, wet, conifer/broadleaf mix, mossy understory, ferns, large timber.
- Desert: hot or cold drylands, sparse shrubs/succulents/grasses, sand/clay/stone substrate.
- Tundra: cold, wet or frozen soil, low shrubs, sedges, grasses, moss/sod analogs, few trees.
- Taiga: cold forest, spruce/fir/pine/larch dominance, acidic or rocky soils, sparse flowers.
- Grassland: moderate moisture, high light, grasses, flowers, scattered trees where soil/moisture allow.
- Savanna: warm seasonal grassland, dry grasses, acacia/palm pockets, fire/drought-tolerant shrubs.
- Estuary/wetland: clay/silt/peat, high moisture, salinity gradient, reeds, sedges, mangroves where warm.
- Coastal: wind/salt exposure, sand/clay/stone, grasses, palms or hardy shrubs depending on warmth.
- Arctic/alpine: cold/high elevation, wind exposure, dwarf conifers, shrubs, grasses, lichen/sod analogs, snow/ice.

## Ecology Inputs

Each chunk or ecology cell should resolve from:

- Terrain paint: current user-authored material/paint signal.
- Substrate: sand, clay, silt, loam, limestone, shale, granite, peat, volcanic, ice.
- Elevation: normalized local height and slope.
- Moisture: terrain drainage, proximity to water, rain/wetness bias.
- Warmth: latitude/world climate, elevation lapse, local biome cells.
- Seasonality: frost/dry-season pressure.
- Salinity: coastal/estuary influence.
- Wind/exposure: coast, ridge, alpine, open grassland.
- Light/canopy: open vs shaded conditions; later sampled from existing vegetation density.

## Core Data Model

```ts
type SubstrateKind =
  | "sand"
  | "clay"
  | "silt"
  | "loam"
  | "limestone"
  | "shale"
  | "granite"
  | "peat"
  | "volcanic"
  | "ice";

type EcologyBiomeId =
  | "tropical-rain-forest"
  | "temperate-rain-forest"
  | "desert"
  | "tundra"
  | "taiga"
  | "grassland"
  | "savanna"
  | "estuary"
  | "coastal"
  | "arctic-alpine";

interface EcologySample {
  seed: number;
  terrainPaint: string | null;
  substrate: SubstrateKind;
  elevation: number;
  slope: number;
  warmth: number;
  moisture: number;
  seasonality: number;
  salinity: number;
  wind: number;
  light: number;
}

interface PlantEcologyProfile {
  presetId: string;
  habit: string;
  dominance: number;
  biomeAffinity: Partial<Record<EcologyBiomeId, number>>;
  substrateAffinity: Partial<Record<SubstrateKind, number>>;
  warmth: [number, number, number];
  moisture: [number, number, number];
  elevation: [number, number, number];
  seasonality?: [number, number, number];
  salinity?: [number, number, number];
  wind?: [number, number, number];
}
```

Ranges are `[min, ideal, max]`. Suitability should be a smooth triangular or Gaussian-like response, multiplied by biome/substrate affinity and dominance.

## Vegetation Selection

For each vegetation chunk:

1. Sample ecology at the chunk center and optionally four corners.
2. Resolve biome weights from climate/substrate/terrain.
3. Score plant profiles against the sample.
4. Select a weighted community list, preserving deterministic randomness.
5. Blend nearby ecology samples so edge chunks contain mixed vegetation.
6. Apply environmental stress to geometry:
   - low light: taller stems, fewer lower branches, shade leaf boost.
   - low moisture: smaller leaves, lower density, more exposed trunk.
   - high wind: shorter crowns, wind lean, stronger trunk/root flare.
   - high salinity: favor coastal/estuary species, suppress non-tolerant trees.
   - high elevation/cold: conifers or dwarf forms, lower canopy height.

## Tree Realism Direction

Tree realism should carry the biome read. The target is not a clone of SpeedTree, but a browser-native equivalent of its core strengths:

- Species skeletons: Weber/Penn or procplant graph creates trunks/branches.
- Crown compiler: foliage mass fills the visual volume without requiring every twig to be explicit.
- Art-direction traits: crown spread, crown taper, trunk flare, trunk bend, branch droop, branch gnarl, root hints, leaf scale variation.
- Ecological stress: wind/elevation/moisture/light alter silhouette and density.
- LOD contracts: full geometry near, simplified branch/leaf mesh mid, impostor/billboard far.
- Material variation: bark/leaf color ramps, per-tree deterministic hue jitter, seasonal tints.
- Wind tiers: trunk low sway, branch medium sway, leaves high sway.

## Building Material Bridge

The ecology resolver should also produce a material palette for buildings:

- Tropical rain forest: wood, bamboo, palm leaves, grass, thatch, elevated floors.
- Temperate rain forest: stone, wood, plaster, raised foundations.
- Desert: adobe, mudbrick, woven textiles, low forms, overhangs, thick walls, lowered/courtyard massing.
- Tundra: sod, earth, furs, low ceilings, central hearth, lowered/insulated forms.
- Taiga: logs, stone, bark, canvas, furs.
- Grassland: thatch, wattle and daub, poles.
- Savanna: woven grass, palms, poles, thatch, tents.
- Estuary: mud/clay brick, reeds, wattle and daub, raised or pier-like structures.
- Coastal: thatch, clay, stone, driftwood, salt-worn finishes.
- Arctic/alpine: logs where treeline allows, furs, sod, ice/snow, stone.

Buildings should consume the dominant ecology biome plus local substrate/material affordances. A clay estuary and a rocky coast should not produce the same wall/roof palette.

## Implementation Status

### Implementation Notes

- See [Vegetation Building Exclusion Notes](./VEGETATION_BUILDING_EXCLUSION_NOTES.md) for the procedural-building footprint/scaling gotcha: rendered bounds are authoritative after load; recipe dimensions are only a fit-scaled fallback.

### Phase 1: Ecology Resolver

**Implemented.**

- `tellus-ecology.ts` owns the shared resolver and building-material bridge.
- Ten biome archetypes, substrates, material palettes, plant profiles, and authored default mixes are registered.
- `EcologySample -> weighted community` replaced the direct `terrainPaint -> candidate list` path.
- Terrain paint remains an explicit input with backward-compatible fallbacks.
- Biome/substrate/default-mix behavior has focused regression coverage.

### Phase 2: Tree Realism

**Implemented baseline; continuing.**

- Procplant genomes carry tree-realism and branch-module art-direction traits.
- Crown spread/taper, trunk flare/bend, junction blending, foliage shaping, and deterministic color variation affect live geometry.
- Foliage mass remains capped by LOD and organ budgets.
- Geometry changes and deterministic contracts have focused regression coverage.

### Phase 3: Biome Buildings

**Implemented material bridge; form-language expansion remains planned.**

- Ecology material palettes are connected to building defaults.
- Planned: richer form hints such as raised/lowered massing, wall thickness, roof pitch, overhang, hearth, courtyard, and tent forms.
- Planned: a clearer UI explanation of ecology-derived defaults alongside manual override.

### Phase 4: LOD and Impostors

**Implemented individual-tree LOD and impostor seams; far-canopy aggregation remains planned.**

- Procplants, branch-module trees, and Weber-Penn-backed genomes share stable placement and structural LOD contracts.
- Asset-store impostors work on supported WebGL paths; bounded runtime baking is available to explicit WebGPU sessions.
- Chunk diagnostics expose build time, queues, structural LOD counts, instances, and impostors.
- Planned: biome-specific performance baselines and aggregated far-canopy rendering.

## Acceptance Criteria

The shipped baseline meets the deterministic ecology, distinct biome mix,
building-material bridge, near-tree geometry, test, and production-build
criteria below. Edge blending, seasonal presentation, and stand-level forestry
controls remain areas for deeper validation.

- A single terrain paint can produce different vegetation depending on climate/substrate.
- At least six biome families produce visibly distinct tree mixes.
- Forested biomes differ primarily by dominant tree species and crown form.
- Biome edges contain plausible mixed communities.
- Building material defaults match the resolved biome and local substrate.
- Tree generation remains deterministic by seed.
- Near-field tree geometry is fuller than the previous skeletal Weber/Penn path.
- Chunked vegetation tests and production build pass.

## Open Questions

- Authored climate can enter through world biome cells and terrain/world generation, with deterministic terrain heuristics as the fallback.
- Substrate is currently paint-derived; a separately editable substrate layer remains optional future work.
- How much seasonality should be visible immediately versus saved for a later seasonal rendering pass?
- Building material selection currently lives at the shared ecology seam; richer construction form palettes may grow in a dedicated building module without duplicating biome resolution.
