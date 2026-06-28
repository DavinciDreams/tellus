# Plan — Demigod Research Pipeline for Tellus

Port the idea of [deep-character-research](https://github.com/DavinciDreams/deep-character-research)
(research a historical figure → compile their domains/personality → let an LLM enact it) into Tellus.

## Architecture reality (verified)

- The LLM agent (persona, memories, transcript, tool-loop) runs **server-side in Hyades**
  (`ITellusAgentGrain`), NOT in this repo. See `docs/EMBODIED_AGENTS_PLAN.md`.
- The browser only edits a free-text **persona / self-section** via
  `POST {worldApiBase}/api/world/{worldId}/agent/persona` with body `{ text, replace: true }`
  (see `tellusAgentUrl` in `src/tellus-urls-identity.ts:14` and `runAgentAction` in `src/main.tsx:4885`).
- A portable **default persona** is saved via `POST {base}/api/tellus/user/default-persona`
  (`src/main.tsx:4948`).
- Server `/api/*` routes live in this repo (`api/*.ts`, wired in `server.ts`). LLM backends are
  already configured in env: **Z.ai** (`ZAI_BASE_URL/ZAI_API_KEY/ZAI_MODEL`) and **Hyades LLM**
  (`HYADES_LLM_BASE/HYADES_LLM_MODEL`).

**Conclusion:** A "demigod" = a richly-compiled persona. The pipeline researches a figure, synthesizes
a structured **Demigod profile** (domains they governed + attitudes/temperament + speech + edicts),
renders it to a persona document, and writes it to the agent via the EXISTING `/agent/persona` endpoint.
No Hyades changes needed.

## Decisions (from user)
- Research engine: **new `/api` route in this repo**, using the existing server LLM backend.
- Attachment: **pantheon template** — also store profiles in a registry so worlds can be seeded.
- Scope: **full UI** — a pantheon browser/picker with research, preview, and assign.

---

## Deliverables

### 1. Types — `src/tellus-demigod-types.ts` (new)
Single source of truth for the profile schema. Mirrors the reference repo's character profile,
adapted to "what they governed + how they behaved":

```ts
export interface DemigodDomain { name: string; description: string; }      // e.g. "The Sea — storms, tides, sailors' fates"
export interface DemigodProfile {
  id: string;                      // slug, e.g. "poseidon"
  name: string;                    // "Poseidon"
  epithet?: string;                // "Earth-Shaker"
  era?: string;                    // "Archaic Greek / Homeric"
  oneLine: string;                 // short tagline
  domains: DemigodDomain[];        // the things they were "in charge of"
  attitudes: string[];             // temperament / values / how they treat mortals
  speechStyle: string;             // voice, diction, cadence
  edicts: string[];                // how they ACT in the world (maps to agent behaviour)
  relationships?: string[];        // allies/rivals (other demigods)
  sources: { title: string; url: string }[];   // provenance (like the ref repo's documents table)
  researchedAt: string;            // ISO
  model?: string;                  // which LLM synthesized it
}
export interface DemigodResearchRequest { name: string; depth?: "basic" | "comprehensive"; hints?: string; }
export interface DemigodResearchResponse { profile: DemigodProfile; warnings?: string[]; }
```
Plus `demigodProfileToPersona(p): string` — renders a profile to the persona document the agent enacts
(a first-person "You are {name}…" charter listing domains, attitudes, speech, edicts).

### 2. Research route — `api/demigod-research.ts` (new)
Mirrors the ref repo's 4-phase pipeline, server-side, self-contained. Structured like `api/tts.ts`.

- **Discovery:** fetch Wikipedia REST summary + (best-effort) Wikidata for the figure. Server-side fetch
  avoids browser CORS. Collect title/extract/url as `sources`.
- **Synthesis:** one chat-completions call to the configured backend
  (Z.ai `ZAI_*`, or Hyades `HYADES_LLM_*` when `TELLUS_LLM_BACKEND=hyades`), with a system prompt that
  asks for **strict JSON** matching `DemigodProfile` (domains, attitudes, speechStyle, edicts) grounded
  in the fetched extract. Parse + validate; on malformed JSON, one repair retry, then a graceful
  fallback profile built from the Wikipedia extract so the route never hard-fails.
- **Response:** `DemigodResearchResponse`. No DB (the ref repo's SQLite/Chroma is out of scope for v1 —
  provenance rides in `profile.sources`).
- A `hyadesHeaders()`-style helper for auth; reuse the env names already in `.env.example`.

Wire it in `server.ts`: `if (url.pathname.startsWith("/api/demigod-research")) return withCors(await demigodResearchHandler(request));`

### 3. Pantheon registry — `src/tellus-pantheon.ts` (new)
A small registry of seed demigods (Poseidon, Demeter, Hephaestus, etc. as starter `DemigodProfile`s)
+ helpers: `listPantheon()`, `getDemigod(id)`, and a localStorage-backed `saveResearchedDemigod(profile)`
so figures you research persist client-side and join the pantheon. Kept SEPARATE from
`tellus-world-templates.ts` (that file is land-shape only — confirmed by reading it).

### 4. Client research client — extend `src/tellus-generation-client.ts`
Add `researchDemigod(req): Promise<DemigodResearchResponse>` → `POST {apiBase}/api/demigod-research`,
following the existing `fetch`/error patterns in that file.

### 5. UI — Pantheon panel in `src/main.tsx`
A new "Pantheon" section in the existing agent/personality panel:
- **Assign a demigod:** text input + "Research" button → calls `researchDemigod` → shows a preview
  card (name, epithet, domains, attitudes, speech, edicts, sources) with loading/error states reusing
  the existing `agentBusy`/`agentError` patterns.
- **Pantheon browser:** grid/list of seed + researched demigods; click to preview.
- **Assign → world:** "Enact" button renders the profile via `demigodProfileToPersona` and saves it
  through the EXISTING `onAgentSavePersona` path (`runAgentAction("persona", { text, replace: true })`),
  so the running agent immediately enacts the demigod. Plus "Set as default" via the existing
  default-persona save so the demigod carries into new worlds (the "seed a world" requirement).

### 6. Tests — `src/tellus-demigod.test.ts` (new, vitest)
- `demigodProfileToPersona` includes name, every domain, attitudes, edicts.
- Pantheon registry: `getDemigod` round-trips; `saveResearchedDemigod` persists/lists.
- A pure JSON-extraction/validation helper from the route (factored out so it's testable without network).

---

## Risk / verification
- **Could break:** `server.ts` routing (new branch — additive, low risk); `main.tsx` is large
  (~6700 lines) — new UI is additive, gated in its own panel section.
- **LLM dependency:** route degrades to a Wikipedia-extract fallback if no key / bad JSON, so the UI
  always returns a usable profile.
- **Verify:** `bun run typecheck` clean; `bun run test` green; `bun run build` passes. Manual: research a
  figure (e.g. "Poseidon"), preview the compiled domains/attitudes, Enact, confirm the persona textarea
  in the panel now shows the demigod charter.

## Out of scope (v1)
- SQLite/ChromaDB vector store and semantic retrieval from the ref repo (provenance kept inline).
- Hyades-side changes (none required — we use the existing persona endpoint).
- Multi-figure ArXiv/multi-language scraping (Wikipedia + Wikidata only for v1).
