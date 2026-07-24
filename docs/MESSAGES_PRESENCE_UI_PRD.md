# Tellus Messages and Presence UI System PRD

**Status:** Proposed
**Audience:** Tellus UI, Hyades social/agent, product, and accessibility contributors
**Last audited:** 2026-07-23
**Tellus baseline:** `c4b0b200` (`origin/master`)
**Hyades baseline:** `a60ed680` (`origin/master`)
**Related:** [`TOOLBELT_WORLD_TOOLS_IA_PRD.md`](./TOOLBELT_WORLD_TOOLS_IA_PRD.md), [`FRIENDS_PRESENCE_COMMUNICATION_PRD.md`](./FRIENDS_PRESENCE_COMMUNICATION_PRD.md), [`FRIENDS_RELATIONSHIPS_PHASE_2_PRD.md`](./FRIENDS_RELATIONSHIPS_PHASE_2_PRD.md)

## 1. Decision summary

Tellus should have two obvious social entry points in the bottom dock:

- **Messages** — conversations and activity: World, player DMs, owned-agent threads, and notifications.
- **People** — relationships and presence: Friends, Requests, Nearby, and Your Agents.

The current separate **Chat** and **Agent** dock buttons should become these two entries. Agent conversations belong in Messages; agent lifecycle, placement, identity, and management belong in People under **Your Agents**. Global settings should be reachable from the account/top-bar area, with only the most relevant quick controls repeated inside a conversation or call.

The system must use progressive disclosure. The world HUD shows only meaningful unread or presence signals; the drawer shows scannable summaries; a selected person, agent, or thread reveals actions; advanced policy and device controls remain in Settings. A user should not need to know that friendship currently lives inside a DM tab, nor understand Hyades grain topology, to find another person.

This PRD separates:

1. UI work that can use current Hyades contracts now;
2. new backend contracts required for search, invites, durable messaging, and notifications; and
3. future typed agent-social work already described in Hyades but not yet shipped.

## 2. Problem

Tellus has most of the beginnings of a social system, but not a coherent social experience:

- The dock has **Chat** and **Agent**, although both open the same drawer. DMs have no dock entry of their own.
- Friends, requests, nearby people, DMs, and call controls are all nested inside the chat drawer. A new user cannot predict where **Add friend** lives.
- Adding a friend is primarily offered for someone currently in the same world. Users who spawn elsewhere cannot easily find one another.
- Friend rows are backed by account ids and can fall back to displaying truncated ids because there is no public username/profile resolver.
- The minimap **Share** action copies a world-and-coordinate URL, but does not present itself as a personal invitation or explain what the recipient will do next.
- Same-world DMs are private in transit, but are part of bounded world chat rather than durable cross-world/offline threads.
- The agent tab mixes conversation, memories, settings, viewport, lifecycle, and multi-agent management.
- Voice and video are room-wide same-world WebRTC controls. Starting video also captures the microphone, and remote video is rendered on avatar “TV heads.” The controls look more like a direct call than the transport actually provides.
- Preferences are spread across local storage and contextual controls; there is no global Settings surface for notification, privacy, voice/video, or agent defaults.
- Presence has no calm event hierarchy. The user must keep Tellus open and watch the world to notice a friend arriving or an agent completing work.

The result is technically capable but difficult to discover, and it will become more confusing as players can own several agents and agents gain their own presence and social relationships.

## 3. Goals

- Make Messages, Friends, Requests, Nearby people, and owned agents discoverable without opening unrelated menus.
- Provide a stable UI model that works for both human players and agents without pretending their current backend capabilities are identical.
- Let a user find or invite a friend even when they are in different worlds.
- Provide unobtrusive, configurable presence and activity signals.
- Make current same-world messaging and WebRTC behavior honest and understandable.
- Create frontend seams for future durable DMs, agent social principals, notification delivery, and Discord integration.
- Preserve world rendering performance and input focus while a social drawer is open.
- Meet keyboard, screen-reader, reduced-motion, and non-audio-equivalent accessibility expectations.

## 4. Non-goals

- Implement the future Hyades agent-social grains in this UI change.
- Promise offline or cross-world delivery before a durable thread/inbox contract ships.
- Present the current room-wide WebRTC mesh as a private one-to-one call.
- Replace passkeys or Nostr login in the first Messages/People release.
- Build a Discord bot, OAuth integration, or notification worker in the first release.
- Redesign the overall Tellus visual language or add a large social-network feed.

## 5. Product principles

### 5.1 Progressive disclosure

Every social capability has at most four visible depths:

| Depth | Surface | What appears |
|---|---|---|
| Signal | World HUD | Unread count, one-line toast, presence dot, optional sound |
| Overview | Messages or People drawer | Thread/contact summaries and primary actions |
| Detail | Selected thread/person/agent | Conversation, profile, presence, call or management actions |
| Advanced | Global Settings or overflow menu | Privacy, routing, devices, per-contact policy, diagnostics |

Do not put account linking, microphone selection, friend removal, agent persona editing, and ordinary message sending at the same visual level.

### 5.2 Discoverability before density

- Use labeled **Messages** and **People** dock entries, not icon-only or hidden tabs.
- Put **Add friend** at the top of People and on a nearby player’s detail card.
- Show Requests as a badge and a first-class section, not only inside DMs.
- Give empty states one useful next action: search, copy an invite, or find nearby people.
- Introduce the two new entries with a one-time coach mark and keep them searchable in the command palette.

### 5.3 One social actor model, capability-specific actions

The frontend should normalize players and agents to a shared display identity while gating actions by capability:

```ts
type SocialActor = {
  principalId: string;
  kind: "player" | "agent";
  displayName: string;
  avatarId?: string;
  relationship: "self" | "owned" | "friend" | "nearby" | "none";
  presence: "online" | "away" | "offline" | "unknown" | "sleeping" | "stopped";
  worldId?: string;
  capabilities: Array<"message" | "invite" | "join" | "friend" | "voice" | "video" | "manage">;
};
```

This is a frontend view model, not a claim that Hyades currently accepts typed principals on every social route.

### 5.4 Honest state

- A failed presence refresh is **Status unknown**, not Offline.
- A friend in another world is Online with a **Join** action, but **Message** is disabled or explained until cross-world DMs exist.
- An owned agent is **Sleeping**, **Stopped**, **Working**, or **Needs attention** based on agent status; it is not forced into human online/offline language.
- A same-world room broadcast is labeled **World voice/video**, not **Call Alice**.

### 5.5 Calm by default

The default HUD should use badges and brief visual toasts. Sounds, browser notifications, and external destinations are opt-in and rate-limited. No presence signal should be audio-only.

## 6. Information architecture

### 6.1 Bottom dock

Replace the current entries as follows:

| Current | Proposed | Behavior |
|---|---|---|
| Chat | Messages | Opens the last message view; badge combines unread messages and activity requiring attention |
| Agent | People | Opens People; owned agents are a section alongside Friends, Requests, and Nearby |

The command palette should expose **Open Messages**, **Open People**, **Add friend**, **Copy invite**, and **Open Settings**.

### 6.2 Messages drawer

Desktop: a persistent, resizable right drawer that can be collapsed to a narrow rail without closing the world.
Mobile: a bottom sheet with half-height and full-height stops.
Both: closing the drawer preserves the selected thread and draft.

The overview contains:

1. **World** — current-world conversation and current same-world voice/video state.
2. **Direct messages** — player threads, durable when supported; currently reachable same-world conversations are labeled accordingly.
3. **Agents** — one thread per owned agent once per-agent messaging exists. Until then, expose the default companion thread and explain the limitation rather than duplicating it for every listed agent.
4. **Activity** — friend requests, arrivals, invitations, agent milestones, failures, and completion notices.

Selecting a row replaces the overview with the thread detail. A Back action returns to the overview. Search filters existing rows first; it does not implicitly search the public user directory.

Thread summaries show actor, last message/event, time, unread state, and a concise reachability state. Tool calls and agent execution details remain collapsed behind a **Details** disclosure unless they require the maker’s action.

### 6.3 People drawer

People opens to a compact overview:

1. **Add friend** — exact public handle search and **Invite someone**.
2. **Requests** — incoming count and pending outgoing requests.
3. **Friends** — online first, then unknown, then offline; filterable.
4. **Nearby** — humans and agents currently in the world. Nearby does not imply friendship.
5. **Your Agents** — owned agents with world, state, and primary Start/Stop/Join/Message actions.

Each section initially shows a small number of rows and a **See all** disclosure. Selecting a row opens a detail card with only valid actions. Destructive actions such as Remove friend or Delete agent live in an overflow menu and require confirmation.

Future **Agent contacts** should be a separate, feature-gated section. Do not mix them into player Friends until Hyades supports typed principals and clear consent semantics.

### 6.4 Global Settings

Place a Settings entry in the account/top-bar menu. It is global rather than another crowded dock item.

- **Account & identity:** sign-in methods, public handle/profile, linked services, sessions.
- **Notifications:** event types, in-app/browser/external destinations, quiet hours, sound, per-contact overrides.
- **Voice & video:** microphone, camera, speaker/output where supported, preview, input levels, default join state.
- **Friends & presence:** visibility, invite permissions, join permissions, online/away behavior, blocked accounts when supported.
- **Agents:** default agent behavior, offline persistence explanation, milestone notification defaults, per-agent overrides.
- **Accessibility:** captions/transcripts, reduced motion, notification duration, contrast, sound alternatives.

Contextual surfaces retain quick controls such as mute, camera, and **Notify me about this agent**, with a link to the full settings category.

## 7. Key journeys

### 7.1 Add a friend in another world

1. User opens People and selects **Add friend**.
2. User enters an exact public handle or opens a Tellus invite.
3. Tellus shows a public identity confirmation card before sending a request.
4. Recipient sees a Requests badge and an Activity item, regardless of their current world.
5. After acceptance, both users appear in Friends. Presence is joined from the batch presence endpoint.

Account ids must never be the expected user input. Until a public handle resolver exists, the product should lead with invite links and clearly label any account-id fallback as temporary/advanced.

### 7.2 Invite someone to “join me”

The minimap **Share** action becomes **Invite** and opens a small confirmation sheet:

- inviter’s public display identity;
- destination world and approximate location;
- access note for private worlds;
- **Copy invite link** and native share when available;
- optional **Also send friend request** when the recipient is already known.

The link should carry an opaque, expiring invite token, not a session secret. Opening it resolves an invitation preview before changing worlds. The recipient may **Join**, **Add friend**, or dismiss. Joining and accepting friendship are separate consent actions.

An initial compatibility release may continue reading `?world=&x=&z=` links, but newly created links should use the invite contract once available.

### 7.3 Friend arrives

1. A friend transitions from absent/stale to online in a world.
2. Tellus adds one Activity event and shows a brief toast: “Mara joined Cedar Valley.”
3. The toast offers **Join** when allowed.
4. If enabled, a soft door/chime sound plays after the browser has received user interaction.
5. Reconnect churn, multiple tabs, or world hopping within the cooldown updates the existing event instead of producing a burst.

Recommended defaults: visual toast on, arrival sound off, browser/external notification off. Users can mark particular friends as important.

### 7.4 Agent completes or needs help

Agent events use outcome language rather than raw tick/tool data:

- “Lumen finished the fortress.”
- “Lumen needs your approval.”
- “Lumen stopped after an error.”
- “Lumen started talking with Rowan’s agent.” only when the future social/audit contract explicitly permits this disclosure.

The event opens the corresponding agent thread or evidence view. Routine actions coalesce into a progress summary. Completion and maker-action-required events may notify externally if enabled.

### 7.5 Voice and video

Current behavior is surfaced as **World voice & video**:

- **Listen** controls inbound room audio.
- **Microphone** and **Camera** are independent permissions and controls.
- Starting the camera does not silently imply microphone capture.
- The participant list shows who is connected, speaking, muted, or sharing video.

Remote video appears in a movable picture-in-picture call stage, with focused and grid layouts. Avatars receive a small speaking ring and optional camera badge. The current face-on-TV-head presentation is removed from the default experience; it may remain as an opt-in world effect.

A future one-to-one or group call begins from a DM/thread detail only after Hyades has an invite/accept/end signaling contract. Before that, the UI must not imply private calls.

## 8. Presence and notification behavior

### 8.1 Presence states

Player presentation:

- **Online — here:** fresh registry presence in the current world, enriched by live world presence.
- **Online — world name:** fresh registry presence elsewhere.
- **Away:** future explicit/idle state; do not infer until policy is defined.
- **Offline:** a successful presence query omitted the accepted friend.
- **Status unknown:** the query failed, has never completed, or is stale beyond the client confidence window.

Owned-agent presentation:

- **Working:** opted in and enabled.
- **Sleeping:** opted in but not enabled because the owner is absent and offline persistence is unavailable.
- **Stopped:** not opted in.
- **Needs attention:** a durable agent event requires maker input or reports failure.
- **Status unknown:** status read failed.

### 8.2 Event priority

| Priority | Examples | Default treatment |
|---|---|---|
| Passive | friend changes world, agent starts routine work | Activity only; update row |
| Notable | friend comes online, invite received, agent milestone | badge + visual toast |
| Action required | friend request, agent asks for approval, call invitation | persistent badge + actionable toast |
| Urgent | explicit safety/billing/security failure | persistent alert; external channel only if configured |

Events deduplicate by actor + type + subject and use cooldowns. Quiet hours suppress sound and external delivery while preserving the Activity item. Users can mute a thread, person, agent, event type, or all non-urgent events.

### 8.3 Notification destinations

The preference model should support destinations independently:

```ts
type NotificationRule = {
  eventType: string;
  enabled: boolean;
  destinations: Array<"in_app" | "browser" | "discord">;
  sound: "none" | "soft_chime";
  quietHours?: { start: string; end: string; timeZone: string };
  actorIds?: string[];
};
```

Discord is a later destination, not a requirement for the base UI. Discord login/account linking and Discord notification delivery are separate grants. A user must be able to revoke either without losing their Tellus account. Server/channel destinations need explicit allow-listing; direct messages or a private app inbox should be the safe default before server posting.

## 9. Current contract audit

The following matrix was checked against Hyades `origin/master` at `a60ed680`. Hyades PR #41 was also reviewed; it adds agent evaluation/evidence routes and status fields but does not implement the social contracts listed as future below.

### 9.1 Available now

| Capability | Hyades contract | Frontend implication |
|---|---|---|
| Friend graph | `ITellusFriendsRegistryGrain` v1, singleton key `global` | One atomic record per sorted account-id pair; Pending/Accepted states |
| List relationships | `GET /api/tellus/friends` | Returns `friends`, `pendingIncoming`, `pendingOutgoing` with account ids and epoch-ms timestamps |
| Mutate relationships | `POST /api/tellus/friends/request`, `/accept`, `/decline`; `DELETE /api/tellus/friends/{userId}` | Verified `X-Tellus-Session` only; crossed requests converge; mutations are retry-safe |
| Friend limits | 500 accepted, 100 incoming pending, 100 outgoing pending, 20 new outgoing/hour, 24-hour decline/remove cooldown | UI must surface 409/429 and `Retry-After`; do not implement optimistic state that contradicts the response |
| Player presence | `ITellusPresenceRegistryGrain` v1, singleton key `global` | One fresh human row per stable user id: world, display name, avatar, last seen |
| Batch presence | `GET /api/tellus/presence?users=a,b` | Use for accepted friends; omitted rows mean offline only after a successful request |
| Online roster | `GET /api/tellus/presence/online?withinSeconds=N` | Broad discovery/diagnostic seam; do not make it the default Friends data source |
| World live channel | `GET /api/world/{worldId}/live` WebSocket | Snapshot then patches; same-world chat, presence, and WebRTC signaling |
| Same-world DMs | world chat action with `channel: "dm"`; socket filters to sender and recipient | Private to current participants but world-bound and non-durable; label reachability honestly |
| Maker agent directory | `ITellusMakerAgentDirectoryGrain` v1 | Stable public `agentId` maps to an immutable grain key; maker ownership comes from the verified session |
| Maker agent lifecycle | `GET/POST /api/tellus/agents`, `GET /{agentId}`, `POST /{agentId}/place|start|stop`, `DELETE /{agentId}` | Supports Your Agents list, placement, lifecycle, and multiple agents per maker |
| Default-agent chat | `POST /api/world/{worldId}/agent/say`, `GET /agent/transcript` | Enqueue + wake and bounded transcript for the maker’s compatibility/default agent only |
| World WebRTC | `signal` patches on the current world socket; ICE from `GET /api/tellus/ice` | Existing full mesh is same-world, room-wide, and requires an open world socket |

Important contract details:

- Friendship actor identity is always the verified account session. Soft `?userId=` and `X-Tellus-User` values are not friendship authority.
- Presence currently accepts a stable Tellus actor, including the soft identity path. It is human-only and the online-roster route is broadly visible to any stable Tellus identity.
- Friend responses provide ids, not resolved public profiles. The current account `label` is not exposed as a unique searchable public handle.
- Agent status is authoritative for the agent’s current `worldId`; the maker directory’s world is a repairable listing hint.
- Maker-agent rows include lifecycle state and provenance (`createdByPrincipalId`, `supervisorAgentId`, `lineageDepth`) but current Tellus types do not yet consume all additive fields.
- Current agent presence inside a world uses visitor ids shaped `agent:{agentId}`. That does not make the agent a principal in the friends registry or cross-world presence registry.

### 9.2 Required new or amended contracts

| Need | Proposed contract responsibility | Why current contracts are insufficient |
|---|---|---|
| Public identity lookup | Exact-handle resolver returning a minimal public profile and stable account principal | Friends accepts raw account ids; no public username search exists |
| Invite | Opaque invite grain/token with inviter principal, destination, expiry, access policy, and optional use/revocation limits | Current URL contains only world/x/z and cannot confirm inviter identity |
| Durable player DMs | Pair-keyed thread grain plus per-principal inbox/unread index; idempotent sends and cursored reads | Same-world DM is bounded world chat and cannot deliver offline/cross-world |
| Per-agent maker chat | Routes keyed by owned `agentId` for send, transcript/events, cursor, and unread state | Current maker routes manage agents, while `/world/{world}/agent/say` targets only the default compatibility agent |
| Activity/notification outbox | Durable event ids, category, actor/subject, timestamp, severity, read state, and delivery attempts | Client polling cannot reliably notify after the browser is closed |
| Notification preferences | Account-level rules, quiet hours, per-actor overrides, destination grants | Local storage cannot coordinate devices or external delivery |
| Call sessions | Invite/accept/reject/end state, participant authorization, scoped signaling, TURN diagnostics | Current signaling is broadcast-and-filter within one world |
| Discord account link | OAuth identity link and separately revocable notification destination grant | No Discord auth/link route exists today |
| Presence privacy | Visibility policy and authorization for roster/batch reads | Current global online roster is broad and has no user visibility preference |

### 9.3 Planned in Hyades, not available now

The Hyades maker-agent PRD describes these as Phase 3, not current wire contracts:

- stable agent ids as namespaced social principals (`agent:{id}` alongside `acct:{id}`);
- agent lifecycle-backed cross-world presence;
- extending the existing friends registry to typed player/agent pairs;
- durable pair-keyed DM thread grains and per-principal inboxes;
- friendship or explicit open-DM consent for new threads;
- enqueue-only agent delivery with a coalesced non-reentrant wake;
- a later collaboration/workspace grain for shared multi-agent projects.

The Tellus UI may reserve component and type seams for these capabilities, but it must hide or label them unavailable until deployed routes and authorization are verified.

## 10. Proposed backend shapes

These are product-facing requirements, not final Orleans interface definitions.

### 10.1 Public profile resolver

```text
GET /api/tellus/people/resolve?handle=<exact>
-> { principalId, handle, displayName, avatarId?, canReceiveFriendRequest }
```

- Require an authenticated session.
- Exact normalized match only in the first version; no enumerable prefix search.
- Rate-limit and return a generic not-found response.
- Keep account ids out of ordinary UI, although the friend mutation may continue using the resolved account principal internally.

### 10.2 Invite

```text
POST /api/tellus/invites
{ worldId, x, z, expiresInSeconds, maxUses? }
-> { inviteToken, url, expiresAt }

GET /api/tellus/invites/{token}
-> { inviter, world, approximateLocation, expiresAt, canJoin, canRequestFriendship }
```

- Creation requires a verified session and world access.
- Resolution must not reveal private-world details before access is checked.
- The server revalidates access on Join; coordinates are a convenience, never authorization.

### 10.3 Message thread

```text
MessageThread {
  threadId, participantPrincipalIds[], kind, createdAt,
  lastMessageAt, latestSequence, policyVersion
}

Message {
  messageId, threadId, sequence, senderPrincipalId,
  sentAt, body, kind, replyTo?, clientIdempotencyKey
}
```

- Thread authorization is evaluated by the authoritative relationship/open-DM policy.
- Writes are idempotent; reads are cursor/sequence based.
- Inbox unread cursors belong to each principal, not to a device.
- Sending to an agent appends durably and schedules work; it never waits for an LLM response inline.
- Attachments, editing, deletion, and end-to-end encryption are separate later decisions.

### 10.4 Activity event

```text
ActivityEvent {
  eventId, recipientPrincipalId, category, actorPrincipalId?,
  subjectId?, occurredAt, priority, summary, action?, dedupeKey,
  readAt?, expiresAt?
}
```

Agent completion events should reference durable evidence or a thread sequence rather than embedding unbounded tool output. External delivery records event id + destination + outcome so retries do not duplicate messages.

## 11. Privacy and safety

- Do not expose friendship lists, requests, notification destinations, or owned-agent data through soft identity.
- Do not place session tokens, raw credentials, or private-world authorization in invite URLs.
- Make presence visibility user-configurable before broad roster discovery becomes a prominent UI.
- Keep **Join me**, **Add friend**, **Message**, and **Call** as distinct permissions and actions.
- Block/mute/report concepts should be designed before public fuzzy user search or open DMs.
- Agent-to-agent contact needs maker consent, auditability, rate limits, and clear ownership. An agent must not grant itself a broader social identity from model arguments.
- External notifications must avoid leaking message bodies, private world names, or agent work details unless the user explicitly selects that level of preview.
- Camera and microphone permissions are separate, visible, and revocable. Display active capture persistently.

## 12. Accessibility requirements

- Messages, People, tabs, thread lists, disclosures, menus, and call controls are fully keyboard operable with visible focus.
- Drawers use appropriate dialog/complementary semantics without trapping focus unnecessarily on desktop; mobile modal sheets return focus to the invoking dock button.
- Unread counts and presence changes have text labels; color and sound are never the only signal.
- Presence announcements use a polite live region and coalesce bursts. Urgent alerts use assertive announcements sparingly.
- Status dots meet non-text contrast requirements and accompany visible text in detail views.
- Reduced-motion mode removes sliding/bouncing presence effects and uses fades or immediate state changes.
- Sounds have captions/text equivalents, independent volume/mute controls, and no required meaning.
- Video supports captions/transcripts when a transcription service exists; the layout must remain usable without video.
- Touch targets are at least 44 by 44 CSS pixels where practical, including dock badges and overflow actions.
- The world remains operable at 200% zoom and common mobile viewport widths while a drawer is collapsed.

## 13. Performance and reliability

- Batch accepted-friend ids through one presence request. Never poll once per friend or once per known world.
- Pause nonessential polling while the document is hidden; refresh on focus and on drawer open.
- Preserve the last successful friend list and mark presence Unknown on transient failure.
- Keep message/activity lists virtualizable and cursor-based; do not load full agent transcripts into the render loop.
- Social state updates must not trigger Three.js scene rebuilds or animation-loop work.
- Deduplicate live patches, polling results, multiple tabs, and reconnects by stable event/message ids.
- Degrade independently: a failed notification destination must not fail message delivery; a failed presence query must not erase relationships.

Diagnostics should report last successful friend/presence/message sync, unread counts, active call transport state, and agent-status failures through the existing Tellus diagnostics pattern. They must not log message bodies, tokens, or private invite payloads.

## 14. Delivery plan

### Phase 1 — Coherent UI on current contracts

- Replace Chat/Agent dock entries with Messages/People.
- Move Friends, Requests, Nearby, and Your Agents into People.
- Create the Messages overview with World, reachable same-world DMs, default-agent conversation, and local Activity.
- Retain current friend and batch-presence clients; stop using the broad online roster for the normal Friends list.
- Relabel WebRTC as World voice & video, split microphone/camera controls, and render remote video in PiP rather than TV heads.
- Add global Settings shell with local-device notification and voice/video preferences.
- Rename minimap Share to Invite while retaining legacy location-link compatibility.

No new Hyades social grain is required for this phase, but per-agent threads, external notifications, and cross-world delivery remain visibly unavailable.

### Phase 2 — Public identity and real invites

- Ship exact public-handle/profile resolution and account profile editing.
- Ship opaque invitation creation/resolution with inviter identity and world access checks.
- Make Add friend useful from anywhere, not only from Nearby.
- Add presence privacy settings before exposing broad discovery.

### Phase 3 — Durable messages and activity

- Ship durable player DM threads, inbox/unread state, and cursored sync.
- Ship per-owned-agent message routes and event cursors.
- Ship durable activity/notification outbox and account-level preferences.
- Enable browser notifications and reliable post-session agent completion notices.

### Phase 4 — Typed agent social system

- Extend presence and friendship contracts to namespaced player/agent principals.
- Add consented agent contacts and durable agent-to-agent threads.
- Expose Agent contacts and agent social activity only after deployed contract verification.

### Phase 5 — Calls and external destinations

- Add authorized call sessions and scoped signaling for one-to-one/group calls.
- Add Discord login/linking as an optional identity method.
- Add separately revocable Discord notification delivery and, later, agent conversation relay.

## 15. Acceptance criteria

### Phase 1

1. A first-time user can locate Messages, People, Add friend, Requests, Your Agents, Invite, and Settings without being told to open Chat first.
2. The dock has one Messages entry and one People entry; there is no duplicate Agent shortcut into the same drawer.
3. Accepted friends remain listed when offline or when presence is unknown.
4. Requests have a visible badge and can be accepted or declined with keyboard and screen reader.
5. A user in another world shows Online with Join when possible; current same-world DM limitations are explained.
6. Agent rows distinguish Working, Sleeping, Stopped, Needs attention, and Unknown where data permits.
7. Voice/video is labeled world-wide, microphone and camera are independently controlled, and active capture is persistent.
8. Remote video appears in PiP/grid rather than replacing the avatar’s head by default.
9. Presence/audio events always have a visual/text equivalent and respect reduced motion.
10. Friend/presence refresh failure does not erase relationships or mark them falsely offline.

### Backend-enabled phases

1. A signed-in user can find another account by exact public handle without knowing an account id.
2. An invite preview identifies the inviter and destination before travel, and never conveys authorization by itself.
3. Player DMs persist across worlds, sessions, and temporary disconnects with idempotent delivery.
4. Every owned agent has an independently addressable thread and unread/activity state.
5. Agent completion and action-required events can notify after the Tellus tab closes when a destination is enabled.
6. Agent friendship, presence, or cross-agent messaging UI remains feature-gated until typed-principal contracts are live.
7. Discord identity and notification grants can be revoked independently.

## 16. Validation plan

- Component/unit tests for actor normalization, capability gating, unread aggregation, presence Unknown handling, notification dedupe, and settings precedence.
- Contract tests against the exact Hyades friends, presence, maker-agent, and default-agent response shapes.
- Two-account browser test in different worlds: request, accept, presence, Join, reconnect, remove.
- Multi-agent browser test: at least two owned agents in one world and another world; lifecycle and placement remain distinct.
- WebRTC test with two real browsers: audio in both directions, independent mic/camera, reconnect, device denial, and TURN fallback where configured.
- Keyboard-only and screen-reader pass for the dock, drawers, requests, thread navigation, call controls, and confirmation menus.
- Reduced-motion, 200% zoom, narrow mobile, and touch-target checks.
- Runtime performance check confirming the social drawer and background refresh do not reduce world frame rate or create scene rebuilds.

## 17. Open decisions

- What public-handle namespace and rename policy should Tellus use? Account `label` is not currently a unique public handle.
- Should friend-arrival visual toasts default on for all friends or only favorites? This PRD recommends all accepted friends visually, with sound opt-in.
- What presence visibility choices are supported: everyone, friends, nobody, or per-world overrides?
- Should a location invite be single-use, multi-use, or user-selectable, and what is the default expiry?
- Which agent events are safe and useful enough for external notification, especially interactions with another maker’s agent?
- Should current same-world DMs be migrated into durable threads or remain a separate ephemeral world channel?
- What call topology and participant cap replace the current full mesh before group calls are promised?
- Should global Settings eventually be account-synced in Hyades, and which device/media preferences must remain local?

## 18. Source-of-truth boundary

For implementation, current deployed or target Hyades interfaces and gateway routes are authoritative. This PRD is authoritative for the intended Tellus experience, information architecture, progressive disclosure, and required capability semantics. Where they differ, the UI must show only what the verified backend supports and the mismatch must become an explicit backend task rather than a local-storage simulation.
