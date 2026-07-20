import { worldApiUrl } from "./tellus-runtime-config";

export interface RegistryPresence {
  userId: string;
  worldId: string;
  name?: string;
  avatarId?: string;
  lastSeenAt: string;
  online: boolean;
}

export interface PresenceRegistryDiagnostics {
  pollIntervalMs: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  onlineCount: number;
  queryKind: "roster" | "batch" | null;
}

const diagnostics: PresenceRegistryDiagnostics = {
  pollIntervalMs: 10_000,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: null,
  onlineCount: 0,
  queryKind: null,
};

export function presenceRegistryDiagnostics(): PresenceRegistryDiagnostics {
  return { ...diagnostics };
}

export function setPresencePollIntervalMs(intervalMs: number): void {
  diagnostics.pollIntervalMs = intervalMs;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parsePresenceRegistryResponse(value: unknown): RegistryPresence[] {
  if (!value || typeof value !== "object") return [];
  const rows = (value as { presence?: unknown }).presence;
  if (!Array.isArray(rows)) return [];
  const byUser = new Map<string, RegistryPresence>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const userId = optionalString(record.userId);
    const worldId = optionalString(record.worldId);
    const lastSeenAt = optionalString(record.lastSeenAt);
    if (!userId || !worldId || !lastSeenAt || Number.isNaN(Date.parse(lastSeenAt))) continue;
    const next: RegistryPresence = {
      userId,
      worldId,
      name: optionalString(record.name),
      avatarId: optionalString(record.avatarId),
      lastSeenAt,
      online: record.online !== false,
    };
    const previous = byUser.get(userId);
    if (!previous || Date.parse(next.lastSeenAt) >= Date.parse(previous.lastSeenAt)) {
      byUser.set(userId, next);
    }
  }
  return [...byUser.values()];
}

export class PresenceRegistryError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function queryPresence(
  path: string,
  queryKind: "roster" | "batch",
  signal?: AbortSignal,
): Promise<RegistryPresence[]> {
  const attemptedAt = new Date().toISOString();
  diagnostics.lastAttemptAt = attemptedAt;
  diagnostics.queryKind = queryKind;
  try {
    const response = await fetch(worldApiUrl(path), { cache: "no-store", signal });
    if (!response.ok) {
      let message = `Presence request failed (${response.status}).`;
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === "string" && body.error.trim()) message = body.error.trim();
      } catch {
        // The status code remains useful when the gateway returns an empty/non-JSON error.
      }
      throw new PresenceRegistryError(response.status, message);
    }
    const parsed = parsePresenceRegistryResponse(await response.json());
    diagnostics.lastSuccessAt = new Date().toISOString();
    diagnostics.lastError = null;
    diagnostics.onlineCount = parsed.filter((entry) => entry.online).length;
    return parsed;
  } catch (error) {
    if (signal?.aborted) throw error;
    diagnostics.lastFailureAt = new Date().toISOString();
    diagnostics.lastError = error instanceof Error ? error.message : "Presence request failed.";
    throw error;
  }
}

export function fetchOnlinePresence(userId: string, signal?: AbortSignal): Promise<RegistryPresence[]> {
  const params = new URLSearchParams({ userId });
  return queryPresence(`/api/tellus/presence/online?${params}`, "roster", signal);
}

export function fetchPresenceForUsers(
  userId: string,
  friendUserIds: string[],
  signal?: AbortSignal,
): Promise<RegistryPresence[]> {
  const uniqueIds = [...new Set(friendUserIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return Promise.resolve([]);
  const params = new URLSearchParams({ userId, users: uniqueIds.join(",") });
  return queryPresence(`/api/tellus/presence?${params}`, "batch", signal);
}
