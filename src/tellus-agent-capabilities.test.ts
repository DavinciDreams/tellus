import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgentCapabilityApiError,
  agentCapabilityCatalogUrl,
  agentCapabilityLeasesUrl,
  grantAgentCapabilityLease,
  normalizeCapabilityManifest,
  normalizeCapabilityState,
} from "./tellus-agent-capabilities";

afterEach(() => vi.unstubAllGlobals());

describe("capability contract normalization", () => {
  it("accepts the numeric Hyades enums and keeps only the public manifest shape", () => {
    expect(normalizeCapabilityManifest({
      id: "world.portals.author",
      version: 2,
      name: "Portal authoring",
      description: "Create and update portals.",
      riskTier: 1,
      grantMode: 1,
      requiredFeatureFlags: ["Tellus:Features:Portals"],
      verificationRecipeId: "portal-reachable",
      costHint: "bounded",
      operations: [{ id: "upsert", description: "Create a portal", inputSchema: "{}", secret: "drop" }],
      sessionToken: "must-not-leak",
    })).toEqual({
      id: "world.portals.author",
      version: 2,
      name: "Portal authoring",
      description: "Create and update portals.",
      riskTier: "build",
      grantMode: "maker",
      requiredFeatureFlags: ["Tellus:Features:Portals"],
      verificationRecipeId: "portal-reachable",
      costHint: "bounded",
      operations: [{ id: "upsert", description: "Create a portal", inputSchema: "{}" }],
    });
  });

  it("normalizes goal, leases, and workflow status while dropping malformed rows", () => {
    expect(normalizeCapabilityState({
      activeGoal: { goalId: "goal-1", description: "Build a welcoming gate", setAtMs: 10 },
      leases: [
        {
          leaseId: "lease-1",
          capabilityId: "world.portals.author",
          capabilityVersion: 1,
          goalId: "goal-1",
          grantedByPrincipalId: "acct:maker",
          grantedAtMs: 10,
          expiresAtMs: 20,
          remainingInvocations: 3,
          budgetTokens: 0,
          budgetMs: 120_000,
          consumedTokens: 0,
          consumedMs: 20,
          worldIds: ["garden"],
        },
        { leaseId: "missing-capability" },
      ],
      workflows: [{
        workflowId: "workflow-1",
        capabilityId: "world.portals.author",
        capabilityVersion: 1,
        operation: "upsert",
        goalId: "goal-1",
        status: 1,
        startedAtMs: 10,
        completedAtMs: 20,
        summary: "Portal verified",
        evidenceJobId: "evidence-1",
        costMs: 10,
      }],
    })).toMatchObject({
      activeGoal: { goalId: "goal-1" },
      leases: [{ leaseId: "lease-1", worldIds: ["garden"] }],
      workflows: [{ workflowId: "workflow-1", status: "completed" }],
    });
  });
});

describe("capability API", () => {
  it("bounds catalog searches and encodes stable path segments", () => {
    expect(agentCapabilityCatalogUrl(" portal gate ", 99)).toMatch(/\/api\/tellus\/capabilities\?q=portal\+gate&limit=16$/);
    expect(agentCapabilityLeasesUrl("agent/one", "lease one")).toMatch(/\/api\/tellus\/agents\/agent%2Fone\/capability-leases\/lease%20one$/);
  });

  it("posts a bounded maker grant without sending maker identity", async () => {
    const lease = {
      leaseId: "lease-1",
      capabilityId: "world.portals.author",
      capabilityVersion: 1,
      goalId: "goal-1",
      grantedByPrincipalId: "acct:server-stamped",
      grantedAtMs: 10,
      expiresAtMs: 20,
      remainingInvocations: 8,
      budgetTokens: 0,
      budgetMs: 120_000,
      consumedTokens: 0,
      consumedMs: 0,
      worldIds: ["garden"],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true, lease }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(grantAgentCapabilityLease("agent-one", {
      capabilityId: "world.portals.author",
      goalId: "goal-1",
      durationMinutes: 30,
      invocations: 8,
      budgetMs: 120_000,
      worldIds: ["garden"],
    })).resolves.toMatchObject({ leaseId: "lease-1", grantedByPrincipalId: "acct:server-stamped" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/tellus\/agents\/agent-one\/capability-leases$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          capabilityId: "world.portals.author",
          goalId: "goal-1",
          durationMinutes: 30,
          invocations: 8,
          budgetMs: 120_000,
          worldIds: ["garden"],
          budgetTokens: 0,
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("grantedByPrincipalId");
  });

  it("surfaces Hyades conflict errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accepted: false,
      error: "active goal changed",
    }), { status: 409, headers: { "Content-Type": "application/json" } })));

    await expect(grantAgentCapabilityLease("agent-one", {
      capabilityId: "world.portals.author",
      goalId: "stale-goal",
      durationMinutes: 30,
      invocations: 8,
      budgetMs: 120_000,
      worldIds: ["garden"],
    })).rejects.toMatchObject({ status: 409, message: "active goal changed" } satisfies Partial<AgentCapabilityApiError>);
  });
});
