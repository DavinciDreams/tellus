# Tellus Agent Guide

Tellus is a browser-based 3D world backed by Hyades. Keep contributions focused,
testable, and friendly to outside developers working on UI, navigation,
performance, docs, and MCP ergonomics.

## Quick start

```bash
bun install
bun run dev
```

Open <http://localhost:3344/>.

Before handing work back, run the narrowest useful checks. For most changes:

```bash
bun run typecheck
bun run test
bun run build
```

## Important context

- The local Vite app usually points at live Hyades through
  `public/tellus-config.json`.
- WebGL is the production default; WebGPU is an explicit developer opt-in.
- Production releases use a fresh `v*` tag on the `gnostr-tellus` remote. See
  `docs/GNOSTR_CLOUD_SETUP.md`; Coolify is optional hosting, not the live path.
- Passkeys are WebAuthn origin-sensitive. A localhost RP-ID error is usually an
  origin allow-list issue, not necessarily an account regression.
- Public MCP docs live at `public/tellus-mcp-skill.md` and should remain visible
  without login. Premium gates bearer-token minting and MCP endpoint use, not
  the docs.
- The live MCP endpoint is `POST
  https://hyades.gnostr.cloud/api/tellus/mcp/{worldId}`. Browser `GET` returning
  `405` is expected.

## Where to work

- UI, HUD, account panel, world drawers: `src/main.tsx`, `src/styles.css`,
  `src/tellus-auth-ui.tsx`.
- Camera, movement, navigation, collisions: `src/main.tsx`,
  `src/tellus-rapier-physics.ts`, `src/tellus-terrain.ts`.
- Rendering, lag, terrain, vegetation: `src/main.tsx`, `src/tellus-terrain.ts`,
  `src/tellus-scene-builders.ts`, `src/tellus-procplant-vegetation.ts`,
  `src/tellus-asset-impostor.ts`.
- Ecology and procedural plants: `src/tellus-ecology.ts`,
  `src/tellus-procplants.ts`, `src/tellus-procplant-biomes.ts`,
  `src/tellus-branch-modules.ts`, `src/tellus-biome-mix.ts`.
- Maker-owned agents and evaluation views: `src/tellus-maker-agents.ts`,
  `src/agent-view.ts`, `src/agent-view-camera.ts`.
- Backend clients and URL/identity handling: `src/tellus-world-client.ts`,
  `src/tellus-auth.ts`, `src/tellus-runtime-config.ts`,
  `src/tellus-urls-identity.ts`.

## Working style

- Prefer existing patterns over new abstractions.
- Keep PRs small and describe visible behavior plus validation.
- Do not put secrets, bearer tokens, nsec values, cookies, or private invoices in
  docs, commits, logs, or chat.
- Treat Hyades as authoritative for shared world state, auth, premium, and MCP
  access decisions.
