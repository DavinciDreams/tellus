# Embodied agents: implementation status and direction

**Status (2026-07): server-side embodied agents, maker-owned multi-agent
controls, evaluation evidence, and editable friendly names are shipped.** The
old browser-run autonomous AI loop has been retired. Hyades is authoritative
for agent identity, lifecycle, decisions, budgets, and world actions; Tellus is
the interactive control and rendering client.

## Ownership and identity

- Agents belong to the authenticated maker represented by `makerUserId`.
- Each directory entry exposes an `agentId`, `worldId`, presence `visitorId`,
  mutable `name`, lifecycle flags, optional avatar, and whether it is the
  maker's default companion.
- The friendly name is presentation only. Renaming never changes the immutable
  agent id, grain key, maker, world placement, memory, or conversation.
- The server derives and enforces ownership. The browser does not accept a wire
  name or arbitrary user id as authority.
- Agent presence and actions use the same world snapshot/live-patch surface as
  other embodied participants.

## Current Hyades client contract

Tellus uses the authenticated `/api/tellus/agents` lifecycle API:

```text
GET    /api/tellus/agents
POST   /api/tellus/agents
PATCH  /api/tellus/agents/{agentId}
POST   /api/tellus/agents/{agentId}/start
POST   /api/tellus/agents/{agentId}/stop
POST   /api/tellus/agents/{agentId}/place
DELETE /api/tellus/agents/{agentId}
```

Creation accepts a world, name, and optional persona. `PATCH` accepts only the
new friendly name for an agent resolved from the verified maker directory.
Placement moves an owned agent to the selected world. Lifecycle responses are
normalized before entering UI state, and destructive deletion requires
confirmation.

## Current Tellus experience

- The Agent panel shows a compact maker-owned roster with world and
  awake/sleeping/stopped state.
- Makers can create multiple named agents, rename them, start or stop them,
  bring them to the current world, and delete them.
- Friendly names appear in presence, chat tabs, conversation attribution,
  viewport labels, generation logs, and roster actions. Stable ids continue to
  drive authorization and addressing.
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
requested evidence and displays the returned summary. Hyades evaluation is
enabled in production; future UX work can build on the live contract rather
than treating feature enablement as an outstanding prerequisite.

## Lifecycle and cost behavior

Starting an agent is explicit so Tellus does not silently spend tokens. The
current maker-presence behavior (named `makerPresent` in the proposed policy
model below) can sleep an agent when its owner leaves, subject to
premium/offline-persistence policy, and exposes status and token-budget
information to the default companion surface. The client never embeds the
Hyades bearer key.

## Roadmap and in-progress architecture

### World triggers and event-driven residents — implementation rollout

[Hyades PR #43](https://github.com/MonumentalSystems/hyades/pull/43) implements a
per-world trigger grain, bounded authoritative world frames, swept
enter/exit/dwell detection, durable event ids, and enqueue-only/coalesced agent
wake. It also separates three runtime policies:

- `makerPresent`: today's owner-presence behavior;
- `eventDriven`: retain a cheap presence lease but open an LLM turn only for a
  permitted event; and
- `resident`: keep an autonomous cadence while accepting event wakes.

The concierge and boat-dock examples are acceptance scenarios, not bespoke
backend callbacks. Automatic world/nearby greetings remain separate from DM
consent; friendships, open-DM policy, block, and mute still gate direct contact.
The Tellus owner panel can create sphere or box volumes, bind an agent in the
same world, select runtime policy, inspect bounded diagnostics, and preview
volumes. It treats feature-dark `404` responses as a rollout boundary and hides
the controls until Hyades enables `Tellus:Features:WorldTriggers`.

### Progressive capabilities, social agents, and collaboration — proposed

[Hyades issue #39](https://github.com/MonumentalSystems/hyades/issues/39) is the
architecture thread for the remaining maker-agent platform:

- a small bootstrap tool surface with search/open/run/verify progressive
  capability discovery;
- bounded maker-granted leases for higher-risk actions, agent creation, and
  portal authoring;
- typed agent social principals extending the existing friends graph;
- durable cross-world/offline DM threads with consent and inbox wake; and
- shared collaboration/workspace grains for multi-agent goals, roles, claims,
  artifacts, and review gates.

Human friends and cross-world presence are already shipped. Extending those
contracts to stable agent principals is proposed and must not be inferred from
the current human UI.

### Deterministic activities and creative workshops — proposed

Conversational agents may guide, recruit, explain, and collaborate, but an LLM
must not own race entrants, clocks, checkpoints, penalties, or results. The
[world-module design](./WORLD_MODULES_MINIGAMES_PRD.md) keeps those rules in an
authoritative module service and lets triggers wake a steward around it.

The later creative-workshop phases put reference-to-asset jobs behind durable,
budgeted orchestration. Procedural Three.js work must export a validated GLB or
restricted schema before placement. Blender/MCP access must use isolated
workers, curated macros, quotas, allow-listed export paths, validation, and no
arbitrary autonomous Python or Hyades secrets.

### Ongoing client work

- Continue aligning human, autonomous-agent, and MCP capabilities through the
  shared player surface without weakening ownership checks.
- Expand evaluation evidence and outcome-review UX on the deployed contract.
- Improve avatar and animation variety for larger agent populations.
- Extend the shipped water-safe land behavior and stranded-agent recovery to
  more explicit vehicle and activity-module navigation contracts.
