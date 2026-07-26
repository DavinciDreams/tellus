# Embodied agents: implementation status and direction

**Status (2026-07): server-side embodied agents and maker-owned multi-agent
controls are shipped.** The old browser-run autonomous AI loop has been retired.
Hyades is authoritative for agent identity, lifecycle, decisions, budgets, and
world actions; Tellus is the interactive control and rendering client.

## Ownership and identity

- Agents belong to the authenticated maker represented by `makerUserId`.
- Each directory entry exposes an `agentId`, `worldId`, presence `visitorId`,
  lifecycle flags, optional avatar, and whether it is the maker's default
  companion.
- The server derives and enforces ownership. The browser does not accept a wire
  name or arbitrary user id as authority.
- Agent presence and actions use the same world snapshot/live-patch surface as
  other embodied participants.

## Current Hyades client contract

Tellus uses the authenticated `/api/tellus/agents` lifecycle API:

```text
GET    /api/tellus/agents
POST   /api/tellus/agents
POST   /api/tellus/agents/{agentId}/start
POST   /api/tellus/agents/{agentId}/stop
POST   /api/tellus/agents/{agentId}/place
DELETE /api/tellus/agents/{agentId}
```

Creation accepts a world, name, and optional persona. Placement moves an owned
agent to the selected world. Lifecycle responses are normalized before entering
UI state, and destructive deletion requires confirmation.

## Current Tellus experience

- The Agent panel shows a compact maker-owned roster with world and
  awake/sleeping/stopped state.
- Makers can create multiple named agents, start or stop them, bring them to the
  current world, and delete them.
- The default companion retains the richer persona, memory, chat, and viewport
  controls.
- A client connected to an older Hyades deployment hides plural controls when
  the directory route returns `404` or `405`; the existing companion surface
  continues to work.

## Evaluation evidence

The client includes a narrow deterministic rendering surface for agent
evaluation:

- camera yaw, pitch, avatar scale, and output dimensions are bounded;
- Hyades can push an authoritative snapshot immediately before capture;
- the observed agent's own capsule is hidden from its evidence image;
- the legacy capture entry point remains available;
- the roster displays the latest evaluation job status, decision, summary, and
  timestamp when supplied by Hyades;
- missing evaluation fields are treated as mixed-version data rather than an
  error.

Evaluation decisions remain server-authoritative. The browser only renders the
requested evidence and displays the returned summary.

## Lifecycle and cost behavior

Starting an agent is explicit so Tellus does not silently spend tokens. Hyades
can sleep an agent when its owner leaves, subject to premium/offline-persistence
policy, and exposes status and token-budget information to the default companion
surface. The client never embeds the Hyades bearer key.

## Remaining work

- Continue aligning human, autonomous-agent, and MCP capabilities through the
  shared player surface without weakening ownership checks.
- Expand evaluation UX only after the Hyades feature flag and backend contract
  are enabled together.
- Improve avatar and animation variety for larger agent populations.
- Keep agent movement and building water-aware, including vehicle-specific
  movement and recovery for an agent already stranded in water.
