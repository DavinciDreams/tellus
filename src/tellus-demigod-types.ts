// Demigod research pipeline — shared types + persona rendering.
//
// A "demigod" in Tellus is a richly-compiled PERSONA. The research route (api/demigod-research.ts)
// investigates a historical/mythological figure and synthesizes a DemigodProfile: the domains they
// governed ("the things they were in charge of"), the attitudes they held, how they speak, and how
// they ACT in the world. demigodProfileToPersona() renders that profile to the first-person charter
// the Hyades agent grain enacts via the existing POST /agent/persona endpoint.
//
// This module is shared by both the browser (src/*) and the server route (api/*); keep it free of
// DOM/Node-only imports.

/** One domain a demigod governs — the reference repo's "knowledge domain", reframed as authority. */
export interface DemigodDomain {
  /** Short title, e.g. "The Sea". */
  name: string;
  /** What governing it entails, e.g. "storms, tides, earthquakes, and the fates of sailors". */
  description: string;
}

/** A reference the profile was synthesized from (provenance; mirrors the ref repo's documents table). */
export interface DemigodSource {
  title: string;
  url: string;
}

/** The compiled character. Produced by research, persisted in the pantheon, rendered to a persona. */
export interface DemigodProfile {
  /** Stable slug, e.g. "poseidon". */
  id: string;
  /** Display name, e.g. "Poseidon". */
  name: string;
  /** Honorific / title, e.g. "Earth-Shaker". */
  epithet?: string;
  /** Cultural/temporal context, e.g. "Archaic Greek (Homeric)". */
  era?: string;
  /** One-sentence tagline used in list/preview cards. */
  oneLine: string;
  /** The things they were historically "in charge of". */
  domains: DemigodDomain[];
  /** Temperament, values, and how they regard mortals — the attitudes they enact. */
  attitudes: string[];
  /** Voice: diction, cadence, characteristic phrasing. */
  speechStyle: string;
  /** How they ACT in the world — behavioural directives the agent follows. */
  edicts: string[];
  /** Other figures they ally with or oppose (other demigods, by name). */
  relationships?: string[];
  /** Where the profile came from. */
  sources: DemigodSource[];
  /** ISO timestamp the research completed. */
  researchedAt: string;
  /** Which LLM synthesized the profile (or "fallback" when no LLM ran). */
  model?: string;
}

export interface DemigodResearchRequest {
  /** The figure to research, e.g. "Poseidon" or "Marie Curie". */
  name: string;
  /** Research depth — comprehensive asks the LLM for more domains/edicts. */
  depth?: "basic" | "comprehensive";
  /** Optional steering, e.g. "the vengeful, sea-storm aspect rather than the horse-tamer aspect". */
  hints?: string;
}

export interface DemigodResearchResponse {
  profile: DemigodProfile;
  /** Non-fatal notes, e.g. "no LLM key configured — built a fallback profile from Wikipedia". */
  warnings?: string[];
}

/** Lowercase-kebab slug for a figure's name; stable id for the pantheon registry. */
export function demigodSlug(name: string): string {
  const COMBINING_MARKS = /[̀-ͯ]/g;
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(COMBINING_MARKS, "") // strip combining diacritics (after NFKD splits them off)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "demigod"
  );
}

/**
 * Render a profile to the persona document the agent enacts. First person ("You are …") so the
 * server-side grain reads it as its own self-section. Deterministic — same profile in, same text out
 * (tested). Empty sections are omitted so the charter stays tight.
 */
export function demigodProfileToPersona(profile: DemigodProfile): string {
  const lines: string[] = [];
  const title = profile.epithet ? `${profile.name}, ${profile.epithet}` : profile.name;
  lines.push(`You are ${title}.`);
  if (profile.era) lines.push(`Era: ${profile.era}.`);
  if (profile.oneLine.trim()) lines.push(profile.oneLine.trim());
  lines.push("");

  const domains = profile.domains.filter((d) => d.name.trim());
  if (domains.length) {
    lines.push("You hold dominion over:");
    for (const d of domains) {
      const desc = d.description.trim();
      lines.push(`- ${d.name.trim()}${desc ? ` — ${desc}` : ""}`);
    }
    lines.push("");
  }

  const attitudes = profile.attitudes.map((a) => a.trim()).filter(Boolean);
  if (attitudes.length) {
    lines.push("Your temperament and attitudes:");
    for (const a of attitudes) lines.push(`- ${a}`);
    lines.push("");
  }

  if (profile.speechStyle.trim()) {
    lines.push(`How you speak: ${profile.speechStyle.trim()}`);
    lines.push("");
  }

  const edicts = profile.edicts.map((e) => e.trim()).filter(Boolean);
  if (edicts.length) {
    lines.push("How you act in this world:");
    for (const e of edicts) lines.push(`- ${e}`);
    lines.push("");
  }

  const relationships = (profile.relationships ?? []).map((r) => r.trim()).filter(Boolean);
  if (relationships.length) {
    lines.push(`Your bonds and rivalries: ${relationships.join("; ")}.`);
    lines.push("");
  }

  lines.push(
    "Stay in character as this demigod. Let your domains and temperament drive what you build, " +
      "sculpt, and say to those who share the world with you.",
  );

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
