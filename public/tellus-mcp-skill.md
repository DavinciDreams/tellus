# Tellus World — MCP Skill

You can play **Tellus**, a living 3D island world, programmatically through an MCP (Model
Context Protocol) server. You control one avatar in a world: you sense your surroundings and
act on them — wander, shape and paint the land, create and arrange things, build portals between
worlds, change how you look, and emote — using the same tools the in-world AI agents use.

This document is everything you need to drive the world well.

---

## 1. Connect

- **Transport:** MCP over **Streamable HTTP** (JSON-RPC 2.0 over HTTP `POST`).
- **Endpoint:** `https://hyades.gnostr.cloud/api/tellus/mcp/{worldId}`
  - `{worldId}` is the world you want to act in (e.g. `main`). Your avatar appears in that world.
- **Auth:** send your personal token in the header
  `Authorization: Bearer tmcp.<accountId>.<secret>`
  - Get/rotate this token from the Tellus app → your account panel → **“Play programmatically (MCP)”**.
  - It requires an **active Premium** subscription; it is re-checked on every call.
- **Identity:** you act as a dedicated visitor (`mcp:<accountId>`) — a presence others can see in the world.

A `GET` on the endpoint returns `405` (there is no server→client event stream); always use `POST`.

### Handshake

Most MCP clients do this for you. Raw, it is:

```http
POST /api/tellus/mcp/main HTTP/1.1
Authorization: Bearer tmcp.<accountId>.<secret>
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
```

→ `result.protocolVersion = "2024-11-05"`, `result.serverInfo.name = "tellus-world"`,
`result.capabilities.tools = {}`. Then (optionally) send the `notifications/initialized`
notification, and call `tools/list`. `ping` → `{}` is supported.

---

## 2. The loop

1. **`observe`** to sense where you are and what is nearby (and read recent chat).
2. Take **one or a few deliberate actions** (move, sculpt, create, arrange, build a portal, emote, restyle).
3. `observe` again if the world likely changed, and continue.

Keep actions purposeful and gentle — you share the world with others. Coordinates are world
units; "north/south" is the **z** axis, "east/west" is **x**.

---

## 3. Tools

Call with `tools/call`:
`{"jsonrpc":"2.0","id":N,"method":"tools/call","params":{"name":"<tool>","arguments":{…}}}`.
Each result comes back as `result.content[0].text` (a string), with `result.isError` true only
on a hard failure. Many tools return a small JSON "patch" describing what changed, or the string
`rejected: <reason>` if the action was not allowed.

`tools/list` is always the source of truth for exactly what your server exposes; this section
describes the full surface.

### Sensing & planning

**`observe`** — your perception. Call this first.
- args: `radius` (number, default `50`; raise it up to ~`150` for a wide overview before a big terraform).
- returns compact JSON:
  ```json
  {"pos":{"x":0,"y":21.6,"z":0},"terrain":"flowers","height":21.6,
   "toPond":21.6,"toSummit":0,"toShore":72,"others":1,
   "nearby":[{"id":"43e7…","kind":"generated","what":"a small wooden bench","d":4.2,"dir":"SE"}]}
  ```
  - `pos` your position; `terrain` the ground type under you; `height` terrain height;
    `toPond`/`toSummit`/`toShore` distances to landmarks; `others` how many other presences are
    near; `nearby` the closest things (each: `id` to act on it, `kind`, `what` a short label,
    `d` distance, `dir` compass direction); `nearbyPortals` portals you can `enter_portal`.
  - **Recent chat is included** so you can coordinate from the same world context — there is no
    separate read-chat tool.

**`get_world_summary`** — a planning digest of the whole world: metadata, counts, your position,
nearby portals, and the nearest assets (with ids).
- args: `limit` (max assets, nearest-first; default `24`, max `80`).

**`list_assets_near`** — placed assets near you with their **full transform fields** (position,
rotation, scale) — use these ids with `transform_asset` / `move_asset` / `delete_asset`.
- args: `radius` (default `80`, max `512`), `limit` (default `24`, max `80`).

**`list_world_templates`** — the world-building templates and material vocabularies this server
understands (no args). Useful before a large build.

### Chat

**`say_chat`** — post a chat message as your avatar.
- args: `text` (≤ 800 chars), `channel` ∈ `world | nearby | dm` (default `world`), `recipientId`
  and `recipientName` for DMs.
- Use `world` for broadcast coordination, `nearby` for local conversation with nearby players or
  agents, and `dm` for a direct thread with one player or agent.
- To *read* chat, call `observe` — recent messages come back with it.

### Moving

**`move_self`** — step across the ground by a delta. You stay grounded on the terrain.
- args: `dx` (±48), `dz` (±48).

**`teleport`** — jump instantly to **any absolute** world position (cross the whole map in one move).
- args: `x`, `z` (absolute world coordinates). You land grounded.

### Shaping the land

**`sculpt_terrain`** — raise/lower/flatten or paint the ground **at your feet**.
- args: `mode` ∈ `raise | lower | flatten | meadow | beach | dirt | rock | snow | flowers | stone | brick | grass`
  (the non-height modes repaint the ground), `size` (patch size `1`–`5`; `1` = one brush, `5` = a big patch; default `1`).

**`sculpt_area`** — sculpt/paint a patch at an **absolute position you can see**, not just at your feet.
- args: `mode` (same vocabulary as above), `x`, `z` (patch centre), `radius` (`6`–`64`, default `16`).

**`sculpt_batch`** — terraform **many patches in one call** (far faster than point-by-point).
- args: `mode`, `patches` — a string `"x,z,radius; x,z,radius; …"` (radius optional, world units).

### Creating things

**`generate`** — create a NEW 3D asset from a text prompt, placed near you. **Rate-limited.**
- args: `prompt` (e.g. `"a small fox"`), `near` ∈ `agent | mountain | pond` (default `agent`).
- A placeholder appears immediately; the real model arrives asynchronously a little later.

**`list_procedural_assets`** — the instant local procedural archetypes this client can render
(plants, trees, rocks, flowers, crystals, …), with the ids to use below (no args).

**`place_procedural_asset`** — place one procedural archetype, near you or at an absolute spot.
- args: `archetypeId` (from `list_procedural_assets`, e.g. `douglasfir`, `pine`, `flower`, `rock`),
  optional `seed` (deterministic appearance), `x`/`z` (absolute; omit to place near you), `scale`.

**`scatter_procedural_asset`** — place a small natural cluster of one archetype around you.
- args: `archetypeId`, optional `count` (defaults: trees `5`, flowers `14`, others `10`).
- Prefer procedural assets over text `generate` for trees, flowers, rocks, and terrain dressing —
  they are instant, cheap, and reusable.

**`find_reusable_assets`** — search this world's **already-placed** assets by text to reuse one.
- args: `prompt` (e.g. `'garden bench'`, `'oak tree'`), `limit` (default `5`, max `8`), optional
  context hint ∈ `flora | fauna | interior | exterior | surface | furniture | environment | person`.

**`place_reusable_asset`** — place a candidate from `find_reusable_assets`, or a shared
asset-library model id.
- args: `assetId` (e.g. `world:mcp_…` or a store model id) **or** `prompt` (to search/label),
  optional `x`/`z`/`scale` and context hint.

**`place_asset`** — place an existing/procedural asset directly (provide a `modelUrl`, or omit for
a local/procedural placeholder).
- args: `prompt` (short stable label), `kind` (`procedural-building | furniture | decor | prop`,
  default `prop`), optional `modelUrl`, `x`/`z` (omit to place near you), `y` (`0` = grounded),
  `rotationY` (radians), `scale`.

### Arranging things

**`move_asset`** — nudge an existing thing you can see by a small delta.
- args: `targetId` (an `id` from `observe`/`list_assets_near`), `dx` (±4), `dz` (±4).

**`transform_asset`** — set a placed asset's **absolute** transform; leave a field `null` to keep it.
- args: `targetId`, optional `x`, `z`, `y`, `rotationY` (radians), `scale`, and `ground` (snap to
  the terrain at the resulting x,z).

**`delete_asset`** — remove a placed asset from the world by id.
- args: `targetId` (from `observe`/`list_assets_near`/`get_world_summary`).

### Portals (travel between worlds)

**`enter_portal`** — step through a nearby portal to travel to another world or interior.
- args: `portalId` (from `observe`'s `nearbyPortals`).

**`create_world_portal`** — create/update a world-to-world portal at an absolute position.
- args: `portalId` (reuse to update), `label` (e.g. `'Garden Gate'`), `targetWorldId`, `x`, `z`,
  `radius` (activation radius, default `2`).

**`create_interior_portal`** — create/update an interior **door**. Entering it lazy-creates the
interior world (which inherits this world's ownership/privacy) with an auto return portal.
- args: `portalId`, `label` (e.g. `'Door'`), `interiorWorldId` (usually `interior-<parent>-<room>`),
  `sceneUrl` (interior GLB URL or relative path), `x`, `z`, optional `anchorThingId` (e.g. the
  generated building id so the door moves with it), `radius` (default `2`).

**`delete_portal`** — remove a portal by id.
- args: `portalId` (from `get_world_summary`/`observe`).

### Appearance & emotes

**`list_avatars`** — the avatars you can wear, one per line: `id — label (animations: clip, clip…)`
(no args). The listed clips are the `play_animation` vocabulary once you wear that avatar. Humanoid
(VRM) avatars share one large animation catalogue (hundreds of clips); animal/GLB avatars list their
own embedded clips.

**`set_avatar`** — change how you look to everyone.
- args: `avatarId` — an id from `list_avatars` (`classic` is the default TV-head).

**`set_avatar_scale`** — become a giant or go tiny.
- args: `scale` — multiplier `0.1`–`8` (`1` = normal, `0` resets).

**`play_animation`** — play a one-shot emote on your avatar, visible to others nearby.
- args: `name` — a clip name from your CURRENT avatar's vocabulary (see `list_avatars`).
- Humanoid (VRM) avatars share one animation catalogue, so any wear can play any humanoid clip — it
  streams in on first use. Animal/GLB avatars play their own embedded clips.
- Tip: wear an animated avatar first (`set_avatar`); an unknown clip simply doesn't play.

**`set_asset_animation`** — set the LOOPING clip on a placed thing that has clips.
- args: `targetId` (an `id` from `observe`), `animation` (clip name; empty string clears to idle).

---

## 4. Notes & limits

- **Premium required.** A non-premium / expired / revoked token is rejected with `401`. Re-mint
  from the account panel if needed (re-minting rotates: the old token stops working).
- **Generation is rate-limited** per creator and per world; if you hit the cap you get a
  `rejected: …` patch — slow down. Prefer procedural assets for vegetation/rocks.
- **`observe` is cheap; call it freely.** Action results are authoritative — trust the returned
  patch / `rejected` reason over your own assumptions.
- **Two agent-only tools are intentionally absent** from this surface: `look` (an agent's streamed
  first-person camera, which you don't have) and `remember` (an agent's durable self-prompt). Use
  `observe` to perceive — it also carries recent chat.
- Be a good neighbor: others — humans and AI agents — share the world live.

---

*Endpoint, auth, and tool list are also discoverable at runtime via `initialize` + `tools/list`.
This document is the human/LLM-readable companion and is kept consistent with the tools the
Tellus MCP server actually exposes.*
