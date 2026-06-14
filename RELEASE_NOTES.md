# Release Notes

Tellus — the 3D web "world" game client (React + three.js), backed by the in-cluster Hyades world.
Newest first. Versions are the deployed image tag (`192.168.1.187:30500/tellus:<tag>`); a `v<tag>` git tag
on the gnostr-cloud `master` triggers the CI build + rollout.

## 0.8.11
- **Every VRM avatar can play any animation.** VRM avatars used to preload exactly four clips
  (`idle`/`walk`/`jump`/`wave`); now they draw from the store's full VRMA catalogue. A new catalogue
  layer (`loadVrmaCatalog`) fetches `GET /api/assets/vrma` once and keys it by clip name; the rig's
  `playEmote(name)` resolves any name against it, then **lazily loads + retargets + caches** the VRMA
  onto that VRM on first use (subsequent plays — and other avatars, via the shared `vrmaCache` — are
  instant). `idle`/`walk` stay preloaded; emotes stream in on demand. The built-in `CLIP_IDS` remain
  the floor, so a missing/withheld catalogue degrades gracefully to the old four. This is mainly so
  AI agents can pilot their avatar body — the local `window.tellusAgent` gains a `playAnimation` verb
  and reports its clip vocabulary (`getState().animations`, via `emoteClipNamesSync`).
  - **Server dependency:** the store serves the catalogue at `…/api/vrma`
    (`{ animations: [{ id, name, download_url, … }] }`, ~445 clips); Tellus reaches it through the
    header-free asset proxy, so the proxy must forward **`/api/assets/vrma` → `{store}/api/vrma`**
    (same mapping as the existing `/api/assets/download/{id}`). Per-clip binaries load via the proven
    `assetDownloadUrl(id)` path — the feed's `download_url` is a relative store path and is ignored.

## 0.8.10
- **Placed VRM objects animate.** The auton/Atlantean store models are VRMs (skin + `VRMC_vrm`,
  zero embedded clips). As avatars they already animate; placed as world OBJECTS they went through
  the plain `GLTFLoader` path and stood frozen. The generated-thing render path now sniffs the glTF
  for the VRM extension and, for a VRM thing, mounts it through the same VRM rig the avatars use —
  looping a retargeted VRMA idle clip by default (or the clip the per-thing Animation HUD picks).
  Plain GLBs stay on the existing embedded-clip path. The Animation dropdown lists the VRMA catalog
  clips (idle/walk/wave) for a VRM thing and the embedded clip names for a GLB thing. `update(dt)`
  advances the VRM mixer + spring bones each frame; `__tellusThingsDebug` gains `vrm` /
  `skinnedMeshCount` / `vrmaClips` (autons are clip-less so file `clipCount` is 0, but `playing` is
  true with the VRMA action active).
- **Placeable mirrors.** A new one-click Mirror in the Nature panel places a framed ~2.5m standing
  mirror that rides the generated-things system (persists + syncs like any procedural asset, via a
  synthetic `procedural://mirror` URL). On WebGL it renders a real reflection through three's
  `Reflector` at a modest 512×1024 render target; live mirrors are capped (3) so extra mirrors —
  and the whole WebGPU path, where `Reflector` can't compile — fall back to a semi-reflective
  env-mapped tinted-glass plane (no console errors either way). `__tellusMirrorDebug` reports live
  vs glass counts and the cap.

## 0.8.9
- **Agent panel: "Reset thread" escape hatch.** New subdued control next to Start/Stop (two-step
  inline confirm) that calls the server's `POST …/agent/reset-thread` (hyades 0.5.201) to start a
  fresh conversation thread for a wedged agent — bad tool loops and inbox backlog gone, persona +
  memories kept. On success the local chat clears with a "— thread reset —" system note; on a
  mid-rollout silo without the route (404/501) it reports "not on the server yet" instead of failing.
- **Agent chat: tool turns render as compact chips.** Tool lines (and model-format artifacts that
  leak into assistant text — `<tool_call_box>…</tool_call_box>` blocks, bare JSON tool-call objects
  in all three key vocabularies (`action` / `name`+`arguments` / holo3.1's `tool`+`parameters`,
  broken inner JSON included), and holo3.1's plain-text call blocks (`MoveSelf direction:north
  distance:5`, bare tool-name lines, `key: value` arg lines) no longer dump raw text into the feed.
  Calls and results show as one-line pills (`🔧 Observe`, `🔧 MoveSelf · direction north, distance
  5`, `🔧 Generate · "a small fox"`), prose around a leaked call renders normally, and runs of ≥3
  consecutive chips collapse into an expandable `🔧 N actions ▸`. Parsing/humanizing lives in
  `src/agent-chat-format.ts` with unit tests built from live world-"main" transcripts.
- **Animated store models render as world objects.** Placing an animated asset-store model (Baby
  Wolf, Baby Fox, the rigged animals…) as a world thing left it permanently invisible while the
  same GLB worked fine as an avatar. Root cause: the world-object fit pipeline
  (`fitModelToHeight`/`placeObjectAboveGround`) measured the model with a plain
  `Box3.setFromObject`, which for a *skinned* meshopt/gltfpack "game-optimized" export sees only
  the millimeter-tiny bind-pose vertex box (the real dimensions live in the skeleton's node
  transforms / inverse bind matrices). The fit then scaled the model up 10⁴–10⁷× and "grounded" it
  hundreds of meters below the terrain — a 34 km wolf sunk out of sight. Bounds are now measured
  skinning-aware (`measureModelBounds`: refresh world + bone matrices, then three's precise
  per-vertex path, where `SkinnedMesh.getVertexPosition` applies bone transforms); the per-vertex
  walk only runs for models that actually contain skinned meshes. The collision-footprint
  calculation uses the same measurement, so animals get real obstacle radii too.
- **`window.__tellusThingsDebug()`.** New cheap diagnostics hook (mirrors `__tellusAvatarDebug`):
  per generated thing it reports status, mesh presence/visibility/scene membership, loaded-GLB
  match, swirl/instanced flags, world position + scale, clip count and whether an animation is
  playing — this is what pinned the bogus 25 000× wolf scale down.
- **Agent "(remote view)" poll gated while the agent sleeps.** The 5s `GET …/agent/view` poll ran
  whenever the viewport was on + the agent opted in but had no local avatar — including when the
  agent was fully asleep (e.g. parked in another world), spamming endless 404s. The poll now runs
  only while the server can actually hold a view (`optedIn` AND (`enabled` OR `ownerPresent`));
  when gated off the PiP shows "unavailable — agent is asleep". The 3-miss tolerance for
  transient poll failures is unchanged.

## 0.8.8
- **Avatar size slider.** The avatar picker grows a **Size** control: a logarithmic 0.1×–8× slider
  (default 1×) with a live numeric label and a Reset button. The scale is visual-only — it rescales
  the mounted avatar model (VRM/GLB and classic TV-head alike, TV + presence ring included) live
  with no rig rebuild, while physics, collision and movement stay untouched. First-person and
  agent-POV eye heights follow the scale (a giant sees from a giant's head). The pick persists in
  localStorage `tellus.avatarScale` and rides presence (`avatarScale`, server-clamped to [0.1, 8])
  so everyone sees your size; remote size changes ease in over ~0.3s.
- **Passkeys work from every hostname.** The game serves on multiple domains
  (tellus.gnostr.cloud — the passkey RP ID — and tellus.garden); adding a passkey from the latter
  failed RP-ID validation. The server now serves `/.well-known/webauthn` (WebAuthn Related Origin
  Requests; `TELLUS_WEBAUTHN_ORIGINS` env) listing both origins, and hyades 0.5.199 accepts both —
  one passkey works everywhere the game lives.

## 0.8.7 — 2026-06-11
- **Agent-POV viewport fixed on hiDPI screens.** The picture-in-picture agent view double-applied
  `devicePixelRatio` — three.js `setViewport`/`setScissor` already multiply by the pixel ratio
  internally (on both the WebGL and WebGPU backends), and the restore used `domElement.width/height`
  (physical pixels). On a 2× screen the "small PiP" was 4× too big and the restored main viewport 2×
  too big, so enabling the viewport painted the agent's first-person view over the whole screen
  (looked like being yanked into 1st person with broken physics). The PiP pass now saves the real
  viewport/scissor/scissor-test state, draws the 220×140 rect in logical pixels, and restores the
  saved state in a `finally`.
- **1st/3rd-person camera toggle.** A new toolbelt **View** (Eye) button — or the **V** key — flips
  between the classic orbit camera and a first-person camera at your avatar's head (same eye math as
  the agent POV). Drag still looks, WASD still walks, jump/collision physics are completely
  untouched (the camera is presentation-only); your own avatar + TV hide locally while first-person
  is active (other players still see you). The mode persists in localStorage `tellus.cameraMode`,
  and the agent PiP/vision capture work in both modes.
- **Panel layout: no more overlaps.** Every bottom panel now has its own anchor so any combination
  can be open at once: avatar picker = left edge, P2P = left-of-center, agent = right-of-center;
  all three are height-capped (`min(560px, 100dvh - 120px)`) with internal scroll. The login dialog
  stays a true modal (dimmed fullscreen overlay above everything, by design). The Agent and Avatar
  buttons no longer force-close each other.
- **Procedural grass/vegetation off by default.** The streamed grass/trees/rocks system is now
  gated behind localStorage `tellus.grass=1` (re-enable hatch); when off a no-op stub stands in, so
  there is zero per-frame vegetation cost.
- **Seven new VRM avatars.** Ancient Auton, Auton 2, Atlantean, Gold Atlantean 1–3 and White
  Atlantean join the picker. All seven were verified as VRM 1.0 humanoids with **no embedded
  animation clips** (despite reports of built-ins), so they animate from the standard retargeted
  VRMA set (Idle / Walking / Wave; airborne = the walk-hold leap).
- **Per-thing animations + emotes.** The selected-object HUD gains an **Animation** dropdown
  (models with embedded clips only): pick a clip to loop — it persists on the thing as `animation`,
  syncs over `generated.upsert`, and every client converges (missing clips fall back to the old
  idle-ish heuristic). Wire convention mirrors `presence.avatarId`: `""` = explicit default, absent
  = a mid-rollout server stripped the field (keep the local value — verified against the live
  server, whose echo otherwise wiped a just-picked clip). And incoming `{type:"emote", emote:{visitorId, animation}}` live frames play
  that clip **once** over the avatar's locomotion, then resume walk/idle — VRM rigs resolve against
  the VRMA set ("wave"), GLB animals against their embedded clips (Bark/Sit/…); unknown clips and
  rigless avatars are ignored. Wire shapes + validators added to `world-protocol.ts`.

## 0.8.6 — 2026-06-11
- **Remote view stops flickering.** A single failed snapshot poll no longer blanks the agent's
  "(remote view)" — the last frame stays up and failure only shows after 3 consecutive misses
  (pairs with hyades 0.5.197's fresh-capture-per-poll, which also un-freezes the picture).

## 0.8.5 — 2026-06-11
- **Avatar picker.** A new **Avatar** toolbelt button opens a picker (works anonymously — no login):
  the classic TV-head, the three rigged VRM robots (Bluebot / Blue / Blue Atlantean), and five
  **animated GLB animals** driven by their embedded clips — Shiba (Idle/Walk), Husky
  (Idle_Breathing/Run_Loop), Baby Wolf (Idle/Walk/Jump), Baby Fox (Idle/Walk/Jump) and Baby
  Reindeer (Idle/Walk/Gallop_Jump). Clip selection is heuristic (walk/run/trot → locomotion,
  idle/breath → idle, jump → airborne; emote/action clips are never picked), animals fit by height
  with grounded feet, and the same idle⇄walk state machine (speed-matched stride, jump hold) drives
  every kind. Picks persist in localStorage `tellus.avatarId`, swap your rig instantly, and ride
  `presence.update` as `avatarId` (hyades 0.5.196) so **other players see your pick** (mid-rollout
  servers that don't echo it yet just keep showing the deterministic robot). Tiles render store
  thumbnails with a colored-initial fallback; game-optimized GLBs are preferred (~25× smaller) with
  fallback to the original download.

## 0.8.4 — 2026-06-11
- **Rigged VRM robot avatars.** Players and agents now render as rigged VRM robots streamed from
  the asset store (Bluebot / Blue / Blue Atlantean — each visitor deterministically keeps the same
  robot), with retargeted VRMA **walk/idle animation** (speed-matched stride, hysteresis so remotes
  don't flicker) and a **jump hold** (mid-stride freeze while airborne; a real jump clip becomes a
  one-line `CLIP_IDS.jump` change when one lands in the store). The TV head + screen float above
  the robot's head, so **P2P video screens keep working unchanged**. The procedural TV-head robot
  remains the instant placeholder and the fallback on any load failure; set localStorage
  `tellus.classicAvatar=1` to opt out of VRM avatars entirely. Works on both WebGL and WebGPU
  (MToon materials use the node-material path under WebGPU).

## 0.8.3 — 2026-06-11
- **Logged-in world loads again** (with hyades 0.5.193's catch-all preflights). Also fixed a boot
  race where auth/status fired before the runtime config set the API base (404 on the page origin) —
  API calls now wait for config readiness.
- **Personality editing is discoverable.** The agent panel's "Memories" block is now
  **"Personality & memories"** with an always-visible **Edit personality** button (it was hidden
  behind the collapsed toggle).
- **You can see which world your agent is in** — the panel header reads "Your Agent in 'main'".
  Agents are per-world (each world keeps its own memories); the new **Set as default** button saves
  your persona as the cross-world default, so your agent in any NEW world starts with it.

## 0.8.2 — 2026-06-11
- **Fix: assets vanished (and "Add passkey" failed) while logged in.** Session-carrying calls were
  failing the CORS preflight (hyades 0.5.192 now allows the `X-Tellus-Session` header). The client
  also stops attaching the session header to the identity-free `/api/assets/*` proxy, so model and
  texture GETs stay simple requests with zero preflight overhead.

## 0.8.1 — 2026-06-11
- **NIP-05 names.** When your npub has a NIP-05 identifier (kind-0 profile claim, verified
  server-side against the domain's well-known endpoint — hyades 0.5.191), the login button and
  account panel show **✓ name@domain** instead of the raw key (`_@domain` shows as just the
  domain). npubs now display in proper `npub1…` bech32 everywhere.

## 0.8.0 — 2026-06-11
- **Login.** New Login button + dialog with three flows against the Hyades user system
  (hyades 0.5.190): **Passkey** (native WebAuthn), **Nostr extension (NIP-07)**, and **Bunker
  (NIP-46)** (nostr-tools, lazy-loaded; pairing persists for silent re-approval). One account, many
  credentials — link your npub from the account panel, add passkeys, claim your existing anonymous
  identity ("keep my existing worlds") on first login. Session = `X-Tellus-Session` bearer attached
  to all API calls; logged in, your stable userId becomes the account id.
- **Account panel & premium.** Identity + credentials + premium status; **"Get Premium — $0"**
  upsell runs the real checkout flow (instant at 0 sat; BOLT11 invoice + copy/lightning-link +
  polling when priced) — premium keeps your agent alive while you're away.
- **Agent Memories.** The agent panel's persona editor grew into a Memories block: the agent's
  durable self-section (which the agent itself now appends to via its new `Remember` tool), live
  edit history (who wrote what, you vs the agent), and editing as before.
- **Agent view that survives sleep.** When the local avatar mesh isn't available (agent asleep /
  remote), the POV picture-in-picture falls back to the server-held snapshot ("remote view",
  polled every 5s) instead of going black; status shows "sleeping (will wake)" — paired with the
  hyades-side /live keepalive that stops agents from wrongly sleeping while you're connected.

## 0.7.13 — 2026-06-11
- **Reliable textures on busy worlds.** The initial world load fired all ~120 GLB parses at once and
  KTX2 transcodes intermittently failed under that contention — a few models stayed untextured for
  the whole session. GLB loads are now gated to 5 concurrent (smoother startup, reliable transcodes),
  texture-failed models are marked instead of cached, and the world quietly **retries them** (one per
  12s sweep, max 2 attempts per model) until they render properly.

## 0.7.12 — 2026-06-11
- **`agent-view.html` — the headless eye for offline agents.** A second, MINIMAL build entry that
  renders just terrain + placed things + presence markers (no UI/React/P2P/vegetation/physics; fixed
  daylight; plain WebGL; ~2fps warm loop; HTTP state polling so it never appears as a ghost player).
  Exposes `window.agentView.captureFor(visitorId)` → JPEG of that agent's first-person view. One page
  per WORLD serves every agent in it — Hyades opens these in the shared browser-driver container so
  premium/offline agents can SEE without any player client streaming images.

## 0.7.11 — 2026-06-11
- **Agent vision — your agent can SEE now.** While your agent runs, the client renders its
  first-person view into a small offscreen target every ~12s (256×144 JPEG, ~10KB) and ships it to
  Hyades; the agent's next LLM turn attaches the image, so it reasons about what's actually in front
  of it. No headless browser anywhere — the owner's own client is the camera (and free agents only
  run while the owner is present anyway). Works on WebGPU and WebGL.
- **Fix: vegetation no longer vanishes when placing/moving items.** A GLB-decode frame hitch tanked
  the FPS sample and the quality controller crashed several tiers in under a second — outer chunks
  popped off, then slowly re-grew. Dropping a tier now requires fps < 32 sustained for 1.2s (max one
  tier per 2.5s); momentary hitches change nothing.
- **Density rebalance: range over thickness.** Tier radii unchanged (up to 136u) but grass cover is
  ~30% thinner across the board, and the terrain mesh uses a FIXED ~50K-vertex budget (224²) that
  stretches with world size instead of multiplying — bigger worlds for less GPU.

## 0.7.10 — 2026-06-11
- **Every world is now BIGGER by default: 2× radius, 4× the area** — including `main`. The name ladder
  is now: default **2×** (144 radius) · `large-*`/`big-*`/`xl-*` **3×** · `mega-*`/`giant-*` **5×** ·
  `classic-*` opts back into the original 72-radius island. Walk speed scales up (~1.45×) so it stays
  traversable; terrain renders at the full 384² density. Existing placed objects keep their absolute
  coordinates, so current builds sit in the inner region of the expanded island — fresh frontier all
  around. (Server grounding mirrors the change in Hyades 0.5.184.)

## 0.7.9 — 2026-06-11
- **Move button — no modifier needed.** The selected-object panel gains a **Move** toggle: while
  active, click or drag anywhere in the world and the object goes there (click = teleport, drag =
  carry); camera orbit pauses until you toggle it off. Works on every platform including touch.
  Ctrl/Cmd+drag still works anytime as the power shortcut.
- **~10× denser island mesh (9.4K → up to ~148K vertices).** The visual terrain now renders at 288²
  segments on WebGPU (384² on large worlds, 192² on the WebGL preview) while still sampling the same
  synced 97² sculpt grid — dramatically smoother slopes, crisper sculpt brush falloff, finer paint
  blending; zero protocol or server changes. Object dragging switched to an analytic terrain
  ray-march so the dense mesh never gets raycast per pointer move.

## 0.7.8 — 2026-06-11
- **Store animals (Baby Wolf, Baby Skunk, …) now load and animate correctly.** Two bugs: (1) Tellus
  played a model's ENTIRE animation library simultaneously — multi-clip rigs (Bark/Bite/Death/Idle/
  Jump/Rest Pose…) had every clip fighting over the same bones each frame, rendering as glitchy
  "blinking". Now exactly one sensible clip plays (prefers idle/walk loops, avoids one-shot/pose
  clips). (2) A transient texture failure during a GLB load is non-fatal, so the model went into the
  per-session cache with broken materials — every re-placement of that model stayed broken until
  reload. Texture failures are now tracked via the loader manager and such loads are NOT cached, so
  the next placement retries fresh. Store-side asset updates (e.g. fixed eye textures) already flow
  automatically — the proxy serves `cache-control: no-store`.

## 0.7.7 — 2026-06-10
- **Object drag is now Ctrl+drag (Cmd on Mac).** Plain dragging is *always* camera rotate again — no
  more fighting between orbiting and moving. **Ctrl+drag grabs any object directly** (it auto-selects
  what you grab, no pre-select needed) and carries it across the terrain. Touch keeps the previous
  rule (press the selected object to drag it), since there's no Ctrl key on a phone.

## 0.7.6 — 2026-06-10
- **Object lighting: no more "dirty" look.** Placed GLB assets are PBR materials, and the scene had no
  environment map — metallic/rough surfaces had nothing to reflect, so objects rendered muddy except
  when the sun hit them dead-on (sunrise/noon). The scene now carries a procedural sky-horizon-ground
  environment map (works on WebGPU and WebGL) whose intensity follows the day/night cycle — objects
  pick up believable ambient reflections all day and gently dim at night.
- **Drag objects to move them.** Select an object, then **press and drag it** — it follows your
  pointer across the terrain (grounded; vehicles keep their water rules), streaming its position to
  other players as it moves and settling with an authoritative publish on release. Dragging anywhere
  else still orbits the camera, so: click to select, grab to move. Works with touch. The panel nudge
  controls remain for fine adjustment.

## 0.7.5 — 2026-06-10
- **"Clean up dead references" button** (Assets → World tab). Scans every placed object for models
  that are definitively gone — failed/stripped placements from the old loader bug, store models that
  have since been deleted (404/410, probed through the proxy with bounded concurrency), and broken
  `procedural://` links — then shows a confirm with a preview list before deleting them via the normal
  tombstoned delete path. Conservative by design: network errors and 5xx count as ALIVE, so a store
  outage can never mass-delete a world. First run on the main world found 21 dead objects.

## 0.7.4 — 2026-06-10
- **Fix: TEXTURED game-optimized models (Mars etc.) failed to load.** The store's game-optimized GLBs
  compress textures to KTX2/Basis (`KHR_texture_basisu`) — untextured models (ores, flowers) only need
  meshopt and worked, but anything with textures failed to parse because no KTX2 loader was wired.
  Tellus now ships the Basis transcoder (self-hosted under `/basis/`), attaches a `KTX2Loader` to the
  GLTF pipeline, and detects the GPU's transcode targets at renderer init (WebGPU + WebGL). Failed GLB
  loads are also no longer cached for the whole session, so transient errors retry.

## 0.7.3 — 2026-06-10
- **Real 3D Asset Manager integration: search, thumbnails, the whole store.** The Assets panel's
  Search tab previously showed a fixed 24-model slice — most of the store (275+ models, including all
  the game-optimized ores) was unreachable. It's now a live, server-side browse of the store through
  the existing Hyades proxy: a **search box** (debounced, full-text), **preview thumbnails** on every
  card that has one, a **game-optimized badge**, tags, sort chips (**Newest / Popular / A–Z**), a
  result counter, and **Load more** pagination through the entire catalog. Placement still uses the
  game-optimized GLB (~80% smaller) with the original-file fallback.

## 0.7.2 — 2026-06-10
- **Agent "Thinking…" feedback.** The Your Agent status badge now shows a blue **Thinking…** state
  while the agent is mid-turn (LLM call in flight), and the chat thread shows a "💭 thinking…" line —
  so you can tell working from idle at a glance.
- **The POV viewport survives closing the panel.** The agent keeps running when you close the tab, so
  its viewport now stays on screen until you toggle it off; the chat thread also persists across
  open/close, and status keeps polling while the viewport is up.
- **Bigger default range + two more tiers.** GIGA (84u) is now the **default** on WebGPU, with TERA
  (108u) and COSMIC (136u, ~440 chunks) above it — the 30fps-floor controller climbs into them on
  sustained headroom.
- **World feel: bigger, smoother, no see-through.** Trees ~35% taller across all species, taller
  grass, bigger bushes/reeds/crystals/boulders; rocks and boulders are now smooth detail-1 spheres
  with gentle deformation (no more d20s); stones sit much deeper in the ground so slopes never open a
  see-through gap under a rock's rim.

## 0.7.1 — 2026-06-10
- **Fix: placed procedural nature rendered as a blob/swirl, then vanished.** Inbound world patches run
  every modelUrl through a legacy absolutizer (for old relative GLB paths), which mangled
  `procedural://…` into `/procedural://…` — the server's own echo of your placement then broke the
  local build path, fell into a network fetch (the `/procedural://… 500`s in the console), flagged the
  thing "failed", and published the stripped state back. Procedural URLs are now passed through
  verbatim, the loader heals any already-mangled ones, and previously-wiped placements just need
  re-placing (one tap).
- **Vegetation fills MUCH farther — 30fps floor.** Per the operator: as long as it holds 30fps, fill.
  Two new quality tiers (ULTRA 64u, **GIGA 84u** grass radius, up to ~175 active chunks), the
  controller now sheds below ~32fps and climbs on sustained 42+fps headroom, and the chunk-rebuild
  budget rises to 3/frame when fast.

## 0.7.0 — 2026-06-10
- **Scaled worlds.** Name a world `large-…` (or `big-`/`xl-`) and it's **3× the radius — 9× the
  area**; `mega-`/`giant-` is 5×/25×. The whole island scales: mountain, ridge, pond, archipelago
  ring, fog, camera, sky, minimap — and you walk ~2–3× faster so it still feels traversable. Zero
  protocol change (the terrain grid stretches; sync payloads are identical) and the Hyades terrain
  port applies the same math, so server grounding + embodied agents stay correct. The public
  **large-world** is live — pick it from the world switcher.
- **Way higher procedural limits + 10 new species.** The vegetation system now grows palms (beach),
  tall pines & birches, dead trees, bushes, ferns, **reeds along the waterline and pond shore**,
  mushrooms, rare crystal clusters on rock/snow, and walk-blocking boulders — all biome-aware. Trees
  and rocks moved to 72u **sectors** (frustum-culled, rebuilt one per frame) so huge worlds don't pay
  for off-screen forests, and a new **ULTRA quality tier** (denser, 54u grass radius) engages on
  WebGPU when the FPS has sustained headroom.
- **Place procedural nature like assets.** A new **Nature** tab in the Assets panel places any
  archetype instantly — `procedural://` model URLs ride the normal object pipeline, so they sync to
  every client, and you can move, scale, clone, **throw**, and delete them like anything else. Every
  placement rolls a fresh seed/tint variation. Zero generation cost, zero backend involvement.

## 0.6.0 — 2026-06-10
- **Procedural vegetation (Crysis-style ground cover).** The island now grows wind-swayed grass and
  flowers streamed in chunks around you, plus ~100+ procedural low-poly trees and rock scatter — all
  terrain-aware (paint kind, height, slope, water/pond exclusion) and fully deterministic, so every
  client grows the identical world with zero new protocol. Sculpting or painting the terrain re-grows
  the affected vegetation lazily. On WebGPU the grass is a TSL node material with per-blade flutter, a
  traveling gust front, **bend-away-as-you-walk-through**, and a shrink-into-the-ground distance fade;
  the WebGL fallback renders the same geometry statically. Each chunk is one merged draw call stamped
  into pre-allocated buffers (zero steady-state allocation), and an **adaptive quality controller**
  drops density/radius tiers when FPS dips and climbs back when there's headroom.
- **Physics.** (1) **Throw things**: select any placed object and press **G** (or the new Throw button)
  to hurl it where you're looking — it arcs, tumbles, bounces off terrain slopes (real surface
  normals), or splashes into water and bobs up to float; the rest pose publishes through the normal
  upsert path so every client converges, and the flight streams at ~7 Hz for spectators. Balloons are
  floaty. (2) **Jump** with Space (and fall off ledges instead of snapping down). (3) **Solid
  obstacles**: trees and large placed objects now push you out instead of being walk-through holograms.
- Debug overlay (triple-click) gains a vegetation/physics line (tier, chunks, tris, trees, bodies).

## 0.5.2 — 2026-06-10
- **Chat with your agent.** The "Your Agent" panel's read-only Dialog feed is now a two-way **Chat**: a text
  box + Send (Enter to send) posts to the new Hyades `POST /agent/say`, your line appears immediately, and the
  agent's reply arrives in the same thread via the existing transcript poll (your lines and the agent's dialog
  interleave in send/reply order; tool actions stay dimmed). Requires the agent to be started (the box is
  disabled and prompts you to start it otherwise — chatting never silently spends tokens). The thread is
  per-session (clears on panel close); the agent itself remembers the conversation in its durable thread.

## 0.5.1 — 2026-06-10
- **Fix: the agent POV viewport showed the player's sky, not the agent's.** The skybox dome, moon, and moon
  cloud-veil are repositioned every frame to follow the *player* camera, so the picture-in-picture rendered
  them locked to the player instead of the agent — the sky/moon in the PiP tracked your movement, not the
  agent's. The PiP render now shifts those camera-following celestials onto the POV camera for its draw and
  restores them immediately after (guarded so a dropped frame can't desync the moon).

## 0.5.0 — 2026-06-10
- **Agent feedback in-game: dialog feed + POV viewport.** The "Your Agent" panel now shows what your
  server-side agent is doing. A **Dialog feed** (polled on the same ~3s cadence as status) streams the
  agent's recent assistant lines and tool calls from the new Hyades transcript endpoint
  (`GET /api/world/{id}/agent/transcript`); it auto-scrolls to the newest line only when you're already at
  the bottom, so reading older lines isn't interrupted. A **Show/Hide viewport** toggle renders a 220×140
  picture-in-picture of the scene from the agent avatar's point of view (a second camera at the avatar's
  head, bottom-left, both WebGL and WebGPU). The panel gained a height cap + scroll so it never overflows on
  short viewports.

## 0.4.0 — 2026-06-10
- **P2P audio + mute/unmute.** The WebRTC mesh now captures the mic alongside 480p video (echo-cancel /
  noise-suppress / auto-gain), sends it on an audio transceiver, and accumulates a peer's audio+video into
  one remote stream. Two new P2P-panel controls: **🔊 Listen** (hear other players — off by default since
  browsers block autoplay audio without a gesture) and **🎤 Mic** (mute/unmute your own mic while TX is on).
- **Fix: the P2P and "Your Agent" panels no longer overlap** — they now sit side-by-side (P2P just left of
  center, agent just right) instead of both centered on top of each other.

## 0.3.0 — 2026-06-10
- **Removed the in-browser AI (per-user embodied agents, Roll 3).** The legacy browser-run NPCs
  (johnny/mira/sol) and their whole subsystem are gone — the autonomous decision loop, agent meshes, the
  agent-vision world-feedback loop, the AI tool panel + World Chat panel, and the server routes `api/chat.ts`
  + `api/world-feedback.ts`. Players now run their own server-side agent via the "Your Agent" panel (0.2.0);
  the browser no longer runs AI or spends tokens. Net −1,846 lines (`tellus-agent-llm.ts` deleted); the
  bundle shrank ~25 KB. All non-AI features (presence/avatars, `/live`, terrain, generation, asset library,
  P2P video, debug overlay, world switching, the external `window.tellusAgent` driver hook) are untouched.

## 0.2.0 — 2026-06-10
- **"Your Agent" panel (per-user embodied agents, Roll 2).** A new toolbelt panel lets each player run their
  own in-cluster Hyades agent instead of the shared browser NPCs: **Start my agent** / **Stop** (opt-in, no
  auto-spend), a status badge (Stopped / Running / **Sleeping** — it sleeps when you leave, unless you're
  premium), a **Premium** chip, a persona editor (saved to the agent), and a tokens-used / daily-budget
  line. The agent renders through the existing remote-presence path (robot/TV-head) and acts in the world
  over `/live` — the browser no longer runs it. New `tellusAgentUrl()` helper + the `/api/world/{id}/agent/*`
  endpoints. (The legacy browser NPCs johnny/mira/sol still run this release; their removal is Roll 3.)

## 0.1.x — 2026-06-09/10
- **gnostr-cloud CI/CD (tag-to-publish).** A `v*` git tag on the gnostr-cloud `master` builds the multi-arch
  image and rolls the live k3s deployment automatically (`.gnostr-cloud-ci.yml` + `deploy/build-push.sh`).
- **P2P video (robot / TV-head avatars).** WebRTC full-mesh (`src/webrtc-mesh.ts`): RX-on/TX-off default,
  480p, 16-stream cap, perfect negotiation; signaling rides the world `/live` socket. P2P panel + self-view
  + a triple-click debug overlay.
- **Game-optimized assets.** Library models load `/api/assets/model/{id}/game-optimized` (meshopt, ~80%
  smaller, same quality).
- **Private/public worlds** bound to a soft user identity; **world switching** (list / switch / create).
- **Hyades-backed world + generation.** The world state, 3D generation, LLM, and vision all run in the
  Hyades cluster (`worldApiBase` → `hyades.gnostr.cloud`), replacing the Cloudflare Durable Object + the
  in-browser provider wiring. Integrated asset-library proxy with public fail-over.
- **Refactor.** Split the 9.2k-line `src/main.tsx` into a clean dependency-DAG of modules
  (`tellus-types`/`constants`/`utils`/`runtime-config`/`urls-identity`/`terrain`/`generation-client`/
  `scene-builders`/`agent-llm`, plus `world-builders`/`webrtc-mesh`).
- Performance: GLB no longer re-downloads on move/rescale; flag-gated static-duplicate instancing; a Clone
  button; in-browser AI defaults OFF.
