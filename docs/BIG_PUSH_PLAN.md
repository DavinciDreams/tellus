# Big push — interior physics, building, vegetation, perf

**Decision (2026-06-20):** Extend Tellus's existing Rapier for interior-building physics
(NOT port hyperscape's PhysX). Rapier's KinematicCharacterController is already configured for
stairs/slopes (autostep 0.45/0.35, snapToGround 0.35, slope 50°) and Rapier has trimesh
colliders — the missing pieces are wiring, not a new engine. PhysX stays a documented future
option if Rapier hits limits (complex dynamic furniture stacking).

## Key facts from exploration (hyperscape @ C:\Users\lmwat\hyperscape, Tellus @ tellus/tellus)

### Tellus current state
- `src/tellus-rapier-physics.ts` (164 lines): `createTellusRapierPhysics()` →
  `{ syncSolids, movePlayer, stats, dispose }`. Kinematic capsule (r0.5, halfH0.68), gravity -22,
  autostep/snapToGround/slope ALREADY set. World steps LAZILY (only in movePlayer when dirty).
- Rapier WASM is base64-inlined (@dimforge/rapier3d-compat) — NO .wasm hosting needed.
- `movePlayer(from,desired)` resolves ONLY XZ today; gravity Y computed separately in moveVisitor
  (main.tsx ~4419-4436). So the controller never does vertical floor/stair contact.
- Interiors: `applyInterior(sceneUrl)` (main.tsx ~736-803) hides outdoor meshes, setChunkedFlatGround(0)
  → flat y=0 floor, builds procedural box room + loads GLB into "tellus-interior" group.
  **ZERO floor/wall collision today** — player stands on y=0 by math, GLB is visual only.
- `renderedTerrainHeightAt` (main.tsx ~2617) raycasts ONLY terrain + chunk-terrain, NOT the interior
  GLB → furniture floats at y=0, not on the real floor.
- Animate loop (main.tsx ~5072-5184), rAF-driven; physics.step seam = before renderer.render (~5167).
- Vegetation: src/tellus-vegetation.ts (procedural grass/trees) — to be replaced by hyperscape procgen.

### Hyperscape harvest sources (C:\Users\lmwat\hyperscape\packages)
- procgen (131 ts) — vegetation generators (trees/grass) we want; skip exotic plants.
- physx-js-webidl — PhysX WASM (NOT using; documented alternative).
- impostors (21), decimation (36) — perf harvest.
- shared/src/extras/three/geometryToPxMesh.ts — mesh→collider cooking PATTERN (mirror for Rapier trimesh).
- shared/src/systems/.../BuildingRenderingSystem.ts (~4440-4688) — building floor-slab + wall-box pattern.

## Tracks (this push)

### Track A — Interior physics (Rapier extension) [DEPLOYMENT-CRITICAL]
Extend src/tellus-rapier-physics.ts:
- `addStaticTrimesh(id, mesh)` / `clearStatics()` — extract world-space verts+indices from a
  THREE.Object3D (traverse meshes, bake matrixWorld), build ColliderDesc.trimesh, add as fixed body.
- Full-3D movement: a movePlayer mode that passes gravity-integrated Y through the controller so
  autostep/snapToGround handle stairs/floor contact. Keep XZ-only path for outdoor.
- Wire applyInterior(): on GLB load, addStaticTrimesh(interior group); on portal exit, clearStatics().
- Furniture on floor: add the interior group to renderedTerrainHeightAt targets (or a parallel
  renderedInteriorHeightAt) so footprintGroundY rests furniture on the real floor.
- Step the Rapier world each frame in interiors (remove lazy-only guard for interior mode).

### Track B — Interior building system [DEPLOYMENT-CRITICAL, feeds Track A]
src/tellus-building.ts: generate interior room geometry (walls, floors, stairs) as real THREE meshes
that Track A turns into colliders. Ties to door=portal interior-world flow (Hyades portal grain,
target.kind === "interior", EnsureInteriorAsync). Postal-contract: interior = its own world.

### Track C — Vegetation port (parallel, independent)
Port hyperscape procgen trees + grass into Tellus, replacing tellus-vegetation procedural output.
Skip exotic plants (monstera etc). Keep Tellus's placement/LOD/instancing seams.

### Track D — Perf: impostors + decimation (parallel, independent)
Harvest hyperscape impostors + decimation as Tellus modules for many-object scenes.

## Pipeline discipline
Explore (done) → plan (this doc) → implement in WORKTREES (parallel, isolated) → QA each →
I build-gate (tsc + vite + 161 tests) + integrate before merge. Nothing merges that doesn't build.
