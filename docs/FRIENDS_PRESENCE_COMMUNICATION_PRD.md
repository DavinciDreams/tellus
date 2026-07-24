# Tellus Friends, Presence, and Cross-World Communication PRD

**Status:** Proposed

> **Current status (2026-07-23):** The presence integration and authenticated durable friends slice described
> here have shipped in Hyades and Tellus. This document remains the historical phase plan. Use
> [`MESSAGES_PRESENCE_UI_PRD.md`](./MESSAGES_PRESENCE_UI_PRD.md) for the current audited contracts, user
> experience, progressive-disclosure model, and remaining backend requirements.

**Issue:** [MonumentalSystems/hyades#35](https://github.com/MonumentalSystems/hyades/issues/35) (Hyades-side foundation — closed as completed, `0.5.301`)

**Product surfaces:** Tellus client, Hyades world service, Hyades gateway

**Depends on:** `ITellusPresenceRegistryGrain` (shipped), `ITellusWorldGrain` DM privacy filtering (shipped), the existing P2P WebRTC mesh (`src/webrtc-mesh.ts`, shipped)

**Primary milestone:** A friends list that shows who is online and in which world, replacing the client's polling-based cross-world presence hack with the shipped registry.

## 1. Executive summary

Hyades shipped the missing piece first: a durable, cross-world presence registry (`ITellusPresenceRegistryGrain`, `0.5.301`) that answers "is user X online, and in which world" in one query, plus two gateway routes (`GET /api/tellus/presence`, `GET /api/tellus/presence/online`). Tellus does not yet use it. The client still runs a REST-polling workaround (`crossWorldPresence`, up to 12 worlds polled every 10s) to approximate the same answer, and has no durable friends list, no cross-world DM delivery, and no offline DM delivery.

This project has three independent, sequential increments:

1. **Presence + friends list:** replace the polling hack with the registry; add a durable per-user friends list; show online/offline + current world for each friend.
2. **Cross-world DM delivery:** decouple DMs from the per-world transient chat log so a message reaches its recipient regardless of which world they're in, and is held for delivery if they're offline.
3. **P2P call routing:** use presence to decide whether a friend is reachable via the existing same-world WebRTC mesh, or (later, larger scope) needs cross-world signaling relay.

Only increment 1 is scoped in detail here. Increments 2 and 3 are described at a goals/non-goals level so their dependencies are visible, but each gets its own PRD before implementation.

Phase 2's implementation-ready relationship contract is now specified in
[`FRIENDS_RELATIONSHIPS_PHASE_2_PRD.md`](./FRIENDS_RELATIONSHIPS_PHASE_2_PRD.md).

## 2. Problem statement

Messaging, a friends list, cross-world presence, and P2P calling all fail (or can't exist) for the same root reason: **there was no cross-world identity/presence layer.** That gap is now closed on the Hyades side; Tellus has not caught up.

- **Presence today (client):** `crossWorldPresence` (`src/main.tsx:11990`) polls `/api/world/{worldId}/state` for a fixed list of known worlds on an interval, merging each world's presence array into local state. This is O(known worlds) HTTP requests every poll, only covers worlds the client already knows to ask about, and re-derives from scratch every cycle.
- **Friends list:** does not exist. `chatTargets` (`src/main.tsx:15341`) is derived entirely from whoever happens to currently be visible via `crossWorldPresence` or the local world's presence — there is no durable, user-curated list of "these are my friends," and nobody appears in it unless the polling loop happens to have found them recently.
- **DM delivery:** `WorldChatMessage` with `channel: "dm"` (`src/world-protocol.ts:96-108`) lives inside one world's transient chat log. Server-side privacy is already correctly enforced (`GatewayTellusWorld.TellusChatVisibleToSocket`, `0.5.279`) — a DM reaches only its sender and recipient — but only if the recipient is connected to *that world's* socket at the time. A DM to someone in a different world, or offline, silently goes nowhere. This is very likely why DMs have "never quite worked": not a privacy bug, an architectural reach limit.
- **P2P voice/video:** `webrtc-mesh.ts` is a complete, working full-mesh implementation, but signaling rides the same per-world WebSocket, so two people can only connect if already in the same world's session.

## 3. Existing foundations

### Hyades (shipped, `0.5.301`)

- `ITellusPresenceRegistryGrain` — durable singleton (`Hyades.Module.Tellus/TellusPresenceRegistryGrain.cs`), keyed `"global"`. One row per human `userId`: `{ worldId, displayName, avatarId, lastSeenAtMs }`. World-move updates the row in place (never a duplicate). Stale rows (>120s since last report) are pruned on every read and report.
- `TellusWorldGrain` already reports into it fire-and-forget (`[OneWay]`, never blocks the world grain's serialized write path) on `JoinAsync`/`HeartbeatAsync` (`ReportAsync`) and `LeaveAsync` (`ClearAsync`) — see `TellusWorldGrain.cs:1201`, `:1219`.
- Two gateway routes, both requiring only a stable Tellus `userId` (no per-world access gate — cross-world by design):
  - `GET /api/tellus/presence?users=a,b,c` → batch lookup, absent/offline users simply omitted.
  - `GET /api/tellus/presence/online[?withinSeconds=N]` → full online roster.
  - Response shape (`GatewayTellusWorld.PresenceView`):
    ```json
    {
      "serverTime": "2026-07-17T18:40:00.000Z",
      "presence": [
        {
          "userId": "u-123",
          "worldId": "chunked-64-genesis",
          "name": "Rae",
          "avatarId": "fox-01",
          "lastSeenAt": "2026-07-17T18:39:55.123Z",
          "online": true
        }
      ]
    }
    ```
- DM privacy is already correct and tested (`Hyades.Tests/TellusDmPrivacyTests.cs`) on the live socket, cold snapshot, and `/state` HTTP route — nothing to fix there, only reach to extend.

### Tellus client (existing, to be replaced/extended)

- `crossWorldPresence` (`src/main.tsx:11990`) and its polling loop — replaced by increment 1.
- `chatTargets`/`OnlineContact` (`src/main.tsx:268`, `:15341`) — the existing "who can I DM" UI surface; becomes friends-list-driven instead of presence-scan-driven.
- `goToOnlineContact` (`src/main.tsx:15432`) — teleport-to-contact's-world action; stays, now driven by the friend's `worldId` from the registry instead of a locally cached scan.
- `WorldChatMessage`/`sendWorldChat` (`src/world-protocol.ts:96-108`, `src/main.tsx`) — the DM send path; extended in increment 2, unchanged in increment 1.

## 4. Product principles

1. **Presence is a query, not a poll.** One registry call answers "where is my friend," not N per-world requests.
2. **Friends list is durable and user-curated**, independent of who happens to be online right now.
3. **A friend request is bidirectional and explicit.** No one appears in a friends list without both sides agreeing, mirroring how the existing DM privacy model treats consent.
4. **Presence has no world-access implications.** Knowing a friend's `worldId` does not itself grant access to a private world — existing `EnsureWorldAccessAsync` gates still apply when the client actually tries to join.
5. **Offline is a normal state, not an error.** The UI must distinguish "friend is offline" from "friend is in a world I can't currently query" from "presence temporarily stale."
6. **DM delivery reach is a separate concern from DM privacy.** Privacy (who can read a DM) is solved; reach (can the message even get there) is what increments 2+ fix — don't reopen the privacy work.

## 5. Goals (increment 1 — presence + friends list)

- Replace `crossWorldPresence`'s polling loop with `GET /api/tellus/presence/online` (roster) and `GET /api/tellus/presence?users=...` (batch, for a known friends list) — one query pattern, not N.
- Add a durable per-user friends list: send/accept/decline/remove a friend, symmetric (both users see each other once accepted).
- Show each friend's live status: online + current world (with a display name), or last-seen-offline.
- Let a player teleport to an online friend's world (reusing the existing `goToOnlineContact` portal/travel flow) subject to normal world-access rules.
- Keep the existing "who's nearby in this world" and in-world DM-target UI working during the transition — this is additive, not a replacement for in-world presence.
- Poll the registry at a bounded, reasonable interval (a few seconds, not sub-second) — this is a lightweight replacement for a heavier hack, not a new real-time channel.

## 6. Non-goals (increment 1)

- Cross-world DM delivery (increment 2 — separate PRD).
- Offline DM delivery / DM history beyond the current per-world chat log (increment 2).
- P2P call routing across worlds (increment 3 — separate PRD, larger scope, needs a signaling relay).
- Rich social features: friend groups, blocking/muting beyond what already exists, activity feeds, friend suggestions.
- Server-side push/real-time presence updates (websocket-pushed presence deltas). Polling the registry at a bounded interval is sufficient for a friends list; a push channel is a possible later optimization, not required for this milestone.
- Changing DM privacy semantics — already correct and out of scope.

## 7. Users and core stories

### World visitor

- I can send a friend request to someone I meet in a world.
- I can see which of my friends are online right now and which world they're in.
- I can teleport to an online friend's world (if I have access) directly from my friends list.
- I understand when a friend is offline versus just not reporting fresh presence yet.

### Friend-list owner

- I can accept, decline, or remove a friend request.
- My friends list persists across sessions and devices — it's account-level, not per-tab.

### Developer or operator

- I can see the same presence data the client sees, for debugging ("why doesn't my friends list show X online").
- The friends-list feature can be disabled per-client without touching Hyades' presence registry (it's independent infrastructure other future features also depend on).

## 8. Terminology

- **Presence registry:** the shipped `ITellusPresenceRegistryGrain` — cross-world, one row per user.
- **Friend:** a `userId` the current user has a mutual, accepted friend relationship with.
- **Friend request:** a pending, one-directional invitation awaiting accept/decline.
- **Roster:** the full online-user list from `GET /api/tellus/presence/online`.
- **Batch lookup:** a targeted query for specific `userId`s (a user's friends list) via `GET /api/tellus/presence?users=...`.
- **Stale:** a presence row whose `lastSeenAt` has exceeded the registry's prune window (120s) — treated as offline.

## 9. Proposed data model

### Hyades (new — friends list; presence registry already shipped)

Friends-list storage was explicitly left as follow-up work by the presence registry issue (hyades#35). Two reasonable shapes, to be resolved during Hyades-side design:

- A slice on the existing `ITellusUserGrain` (one grain per user, already exists) holding `{ friends: string[], pendingOutgoing: string[], pendingIncoming: string[] }`, or
- A new `ITellusFriendsGrain` (same key pattern as the user grain) if friend-list operations warrant separating from the user profile's existing concerns.

Either way, the operation surface needed:

```ts
// Illustrative — actual shape decided during Hyades implementation.
interface FriendsApi {
  sendRequest(toUserId: string): Promise<void>;
  acceptRequest(fromUserId: string): Promise<void>;
  declineRequest(fromUserId: string): Promise<void>;
  removeFriend(userId: string): Promise<void>;
  listFriends(): Promise<string[]>; // userIds; client joins against the presence registry for live status
  listPendingIncoming(): Promise<string[]>;
  listPendingOutgoing(): Promise<string[]>;
}
```

### Tellus client (new)

```ts
interface FriendPresence {
  userId: string;
  displayName?: string;
  avatarId?: string;
  worldId?: string; // absent when offline
  online: boolean;
  lastSeenAt?: string;
}

interface FriendsListState {
  friends: FriendPresence[];
  pendingIncoming: { userId: string; displayName?: string }[];
  pendingOutgoing: { userId: string; displayName?: string }[];
}
```

## 10. Client architecture

Replace `crossWorldPresence`'s per-world polling loop with a single hook driven by the presence routes:

1. On mount / friends-list open: `GET /api/tellus/presence?users=<friend ids>` to hydrate initial status for the friends list specifically.
2. On a bounded interval (a few seconds — matching or slightly faster than the registry's own heartbeat cadence, not sub-second): re-query the same batch endpoint for the current friends list.
3. `GET /api/tellus/presence/online` (the full roster) is used only where a broader "who's online right now" view is actually needed (e.g. a future "nearby friends across the world" surface) — not for the friends-list's own status, which should stay a targeted batch query scoped to actual friends, not the whole roster.
4. `chatTargets`/`OnlineContact` (`src/main.tsx:15341`) becomes friends-list-driven: online friends populate the DM-target list directly from step 1/2's result, replacing the current world-presence-scan derivation.
5. `goToOnlineContact` (`src/main.tsx:15432`) is unchanged in mechanism — it already teleports to a contact's `worldId`; only the source of that `worldId` changes (registry-backed friend entry, not a locally cached presence scan).

This directly retires the O(known worlds) polling loop with O(1) queries scoped to the user's actual friends list.

## 11. Network / API contract

No new Hyades routes required for the presence half — `GET /api/tellus/presence` and `GET /api/tellus/presence/online` are shipped and sufficient. New routes needed only for the friends-list half (exact paths to be finalized during Hyades-side design, e.g. under `/api/tellus/friends/*`):

- `POST /api/tellus/friends/request` — send a friend request.
- `POST /api/tellus/friends/accept` / `POST /api/tellus/friends/decline` — respond to a pending request.
- `DELETE /api/tellus/friends/{userId}` — remove a friend.
- `GET /api/tellus/friends` — the current user's friends list + pending requests.

All routes require only a stable Tellus `userId` (same auth pattern as the presence routes), no world-access gate.

## 12. Performance requirements

- Friends-list presence queries are batched (one request per poll cycle for the whole friends list), never one request per friend.
- Poll interval is bounded and configurable, defaulting to a few seconds — no busier than the registry's own write cadence (heartbeats), and strictly lighter than the retired per-world polling hack (which issued up to 12 requests per cycle; this issues one).
- The friends-list UI must not block or stall world rendering — presence queries run on the same async/background pattern as other Tellus HTTP calls, never synchronously in the render/animation loop.

## 13. Reliability and failure behavior

- If the presence registry is unreachable, the friends list shows friends as "status unknown" (not "offline") and retries on the next poll — never silently drops friends from the list.
- A friend's world-move (registry row updates in place) must reflect within one poll cycle; no stale "in world A" display after the registry has already updated to world B.
- `EnsureWorldAccessAsync` (existing) still gates the actual teleport — presence data alone must never imply access to a private world.

## 14. Observability

- Client: expose friends-list poll cadence, last successful/failed presence query, and friend count (online/total) via the existing `window.__tellusPerf()`-style diagnostic pattern, not a new ad hoc console hook.
- Hyades: the presence registry already exists as durable state queryable by operators; no new instrumentation required for increment 1 beyond what's already shipped.

## 15. Delivery plan

### Phase 1 — Presence integration (this PRD's primary scope)

- Wire the client to `GET /api/tellus/presence`/`/online`, replacing `crossWorldPresence`'s polling loop.
- No friends list yet — this phase can ship standalone as a performance/correctness improvement to the existing "online contacts" UI, using the roster endpoint the same way `crossWorldPresence` used per-world scans, just via one query instead of many.

### Phase 2 — Friends list

- Hyades: friends-list grain/slice + routes.
- Client: send/accept/decline/remove UI, friends-list panel, batch presence query scoped to the friends list.

### Phase 3 (separate PRD) — Cross-world DM delivery

- New `ITellusDmThreadGrain` (or equivalent), decoupling DM storage from the per-world chat log.
- Offline delivery: a message to an offline friend is queued and delivered on their next connect.

### Phase 4 (separate PRD) — P2P call routing

- Use presence to determine same-world-reachable (existing mesh) vs. needs-relay (new infrastructure, larger scope, deliberately deferred).

## 16. Acceptance criteria (increment 1 / Phase 1+2)

1. The client no longer polls `/api/world/{worldId}/state` across multiple worlds for presence purposes.
2. A user can send, accept, decline, and remove friends; the relationship is symmetric once accepted.
3. A friends list shows accurate online/offline status and current world for each friend, refreshed within one poll cycle of a change.
4. Selecting an online friend can teleport the player to that friend's world, subject to existing world-access rules.
5. Friends-list presence queries are batched (one request per poll cycle, not one per friend).
6. No regression to existing in-world "nearby" presence or DM UI during the transition.

## 17. Open decisions

- Exact friends-list storage location on Hyades (slice on `ITellusUserGrain` vs. new `ITellusFriendsGrain`) — resolve during Hyades-side implementation, following whichever precedent (existing per-user grain vs. new dedicated grain) proves simpler given the existing `ITellusUserGrain` shape.
- Whether friend requests need an expiry/cooldown to prevent spam — likely yes, exact values TBD.
- Whether the friends-list panel is a new HUD surface or extends the existing DM-target panel (`chatTargets` UI) — a design/UX call, not an architecture one.
- Poll interval default (this PRD suggests "a few seconds" as a starting point; tune against real registry write cadence once Phase 1 is live).

## 18. Dependencies

- `ITellusPresenceRegistryGrain` and its two gateway routes — shipped, `0.5.301`.
- Existing DM privacy enforcement (`TellusChatVisibleToSocket`) — shipped, unaffected by this work.
- `ITellusUserGrain` — existing, likely extended for the friends list.
- `EnsureWorldAccessAsync` — existing, must continue gating teleport regardless of presence data.
