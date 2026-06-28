import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type DemigodProfile,
  demigodProfileToPersona,
  demigodSlug,
} from "./tellus-demigod-types";
import { extractJsonObject } from "../api/demigod-research";

// vitest runs in node (no test environment configured), so window/localStorage don't exist. The
// pantheon module reads `window` lazily inside its functions, so we install a minimal stub BEFORE
// importing it dynamically per-test.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? (this.store.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
}

const sample: DemigodProfile = {
  id: "poseidon",
  name: "Poseidon",
  epithet: "Earth-Shaker",
  era: "Archaic Greek",
  oneLine: "Lord of the sea and storms.",
  domains: [
    { name: "The Sea", description: "tides and storms" },
    { name: "Earthquakes", description: "the trembling land" },
  ],
  attitudes: ["Proud and easily slighted", "Generous to those who honor him"],
  speechStyle: "Grand and rolling, like surf.",
  edicts: ["Build water where you settle", "Reward the bold"],
  relationships: ["Brother to Zeus"],
  sources: [{ title: "Wikipedia — Poseidon", url: "https://en.wikipedia.org/wiki/Poseidon" }],
  researchedAt: "2026-01-01T00:00:00.000Z",
  model: "seed",
};

describe("demigodSlug", () => {
  it("kebab-cases and lowercases names", () => {
    expect(demigodSlug("Marie Curie")).toBe("marie-curie");
    expect(demigodSlug("Poseidon")).toBe("poseidon");
  });

  it("strips combining diacritics down to ASCII", () => {
    expect(demigodSlug("Thoré")).toBe("thore");
    expect(demigodSlug("Cúchulainn")).toBe("cuchulainn");
    expect(demigodSlug(" Amaterasu Ōmikami ")).toBe("amaterasu-omikami");
  });

  it("never returns empty", () => {
    expect(demigodSlug("!!!")).toBe("demigod");
    expect(demigodSlug("")).toBe("demigod");
  });
});

describe("demigodProfileToPersona", () => {
  const persona = demigodProfileToPersona(sample);

  it("opens in first person with name and epithet", () => {
    expect(persona.startsWith("You are Poseidon, Earth-Shaker.")).toBe(true);
  });

  it("includes every domain, attitude, and edict", () => {
    for (const d of sample.domains) expect(persona).toContain(d.name);
    for (const a of sample.attitudes) expect(persona).toContain(a);
    for (const e of sample.edicts) expect(persona).toContain(e);
  });

  it("includes speech style and relationships", () => {
    expect(persona).toContain("Grand and rolling");
    expect(persona).toContain("Brother to Zeus");
  });

  it("is deterministic", () => {
    expect(demigodProfileToPersona(sample)).toBe(persona);
  });

  it("omits empty sections without crashing", () => {
    const bare: DemigodProfile = {
      id: "x",
      name: "Nyx",
      oneLine: "",
      domains: [],
      attitudes: [],
      speechStyle: "",
      edicts: [],
      sources: [],
      researchedAt: "2026-01-01T00:00:00.000Z",
    };
    const out = demigodProfileToPersona(bare);
    expect(out).toContain("You are Nyx.");
    expect(out).toContain("Stay in character");
    expect(out).not.toContain("You hold dominion");
  });
});

describe("extractJsonObject", () => {
  it("pulls a bare object", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("pulls an object out of surrounding prose", () => {
    expect(extractJsonObject('Here you go: {"a":1} hope that helps')).toBe('{"a":1}');
  });

  it("handles code fences", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("respects nested braces and strings containing braces", () => {
    const input = 'prefix {"a":{"b":2},"s":"a } b"} suffix';
    expect(extractJsonObject(input)).toBe('{"a":{"b":2},"s":"a } b"}');
  });

  it("returns null when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });
});

describe("pantheon registry", () => {
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { localStorage: new MemoryStorage() };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("lists seed demigods and resolves them by id", async () => {
    const { listPantheon, getDemigod } = await import("./tellus-pantheon");
    const all = listPantheon();
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(getDemigod("poseidon")?.name).toBe("Poseidon");
    // resolves by display name too (slugged internally)
    expect(getDemigod("Demeter")?.id).toBe("demeter");
  });

  it("round-trips a researched demigod and surfaces it first", async () => {
    const { saveResearchedDemigod, listPantheon, getDemigod } = await import("./tellus-pantheon");
    const researched: DemigodProfile = { ...sample, id: "athena", name: "Athena", epithet: undefined };
    const stored = saveResearchedDemigod(researched);
    expect(stored.id).toBe("athena");
    expect(getDemigod("athena")?.name).toBe("Athena");
    expect(listPantheon()[0]?.id).toBe("athena"); // newest first
  });

  it("removes a researched demigod", async () => {
    const { saveResearchedDemigod, removeResearchedDemigod, listResearchedDemigods } = await import(
      "./tellus-pantheon"
    );
    saveResearchedDemigod({ ...sample, id: "hera", name: "Hera" });
    expect(listResearchedDemigods().some((p) => p.id === "hera")).toBe(true);
    removeResearchedDemigod("hera");
    expect(listResearchedDemigods().some((p) => p.id === "hera")).toBe(false);
  });
});
