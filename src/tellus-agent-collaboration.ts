import { runtimeConfig } from "./tellus-runtime-config";

export type CollaborationRole = "contributor" | "lead" | "reviewer";
export type CollaborationTaskStatus = "open" | "claimed" | "inProgress" | "inReview" | "approved" | "rejected";
export type CollaborationTaskMutationKind = "update" | "addArtifact" | "review";

export interface CollaborationMember {
  agentId: string;
  role: CollaborationRole;
  joinedAtMs: number;
}

export interface CollaborationArtifact {
  artifactId: string;
  taskId: string;
  kind: string;
  reference: string;
  label: string | null;
  submittedByPrincipalId: string;
  submittedAtMs: number;
}

export interface CollaborationTask {
  taskId: string;
  title: string;
  description: string;
  assignedAgentId: string | null;
  claimedByAgentId: string | null;
  status: CollaborationTaskStatus;
  updateSummary: string | null;
  reviewSummary: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  artifacts: CollaborationArtifact[];
}

export interface CollaborationWorkspace {
  workspaceId: string;
  name: string;
  sharedGoal: string;
  worldId: string | null;
  closed: boolean;
  revision: number;
  createdAtMs: number;
  updatedAtMs: number;
  members: CollaborationMember[];
  tasks: CollaborationTask[];
}

export interface CollaborationWorkspaceSummary {
  workspaceId: string;
  name: string;
  sharedGoal: string;
  worldId: string | null;
  closed: boolean;
  revision: number;
  memberCount: number;
  openTaskCount: number;
  updatedAtMs: number;
}

export interface CreateCollaborationWorkspaceInput {
  idempotencyKey: string;
  name: string;
  sharedGoal: string;
  worldId?: string | null;
  members: Array<{ agentId: string; role: CollaborationRole }>;
}

export interface CreateCollaborationTaskInput {
  idempotencyKey: string;
  title: string;
  description?: string;
  assignedAgentId?: string | null;
}

export interface MutateCollaborationTaskInput {
  idempotencyKey: string;
  kind: CollaborationTaskMutationKind;
  status?: CollaborationTaskStatus;
  summary?: string;
  artifactKind?: string;
  artifactReference?: string;
  artifactLabel?: string;
}

export class CollaborationApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function apiRoot(): string {
  return runtimeConfig.worldApiBase || runtimeConfig.apiBase || "";
}

export function collaborationWorkspacesUrl(workspaceId?: string): string {
  const base = `${apiRoot()}/api/tellus/collaboration/workspaces`;
  return workspaceId ? `${base}/${encodeURIComponent(workspaceId)}` : base;
}

export function collaborationMemberUrl(workspaceId: string, agentId: string): string {
  return `${collaborationWorkspacesUrl(workspaceId)}/members/${encodeURIComponent(agentId)}`;
}

export function collaborationTasksUrl(workspaceId: string, taskId?: string): string {
  const base = `${collaborationWorkspacesUrl(workspaceId)}/tasks`;
  return taskId ? `${base}/${encodeURIComponent(taskId)}` : base;
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
  return stringValue(value, max) || null;
}

function integerValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function roleValue(value: unknown): CollaborationRole {
  const role = String(value).toLowerCase();
  if (value === 1 || role === "lead") return "lead";
  if (value === 2 || role === "reviewer") return "reviewer";
  return "contributor";
}

function taskStatusValue(value: unknown): CollaborationTaskStatus {
  const status = String(value).replace(/[-_]/g, "").toLowerCase();
  if (value === 1 || status === "claimed") return "claimed";
  if (value === 2 || status === "inprogress") return "inProgress";
  if (value === 3 || status === "inreview") return "inReview";
  if (value === 4 || status === "approved") return "approved";
  if (value === 5 || status === "rejected") return "rejected";
  return "open";
}

function normalizeMember(value: unknown): CollaborationMember | null {
  const row = recordValue(value);
  if (!row) return null;
  const agentId = stringValue(row.agentId, 120);
  return agentId ? { agentId, role: roleValue(row.role), joinedAtMs: integerValue(row.joinedAtMs) } : null;
}

function normalizeArtifact(value: unknown): CollaborationArtifact | null {
  const row = recordValue(value);
  if (!row) return null;
  const artifactId = stringValue(row.artifactId, 120);
  const reference = stringValue(row.reference, 2_000);
  if (!artifactId || !reference) return null;
  return {
    artifactId,
    taskId: stringValue(row.taskId, 120),
    kind: stringValue(row.kind, 80),
    reference,
    label: nullableString(row.label, 160),
    submittedByPrincipalId: stringValue(row.submittedByPrincipalId, 240),
    submittedAtMs: integerValue(row.submittedAtMs),
  };
}

function normalizeTask(value: unknown): CollaborationTask | null {
  const row = recordValue(value);
  if (!row) return null;
  const taskId = stringValue(row.taskId, 120);
  const title = stringValue(row.title, 160);
  if (!taskId || !title) return null;
  return {
    taskId,
    title,
    description: stringValue(row.description, 4_000),
    assignedAgentId: nullableString(row.assignedAgentId, 120),
    claimedByAgentId: nullableString(row.claimedByAgentId, 120),
    status: taskStatusValue(row.status),
    updateSummary: nullableString(row.updateSummary, 2_000),
    reviewSummary: nullableString(row.reviewSummary, 2_000),
    createdAtMs: integerValue(row.createdAtMs),
    updatedAtMs: integerValue(row.updatedAtMs),
    artifacts: Array.isArray(row.artifacts)
      ? row.artifacts.map(normalizeArtifact).filter((artifact): artifact is CollaborationArtifact => artifact !== null)
      : [],
  };
}

export function normalizeCollaborationWorkspace(value: unknown): CollaborationWorkspace | null {
  const row = recordValue(value);
  if (!row) return null;
  const workspaceId = stringValue(row.workspaceId, 120);
  const name = stringValue(row.name, 120);
  if (!workspaceId || !name) return null;
  return {
    workspaceId,
    name,
    sharedGoal: stringValue(row.sharedGoal, 2_000),
    worldId: nullableString(row.worldId, 240),
    closed: row.closed === true,
    revision: integerValue(row.revision),
    createdAtMs: integerValue(row.createdAtMs),
    updatedAtMs: integerValue(row.updatedAtMs),
    members: Array.isArray(row.members)
      ? row.members.map(normalizeMember).filter((member): member is CollaborationMember => member !== null)
      : [],
    tasks: Array.isArray(row.tasks)
      ? row.tasks.map(normalizeTask).filter((task): task is CollaborationTask => task !== null)
      : [],
  };
}

function normalizeWorkspaceSummary(value: unknown): CollaborationWorkspaceSummary | null {
  const row = recordValue(value);
  if (!row) return null;
  const workspaceId = stringValue(row.workspaceId, 120);
  const name = stringValue(row.name, 120);
  if (!workspaceId || !name) return null;
  return {
    workspaceId,
    name,
    sharedGoal: stringValue(row.sharedGoal, 2_000),
    worldId: nullableString(row.worldId, 240),
    closed: row.closed === true,
    revision: integerValue(row.revision),
    memberCount: integerValue(row.memberCount),
    openTaskCount: integerValue(row.openTaskCount),
    updatedAtMs: integerValue(row.updatedAtMs),
  };
}

async function errorFrom(response: Response, fallback: string): Promise<CollaborationApiError> {
  let message = fallback;
  try {
    const body = recordValue(await response.json());
    if (body) message = stringValue(body.error, 500) || message;
  } catch {
    /* keep action-specific fallback */
  }
  return new CollaborationApiError(response.status, message);
}

async function mutationWorkspace(response: Response, fallback: string): Promise<CollaborationWorkspace> {
  if (!response.ok) throw await errorFrom(response, fallback);
  const body = recordValue(await response.json());
  const workspace = normalizeCollaborationWorkspace(body?.workspace);
  if (!workspace) throw new CollaborationApiError(response.status, "The server returned an invalid workspace.");
  return workspace;
}

export function collaborationIdempotencyKey(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-z0-9-]/gi, "-").slice(0, 32) || "collaboration";
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${safePrefix}-${random}`;
}

export async function fetchCollaborationWorkspaces(signal?: AbortSignal): Promise<CollaborationWorkspaceSummary[]> {
  const response = await fetch(collaborationWorkspacesUrl(), { signal });
  if (!response.ok) throw await errorFrom(response, `Could not load projects (${response.status}).`);
  const body = recordValue(await response.json());
  return Array.isArray(body?.workspaces)
    ? body.workspaces.map(normalizeWorkspaceSummary)
      .filter((workspace): workspace is CollaborationWorkspaceSummary => workspace !== null)
    : [];
}

export async function fetchCollaborationWorkspace(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<CollaborationWorkspace> {
  const response = await fetch(collaborationWorkspacesUrl(workspaceId), { signal });
  if (!response.ok) throw await errorFrom(response, `Could not load project (${response.status}).`);
  const workspace = normalizeCollaborationWorkspace(await response.json());
  if (!workspace) throw new CollaborationApiError(response.status, "The server returned an invalid workspace.");
  return workspace;
}

export async function createCollaborationWorkspace(
  input: CreateCollaborationWorkspaceInput,
): Promise<CollaborationWorkspace> {
  const response = await fetch(collaborationWorkspacesUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return mutationWorkspace(response, `Could not create project (${response.status}).`);
}

export async function setCollaborationWorkspaceClosed(
  workspaceId: string,
  closed: boolean,
  idempotencyKey: string,
): Promise<CollaborationWorkspace> {
  const response = await fetch(collaborationWorkspacesUrl(workspaceId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ closed, idempotencyKey }),
  });
  return mutationWorkspace(response, `Could not ${closed ? "close" : "reopen"} project (${response.status}).`);
}

export async function setCollaborationMember(
  workspaceId: string,
  agentId: string,
  role: CollaborationRole,
  idempotencyKey: string,
): Promise<CollaborationWorkspace> {
  const response = await fetch(collaborationMemberUrl(workspaceId, agentId), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, idempotencyKey }),
  });
  return mutationWorkspace(response, `Could not update project member (${response.status}).`);
}

export async function removeCollaborationMember(
  workspaceId: string,
  agentId: string,
  idempotencyKey: string,
): Promise<CollaborationWorkspace> {
  const url = `${collaborationMemberUrl(workspaceId, agentId)}?idempotencyKey=${encodeURIComponent(idempotencyKey)}`;
  const response = await fetch(url, { method: "DELETE" });
  return mutationWorkspace(response, `Could not remove project member (${response.status}).`);
}

export async function createCollaborationTask(
  workspaceId: string,
  input: CreateCollaborationTaskInput,
): Promise<CollaborationWorkspace> {
  const response = await fetch(collaborationTasksUrl(workspaceId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return mutationWorkspace(response, `Could not create task (${response.status}).`);
}

export async function mutateCollaborationTask(
  workspaceId: string,
  taskId: string,
  input: MutateCollaborationTaskInput,
): Promise<CollaborationWorkspace> {
  const response = await fetch(collaborationTasksUrl(workspaceId, taskId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return mutationWorkspace(response, `Could not update task (${response.status}).`);
}
