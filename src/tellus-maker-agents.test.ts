import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeMakerAgentDirectory,
  normalizeMakerAgentSummary,
  renameMakerAgent,
  setMakerAgentRuntimePolicy,
} from "./tellus-maker-agents";

afterEach(() => vi.unstubAllGlobals());

describe("normalizeMakerAgentSummary", () => {
  it("keeps only the public maker-agent lifecycle shape", () => {
    expect(normalizeMakerAgentSummary({
      agentId: "agent-one",
      name: "  Ada  ",
      makerUserId: "maker-a",
      worldId: "main",
      visitorId: "agent:agent-one",
      enabled: true,
      optedIn: true,
      ownerPresent: false,
      offlinePersistence: true,
      lastEvaluation: {
        jobId: "eval-1",
        status: "refine",
        decision: "refine-action",
        summary: "The arch is offset.",
        at: "2026-07-23T12:00:00Z",
        renderBytes: "must-not-leak",
      },
      isDefault: true,
      runtimePolicy: "eventDriven",
      eventWakesLastMinute: 3,
      sessionToken: "must-not-leak",
    })).toEqual({
      agentId: "agent-one",
      name: "Ada",
      makerUserId: "maker-a",
      worldId: "main",
      visitorId: "agent:agent-one",
      enabled: true,
      optedIn: true,
      ownerPresent: false,
      offlinePersistence: true,
      lastTickAt: null,
      avatarId: null,
      lastEvaluation: {
        jobId: "eval-1",
        status: "refine",
        decision: "refine-action",
        summary: "The arch is offset.",
        at: "2026-07-23T12:00:00Z",
      },
      isDefault: true,
      runtimePolicy: "eventDriven",
      eventWakesLastMinute: 3,
    });
  });

  it("rejects rows without stable identity or placement", () => {
    expect(normalizeMakerAgentSummary({ agentId: "", worldId: "main" })).toBeNull();
    expect(normalizeMakerAgentSummary({ agentId: "agent-one", worldId: "" })).toBeNull();
  });
});

describe("setMakerAgentRuntimePolicy", () => {
  it("patches the dedicated runtime-policy route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      agentId: "agent-one",
      name: "Mira",
      worldId: "garden",
      visitorId: "agent:agent-one",
      runtimePolicy: "resident",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const updated = await setMakerAgentRuntimePolicy("agent-one", "resident");

    expect(updated.runtimePolicy).toBe("resident");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tellus\/agents\/agent-one\/runtime-policy$/),
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ runtimePolicy: "resident" }) }),
    );
  });
});

describe("normalizeMakerAgentDirectory", () => {
  it("drops malformed rows and derives a default during mixed-version rollout", () => {
    expect(normalizeMakerAgentDirectory({
      agents: [
        { agentId: "bad" },
        { agentId: "good", worldId: "garden", isDefault: true },
      ],
    })).toMatchObject({
      defaultAgentId: "good",
      agents: [{ agentId: "good", worldId: "garden" }],
    });
  });
});

describe("renameMakerAgent", () => {
  it("patches only the friendly name at the stable agent address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      agentId: "agent-one",
      name: "Mira",
      worldId: "garden",
      visitorId: "agent:agent-one",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const renamed = await renameMakerAgent("agent-one", "Mira");

    expect(renamed.name).toBe("Mira");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tellus\/agents\/agent-one$/),
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "Mira" }) }),
    );
  });
});
