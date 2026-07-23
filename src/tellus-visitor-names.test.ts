import { describe, expect, it } from "vitest";
import { actorKindForVisitorId, friendlyVisitorName } from "./tellus-visitor-names";

describe("visitor name helpers", () => {
  it("classifies world, agent, and player visitor ids", () => {
    expect(actorKindForVisitorId("world")).toBe("world");
    expect(actorKindForVisitorId("agent:mira")).toBe("agent");
    expect(actorKindForVisitorId("visitor-123")).toBe("player");
  });

  it("prefers explicit names and labels the local visitor as You", () => {
    expect(friendlyVisitorName("visitor-1", " Mira ")).toBe("Mira");
    expect(friendlyVisitorName("visitor-self", undefined, "visitor-self")).toBe("You");
    expect(friendlyVisitorName("visitor-self", "Lisa", "visitor-self")).toBe("You");
    expect(friendlyVisitorName("visitor-remote", "You", "visitor-self")).toBe("Player visito");
  });

  it("builds friendly agent and anonymous player names", () => {
    expect(friendlyVisitorName("agent:user-solar-guide-abcdef123456")).toBe("Solar Guide");
    expect(friendlyVisitorName("visitor-abcdef")).toBe("Player visito");
  });
});
