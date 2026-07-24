# Tellus Durable Friends Relationships — Phase 2 PRD

**Status:** Proposed

> **Current status (2026-07-23):** This relationship phase has shipped in Hyades and Tellus. Keep this
> document as the relationship-grain design record; use
> [`MESSAGES_PRESENCE_UI_PRD.md`](./MESSAGES_PRESENCE_UI_PRD.md) for the current audited wire contract,
> Messages/People information architecture, and remaining social work.

**Parent:** `docs/FRIENDS_PRESENCE_COMMUNICATION_PRD.md`

**Depends on:** Hyades `ITellusPresenceRegistryGrain` (`0.5.301`), Tellus presence integration (`feat/friends-presence`, PR #126), Tellus account sessions

**Primary milestone:** An authenticated player can send, accept, decline, and remove a durable friendship; Tellus shows accepted friends with registry-backed online/offline and current-world status.

## 1. Summary

Phase 1 replaces Tellus's multi-world polling workaround with the shipped Hyades presence registry. It intentionally does not create friend relationships: Hyades has no durable friends contract or gateway routes yet.

Phase 2 adds that missing social graph. Friendships are mutual and account-level, pending requests are explicit, and relationship mutations are atomic. Tellus then queries presence only for accepted friend ids and joins those results onto the durable list. Cross-world/offline DM delivery remains Phase 3.

## 2. Security correction to the parent PRD

Presence may remain readable by any stable Tellus identity because it is already a broad roster service. Friendship data is different: it reveals a private social graph and permits durable mutations.

All friends routes therefore require a valid `X-Tellus-Session` and derive the actor from the verified account. They must not accept `?userId=` or `X-Tellus-User` as authority. The current Hyades fallback identity is intentionally soft and spoofable; it is insufficient for friend requests, friendship lists, acceptance, decline, or removal.

Consequences:

- Anonymous users can still appear in same-world presence but cannot send or receive friend requests.
- A request target must resolve to a real, active Tellus account.
- The request body never supplies the acting user id.
- Claimed anonymous aliases do not become separate friendship identities; the account id is canonical.

## 3. Goals

- Durable, mutual accepted friendships.
- Incoming and outgoing pending requests.
- Idempotent send, accept, decline, and remove operations.
- Atomic symmetry: an accepted relationship cannot exist for only one participant.
- A bounded, abuse-resistant relationship surface.
- A client friends list that preserves offline entries and joins accepted ids against the batch presence endpoint.
- Travel to an online friend's world through the existing access-gated world-switch flow.

## 4. Non-goals

- Cross-world or offline DM delivery and history.
- Blocking, muting, friend suggestions, groups, followers, or activity feeds.
- Arbitrary global people search.
- P2P cross-world signaling.
- Making presence itself private or friends-only.

## 5. Hyades storage design

### Recommended v1: one atomic relationship registry

Add `ITellusFriendsRegistryGrain`, a durable singleton keyed `"global"`, following the shipped presence-registry operational precedent but used only for low-frequency social mutations and reads.

A single activation owns both sides of every relationship, avoiding partial two-grain writes and call cycles during simultaneous requests or accepts. Expected Tellus social mutation volume is low. If scale later requires sharding, the stable sorted-pair relationship key provides the migration boundary.

```csharp
[Version(1)]
public interface ITellusFriendsRegistryGrain : IGrainWithStringKey
{
    Task<FriendsSnapshot> GetAsync(string userId);
    Task<FriendMutationResult> SendRequestAsync(string fromUserId, string toUserId, long nowMs);
    Task<FriendMutationResult> AcceptAsync(string userId, string fromUserId, long nowMs);
    Task<FriendMutationResult> DeclineAsync(string userId, string fromUserId, long nowMs);
    Task<FriendMutationResult> RemoveAsync(string userId, string otherUserId, long nowMs);
}
```

The durable record is keyed by an ordinally sorted pair (`min(userA,userB) + "\n" + max(userA,userB)`) and stores:

```csharp
enum FriendshipState { Pending, Accepted }

sealed class FriendshipRecord
{
    string UserA;
    string UserB;
    string RequestedBy;
    FriendshipState State;
    long CreatedAtMs;
    long UpdatedAtMs;
}
```

The grain is the authority for symmetry. It returns copies, uses ordinal ids, trims/rejects empty ids, rejects self-friending, and writes state once per successful mutation.

### Mutation semantics

- `send(A,B)`: creates pending requested by A.
- Repeating `send(A,B)`: idempotent success.
- `send(B,A)` while A→B is pending: atomically accepts the friendship. This makes simultaneous/crossed requests converge without an error.
- `accept(B,A)`: succeeds only for an A→B pending request; repeating after acceptance is idempotent success.
- `decline(B,A)`: removes only an A→B pending request; repeating is idempotent success.
- `remove(A,B)`: removes an accepted relationship or either-direction pending request for safety; repeating is idempotent success.
- No operation may disclose relationships not involving the authenticated actor.

### Bounds and abuse controls

- Maximum 500 accepted friends per account.
- Maximum 100 incoming and 100 outgoing pending requests per account.
- Maximum 20 new outgoing requests per rolling hour at the gateway.
- Declined or removed pairs cannot be re-requested for 24 hours. Store a bounded tombstone with `retryAfterMs`; prune expired tombstones during reads and mutations.
- Return `429` with `retryAfterSeconds` for rate/cooldown limits.

Exact limits should be configuration-backed, but these defaults make behavior testable and prevent an unbounded singleton state.

## 6. Gateway contract

Register under the existing `/api/tellus/{**rest}` CORS preflight and require `ResolveTellusSessionAsync` for every route.

### `GET /api/tellus/friends`

```json
{
  "friends": [
    { "userId": "acct-b", "since": "2026-07-17T20:00:00.000Z" }
  ],
  "pendingIncoming": [
    { "userId": "acct-c", "requestedAt": "2026-07-17T20:05:00.000Z" }
  ],
  "pendingOutgoing": [
    { "userId": "acct-d", "requestedAt": "2026-07-17T20:06:00.000Z" }
  ]
}
```

Names and avatars are not relationship state. The client joins ids against presence and uses the account label only when Hyades can safely resolve it. Offline users may therefore fall back to a shortened account id until a separate public-profile contract exists.

### `POST /api/tellus/friends/request`

Body: `{ "userId": "acct-b" }`

Returns the resulting relationship state. `201` for a newly created request, `200` for idempotent/crossed-request convergence.

### `POST /api/tellus/friends/accept`

Body: `{ "userId": "acct-a" }`

Returns `200` with `{ "state": "accepted", "userId": "acct-a", "since": "..." }`.

### `POST /api/tellus/friends/decline`

Body: `{ "userId": "acct-a" }`

Returns `200` with `{ "state": "none", "userId": "acct-a" }`.

### `DELETE /api/tellus/friends/{userId}`

Removes an accepted relationship or pending request involving the actor. Returns `204`; repeated deletion remains `204`.

### Errors

- `400`: missing/invalid id or self-request.
- `401`: no valid Tellus session.
- `404`: target is not an active Tellus account, or an accept/decline target has no applicable incoming request.
- `409`: configured relationship limit reached.
- `429`: request rate or pair cooldown reached, including `retryAfterSeconds`.
- `503`: relationship storage temporarily unavailable; no partial success is reported.

## 7. Tellus client behavior

Add a typed `tellus-friends-client.ts` beside `tellus-presence-client.ts`.

On authenticated app load and whenever the DMs/social surface opens:

1. Fetch `GET /api/tellus/friends`.
2. Batch the accepted friend ids through `GET /api/tellus/presence?users=...`.
3. Render every accepted friend. Missing presence means offline; a failed presence query means status unknown.
4. Poll only the batch presence query every 10 seconds while the surface is open. Relationship state refreshes after mutations, on focus, and at a slower 60-second cadence.
5. Keep same-world nearby players/agents as ephemeral DM targets. Do not silently label them friends.

### Surface

Extend the existing DMs panel rather than adding another floating HUD:

- `Friends` list: accepted relationships, online first, then offline.
- `Requests` section: incoming Accept/Decline actions and outgoing Pending state.
- `Add friend` action on an authenticated same-world or registry contact. V1 does not provide arbitrary people search.
- `Go` for an online friend; normal world access still decides whether joining succeeds.
- `Message` remains enabled only where the current same-world DM transport can reach the real visitor id. Cross-world messaging waits for Phase 3.

Logged-out users see a concise sign-in prompt; no relationship request is attempted with the anonymous id.

## 8. Reliability and concurrency

- All mutation methods are idempotent.
- Crossed requests converge to accepted in one atomic grain turn.
- The client disables only the affected action while it is in flight and refetches the authoritative snapshot after success.
- Failed mutations retain the previous UI state and announce an actionable error.
- Failed presence refreshes retain the friend list and show status unknown, never delete or mark friends offline.
- Account deletion/ban cleanup is follow-up operator work; reads must omit relationships to non-active accounts where practical without mutating unrelated state during a gateway response.

## 9. Observability

Hyades:

- relationship count by state;
- request/accept/decline/remove totals;
- rejects by reason (`self`, `limit`, `rate`, `cooldown`, `unauthenticated`);
- mutation and read latency.

Tellus adds to `window.__tellusPerf().friendsPresence`:

- total friends and online friends;
- incoming/outgoing request counts;
- last successful/failed friends refresh;
- last successful/failed batch presence refresh;
- configured poll intervals.

Logs and metrics must never emit the complete social graph.

## 10. Test plan

### Hyades grain tests

- send, repeat-send, accept, repeat-accept, decline, repeat-decline, remove, repeat-remove;
- self-request rejection;
- crossed requests converge to one accepted record;
- symmetric snapshots after acceptance and removal;
- pending/friend limits, hourly rate, cooldown, and tombstone pruning;
- concurrent operations never create duplicates or one-sided state;
- state survives grain deactivation/reactivation.

### Hyades gateway tests

- every route rejects soft/query-string identity without a valid session;
- actor id always comes from the session, never the body;
- CORS preflight allows `X-Tellus-Session`, required methods, and `DELETE`;
- response shapes and status codes match this contract;
- nonexistent/inactive targets and storage failures are handled without information leakage or partial success.

### Tellus tests

- friends response parsing and malformed-row rejection;
- one batched presence query for all accepted ids;
- offline versus unknown status behavior;
- mutation loading/error states and authoritative refetch;
- same-world ephemeral contacts remain usable without becoming friends;
- logged-out UI cannot submit a friend mutation;
- travel remains subject to existing world-access handling.

## 11. Acceptance criteria

1. Only authenticated accounts can read or mutate friendship state.
2. A user can send, accept, decline, and remove a relationship through Tellus.
3. Accepted friendship is symmetric and durable across sessions/devices.
4. Crossed requests and retries are idempotent and cannot produce partial relationships.
5. Tellus renders accepted friends when offline, unknown, or online and shows an online friend's current world.
6. Presence polling is one batch request per cycle, not one request per friend.
7. Nearby/in-world presence and same-world DMs do not regress.
8. No UI implies that cross-world DMs work before Phase 3.

## 12. Delivery sequence

1. Hyades grain contract/state and unit tests.
2. Hyades authenticated gateway routes, CORS coverage, rate limits, and integration tests.
3. Deploy Hyades and verify the four mutations plus list against two real test accounts.
4. Tellus typed client and state integration.
5. Tellus DMs/friends UI and browser verification with two signed-in sessions in different worlds.
6. Retire the full-online-roster query from the normal friends view; retain it only for explicit discovery/diagnostics surfaces.

Phase 3 begins only after this relationship contract is live: durable cross-world/offline DM threads can then require an accepted friendship without inventing another consent model.
