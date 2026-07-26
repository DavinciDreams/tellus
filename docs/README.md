# Tellus documentation map

This directory contains a mix of current runbooks, implemented system designs,
research notes, and historical product plans. The source code and deployed
Hyades contracts remain authoritative when an older PRD describes a proposed
route or phase.

## Current systems and operations

- [Gnostr Cloud setup](./GNOSTR_CLOUD_SETUP.md) — production release workflow,
  CI inspection, and live verification.
- [Biome ecology and procedural tree realism](./BIOME_ECOLOGY_SPEEDTREE_PRD.md)
  — implemented shared ecology model plus remaining realism work.
- [Procplant realism research](./PROCPLANT_REALISM_RESEARCH.md) — how the
  research references map onto Tellus's deterministic, instanced renderer.
- [Forest canopy LOD notes](./FOREST_CANOPY_LOD_NOTES.md) — future far-canopy
  aggregation beyond the current individual-tree LOD and impostor system.
- [Terrain texture blackout notes](./TERRAIN_TEXTURE_BLACKOUT_NOTES.md) — why
  WebGL is the current default and how the WebGPU opt-in differs.
- [Animation System v1](./ANIMATION_SYSTEM_V1.md) — current animation routing
  for avatars, agents, fauna, and objects.
- [Vegetation/building exclusion notes](./VEGETATION_BUILDING_EXCLUSION_NOTES.md)
  — authoritative placement-boundary and scaling guidance.
- [Hyades asset LOD proxy handoff](./HYADES_ASSET_LOD_PROXY_HANDOFF.md) — asset
  proxy and LOD integration details.
- [Yosemite terrain bake](./YOSEMITE_TERRAIN_BAKE.md) — reproducible terrain
  asset generation.

## Protocol and feature specifications

- [Portal protocol reconciliation](./PORTAL_PROTOCOL_RECONCILE.md)
- [World terrain and portals](./WORLD_TERRAIN_PORTALS_PRD.md)
- [World state module specification](./tellus-world-state-module-spec.md)
- [World modules and minigames](./WORLD_MODULES_MINIGAMES_PRD.md)
- [Procedural building/home planner](./PROCEDURAL_BUILDING_HOME_PLANNER.md)
- [Shared player surface](./SHARED_PLAYER_SURFACE_PRD.md)
- [Friends, presence, and communication](./FRIENDS_PRESENCE_COMMUNICATION_PRD.md)
- [Friends relationships phase 2](./FRIENDS_RELATIONSHIPS_PHASE_2_PRD.md)
- [Embodied agents](./EMBODIED_AGENTS_PLAN.md)

These documents preserve design rationale and may include planned APIs. Check
their status note before treating an endpoint or phase as shipped behavior.

## Research and roadmaps

- [Architecture roadmap](./ARCHITECTURE_ROADMAP.md)
- [Big push plan](./BIG_PUSH_PLAN.md)
- [Avatar instancing R&D](./AVATAR_INSTANCING_RND.md)

Roadmaps describe direction, not a release promise. Current shipped changes are
summarized in [`RELEASE_NOTES.md`](../RELEASE_NOTES.md); repository workflow is
documented in [`CONTRIBUTING.md`](../CONTRIBUTING.md) and [`AGENTS.md`](../AGENTS.md).
