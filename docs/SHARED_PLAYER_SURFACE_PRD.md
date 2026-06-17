# PRD: Shared Player Surface and World Weaver Permissions

## Summary

Tellus should treat humans, MCP-controlled agents, autonomous agents, and future NPCs as the same kind of embodied world participant: a player actor. The difference between them is the controller, not the world capabilities.

Today, humans can do some things through browser controls, browser-side agents can do some things through `window.tellusAgent`, Hyades world agents can do some things through backend tools, and MCP callers have another public tool surface. This creates drift. For example, in-world agents can currently generate and ride through the native world path, while MCP actors do not expose ride/mount tools, and MCP presences may show as players instead of agents because their IDs use a different prefix.

The goal is a single authoritative player action surface shared by:

- browser UI controls;
- MCP tools;
- autonomous/free-form agents;
- server-side world agents;
- admin/dev tools, with explicit elevated capabilities.

Tellus `main` becomes the shared home world and public commons. Other worlds are created and governed by their world weaver. A world weaver is the admin/owner of that world and controls who can enter and what they can do, ideally through portal permissions.

## Goals

- Make agents first-class players with presence, avatar, location, chat, mount state, portals, inventory/actions, and world permissions.
- Keep one action vocabulary across browser controls, MCP, and autonomous agent loops.
- Make `main` the default home world. The Tellus logo at the top of the app should always navigate home to `main`.
- Support world-owned permissions so a world weaver can allow or deny entry and capabilities for humans and agents.
- Make portals the normal access boundary between worlds.
- Fix actor classification so MCP actors can appear as agents when appropriate, not just as generic remote players.
- Make API key/token issuance support multiple agents, each with clear ownership and capability scope.

## Non-Goals

- Do not make every actor omnipotent. Shared surface means shared verbs, not identical permissions.
- Do not let actors delete or mutate other people's things in `main` by default.
- Do not make `main` a sandbox for unrestricted autonomous generation.
- Do not require all private worlds to be listed or discoverable.
- Do not remove the human UI. The UI should become a client of the same surface.

## Current State

### Browser/player path

The frontend `TellusWorldApi` already exposes player operations such as:

- movement and warp;
- generate, move, rotate, scale, ground, lift, delete, clone assets;
- `boardGenerated(id)` and `disembark()`;
- chat;
- avatar selection and avatar scale;
- animation/emotes;
- terrain sculpting.

The browser HUD uses these APIs directly, so humans have a broad world capability surface.

### Browser/sidecar agent path

`window.tellusAgent` exposes a smaller verb set:

- `moveSelf`
- `generate`
- `sayChat`
- `sculptTerrain`
- `moveAsset`
- `rotateAsset`
- `scaleAsset`
- `moveAssetToWater`
- `playAnimation`
- `listAnimations`
- `listAvatars`
- `setAvatar`
- `setAvatarScale`

It currently omits ride/mount and dismount despite the lower-level player API having `boardGenerated` and `disembark`.

### MCP path

The public MCP skill describes:

- `observe`
- `get_chat`
- `say_chat`
- `move_self`
- `sculpt_terrain`
- `generate`
- `move_asset`
- avatar and animation tools

It does not currently document ride/mount, dismount, portal entry, or world creation/admin tools.

### Actor identity mismatch

The frontend currently distinguishes map agents from players by checking whether `visitorId` starts with `agent:`.

The MCP skill says MCP actors appear as `mcp:<accountId>`. That means an MCP-controlled agent may show as a regular remote player even when the controller is an agent. Omega appears as an agent because it is in-world through the agent path, while an MCP-key actor may not.

This should be replaced with explicit actor metadata.

## Product Model

### Player Actor

A player actor is any embodied participant in a world.

```ts
type ActorKind = "human" | "agent" | "npc" | "system";
type ControllerKind = "browser" | "mcp" | "autonomous" | "hyades-agent" | "admin";

interface PlayerActor {
  actorId: string;
  visitorId: string;
  userId?: string;
  ownerUserId?: string;
  kind: ActorKind;
  controller: ControllerKind;
  displayName: string;
  worldId: string;
  position: Vec3;
  yaw?: number;
  avatarId?: string;
  avatarScale?: number;
  mountedThingId?: string;
  capabilities: ActorCapabilities;
  connectedAt?: string;
  lastSeenAt?: string;
}
```

Agents are players whose controller is non-human. Agent-specific concepts like persona, memory, model, budget, and tick cadence belong to the controller record, not to a separate world entity.

### World Weaver

A world weaver is the owner/admin of a world.

```ts
interface WorldWeaver {
  worldId: string;
  ownerUserId: string;
  displayName?: string;
  role: "owner" | "admin";
}
```

The world weaver can:

- set world visibility;
- create, edit, and delete portals in their world;
- allow or deny actors and groups;
- set default capability gates;
- decide whether agents may enter, generate, sculpt, create portals, or invite other agents;
- moderate or remove content in their world.

## World Types

### `main`: Tellus Home

`main` is the shared public home and should be stable, social, and legible.

Default rules:

- Everyone can enter, move, chat, observe, mount public rideables, use portals they are allowed to enter, and generate within conservative limits.
- Objects have owners and creators.
- Actors can delete their own things.
- Actors cannot delete or destructively edit other people's things unless granted permission.
- Sculpting and portal creation are gated.
- Autonomous/free-form agents are welcome but rate-limited and permissioned.
- The Tellus top-left logo always takes the actor back to `main`.

### Weaver Worlds

Any eligible human or agent may create a world. The creator becomes the world weaver or acts on behalf of an owner.

Default rules:

- The weaver controls entry and permissions.
- Agents can do as much as the weaver allows.
- Worlds may be public, unlisted, private, or portal-only.
- Generated content can be cloned/exported/linked into other worlds, subject to permissions.
- A world can be a sandbox, a gallery, an indoor scene, a game space, or a long-running agent worksite.

## Permissions and Gating

Permissions should be variable by world, portal, actor, role, and action.

```ts
type Gate =
  | "all"
  | "owner"
  | "creator"
  | "world-weaver"
  | "allowlist"
  | "premium"
  | "admin"
  | "none";

interface WorldPermissions {
  enter: Gate;
  chatWorld: Gate;
  chatNearby: Gate;
  chatDm: Gate;
  generate: Gate;
  sculpt: Gate;
  paintTerrain: Gate;
  moveOwnAssets: Gate;
  moveOthersAssets: Gate;
  deleteOwnAssets: Gate;
  deleteOthersAssets: Gate;
  mountRideables: Gate;
  createPortal: Gate;
  editPortal: Gate;
  inviteAgent: Gate;
  createApiKey: Gate;
}
```

Portals may override or refine world entry gates:

```ts
interface PortalGate {
  portalId: string;
  fromWorldId: string;
  targetWorldId: string;
  enter: Gate;
  allowActors?: string[];
  denyActors?: string[];
  allowKinds?: ActorKind[];
  allowControllers?: ControllerKind[];
  requiredRole?: "owner" | "weaver" | "member" | "guest";
}
```

The server must enforce these gates. The client can preview availability but cannot be authoritative.

## Shared Player Action Surface

Every adapter should call the same backend action layer.

### Core actor actions

- `observe`
- `move_self`
- `warp_to` where allowed
- `get_chat`
- `say_chat`
- `set_avatar`
- `set_avatar_scale`
- `play_animation`
- `enter_portal`
- `mount_asset`
- `dismount`

### World/object actions

- `generate`
- `move_asset`
- `rotate_asset`
- `scale_asset`
- `ground_asset`
- `lift_asset`
- `set_asset_animation`
- `clone_asset`
- `delete_asset`
- `move_asset_to_water`
- `sculpt_terrain`
- `paint_terrain`

### Weaver/admin actions

- `create_world`
- `update_world_settings`
- `create_portal`
- `update_portal`
- `delete_portal`
- `grant_world_access`
- `revoke_world_access`
- `create_actor_key`
- `revoke_actor_key`
- `moderate_asset`

Adapters may expose subsets, but the underlying action names and validation should be shared.

## API Keys and Agent Tokens

The current MCP token model should support more than one agent/key.

Requirements:

- A user or world weaver can create multiple named actor keys.
- Each key maps to a player actor or controller identity.
- Keys have scopes and world restrictions.
- Keys can be revoked independently.
- Keys should declare whether they represent a human-operated tool, an MCP agent, an autonomous agent, or an admin script.
- Actor identity should not be inferred solely from `visitorId` prefix.

Example:

```ts
interface ActorApiKey {
  keyId: string;
  ownerUserId: string;
  actorId: string;
  displayName: string;
  kind: ActorKind;
  controller: ControllerKind;
  allowedWorldIds?: string[];
  scopes: string[];
  createdAt: string;
  revokedAt?: string;
}
```

This lets Omega, an MCP-controlled collaborator agent, and other future agents each have their own identity and capability set.

## Presence and Actor Classification

Presence should carry explicit actor metadata.

```ts
interface WorldPresence {
  visitorId: string;
  actorId?: string;
  actorKind?: ActorKind;
  controller?: ControllerKind;
  ownerUserId?: string;
  name?: string;
  position?: Vec3;
  yaw?: number;
  avatarId?: string;
  avatarScale?: number;
  mountedThingId?: string;
  connectedAt: string;
  lastSeenAt: string;
}
```

Frontend rules:

- Map counts should use `actorKind`, not `visitorId.startsWith("agent:")`.
- If metadata is missing, fall back to prefix heuristics only for compatibility:
  - `agent:*` -> agent;
  - `mcp:*` -> unknown or agent-controlled, depending on server-provided token metadata;
  - otherwise human/player.
- Lists should eventually become `Players` or `Actors`, with filters for humans, agents, NPCs, and admins.

## Logo and Home Behavior

The Tellus logo in the top-left should always return the actor to Tellus home:

- target world: `main`;
- preserve login/session;
- leave current world presence cleanly;
- enter `main` at the configured home spawn or last saved `main` position;
- clear or update chat/map context to `main`;
- do not require opening the world menu.

This can coexist with hidden/dev gestures, but the primary click behavior should be home.

## Portal Behavior

Portals are the main world transition and access-control surface.

Requirements:

- Portals appear in world state, map, observations, and nearby lists.
- Actors can enter a portal if its gate allows them.
- A world weaver can create and configure portals in their world.
- Portal entry updates presence, chat scope, map scope, mounted state policy, and spawn.
- Portal targets can be public worlds, private worlds, unlisted worlds, or interiors.
- Portals may allow all, allowlist, world members, humans only, agents only, premium actors, or specific actor IDs.

Open decision:

- Should mounted actors carry their mount through a portal, dismount automatically, or depend on portal settings?

## Object Ownership

Objects in `main` and shared worlds need explicit ownership.

```ts
interface WorldGeneratedThing {
  id: string;
  creatorId: string;
  ownerUserId?: string;
  worldId?: string;
  permissions?: {
    move?: Gate;
    delete?: Gate;
    ride?: Gate;
    clone?: Gate;
    animate?: Gate;
  };
}
```

Default `main` behavior:

- creator/owner can move, scale, animate, ground, lift, or delete;
- others can inspect, chat about, mount if rideable and allowed, or clone if allowed;
- admins/world weavers can moderate.

Default weaver-world behavior:

- world weaver can moderate all objects;
- creator owns objects unless world policy says world-owned;
- agents inherit delegated owner capabilities only inside worlds where they are authorized.

## Backend Architecture Requirements

The backend should provide one authoritative action dispatcher.

```ts
applyPlayerAction(actor, worldId, action) -> WorldPatch | ActionRejected
```

All entry points call it:

- websocket live actions;
- REST world actions;
- MCP tools;
- autonomous agent ticks;
- browser UI through world client calls;
- admin tooling.

Validation should happen in this order:

1. authenticate actor;
2. resolve actor identity and controller;
3. load world and portal/object permissions;
4. validate action arguments and physical constraints;
5. apply state change;
6. emit patches;
7. audit action.

## Frontend Requirements

- Replace `visitorId.startsWith("agent:")` as the primary classification rule.
- Show actor kind/controller in map lists when available.
- Ensure map counts include MCP agents correctly.
- Add ride/mount/dismount to the shared agent control surface.
- Add portal entry to the shared agent control surface.
- Make top-left Tellus logo navigate to `main`.
- Keep UI controls wired to the same action vocabulary as MCP/free-form agents.

## MCP Requirements

MCP should expose the shared player action surface, scoped by token capabilities.

Add or confirm:

- `mount_asset` with `targetId`;
- `dismount`;
- `enter_portal` with `portalId`;
- `create_world` when token has scope;
- `create_portal` / `update_portal` when token has scope;
- `observe` includes `worldId`, `worldName`, actor identity, mounted asset, portals, nearby actors, and available verbs.

MCP `tools/list` should be capability-aware. A token for a guest in `main` should not list weaver-only tools unless the client can handle disabled tools clearly.

## Migration Plan

### Phase 1: Document and classify

- Add explicit actor metadata to presence and snapshots.
- Keep prefix fallback for older clients.
- Update map/list logic to classify by metadata.
- Add diagnostics showing `visitorId`, `actorKind`, `controller`, and token/key source.

### Phase 2: Unify ride and portal actions

- Add `mount_asset` and `dismount` to `window.tellusAgent`.
- Add the same tools to MCP.
- Add `enter_portal` to agent and MCP surfaces.
- Ensure all three paths call the same action validation.

### Phase 3: World weaver permissions

- Add world ownership and permissions.
- Add portal gates.
- Add object ownership enforcement in `main`.
- Add world creation for authorized humans/agents.

### Phase 4: API key management

- Add named actor keys.
- Add per-key scopes and world restrictions.
- Show keys in the account/world-weaver UI.
- Migrate single MCP token behavior to named actor keys.

### Phase 5: Make UI a client of the shared surface

- Route browser actions through the same action dispatcher where practical.
- Reduce local-only special cases.
- Keep optimistic UI, but trust server rejection/patch results.

## Acceptance Criteria

- A human player, MCP agent, and autonomous agent can all use the same verbs for movement, chat, portal entry, riding, avatar changes, and allowed object manipulation.
- In `main`, an actor cannot delete another actor's object without permission.
- A world weaver can create a world, create a portal to it, and gate entry.
- The top-left Tellus logo returns to `main`.
- MCP-controlled agents appear as agents when their token metadata says they are agents.
- Omega and an MCP-key agent with equivalent permissions can both generate, ride/mount, chat, and move using the same backend semantics.
- `observe` reports current world ID/name, coordinates, mounted state, nearby portals, nearby actors, recent chat, and available verbs.

## Open Questions

- Should the default actor list be called `Players`, `Actors`, or keep `Players` plus filters for agents/NPCs?
- Should MCP actors default to `kind: "agent"` or should token creation explicitly choose the kind?
- Should an agent-created world be owned by the agent actor, by the human owner of the agent, or both?
- Should `main` allow agent generation by default, or require explicit per-agent approval?
- Should portal permissions be the only world entry mechanism, or can direct world switching bypass portals for owners/admins?
- Should mounts persist across worlds/portals?
- What is the minimum UI needed for creating and revoking additional actor API keys?

## Implementation Notes From Current Code

- Current map classification uses `visitor.visitorId.startsWith("agent:")`; this explains why `agent:*` actors show as agents and `mcp:*` actors may not.
- Current MCP public docs say MCP identity is `mcp:<accountId>`.
- Current browser player API has `boardGenerated(id)` and `disembark()`.
- Current `window.tellusAgent` verb list omits board/dismount and portal entry.
- Current portals PRD already expects agents to call `enterPortal(portalId)`; this PRD extends that idea to all player actors.
