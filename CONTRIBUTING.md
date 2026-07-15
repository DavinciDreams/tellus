# Contributing to Tellus

Tellus is a browser-based 3D world backed by Hyades. Contributions that improve
UI clarity, navigation feel, performance, docs, and agent/MCP ergonomics are
very welcome.

## Local setup

```bash
bun install
bun run dev
```

Open <http://localhost:3344/>.

Useful checks before opening a PR:

```bash
bun run typecheck
bun run test
bun run build
```

## Auth and backend notes

The local client uses `public/tellus-config.json` and usually points at the live
Hyades backend, `https://hyades.gnostr.cloud`.

The current live Tellus app is deployed to Gnostr at
<https://tellus.gnostr.cloud/>. Coolify docs are optional hosting notes for
separate copies, not the active production deploy path.

Passkeys are tied to the configured WebAuthn relying-party domain. If passkey
login works on production but fails on `localhost`, that is usually an origin
allow-list issue rather than an account bug. UI and gameplay changes should not
need passkey login unless they touch account, premium, or MCP token flows.

## Generation notes

Production 3D generation is Tellus -> `/api/generate-3d` -> Hyades `/3d/jobs`.
Hyades owns the durable queue, the Z Image Turbo text-to-image step, the selected
3D provider, and the shared asset-store upload. Tellus owns the world-level
`generationProvider` setting, which is currently shared by player and agent
generation and defaults to `pixal3d-gradio`.

Use `TELLUS_3D_BACKEND=direct` only for local Gradio debugging. In production,
keep `TELLUS_3D_BACKEND=hyades` or provide `HYADES_API_KEY` /
`HYADES_3D_API_KEY` so `/api/generate-3d` defaults to Hyades. Preserve
`assetStoreModelId` on generated things; `modelUrl` is only a cached serving
hint and may be rewritten through the Hyades asset proxy.

For direct InstantMesh testing, use `bun run instantmesh:setup` and
`bun run instantmesh:start`; see the README for upstream links and compute
notes.

## MCP docs

The public MCP skill doc lives at:

- `public/tellus-mcp-skill.md`
- <https://tellus.gnostr.cloud/tellus-mcp-skill.md>
- `public/llms.txt`, served as `/llms.txt`

The MCP endpoint is protected, but the docs are intentionally public so
developers can understand the automation surface before they have a token.

## Agent entry points

Coding agents should read `AGENTS.md` first. Tool-specific files such as
`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and
`.cursor/rules/tellus.mdc` intentionally point back to the same guidance.

## Where to start

- UI and account panel: `src/main.tsx`, `src/styles.css`,
  `src/tellus-auth-ui.tsx`
- Camera, movement, navigation, and collisions: `src/main.tsx`,
  `src/tellus-rapier-physics.ts`, `src/tellus-terrain.ts`
- Rendering, lag, terrain, and vegetation: `src/main.tsx`,
  `src/tellus-terrain.ts`, `src/tellus-scene-builders.ts`,
  `src/tellus-vegetation*.ts`
- Hyades/world API clients: `src/tellus-world-client.ts`,
  `src/tellus-auth.ts`, `src/tellus-runtime-config.ts`

## Pull request notes

Keep PRs focused. Include what you changed, what you tested, and any visible
before/after behavior. For UI and gameplay work, screenshots or short clips are
helpful when practical.
