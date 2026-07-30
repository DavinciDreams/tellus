import { worldApiUrl } from "./tellus-runtime-config";
import type { SocialPrincipalKind, SocialPrincipalTarget } from "./tellus-friends-client";

export interface DirectMessagePrincipal {
  kind: SocialPrincipalKind;
  id: string;
}

export interface DirectMessageThreadSummary {
  threadId: string;
  counterpart: DirectMessagePrincipal;
  counterpartDisplayName?: string;
  lastMessageId: string;
  lastMessageAtMs: number;
  unreadCount: number;
}

export interface DirectMessage {
  messageId: string;
  threadId: string;
  sender: DirectMessagePrincipal;
  recipient: DirectMessagePrincipal;
  senderDisplayName?: string;
  text: string;
  sentAtMs: number;
}

export interface DirectMessagePage {
  threadId: string;
  messages: DirectMessage[];
  hasMore: boolean;
}

export interface DirectMessageSendResult {
  message: DirectMessage;
  wakeScheduled: boolean;
  deliveryPending: boolean;
}

export interface DirectMessageDiagnostics {
  lastInboxAttemptAt: string | null;
  lastInboxSuccessAt: string | null;
  lastThreadSuccessAt: string | null;
  lastSendAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  threadCount: number;
  unreadCount: number;
}

const diagnostics: DirectMessageDiagnostics = {
  lastInboxAttemptAt: null,
  lastInboxSuccessAt: null,
  lastThreadSuccessAt: null,
  lastSendAt: null,
  lastFailureAt: null,
  lastError: null,
  threadCount: 0,
  unreadCount: 0,
};

export class DirectMessagesApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function directMessageDiagnostics(): DirectMessageDiagnostics {
  return { ...diagnostics };
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNonnegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function principal(value: unknown): DirectMessagePrincipal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const id = cleanString(row.id);
  if (!id) return undefined;
  return { kind: row.kind === "agent" ? "agent" : "account", id };
}

export function parseDirectMessageInbox(value: unknown): DirectMessageThreadSummary[] {
  if (!value || typeof value !== "object") return [];
  const rows = (value as Record<string, unknown>).threads;
  if (!Array.isArray(rows)) return [];
  const byThread = new Map<string, DirectMessageThreadSummary>();
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const threadId = cleanString(row.threadId);
    const counterpart = principal(row.counterpart);
    const lastMessageId = cleanString(row.lastMessageId);
    const lastMessageAtMs = finiteNonnegative(row.lastMessageAtMs);
    const unreadCount = finiteNonnegative(row.unreadCount);
    if (!threadId || !counterpart || !lastMessageId || lastMessageAtMs === undefined || unreadCount === undefined) continue;
    byThread.set(threadId, {
      threadId,
      counterpart,
      ...(cleanString(row.counterpartDisplayName) ? { counterpartDisplayName: cleanString(row.counterpartDisplayName) } : {}),
      lastMessageId,
      lastMessageAtMs,
      unreadCount: Math.floor(unreadCount),
    });
  }
  return [...byThread.values()].sort((a, b) => b.lastMessageAtMs - a.lastMessageAtMs);
}

function parseMessage(value: unknown): DirectMessage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const messageId = cleanString(row.messageId);
  const threadId = cleanString(row.threadId);
  const sender = principal(row.sender);
  const recipient = principal(row.recipient);
  const text = cleanString(row.text);
  const sentAtMs = finiteNonnegative(row.sentAtMs);
  if (!messageId || !threadId || !sender || !recipient || !text || sentAtMs === undefined) return undefined;
  return {
    messageId,
    threadId,
    sender,
    recipient,
    ...(cleanString(row.senderDisplayName) ? { senderDisplayName: cleanString(row.senderDisplayName) } : {}),
    text,
    sentAtMs,
  };
}

export function parseDirectMessagePage(value: unknown): DirectMessagePage {
  if (!value || typeof value !== "object") return { threadId: "", messages: [], hasMore: false };
  const row = value as Record<string, unknown>;
  const messages = Array.isArray(row.messages)
    ? row.messages.map(parseMessage).filter((message): message is DirectMessage => Boolean(message))
    : [];
  return {
    threadId: cleanString(row.threadId) ?? "",
    messages: messages.sort((a, b) => a.sentAtMs - b.sentAtMs),
    hasMore: row.hasMore === true,
  };
}

async function responseError(response: Response): Promise<DirectMessagesApiError> {
  let message = `Messages request failed (${response.status}).`;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) message = body.error.trim();
  } catch {
    // Preserve the status when a gateway returns a non-JSON response.
  }
  return new DirectMessagesApiError(response.status, message);
}

function targetPath(target: SocialPrincipalTarget): string {
  const id = target.principalId.trim();
  if (!id) throw new DirectMessagesApiError(400, "Choose a valid conversation.");
  return `/api/tellus/dms/${target.kind}/${encodeURIComponent(id)}`;
}

function noteFailure(error: unknown): void {
  diagnostics.lastFailureAt = new Date().toISOString();
  diagnostics.lastError = error instanceof Error ? error.message : "Messages request failed.";
}

export async function fetchDirectMessageInbox(signal?: AbortSignal): Promise<DirectMessageThreadSummary[]> {
  diagnostics.lastInboxAttemptAt = new Date().toISOString();
  try {
    const response = await fetch(worldApiUrl("/api/tellus/dms"), { cache: "no-store", signal });
    if (!response.ok) throw await responseError(response);
    const threads = parseDirectMessageInbox(await response.json());
    diagnostics.lastInboxSuccessAt = new Date().toISOString();
    diagnostics.lastError = null;
    diagnostics.threadCount = threads.length;
    diagnostics.unreadCount = threads.reduce((sum, thread) => sum + thread.unreadCount, 0);
    return threads;
  } catch (error) {
    if (!signal?.aborted) noteFailure(error);
    throw error;
  }
}

export async function fetchDirectMessageThread(
  target: SocialPrincipalTarget,
  options: { beforeMs?: number; limit?: number; signal?: AbortSignal } = {},
): Promise<DirectMessagePage> {
  const query = new URLSearchParams();
  if (options.beforeMs && options.beforeMs > 0) query.set("beforeMs", String(Math.floor(options.beforeMs)));
  if (options.limit) query.set("limit", String(Math.min(100, Math.max(1, Math.floor(options.limit)))));
  try {
    const suffix = query.size ? `?${query}` : "";
    const response = await fetch(worldApiUrl(`${targetPath(target)}${suffix}`), { cache: "no-store", signal: options.signal });
    if (!response.ok) throw await responseError(response);
    const page = parseDirectMessagePage(await response.json());
    diagnostics.lastThreadSuccessAt = new Date().toISOString();
    diagnostics.lastError = null;
    return page;
  } catch (error) {
    if (!options.signal?.aborted) noteFailure(error);
    throw error;
  }
}

export async function sendDirectMessage(
  target: SocialPrincipalTarget,
  text: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<DirectMessageSendResult> {
  const cleanText = text.trim();
  const cleanKey = idempotencyKey.trim();
  if (!cleanText || !cleanKey) throw new DirectMessagesApiError(400, "Write a message before sending.");
  try {
    const response = await fetch(worldApiUrl(targetPath(target)), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: cleanText, idempotencyKey: cleanKey }),
      signal,
    });
    if (!response.ok) throw await responseError(response);
    const body = (await response.json()) as Record<string, unknown>;
    const message = parseMessage(body.message);
    if (!message) throw new DirectMessagesApiError(502, "The message response was incomplete.");
    diagnostics.lastSendAt = new Date().toISOString();
    diagnostics.lastError = null;
    return {
      message,
      wakeScheduled: body.wakeScheduled === true,
      deliveryPending: body.deliveryPending === true,
    };
  } catch (error) {
    if (!signal?.aborted) noteFailure(error);
    throw error;
  }
}
