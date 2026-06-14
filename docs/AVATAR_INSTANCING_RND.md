# Avatar Instancing — R&D / Direction Design

Status: research / direction. Not yet built.
Scope: rendering **many copies of the same avatar** in large chunked Tellus worlds, each
with its own animation state and transform, with a runtime (not baked) animation pipeline.

This doc is grounded entirely in three research passes:

- **A1** — current-state map of the avatar/character system (`tellus-vrm-avatar.ts`,
  `tellus-avatar-catalog.ts`, `main.tsx`).
- **A2** — feasibility of cloning a parsed VRM (shared geometry/material, per-instance
  skeleton) + runtime FBX→VRM-humanoid clip retargeting, against `@pixiv/three-vrm` 3.5.3
  and `three` 0.180.0.
- **A3** — crowd-render technique survey for animated humanoids in three.js/WebGL.

---

## 1. Goal & constraints

**Goal.** Render N copies of the *same* avatar model cheaply, where each copy has:

- its **own animation** (different clip, or same clip at a different playhead/speed), and
- its **own transform** (position/rotation/scale in the world).

**Forward-looking constraint — runtime retarget, not baked.** The animation roadmap is
**animation-only FBX clips** (e.g. Mixamo) **retargeted at runtime onto the VRM humanoid**,
*not* pre-baked vertex animation. Every architectural choice below must preserve the ability
to add a new clip at runtime and have it apply to every existing instance. This rules out
anything that bakes pose data into geometry/textures as the *primary* tier (see §5).

**Foundational for large worlds.** Tellus already streams arbitrarily large worlds via
per-chunk grains; the avatar system must scale alongside it without an O(N) CPU cliff. The
chunk load ring is a natural cap (see §5) and should be leveraged, not fought.

**Non-goals.** We are *not* trying to make skinned VRM avatars share a single draw call in
the near term (three.js cannot per-instance skin a `SkinnedMesh` — see §5.3). We are *not*
baking VAT for the retargetable tier.

---

## 2. What is DISTINCT per instance vs SHARED

This is the load-bearing table. "Shared" means one copy in memory/VRAM referenced by every
on-screen instance; "Per-instance" means one copy *per* on-screen avatar.

| Asset / state | Shared | Per-instance | Why |
|---|:---:|:---:|---|
| Geometry (vertices, indices, normals) | ✓ | | Never mutated; pure GPU buffer. |
| Material (MToon/std, uniforms, samplers) | ✓ | | Reusable by reference; expression binds write non-destructively. |
| Texture (albedo, normal, MToon maps) | ✓ | | Image data is read-only. |
| Animation **clip** (keyframe tracks) | ✓ | | Immutable data; tracks address bones *by name*, resolved per-instance by the mixer. |
| VRM meta | ✓ | | Static metadata. |
| FirstPerson config | ✓ | | Stateless. |
| **Skeleton** (bone hierarchy, inverse-bind) | | ✓ | Holds per-frame pose (position/quaternion/matrixWorld) per avatar. |
| `Skeleton.boneMatrices` / `boneTexture` | | ✓ | Per-frame computed transforms, uploaded each frame. Small (~4 KB / 50 bones). |
| `SkinnedMesh.bindMatrix` | | ✓ | Per-mesh (often identical for clones, but owned per instance). |
| **AnimationMixer** | | ✓ | Owns `.time`, active actions, interpolators — the playback engine. |
| AnimationAction (clip-time / weight / fade) | | ✓ | One playback state per mixer; never shareable. |
| Transform (position/rotation/scale node) | | ✓ | World placement. |
| `VRMHumanoid` | | ✓ | References the instance's skeleton bone nodes. |
| `VRMExpressionManager` (weights) | | ✓ | Per-instance face/expression weight state. |
| `VRMLookAt` (yaw/pitch, eye-bone quats) | | ✓ | Per-instance gaze state. |
| `VRMSpringBoneManager` (joint physics) | | ✓ | Per-joint position/velocity evolves independently. |
| Morph targets / blend shapes (current weights) | | ✓ | Per-instance expression output. |

**One-line takeaway:** *everything that is **data** is shared; everything that is **state**
(a pose, a playhead, a physics step, a gaze) is per-instance.* The win comes from never
re-uploading the data, while accepting the unavoidable per-instance state cost.

---

## 3. Current state & the gap

(References are `file:line` from the A1 map.)

### GLB animals — already do the right thing
- `glbCache` caches the **full parsed `GLTF`** per storeId
  (`tellus-avatar-catalog.ts:123`). Parse happens once.
- Per instance, `SkeletonUtils.clone(gltf.scene)` clones the scene graph + skeleton while
  **sharing geometry + materials** (`tellus-avatar-catalog.ts:257`, import at `:9`).
- Embedded clips are categorized once (`categorizeEmbeddedClips`, `:178`) and the full set is
  kept for emotes (`GlbAvatarRig.allClips`, `:189`).
- Cost: per-instance skeleton + mixer (unavoidable for skinning); geometry/material shared.
  **This is the pattern we want everywhere.**

### VRM avatars — the gap
- `vrmBufferCache` caches only the **raw ArrayBuffer** per asset URL
  (`tellus-vrm-avatar.ts:209`), with an explicit comment that skinned scenes "cannot share"
  so the buffer is **re-parsed per instance** (`:252`).
- VRMA animation clips *are* cached + reused across instances
  (`vrmaCache`, `:210`) — so the clip tier is already shared; good.
- Placed VRM "things" (Auton/Atlantean store models) take the **same per-instance re-parse**
  hit via `tryLoadVrmObject` (`:612`) and `VrmObjectRig` (`:538`), created per placed thing
  in `loadGeneratedModel` (scene-builders `:843`).

### The instancing system today
- GPU `InstancedMesh` folding (`main.tsx:1352`–`1677`) is **static-only**: candidates must be
  ready, static, shared-GLB, **no animation, not selected** (`:1609`–`1660`). It explicitly
  refuses animated things (`:1361`). Correct, but it does nothing for avatars.

### The cost A1 measured
From the A1 "where many-copies hurt" pass:
- **VRM players / placed Autons:** per-instance **parse + bind-pose setup** is the bottleneck
  (`tellus-vrm-avatar.ts:252`). 10× players = 10× parse. 50× Autons = 50× parse, even when all
  idle.
- **GLB animals:** modest — geometry/materials shared, only a skeleton clone per instance.
- **Static GLB:** excellent — cached + instanced when ≥2.

**The gap in one sentence:** *VRM is re-parsed per instance while GLB is parsed once and
cheaply cloned — so the single highest-leverage change is to give VRM the same
parse-once / clone-cheap treatment GLB already has.*

---

## 4. Recommended architecture

A **shared template** + **cheap per-instance clones** + a **shared clip library**.

```
                       ┌────────────────────────────────────────────┐
   parse ONCE  ───────▶│  AVATAR TEMPLATE  (per avatar model/storeId)│
                       │   • parsed source VRM (scene/materials/meta) │  SHARED
                       │   • GLTF handle                              │
                       │   • CLIP LIBRARY: Map<clipName, AnimationClip>
                       │       - VRMA clips (today)                   │
                       │       - FBX→humanoid-retargeted clips (next) │
                       └───────────────┬────────────────────────────-┘
                                       │  cloneVRM()  (cheap: 5–50 ms)
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
     ┌────────────┐             ┌────────────┐             ┌────────────┐
     │ INSTANCE 1 │             │ INSTANCE 2 │   …  N       │ INSTANCE N │  PER-INSTANCE
     │ skeleton   │             │ skeleton   │             │ skeleton   │
     │ mixer      │             │ mixer      │             │ mixer      │
     │ humanoid   │             │ humanoid   │             │ humanoid   │
     │ expr/lookAt│             │ expr/lookAt│             │ expr/lookAt│
     │ springBone │             │ springBone │             │ springBone │
     │ transform  │             │ transform  │             │ transform  │
     └────────────┘             └────────────┘             └────────────┘
        each plays any clip from the SHARED library on its own mixer
```

### 4.1 The shared template (parse once)
Mirror what GLB already does (`glbCache`): cache the **parsed** source VRM + its `GLTF`,
keyed by storeId/URL. Replace the "re-parse per instance" path
(`tellus-vrm-avatar.ts:252`) with a parse-once-then-clone path.

### 4.2 Cheap per-instance clone (A2)
There is **no first-party `VRM.clone()`** — we build a wrapper factory (A2 §1). The clone:

1. `SkeletonUtils.clone(sourceVRM.scene)` — reuses geometry + materials, creates a **new
   `Skeleton`** per `SkinnedMesh`, rebinds each mesh to its new skeleton + bind matrix.
2. Constructs a new `VRM({...})` over the cloned scene, reconstructing the managers that
   bind to the scene graph:
   - `humanoid` — rebuild the human-bone map against the cloned bone nodes
     (`VRMHumanoid.clone()` exists but assumes the *same* skeleton, so it is **not** usable
     here; rebuild the map by name lookup in the cloned tree).
   - `expressionManager?.clone()` — per-instance weight state, rebinds to cloned meshes.
   - `lookAt?.clone()` — per-instance gaze state; ensure its applier references the **new**
     humanoid.
   - `springBoneManager` — **no public `clone()`**; must be re-instantiated (per-joint
     physics state is per-instance).
   - `materials` / `meta` / `firstPerson` — **shared by reference**.

**Cost (A2):** `SkeletonUtils.clone()` ≈ 5–50 ms vs a full VRM parse; GPU savings ~95–99%
(geometry/material/textures shared). Per-instance overhead is the bone-matrix texture
(~4 KB), skeleton state, and mixer.

### 4.3 The shared clip library
A clip is **immutable data** whose tracks address bones by name; the mixer resolves them
against each instance's own bones. So **one retargeted clip is played by N mixers** with no
conflict (A2 §2 "Clip Sharing Across Instances"). VRMA clips are *already* shared via
`vrmaCache` (`tellus-vrm-avatar.ts:210`) — the library generalizes that to also hold
FBX-retargeted clips.

### 4.4 The FBX → VRM-humanoid retarget path (A2 §2)
Add a clip without re-authoring the avatar:

1. `FBXLoader.loadAsync(path)` → `group.animations[0]` (the source clip + Mixamo skeleton).
2. Provide a **Mixamo → VRM bone-name map** (`mixamorig:Hips`→`Hips`,
   `mixamorig:LeftUpLeg`→`LeftUpperLeg`, `mixamorig:LeftForeArm`→`LeftLowerArm`, …). This is
   **not automatic** and must be supplied/validated per avatar+clip.
3. `SkeletonUtils.retargetClip(target, source, sourceClip, { names, scale, hip:'Hips', ... })`
   → a new `AnimationClip` whose tracks address the **VRM** bones.
4. Store it in the template's clip library; every instance's mixer can `clipAction(clip)`.

**Retarget is a heavy O(frames × bones) one-time op** — do it **once per clip per avatar
model**, never per instance per playback. Preload on startup or lazy-load with progress.

**Caveats to encode (A2 §2, §5):**
- **VRM0 vs VRM1 orientation.** VRM0 faces −Z (180° rotated); call `VRMUtils.rotateVRM0()`
  before retargeting if needed. VRM1 is +Z.
- **Rest pose / scale.** Both VRM and Mixamo are T-pose (Mixamo offers A-pose too); Mixamo
  skeletons are scaled to height-in-cm. Set `options.scale` or normalize in advance.
- **Hip/root motion.** `retargetClip` preserves hip translation by default; set
  `useFirstFramePosition:true` for root-relative (in-place) clips.
- **No official VRM clone API.** Manager reconstruction is hand-rolled; recheck on
  `@pixiv/three-vrm` upgrades.

---

## 5. Scale tiers (A3)

Pick the tier by concurrent on-screen count. The retargetable architecture (§4) carries
through the first two tiers unchanged; the third introduces a **separate, optional** baked
tier that does *not* support runtime retarget.

### Tier 1 — Now: per-instance `SkinnedMesh`, small counts (1–~20)
- Status quo: one `SkinnedMesh` + `Skeleton` + `AnimationMixer` per avatar; shared
  geometry/material. Out-of-the-box three.js; full runtime retarget.
- Cost: ~0.1 ms/avatar in `mixer.update()`; ~5–10 ms total at the top of the range.
- A3 hot path: `main.tsx` updates **all** rigs every frame with **no culling**
  (A3 cites the per-frame loop ~`main.tsx:3791`–`3807`).

### Tier 2 — Dozens (~20–100): clone-cache + clip-share + update-only-visible + LOD
The chunk **load ring is the natural cap**: `CHUNK_LOAD_RADIUS = 2` → 5×5 = 25 chunks, and
players cluster in ~50 m, so typical sessions sit at 50–100 avatars. Within that:
- **Clone-cache + clip-share** = §4 (the parse-once VRM template). Removes the per-instance
  VRM parse cliff.
- **Update only visible / near.** Skip `rig.update()` for off-screen or far avatars
  (frustum or distance gate). A3 estimates **40–60%** off typical sessions for ~5 min work.
- **Distance-bucketed tick.** Near (<30 m) full rate; mid (<150 m) half rate; far frozen.
  A3 estimates ~**4×** mixer-cost reduction (e.g. 25 near @60 Hz + 75 far @30 Hz ≈ 2.5 ms).
- **LOD decimated meshes.** Swap to ~30% tri-count GLB beyond ~80–100 m via `THREE.LOD`
  (decimate with meshoptimizer, already a dep; no re-rig). *Note:* `THREE.LOD` does not stop
  the mixer — still gate `rig.update()` manually for hidden levels.
- **All of Tier 2 is retarget-safe** — it only changes *when/how often* a rig updates and how
  detailed its mesh is, never how clips are produced.

### Tier 3 — Hundreds+ : instanced skinning / VAT (and the retarget conflict)
Two GPU-crowd techniques exist, both with a hard caveat:

- **Plain `InstancedMesh` cannot skin per-instance** (A3 §2). Bone matrices live in a single
  scene-global texture; all instances would deform to the *first* avatar's pose. Fundamental
  to WebGL (samplers are per-program, not per-instance).
- **Texture-based bone palette** (A3 §2A): pack each avatar's bone matrices into a texture
  atlas strip, index by `instanceID` in a custom shader → many avatars in one draw call.
  ~200 feasible before texture bandwidth/memory dominates. **Runtime retarget is *limited*:**
  bone matrices are effectively static at draw time; works for static pose loops, not mid-clip
  retarget blending. Not in three.js core (DIY shader).
- **Vertex Animation Textures (VAT)** (A3 §3): bake per-vertex pose frames to a texture;
  `InstancedMesh` + shader plays them. Scales to 1000s in one draw call, tiny CPU.
  **But VAT is incompatible with runtime FBX retarget** — clips must be pre-baked; adding a
  retargeted clip is impossible without re-baking the atlas.

**Direction for Tier 3:** keep a **retargetable tier** (Tier 1/2 `SkinnedMesh`) as the
*primary, indefinite* path for players and any avatar that needs runtime clips. Add an
**optional baked tier** (VAT / bone-palette) **only** for things whose animation set is
frozen and numerous — e.g. ambient agents/crowds, mounts, far players as billboards. Near
avatars stay `SkinnedMesh` for responsiveness and retarget.

### FBX-retarget compatibility matrix (A3)
| Technique | Runtime retarget | Use for |
|---|:---:|---|
| Per-instance `SkinnedMesh` (Tier 1) | ✓ | baseline, players |
| Distance throttle + LOD (Tier 2) | ✓ | dozens; only changes update cadence/detail |
| Texture bone palette (Tier 3) | ⚠ limited | static pose loops at scale |
| VAT baking (Tier 3) | ✗ | frozen-animset crowds/agents only |
| Sprite/billboard impostors | ✗ | far players, ambient |

---

## 6. Phased implementation plan

### Phase 0 — Instrument (cheap, do first)
- Wrap the per-frame rig-update loop in `performance.now()` and log mixer cost over real
  sessions; it informs when Tier 2 throttling is actually needed (A3 "immediate actions").

### Phase 1 — **FIRST concrete step: VRM clone-cache**
Bring VRM to parity with GLB. Mirror the existing `generatedGltfCache` + `SkeletonUtils.clone`
pattern (`tellus-avatar-catalog.ts:123`,`:257`) for VRM:

1. Cache the **parsed** source VRM + `GLTF` per storeId/URL (replacing the buffer-only
   `vrmBufferCache` re-parse at `tellus-vrm-avatar.ts:252`).
2. Implement `cloneVRMInstance(sourceVRM, sourceGLTF)` per §4.2 (`SkeletonUtils.clone` +
   manager reconstruction: humanoid map rebuild, expression/lookAt clone, springBone
   re-instantiate, shared materials/meta).
3. Route `VrmAvatarRig` and `VrmObjectRig` (`tellus-vrm-avatar.ts:489`,`:538`) through the
   clone factory instead of a per-instance parse.
4. Keep clips flowing through the existing shared `vrmaCache` (`:210`) — no change.

**Risks / validation (must use a real VRM asset):**
- **Animation must survive cloning** — verify a cloned instance plays idle/walk/wave with the
  cloned skeleton (the mixer must drive the *new* bones, not the template's).
- **Expression + lookAt must survive** — verify per-instance face weights and gaze are
  independent across two clones, and that lookAt's applier points at the *cloned* humanoid.
- **SpringBone independence** — verify two clones' spring physics evolve separately (no shared
  joint state); springBone has no public clone, so confirm the re-instantiated manager works.
- **No material mutation bleed** — expression texture-transform binds write per-instance via
  manager state but reference shared materials; confirm two different expressions on two
  clones don't corrupt each other.
- **VRM0 vs VRM1** — test both; apply `VRMUtils.rotateVRM0()` where needed.

This is the highest-leverage change (kills the per-instance parse cliff) and is fully
backward-compatible — it changes *how* instances are produced, not the rig API.

### Phase 2 — Update-only-visible + distance buckets + LOD (Tier 2)
- Add frustum/distance gate to the rig-update loop.
- Add `AVATAR_UPDATE_NEAR_M` / `AVATAR_UPDATE_FAR_M` / far tick-rate constants.
- Wire `THREE.LOD` with decimated VRM meshes (meshoptimizer), manually skipping hidden-level
  mixers.

### Phase 3 — FBX retarget into the clip library
- Add the `FBXLoader` + `SkeletonUtils.retargetClip` path (§4.4) producing
  `AnimationClip`s stored in the per-template clip library, with a Mixamo→VRM bone map and
  VRM0/scale/hip handling. Retarget once per clip per model.

### Phase 4 — (Optional, only if scale demands) baked Tier 3
- Texture bone palette and/or VAT for frozen-animset crowds/agents; far-player billboards.
  Explicitly a *separate* tier from the retargetable players.

---

## 7. Open questions / decisions for the operator

1. **Target concurrent count?** Which tier do we design for now — confirm typical sessions are
   ≤100 (Tier 2) so we can defer all GPU-crowd work (Tier 3).
2. **Clip source of truth.** Do we standardize on VRMA (current) or commit to FBX/Mixamo as
   the runtime clip format going forward? This decides whether Phase 3 is core or optional.
3. **Bone-map ownership.** The Mixamo→VRM bone map is per-avatar-family and hand-maintained.
   Where does it live (per-asset metadata, a shared default + overrides, server-provided)?
4. **Decimated-LOD asset pipeline.** Auto-decimate on the asset service
   (`game-optimized` already exists — `tellus-avatar-catalog.ts` "tries
   `/api/assets/model/{id}/game-optimized`") vs ship explicit `*.lod1.glb`?
5. **Do we ever need a baked agent tier?** Tier 3 (VAT) only pays off for many identical
   frozen-animset agents. Is that a real future (large ambient crowds) or YAGNI?
6. **SpringBone budget at scale.** Spring physics is per-instance and "can be large" (A2 §3);
   do we cap/disable spring bones beyond a distance as part of Tier 2 throttling?
7. **Library version pinning.** Manager reconstruction is hand-rolled against
   `@pixiv/three-vrm` 3.5.3 / `three` 0.180.0 internals — do we pin and gate upgrades behind
   the Phase-1 validation checklist?
