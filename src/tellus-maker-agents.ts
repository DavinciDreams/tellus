import { runtimeConfig } from "./tellus-runtime-config";

export interface MakerAgentSummary {
  agentId: string;
  name: string;
  makerUserId: string;
  worldId: string;
  visitorId: string;
  enabled: boolean;
  optedIn: boolean;
  ownerPresent: boolean;
  offlinePersistence: boolean;
  lastTickAt?: string | null;
  avatarId?: string | null;
  isDefault: boolean;
}

export interface MakerAgentDirectory {
  defaultAgentId: string | null;
  agents: MakerAgentSummary[];
}

export interface CreateMakerAgentInput {
  worldId: string;
  name: string;
  persona?: string;
}

type MakerAgentAction = "start" | "stop" | "place";

export class MakerAgentApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function apiRoot(): string {
  return runtimeConfig.worldApiBase || runtimeConfig.apiBase || "";
}

export function makerAgentsUrl(agentId?: string, action?: MakerAgentAction): string {
  const base = `${apiRoot()}/api/tellus/agents`;
  if (!agentId) return base;
  const agent = `${base}/${encodeURIComponent(agentId)}`;
  return action ? `${agent}/${action}` : agent;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function boolValue(value: unknown): boolean {
  return value === true;
}

export function normalizeMakerAgentSummary(value: unknown): MakerAgentSummary | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const agentId = stringValue(row.agentId).trim();
  const worldId = stringValue(row.worldId).trim();
  if (!agentId || !worldId) return null;
  return {
    agentId,
    name: stringValue(row.name).trim() || "Agent",
    makerUserId: stringValue(row.makerUserId).trim(),
    worldId,
    visitorId: stringValue(row.visitorId).trim(),
    enabled: boolValue(row.enabled),
    optedIn: boolValue(row.optedIn),
    ownerPresent: boolValue(row.ownerPresent),
    offlinePersistence: boolValue(row.offlinePersistence),
    lastTickAt: typeof row.lastTickAt === "string" ? row.lastTickAt : null,
    avatarId: typeof row.avatarId === "string" ? row.avatarId : null,
    isDefault: boolValue(row.isDefault),
  };
}

export function normalizeMakerAgentDirectory(value: unknown): MakerAgentDirectory {
  if (!value || typeof value !== "object") return { defaultAgentId: null, agents: [] };
  const body = value as Record<string, unknown>;
  const agents = Array.isArray(body.agents)
    ? body.agents.map(normalizeMakerAgentSummary).filter((agent): agent is MakerAgentSummary => agent !== null)
    : [];
  const declaredDefault = stringValue(body.defaultAgentId).trim();
  const fallbackDefault = agents.find((agent) => agent.isDefault)?.agentId ?? null;
  return {
    defaultAgentId: declaredDefault || fallbackDefault,
    agents,
  };
}

async function errorFrom(response: Response, fallback: string): Promise<MakerAgentApiError> {
  let message = fallback;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) message = body.error.trim();
  } catch {
    /* keep the action-specific fallback */
  }
  return new MakerAgentApiError(response.status, message);
}

export async function fetchMakerAgents(signal?: AbortSignal): Promise<MakerAgentDirectory> {
  const response = await fetch(makerAgentsUrl(), { signal });
  if (!response.ok) throw await errorFrom(response, `Could not load agents (${response.status}).`);
  return normalizeMakerAgentDirectory(await response.json());
}

export async function createMakerAgent(input: CreateMakerAgentInput): Promise<MakerAgentSummary> {
  const response = await fetch(makerAgentsUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await errorFrom(response, `Could not create agent (${response.status}).`);
  const agent = normalizeMakerAgentSummary(await response.json());
  if (!agent) throw new MakerAgentApiError(response.status, "The server returned an invalid agent.");
  return agent;
}

export async function runMakerAgentAction(
  agentId: string,
  action: MakerAgentAction,
  worldId?: string,
): Promise<MakerAgentSummary> {
  const response = await fetch(makerAgentsUrl(agentId, action), {
    method: "POST",
    headers: worldId ? { "Content-Type": "application/json" } : undefined,
    body: worldId ? JSON.stringify({ worldId }) : undefined,
  });
  if (!response.ok) throw await errorFrom(response, `Could not ${action} agent (${response.status}).`);
  const agent = normalizeMakerAgentSummary(await response.json());
  if (!agent) throw new MakerAgentApiError(response.status, "The server returned an invalid agent.");
  return agent;
}

export async function deleteMakerAgent(agentId: string): Promise<void> {
  const response = await fetch(makerAgentsUrl(agentId), { method: "DELETE" });
  if (!response.ok) throw await errorFrom(response, `Could not delete agent (${response.status}).`);
}
