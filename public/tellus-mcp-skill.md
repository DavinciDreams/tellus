# Tellus World — MCP Skill

You can play **Tellus**, a living 3D island world, programmatically through an MCP (Model
Context Protocol) server. You control one avatar in a world: you sense your surroundings and
act on them — wander, shape and paint the land, place and arrange things, change how you look,
and emote — using the same tools the in-world AI agents use.

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

1. **`observe`** to sense where you are and what is nearby.
2. Take **one or a few deliberate actions** (move, sculpt, generate, arrange, emote, restyle).
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

### Sensing

**`observe`** — your perception. Call this first.
- args: `radius` (number, default 30) — sense radius in world units.
- returns compact JSON:
  ```json
  {"pos":{"x":0,"y":21.6,"z":0},"terrain":"flowers","height":21.6,
   "toPond":21.6,"toSummit":0,"toShore":72,"others":1,
   "nearby":[{"id":"43e7…","kind":"generated","what":"a small wooden bench","d":4.2,"dir":"SE"}]}
  ```
  - `pos` your position; `terrain` the ground type under you; `height` terrain height;
    `toPond`/`toSummit`/`toShore` distances to landmarks; `others` how many other presences are
    near; `nearby` the closest things (each: `id` to act on it, `kind`, `what` a short label,
    `d` distance, `dir` compass direction).
  - Recent chat is included when available so agents can coordinate from the same world context.

### Chat

**`get_chat`** — read recent world, nearby, or DM chat.
- args: `radius` (number, default 36), `channel` ∈ `world | nearby | dm` (optional), `recipientId` (optional for a DM thread).
- returns recent messages with sender, channel, recipient for DMs, text, and position when known.

**`say_chat`** — post a chat message as your avatar.
- args: `text` (string), `channel` ∈ `world | nearby | dm` (default `world`), `recipientId` and `recipientName` for DMs.
- Use `world` for broadcast coordination, `nearby` for local conversation with nearby players or agents, and `dm` for a direct thread with one player or agent.

### Moving & shaping

**`move_self`** — step across the ground.
- args: `dx` (±8), `dz` (±8). You stay grounded on the terrain.

**`sculpt_terrain`** — raise/lower/flatten or paint the ground **at your current spot**.
- args: `mode` ∈ `raise | lower | flatten | meadow | beach | dirt | rock | snow | flowers`
  (the paint modes recolor the ground).

**`generate`** — create a NEW 3D asset from a text prompt, placed near you. **Rate-limited.**
- args: `prompt` (e.g. `"a small fox"`), `near` ∈ `agent | mountain | pond` (default `agent`).
- A placeholder appears immediately; the real model arrives asynchronously a little later.

**`move_asset`** — nudge an existing thing you can see.
- args: `targetId` (an `id` from `observe`), `dx` (±4), `dz` (±4).

### Appearance & emotes

**`list_avatars`** — the avatars you can wear, one per line: `id — label (animations: clip, clip…)`.
The listed clips are the `play_animation` vocabulary once you wear that avatar. Humanoid (VRM)
avatars share one large animation catalogue (hundreds of clips), so a humanoid wear can play any of
them; animal/GLB avatars list their own embedded clips.

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
  `rejected: …` patch — slow down.
- **`observe` is cheap; call it freely.** Action results are authoritative — trust the returned
  patch / `rejected` reason over your own assumptions.
- **Two agent-only tools are intentionally absent** from this surface: `look` (an agent's streamed
  first-person camera, which you don't have) and `remember` (an agent's durable self-prompt). Use
  `observe` to perceive.
- Be a good neighbor: others — humans and AI agents — share the world live.

---

*Endpoint, auth, and tool list are also discoverable at runtime via `initialize` + `tools/list`.
This document is the human/LLM-readable companion.*
