import { runtimeConfig } from "./tellus-runtime-config";

export type AgentCapabilityRiskTier = "read" | "build" | "destructive";
export type AgentCapabilityGrantMode = "self" | "maker";
export type AgentCapabilityWorkflowStatus = "running" | "completed" | "failed";

export interface AgentCapabilityOperation {
  id: string;
  description: string;
  inputSchema: string;
}

export interface AgentCapabilityManifest {
  id: string;
  version: number;
  name: string;
  description: string;
  riskTier: AgentCapabilityRiskTier;
  grantMode: AgentCapabilityGrantMode;
  requiredFeatureFlags: string[];
  verificationRecipeId: string | null;
  costHint: string;
  operations: AgentCapabilityOperation[];
}

export interface AgentCapabilityGoal {
  goalId: string;
  description: string;
  setAtMs: number;
}

export interface AgentCapabilityLease {
  leaseId: string;
  capabilityId: string;
  capabilityVersion: number;
  goalId: string;
  grantedByPrincipalId: string;
  grantedAtMs: number;
  expiresAtMs: number;
  remainingInvocations: number;
  budgetTokens: number;
  budgetMs: number;
  consumedTokens: number;
  consumedMs: number;
  worldIds: string[];
}

export interface AgentCapabilityWorkflow {
  workflowId: string;
  capabilityId: string;
  capabilityVersion: number;
  operation: string;
  goalId: string;
  status: AgentCapabilityWorkflowStatus;
  startedAtMs: number;
  completedAtMs: number | null;
  summary: string | null;
  evidenceJobId: string | null;
  costMs: number;
}

export interface AgentCapabilityState {
  activeGoal: AgentCapabilityGoal | null;
  leases: AgentCapabilityLease[];
  workflows: AgentCapabilityWorkflow[];
}

export interface AgentCapabilityLeaseGrantInput {
  capabilityId: string;
  goalId: string;
  durationMinutes: number;
  invocations: number;
  budgetMs: number;
  worldIds: string[];
}

export class AgentCapabilityApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function apiRoot(): string {
  return runtimeConfig.worldApiBase || runtimeConfig.apiBase || "";
}

export function agentCapabilityCatalogUrl(query = "", limit = 16): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  params.set("limit", String(Math.max(1, Math.min(16, Math.floor(limit)))));
  return `${apiRoot()}/api/tellus/capabilities?${params.toString()}`;
}

export function agentCapabilitiesUrl(agentId: string): string {
  return `${apiRoot()}/api/tellus/agents/${encodeURIComponent(agentId)}/capabilities`;
}

export function agentCapabilityLeasesUrl(agentId: string, leaseId?: string): string {
  const base = `${apiRoot()}/api/tellus/agents/${encodeURIComponent(agentId)}/capability-leases`;
  return leaseId ? `${base}/${encodeURIComponent(leaseId)}` : base;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown, max = 2_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableString(value: unknown, max = 2_000): string | null {
  const text = stringValue(value, max);
  return text || null;
}

function numberValue(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) ? number : fallback;
}

function integerValue(value: unknown, fallback = 0): number {
  return Math.max(0, Math.floor(numberValue(value, fallback)));
}

function stringList(value: unknown, max = 32): string[] {
  return Array.isArray(value)
    ? value.map((row) => stringValue(row, 240)).filter(Boolean).slice(0, max)
    : [];
}

function riskTierValue(value: unknown): AgentCapabilityRiskTier {
  if (value === 2 || String(value).toLowerCase() === "destructive") return "destructive";
  if (value === 1 || String(value).toLowerCase() === "build") return "build";
  return "read";
}

function grantModeValue(value: unknown): AgentCapabilityGrantMode {
  return value === 1 || String(value).toLowerCase() === "maker" ? "maker" : "self";
}

function workflowStatusValue(value: unknown): AgentCapabilityWorkflowStatus {
  if (value === 1 || String(value).toLowerCase() === "completed") return "completed";
  if (value === 2 || String(value).toLowerCase() === "failed") return "failed";
  return "running";
}

function normalizeOperation(value: unknown): AgentCapabilityOperation | null {
  const row = recordValue(value);
  if (!row) return null;
  const id = stringValue(row.id, 120);
  if (!id) return null;
  return {
    id,
    description: stringValue(row.description, 500),
    inputSchema: stringValue(row.inputSchema, 8_000) || "{}",
  };
}

export function normalizeCapabilityManifest(value: unknown): AgentCapabilityManifest | null {
  const row = recordValue(value);
  if (!row) return null;
  const id = stringValue(row.id, 120);
  if (!id) return null;
  return {
    id,
    version: Math.max(1, integerValue(row.version, 1)),
    name: stringValue(row.name, 160) || id,
    description: stringValue(row.description, 1_000),
    riskTier: riskTierValue(row.riskTier),
    grantMode: grantModeValue(row.grantMode),
    requiredFeatureFlags: stringList(row.requiredFeatureFlags, 12),
    verificationRecipeId: nullableString(row.verificationRecipeId, 180),
    costHint: stringValue(row.costHint, 300),
    operations: Array.isArray(row.operations)
      ? row.operations.map(normalizeOperation).filter((operation): operation is AgentCapabilityOperation => operation !== null)
      : [],
  };
}

function normalizeGoal(value: unknown): AgentCapabilityGoal | null {
  const row = recordValue(value);
  if (!row) return null;
  const goalId = stringValue(row.goalId, 120);
  if (!goalId) return null;
  return {
    goalId,
    description: stringValue(row.description, 1_000),
    setAtMs: integerValue(row.setAtMs),
  };
}

function normalizeLease(value: unknown): AgentCapabilityLease | null {
  const row = recordValue(value);
  if (!row) return null;
  const leaseId = stringValue(row.leaseId, 180);
  const capabilityId = stringValue(row.capabilityId, 120);
  const goalId = stringValue(row.goalId, 120);
  if (!leaseId || !capabilityId || !goalId) return null;
  return {
    leaseId,
    capabilityId,
    capabilityVersion: Math.max(1, integerValue(row.capabilityVersion, 1)),
    goalId,
    grantedByPrincipalId: stringValue(row.grantedByPrincipalId, 240),
    grantedAtMs: integerValue(row.grantedAtMs),
    expiresAtMs: integerValue(row.expiresAtMs),
    remainingInvocations: integerValue(row.remainingInvocations),
    budgetTokens: integerValue(row.budgetTokens),
    budgetMs: integerValue(row.budgetMs),
    consumedTokens: integerValue(row.consumedTokens),
    consumedMs: integerValue(row.consumedMs),
    worldIds: stringList(row.worldIds, 8),
  };
}

function normalizeWorkflow(value: unknown): AgentCapabilityWorkflow | null {
  const row = recordValue(value);
  if (!row) return null;
  const workflowId = stringValue(row.workflowId, 180);
  const capabilityId = stringValue(row.capabilityId, 120);
  if (!workflowId || !capabilityId) return null;
  const completedAtMs = numberValue(row.completedAtMs, Number.NaN);
  return {
    workflowId,
    capabilityId,
    capabilityVersion: Math.max(1, integerValue(row.capabilityVersion, 1)),
    operation: stringValue(row.operation, 120),
    goalId: stringValue(row.goalId, 120),
    status: workflowStatusValue(row.status),
    startedAtMs: integerValue(row.startedAtMs),
    completedAtMs: Number.isFinite(completedAtMs) ? Math.max(0, Math.floor(completedAtMs)) : null,
    summary: nullableString(row.summary, 2_000),
    evidenceJobId: nullableString(row.evidenceJobId, 180),
    costMs: integerValue(row.costMs),
  };
}

export function normalizeCapabilityState(value: unknown): AgentCapabilityState {
  const row = recordValue(value);
  if (!row) return { activeGoal: null, leases: [], workflows: [] };
  return {
    activeGoal: normalizeGoal(row.activeGoal),
    leases: Array.isArray(row.leases)
      ? row.leases.map(normalizeLease).filter((lease): lease is AgentCapabilityLease => lease !== null)
      : [],
    workflows: Array.isArray(row.workflows)
      ? row.workflows.map(normalizeWorkflow).filter((workflow): workflow is AgentCapabilityWorkflow => workflow !== null)
      : [],
  };
}

async function errorFrom(response: Response, fallback: string): Promise<AgentCapabilityApiError> {
  let message = fallback;
  try {
    const row = recordValue(await response.json());
    const error = row ? stringValue(row.error, 500) : "";
    if (error) message = error;
  } catch {
    /* keep action-specific fallback */
  }
  return new AgentCapabilityApiError(response.status, message);
}

export async function fetchAgentCapabilityCatalog(
  query = "",
  signal?: AbortSignal,
): Promise<AgentCapabilityManifest[]> {
  const response = await fetch(agentCapabilityCatalogUrl(query), { signal });
  if (!response.ok) throw await errorFrom(response, `Could not load capabilities (${response.status}).`);
  const body = recordValue(await response.json());
  return Array.isArray(body?.capabilities)
    ? body.capabilities.map(normalizeCapabilityManifest)
      .filter((manifest): manifest is AgentCapabilityManifest => manifest !== null)
    : [];
}

export async function fetchAgentCapabilityState(
  agentId: string,
  signal?: AbortSignal,
): Promise<AgentCapabilityState> {
  const response = await fetch(agentCapabilitiesUrl(agentId), { signal });
  if (!response.ok) throw await errorFrom(response, `Could not load capability state (${response.status}).`);
  return normalizeCapabilityState(await response.json());
}

export async function grantAgentCapabilityLease(
  agentId: string,
  input: AgentCapabilityLeaseGrantInput,
): Promise<AgentCapabilityLease> {
  const response = await fetch(agentCapabilityLeasesUrl(agentId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, budgetTokens: 0 }),
  });
  if (!response.ok) throw await errorFrom(response, `Could not approve capability (${response.status}).`);
  const body = recordValue(await response.json());
  const lease = normalizeLease(body?.lease);
  if (!lease) throw new AgentCapabilityApiError(response.status, "The server returned an invalid capability lease.");
  return lease;
}

export async function revokeAgentCapabilityLease(agentId: string, leaseId: string): Promise<void> {
  const response = await fetch(agentCapabilityLeasesUrl(agentId, leaseId), { method: "DELETE" });
  if (!response.ok) throw await errorFrom(response, `Could not revoke capability (${response.status}).`);
}
