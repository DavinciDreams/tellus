import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AssetWorkshopApiError,
  assetWorkshopUrl,
  normalizeAssetWorkshop,
  reviewAssetWorkshop,
  startAssetWorkshop,
} from "./tellus-agent-workshops";

afterEach(() => vi.unstubAllGlobals());

const workshop = {
  jobId: "tellus-workshop:" + "a".repeat(64),
  agentKey: "must-not-leak",
  agentId: "builder-one",
  makerUserId: "maker-one",
  worldId: "garden",
  goalId: "dock-kit",
  backend: "Procedural",
  curatedWorkflowId: null,
  brief: "A modular boat dock kit",
  status: "AwaitingMaker",
  summary: "Validated and registered.",
  error: null,
  currentPass: 2,
  passes: [{
    number: 2,
    outcome: "ready",
    summary: "Ready",
    startedAt: "2026-07-29T00:00:00Z",
    completedAt: "2026-07-29T00:01:00Z",
    artifacts: [],
    validations: [],
  }],
  artifacts: [{ kind: "glb", reference: "registry:asset-1", sha256: "a".repeat(64), byteLength: 2048, pass: 2 }],
  validations: [
    { gate: "glb.valid", passed: true, detail: "ok", value: null, unit: null },
    { gate: "resource.bounds", passed: true, detail: null, value: 1200, unit: "triangles" },
  ],
  registryAssetId: "asset-1",
  modelUrl: "https://assets.example/api/view/asset-1",
  makerReviewRequired: true,
  reviewRevision: 0,
  makerFeedback: null,
  createdAt: "2026-07-29T00:00:00Z",
  startedAt: "2026-07-29T00:00:01Z",
  completedAt: null,
};

describe("asset workshop contract", () => {
  it("normalizes Orleans enum names and retains only the maker-facing shape", () => {
    const normalized = normalizeAssetWorkshop(workshop);
    expect(normalized).toMatchObject({
      status: "awaiting-maker",
      backend: "procedural",
      curatedWorkflowId: null,
      artifacts: [{ kind: "glb", byteLength: 2048 }],
    });
    expect(normalized?.validations).toContainEqual(expect.objectContaining({ gate: "glb.valid", passed: true }));
    expect(normalized).not.toHaveProperty("agentKey");
  });

  it("rejects malformed snapshots and malformed nested rows", () => {
    expect(normalizeAssetWorkshop({ agentId: "builder" })).toBeNull();
    expect(normalizeAssetWorkshop({ ...workshop, artifacts: [{ kind: "glb" }], validations: [{}] }))
      .toMatchObject({ artifacts: [], validations: [] });
  });

  it("encodes agent and job ids in route segments", () => {
    expect(assetWorkshopUrl("agent/one", "job one", true))
      .toMatch(/\/agents\/agent%2Fone\/asset-workshops\/job%20one\/review$/);
  });

  it("starts a procedural job without sending maker or grain authority", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(workshop), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await startAssetWorkshop("builder-one", {
      goalId: "dock-kit",
      idempotencyKey: "dock-kit-v1",
      backend: "procedural",
      brief: "A modular boat dock kit",
      referenceUrls: ["https://reference.example/dock.png"],
      budget: { maxPasses: 3 },
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      goalId: "dock-kit",
      idempotencyKey: "dock-kit-v1",
      backend: "procedural",
      brief: "A modular boat dock kit",
      referenceUrls: ["https://reference.example/dock.png"],
      budget: { maxPasses: 3 },
    });
    expect(body).not.toHaveProperty("makerUserId");
    expect(body).not.toHaveProperty("agentKey");
    expect(body).not.toHaveProperty("worldId");
    expect(body).not.toHaveProperty("curatedWorkflowId");
  });

  it("normalizes and submits a curated Blender workflow without executable input", async () => {
    const blenderWorkshop = { ...workshop, backend: 1, curatedWorkflowId: "rig-and-preview" };
    expect(normalizeAssetWorkshop(blenderWorkshop)).toMatchObject({
      backend: "blender",
      curatedWorkflowId: "rig-and-preview",
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(blenderWorkshop), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    await startAssetWorkshop("builder-one", {
      goalId: "dock-kit",
      idempotencyKey: "dock-kit-blender-v1",
      backend: "blender",
      curatedWorkflowId: "rig-and-preview",
      brief: "Rig the approved deer mesh and produce a turntable preview.",
      referenceUrls: ["https://reference.example/deer.glb"],
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ backend: "blender", curatedWorkflowId: "rig-and-preview" });
    expect(body).not.toHaveProperty("python");
    expect(body).not.toHaveProperty("script");
    expect(body).not.toHaveProperty("macros");
  });

  it("sends bounded maker review intent and surfaces dark-state errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(workshop), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    await reviewAssetWorkshop("builder-one", workshop.jobId, "revise", "Reduce materials.", "review-1");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      decision: "revise",
      feedback: "Reduce materials.",
      idempotencyKey: "review-1",
    });
    await expect(reviewAssetWorkshop("builder-one", workshop.jobId, "approve", "", "review-2"))
      .rejects.toMatchObject({ status: 404, message: "not found" } satisfies Partial<AssetWorkshopApiError>);
  });
});
