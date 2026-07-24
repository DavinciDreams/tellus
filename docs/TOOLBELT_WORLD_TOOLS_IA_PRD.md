# Tellus Toolbelt and World Tools Information Architecture PRD

**Status:** Proposed
**Audience:** Tellus UI, world-building, ecology, asset, and Hyades contributors
**Last audited:** 2026-07-24
**Tellus baseline:** `c4b0b200` (`origin/master`)
**Related:** [`MESSAGES_PRESENCE_UI_PRD.md`](./MESSAGES_PRESENCE_UI_PRD.md), [Tellus wildlife PR #128](https://github.com/DavinciDreams/tellus/pull/128), [`BIOME_ECOLOGY_SPEEDTREE_PRD.md`](./BIOME_ECOLOGY_SPEEDTREE_PRD.md)
**Visual exploration:** [`prototypes/TOOLBELT_WORLD_TOOLS_EXPLORATION.html`](./prototypes/TOOLBELT_WORLD_TOOLS_EXPLORATION.html)

## 1. Decision summary

Tellus should reorganize the dock around stable player intentions rather than whichever implementation most recently grew inside a drawer.

The desktop dock becomes:

1. **Create** — generate something from text or an image.
2. **Assets** — search and place reusable assets from the library.
3. **Build** — make structures; procedural buildings include usable interiors by default.
4. **Nature** — biomes, flora, fauna, and managed wildlife populations.
5. **Terrain** — direct ground sculpting and surface painting only.
6. **Travel** — switch worlds, use portals, and create a new world.
7. **Messages** — world chat, DMs, agent conversations, and activity.
8. **People** — friends, nearby people, requests, owned agents, and the player’s own profile/avatar.

Four current dock entries move to contextual, more predictable homes:

- **Map** becomes the minimap’s own expand/collapse control and the `M` shortcut.
- **World** becomes the current-world name/status control in the top bar.
- **Move** becomes a contextual toolbar shown only when an object is selected.
- **Avatar** moves to People → You and Account/Profile.

On narrow mobile layouts, **Build**, **Nature**, and **Terrain** may live behind a labeled **World tools** dock entry. It must be labeled and show the last active tool; it must not become an unlabeled generic overflow menu.

This reduces the desktop dock from ten mixed-purpose entries to eight durable domains while restoring a visible Assets entry and adding an explicit home for ecology.

## 2. Why the current model is failing

The current UI has outgrown the meaning of its labels:

- The former Assets dock entry dynamically became **Buildings** outdoors and **Furniture** indoors. The underlying drawer still has Avatar, Flora, Animals, Buildings, and Furniture tabs, but those categories are invisible until a user guesses that Buildings is the asset library.
- Buildings combines procedural recipes, lighting, materials, roof controls, and asset-store building search in one narrow container. Interior creation is a separate workflow even though a building normally implies an inside.
- Terrain combines height sculpting, surface painting, direct procedural plant placement, scatter brushes, a mirror, and a link to an external Biome Mixer page.
- The Biome Mixer is more powerful than a small Terrain sub-action: it authors ecology, exports/imports biome data, and can apply a biome to the live world.
- Flora and fauna are asset-library categories, while incoming wildlife is a living world system controlled as populations/herds. The UI does not explain the difference between placing an animal model and enabling managed wildlife.
- Map is a dock toggle for a minimap that is already visible by default.
- World combines switching, current-world settings, destructive management, and new-world creation.
- Clicking the username opens an account dialog that also carries the public MCP skill document and programmatic access management.
- Move and Avatar occupy permanent dock space even though Move matters only after selection and Avatar is part of player identity.

These are not separate styling bugs. They are ownership and hierarchy problems.

## 3. Information-architecture rules

### 3.1 One noun, one domain

- **Assets** always means reusable library content.
- **Build** always means structures and their usable interiors.
- **Nature** always means ecological composition and living populations.
- **Terrain** always means direct editing of ground geometry or surface material.
- **World** always means the world currently occupied, never the world directory.
- **Travel** owns destinations, world switching, portals, and creating a destination.

Labels must not change based on whether the player is indoors or outdoors. Context changes the initial tab or suggested action, not the dock’s identity.

### 3.2 Automation first, manual placement second

Tellus should lead with outcomes:

- Build a house with a usable inside.
- Populate this world with an appropriate ecology.
- Add a deer population that behaves and grows.

Directly placing one tree, scattering ten flowers, configuring a herd command, or choosing an interior scene URL are advanced/manual controls. They remain available but do not define the first screen.

### 3.3 Progressive disclosure

Every drawer follows the same depth:

| Depth | Purpose | Example |
|---|---|---|
| Overview | A small set of common outcomes | Build a cottage; Populate wildlife; Search assets |
| Browse/edit | Choose content or a mode | Building preset; Biome; Sculpt versus Paint |
| Customize | Adjust meaningful parameters | Style, density, brush size, time of day |
| Advanced | Technical control and interchange | Exterior-only building, herd commands, biome JSON export |

### 3.4 Contextual controls stay near context

- Object transform tools appear beside the selected object and in its detail inspector.
- Map layers live on the map.
- Voice/video controls live in Messages.
- User identity and avatar live under People/Account.
- Current-world configuration opens from the current-world label.
- Developer automation lives under Help → Developer tools.

## 4. Current-to-proposed mapping

| Current surface | Current contents | Proposed owner |
|---|---|---|
| Create | Text/image generation | Create; unchanged as the primary generative action |
| Buildings/Furniture | Procedural buildings plus category-filtered asset store | Split into Assets and Build |
| Asset drawer Flora tab | Store flora | Assets → Flora; curated ecology-ready choices also appear in Nature → Flora |
| Asset drawer Animals tab | Store fauna and animated-only filter | Assets → Fauna; wildlife-ready choices also appear in Nature → Wildlife |
| Asset drawer Avatar tab | Avatar catalog and size | People → You → Avatar |
| Terrain Height | Raise, flatten, lower | Terrain → Sculpt |
| Terrain Materials | Surface swatches and brush size | Terrain → Paint |
| Terrain Scatter | Procedural plants, scatter brushes, mirror | Nature → Flora → Manual placement; Mirror moves to Assets/Build utilities |
| Terrain Biome Mixer link | Separate-page biome authoring/apply/export | Nature → Biomes → Biome Studio |
| World Current world | Picker, rename, delete, terrain, sky, time, water | Current-world control → World settings |
| World Create new | Templates and creation fields | Travel → Create new world |
| Travel | World destinations and create-world button | Travel; retains destinations and creation entry |
| Map | Toggle the minimap | Minimap expand/collapse control and `M` shortcut |
| Move | Object transform activation | Selection toolbar/inspector |
| Chat | World/DM drawer | Messages |
| Agent | Agent tab in the same drawer | People for management; Messages for conversation |
| Username | Identity, passkeys, premium, MCP docs/token, logout | Compact account menu plus Settings, Help, and Developer tools |

## 5. Dock behavior

### 5.1 Desktop

The eight domain entries remain in a stable order:

```text
Create | Assets | Build | Nature | Terrain || Travel | Messages | People
```

The divider separates world-making from navigation/social use. Labels stay visible. Only one primary drawer opens at a time; selecting the active entry collapses it. Switching drawers preserves each drawer’s last tab, draft, scroll position, and selection.

Badges are restricted to actionable state:

- Messages: unread messages/activity.
- People: friend requests or agent attention.
- Nature: ecological attention only when owner action is required, not routine population changes.

Create remains the visually emphasized primary action. The other entries have equal visual weight.

### 5.2 Mobile

The mobile dock shows:

```text
Create | Assets | World tools | Travel | Messages | People
```

World tools opens a compact chooser for Build, Nature, and Terrain, then opens the chosen full-height sheet. Its icon/secondary label may reflect the last selected world tool, but its accessible name remains “World tools.”

The minimap, current-world control, and selection toolbar remain outside the dock and do not consume mobile dock slots.

### 5.3 Command palette

Every destination remains directly searchable, including:

- Open Assets, Build, Nature, Terrain, Travel, Messages, People;
- Sculpt terrain, Paint terrain, Open Biome Studio;
- Add wildlife, Browse fauna, Browse flora;
- Create a world, Open world settings, Expand map;
- Open profile, Settings, Help, and Developer tools.

## 6. Assets

### 6.1 Purpose

Assets is the reusable content library. It answers “What can I place?” rather than “How do I construct or populate a system?”

The first view contains global search, recent/favorites when available, a **World-ready** filter, and stable labeled categories:

- All
- Objects & furniture
- Buildings
- Flora
- Fauna

Avatars are excluded because choosing the player’s body is an identity action, not world placement.

### 6.2 Asset cards and geometry quality

Tellus already receives useful readiness fields such as `hasGameOptimized`, `lodReady`, `effectiveMeshStats`, `hasImpostor`, and animation metadata. Cards should turn those into understandable signals:

- **World-ready** — optimized serving path and acceptable runtime metadata.
- **Animated** — usable animation clips are present.
- **Wildlife-ready** — the species/runtime adapter can manage this fauna asset.
- **Heavy** — high geometry or missing LOD; placement requires confirmation.
- **Processing** — not yet ready to place.

The default filter favors World-ready content without hiding the library’s more interesting building assets. A Heavy asset remains browsable, with a concise performance warning and a Details disclosure for triangles, file size, LOD, and impostor state.

The primary action is **Place**. Secondary actions are Preview, Favorite, and Details. Category and quality filtering belong above the grid, not as controls repeated on every card.

### 6.3 Relationship to specialized tools

- Selecting **Make a procedural building** routes to Build.
- Selecting **Populate as wildlife** on a wildlife-ready fauna asset routes to Nature with that species selected.
- Selecting **Use in biome** on compatible flora routes to Nature → Biomes/Flora.

An asset placed directly from the library remains an object. It does not silently become a managed herd member or automatic vegetation rule.

## 7. Build

### 7.1 Default building outcome

A procedural building should be a usable building assembly by default:

```text
exterior structure
  + entrance marker/door
  + provisioned interior world
  + linked return portal
  + collision/navigation metadata
```

The player chooses a building type and places it. Tellus provisions the inside without a second “create interior” chore. The building card shows **Interior included** as an outcome, not a required checkbox.

Advanced customization may offer:

- interior layout/template;
- number or type of rooms when supported;
- lighting/material style;
- roof and exterior details;
- **Exterior only** for scenery or performance-sensitive use.

Legacy and asset-store buildings that lack door/interior metadata remain exterior objects. Their detail menu may offer **Add an interior** as a deliberate retrofit.

### 7.2 Build drawer

1. **Quick build:** a small set of visual building archetypes.
2. **Customize:** style/material, scale, lighting, and an interior summary.
3. **Place:** enters placement mode with footprint and doorway preview.
4. **More buildings:** a link into Assets → Buildings, preserving the richer store inventory without mixing it into the procedural recipe form.
5. **Advanced:** exterior-only, seed, diagnostics, and future plan/layout controls.

After placement, selection shows the building assembly as one object with Exterior, Interior, Entrances, and Permissions subsections. Moving or deleting the assembly must explain what happens to its linked interior.

### 7.3 Backend requirement

The building-plus-interior workflow needs an idempotent authoritative operation or durable job. A client sequence that places an exterior, creates an interior, then adds two portals can fail halfway and leave orphaned state.

The contract must return one assembly id and the status of exterior, interior, entrance, and return link. Retrying the same client idempotency key must reconcile rather than duplicate.

## 8. Nature

Nature owns the living composition of a world. It is not a bag of plant-placement buttons.

### 8.1 Overview

The first screen summarizes:

- active biome or biome mix;
- vegetation coverage and whether automatic population is enabled;
- wildlife species/populations and health/state;
- any owner action required;
- primary actions: **Change biome**, **Populate flora**, **Add wildlife**.

### 8.2 Biomes

Biome cards represent ecological outcomes. Selecting one previews the terrain palette, flora community, building-material tendency, and compatible wildlife before applying.

**Biome Studio** replaces the awkward external Mixer tile as the advanced editor. It may remain a dedicated route for space and deep linking, but it opens as a Tellus-owned full-screen workspace and returns cleanly to the live world.

Biome Studio supports:

- edit a draft without immediately mutating the world;
- preview distribution and representative communities;
- save named mixes;
- apply to the current world with a clear confirmation and progress state;
- import/export JSON under Advanced;
- show whether the live world differs from the saved draft.

Export/import are interoperability tools, not the primary workflow.

### 8.3 Flora

Primary controls describe automatic ecology:

- enable/disable biome-driven vegetation;
- coverage/density at a high level;
- exclusions around buildings, paths, and water;
- regenerate/reconcile the current area when supported.

**Manual placement** is a disclosed subsection containing the current procedural plant single-placement and scatter brushes. Store flora remains browsable through Assets and can be promoted into biome rules only when it has compatible metadata.

### 8.4 Wildlife

The user-facing model is species populations, not individual grain commands:

- enable wildlife for this world;
- choose compatible species;
- set a broad density/carrying-capacity preference;
- see population, herd/group state, movement mode, and health/attention;
- pause or remove a managed population;
- select a herd or individual in the map/detail view when needed.

Population growth, grouping, and reactions to world conditions remain authoritative Hyades behavior. Routine herd commands such as `graze`, `wander`, `flee`, or `gather` belong in owner/admin diagnostics or agent tooling, not the primary player drawer.

The UI must distinguish:

- **Fauna asset:** a placed animated/static object from Assets.
- **Wildlife-ready fauna:** an asset with species, animation, movement, scale, LOD, and population metadata.
- **Managed wildlife:** one or more world objects registered to an authoritative herd/actor system.

The transition **Populate as wildlife** must be explicit and show the resulting species/population policy.

### 8.5 Current wildlife delivery state

As of 2026-07-24:

- [Hyades PR #37](https://github.com/MonumentalSystems/hyades/pull/37) is merged and supplies terrain-aware ground/air/water movement adapters on the herd-grain path.
- [Tellus PR #128](https://github.com/DavinciDreams/tellus/pull/128) remains an open draft. It adds wildlife protocol/rendering/LOD, deer population helpers, and `window.tellusAgent` configuration/command seams, but no player-facing Nature drawer.

The Nature UI should be the product surface for that work. The raw `window.tellusAgent` methods remain automation/diagnostic seams rather than becoming the UI vocabulary.

## 9. Terrain

Terrain has exactly two primary tabs:

### 9.1 Sculpt

- Raise
- Lower
- Flatten
- Brush size/strength when supported
- Exit brush

### 9.2 Paint

- Surface-material swatches
- Brush size
- Clear/restore when supported
- Exit brush

Procedural plants, biome composition, mirrors, fauna, and JSON authoring leave Terrain.

The active brush exposes a small contextual bar near the canvas with mode, size, undo/exit, and an obvious active-state cursor/preview. Closing the drawer does not accidentally leave an invisible destructive brush active; collapsing may retain the mode only if the contextual bar remains visible.

World-scale terrain generator/template/tuning controls remain in World settings → Environment because they configure the whole world rather than paint a location. Terrain includes a link to that section.

## 10. Map

The minimap is already visible by default, so Map no longer needs a dock entry.

- Clicking/tapping the minimap expands it.
- A visible expand/collapse button is keyboard accessible.
- `M` remains the shortcut.
- The expanded map owns layers for terrain, portals, players, agents, wildlife, and placed items.
- Selecting a marker opens a lightweight detail/action card.
- Invite/Share location remains a map action and follows the full invite design in the Messages/Presence PRD.

Closing the expanded map returns to the small minimap rather than hiding navigation entirely. A global setting may hide the minimap for users who want a minimal HUD.

## 11. World and Travel

### 11.1 Current world

The top bar displays the current world’s name and status. Activating it opens World settings for that world only:

- **Overview:** name, owner, visibility/access, save state.
- **Environment:** terrain generator/template, sky, time, lighting, water, global terrain tuning.
- **Access:** invitations, collaborators, presence/privacy when supported.
- **Advanced:** copy/export, diagnostics, remove/delete with confirmation.

There is no world picker and no Create new tab inside current-world settings. This avoids changing destination while editing one world and makes the title truthful.

### 11.2 Travel

Travel owns:

- recent, owned, shared, and discoverable destinations;
- portals and interiors as destinations;
- join-friend/invite destinations;
- **Create new world**;
- **Create from this world** as a template/copy action.

New-world creation is a focused sequence:

1. choose an experiential template;
2. name the world;
3. optionally customize environment under a disclosure;
4. create and enter.

Implementation terms such as finite/streamed/interior, chunk counts, hidden scene URLs, and grain identifiers remain in Advanced or diagnostics.

## 12. Selection and movement

Move is not a permanent destination. Selecting an object opens a compact contextual toolbar:

- Move
- Rotate
- Scale
- Duplicate when supported
- More → details, ownership, animation, delete

The toolbar clearly indicates when a placement/transform mode captures pointer input and provides Done/Cancel. The full inspector may open from More, but common transforms do not require returning to the dock.

## 13. Account, profile, help, and developer tools

Clicking the username opens a compact account menu, not the entire account/MCP dialog:

- View profile / People → You
- Account & identity
- Settings
- Subscription
- Help
- Log out

**Account & identity** owns passkeys, Nostr, future Discord linking, public handle, sessions, and claimed identities. **Settings** owns notifications, voice/video, presence/privacy, agents, accessibility, and device preferences as defined in the Messages/Presence PRD.

MCP moves to **Help → Developer tools**:

- public “Build with Tellus” / skill documentation;
- MCP endpoint explanation;
- premium token mint/revoke controls for authenticated users;
- diagnostics and automation references.

The public skill document remains reachable without login. Premium gates token creation/use, not documentation. A small Developer badge may appear only for users who have enabled developer mode or minted a token.

## 14. Shared drawer behavior

- Desktop drawers are non-modal, resizable, and do not steal world-camera input when the pointer is outside them.
- Mobile drawers are bottom sheets with half/full-height stops and clear drag handles.
- One domain drawer is open at a time; contextual toolbars may coexist.
- Each drawer has a visible title, Close button, Back behavior, and stable browser/command deep link where practical.
- Tabs are labeled in text at overview depth; icon-only compact tabs require tooltips and accessible names.
- Destructive actions live under a More/Advanced disclosure and require confirmation.
- Empty states teach the next action instead of showing only “nothing here.”
- Drawer state is local to the device; authoritative world edits are not.

## 15. Accessibility and input requirements

- All dock entries, minimap controls, tabs, cards, disclosures, brush controls, and contextual toolbars are keyboard accessible with visible focus.
- Dock and mobile World tools use roving focus without making hidden drawer contents tabbable.
- Active brush/placement/transform modes are conveyed by text and cursor/preview, not color alone.
- Opening a mobile sheet moves focus into it and closing returns focus to the invoking control; desktop non-modal drawers do not trap focus.
- Asset quality, wildlife state, and biome selection have textual labels and non-color status indicators.
- Population changes and background ecology updates do not spam screen-reader live regions.
- Reduced-motion preferences apply to drawer transitions, placement previews, map expansion, and ecological notifications.
- Touch targets are at least 44 by 44 CSS pixels where practical.
- The UI remains usable at 200% zoom, with dock overflow resolving into labeled World tools rather than clipped icons.

## 16. Contract and implementation boundaries

### 16.1 Can be reorganized with current Tellus behavior

- Restore a stable Assets dock entry.
- Split Build from asset browsing.
- Split Terrain into Sculpt/Paint and move procedural plants to Nature.
- Move Map to the minimap control.
- Move current-world settings to the world-name control and new-world creation to Travel.
- Move Avatar into People/Profile.
- Move MCP docs/token controls into Help/Developer tools.
- Render existing asset performance metadata as readiness badges.

### 16.2 Needs integration work but not a new social backend

- Mount Biome Studio within the main Tellus navigation while preserving its route/deep link.
- Connect flora/fauna assets to compatible Nature workflows.
- Add the Nature player UI over the wildlife protocol when PR #128 is ready.
- Persist local drawer/device preferences consistently.

### 16.3 Needs an authoritative backend contract

- Idempotent building assembly provisioning: exterior + interior + entrance + return link.
- Durable ownership and cleanup semantics for deleting/moving a building assembly.
- World-level ecology policy if biome/flora/wildlife settings must persist across clients.
- Safe managed-wildlife registration from a vetted fauna asset/species profile.
- Population policy and owner-facing activity/attention events.

Do not simulate these with local storage when another client or agent must observe the result.

## 17. Delivery sequence

### Phase 1 — Navigation shell without behavior loss

- Introduce the final dock labels and destinations.
- Restore Assets and create empty Build/Nature shells that route to current behaviors.
- Remove Map, Move, World, and Avatar from the permanent dock after their new entry points exist.
- Adopt one shared drawer controller so two large panels do not overlap unpredictably.

### Phase 2 — Separate the overloaded drawers

- Move procedural building controls into Build; keep store buildings in Assets.
- Move procedural plants/scatter into Nature → Flora.
- Reduce Terrain to Sculpt/Paint.
- Move biome authoring into Nature → Biome Studio.
- Add asset readiness badges and the World-ready default filter.

### Phase 3 — World, account, and contextual cleanup

- Split current-world settings from new-world creation.
- Make the minimap self-expanding and enrich its layers.
- Replace Move with the selection toolbar.
- Move Avatar to People → You.
- Split compact account menu, Settings, Help, and Developer tools.

### Phase 4 — Buildings with interiors

- Ship the authoritative building-assembly workflow.
- Make interiors default for procedural buildings.
- Add assembly selection, cleanup, and retrofit behavior.

### Phase 5 — Living worlds

- Land the wildlife client/runtime slice behind a feature flag.
- Add owner-facing Nature → Wildlife over the authoritative herd system.
- Add compatible species metadata and wildlife-ready asset filtering.
- Add population/activity signals without exposing raw herd commands as ordinary UI.

## 18. Acceptance criteria

1. The dock always has an Assets entry; its label never changes to Buildings or Furniture.
2. A user can explain the difference between Assets, Build, Nature, and Terrain after opening each once.
3. Procedural building creation no longer shares a scrolling container with the asset-store building grid.
4. A new procedural building includes a working inside and return path by default once the assembly contract ships.
5. Flora and Fauna are visibly discoverable without first opening Buildings.
6. The UI clearly distinguishes a fauna asset from managed wildlife.
7. Normal wildlife setup is expressed as species/population policy, not raw herd commands.
8. Terrain contains only Sculpt and Paint; no plant catalog, mirror, or external Biome Mixer tile remains there.
9. Biome Studio can be opened from Nature, draft changes, apply to the live world, and import/export under Advanced.
10. The map expands from the minimap and has no redundant permanent dock button.
11. Current-world settings never contain a Create new tab or switch the active world.
12. New-world creation is discoverable in Travel and preserves the existing templates and advanced options.
13. Move appears when an object is selected and disappears when selection ends.
14. Avatar selection is discoverable through People/Profile.
15. Clicking the username opens a concise account menu; MCP documentation and token controls live under Help/Developer tools.
16. All moved capabilities remain accessible from the command palette and keyboard.
17. The reorganization does not change authoritative world state contracts or reduce runtime frame rate.

## 19. Open decisions

- Should desktop users be able to customize/reorder the eight dock entries, or should the order remain fixed through the first release?
- What objective thresholds mark an asset World-ready or Heavy for different categories?
- Which existing asset-store buildings have enough doorway/footprint metadata for safe interior retrofit?
- Does a building assembly move its entrance only, move exterior and preserve its interior, or require relinking confirmation?
- Should Biome Studio remain a dedicated route rendered within the app shell or become a large in-page drawer?
- Which flora assets are eligible for automatic biome population rather than manual placement only?
- Which fauna assets satisfy the full wildlife-ready contract for each movement mode?
- What world-owner controls are appropriate for reproduction/carrying capacity without turning ecology into a spreadsheet?
- On mobile, is a six-entry dock acceptable, or should Travel move to the current-world/minimap cluster?

## 20. Source-of-truth boundary

This document is authoritative for Tellus navigation ownership, labels, progressive disclosure, and the intended relationship among Assets, Build, Nature, Terrain, World, and Travel. Runtime source and deployed Hyades contracts remain authoritative for what can safely be mutated today. Missing cross-client behavior becomes an explicit backend contract or feature-gated phase, never a hidden local-only simulation.
