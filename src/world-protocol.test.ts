import { describe, expect, it } from "vitest";
import {
  emoteFromWorldPatch,
  isWorldChatMessage,
  isTellusTerrainState,
  isWorldAction,
  isWorldGeneratedThing,
  worldChatFromWorldPatch,
  biomeCellsFromSnapshot,
  biomeCellsFromWorldPatch,
  dedupePresenceForDisplay,
} from "./world-protocol";

describe("dedupePresenceForDisplay", () => {
  const p = (visitorId: string, ownerUserId?: string, lastSeenAt = "2026-01-01T00:00:00Z") =>
    ({ visitorId, ownerUserId, lastSeenAt, connectedAt: lastSeenAt }) as never;

  it("collapses one account's many connections to its newest, and hides the viewer's own", () => {
    const roster = [
      p("a1", "alice", "2026-01-01T00:00:01Z"),
      p("a2", "alice", "2026-01-01T00:00:09Z"), // newest alice
      p("a3", "alice", "2026-01-01T00:00:05Z"),
      p("me1", "me", "2026-01-01T00:00:02Z"),
      p("me2", "me", "2026-01-01T00:00:08Z"), // both mine → dropped
    ];
    const out = dedupePresenceForDisplay(roster, "me");
    expect(out.map((r) => r.visitorId)).toEqual(["a2"]); // one alice (newest), zero of mine
  });

  it("never collapses agents or anonymous (no ownerUserId) entries", () => {
    const roster = [
      p("agent:bob", "owner1"),
      p("agent:cara", "owner1"), // distinct agents share an owner — both kept
      p("anon1"),
      p("anon2"), // no owner — both kept
    ];
    const out = dedupePresenceForDisplay(roster, "me");
    expect(out.map((r) => r.visitorId).sort()).toEqual(["agent:bob", "agent:cara", "anon1", "anon2"]);
  });
});

describe("biome cell extraction", () => {
  const cells = [
    { cx: 4, cz: 4, biome: "desert" },
    { cx: 19, cz: 19, biome: "forest" },
    { cx: 0, cz: 0, biome: "bogus", junk: true },
  ];
  it("seeds the full set from the authoritative world.snapshot", () => {
    const got = biomeCellsFromSnapshot({ type: "world.snapshot", biomeCells: cells });
    expect(got).toHaveLength(3);
    expect(got?.[0]).toMatchObject({ cx: 4, cz: 4, biome: "desert" });
  });
  it("ignores non-snapshot frames and missing fields", () => {
    expect(biomeCellsFromSnapshot({ type: "world.biome.patch", biomeCells: cells })).toBeNull();
    expect(biomeCellsFromSnapshot({ type: "world.snapshot" })).toBeNull();
    // the diff extractor must NOT consume a snapshot (else it would merge instead of reset)
    expect(biomeCellsFromWorldPatch({ type: "world.snapshot", biomeCells: cells })).toBeNull();
    expect(biomeCellsFromWorldPatch({ type: "world.biome.patch", biomeCells: cells })).toHaveLength(3);
  });
});

const terrainState = {
  version: 2,
  revision: 12,
  terrainSculptOffsets: [0, 1, 2],
  terrainPaint: [0, 3, 4],
  distantIslandSculptOffsets: {
    north: [1, 2, 3],
  },
  distantIslandPaint: {
    north: [0, 1, 2],
  },
  savedAt: "2026-06-05T00:00:00.000Z",
};

describe("world protocol validators", () => {
  it("accepts complete terrain snapshots", () => {
    expect(isTellusTerrainState(terrainState)).toBe(true);
  });

  it("rejects malformed terrain arrays", () => {
    expect(
      isTellusTerrainState({
        ...terrainState,
        terrainSculptOffsets: [0, Number.NaN],
      }),
    ).toBe(false);
  });

  it("accepts terrain replace actions", () => {
    expect(
      isWorldAction({
        type: "terrain.replace",
        visitorId: "visitor-1",
        terrain: terrainState,
      }),
    ).toBe(true);
  });

  it("accepts presence updates with and without an avatarId", () => {
    const base = {
      type: "presence.update",
      visitorId: "visitor-1",
      position: { x: 1, y: 2, z: 3 },
    };
    expect(isWorldAction(base)).toBe(true);
    expect(isWorldAction({ ...base, avatarId: "glb:abc123" })).toBe(true);
    expect(isWorldAction({ ...base, avatarId: "" })).toBe(true);
    expect(isWorldAction({ ...base, avatarId: 7 })).toBe(false);
  });

  it("rejects generation requests without prompts", () => {
    expect(
      isWorldAction({
        type: "generation.request",
        visitorId: "visitor-1",
        request: { creatorId: "agent-1" },
      }),
    ).toBe(false);
  });

  it("accepts generated things with and without an animation", () => {
    const thing = {
      id: "thing-1",
      kind: "creature",
      prompt: "a shiba",
      creatorId: "visitor-1",
      position: { x: 1, y: 2, z: 3 },
      rotationY: 0,
      scale: 1,
      color: 0xffffff,
      updatedAt: "2026-06-11T00:00:00.000Z",
    };
    expect(isWorldGeneratedThing(thing)).toBe(true);
    expect(isWorldGeneratedThing({ ...thing, animation: "Walk" })).toBe(true);
    expect(isWorldGeneratedThing({ ...thing, animation: "" })).toBe(true);
    expect(isWorldGeneratedThing({ ...thing, animation: 7 })).toBe(false);
  });

  it("upsert actions round-trip the animation field", () => {
    expect(
      isWorldAction({
        type: "generated.upsert",
        visitorId: "visitor-1",
        thing: {
          id: "thing-1",
          kind: "creature",
          prompt: "a shiba",
          creatorId: "visitor-1",
          position: { x: 1, y: 2, z: 3 },
          rotationY: 0,
          scale: 1,
          color: 0xffffff,
          animation: "Gallop",
          updatedAt: "2026-06-11T00:00:00.000Z",
        },
      }),
    ).toBe(true);
  });

  it("parses emote frames and rejects malformed ones", () => {
    expect(
      emoteFromWorldPatch({
        type: "emote",
        emote: { visitorId: "visitor-1", animation: "wave" },
      }),
    ).toEqual({ visitorId: "visitor-1", animation: "wave" });
    expect(emoteFromWorldPatch({ type: "emote", emote: { visitorId: "visitor-1" } })).toBeNull();
    expect(emoteFromWorldPatch({ type: "emote", emote: { visitorId: "", animation: "wave" } })).toBeNull();
    expect(emoteFromWorldPatch({ type: "emote", emote: { visitorId: "v", animation: "" } })).toBeNull();
    expect(emoteFromWorldPatch({ type: "emote" })).toBeNull();
    expect(emoteFromWorldPatch({ type: "presence.updated", presence: [] })).toBeNull();
    expect(emoteFromWorldPatch(null)).toBeNull();
  });

  it("accepts world chat actions and extracts chat patches", () => {
    const message = {
      id: "chat-1",
      visitorId: "visitor-1",
      senderName: "Ari",
      text: "meet by the pond",
      channel: "nearby",
      position: { x: 1, y: 2, z: 3 },
      createdAt: "2026-06-16T00:00:00.000Z",
    };
    expect(isWorldChatMessage(message)).toBe(true);
    expect(isWorldAction({ type: "world.chat", visitorId: "visitor-1", message })).toBe(true);
    expect(worldChatFromWorldPatch({ type: "world.chat", message })).toEqual([message]);
    expect(worldChatFromWorldPatch({ type: "world.snapshot", chat: [message, { ...message, id: "" }] })).toEqual([
      message,
    ]);
    const dm = {
      ...message,
      id: "chat-2",
      channel: "dm",
      recipientId: "agent:atlas",
      recipientName: "Atlas",
    };
    expect(isWorldChatMessage(dm)).toBe(true);
    expect(isWorldAction({ type: "world.chat", visitorId: "visitor-1", message: dm })).toBe(true);
  });

  it("accepts portal upsert and delete actions", () => {
    const portal = {
      id: "portal-1",
      worldId: "main",
      label: "main to aurora portal",
      position: { x: 1, y: 2, z: 3 },
      radius: 2.2,
      target: { kind: "world", worldId: "aurora", spawn: { x: 0, y: 0, z: 0 } },
      anchorThingId: "gate-1",
    };
    expect(isWorldAction({ type: "portal.upsert", visitorId: "visitor-1", portal })).toBe(true);
    expect(isWorldAction({ type: "portal.delete", visitorId: "visitor-1", portalId: "portal-1" })).toBe(true);
    expect(isWorldAction({ type: "portal.delete", visitorId: "visitor-1", portalId: 12 })).toBe(false);
  });

  it("rejects malformed world chat messages", () => {
    const base = {
      id: "chat-1",
      visitorId: "visitor-1",
      text: "hello",
      channel: "world",
      createdAt: "2026-06-16T00:00:00.000Z",
    };
    expect(isWorldChatMessage(base)).toBe(true);
    expect(isWorldChatMessage({ ...base, text: "   " })).toBe(false);
    expect(isWorldChatMessage({ ...base, channel: "private" })).toBe(false);
    expect(isWorldChatMessage({ ...base, position: { x: 1, y: 2 } })).toBe(false);
  });
});
