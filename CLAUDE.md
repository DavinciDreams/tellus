# Claude Instructions

Read `AGENTS.md` first. It is the canonical agent guide for this repository.

Short version:

- Use Bun: `bun install`, `bun run dev`, `bun run typecheck`, `bun run test`,
  `bun run build`.
- Keep the MCP guide public; keep endpoint/token use premium-gated.
- Local passkey failures can be WebAuthn origin allow-list issues.
- For UI work start in `src/main.tsx`, `src/styles.css`, and
  `src/tellus-auth-ui.tsx`.
- For navigation/performance work start in `src/main.tsx`,
  `src/tellus-rapier-physics.ts`, `src/tellus-terrain.ts`, and
  `src/tellus-scene-builders.ts`.
- Never expose secrets or tokens.
