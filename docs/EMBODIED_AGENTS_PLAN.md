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

### Progressive capabilities, social agents, and collaboration

[Hyades issue #39](https://github.com/MonumentalSystems/hyades/issues/39) is the
architecture thread for the remaining maker-agent platform:

- a small bootstrap tool surface with search/open/run/verify progressive
  capability discovery; and
- bounded maker-granted leases for higher-risk actions, including portal and
  trigger authoring.

The first progressive-capability slice is implemented on the deployed Hyades
contract behind `Tellus:Features:AgentCapabilities`. Tellus now has a companion
maker UI in each agent card that reads the agent's active goal, searches the
capability catalog, and shows current leases and recent workflows. Makers can
grant a capability only for the agent's current goal and world, with explicit
time, invocation, and execution-time bounds, and can revoke the resulting
lease. The UI treats feature-dark `404`/`405` responses as a rollout boundary;
Hyades remains authoritative for maker identity, world access, goal matching,
feature flags, lease validity, and workflow execution.

The delegated-creation and typed-social slices are now implemented on Hyades and
their Tellus controls treat feature-dark responses as rollout boundaries. Phase
3B adds a maker-scoped collaboration grain for shared goals, roles, atomic task
claims, artifacts, and review gates without placing coordination on a world
grain. Tellus exposes project/member/task/review controls only when those guarded
routes are available; makers remain the flat owner and agents retain stable
membership as they move between worlds. Phase 4 now adds a maker-facing
procedural asset-workshop client over the durable Hyades job: agents or makers
can submit bounded briefs and allow-listed references, inspect passes,
deterministic gates and registry artifacts, then approve, revise, or reject.
The UI treats feature-dark routes as a rollout boundary and never places an
asset as a side effect of approval. Phase 5 adds the isolated Blender choice and
only exposes server-curated workflow IDs; no Python, script, macro, tool-path,
or credential input crosses the public client contract.

### Deterministic activities and creative workshops — proposed

Conversational agents may guide, recruit, explain, and collaborate, but an LLM
must not own race entrants, clocks, checkpoints, penalties, or results. The
[world-module design](./WORLD_MODULES_MINIGAMES_PRD.md) keeps those rules in an
authoritative module service and lets triggers wake a steward around it.

Creative-workshop jobs sit behind durable, budgeted orchestration. Phase 4's
procedural path requires GLB, resource-bound, provenance, and registry-ingest
evidence plus maker approval before the normal placement workflow can use its
stable model URL. Phase 5's Blender adapter adds isolated-worker validation
gates and curated workflows. Hyades supplies the server-owned macro vocabulary;
the browser cannot submit arbitrary autonomous Python or receive Hyades secrets.

### Ongoing client work

- Continue aligning human, autonomous-agent, and MCP capabilities through the
  shared player surface without weakening ownership checks.
- Expand evaluation evidence and outcome-review UX on the deployed contract.
- Improve avatar and animation variety for larger agent populations.
- Extend the shipped water-safe land behavior and stranded-agent recovery to
  more explicit vehicle and activity-module navigation contracts.
