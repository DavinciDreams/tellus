// Demigod research route — POST /api/demigod-research
//
// Ports the deep-character-research pipeline into Tellus, server-side and self-contained:
//   1. Discovery — fetch a Wikipedia REST summary (+ best-effort Wikidata) for the figure. Done on the
//      server so the browser dodges Wikipedia CORS and we can attach provenance.
//   2. Synthesis — one OpenAI-compatible /v1/chat/completions call (Z.ai by default, or the Hyades LLM
//      gateway when TELLUS_LLM_BACKEND=hyades) that returns a strict-JSON DemigodProfile grounded in the
//      fetched extract: the domains the figure governed, the attitudes they held, voice, and edicts.
//   3. Fallback — if no LLM key is configured or the model returns unparseable JSON (after one repair
//      retry), build a usable profile from the Wikipedia extract so the route NEVER hard-fails.
//
// No DB (the ref repo's SQLite/Chroma is out of scope for v1) — provenance rides in profile.sources.

import {
  type DemigodProfile,
  type DemigodResearchRequest,
  type DemigodResearchResponse,
  type DemigodSource,
  demigodSlug,
} from "../src/tellus-demigod-types";

interface WikiSummary {
  title: string;
  extract: string;
  url: string;
  description?: string;
}

interface LlmBackend {
  baseUrl: string; // OpenAI-compatible base, WITHOUT trailing /chat/completions
  apiKey?: string;
  model: string;
  label: string;
}

const WIKI_USER_AGENT = "TellusDemigodResearch/0.1 (https://tellus.garden)";

/** Resolve which OpenAI-compatible backend to call from env (mirrors .env.example naming). */
function resolveBackend(): LlmBackend | null {
  if ((process.env.TELLUS_LLM_BACKEND ?? "").toLowerCase() === "hyades") {
    return {
      baseUrl: (process.env.HYADES_LLM_BASE ?? "https://hyades.gnostr.cloud/v1").replace(/\/+$/, ""),
      apiKey: process.env.HYADES_3D_API_KEY ?? process.env.HYADES_API_KEY,
      model: process.env.HYADES_LLM_MODEL ?? "glm-5.1",
      label: "hyades",
    };
  }
  const zaiKey = process.env.ZAI_API_KEY;
  if (zaiKey) {
    return {
      baseUrl: (process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/coding/paas/v4").replace(/\/+$/, ""),
      apiKey: zaiKey,
      model: process.env.ZAI_MODEL ?? "GLM-5.1",
      label: "z.ai",
    };
  }
  return null;
}

async function fetchWikipediaSummary(name: string): Promise<WikiSummary | null> {
  const title = encodeURIComponent(name.trim().replace(/\s+/g, "_"));
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": WIKI_USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    const extract = typeof data.extract === "string" ? data.extract : "";
    if (!extract) return null;
    const pageUrl =
      (data.content_urls as { desktop?: { page?: string } } | undefined)?.desktop?.page ??
      `https://en.wikipedia.org/wiki/${title}`;
    return {
      title: typeof data.title === "string" ? data.title : name,
      extract,
      url: pageUrl,
      description: typeof data.description === "string" ? data.description : undefined,
    };
  } catch {
    return null;
  }
}

/** Best-effort Wikidata description for extra grounding; failures are silent. */
async function fetchWikidataBlurb(name: string): Promise<DemigodSource | null> {
  const url =
    "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=1&search=" +
    encodeURIComponent(name.trim());
  try {
    const res = await fetch(url, { headers: { "User-Agent": WIKI_USER_AGENT } });
    if (!res.ok) return null;
    const data = (await res.json()) as { search?: Array<{ id?: string; description?: string; concepturi?: string }> };
    const hit = data.search?.[0];
    if (!hit?.id) return null;
    return {
      title: `Wikidata ${hit.id}${hit.description ? ` — ${hit.description}` : ""}`,
      url: hit.concepturi ?? `https://www.wikidata.org/wiki/${hit.id}`,
    };
  } catch {
    return null;
  }
}

const SYNTHESIS_SYSTEM = [
  "You are a mythographer and historian. Given a real or mythological figure and a source extract,",
  "compile a 'demigod' character profile for an interactive world. Focus on:",
  "(a) the DOMAINS they were historically or mythologically in charge of,",
  "(b) the ATTITUDES and temperament they held,",
  "(c) how they SPEAK, and (d) EDICTS — how they would ACT in a small shared world.",
  "Ground every claim in the provided extract; do not invent unrelated facts.",
  "Respond with ONLY a single JSON object, no markdown fences, matching this TypeScript type:",
  "{ name: string; epithet?: string; era?: string; oneLine: string;",
  "  domains: { name: string; description: string }[];",
  "  attitudes: string[]; speechStyle: string; edicts: string[]; relationships?: string[] }",
].join(" ");

function buildSynthesisUser(req: DemigodResearchRequest, summary: WikiSummary | null): string {
  const parts = [`Figure: ${req.name}`];
  if (req.hints?.trim()) parts.push(`Steering: ${req.hints.trim()}`);
  const want = req.depth === "comprehensive" ? "6-8" : "3-5";
  parts.push(`Aim for ${want} domains and a similar number of edicts.`);
  if (summary) {
    if (summary.description) parts.push(`Short description: ${summary.description}`);
    parts.push(`Source extract (Wikipedia):\n${summary.extract}`);
  } else {
    parts.push("No encyclopedia extract was available; rely on well-established public knowledge only.");
  }
  return parts.join("\n\n");
}

/** Pull the first balanced JSON object out of a model response (handles stray prose / code fences). */
export function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }
  return null;
}

function asStringArray(value: unknown, max = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

/** Validate + coerce the model's parsed JSON into a DemigodProfile. Returns null if too thin to use. */
function coerceProfile(
  parsed: unknown,
  req: DemigodResearchRequest,
  sources: DemigodSource[],
  model: string,
  researchedAt: string,
): DemigodProfile | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : req.name.trim();

  const domains = Array.isArray(p.domains)
    ? p.domains
        .map((d) => {
          if (!d || typeof d !== "object") return null;
          const dr = d as Record<string, unknown>;
          const dn = typeof dr.name === "string" ? dr.name.trim() : "";
          if (!dn) return null;
          return { name: dn, description: typeof dr.description === "string" ? dr.description.trim() : "" };
        })
        .filter((d): d is { name: string; description: string } => d !== null)
        .slice(0, 12)
    : [];

  const attitudes = asStringArray(p.attitudes);
  const edicts = asStringArray(p.edicts);
  const speechStyle = typeof p.speechStyle === "string" ? p.speechStyle.trim() : "";

  // Reject responses with no usable substance — caller falls back to the Wikipedia-derived profile.
  if (!domains.length && !attitudes.length && !edicts.length) return null;

  return {
    id: demigodSlug(name),
    name,
    epithet: typeof p.epithet === "string" && p.epithet.trim() ? p.epithet.trim() : undefined,
    era: typeof p.era === "string" && p.era.trim() ? p.era.trim() : undefined,
    oneLine: typeof p.oneLine === "string" ? p.oneLine.trim() : "",
    domains,
    attitudes,
    speechStyle,
    edicts,
    relationships: asStringArray(p.relationships, 8),
    sources,
    researchedAt,
    model,
  };
}

/** Last-resort profile from the Wikipedia extract so the route always returns something usable. */
function fallbackProfile(
  req: DemigodResearchRequest,
  summary: WikiSummary | null,
  sources: DemigodSource[],
  researchedAt: string,
): DemigodProfile {
  const name = summary?.title ?? req.name.trim();
  const oneLine = summary?.description ?? summary?.extract.split(". ")[0] ?? `The figure known as ${name}.`;
  return {
    id: demigodSlug(name),
    name,
    epithet: undefined,
    era: undefined,
    oneLine,
    domains: summary?.description
      ? [{ name: summary.description, description: "" }]
      : [],
    attitudes: [],
    speechStyle: "Speak in the manner befitting this figure, drawing on what is known of them.",
    edicts: [
      `Act in the world as ${name} would, true to their known character and deeds.`,
    ],
    relationships: [],
    sources,
    researchedAt,
    model: "fallback",
  };
}

async function callLlm(backend: LlmBackend, messages: Array<{ role: string; content: string }>): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (backend.apiKey) headers.Authorization = `Bearer ${backend.apiKey}`;
  const res = await fetch(`${backend.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: backend.model,
      temperature: 0.7,
      messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM ${backend.label} responded ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method Not Allowed" }, { status: 405 });
  }

  let req: DemigodResearchRequest;
  try {
    req = (await request.json()) as DemigodResearchRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!req?.name || typeof req.name !== "string" || !req.name.trim()) {
    return Response.json({ error: "Provide a figure 'name' to research." }, { status: 400 });
  }

  const researchedAt = new Date().toISOString();
  const warnings: string[] = [];

  // Phase 1 — discovery
  const [summary, wikidata] = await Promise.all([
    fetchWikipediaSummary(req.name),
    fetchWikidataBlurb(req.name),
  ]);
  if (!summary) warnings.push("No Wikipedia summary found — synthesis relies on the model's own knowledge.");

  const sources: DemigodSource[] = [];
  if (summary) sources.push({ title: `Wikipedia — ${summary.title}`, url: summary.url });
  if (wikidata) sources.push(wikidata);

  // Phase 2 — synthesis (with one repair retry on bad JSON)
  const backend = resolveBackend();
  let profile: DemigodProfile | null = null;

  if (!backend) {
    warnings.push("No LLM backend configured (set ZAI_API_KEY or TELLUS_LLM_BACKEND=hyades) — using a Wikipedia-derived fallback.");
  } else {
    const messages = [
      { role: "system", content: SYNTHESIS_SYSTEM },
      { role: "user", content: buildSynthesisUser(req, summary) },
    ];
    try {
      let raw = await callLlm(backend, messages);
      let json = extractJsonObject(raw);
      if (json) {
        try {
          profile = coerceProfile(JSON.parse(json), req, sources, backend.model, researchedAt);
        } catch {
          profile = null;
        }
      }
      if (!profile) {
        // One repair pass — ask the model to re-emit strict JSON only.
        const repair = [
          ...messages,
          { role: "assistant", content: raw.slice(0, 4000) },
          { role: "user", content: "That was not valid. Reply with ONLY the JSON object, no prose, no code fences." },
        ];
        raw = await callLlm(backend, repair);
        json = extractJsonObject(raw);
        if (json) {
          try {
            profile = coerceProfile(JSON.parse(json), req, sources, backend.model, researchedAt);
          } catch {
            profile = null;
          }
        }
      }
      if (!profile) warnings.push("Model output could not be parsed into a profile — using a fallback.");
    } catch (error) {
      warnings.push(`LLM synthesis failed (${error instanceof Error ? error.message : "unknown"}) — using a fallback.`);
    }
  }

  // Phase 3 — fallback guarantee
  if (!profile) profile = fallbackProfile(req, summary, sources, researchedAt);

  const body: DemigodResearchResponse = { profile, warnings: warnings.length ? warnings : undefined };
  return Response.json(body);
}
