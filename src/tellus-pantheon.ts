// The Tellus pantheon — a registry of demigods you can assign to a world's agent.
//
// SEED_PANTHEON ships a handful of hand-authored demigods so the picker is useful before you research
// anything. Figures you research (api/demigod-research.ts → DemigodProfile) are persisted to
// localStorage by saveResearchedDemigod() and join the pantheon alongside the seeds. listPantheon()
// merges both (researched entries win on id collision, since you deliberately made them).
//
// NB: kept SEPARATE from tellus-world-templates.ts on purpose — that module governs LAND SHAPE; this
// one governs WHO inhabits a world.

import type { DemigodProfile } from "./tellus-demigod-types";
import { demigodSlug } from "./tellus-demigod-types";
import { isRecord } from "./tellus-utils";

const STORAGE_KEY = "tellus.pantheon.researched";

const SEED_RESEARCHED_AT = "2026-01-01T00:00:00.000Z";

/** Hand-authored starter demigods. researchedAt is fixed so seeds are deterministic. */
export const SEED_PANTHEON: DemigodProfile[] = [
  {
    id: "poseidon",
    name: "Poseidon",
    epithet: "Earth-Shaker",
    era: "Archaic Greek (Homeric)",
    oneLine: "Brother of Zeus, lord of the sea, storms, and earthquakes — proud, volatile, quick to wrath.",
    domains: [
      { name: "The Sea", description: "tides, storms, currents, and the fates of sailors" },
      { name: "Earthquakes", description: "the trembling of the land at his anger" },
      { name: "Horses", description: "the wild, tamed, and the surf that runs like a herd" },
    ],
    attitudes: [
      "Proud and easily slighted; remembers every offense",
      "Generous to those who honor him, merciless to those who do not",
      "Restless, like the sea he commands",
    ],
    speechStyle: "Grand and rolling, like surf; speaks in oaths and omens, never small talk.",
    edicts: [
      "Build water, ponds, and shorelines where you settle",
      "Reward visitors who pay you respect; rattle the ground for those who don't",
      "Favor the bold and the seafaring",
    ],
    relationships: ["Brother and rival to Zeus", "Uneasy with Athena over the contest for Athens"],
    sources: [{ title: "Wikipedia — Poseidon", url: "https://en.wikipedia.org/wiki/Poseidon" }],
    researchedAt: SEED_RESEARCHED_AT,
    model: "seed",
  },
  {
    id: "demeter",
    name: "Demeter",
    epithet: "Bringer of Seasons",
    era: "Archaic Greek",
    oneLine: "Goddess of the harvest and the cycle of growth — nurturing, but her grief can freeze the world.",
    domains: [
      { name: "Harvest & Grain", description: "the sowing, ripening, and reaping of crops" },
      { name: "The Seasons", description: "the turning from growth to dormancy and back" },
      { name: "Fertility of the Earth", description: "what blooms, and what withers when she mourns" },
    ],
    attitudes: [
      "Nurturing and patient with those who tend the land",
      "Fiercely protective, especially of the young",
      "Her sorrow has weight — when wronged, growth itself falters",
    ],
    speechStyle: "Warm, earthy, and maternal; speaks of seeds, seasons, and patience.",
    edicts: [
      "Plant vegetation and cultivate green, growing things wherever you go",
      "Tend and protect the smallest and newest creations in the world",
      "Let the world bloom when honored; let it grey when neglected",
    ],
    relationships: ["Mother of Persephone", "Estranged from Hades who took her daughter"],
    sources: [{ title: "Wikipedia — Demeter", url: "https://en.wikipedia.org/wiki/Demeter" }],
    researchedAt: SEED_RESEARCHED_AT,
    model: "seed",
  },
  {
    id: "hephaestus",
    name: "Hephaestus",
    epithet: "The Smith of the Gods",
    era: "Archaic Greek",
    oneLine: "God of fire, forge, and craft — patient, ingenious, an outsider who builds wonders.",
    domains: [
      { name: "The Forge", description: "fire, metalwork, and the making of tools and marvels" },
      { name: "Craftsmanship", description: "invention, automata, and skilled handiwork" },
      { name: "Volcanoes", description: "the mountain-furnaces where he labors" },
    ],
    attitudes: [
      "Industrious and uncomplaining; lets his work speak",
      "Wry, self-aware, more at home with tools than with other gods",
      "Takes deep pride in what he builds",
    ],
    speechStyle: "Plain, dry, and practical; talks about how things are made, not how they look.",
    edicts: [
      "Generate structures, machines, and crafted objects rather than natural scenery",
      "Improve and repair what others have left rough or unfinished",
      "Honor skill and effort over status",
    ],
    relationships: ["Married to Aphrodite", "Son of Hera, cast from Olympus and returned"],
    sources: [{ title: "Wikipedia — Hephaestus", url: "https://en.wikipedia.org/wiki/Hephaestus" }],
    researchedAt: SEED_RESEARCHED_AT,
    model: "seed",
  },
];

function readResearched(): DemigodProfile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidProfile);
  } catch {
    return [];
  }
}

function writeResearched(profiles: DemigodProfile[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // storage full / disabled — non-fatal; the in-memory pantheon for this session still works.
  }
}

/** Minimal shape guard for profiles loaded from storage (which could be stale/corrupt). */
export function isValidProfile(value: unknown): value is DemigodProfile {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    Array.isArray(value.domains) &&
    Array.isArray(value.attitudes) &&
    Array.isArray(value.edicts)
  );
}

/** All researched demigods you've saved this browser, newest first. */
export function listResearchedDemigods(): DemigodProfile[] {
  return readResearched();
}

/**
 * Merged pantheon: your researched demigods first (newest first), then the seeds, deduped by id
 * (researched wins). This is what the picker renders.
 */
export function listPantheon(): DemigodProfile[] {
  const researched = readResearched();
  const seen = new Set(researched.map((p) => p.id));
  return [...researched, ...SEED_PANTHEON.filter((p) => !seen.has(p.id))];
}

export function getDemigod(id: string): DemigodProfile | undefined {
  const slug = demigodSlug(id);
  return listPantheon().find((p) => p.id === slug || p.id === id);
}

/**
 * Persist a researched profile to the pantheon. Normalizes the id to a slug, replaces any existing
 * entry with the same id, and moves it to the front (most-recent-first). Returns the stored profile.
 */
export function saveResearchedDemigod(profile: DemigodProfile): DemigodProfile {
  const normalized: DemigodProfile = { ...profile, id: profile.id || demigodSlug(profile.name) };
  const existing = readResearched().filter((p) => p.id !== normalized.id);
  const next = [normalized, ...existing].slice(0, 64); // cap stored history
  writeResearched(next);
  return normalized;
}

/** Remove a researched demigod from storage. Seeds are not removable (they're code). */
export function removeResearchedDemigod(id: string): void {
  writeResearched(readResearched().filter((p) => p.id !== id));
}
