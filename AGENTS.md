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
- The current live Tellus app is deployed to Gnostr at
  <https://tellus.gnostr.cloud/>. Coolify docs are optional hosting notes, not
  the active production deploy path.
- Passkeys are WebAuthn origin-sensitive. A localhost RP-ID error is usually an
  origin allow-list issue, not necessarily an account regression.
- Public MCP docs live at `public/tellus-mcp-skill.md` and should remain visible
  without login. Premium gates bearer-token minting and MCP endpoint use, not
  the docs.
- The live MCP endpoint is `POST
  https://hyades.gnostr.cloud/api/tellus/mcp/{worldId}`. Browser `GET` returning
  `405` is expected.
- Production 3D generation is Tellus -> `/api/generate-3d` -> Hyades `/3d/jobs`.
  Hyades owns the durable queue, Z Image Turbo concept image, selected 3D
  provider, and asset-store upload. Tellus owns the single world-level
  `generationProvider`, shared by player and agent generation.
- Use `TELLUS_3D_BACKEND=direct` only for local Gradio debugging. Preserve
  `assetStoreModelId` on generated things; treat `modelUrl` as a cached serving
  hint.
- For direct InstantMesh testing, use `bun run instantmesh:setup` and
  `bun run instantmesh:start`; the README links the upstream repo and compute
  notes.

## Where to work

- UI, HUD, account panel, world drawers: `src/main.tsx`, `src/styles.css`,
  `src/tellus-auth-ui.tsx`.
- Camera, movement, navigation, collisions: `src/main.tsx`,
  `src/tellus-rapier-physics.ts`, `src/tellus-terrain.ts`.
- Rendering, lag, terrain, vegetation: `src/main.tsx`, `src/tellus-terrain.ts`,
  `src/tellus-scene-builders.ts`, `src/tellus-vegetation*.ts`.
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
