# TellusWorldState — Hyades Module Spec

**Status (2026-07): historical migration specification; the Hyades
authoritative-world migration and server-side embodied-agent direction are
implemented.** Wire-contract rationale remains useful, but old Cloudflare,
browser-autonomy, `/api/chat`, and `world-feedback` migration notes are not a
description of the current client. Use `README.md`, `src/tellus-world-client.ts`,
`src/tellus-maker-agents.ts`, and the live Hyades contract for current behavior.
**Owner (client side):** Tellus
**Target runtime:** Hyades Orleans cluster (.NET) + ASP.NET Core edge gateway
**Audience:** Hyades engineers implementing the durable world-state service and the in-cluster game agent

---

## 1. Goal

Replace the current Tellus multiplayer backend — a Cloudflare Durable Object (`cloudflare/world-worker.ts`) backed by a Flask/Postgres key/value endpoint — with a first-class Hyades module: **`TellusWorldState`**, implemented as an Orleans grain cluster, plus an **in-cluster game agent** that plays the world as a server-side actor instead of a headless browser tab.

This module owns three things:

1. **Authoritative shared world state** — terrain, placed/generated assets, presence — per `worldId`.
2. **Realtime fan-out** — browser clients connect over WebSocket, receive a snapshot, then a stream of patches.
3. **The game agent** — the autonomous "player" runs as a grain inside the cluster, taking the same in-world actions a human visitor takes.

The existing Tellus browser client must keep working with **minimal changes**. Section 5 (wire protocol) is the hard compatibility contract; Sections 6–10 are the server design and are Hyades' to shape.

---

## 2. Why Orleans is the right fit (and what it fixes)

The current Durable Object is effectively a hand-rolled virtual actor keyed by `worldId` (`idFromName("main")`). Orleans gives us that for free, plus fixes the bugs the DO has accumulated:

| Current DO problem | Orleans grain behaviour that fixes it |
|---|---|
| `applyAction` is `async` and interleaves at `await` points → races; recent "harden persistence" patch added a GET-before-PUT read-modify-write that doubles backend traffic and still has a TOCTOU window | A grain processes one turn at a time (single-threaded per activation). All mutations are serialized for free; no read-modify-write dance needed. |
| Persistence flag (`externalPersistenceAvailable`) could latch off and silently drop all writes (now removed, but the architecture still depends on an external HTTP store) | Grain state is the authoritative store via `IPersistentState<T>`; the grain holds state in memory and writes through to durable storage. No external round-trip per edit. |
| Whole-snapshot `terrain.replace` is last-write-wins; concurrent editors clobber each other | Grain applies **incremental** terrain ops (`terrain.sculpt`) against authoritative state and broadcasts deltas (Section 7). `terrain.replace` is demoted to import/reset only. |
| `generation.request` enqueues to a Cloudflare Queue with **no consumer** — a dead path | A `TellusGenerationGrain` (or the cluster's existing generation service) is the consumer; results stream back as patches (Section 8). |
| Generated-asset placement and generation-status share one `generated.upsert` channel → endless "pending overwrites ready" churn (4+ patches fighting it) | Split into `generated.place` (geometry/ownership) and `generation.update` (status/modelUrl), reconciled by the grain (Section 7). |
| Deleted assets resurrect on out-of-order upsert (no tombstones) | Grain keeps delete tombstones with timestamps and rejects stale upserts (Section 7). |

---

## 3. Topology

```
 Browser client (src/main.tsx, unchanged protocol)
        │  HTTPS GET /state,  POST /action
        │  WSS  /live?visitorId=…
        ▼
 ┌─────────────────────────────────────────────┐
 │  Tellus Edge Gateway  (ASP.NET Core / Kestrel)│   ← holds WebSockets, terminates TLS
 │  - REST: GET state, POST action               │
 │  - WS:  /live  (one socket per visitor)       │
 │  - subscribes to per-world Orleans Stream     │
 └───────────────┬───────────────────────────────┘
                 │ Orleans client calls / stream subscription
                 ▼
 ┌─────────────────────────────────────────────┐
 │            Orleans Cluster (Hyades)           │
 │                                               │
 │  ITellusWorldGrain   key = worldId            │  ← authoritative state + fan-out
 │  ITellusAgentGrain   key = worldId/agentId    │  ← in-cluster game player
 │  ITellusGenerationGrain key = jobId           │  ← drives image→3D pipeline
 │                                               │
 │  Grain persistence  →  Postgres (ADO.NET)     │
 │  Orleans Streams    →  world.{worldId} topic  │
 └─────────────────────────────────────────────┘
                 │
                 ▼  (reuse existing Hyades modules)
   Image-gen / 3D-gen / chat / TTS / ASR modules
```

The grain **cannot** hold a browser WebSocket directly. The **Edge Gateway** is required: it holds the socket, relays inbound client actions to `ITellusWorldGrain`, and forwards outbound patches it receives from the per-world Orleans Stream to the sockets it locally owns. Multiple gateway instances each subscribe to the same stream, so fan-out works across a horizontally-scaled edge.

---

## 4. Grain catalog

### 4.1 `ITellusWorldGrain` (key: `worldId` string)

The authoritative world. One activation per world. Replaces `TellusWorld` DO.

```csharp
public interface ITellusWorldGrain : IGrainWithStringKey
{
    // Read
    Task<WorldSnapshot> GetSnapshot();

    // Mutations — every method returns the patch that should be broadcast.
    // The grain also publishes the patch to the world's Orleans Stream itself,
    // so callers that are NOT the originating gateway still get it.
    Task<WorldPatch> ApplyAction(WorldAction action, ActorContext actor);

    // Presence lifecycle (called by the gateway on socket open/close + heartbeats)
    Task<WorldPatch> Join(string visitorId, PresenceInfo info);
    Task<WorldPatch> Heartbeat(string visitorId, PresenceInfo info);
    Task<WorldPatch> Leave(string visitorId);
}
```

- **Persistence:** `IPersistentState<TellusWorldDoc>` (Section 6). Write-through on every state-changing action, debounced (e.g. coalesce writes within ~250 ms) to bound storage IO. Presence is **never** persisted.
- **Streaming:** on activation, the grain obtains the stream `world.{worldId}` and publishes every `WorldPatch` to it. Subscribers = edge gateways.
- **Timers/Reminders:** a periodic timer prunes presence past TTL (Section 7.3) and emits `presence.updated`. Use a grain timer (cheap, in-memory) for presence; reminders are unnecessary unless we want the world to wake itself.
- **Idle deactivation:** safe — state is durable. On reactivation the grain rehydrates from `IPersistentState` (no empty-world risk like the DO had).

### 4.2 `ITellusAgentGrain` (key: `{worldId}/{agentId}`)

The game agent, in-cluster. Replaces the browser-driven autonomous agent / headless sidecar.

```csharp
public interface ITellusAgentGrain : IGrainWithStringKey
{
    Task Enable(AgentConfig config);   // register + join world as a stable visitor
    Task Disable();                    // leave world, stop deciding
    Task SetPaused(bool paused);       // honor the world "pause AI" control
    Task Tick();                       // one decision cycle (driven by a reminder)
}
```

Behaviour per tick (mirrors the existing client agent loop, see Section 9):

1. Pull observation from `ITellusWorldGrain.GetSnapshot()` (or maintain a local view via stream subscription).
2. Ask the Hyades **chat module** for the next decision (verb + args), using the same decision vocabulary the browser agent exposes (Section 9.1).
3. Dispatch the decision as one or more `WorldAction`s via `ITellusWorldGrain.ApplyAction(..., actor: {kind: "agent", id: agentId})`.
4. Respect pause, enablement, and **generation rate limits / backpressure** (autonomous generation was just disabled client-side specifically because it flooded the world — the grain must rate-limit, not spam).

The agent joins presence with a **stable `visitorId`** (e.g. `agent:{agentId}`) so it appears as a distinct, persistent participant — matching the existing `window.__hyadesIdentity.visitorId` convention.

### 4.3 `ITellusGenerationGrain` (key: `jobId`)

Consumes `generation.request`, drives the image→3D pipeline (reuse Hyades image-gen + 3D-gen modules), and reports progress back to the world grain as `generation.update` patches. This closes the dead-queue gap. Detail in Section 8.

---

## 5. Wire protocol (HARD compatibility contract)

The browser client already speaks this. The source of truth for the JSON shapes is `src/world-protocol.ts` (reproduced in Appendix A). The gateway MUST honor the v1 surface below verbatim. v2 additions are marked and require coordinated client changes.

### 5.1 Endpoints

Base path is configurable on the client via `worldApiBase` (runtime config) and `worldId`. The client builds (`src/main.tsx:1395`, `:1452`):

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/world/:worldId/state` | Returns a `world.snapshot` patch (full state). |
| `POST` | `/api/world/:worldId/action` | Body is one `WorldAction`. Returns the resulting `WorldPatch`. Used as the fallback path when the socket is not open. |
| `WS`   | `/api/world/:worldId/live?visitorId=…` | On connect, server sends one `world.snapshot`. Thereafter server streams `WorldPatch` messages; client sends `WorldAction` messages. |

Also proxied by the current worker and still expected by the client asset library (`src/main.tsx:1403`):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/assets/models?page&per_page&search&user_only` | List asset-library models. |
| `GET` | `/api/assets/download/:id` | Stream a model GLB. |
| `GET` | `/api/assets/view/:id` | **v2 — ADD THIS.** The 3D-gen upload returns `modelUrl: /api/view/{id}`, which the current worker does **not** proxy → broken asset loads. The gateway must proxy `view` too (or normalize all `modelUrl`s to `download`). See Section 7.4. |

CORS: allow the Tellus origin(s). The current worker uses `Access-Control-Allow-Origin: *`; tighten to an allowlist in production.

### 5.2 `WorldAction` (client → server)

All carry `visitorId`. v1 set the gateway MUST accept:

```jsonc
{ "type": "presence.update", "visitorId": "v1", "name": "Jo", "position": {"x":0,"y":0,"z":0} }
{ "type": "terrain.replace", "visitorId": "v1", "terrain": { /* TellusTerrainState */ } }
{ "type": "generation.request", "visitorId": "v1", "request": { "prompt": "a fox", "creatorId": "v1", "location": "near-agent", "scale": 1 } }
{ "type": "generated.upsert", "visitorId": "v1", "thing": { /* WorldGeneratedThing */ } }
{ "type": "generated.delete", "visitorId": "v1", "id": "thing-id" }
```

**v2 additions (require client change; recommended):**

```jsonc
// Incremental terrain edit — replaces whole-snapshot terrain.replace as the live write path.
{ "type": "terrain.sculpt", "visitorId": "v1", "mode": "raise|lower|flatten|meadow|rock|snow|beach|dirt|flowers",
  "center": {"x":0,"y":0,"z":0}, "islandSeed": 12345 /* optional, for distant islands */ }

// Split generated.upsert into two intents:
{ "type": "generated.place",  "visitorId": "v1", "thing": { /* placement fields only */ } }
{ "type": "generation.update","visitorId": "v1", "id": "thing-id",
  "generationStatus": "queued|generating|ready|failed", "modelUrl": "…", "pipelineId": "…" }
```

> `terrain.sculpt` is **already declared** in `world-protocol.ts` but the DO rejects it (`world-worker.ts:413`). Implementing it server-authoritatively is the real fix for concurrent-editor clobber. Until the client emits it, keep `terrain.replace` working with the revision/edit guards in Section 7.1.

### 5.3 `WorldPatch` (server → client)

The gateway MUST emit these shapes (client parsers at `src/main.tsx:1564`, `:1578`, `:1597`):

```jsonc
{ "type": "world.snapshot", "worldId": "main", "terrain": {…}, "presence": [WorldPresence],
  "generated": [WorldGeneratedThing], "queuedGenerationJobs": [QueuedGenerationJob] }
{ "type": "presence.updated", "presence": [WorldPresence] }
{ "type": "terrain.updated", "terrain": {…}, "actorId": "v1" }
{ "type": "generation.queued", "job": { /* QueuedGenerationJob */ } }
{ "type": "generated.updated", "thing": { /* WorldGeneratedThing */ }, "actorId": "v1" }
{ "type": "generated.deleted", "id": "thing-id", "actorId": "v1" }
{ "type": "action.rejected", "actionType": "terrain.replace", "reason": "…" }
```

The client only acts on the patch types it recognizes and ignores the rest, so additive patch types are safe.

### 5.4 Connection lifecycle (must match client expectations)

- On WS connect the server sends exactly one `world.snapshot` first (`src/main.tsx` expects state immediately).
- The client reconnects automatically with a 2.5 s delay on socket close (`src/main.tsx:3948`). The gateway should tolerate frequent reconnects (snapshot on every connect must be cheap — serve from grain memory).
- `visitorId` is supplied by the client as a query param and may be host-pinned (`window.__hyadesIdentity.visitorId`). Treat it as the presence key; do not reassign it.
- The client echoes its own actions optimistically and also receives the broadcast; mutations must be **idempotent / self-consistent** when the originator re-applies them (`actorId` lets the client know who caused it).

---

## 6. Persistent state model

Grain state document persisted via `IPersistentState<TellusWorldDoc>`. Mirrors the existing `PersistedWorldState` (`world-worker.ts:61`) and the documented Postgres shape (`docs/tellus-flask-postgres-world-state.md`) so existing data can be migrated.

```csharp
public sealed class TellusWorldDoc
{
    public int Version { get; set; } = 1;
    public string WorldId { get; set; } = "main";
    public string? Name { get; set; }
    public string? Description { get; set; }
    public bool IsPublic { get; set; }
    public OwnerRef? Owner { get; set; }            // { id, username }
    public TerrainState Terrain { get; set; } = TerrainState.Default();
    public Dictionary<string, GeneratedThing> Generated { get; set; } = new();   // keyed by thing.id
    public Dictionary<string, Tombstone> Tombstones { get; set; } = new();       // keyed by thing.id (v2)
    public Dictionary<string, GenerationJob> QueuedGenerationJobs { get; set; } = new();
    public DateTimeOffset SavedAt { get; set; }
}

public sealed class TerrainState
{
    public int Version { get; set; } = 2;
    public int Revision { get; set; }                       // monotonic; bump on every applied edit
    public float[] TerrainSculptOffsets { get; set; } = [];  // flat grid, see TERRAIN_VERTEX_COUNT
    public int[]   TerrainPaint { get; set; } = [];          // paint kind codes
    public Dictionary<string, float[]> DistantIslandSculptOffsets { get; set; } = new(); // key = island seed
    public Dictionary<string, int[]>   DistantIslandPaint { get; set; } = new();
    public DateTimeOffset SavedAt { get; set; }
}
```

Notes:
- Store `Generated` as a **map keyed by id** (the DO/client treat it as a list but reconcile by id; a map removes O(n) scans and makes tombstone checks trivial).
- **Relational projection (optional but recommended):** keep the Orleans grain-storage blob as the source of truth, and project `worldId, name, is_public, owner_id, saved_at` into an indexed table for the `GET /api/tellus/worlds` listing/search (the Flask doc already defines this surface).
- Grid sizes are fixed by the client: `TERRAIN_SEGMENTS = 96` → `TERRAIN_VERTEX_COUNT = 97`, so `terrainSculptOffsets.length == 97*97 == 9409`. Distant islands use `DISTANT_TERRAIN_SEGMENTS = 32` → 33×33. The server should validate array lengths and clamp values to the client's ranges (offsets ∈ [-9, 9]; paint ∈ [0, paintKindCount]) — see `applyTellusTerrainState` (`src/main.tsx:1497`).

---

## 7. Consistency & conflict rules

### 7.1 Terrain — `terrain.replace` (v1, transitional)

Apply the same guards the hardened DO now uses (`world-worker.ts:104`), enforced atomically inside the grain turn:

- Reject (`action.rejected`) if `incoming.revision < stored.revision`.
- Reject if `stored` has edits and `incoming` is empty (`terrainHasEdits` check).
- Otherwise accept; set `revision = max(stored.revision + 1, incoming.revision)`, `savedAt = now`, persist, broadcast `terrain.updated`.

### 7.2 Terrain — `terrain.sculpt` (v2, target design)

Server-authoritative incremental edits eliminate whole-grid clobber:

- The grain applies the brush op (raise/lower/flatten/paint) to authoritative `Terrain` using the **same math as the client** (`sculptTerrainAt`, `src/main.tsx:3962`: radius `TERRAIN_SCULPT_RADIUS = 6.2`, step `TERRAIN_SCULPT_STEP = 0.72`). Mode maps to either an offset delta or a paint-kind write.
- Bump `revision`, persist, broadcast `terrain.updated` with the **new authoritative terrain** (or, optimization, a compact delta patch — but the client currently consumes full terrain, so send full until the client supports deltas).
- Because each sculpt is a small commutative-ish delta applied in grain-serialized order, two editors no longer overwrite each other's whole grid.

> Porting the brush math to C# is the main net-new work here. Keep the client's `sculptTerrainAt` as the reference implementation; consider a shared test vector set so client and server agree bit-for-bit.

### 7.3 Presence

- TTL = 90 s (matches `presenceTtlMs`, `world-worker.ts:29`). Prune on a grain timer and on each action; emit `presence.updated` when the set changes.
- Never persist presence. On grain reactivation presence starts empty and repopulates as clients reconnect.
- Presence key = `visitorId`. Store `{ visitorId, name?, position?, connectedAt, lastSeenAt }`.

### 7.4 Generated assets

- **Reconcile by `thing.id`.** `generated.place` updates geometry/ownership; `generation.update` updates `generationStatus`/`modelUrl`/`pipelineId`. A pending `generation.update` (no `modelUrl`) MUST NOT clobber an already-resolved `modelUrl` — port the `mergeGeneratedThing` rule (`world-worker.ts:39`) and the client's `applyGenerationState` (`src/main.tsx:4198`): a resolved thing wins over an incoming pending one.
- **Persist immutable asset identity:** when a placed thing comes from the 3D Asset Manager, include `assetStoreModelId` on `WorldGeneratedThing` and preserve it unchanged through Hyades / gnostr proxy reads, writes, snapshots, patches, and imports. `assetStoreModelId` is the canonical model id from the asset store; `modelUrl` is only a cached fetch hint and may be regenerated if route shape, title, metadata, optimization state, or proxy origin changes.
- **Tombstones:** on `generated.delete`, record `Tombstones[id] = { deletedAt }` and drop from `Generated`. Reject any later `generated.place` / `upsert` for `id` whose `updatedAt <= deletedAt`. Expire tombstones after a safe window (e.g. 24 h).
- **`modelUrl` normalization (fixes "assets don't load"):** the gateway must serve whatever URL form the 3D-gen pipeline emits. Today uploads can return `/api/view/{id}` or raw asset-store URLs; Tellus now heals any known asset-store id to `/api/assets/model/{assetStoreModelId}/game-optimized`. Hyades / gnostr should proxy `/api/assets/model/{id}/game-optimized` to the 3D Asset Manager's `/api/model/{id}/game-optimized`, with the asset manager's original GLB fallback behavior preserved. Keep proxying `view`, `download`, and `models` too for old snapshots and tooling. The client resolves `modelUrl` against `worldApiBase`, so a relative path that the gateway proxies works cleanly.
- **LOD / impostor asset proxy:** Tellus also expects `/api/assets/model/{id}/lod/{0|1|2}` and `/api/assets/model/{id}/impostor` to proxy the corresponding asset-store artifacts when present, with 404 preserved for missing optional artifacts. See `docs/HYADES_ASSET_LOD_PROXY_HANDOFF.md` for the gateway contract and smoke tests.
- **Superseded-id + retry contract:** the 3D Asset Manager must resolve superseded ids on consumer-facing load endpoints with its alias table, including `/api/model/{id}`, `/api/model/{id}/game-optimized`, `/api/view/{id}`, `/api/download/{id}`, thumbnail/preview routes, and VRM variant routes. Tellus must not treat early 404/410 responses for asset-store-backed models as permanent deletion; it should show a transient failed marker, keep `assetStoreModelId`/`modelUrl`, and retry so conversion, alias creation, or proxy deployment lag can self-heal.
- Validate `WorldGeneratedThing` with the same predicate as `isWorldGeneratedThing` (`src/world-protocol.ts:167`).

### 7.5 Idempotency & ordering

- All grain mutations run in turn order; assign a monotonically increasing per-world `seq` to each emitted patch (additive field, ignored by current client) so a future client can detect gaps and request a resnapshot.
- `ApplyAction` should be safe to retry (the gateway may resend on transient stream hiccups).

---

## 8. Generation pipeline (closing the dead queue)

Current state: `generation.request` → `TELLUS_GENERATION_QUEUE.send()` with **no consumer**. Replace with:

1. `ITellusWorldGrain.ApplyAction(generation.request)`:
   - create `GenerationJob { id, worldId, request, status: "queued", createdAt, updatedAt }`, store in `QueuedGenerationJobs`, broadcast `generation.queued`.
   - also emit a placeholder `generated.updated` with `generationStatus: "queued"` so clients render the "swirl" placeholder (the client already does this).
   - activate `ITellusGenerationGrain[jobId]` and hand off the job.
2. `ITellusGenerationGrain` drives the existing Hyades pipeline (text → concept image → image-to-3D → optimize → store), reusing the logic in `api/generate-3d.ts` (providers: instantmesh / pixal3d / anigen; text-to-image via the Hyades image module). It reports transitions back to the world grain:
   - `generating` → world grain broadcasts `generation.update`.
   - `ready` with `modelUrl` → world grain merges onto the thing (status `ready`), persists, broadcasts `generated.updated`.
   - `failed` → status `failed`; client falls back to a local placeholder.
3. **Backpressure:** bound concurrent generation jobs per world and globally (the in-memory serial queue in `api/generate-3d.ts` is the current, fragile equivalent). Apply per-creator rate limits so the agent can't flood (the reason autonomous gen is currently disabled client-side).
4. Honor the existing TTLs as job-expiry policy: `TELLUS_GENERATION_JOB_TIMEOUT_MS`, `TELLUS_GENERATION_QUEUED_TTL_MS`, `TELLUS_GENERATION_RUNNING_TTL_MS`.

---

## 9. In-cluster game agent

Today the autonomous agent runs in the browser (`createTellusWorld`, decision loop near `src/main.tsx:5362`–`5520`) and/or is driven by an external sidecar through the `window.tellusAgent` hook (`src/main.tsx:6351`). Client-side autonomous generation is currently hard-disabled (`AUTONOMOUS_AGENT_GENERATION_ENABLED = false`, `src/main.tsx:371`) because it flooded the world.

Move it into `ITellusAgentGrain` so it plays from inside the cluster, sharing the exact action surface a human visitor uses.

### 9.1 Action vocabulary (port verbatim from `window.tellusAgent`)

Observation (`getState` / `getNearby`, `src/main.tsx:6352`):

```jsonc
getState(radius=30) -> {
  visitorId, position, terrainType, terrainHeight,
  distanceToPond, distanceToSummit, distanceToShore,
  nearby: [ { id, kind, prompt, status, distance, direction, scale } ],   // up to 12, sorted by distance
  verbs: ["moveSelf","generate","sculptTerrain","moveAsset","rotateAsset","scaleAsset","moveAssetToWater"]
}
```

Verbs (`sendAction`, `src/main.tsx:6381`) — each maps to one or more `WorldAction`s the agent grain sends to the world grain:

| Verb | Args | Maps to |
|---|---|---|
| `moveSelf` | `dx,dz` (clamp ±8) | `presence.update` with new grounded position |
| `generate` | `prompt`, `near` (`mountain`/`pond`/`agent`/pos), `scale?` | `generation.request` (rate-limited) |
| `sculptTerrain` | `mode` | `terrain.sculpt` at agent position |
| `moveAsset` | `targetId`, `dx,dz` (±4) | `generated.place` (new position) |
| `rotateAsset` | `targetId`, `rotation` (±1) | `generated.place` (new rotationY) |
| `scaleAsset` | `targetId`, `scaleMultiplier` (0.65–1.5) | `generated.place` (new scale) |
| `moveAssetToWater` | `targetId` | `generated.place` (water position) |

Keep the same clamps and grounding rules; the world grain should re-validate them server-side (don't trust the agent's arithmetic).

### 9.2 Decision loop (current direction)

- Hyades owns the durable tick/reminder, observation, model decision, tool dispatch, budget, backoff, and lifecycle policy.
- Starting an agent is explicit. The maker roster exposes start/stop/place/delete actions and Hyades may sleep agents according to owner-presence and premium/offline-persistence policy.
- Tellus does not run the autonomous decision loop or call a browser `/api/chat` loop. It renders agent presence and world patches and provides the default companion's chat/persona/memory controls.
- Evaluation evidence uses the bounded `agent-view` capture surface; Hyades remains authoritative for the evaluation decision and returned summary.

### 9.3 Identity

Agent joins presence as a stable visitor (`visitorId = "agent:{agentId}"`, with avatar URL from config) so humans see it as a persistent participant and its placed assets carry `creatorId = agentId`.

---

## 10. Multi-tenancy, auth, ownership

- **Worlds:** keyed by `worldId`. Support multiple worlds (the Postgres doc already models `is_public`, `owner`, listing/search). Default world is `main` (public).
- **Listing:** implement `GET /api/tellus/worlds` (+ `search`, `user_only`, pagination) and per-world metadata `PATCH /api/tellus/worlds/:worldId`, matching `docs/tellus-flask-postgres-world-state.md`.
- **AuthN/Z:** the current world endpoints are effectively unauthenticated with `CORS: *`. For Hyades, require an identity on **mutating** actions and on private worlds:
  - read public world: anonymous OK.
  - write to a world: authenticated visitor; record `ownerUserId` on created things.
  - private world read/write: owner (or shared) only.
  - The client carries a stable `tellus.userId` (`src/main.tsx:1473`) distinct from the ephemeral `visitorId` — use `userId` for ownership, `visitorId` for presence/session.
- Map auth to the cluster's existing scheme (the same way the tts/asr/image modules are authorized).

---

## 11. Config & deployment

Client-side knobs that must keep working (`.env.example`, `public/tellus-config.json`):

```text
worldApiBase / VITE_TELLUS_WORLD_API_BASE   # point at the Tellus Edge Gateway
worldId      / VITE_TELLUS_WORLD_ID = main
```

When `worldApiBase` is set, the client uses the gateway exclusively and ignores local/file persistence. When empty, it falls back to single-player localStorage + the Bun `/api/tellus-state` file — leave that path intact for offline/dev.

Cluster-side config (Hyades to define): storage provider connection, stream provider, generation backpressure limits, presence TTL (default 90 s), agent cadence, `enabledAgents`.

---

## 12. Observability & failure modes

- Emit metrics per world: active presences, patch throughput, action rejects (by reason), generation queue depth + job latencies, persistence write latency.
- Log every `action.rejected` with reason (terrain conflicts especially) — this is how we'll know if conflict rules are too strict/loose.
- Failure expectations:
  - storage write failure → retry with backoff; surface as health signal; do **not** silently latch off (the bug the DO had).
  - generation pipeline failure → job `failed`, client placeholder, no world-state corruption.
  - gateway crash → clients reconnect (2.5 s) and resnapshot; grain state unaffected.
  - grain deactivation → transparent; rehydrate from durable state.

---

## 13. Migration plan

**Phase A — durable store, drop-in (low risk).**
Stand up `ITellusWorldGrain` + Edge Gateway honoring the v1 protocol (Section 5.1–5.4). Point Tellus `worldApiBase` at the gateway. Migrate existing world rows from the Flask/Postgres store (same `PersistedWorldState` shape) into grain storage. No client changes. This alone gives race-free, durable, single-authority world state and retires the Cloudflare DO + dead queue.

**Phase B — protocol v2 (coordinated client change).**
Add `terrain.sculpt` (server-authoritative incremental terrain), split `generated.place` / `generation.update`, tombstones, and the `view` proxy normalization. Land matching client changes behind the existing config. This fixes concurrent-editor terrain clobber and the generated-asset churn.

**Phase C — in-cluster agent.**
Move the agent into `ITellusAgentGrain`, re-enable autonomous generation with proper rate limits/backpressure, retire the browser autonomous loop and the headless sidecar.

---

## 14. Open questions for the Hyades team

1. **Realtime transport to the edge:** Orleans Streams (provider?) vs SignalR backplane for gateway fan-out — which fits the existing cluster? Either works; this picks the gateway implementation.
2. **Grain storage provider:** ADO.NET/Postgres grain storage (reuse the existing Postgres) vs another configured provider?
3. **Auth model:** what identity primitive do the tts/asr/image modules use, and can the gateway reuse it for world read/write authorization?
4. **Edge gateway ownership:** does Hyades own the ASP.NET Core gateway, or should Tellus provide it? (It's thin — WS relay + REST shim + stream subscription.)
5. **Generation reuse:** is there an existing Hyades 3D-gen grain/service to consume `generation.request`, or do we port `api/generate-3d.ts` into `ITellusGenerationGrain`?
6. **Worlds scope at launch:** single `main` world first, or multi-world + listing/search from day one?
7. **Terrain math parity:** acceptable to port `sculptTerrainAt` to C# with shared test vectors, or prefer the client to keep sending full snapshots (Phase A only) longer?

---

## Appendix A — Source-of-truth types

The canonical TypeScript definitions the client uses live in **`src/world-protocol.ts`** (`WorldAction`, `WorldPatch`, `TellusTerrainState`, `WorldGeneratedThing`, `WorldPresence`, `QueuedGenerationJob`, `GenerationJobRequest`, plus the `isWorldAction` / `isWorldGeneratedThing` / `isTellusTerrainState` validators). Treat that file as the wire-format spec; the C# DTOs in this document must serialize to byte-compatible JSON.

Key fixed constants from `src/main.tsx` the server must respect:

```text
WORLD_RADIUS = 72
TERRAIN_SEGMENTS = 96  -> TERRAIN_VERTEX_COUNT = 97  -> grid length 9409
DISTANT_TERRAIN_SEGMENTS = 32 -> 33x33 per distant island (DISTANT_ISLAND_COUNT = 18)
TERRAIN_SCULPT_RADIUS = 6.2,  TERRAIN_SCULPT_STEP = 0.72
sculpt offset clamp = [-9, 9],  paint code = [0, paintKindCount]
presence TTL = 90_000 ms
agent asset interval = 60_000 ms (reflection at half)
```

## Appendix B — What this replaces

| Today | Replaced by |
|---|---|
| `cloudflare/world-worker.ts` (`TellusWorld` DO) | `ITellusWorldGrain` + Edge Gateway |
| `TELLUS_PERSISTENCE_API_BASE` Flask/Postgres GET/PUT | Orleans grain persistence (Postgres) |
| `TELLUS_GENERATION_QUEUE` producer with no consumer | `ITellusGenerationGrain` |
| Browser autonomous agent + headless `window.tellusAgent` sidecar | `ITellusAgentGrain` |
| `wrangler.toml`, DO storage, queue bindings | Orleans cluster config |
