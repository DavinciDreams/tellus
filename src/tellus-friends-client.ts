import { worldApiUrl } from "./tellus-runtime-config";

export type SocialPrincipalKind = "account" | "agent";

export interface SocialPrincipalTarget {
  kind: SocialPrincipalKind;
  principalId: string;
}

export interface FriendLink extends SocialPrincipalTarget {
  userId: string;
  displayName?: string;
  sinceMs: number;
}

export interface FriendRequestLink extends SocialPrincipalTarget {
  userId: string;
  displayName?: string;
  requestedAtMs: number;
}

export interface FriendsSnapshot {
  friends: FriendLink[];
  pendingIncoming: FriendRequestLink[];
  pendingOutgoing: FriendRequestLink[];
}

export interface FriendMutationResponse {
  ok: true;
  outcome: string;
}

export interface FriendsDiagnostics {
  refreshIntervalMs: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  friendCount: number;
  incomingCount: number;
  outgoingCount: number;
  lastMutation: string | null;
}

const diagnostics: FriendsDiagnostics = {
  refreshIntervalMs: 60_000,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
  friendCount: 0,
  incomingCount: 0,
  outgoingCount: 0,
  lastMutation: null,
};

export const EMPTY_FRIENDS_SNAPSHOT: FriendsSnapshot = Object.freeze({
  friends: [],
  pendingIncoming: [],
  pendingOutgoing: [],
});

export function friendsDiagnostics(): FriendsDiagnostics {
  return { ...diagnostics };
}

export function setFriendsRefreshIntervalMs(intervalMs: number): void {
  diagnostics.refreshIntervalMs = intervalMs;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsePrincipalKind(value: unknown): SocialPrincipalKind {
  return typeof value === "string" && value.toLowerCase() === "agent" ? "agent" : "account";
}

function parseLinks(value: unknown, timestampKey: "since" | "requestedAt"): Array<FriendLink | FriendRequestLink> {
  if (!Array.isArray(value)) return [];
  const byUser = new Map<string, FriendLink | FriendRequestLink>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const principalId = cleanString(row.principalId) ?? cleanString(row.userId);
    const timestamp = row[timestampKey];
    if (!principalId || typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp < 0) continue;
    const kind = parsePrincipalKind(row.kind);
    const userId = cleanString(row.userId) ?? principalId;
    const displayName = cleanString(row.displayName);
    const parsed = timestampKey === "since"
      ? { userId, principalId, kind, ...(displayName ? { displayName } : {}), sinceMs: timestamp }
      : { userId, principalId, kind, ...(displayName ? { displayName } : {}), requestedAtMs: timestamp };
    const key = `${kind}:${principalId}`;
    const previous = byUser.get(key);
    const previousTimestamp = previous && "sinceMs" in previous ? previous.sinceMs : previous?.requestedAtMs ?? -1;
    if (timestamp >= previousTimestamp) byUser.set(key, parsed);
  }
  return [...byUser.values()];
}

export function parseFriendsSnapshot(value: unknown): FriendsSnapshot {
  if (!value || typeof value !== "object") return { friends: [], pendingIncoming: [], pendingOutgoing: [] };
  const response = value as Record<string, unknown>;
  return {
    friends: parseLinks(response.friends, "since") as FriendLink[],
    pendingIncoming: parseLinks(response.pendingIncoming, "requestedAt") as FriendRequestLink[],
    pendingOutgoing: parseLinks(response.pendingOutgoing, "requestedAt") as FriendRequestLink[],
  };
}

export class FriendsApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function responseError(response: Response): Promise<FriendsApiError> {
  let message = `Friends request failed (${response.status}).`;
  let retryAfterSeconds: number | undefined;
  try {
    const body = (await response.json()) as { error?: unknown; retryAfterSeconds?: unknown };
    if (typeof body.error === "string" && body.error.trim()) message = body.error.trim();
    if (typeof body.retryAfterSeconds === "number" && Number.isFinite(body.retryAfterSeconds)) {
      retryAfterSeconds = Math.max(0, body.retryAfterSeconds);
    }
  } catch {
    // Preserve the useful HTTP status when a gateway returns no JSON body.
  }
  if (response.status === 429 && retryAfterSeconds !== undefined) {
    message = `${message} Try again in ${Math.ceil(retryAfterSeconds)} seconds.`;
  }
  return new FriendsApiError(response.status, message, retryAfterSeconds);
}

export async function fetchFriends(signal?: AbortSignal): Promise<FriendsSnapshot> {
  diagnostics.lastAttemptAt = new Date().toISOString();
  try {
    const response = await fetch(worldApiUrl("/api/tellus/friends"), { cache: "no-store", signal });
    if (!response.ok) throw await responseError(response);
    const snapshot = parseFriendsSnapshot(await response.json());
    diagnostics.lastSuccessAt = new Date().toISOString();
    diagnostics.lastError = null;
    diagnostics.friendCount = snapshot.friends.length;
    diagnostics.incomingCount = snapshot.pendingIncoming.length;
    diagnostics.outgoingCount = snapshot.pendingOutgoing.length;
    return snapshot;
  } catch (error) {
    if (signal?.aborted) throw error;
    diagnostics.lastFailureAt = new Date().toISOString();
    diagnostics.lastError = error instanceof Error ? error.message : "Friends request failed.";
    throw error;
  }
}

async function mutateFriend(
  action: "request" | "accept" | "decline" | "remove",
  target: string | SocialPrincipalTarget,
  signal?: AbortSignal,
): Promise<FriendMutationResponse> {
  const explicit = typeof target !== "string";
  const typed = explicit && target.kind === "agent";
  const principalId = (explicit ? target.principalId : target).trim();
  const kind = typed ? "agent" : "account";
  if (!principalId) throw new FriendsApiError(400, "Choose a valid friend.");
  const remove = action === "remove";
  const path = remove
    ? typed
      ? `/api/tellus/friends/${kind}/${encodeURIComponent(principalId)}`
      : `/api/tellus/friends/${encodeURIComponent(principalId)}`
    : `/api/tellus/friends/${action}`;
  const response = await fetch(worldApiUrl(path), {
    method: remove ? "DELETE" : "POST",
    headers: remove ? undefined : { "Content-Type": "application/json" },
    body: remove ? undefined : JSON.stringify(typed ? { kind, principalId } : { userId: principalId }),
    signal,
  });
  if (!response.ok) throw await responseError(response);
  const body = (await response.json()) as { ok?: unknown; outcome?: unknown };
  const result: FriendMutationResponse = {
    ok: true,
    outcome: cleanString(body.outcome) ?? "Completed",
  };
  diagnostics.lastMutation = `${action}:${result.outcome}`;
  return result;
}

export const sendFriendRequest = (target: string | SocialPrincipalTarget, signal?: AbortSignal) => mutateFriend("request", target, signal);
export const acceptFriendRequest = (target: string | SocialPrincipalTarget, signal?: AbortSignal) => mutateFriend("accept", target, signal);
export const declineFriendRequest = (target: string | SocialPrincipalTarget, signal?: AbortSignal) => mutateFriend("decline", target, signal);
export const removeFriend = (target: string | SocialPrincipalTarget, signal?: AbortSignal) => mutateFriend("remove", target, signal);
