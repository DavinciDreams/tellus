import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOnlinePresence,
  fetchPresenceForUsers,
  parsePresenceRegistryResponse,
  presenceRegistryDiagnostics,
} from "./tellus-presence-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parsePresenceRegistryResponse", () => {
  it("normalizes valid entries and keeps the newest row per user", () => {
    expect(parsePresenceRegistryResponse({
      presence: [
        { userId: "u1", worldId: "world-a", name: "A", lastSeenAt: "2026-07-17T10:00:00Z", online: true },
        { userId: "u1", worldId: "world-b", name: "A", lastSeenAt: "2026-07-17T10:00:05Z", online: true },
        { userId: "u2", worldId: "world-c", lastSeenAt: "bad-date", online: true },
      ],
    })).toEqual([
      { userId: "u1", worldId: "world-b", name: "A", avatarId: undefined, lastSeenAt: "2026-07-17T10:00:05Z", online: true },
    ]);
  });

  it("returns an empty list for malformed responses", () => {
    expect(parsePresenceRegistryResponse(null)).toEqual([]);
    expect(parsePresenceRegistryResponse({ presence: "nope" })).toEqual([]);
  });
});

describe("presence registry requests", () => {
  it("includes the stable caller id in roster queries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ presence: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchOnlinePresence("caller id");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/tellus/presence/online?userId=caller+id");
    expect(presenceRegistryDiagnostics().lastSuccessAt).not.toBeNull();
  });

  it("deduplicates ids into one batch query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ presence: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchPresenceForUsers("me", ["friend-a", "friend-a", " friend-b "]);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://example.test");
    expect(url.searchParams.get("userId")).toBe("me");
    expect(url.searchParams.get("users")).toBe("friend-a,friend-b");
  });
});
