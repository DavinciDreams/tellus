import { describe, expect, it } from "vitest";
import {
  emoteFromWorldPatch,
  isWorldChatMessage,
  isTellusTerrainState,
  isWorldAction,
  isWorldGeneratedThing,
  isWorldProcPlantPlacement,
  procPlantDeletedFromWorldPatch,
  procPlantPlacementsFromWorldPatch,
  worldChatFromWorldPatch,
  biomeCellsFromSnapshot,
  biomeCellsFromWorldPatch,
  dedupePresenceForDisplay,
  repairGeneratedCloneModelLinks,
  wildlifeCommandReceiptFromWorldPatch,
  wildlifeConfiguredFromWorldPatch,
  wildlifePatchFromWorldPatch,
  wildlifeSnapshotFromWorldPatch,
} from "./world-protocol";

describe("dedupePresenceForDisplay", () => {
  const p = (visitorId: string, ownerUserId?: string, lastSeenAt = "2026-01-01T00:00:00Z") =>
    ({ visitorId, ownerUserId, lastSeenAt, connectedAt: lastSeenAt }) as never;
  const now = Date.parse("2026-01-01T00:02:00Z");

  it("collapses one account's many connections to its newest, and hides the viewer's own", () => {
    const roster = [
      p("a1", "alice", "2026-01-01T00:00:01Z"),
      p("a2", "alice", "2026-01-01T00:00:09Z"), // newest alice
      p("a3", "alice", "2026-01-01T00:00:05Z"),
      p("me1", "me", "2026-01-01T00:00:02Z"),
      p("me2", "me", "2026-01-01T00:00:08Z"), // both mine → dropped
    ];
    const out = dedupePresenceForDisplay(roster, "me", now);
    expect(out.map((r) => r.visitorId)).toEqual(["a2"]); // one alice (newest), zero of mine
  });

  it("never collapses agents or anonymous (no ownerUserId) entries", () => {
    const roster = [
      p("agent:bob", "owner1"),
      p("agent:cara", "owner1"), // distinct agents share an owner — both kept
      p("anon1"),
      p("anon2"), // no owner — both kept
    ];
    const out = dedupePresenceForDisplay(roster, "me", now);
    expect(out.map((r) => r.visitorId).sort()).toEqual(["agent:bob", "agent:cara", "anon1", "anon2"]);
  });

  it("filters stale anonymous presences and never shows this visitor as remote", () => {
    const roster = [
      p("old-anon", undefined, "2025-12-31T23:59:50Z"),
      p("fresh-anon", undefined, "2026-01-01T00:01:20Z"),
      p("my-visitor", undefined, "2026-01-01T00:01:50Z"),
    ];
    const out = dedupePresenceForDisplay(roster, null, now, "my-visitor");
    expect(out.map((r) => r.visitorId)).toEqual(["fresh-anon"]);
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

describe("procplant placement protocol", () => {
  const placement = {
    id: "procplant-1",
    presetId: "daylilyFlower",
    seed: 42,
    position: { x: 1, y: 0, z: 2 },
    scale: 1.1,
  };

  it("extracts snapshot, update, delete, and validates upsert actions", () => {
    expect(isWorldProcPlantPlacement(placement)).toBe(true);
    expect(
      isWorldAction({
        type: "procplant.upsert",
        visitorId: "visitor-1",
        placement,
      }),
    ).toBe(true);
    expect(procPlantPlacementsFromWorldPatch({
      type: "world.snapshot",
      procPlantPlacements: [placement, { ...placement, id: "" }],
    })).toEqual([placement]);
    expect(procPlantPlacementsFromWorldPatch({
      type: "procplant.updated",
      placement,
      actorId: "visitor-1",
    })).toEqual([placement]);
    expect(procPlantDeletedFromWorldPatch({
      type: "procplant.deleted",
      id: "procplant-1",
      actorId: "visitor-1",
    })).toBe("procplant-1");
  });
});

describe("wildlife protocol", () => {
  const config = {
    animalId: "deer-1",
    enabled: true,
    speciesProfileId: "deer",
    movementMode: "ground",
    herdId: "herd-1",
    home: { kind: "circle", center: { x: 10, z: 20 }, radiusMeters: 45 },
    seed: 42,
    populationEligible: true,
    revision: 1,
  } as const;

  it("validates configure and bounded command actions", () => {
    expect(isWorldAction({
      type: "wildlife.configure",
      visitorId: "owner-1",
      requestId: "configure-1",
      config,
    })).toBe(true);
    expect(isWorldAction({
      type: "wildlife.command",
      visitorId: "agent-1",
      requestId: "command-1",
      selector: { herdId: "herd-1" },
      intent: "travel",
      destination: { x: 18, y: 0, z: 24 },
      durationSeconds: 20,
      reason: "move away from the path",
    })).toBe(true);
    expect(isWorldAction({
      type: "wildlife.command",
      visitorId: "agent-1",
      requestId: "command-2",
      selector: { herdId: "herd-1" },
      intent: "travel",
      durationSeconds: Number.POSITIVE_INFINITY,
    })).toBe(false);
  });

  it("extracts validated snapshots and rejects an entire malformed delta", () => {
    const state = {
      animalId: "deer-1",
      herdId: "herd-1",
      state: "graze",
      animationIntent: "graze",
      position: { x: 10, y: 0, z: 20 },
      rotationY: 0,
      speedMetersPerSecond: 0,
      startedAt: "2026-07-15T12:00:00.000Z",
      controllerMode: "ambient",
      revision: 3,
    } as const;
    const herd = {
      herdId: "herd-1",
      speciesProfileId: "deer",
      movementMode: "ground",
      memberIds: ["deer-1"],
      state: "graze",
      animationIntent: "graze",
      home: config.home,
      populationCap: 12,
      seed: 42,
      revision: 3,
      updatedAt: "2026-07-15T12:00:00.000Z",
    } as const;
    expect(wildlifeSnapshotFromWorldPatch({
      type: "world.snapshot",
      wildlifeAnimals: [config],
      wildlifeStates: [state],
      wildlifeHerds: [herd],
    })).toEqual({ animals: [config], states: [state], herds: [herd] });

    const patch = {
      type: "wildlife.patch",
      seq: 9,
      serverTime: "2026-07-15T12:00:01.000Z",
      herdId: "herd-1",
      animals: [{
        id: "deer-1",
        position: { x: 11, y: 0, z: 21 },
        rotationY: 0.4,
        state: "wander",
        animationIntent: "walk",
        speedMetersPerSecond: 1.1,
        revision: 4,
      }],
    } as const;
    expect(wildlifePatchFromWorldPatch(patch)).toEqual(patch);
    expect(wildlifePatchFromWorldPatch({
      ...patch,
      animals: [...patch.animals, { ...patch.animals[0], id: "", revision: 5 }],
    })).toBeNull();
  });

  it("extracts command receipts with non-negative counts", () => {
    const frame = {
      type: "wildlife.command.receipt",
      receipt: {
        requestId: "command-1",
        status: "accepted",
        matchedAnimals: 4,
        matchedHerds: 1,
        issuedBy: "agent-1",
        acceptedAt: "2026-07-15T12:00:00.000Z",
      },
    } as const;
    expect(wildlifeCommandReceiptFromWorldPatch(frame)).toEqual(frame.receipt);
    expect(wildlifeCommandReceiptFromWorldPatch({
      ...frame,
      receipt: { ...frame.receipt, matchedAnimals: -1 },
    })).toBeNull();
  });

  it("extracts live configuration changes", () => {
    expect(wildlifeConfiguredFromWorldPatch({
      type: "wildlife.configured",
      wildlifeAnimals: [config],
      actorId: "owner-1",
    })).toEqual([config]);
    expect(wildlifeConfiguredFromWorldPatch({
      type: "wildlife.configured",
      wildlifeAnimals: [{ ...config, animalId: "" }],
    })).toBeNull();
  });
});

describe("repairGeneratedCloneModelLinks", () => {
  const base = {
    kind: "flower",
    prompt: "Stylized Yellow Flower Plant",
    creatorId: "visitor",
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    scale: 1,
    color: 0xffff00,
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("repairs a failed clone from a ready sibling with the same kind and prompt", () => {
    const donor = {
      ...base,
      id: "ready-flower",
      modelUrl: "/api/assets/model/asset-1/game-optimized",
      assetStoreModelId: "asset-1",
      generationStatus: "ready" as const,
    };
    const failed = {
      ...base,
      id: "failed-flower",
      generationStatus: "failed" as const,
    };
    const out = repairGeneratedCloneModelLinks([failed, donor]);
    expect(out.repairedIds).toEqual(["failed-flower"]);
    expect(out.things[0]).toMatchObject({
      id: "failed-flower",
      modelUrl: donor.modelUrl,
      assetStoreModelId: donor.assetStoreModelId,
      generationStatus: "ready",
    });
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

  it("accepts terrain sculpt actions with finite brush radius", () => {
    expect(
      isWorldAction({
        type: "terrain.sculpt",
        visitorId: "visitor-1",
        mode: "raise",
        center: { x: 1, y: 0, z: 2 },
        radius: 8,
      }),
    ).toBe(true);
    expect(
      isWorldAction({
        type: "terrain.sculpt",
        visitorId: "visitor-1",
        mode: "raise",
        center: { x: 1, y: 0, z: 2 },
        radius: Number.NaN,
      }),
    ).toBe(false);
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
    expect(isWorldGeneratedThing({ ...thing, verticalOffset: -1.25 })).toBe(true);
    expect(isWorldGeneratedThing({ ...thing, verticalOffset: "below" })).toBe(false);
    expect(isWorldGeneratedThing({ ...thing, vehicleMode: "ground" })).toBe(true);
    expect(isWorldGeneratedThing({ ...thing, vehicleMode: "teleport" })).toBe(false);
    expect(isWorldGeneratedThing({ ...thing, hasAnimations: true })).toBe(true);
    expect(isWorldGeneratedThing({ ...thing, hasAnimations: "yes" })).toBe(false);
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
    expect(isWorldAction({ type: "world.portal.upsert", visitorId: "visitor-1", portal })).toBe(true);
    expect(isWorldAction({ type: "portal.upsert", visitorId: "visitor-1", portal })).toBe(true);
    expect(isWorldAction({ type: "world.portal.delete", visitorId: "visitor-1", portalId: "portal-1" })).toBe(true);
    expect(isWorldAction({ type: "portal.delete", visitorId: "visitor-1", portalId: "portal-1" })).toBe(true);
    expect(isWorldAction({ type: "world.portal.delete", visitorId: "visitor-1", portalId: 12 })).toBe(false);
  });

  it("accepts generated interior door portals with scene URLs", () => {
    const portal = {
      id: "door-1",
      worldId: "main",
      label: "Door",
      position: { x: 1, y: 2, z: 3 },
      radius: 2.2,
      target: {
        kind: "interior",
        worldId: "interior-main-room",
        spawn: { x: 0, y: 0, z: 2 },
        sceneUrl: "generated://interior-room",
      },
    };
    expect(isWorldAction({ type: "portal.upsert", visitorId: "visitor-1", portal })).toBe(true);
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
