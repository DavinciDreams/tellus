# Tellus Biome Ecology and Procedural Tree Realism PRD

## Summary

Tellus should move from direct terrain-paint vegetation rules to an ecological resolver that maps terrain, substrate, climate, moisture, seasonality, elevation, and local light into vegetation communities and building material palettes. The same biome model should drive procplant species selection, forest composition, edge blending, and local construction materials.

The tree layer should be treated as the highest-impact realism surface. Procplants now supports procedural genomes and Weber/Penn tree skeletons; the next phase is to build toward a Three.js-native SpeedTree-like stack: species genomes, ecological suitability, crown mass, branch/crown art-direction controls, LOD/impostor readiness, wind tiers, and deterministic variation.

## Goals

- Model 8-10 Earth-like biome families with enough fidelity to produce believable forest, grassland, wetland, desert, alpine, and coastal transitions.
- Let substrate and terrain paint influence vegetation without treating paint as the biome itself.
- Select tree species by ecological suitability so multiple biomes can be forested but visibly distinct.
- Blend biome edges by weighted suitability, not hard terrain boundaries.
- Feed the same biome resolver into building generation so local materials and form language match nearby vegetation and terrain.
- Build tree realism around reusable procedural genomes rather than isolated handcrafted archetypes.
- Keep all output deterministic per world/chunk/seed.
- Maintain performance through capped geometry budgets, instancing, LOD, and future impostors.

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

## Implementation Plan

### Implementation Notes

- See [Vegetation Building Exclusion Notes](./VEGETATION_BUILDING_EXCLUSION_NOTES.md) for the procedural-building footprint/scaling gotcha: rendered bounds are authoritative after load; recipe dimensions are only a fit-scaled fallback.

### Phase 1: Ecology Resolver

- Add `tellus-ecology.ts`.
- Define biome archetypes, substrates, material palettes, and plant profiles.
- Replace direct `terrainPaint -> procplant candidate list` with `EcologySample -> weighted ProcPlantBiomePatch[]`.
- Keep terrain paint as an input and maintain backward-compatible fallbacks.
- Add tests for biome/substrate selection and edge blending.

### Phase 2: Tree Realism

- Add tree realism traits to procplant genomes.
- Apply crown spread/taper, trunk flare, trunk bend, wind sway tiers, and deterministic color variation in the Weber/Penn template adapter.
- Keep foliage mass capped by LOD budget.
- Add tests that tree realism traits alter geometry deterministically.

### Phase 3: Biome Buildings

- Connect ecology material palettes to `tellus-building.ts`.
- Add building form hints: raised/lowered, wall thickness, roof pitch, overhang, central hearth/courtyard/tent.
- Ensure building UI can show ecology-derived defaults while allowing manual override.

### Phase 4: LOD and Impostors

- Define vegetation LOD contracts shared by procplants and Weber/Penn trees.
- Use existing LOD/impostor work where available.
- Add chunk-level budget tests and perf readouts by biome.

## Acceptance Criteria

- A single terrain paint can produce different vegetation depending on climate/substrate.
- At least six biome families produce visibly distinct tree mixes.
- Forested biomes differ primarily by dominant tree species and crown form.
- Biome edges contain plausible mixed communities.
- Building material defaults match the resolved biome and local substrate.
- Tree generation remains deterministic by seed.
- Near-field tree geometry is fuller than the previous skeletal Weber/Penn path.
- Chunked vegetation tests and production build pass.

## Open Questions

- Where should authored climate live: world template, world biome cells, terrain generator, or all three?
- Should substrate be paint-derived first, then editable as a separate terrain layer later?
- How much seasonality should be visible immediately versus saved for a later seasonal rendering pass?
- Should biome material palettes live with ecology, building generation, or a shared world-material module?
