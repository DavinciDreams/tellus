import { describe, expect, it } from "vitest";
import {
  isWorldPortal,
  portalsFromWorldPatch,
  portalDeletedFromWorldPatch,
  portalEnteredFromWorldPatch,
  type WorldPortal,
} from "./world-protocol";

const portal: WorldPortal = {
  id: "door-1",
  worldId: "main",
  label: "Tavern door",
  position: { x: 1, y: 0, z: 2 },
  radius: 2.5,
  target: { kind: "interior", worldId: "interior-main-tavern", spawn: { x: 0, y: 0, z: 3 }, sceneUrl: "/interiors/tavern.glb" },
};

describe("portal protocol extractors", () => {
  it("isWorldPortal validates the nested target shape", () => {
    expect(isWorldPortal(portal)).toBe(true);
    expect(isWorldPortal({ ...portal, target: undefined })).toBe(false);
    expect(isWorldPortal({ ...portal, target: { kind: "nope", worldId: "x" } })).toBe(false);
    expect(isWorldPortal({ ...portal, id: "" })).toBe(false);
  });

  it("portalsFromWorldPatch reads snapshot.portals and portal.updated", () => {
    expect(portalsFromWorldPatch({ type: "world.snapshot", portals: [portal, { id: "" }] })).toEqual([portal]);
    expect(portalsFromWorldPatch({ type: "portal.updated", portal })).toEqual([portal]);
    expect(portalsFromWorldPatch({ type: "world.chat", message: {} })).toBeNull();
    // legacy snapshot with no portals → null (not an empty list, so it doesn't clobber)
    expect(portalsFromWorldPatch({ type: "world.snapshot" })).toBeNull();
  });

  it("portalDeletedFromWorldPatch returns the id", () => {
    expect(portalDeletedFromWorldPatch({ type: "portal.deleted", portalId: "d" })).toBe("d");
    expect(portalDeletedFromWorldPatch({ type: "portal.updated", portal })).toBeNull();
  });

  it("portalEnteredFromWorldPatch extracts the switch target", () => {
    const e = portalEnteredFromWorldPatch({
      type: "world.portal.entered",
      portalId: "door-1",
      fromWorldId: "main",
      toWorldId: "interior-main-tavern",
      spawn: { x: 0, y: 0, z: 3 },
      sceneUrl: "/interiors/tavern.glb",
    });
    expect(e?.toWorldId).toBe("interior-main-tavern");
    expect(e?.spawn?.z).toBe(3);
    expect(e?.sceneUrl).toBe("/interiors/tavern.glb");
    expect(portalEnteredFromWorldPatch({ type: "world.portal.entered" })).toBeNull(); // no target
    expect(portalEnteredFromWorldPatch({ type: "presence.updated" })).toBeNull();
  });
});
