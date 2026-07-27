import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchWorldTriggers,
  normalizeWorldTriggersSnapshot,
  serializeWorldTriggerTransitions,
  upsertWorldTrigger,
  upsertWorldTriggerBinding,
} from "./tellus-world-triggers";

afterEach(() => vi.unstubAllGlobals());

const definition = {
  triggerId: "entrance",
  worldId: "garden",
  version: 1,
  enabled: true,
  shape: {
    kind: "sphere",
    center: { x: 2, y: 3, z: 4 },
    radius: 7,
    halfExtents: { x: 1, y: 1, z: 1 },
    yawDegrees: 0,
  },
  actorFilter: "both",
  transitionKinds: "entered, exited",
  cooldownMs: 10_000,
  oncePerVisit: true,
  maxEventsPerMinute: 12,
};

describe("world trigger normalization", () => {
  it("normalizes string-enum flags and drops private binding routing", () => {
    expect(normalizeWorldTriggersSnapshot({
      worldId: "garden",
      definitions: [definition],
      bindings: [{
        bindingId: "binding-1",
        triggerId: "entrance",
        sinkKind: "agent",
        sinkKey: "must-not-leak",
        agentId: "concierge",
        eventLabel: "world entrance",
      }],
      presentActorCount: 2,
    })).toMatchObject({
      definitions: [{ transitions: ["entered", "exited"] }],
      bindings: [{ agentId: "concierge", eventLabel: "world entrance" }],
      presentActorCount: 2,
    });
    expect(serializeWorldTriggerTransitions(["dwelled", "entered"])).toBe("entered, dwelled");
  });

  it("accepts numeric flags during a serializer migration", () => {
    expect(normalizeWorldTriggersSnapshot({
      worldId: "garden",
      definitions: [{ ...definition, transitionKinds: 5 }],
    }).definitions[0]?.transitions).toEqual(["entered", "dwelled"]);
  });
});

describe("world trigger requests", () => {
  it("unwraps trigger mutation results and sends enum flags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true, definition }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const saved = await upsertWorldTrigger("garden", {
      shape: { kind: "sphere", center: { x: 2, y: 3, z: 4 }, radius: 7 },
      transitions: ["entered", "exited"],
    });

    expect(saved.triggerId).toBe("entrance");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ transitionKinds: "entered, exited" });
  });

  it("unwraps exact-agent binding results", async () => {
    const binding = { bindingId: "binding-1", triggerId: "entrance", agentId: "concierge" };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true, binding }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(upsertWorldTriggerBinding("garden", "entrance", {
      agentId: "concierge",
      eventLabel: "world entrance",
    })).resolves.toMatchObject(binding);
  });

  it("surfaces feature-dark 404s to the UI fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })));
    await expect(fetchWorldTriggers("garden")).rejects.toMatchObject({ status: 404 });
  });
});
