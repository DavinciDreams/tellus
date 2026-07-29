import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptFriendRequest,
  fetchFriends,
  parseFriendsSnapshot,
  removeFriend,
  sendFriendRequest,
} from "./tellus-friends-client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("parseFriendsSnapshot", () => {
  it("normalizes all relationship lists and keeps the newest duplicate", () => {
    expect(parseFriendsSnapshot({
      friends: [{ userId: " friend-a ", since: 10 }, { userId: "friend-a", since: 20 }],
      pendingIncoming: [{ userId: "friend-b", requestedAt: 30 }],
      pendingOutgoing: [{ userId: "friend-c", requestedAt: 40 }],
    })).toEqual({
      friends: [{ userId: "friend-a", principalId: "friend-a", kind: "account", sinceMs: 20 }],
      pendingIncoming: [{ userId: "friend-b", principalId: "friend-b", kind: "account", requestedAtMs: 30 }],
      pendingOutgoing: [{ userId: "friend-c", principalId: "friend-c", kind: "account", requestedAtMs: 40 }],
    });
  });

  it("keeps typed agent principals and friendly names", () => {
    expect(parseFriendsSnapshot({
      friends: [{ userId: "agent-1", principalId: "agent-1", kind: "agent", displayName: "Juniper", since: 12 }],
    }).friends).toEqual([{
      userId: "agent-1",
      principalId: "agent-1",
      kind: "agent",
      displayName: "Juniper",
      sinceMs: 12,
    }]);
  });

  it("drops malformed entries", () => {
    expect(parseFriendsSnapshot({ friends: [{ userId: "", since: 1 }, { userId: "u", since: "now" }] }))
      .toEqual({ friends: [], pendingIncoming: [], pendingOutgoing: [] });
  });
});

describe("friends API", () => {
  it("loads the authenticated snapshot", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ friends: [], pendingIncoming: [], pendingOutgoing: [] })));
    globalThis.fetch = fetchMock;
    await fetchFriends();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/tellus/friends");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
  });

  it("posts request and accept operations", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: true, outcome: "Requested" }))));
    globalThis.fetch = fetchMock;
    await sendFriendRequest(" friend-a ");
    await acceptFriendRequest("friend-b");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST", body: JSON.stringify({ userId: "friend-a" }) });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/tellus/friends/accept");
  });

  it("deletes encoded targets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, outcome: "Removed" })));
    globalThis.fetch = fetchMock;
    await removeFriend("friend/name");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/tellus/friends/friend%2Fname");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("uses typed bodies and routes for agent relationships", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ ok: true, outcome: "RequestQueued" }), { status: 202 }),
    ));
    globalThis.fetch = fetchMock;
    await sendFriendRequest({ kind: "agent", principalId: " agent/name " });
    await removeFriend({ kind: "agent", principalId: "agent/name" });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ kind: "agent", principalId: "agent/name" }),
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/tellus/friends/agent/agent%2Fname");
  });

  it("keeps account mutations compatible with the legacy deployed contract", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      new Response(JSON.stringify({ ok: true, outcome: "Requested" })),
    ));
    globalThis.fetch = fetchMock;
    await sendFriendRequest({ kind: "account", principalId: "friend-a" });
    await removeFriend({ kind: "account", principalId: "friend-a" });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ body: JSON.stringify({ userId: "friend-a" }) });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/tellus/friends/friend-a");
    expect(String(fetchMock.mock.calls[1]?.[0])).not.toContain("/account/");
  });

  it("surfaces retry timing from rate limits", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "rate limited", retryAfterSeconds: 4.2 }),
      { status: 429 },
    ));
    await expect(sendFriendRequest("friend-a")).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 4.2,
      message: "rate limited Try again in 5 seconds.",
    });
  });
});
