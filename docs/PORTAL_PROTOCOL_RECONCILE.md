# Portal protocol reconciliation — RESOLVED

**Status:** RESOLVED 2026-06-18. Cloned the real Hyades from gnostr-cloud
(`gnostr-cloud://info@monumentalsystems.com/hyades`, authed with the `lisa` identity — the
owner `info@` key was NOT authorized; `lisa` is). The portal-bearing source confirms the wire
contract below. The GitHub `MonumentalSystems/hyades` repo is a stale mirror with no portal code.

## ROOT CAUSE of the "creating portal" hang

Codex renamed the client's OUTBOUND portal action types to `world.portal.upsert/delete/enter`,
but the live Hyades world grain switch (`Hyades.Module.Tellus/TellusWorldGrain.cs:515-519`) only
matches the BARE names `portal.upsert/delete/enter`. Unknown action → `default:` →
`action.rejected` → client's `pendingPortalIds` never clears → hangs forever.

Confirmed by `docs/TELLUS_INFINITY_PLAN.md:142` in the Hyades repo:
"WorldAction/WorldPatch unions (portal.upsert/delete/enter, portal.updated/deleted,
world.portal.entered)". Only `entered` carries the `world.` prefix. No gateway converter exists.

There is ALSO a `TellusFeatures.Portals` feature flag — even with the right name, if portals are
disabled for that world/silo the action returns `action.rejected "portals disabled"`. So the
target world must have portals enabled server-side.

## Authoritative wire contract (from live Hyades)

| Direction | Type | Notes |
|---|---|---|
| client → server | `portal.upsert` | bare name. server stamps CreatedBy/At/WorldId |
| client → server | `portal.delete` | bare name |
| client → server | `portal.enter`  | bare name |
| server → client | `portal.updated` | single portal patch |
| server → client | `portal.deleted` | portalId |
| server → client | `world.portal.entered` | the ONLY world.-prefixed one; triggers world switch |
| server → client | `world.snapshot` `.portals[]` | authoritative full set |

## THE FIX (client side, this repo)

Revert the three OUTBOUND frame names in src/main.tsx back to the bare form:
- `world.portal.enter`  → `portal.enter`   (~line 6160)
- `world.portal.upsert` → `portal.upsert`  (~line 6180)
- `world.portal.delete` → `portal.delete`  (~line 6242)
Keep everything else Codex added (pending-tracking, 8s warning, anchor edge cases, feedback).
The rejection-handler checks already accept both names, so they need no change.

---

## Original investigation notes (kept for history)

## What we know

- Portals are a **server-backed** feature. The client (this repo) sends portal frames over the
  world WebSocket and waits for the server to echo them back before clearing "creating…" state.
- Codex renamed the **outbound** action types to match a Hyades-side change:
  - `portal.upsert`  → `world.portal.upsert`   (src/main.tsx)
  - `portal.delete`  → `world.portal.delete`
  - `portal.enter`   → `world.portal.enter`
- Inbound, the client accepts BOTH old and new patch names (src/world-protocol.ts):
  - `portal.updated` || `world.portal.updated`
  - `portal.deleted` || `world.portal.deleted`
  - `world.portal.entered`
- The client hangs on "creating portal" when no `*.portal.updated` echo returns and
  `pendingPortalIds` never clears. Codex added an 8s "still waiting…" warning band-aid
  (`pendingPortalStartedAt` / `pendingPortalWarnedIds`) — UX only, not a fix.

## Why the GitHub repo misled us

`MonumentalSystems/hyades` (GitHub) world grain `TellusWorldGrain.cs` action switch handles
generated.*, terrain.*, presence.update, world.chat, moveAsset, emote, signal — and **rejects
everything else** via `default: → action.rejected "unknown action type"`. NO portal case, and the
world grain has NO portal field / never emits portals in `world.snapshot`.

That repo is the **abandoned mirror**. The live portal-bearing Hyades is in **gnostr-cloud git**,
deployed at **uranus.gnostr.cloud** (and/or hyades.gnostr.cloud). We have access but low visibility.

## What the Hyades doc needs to answer (to unblock)

1. **Exact inbound action types** the live Hyades accepts for portals
   (confirm `world.portal.upsert` / `world.portal.delete` / `world.portal.enter`, or other).
2. **Exact outbound patch types + shapes** it emits
   (`world.portal.updated`? `world.snapshot.portals[]`? field names on `WorldPortal`:
   id, label, position, target{kind,worldId,spawn}, anchorThingId).
3. **Does `world.snapshot` include a `portals[]` array?** (client relies on snapshot being
   authoritative — `mergePortalSnapshot` in src/main.tsx).
4. **Which backend does LOCAL dev point at?** `VITE_TELLUS_WORLD_API_BASE` in the local `.env`
   (NOT `.env.example`). If local points at a backend without the new endpoint, that alone
   explains "never loaded locally" while it works on Uranus.
5. **Auth:** the `X-Tellus-Session` header / how to get a session token, so we can GET a live
   world snapshot from Uranus and confirm it actually returns portals.

## Verified-good client behavior (no change needed)

- Anchored portals follow a moved asset (src/main.tsx ~3525).
- Deleting an asset that anchors portals prompts + deletes those portals (src/main.tsx ~3716).
- Per-portal destination `<select>` (updatePortalTarget) + Delete button exist in the portals panel.
- Portal position falls back to anchor position, else its own (src/main.tsx ~1252).
