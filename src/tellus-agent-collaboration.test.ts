import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CollaborationApiError,
  collaborationMemberUrl,
  collaborationTasksUrl,
  collaborationWorkspacesUrl,
  createCollaborationWorkspace,
  mutateCollaborationTask,
  normalizeCollaborationWorkspace,
  setCollaborationMember,
  setCollaborationWorkspaceClosed,
} from "./tellus-agent-collaboration";

afterEach(() => vi.unstubAllGlobals());

const workspace = {
  workspaceId: "workspace-one",
  name: "Castle works",
  sharedGoal: "Build and review a courtyard.",
  worldId: "garden",
  closed: false,
  revision: 4,
  createdAtMs: 10,
  updatedAtMs: 20,
  members: [
    { agentId: "lead-one", role: 1, joinedAtMs: 10 },
    { agentId: "reviewer-one", role: "Reviewer", joinedAtMs: 11 },
  ],
  tasks: [{
    taskId: "task-one",
    title: "Build the gate",
    description: "Keep the path clear.",
    assignedAgentId: "lead-one",
    claimedByAgentId: "lead-one",
    status: "InReview",
    updateSummary: "Placed and measured.",
    reviewSummary: null,
    createdAtMs: 12,
    updatedAtMs: 20,
    artifacts: [{
      artifactId: "artifact-one",
      taskId: "task-one",
      kind: "world-object",
      reference: "tellus://world/garden/generated/gate-one",
      label: "Gate first pass",
      submittedByPrincipalId: "agent:lead-one",
      submittedAtMs: 19,
      secret: "drop",
    }],
  }],
  makerUserId: "must-not-leak",
};

describe("collaboration contract normalization", () => {
  it("accepts numeric and string Orleans enums while retaining only the public project shape", () => {
    expect(normalizeCollaborationWorkspace(workspace)).toMatchObject({
      workspaceId: "workspace-one",
      members: [
        { agentId: "lead-one", role: "lead" },
        { agentId: "reviewer-one", role: "reviewer" },
      ],
      tasks: [{
        taskId: "task-one",
        status: "inReview",
        artifacts: [{ submittedByPrincipalId: "agent:lead-one" }],
      }],
    });
    expect(normalizeCollaborationWorkspace(workspace)).not.toHaveProperty("makerUserId");
    expect(normalizeCollaborationWorkspace(workspace)?.tasks[0]?.artifacts[0]).not.toHaveProperty("secret");
  });

  it("rejects malformed workspaces and malformed nested rows", () => {
    expect(normalizeCollaborationWorkspace({ name: "Missing id" })).toBeNull();
    expect(normalizeCollaborationWorkspace({
      ...workspace,
      members: [{ role: "lead" }],
      tasks: [{ taskId: "missing title" }],
    })).toMatchObject({ members: [], tasks: [] });
  });
});

describe("collaboration API", () => {
  it("encodes workspace, member, and task route segments", () => {
    expect(collaborationWorkspacesUrl("workspace/one")).toMatch(/\/workspaces\/workspace%2Fone$/);
    expect(collaborationMemberUrl("workspace/one", "agent one"))
      .toMatch(/\/workspaces\/workspace%2Fone\/members\/agent%20one$/);
    expect(collaborationTasksUrl("workspace/one", "task one"))
      .toMatch(/\/workspaces\/workspace%2Fone\/tasks\/task%20one$/);
  });

  it("creates a project without sending maker or grain authority", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true, workspace }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createCollaborationWorkspace({
      idempotencyKey: "create-one",
      name: "Castle works",
      sharedGoal: "Build and review a courtyard.",
      worldId: "garden",
      members: [{ agentId: "lead-one", role: "lead" }],
    })).resolves.toMatchObject({ workspaceId: "workspace-one" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      idempotencyKey: "create-one",
      name: "Castle works",
      sharedGoal: "Build and review a courtyard.",
      worldId: "garden",
      members: [{ agentId: "lead-one", role: "lead" }],
    });
    expect(body).not.toHaveProperty("makerUserId");
    expect(body).not.toHaveProperty("actingPrincipalId");
    expect(body).not.toHaveProperty("grainKey");
  });

  it("updates roles and review gates with stable idempotency keys", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, workspace }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true, workspace }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await setCollaborationMember("workspace-one", "reviewer-one", "reviewer", "member-key");
    await mutateCollaborationTask("workspace-one", "task-one", {
      idempotencyKey: "review-key",
      kind: "review",
      status: "approved",
      summary: "Looks good.",
    });

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ role: "reviewer", idempotencyKey: "member-key" }),
    });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({
        idempotencyKey: "review-key",
        kind: "review",
        status: "approved",
        summary: "Looks good.",
      }),
    });
  });

  it("closes a project through the authenticated workspace route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accepted: true,
      workspace: { ...workspace, closed: true },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(setCollaborationWorkspaceClosed("workspace-one", true, "close-key"))
      .resolves.toMatchObject({ closed: true });
    expect(fetchMock).toHaveBeenCalledWith(collaborationWorkspacesUrl("workspace-one"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closed: true, idempotencyKey: "close-key" }),
    });
  });

  it("surfaces feature-dark and conflict errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(setCollaborationMember("workspace-one", "lead-one", "lead", "key"))
      .rejects.toMatchObject({ status: 404, message: "not found" } satisfies Partial<CollaborationApiError>);
  });
});
