import { runtimeConfig } from "./tellus-runtime-config";

export type AssetWorkshopStatus =
  | "queued" | "building" | "validating" | "awaiting-maker"
  | "ready" | "rejected" | "blocked" | "failed";
export type AssetWorkshopReviewDecision = "approve" | "revise" | "reject";

export interface AssetWorkshopArtifact {
  kind: string;
  reference: string;
  sha256: string | null;
  byteLength: number | null;
  pass: number;
}

export interface AssetWorkshopValidation {
  gate: string;
  passed: boolean;
  detail: string | null;
  value: number | null;
  unit: string | null;
}

export interface AssetWorkshopPass {
  number: number;
  outcome: string;
  summary: string | null;
  startedAt: string;
  completedAt: string;
  artifacts: AssetWorkshopArtifact[];
  validations: AssetWorkshopValidation[];
}

export interface AssetWorkshopSnapshot {
  jobId: string;
  agentId: string;
  makerUserId: string;
  worldId: string;
  goalId: string;
  backend: "procedural" | "blender";
  curatedWorkflowId: string | null;
  brief: string;
  status: AssetWorkshopStatus;
  summary: string | null;
  error: string | null;
  currentPass: number;
  passes: AssetWorkshopPass[];
  artifacts: AssetWorkshopArtifact[];
  validations: AssetWorkshopValidation[];
  registryAssetId: string | null;
  modelUrl: string | null;
  makerReviewRequired: boolean;
  reviewRevision: number;
  makerFeedback: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface StartAssetWorkshopInput {
  goalId: string;
  idempotencyKey: string;
  backend: "procedural" | "blender";
  brief: string;
  referenceUrls: string[];
  curatedWorkflowId?: string | null;
  budget?: { maxPasses?: number };
}

export class AssetWorkshopApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function apiRoot(): string {
  return runtimeConfig.worldApiBase || runtimeConfig.apiBase || "";
}

export function assetWorkshopUrl(agentId: string, jobId?: string, review = false): string {
  const base = `${apiRoot()}/api/tellus/agents/${encodeURIComponent(agentId)}/asset-workshops`;
  if (!jobId) return base;
  const job = `${base}/${encodeURIComponent(jobId)}`;
  return review ? `${job}/review` : job;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown, max = 2_000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableString(value: unknown, max = 2_000): string | null {
  return stringValue(value, max) || null;
}

function nullableHttpsUrl(value: unknown): string | null {
  const text = nullableString(value, 2_000);
  if (!text) return null;
  try { return new URL(text).protocol === "https:" ? text : null; }
  catch { return null; }
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function statusValue(value: unknown): AssetWorkshopStatus {
  const status = stringValue(value, 40).replace(/[-_]/g, "").toLowerCase();
  if (status === "awaitingmaker") return "awaiting-maker";
  return ["queued", "building", "validating", "ready", "rejected", "blocked", "failed"]
    .includes(status) ? status as AssetWorkshopStatus : "failed";
}

function backendValue(value: unknown): "procedural" | "blender" {
  const backend = String(value).toLowerCase();
  return value === 1 || backend === "blender" ? "blender" : "procedural";
}

function normalizeArtifact(value: unknown): AssetWorkshopArtifact | null {
  const row = recordValue(value);
  if (!row) return null;
  const kind = stringValue(row.kind, 80);
  const reference = stringValue(row.reference, 2_000);
  if (!kind || !reference) return null;
  return {
    kind,
    reference,
    sha256: nullableString(row.sha256, 64),
    byteLength: typeof row.byteLength === "number" ? Math.max(0, row.byteLength) : null,
    pass: Math.max(0, Math.floor(numberValue(row.pass))),
  };
}

function normalizeValidation(value: unknown): AssetWorkshopValidation | null {
  const row = recordValue(value);
  if (!row) return null;
  const gate = stringValue(row.gate, 120);
  if (!gate) return null;
  return {
    gate,
    passed: row.passed === true,
    detail: nullableString(row.detail, 600),
    value: typeof row.value === "number" && Number.isFinite(row.value) ? row.value : null,
    unit: nullableString(row.unit, 40),
  };
}

function normalizePass(value: unknown): AssetWorkshopPass | null {
  const row = recordValue(value);
  if (!row) return null;
  const number = Math.max(0, Math.floor(numberValue(row.number)));
  if (!number) return null;
  return {
    number,
    outcome: stringValue(row.outcome, 40),
    summary: nullableString(row.summary, 1_200),
    startedAt: stringValue(row.startedAt, 80),
    completedAt: stringValue(row.completedAt, 80),
    artifacts: Array.isArray(row.artifacts)
      ? row.artifacts.map(normalizeArtifact).filter((item): item is AssetWorkshopArtifact => item !== null) : [],
    validations: Array.isArray(row.validations)
      ? row.validations.map(normalizeValidation).filter((item): item is AssetWorkshopValidation => item !== null) : [],
  };
}

export function normalizeAssetWorkshop(value: unknown): AssetWorkshopSnapshot | null {
  const row = recordValue(value);
  if (!row) return null;
  const jobId = stringValue(row.jobId, 120);
  const agentId = stringValue(row.agentId, 120);
  if (!jobId || !agentId) return null;
  return {
    jobId,
    agentId,
    makerUserId: stringValue(row.makerUserId, 240),
    worldId: stringValue(row.worldId, 240),
    goalId: stringValue(row.goalId, 160),
    backend: backendValue(row.backend),
    curatedWorkflowId: nullableString(row.curatedWorkflowId, 120),
    brief: stringValue(row.brief, 4_000),
    status: statusValue(row.status),
    summary: nullableString(row.summary, 1_200),
    error: nullableString(row.error, 800),
    currentPass: Math.max(0, Math.floor(numberValue(row.currentPass))),
    passes: Array.isArray(row.passes)
      ? row.passes.map(normalizePass).filter((item): item is AssetWorkshopPass => item !== null) : [],
    artifacts: Array.isArray(row.artifacts)
      ? row.artifacts.map(normalizeArtifact).filter((item): item is AssetWorkshopArtifact => item !== null) : [],
    validations: Array.isArray(row.validations)
      ? row.validations.map(normalizeValidation).filter((item): item is AssetWorkshopValidation => item !== null) : [],
    registryAssetId: nullableString(row.registryAssetId, 240),
    modelUrl: nullableHttpsUrl(row.modelUrl),
    makerReviewRequired: row.makerReviewRequired !== false,
    reviewRevision: Math.max(0, Math.floor(numberValue(row.reviewRevision))),
    makerFeedback: nullableString(row.makerFeedback, 2_000),
    createdAt: stringValue(row.createdAt, 80),
    startedAt: nullableString(row.startedAt, 80),
    completedAt: nullableString(row.completedAt, 80),
  };
}

async function errorFrom(response: Response, fallback: string): Promise<AssetWorkshopApiError> {
  let message = fallback;
  try {
    const body = recordValue(await response.json());
    if (body) message = stringValue(body.error, 500) || message;
  } catch { /* keep fallback */ }
  return new AssetWorkshopApiError(response.status, message);
}

async function snapshotFrom(response: Response, fallback: string): Promise<AssetWorkshopSnapshot> {
  if (!response.ok) throw await errorFrom(response, fallback);
  const snapshot = normalizeAssetWorkshop(await response.json());
  if (!snapshot) throw new AssetWorkshopApiError(response.status, "The server returned an invalid workshop job.");
  return snapshot;
}

export function assetWorkshopIdempotencyKey(prefix: string): string {
  const safe = prefix.replace(/[^a-z0-9-]/gi, "-").slice(0, 32) || "asset-workshop";
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${safe}-${random}`;
}

export async function startAssetWorkshop(
  agentId: string,
  input: StartAssetWorkshopInput,
): Promise<AssetWorkshopSnapshot> {
  const response = await fetch(assetWorkshopUrl(agentId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return snapshotFrom(response, `Could not start asset workshop (${response.status}).`);
}

export async function fetchAssetWorkshop(
  agentId: string,
  jobId: string,
  signal?: AbortSignal,
): Promise<AssetWorkshopSnapshot> {
  const response = await fetch(assetWorkshopUrl(agentId, jobId), { signal });
  return snapshotFrom(response, `Could not load asset workshop (${response.status}).`);
}

export async function reviewAssetWorkshop(
  agentId: string,
  jobId: string,
  decision: AssetWorkshopReviewDecision,
  feedback: string,
  idempotencyKey: string,
): Promise<AssetWorkshopSnapshot> {
  const response = await fetch(assetWorkshopUrl(agentId, jobId, true), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, feedback, idempotencyKey }),
  });
  return snapshotFrom(response, `Could not review asset workshop (${response.status}).`);
}
