import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDirectMessageInbox,
  fetchDirectMessageThread,
  parseDirectMessageInbox,
  parseDirectMessagePage,
  sendDirectMessage,
} from "./tellus-social-client";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("durable message parsing", () => {
  it("normalizes and sorts inbox threads", () => {
    expect(parseDirectMessageInbox({ threads: [
      { threadId: "old", counterpart: { kind: "account", id: "a" }, counterpartDisplayName: "Ada", lastMessageId: "m1", lastMessageAtMs: 10, unreadCount: 0 },
      { threadId: "new", counterpart: { kind: "agent", id: "b" }, counterpartDisplayName: "Juniper", lastMessageId: "m2", lastMessageAtMs: 20, unreadCount: 2 },
      { threadId: "bad", counterpart: {}, lastMessageAtMs: 30 },
    ]}).map((thread) => thread.threadId)).toEqual(["new", "old"]);
  });

  it("drops malformed messages and orders the thread", () => {
    const page = parseDirectMessagePage({ threadId: "thread", hasMore: true, messages: [
      { messageId: "m2", threadId: "thread", sender: { kind: "agent", id: "a" }, recipient: { kind: "account", id: "me" }, text: "second", sentAtMs: 20 },
      { messageId: "bad", text: "missing actors" },
      { messageId: "m1", threadId: "thread", sender: { kind: "account", id: "me" }, recipient: { kind: "agent", id: "a" }, senderDisplayName: "Me", text: "first", sentAtMs: 10 },
    ] });
    expect(page.messages.map((message) => message.messageId)).toEqual(["m1", "m2"]);
    expect(page.hasMore).toBe(true);
  });
});

describe("durable messages API", () => {
  it("loads the inbox and typed thread route", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ threads: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ threadId: "t", messages: [], hasMore: false })));
    globalThis.fetch = fetchMock;
    await fetchDirectMessageInbox();
    await fetchDirectMessageThread({ kind: "agent", principalId: "agent/name" }, { limit: 25 });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/tellus/dms");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/tellus/dms/agent/agent%2Fname?limit=25");
  });

  it("sends an idempotent typed message", async () => {
    const message = {
      messageId: "m1",
      threadId: "t1",
      sender: { kind: "account", id: "me" },
      recipient: { kind: "agent", id: "agent-1" },
      senderDisplayName: "Maker",
      text: "Hello",
      sentAtMs: 10,
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message, wakeScheduled: true, deliveryPending: true })));
    globalThis.fetch = fetchMock;
    const result = await sendDirectMessage({ kind: "agent", principalId: "agent-1" }, " Hello ", "key-1");
    expect(result.wakeScheduled).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ text: "Hello", idempotencyKey: "key-1" }),
    });
  });
});
