import { describe, expect, it } from "vitest";
import { normalizeMakerAgentDirectory, normalizeMakerAgentSummary } from "./tellus-maker-agents";

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
    });
  });

  it("rejects rows without stable identity or placement", () => {
    expect(normalizeMakerAgentSummary({ agentId: "", worldId: "main" })).toBeNull();
    expect(normalizeMakerAgentSummary({ agentId: "agent-one", worldId: "" })).toBeNull();
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
