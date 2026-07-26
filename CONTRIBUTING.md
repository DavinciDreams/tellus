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

Changes that affect tested behavior or rendering should also run:

```bash
bun run test:coverage
bun run perf:render
```

See [`docs/TESTING_AND_PERFORMANCE.md`](docs/TESTING_AND_PERFORMANCE.md) for
the current baseline and performance-budget rationale.

## Auth and backend notes

The local client uses `public/tellus-config.json` and usually points at the live
Hyades backend, `https://hyades.gnostr.cloud`.

Passkeys are tied to the configured WebAuthn relying-party domain. If passkey
login works on production but fails on `localhost`, that is usually an origin
allow-list issue rather than an account bug. UI and gameplay changes should not
need passkey login unless they touch account, premium, or MCP token flows.

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
  `src/tellus-procplant-vegetation.ts`, `src/tellus-asset-impostor.ts`
- Ecology and procedural plants: `src/tellus-ecology.ts`,
  `src/tellus-procplants.ts`, `src/tellus-procplant-biomes.ts`,
  `src/tellus-branch-modules.ts`
- Maker-owned agents: `src/tellus-maker-agents.ts`, `src/agent-view.ts`,
  `src/agent-view-camera.ts`
- Hyades/world API clients: `src/tellus-world-client.ts`,
  `src/tellus-auth.ts`, `src/tellus-runtime-config.ts`

## Pull request notes

Keep PRs focused. Include what you changed, what you tested, and any visible
before/after behavior. For UI and gameplay work, screenshots or short clips are
helpful when practical.
