# World Modules And Mini-Games

Tellus should support playful, tool-like, and social experiences without turning
each one into a custom fork of the world. A home planner, chess board, sailing race,
garden planner, castle defense scenario, and watch party should all be modules that
attach to a world, interior, object, or portal.

The module system should be liberal about what can be built, but strict about the
host contract: assets come from the asset store, state lives in the right authority,
and modules expose capabilities instead of assuming one game scaffold.

## Core Principle

A module is not a scene replacement. It is a capability bundle attached to a Tellus
surface:

- `world`: outdoor activities like sailing, garden planning, castle defense.
- `interior`: room-scale activities like home design, chess, watch parties.
- `object`: affordances attached to a placed object, such as a chess board, TV,
  boat, table, planter, or castle gate.
- `portal`: experiences that open into another world/interior, such as a custom
  house door or scenario entrance.

The initial TypeScript scaffold lives in `src/tellus-world-modules.ts`.

## Asset Store Contract

Modules should use the existing asset store path for user-created and uploaded
objects:

- user text creation goes through the normal create/generate flow;
- user image upload goes through the same asset-store model path;
- furniture remains the furniture category;
- outdoor buildings and world structures remain building/environment categories;
- module-specific objects add tags/categories such as `game-piece`, `vehicle`,
  `media`, or `tool` without bypassing the store.

This fits the current UX where the create surface can favor buildings outside and
furniture inside. Modules can request preferred categories, but the host decides how
to present creation/search based on current world/interior context.

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
}
```

The descriptor is intentionally declarative. It answers:

- Where can this module attach?
- Which capabilities does it need?
- Should state be local, world-synced, or owned by a module service?
- Which asset categories should create/search/upload prefer?
- Can agents play, co-create, referee, or co-pilot?
- Does media need synchronized playback or fullscreen presentation?

## State Authority

Use three levels of authority:

- `client-local`: temporary tools, previews, import correction UI, solo sketches.
- `world-state`: persistent shared world data such as placed boats, garden beds,
  home plans, race gates, portal links, and module attachments.
- `module-service`: rule-heavy or synchronized sessions such as chess clocks,
  legal moves, defense waves, tournament scores, or watch-party playback.

The important split: assets and world placement should stay in world state; rules
and real-time sessions can live in a module service when they need stronger logic.

## Attachment Shape

World state can later carry records like:

```ts
interface TellusWorldModuleAttachment {
  id: string;
  moduleId: TellusWorldModuleId;
  scope: TellusWorldModuleScope;
  targetId?: string;
  worldId: string;
  createdBy: string;
  createdAt: string;
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
- a garden-planner attachment targets a world patch around a home.

## Agent Roles

Agents should participate through role declarations rather than bespoke hooks:

- `opponent`: plays against a human, as in chess or castle defense;
- `copilot`: shares control intent, as in sailing;
- `referee`: validates rules, timers, scores, and turn order;
- `designer` / `decorator` / `gardener`: co-creates plans and asset placements;
- `host` / `companion`: supports social spaces like watch parties.

The module host can translate these roles into the existing agent action surface:
observe nearby objects, move, place assets, enter portals, interact with a module,
and chat in the current world/interior.

## Example Modules

### Home Planner

Scope: world, interior, portal.

Uses asset-store buildings and furniture. The shell is generated from a structured
plan; furniture and uploaded/generated decor remain separate asset-store objects.
Doors can create portals into an interior world.

### Garden Planner

Scope: world, object.

Uses terrain editing, plant assets, procedural vegetation, paths, beds, outdoor
furniture, and uploaded/generated garden objects. Agents can suggest planting plans
or help maintain a style.

### Chess

Scope: interior, object.

The board and pieces are assets. Legal moves, turn order, clocks, and agent play
belong to a module service. A placed board starts or resumes a session.

### Sailing Regatta

Scope: world, object.

Boats, buoys, docks, and flags are assets. Race course geometry and scores live in
world state; timers and race adjudication can be module-service state. Agents can
race, co-pilot, or act as race officials.

### Castle Defense

Scope: world.

Castles, walls, gates, siege pieces, and units are assets. Wave logic and scoring
belong to a module service. Terrain and placed defenses remain normal world edits.

### Watch Party

Scope: interior, object.

A TV/screen object hosts synchronized media. Participants can keep spatial presence,
see each other's TV-head avatars, and optionally fullscreen the shared movie as a
participant view while the in-world screen remains the social anchor.

## First Milestones

1. Land the descriptor registry and tests.
2. Add module attachments to world protocol as additive optional state.
3. Add a simple UI affordance on eligible objects: "Start module" / "Open module".
4. Implement one object-scoped module end to end: chess or watch party.
5. Implement one world-scoped module end to end: sailing course or garden planner.
6. Let agents advertise supported roles per active module.

## Design Guardrails

- Do not bake module-specific props into procedural building shells.
- Do not store large generated/uploaded assets inside module config; store asset IDs.
- Do not make every module run a service. Use world state until rules or sync demand
  a stronger authority.
- Do not force all modules into game rules. Planning, decorating, racing, watching,
  and defending are all valid module shapes.
