# World Modules, Mini-Games, And Historical Sites

Tellus should support playful, tool-like, social, and historical experiences without
turning each one into a custom fork of the world. A home planner, chess board,
sailing race, garden planner, castle defense scenario, watch party, Chaco Canyon
site, or time-travel reconstruction should all be modules that attach to a world,
interior, object, or portal.

The module system should be liberal about what can be built, but strict about the
host contract: assets come from the asset store, state lives in the right authority,
and modules expose capabilities instead of assuming one game scaffold.

## Core Principle

A module is not a scene replacement. It is a capability bundle attached to a Tellus
surface:

- `world`: outdoor activities like historical terrain, sailing, garden planning,
  castle defense, and biome exploration.
- `interior`: room-scale activities like home design, chess, and watch parties.
- `object`: affordances attached to a placed object, such as a chess board, TV,
  boat, table, planter, artifact, or castle gate.
- `portal`: experiences that open into another world/interior/site, such as a
  custom house door, scenario entrance, Cesium terrain viewer, or historical site.

The initial TypeScript scaffold lives in `src/tellus-world-modules.ts`.

## Module Descriptor

Every module starts with a descriptor:

```ts
interface TellusWorldModuleDescriptor {
  id: TellusWorldModuleId;
  label: string;
  summary: string;
  scopes: TellusWorldModuleScope[];
  capabilities: TellusWorldModuleCapability[];
  stateAuthority: TellusWorldModuleStateAuthority;
  assetPolicy: TellusWorldModuleAssetPolicy;
  agentPolicy?: TellusWorldModuleAgentPolicy;
  mediaPolicy?: TellusWorldModuleMediaPolicy;
  timelinePolicy?: TellusWorldModuleTimelinePolicy;
}
```

The descriptor is intentionally declarative. It answers:

- Where can this module attach?
- Which capabilities does it need?
- Should state be local, world-synced, or owned by a module service?
- Which asset categories should create/search/upload prefer?
- Can agents play, co-create, referee, guide, or co-pilot?
- Does the module need synchronized media or historical timeline state?

## State Authority

Use three levels of authority:

- `client-local`: temporary tools, previews, import correction UI, solo sketches.
- `world-state`: persistent shared world data such as placed boats, garden beds,
  home plans, race gates, portal links, reconstruction layers, and module
  attachments.
- `module-service`: rule-heavy or synchronized sessions such as chess clocks,
  legal moves, defense waves, tournament scores, watch-party playback, or
  time-travel era state.

The important split: assets and world placement should stay in world state; rules,
timeline transitions, and strongly synchronized sessions can live in a module
service when they need stronger logic.

## Historical Terrain And Time Travel

The Cesium comparison viewer makes historical sites an obvious first-class module
family. A site like Chaco Canyon is not just a mesh; it is terrain, imagery, great
house locations, ancient roads, reconstruction layers, interpretive media, and era
state.

Two related modules are scaffolded:

- `historical-terrain`: present-day geospatial terrain with annotation and
  reconstruction layers. This can be world-state authoritative because most state
  is durable map/site configuration.
- `time-travel-site`: a stronger module-service experience that switches between
  present-day, excavation, ancient, and restored states. This owns timeline state,
  synchronized transitions, guide/referee behavior, and possibly visitor-specific
  educational flow.

The near-term shape for Chaco Canyon:

- Cesium or static terrain provides the real-place terrain baseline.
- Asset-store-backed reconstruction GLBs or 3D Tiles represent great houses,
  kivas, roads, artifacts, and interpretive models.
- `timelinePolicy` defines which eras are available.
- Agents can act as guides, historians, archaeologists, or co-creators.
- Portals can open from a stylized Tellus world into a historical terrain module.

## Asset Store Contract

Modules should use the existing asset store path for user-created and uploaded
objects:

- user text creation goes through the normal create/generate flow;
- user image upload goes through the same asset-store model path;
- furniture remains the furniture category;
- outdoor buildings and world structures remain building/environment categories;
- historical models use categories/tags such as `artifact`, `map-layer`,
  `reconstruction`, or `terrain`;
- module-specific objects add tags/categories such as `game-piece`, `vehicle`,
  `media`, or `tool` without bypassing the store.

Modules can request preferred categories, but the host decides how to present
creation/search based on current world, interior, object, portal, or historical
site context.

## Attachment Shape

World state can later carry records like:

```ts
interface TellusWorldModuleAttachment {
  id: string;
  moduleId: TellusWorldModuleId;
  scope: TellusWorldModuleScope;
  targetId?: string;
  worldId: string;
  createdBy?: string;
  createdAt?: string;
  stateRef?: string;
  config?: Record<string, unknown>;
}
```

Examples:

- a chess attachment targets a `GeneratedThing` chess board;
- a watch-party attachment targets a TV/screen object inside a cabin;
- a sailing attachment targets a course in the outdoor world and may reference
  boat objects by ID;
- a home-planner attachment targets a building shell and the interior portal;
- a garden-planner attachment targets a world patch around a home;
- a historical-terrain attachment targets a real-world site rectangle, Cesium
  preset, or static terrain bake;
- a time-travel-site attachment targets a portal and references era/state records.

## First Milestones

1. Land the descriptor registry and tests.
2. Add module attachments to world protocol as additive optional state.
3. Add a simple UI affordance on eligible objects: "Start module" / "Open module".
4. Connect the Cesium terrain viewer as a read-only historical-terrain module.
5. Implement one object-scoped module end to end: chess or watch party.
6. Implement one world-scoped module end to end: garden planner or sailing course.
7. Implement one portal-scoped historical site: Chaco Canyon with present-day and
   reconstruction toggles.
8. Let agents advertise supported roles per active module.

## Design Guardrails

- Do not bake module-specific props into procedural building shells.
- Do not store large generated/uploaded assets inside module config; store asset IDs.
- Do not make every module run a service. Use world state until rules, timeline
  transitions, or sync demand a stronger authority.
- Do not force all modules into game rules. Planning, decorating, racing, watching,
  guiding, reconstructing, and defending are all valid module shapes.
- Do not make historical terrain depend on Tellus terrain paint defaults. Cesium,
  static DEM bakes, and 3D Tiles should remain clean reference layers.
