# Tellus architecture roadmap — physics, building, animation

**Decision (2026-06):** Stay on the Tellus base (Three.js + Hyades/Orleans + GLB asset
pipeline). Extend the existing Rapier physics to dynamic bodies + joints. Harvest specific
self-contained packages from `DavinciDreams/hyperscape` (procgen, impostors, decimation) as
needed — WITHOUT adopting its client, crypto layers (wallet/coin/arena), or ElizaOS AI stack.
No game-engine migration (Godot/Babylon) — the cost is a full rewrite; the benefit (physics)
is reachable incrementally.

## Why
- Moat = generate-on-demand 3D + AI-in-world, deeply wired to Three.js + Hyades agents.
- Rapier already does dynamic bodies + joints — current code just uses a kinematic character
  controller only (`tellus-rapier-physics.ts`, 163 lines: player capsule + cuboid solids).
  Animation (ragdoll/IK/physical bones) and building (stacking/structural joints/collapse)
  need dynamic bodies + joints, NOT a new engine.
- hyperscape is the same author/lineage (Three.js + asset-forge + pixal3d) but a 366MB
  turbo-monorepo with PhysX + ElizaOS + MMORPG crypto (wallet/CoinPouch/arena-staking/
  chain-fees + wallet DB migrations). Its `procgen`/`impostors`/`decimation`/`physx-js-webidl`
  are standalone packages = harvestable; its client/server/crypto/AI = do not adopt.

## Execution stages (each independently shippable, tests green at every gate)

### Stage 0 — Refactor prep (REVISED after measuring)
main.tsx is 11.2k lines: `createTellusWorld()` (300-6317, ~6000 lines) + `App()` (6381-end,
~4860 lines). The TOP of the file is already lean (mostly interfaces + a few small consts) —
the size is locked inside the two giants.

KEY INSIGHT: physics is ALREADY modular (`tellus-rapier-physics.ts`, its own file). The new
subsystems do NOT require refactoring main.tsx first — they grow as NEW dedicated files that
`createTellusWorld` calls into, exactly like tellus-rapier-physics.ts already does today
(scene-builders, vegetation, terrain, vrm-avatar are all already separate modules).

So Stage 0 is OPTIONAL and deferred. Build physics/building/animation as new modules:
- `tellus-physics-dynamics.ts` — dynamic bodies + joints (extends the Rapier world)
- `tellus-building.ts` — placement/snap/structural joints
- `tellus-animation-physics.ts` — physical bones/ragdoll/IK on the VRM rig
A main.tsx refactor (splitting createTellusWorld/App) is worth doing ONLY when the file
actively impedes the work — not preemptively. Revisit after Stage 1.

### Stage 1 — Physics foundation (Rapier dynamics)
- Add dynamic rigid bodies + colliders (today: kinematic controller + static cuboids only).
- Add joints (fixed/revolute/spherical) — the primitive both building and animation need.
- Keep the existing character controller; add a dynamics world alongside it.

### Stage 2 — Building system
- Snap/placement, structural joints, stacking, optional collapse.
- Harvest `procgen` from hyperscape for procedural structure generation if it fits.

### Stage 3 — Animation system
- Physical bones / ragdoll / IK on the VRM rig using Stage 1 joints.
- (VRMA clip playback already exists in tellus-vrm-avatar.ts — this adds physicality.)

### Stage 4 — Scale/perf
- Harvest `impostors` + `decimation` for many-object scenes (builds on current vegetation LOD).

## Current physics surface (baseline)
`src/tellus-rapier-physics.ts`: `createTellusRapierPhysics()` → World(gravity -22),
kinematic character controller (autostep/snap/slope), player capsule collider, cuboid
colliders for `solids` (synced via `syncSolids`), `movePlayer(from,desired)→{position,grounded}`.
No dynamic bodies, no joints yet.
