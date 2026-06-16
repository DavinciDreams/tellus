# PRD: Tellus Worlds, Tile Terrain, Portals, and Indoor Spaces

## Purpose

Tellus is moving from a single procedural island toward a network of connected, persistent 3D spaces: classic procedural worlds, chunked editable worlds, tile-backed large worlds, and indoor scenes entered through doors or portals.

This PRD is written for collaborators maintaining the Nostr / gnostr.cloud Tellus deployment, especially where that deployment has diverged from the current Hyades backend and Tellus frontend. The goal is to describe how the pieces should map together, what must stay authoritative, and how to stage the work without regressing performance, agent grounding, or deployment reliability.

## Goals

- Support multiple terrain substrates:
  - classic Tellus procedural island;
  - chunked editable terrain;
  - future 3D Tiles / globe / real-world terrain.
- Keep agents and players grounded on the same world state.
- Make world-to-world portals first-class objects.
- Allow building doors to enter indoor Three.js scenes.
- Make evolving terrain and biome systems forward-facing, so worlds can visibly grow, decay, spread, and influence neighboring regions over time.
- Use MonumentalSystems/evoflow as the first practical source of terrain/biome genomes and mutation workflows.
- Preserve low-latency local rendering while keeping authoritative world state on the backend.
- Define a practical migration path for Nostr deployment divergence.

## Non-Goals

- Do not replace all Tellus terrain with Cesium or MapLibre in one step.
- Do not make 3D Tiles directly editable in the first version.
- Do not require all deployments to immediately converge on Hyades internals.
- Do not make portals a frontend-only teleport shortcut; they must become world state.

## Current State

### Tellus Frontend

The frontend currently has two terrain models:

- **Classic terrain**
  - Procedural radial island.
  - Client math lives primarily in `src/tellus-terrain.ts`.
  - Templates live in `src/tellus-world-templates.ts`.
  - Terrain state is a fixed sculpt/paint grid.

- **Chunked terrain**
  - Worlds whose IDs start with `chunked-`.
  - Rendered by `src/tellus-chunk-renderer.ts`.
  - Uses square chunks with streamed sculpt and paint arrays.
  - Player grounding can sample loaded chunk heights via `setChunkedHeightProvider`.
  - Current chunked worlds are closer to a scalable editable plane than a fully featured terrain system.

The frontend also now has:

- world menu with live world / skybox / terrain switching;
- world chat, nearby chat, and DM UI;
- agent-facing chat hooks;
- map/world actor navigation affordances.

### Hyades Backend

Hyades contains a Tellus world module with:

- world snapshots and patches;
- terrain actions such as `terrain.replace` and `terrain.sculpt`;
- chunked terrain support;
- agent views and agent tools;
- server-side terrain math for agent grounding/perception.

Important caveat: Hyades has had a server-side mirror of the classic terrain math. Any change to client base terrain that affects height or terrain kind must either be ported to Hyades or isolated behind a provider/version boundary.

### Nostr / gnostr.cloud Deployment

The Nostr deployment may be serving a divergent Tellus stack. Treat it as a separate runtime variant until proven otherwise.

Deployment owner should verify:

- which frontend commit is live;
- which backend/world API is live;
- whether world state is Hyades-compatible;
- whether chunked terrain endpoints exist;
- whether chat actions exist;
- whether agent tools use Hyades MCP/plugin semantics or a local fork;
- whether gnostr deploys from Git, CI enqueue, or a custom local copy.

## Core Concept

Split terrain into three layers:

1. **Render substrate**
   - What the player sees.
   - Examples: procedural mesh, chunk mesh, 3D Tiles, Cesium globe, MapLibre terrain.

2. **Gameplay substrate**
   - What players and agents stand on, navigate, query, and collide with.
   - Must answer: height, terrain kind, walkability, nearby surfaces.

3. **Editable overlay**
   - Tellus-owned deltas: sculpting, paint, generated structures, portals, semantic annotations.
   - Stored as world/chunk state and synchronized through patches.

This lets Tellus use visually rich external terrain while preserving a practical game state model.

## Forward-Facing World Evolution

Tellus should eventually present worlds as living systems, not static maps. Terrain and biomes should be able to evolve over time, with neighboring regions influencing one another. This direction is inspired partly by older terrarium-style simulation games: the player does not only edit a surface, they cultivate an environment whose edges, populations, materials, and local rules interact.

Forward-facing examples:

- a meadow spreads into neighboring dirt when water and light are favorable;
- a desert edge dries nearby grasslands unless rivers, shade, or player interventions hold it back;
- snow lines migrate with lighting, elevation, and season;
- fungal/alien biomes can colonize structures or terrain patches;
- player/agent sculpting changes drainage, which changes vegetation;
- generated buildings can seed micro-biomes around themselves;
- portals can connect ecosystems, allowing influence to leak between linked worlds or interiors in controlled ways.

This should not be simulated globally every frame. It should be modeled as patch-local evolution:

```txt
next patch state = local biome state + neighbor edge influence + time + player/agent edits + world rules
```

The system should be inspectable by agents and players. A world should be able to answer questions like:

- what biome is this patch?
- what is it becoming?
- what neighboring patch is influencing it?
- what player/agent action would help or suppress that change?
- what genome/rule produced this terrain?

## Evoflow as the First Terrain/Biome Genome Source

`MonumentalSystems/evoflow` should be treated as the first source of evolving terrain and biome ideas. Its README describes EvoFlow Worlds as a prototype for persistent 3D world generation using compact world genomes. Those genomes emit controllable priors such as voxel fields, camera paths, semantic masks, depth maps, fractal terrain, and graph layouts, and can be mutated into child worlds.

For Tellus, Evoflow maps naturally to:

- **World genome**
  - compact description of terrain, biome rules, semantic masks, graph layout, camera/preview paths, and generation prompts;
- **Patch genome**
  - smaller per-chunk/per-region version used for evolving biome cells;
- **Mutation**
  - agent/player/world event creates child terrain or biome variants;
- **Selection**
  - users, agents, or scoring rules rank which variants become active;
- **Package export**
  - Evoflow packages can become Tellus terrain templates, 3D reconstruction inputs, or interior/world seeds.

Initial integration target:

```txt
Evoflow genome/package -> Tellus terrain template -> chunk/patch biome rules -> optional reconstruction asset
```

Do not start by making Evoflow own live simulation. Start by importing or adapting Evoflow outputs into Tellus as seed data:

- height map or fractal terrain prior;
- semantic mask for biome/material regions;
- graph layout for paths, rivers, portals, settlements;
- prompt/genome metadata for agents to reason about the world;
- mutation lineage for child worlds.

Longer term, Evoflow can generate candidate terrain/biome patches that agents propose, mutate, and negotiate inside Tellus.

## Terrain Provider Interface

Introduce a provider boundary in the frontend and eventually backend:

```ts
interface TerrainProvider {
  kind: "classic" | "chunked" | "tiles";
  update(center: Vec3, camera: THREE.Camera): void;
  sampleHeight(x: number, z: number): number | null;
  raycast?(ray: THREE.Ray): TerrainHit | null;
  terrainKind(x: number, z: number, y: number): TerrainKind;
  applyPatch?(patch: TerrainPatch): void;
  stats?(): Record<string, unknown>;
  dispose(): void;
}
```

Frontend systems should ask the active provider for height/kind instead of directly calling classic terrain functions everywhere. Hyades or Nostr backends should expose equivalent concepts for agent perception.

## 3D Tiles Direction

3D Tiles should be introduced as a **tile-backed terrain provider**, not as the first editable terrain format.

Recommended first implementation:

- Use Three.js with `3d-tiles-renderer` directly inside the existing Tellus scene.
- Avoid MapLibre as the first integration unless map labels/vector map controls are required.
- Choose one local origin and transform geospatial/world coordinates into local meters for gameplay.
- Render 3D Tiles as visual base terrain.
- Use raycast or derived height tiles for height sampling.
- Apply Tellus chunk overlays on top for edits, generated objects, and portals.

MapLibre remains valuable later for map UI, vector layers, geocoding, or 2D/3D map navigation. Cesium remains valuable for full globe/real-world workflows. The first Tellus spike should keep game controls and Three scene ownership simple.

## Sheaf / Patch Reconciliation Model

Use the sheaf idea pragmatically:

- The world is covered by local patches: chunks, tiles, rooms, interiors.
- Each patch has local state:
  - base substrate reference;
  - editable deltas;
  - generated objects;
  - portal anchors;
  - semantic tags;
  - revision metadata.
- Neighboring patches overlap at boundaries and must reconcile:
  - edge heights should stitch or blend;
  - object IDs must be globally stable;
  - portals must resolve to valid target worlds/scenes;
  - agent navigation must know whether transitions are possible;
  - conflicting edits need ownership/last-write/CRDT rules.

Practical world formula:

```txt
world = base substrate + chunk deltas + object graph + portal graph + biome/genome state + semantic annotations
```

## Portals

Portals should be world objects stored in world state.

```ts
type WorldPortal = {
  id: string;
  worldId: string;
  label: string;
  position: Vec3;
  radius: number;
  rotation?: Vec3;
  target: {
    kind: "world" | "interior";
    worldId: string;
    spawn?: Vec3;
    sceneUrl?: string;
    returnPortalId?: string;
  };
  createdBy?: string;
  createdAt?: string;
};
```

Portal behaviors:

- Players can click/interact with a portal or walk into its trigger volume.
- Agents can call `enterPortal(portalId)`.
- Switching worlds must update presence, chat context, map context, and spawn position.
- Portals should be visible on the map and in agent observations.
- Backend must validate portal IDs and target access.

## Buildings and Indoor Scenes

Buildings should expose doors as portals. The door target should usually be an interior world:

```ts
target: {
  kind: "interior",
  worldId: "interior-main-tavern-001",
  spawn: { x: 0, y: 0, z: 3 },
  sceneUrl: "/interiors/tavern-001.glb",
  returnPortalId: "tavern-door-exit"
}
```

Recommended model:

- Exterior building remains a generated/placed object in the outdoor world.
- Door is a portal anchor attached to that object.
- Interior is a separate world or scene with its own:
  - objects;
  - chat;
  - agents;
  - generated items;
  - return portal.

This avoids special casing “inside a building” throughout the app. It also lets agents remain inside interiors while players are elsewhere.

## Chat and Agents

World chat should be scoped to the current world/interior.

Expected channels:

- `world`: all participants in current world/interior;
- `nearby`: participants close enough in current world/interior;
- `dm`: direct messages to a player or agent.

Portal-aware extensions can come later:

- “voices through door” nearby bridge;
- portal arrival/departure system messages;
- agents coordinating across linked worlds by querying portal graph.

Agent views must include:

- current world ID;
- current world name if available;
- current coordinates;
- current terrain/tile/chunk identifier;
- nearby portals;
- nearby players/agents;
- recent chat;
- available verbs, including `enterPortal`.

## Backend Protocol Requirements

Minimum new or extended concepts:

- `world.portal.upsert`
- `world.portal.delete`
- `world.portal.enter`
- `world.biome.patch`
- `world.biome.tick`
- `world.snapshot` includes `portals`
- `world.snapshot` includes biome/genome metadata when enabled
- `world.patch` broadcasts portal changes
- `world.patch` broadcasts biome/material evolution changes
- `agent.view` includes nearby portals and current space metadata
- `agent.view` includes local biome state and visible biome trends

Portal enter response should include enough data for the client to switch:

```json
{
  "type": "world.portal.entered",
  "portalId": "door-1",
  "fromWorldId": "main",
  "toWorldId": "interior-main-tavern-001",
  "spawn": { "x": 0, "y": 0, "z": 3 }
}
```

Security:

- The server must resolve actor identity from session/auth, not client-supplied visitor IDs.
- Portal creation/editing should respect world permissions.
- Private/interior worlds should not be enterable unless the actor has access.
- `sceneUrl` must be allowlisted or resolved through trusted asset storage.
- Biome ticks should be server-authoritative or deterministically replayable. Clients may preview evolution, but durable state should come from backend patches.
- Imported Evoflow packages should be validated before becoming live terrain/biome templates.

## Deployment Considerations for Nostr Maintainer

Because the Nostr deployment has diverged, the maintainer should first inventory compatibility:

1. **Frontend**
   - Confirm active commit and build artifact.
   - Confirm whether world menu/chat/terrain-switching PRs are present.
   - Confirm whether chunked world UI and `chunked-*` world IDs exist.

2. **World API**
   - Confirm endpoints:
     - snapshot;
     - action;
     - live/stream;
     - chunks manifest;
     - chunk fetch;
     - agent view/tools.
   - Confirm accepted action types:
     - `world.chat`;
     - `terrain.replace`;
     - `terrain.sculpt`;
     - future portal actions.

3. **State Shape**
   - Compare world snapshot schema with frontend `world-protocol.ts`.
   - Verify generated objects, presence, chat, terrain, and chunk updates.

4. **Agent/MCP**
   - Confirm whether agent tools match Hyades TellusWorldPlugin semantics.
   - Confirm chat is readable/writable by agents.
   - Confirm identity is server-resolved.

5. **Performance**
   - Validate chunk load radius behavior.
   - Validate memory use while crossing chunk boundaries.
   - Validate WebSocket/live update fanout.
   - Validate asset caching for interiors/tiles.
   - Validate biome tick cadence and patch size. Evolution should produce small patch diffs, not full-world terrain snapshots.

## Rollout Plan

### Phase 0: Inventory and Alignment

- Produce a compatibility matrix: frontend commit, Nostr backend, Hyades backend.
- Identify schema/action gaps.
- Decide whether Nostr will:
  - converge to Hyades protocol;
  - maintain a compatibility adapter;
  - or fork protocol intentionally.

### Phase 1: Terrain Provider Refactor

- Add provider boundary in frontend.
- Wrap existing classic terrain and chunk renderer.
- Keep user-visible behavior unchanged.
- Add tests for height/kind parity.

### Phase 2: Portal Graph

- Add portal schema to world protocol.
- Render simple portal markers.
- Add `enterPortal`.
- Support world-to-world transition.
- Add agent observation and tool support.

### Phase 3: Building Interiors

- Attach portal anchors to generated building doors.
- Load an interior world/scene.
- Add automatic return portals.
- Scope chat/presence to interior world.

### Phase 4: Tile-Backed Terrain Spike

- Add experimental `tiles-*` world provider.
- Load one 3D Tileset in Three.
- Implement height raycast/sample.
- Keep edits as Tellus overlay chunks.
- Measure performance on target deployment hardware/browser.

### Phase 5: Patch Reconciliation

- Store terrain/object deltas per chunk/patch.
- Add boundary stitching rules.
- Add edit ownership or conflict policy.
- Add compaction/snapshotting for long-lived worlds.

### Phase 6: Evolving Biomes and Evoflow Seeds

- Import a small Evoflow genome/package as a Tellus terrain/biome template.
- Add patch-local biome state to chunks or classic terrain cells.
- Add edge influence rules between neighboring patches.
- Add slow backend-driven biome ticks.
- Show biome trends in agent observations and optional HUD/debug views.
- Let agents propose mutations or restoration actions.
- Persist lineage metadata so child worlds can trace back to parent genomes.

## Success Criteria

- A player can switch between classic, chunked, and portal-linked worlds without losing presence.
- Agents can report world ID and coordinates, read chat, post chat, and enter portals.
- A building door can open an indoor scene and return to the outdoor world.
- A terrain/biome patch can evolve over time and influence adjacent patches without sending full-world snapshots.
- Evoflow-generated terrain/biome seed data can initialize a Tellus world or patch.
- Terrain height/kind is consistent enough between frontend and backend for navigation.
- Nostr deployment can run the same protocol or a documented adapter.
- Performance remains stable with chunked terrain and indoor scene transitions.

## Open Questions

- Should interiors always be full worlds, or can some be lightweight client scenes?
- Should 3D Tiles worlds be geospatial first or local-meter first?
- Who owns portal creation: humans only, agents, generated buildings, or all three?
- How should private indoor worlds inherit permissions from exterior worlds?
- Does the Nostr deployment want to converge on Hyades, or preserve a separate backend with protocol compatibility?
- Where should durable portal/world metadata live in gnostr.cloud deployments?
- Should biome evolution tick continuously, on player proximity, on scheduled backend jobs, or only when agents/world events touch a patch?
- Should Evoflow genomes live inside world metadata, chunk metadata, or separate asset/package storage?

## Recommended Next Step

Before implementing portals or 3D Tiles, add the `TerrainProvider` abstraction and a small `WorldPortal` protocol type behind a feature flag. This gives the frontend, Hyades, and Nostr deployment a shared shape to converge on without forcing immediate migration of every terrain/backend path.

In parallel, run a tiny Evoflow-to-Tellus experiment: import one Evoflow-generated height/semantic package into a non-live Tellus world, render it as a template, and attach read-only biome metadata to agent observations. That proves the direction without committing to live biome simulation yet.
