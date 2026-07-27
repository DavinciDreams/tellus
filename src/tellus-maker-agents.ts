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
  lastEvaluation: MakerAgentEvaluationSummary | null;
  isDefault: boolean;
  runtimePolicy: AgentRuntimePolicy;
  eventWakesLastMinute: number;
}

export type AgentRuntimePolicy = "makerPresent" | "eventDriven" | "resident";

export interface MakerAgentEvaluationSummary {
  jobId: string;
  status: string;
  decision: string | null;
  summary: string | null;
  at: string | null;
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

export function makerAgentRuntimePolicyUrl(agentId: string): string {
  return `${makerAgentsUrl(agentId)}/runtime-policy`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function boolValue(value: unknown): boolean {
  return value === true;
}

function runtimePolicyValue(value: unknown): AgentRuntimePolicy {
  return value === "eventDriven" || value === "resident" ? value : "makerPresent";
}

function nonNegativeInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function normalizeLastEvaluation(value: unknown): MakerAgentEvaluationSummary | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const jobId = stringValue(row.jobId).trim();
  const status = stringValue(row.status).trim().slice(0, 40);
  if (!jobId || !status) return null;
  return {
    jobId,
    status,
    decision: typeof row.decision === "string" ? row.decision.trim().slice(0, 80) || null : null,
    summary: typeof row.summary === "string" ? row.summary.trim().slice(0, 240) || null : null,
    at: typeof row.at === "string" ? row.at : null,
  };
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
    lastEvaluation: normalizeLastEvaluation(row.lastEvaluation),
    isDefault: boolValue(row.isDefault),
    runtimePolicy: runtimePolicyValue(row.runtimePolicy),
    eventWakesLastMinute: nonNegativeInteger(row.eventWakesLastMinute),
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

export async function renameMakerAgent(agentId: string, name: string): Promise<MakerAgentSummary> {
  const response = await fetch(makerAgentsUrl(agentId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) throw await errorFrom(response, `Could not rename agent (${response.status}).`);
  const agent = normalizeMakerAgentSummary(await response.json());
  if (!agent) throw new MakerAgentApiError(response.status, "The server returned an invalid agent.");
  return agent;
}

export async function setMakerAgentRuntimePolicy(
  agentId: string,
  runtimePolicy: AgentRuntimePolicy,
): Promise<MakerAgentSummary> {
  const response = await fetch(makerAgentRuntimePolicyUrl(agentId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runtimePolicy }),
  });
  if (!response.ok) throw await errorFrom(response, `Could not update runtime policy (${response.status}).`);
  const agent = normalizeMakerAgentSummary(await response.json());
  if (!agent) throw new MakerAgentApiError(response.status, "The server returned an invalid agent.");
  return agent;
}

export async function deleteMakerAgent(agentId: string): Promise<void> {
  const response = await fetch(makerAgentsUrl(agentId), { method: "DELETE" });
  if (!response.ok) throw await errorFrom(response, `Could not delete agent (${response.status}).`);
}
