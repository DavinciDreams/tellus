import { runtimeConfig } from "./tellus-runtime-config";
import type { Vec3 } from "./tellus-types";

export type WorldTriggerShapeKind = "sphere" | "box";
export type WorldTriggerActorFilter = "player" | "agent" | "both";
export type WorldTriggerTransition = "entered" | "exited" | "dwelled";

export interface WorldTriggerShape {
  kind: WorldTriggerShapeKind;
  center: Vec3;
  radius: number;
  halfExtents: Vec3;
  yawDegrees: number;
}

export interface WorldTriggerDefinition {
  triggerId: string;
  worldId: string;
  version: number;
  enabled: boolean;
  createdByPrincipalId: string;
  createdAtMs: number;
  updatedAtMs: number;
  shape: WorldTriggerShape;
  actorFilter: WorldTriggerActorFilter;
  transitions: WorldTriggerTransition[];
  dwellMs: number | null;
  enterMargin: number;
  exitMargin: number;
  cooldownMs: number;
  oncePerVisit: boolean;
  maxEventsPerMinute: number;
}

export interface WorldTriggerBinding {
  bindingId: string;
  triggerId: string;
  sinkKind: "agent";
  agentId: string;
  eventLabel: string;
  enabled: boolean;
  createdAtMs: number;
  deliveryTtlMs: number;
  wakeCooldownMs: number;
}

export interface WorldTriggersSnapshot {
  worldId: string;
  definitions: WorldTriggerDefinition[];
  bindings: WorldTriggerBinding[];
  pendingDeliveries: number;
  activeVisits: number;
  presentActorCount: number;
  lastScanAtMs: number;
  lastSuccessfulScanAtMs: number;
  lastError: string | null;
  droppedDeliveries: number;
}

export interface UpsertWorldTriggerInput {
  triggerId?: string;
  enabled?: boolean;
  shape: {
    kind: WorldTriggerShapeKind;
    center: Vec3;
    radius?: number;
    halfExtents?: Vec3;
    yawDegrees?: number;
  };
  actorFilter?: WorldTriggerActorFilter;
  transitions: WorldTriggerTransition[];
  dwellMs?: number | null;
  enterMargin?: number;
  exitMargin?: number;
  cooldownMs?: number;
  oncePerVisit?: boolean;
  maxEventsPerMinute?: number;
}

export interface UpsertWorldTriggerBindingInput {
  bindingId?: string;
  agentId: string;
  eventLabel: string;
  enabled?: boolean;
  deliveryTtlMs?: number;
  wakeCooldownMs?: number;
}

export class WorldTriggersApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function apiRoot(): string {
  return runtimeConfig.worldApiBase || runtimeConfig.apiBase || "";
}

export function worldTriggersUrl(worldId: string, triggerId?: string, bindingId?: string): string {
  const base = `${apiRoot()}/api/tellus/worlds/${encodeURIComponent(worldId)}/triggers`;
  if (!triggerId) return base;
  const trigger = `${base}/${encodeURIComponent(triggerId)}`;
  if (!bindingId) return trigger;
  return `${trigger}/bindings/${encodeURIComponent(bindingId)}`;
}

export function worldTriggerBindingsUrl(worldId: string, triggerId: string): string {
  return `${worldTriggersUrl(worldId, triggerId)}/bindings`;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerValue(value: unknown, fallback = 0): number {
  return Math.max(0, Math.floor(numberValue(value, fallback)));
}

function boolValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function vec3Value(value: unknown, fallback: Vec3): Vec3 {
  const row = recordValue(value);
  return {
    x: numberValue(row?.x, fallback.x),
    y: numberValue(row?.y, fallback.y),
    z: numberValue(row?.z, fallback.z),
  };
}

function transitionsValue(value: unknown): WorldTriggerTransition[] {
  const parts = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : typeof value === "number"
        ? [value & 1 ? "entered" : "", value & 2 ? "exited" : "", value & 4 ? "dwelled" : ""]
        : [];
  const supported = new Set<WorldTriggerTransition>(["entered", "exited", "dwelled"]);
  return [...new Set(parts
    .map((part) => String(part).trim().toLowerCase())
    .filter((part): part is WorldTriggerTransition => supported.has(part as WorldTriggerTransition)))];
}

export function serializeWorldTriggerTransitions(transitions: WorldTriggerTransition[]): string {
  const ordered: WorldTriggerTransition[] = ["entered", "exited", "dwelled"];
  return ordered.filter((transition) => transitions.includes(transition)).join(", ");
}

export function normalizeWorldTriggerDefinition(value: unknown): WorldTriggerDefinition | null {
  const row = recordValue(value);
  const shapeRow = recordValue(row?.shape);
  const triggerId = stringValue(row?.triggerId);
  const worldId = stringValue(row?.worldId);
  const kind = stringValue(shapeRow?.kind).toLowerCase();
  if (!row || !shapeRow || !triggerId || !worldId || (kind !== "sphere" && kind !== "box")) return null;
  const transitions = transitionsValue(row.transitionKinds ?? row.transitions);
  if (transitions.length === 0) return null;
  const actorFilterValue = stringValue(row.actorFilter).toLowerCase();
  const actorFilter: WorldTriggerActorFilter = actorFilterValue === "player" || actorFilterValue === "agent"
    ? actorFilterValue
    : "both";
  return {
    triggerId,
    worldId,
    version: integerValue(row.version, 1),
    enabled: boolValue(row.enabled, true),
    createdByPrincipalId: stringValue(row.createdByPrincipalId),
    createdAtMs: integerValue(row.createdAtMs),
    updatedAtMs: integerValue(row.updatedAtMs),
    shape: {
      kind,
      center: vec3Value(shapeRow.center, { x: 0, y: 0, z: 0 }),
      radius: Math.max(0, numberValue(shapeRow.radius)),
      halfExtents: vec3Value(shapeRow.halfExtents, { x: 1, y: 1, z: 1 }),
      yawDegrees: numberValue(shapeRow.yawDegrees),
    },
    actorFilter,
    transitions,
    dwellMs: typeof row.dwellMs === "number" && Number.isFinite(row.dwellMs) ? Math.max(0, row.dwellMs) : null,
    enterMargin: Math.max(0, numberValue(row.enterMargin, 0.1)),
    exitMargin: Math.max(0, numberValue(row.exitMargin, 0.25)),
    cooldownMs: integerValue(row.cooldownMs, 10_000),
    oncePerVisit: boolValue(row.oncePerVisit, true),
    maxEventsPerMinute: Math.max(1, integerValue(row.maxEventsPerMinute, 30)),
  };
}

export function normalizeWorldTriggerBinding(value: unknown): WorldTriggerBinding | null {
  const row = recordValue(value);
  const bindingId = stringValue(row?.bindingId);
  const triggerId = stringValue(row?.triggerId);
  const agentId = stringValue(row?.agentId);
  if (!row || !bindingId || !triggerId || !agentId) return null;
  return {
    bindingId,
    triggerId,
    sinkKind: "agent",
    agentId,
    eventLabel: stringValue(row.eventLabel),
    enabled: boolValue(row.enabled, true),
    createdAtMs: integerValue(row.createdAtMs),
    deliveryTtlMs: integerValue(row.deliveryTtlMs, 300_000),
    wakeCooldownMs: integerValue(row.wakeCooldownMs, 10_000),
  };
}

export function normalizeWorldTriggersSnapshot(value: unknown): WorldTriggersSnapshot {
  const row = recordValue(value);
  return {
    worldId: stringValue(row?.worldId),
    definitions: Array.isArray(row?.definitions)
      ? row.definitions.map(normalizeWorldTriggerDefinition).filter((item): item is WorldTriggerDefinition => item !== null)
      : [],
    bindings: Array.isArray(row?.bindings)
      ? row.bindings.map(normalizeWorldTriggerBinding).filter((item): item is WorldTriggerBinding => item !== null)
      : [],
    pendingDeliveries: integerValue(row?.pendingDeliveries),
    activeVisits: integerValue(row?.activeVisits),
    presentActorCount: integerValue(row?.presentActorCount),
    lastScanAtMs: integerValue(row?.lastScanAtMs),
    lastSuccessfulScanAtMs: integerValue(row?.lastSuccessfulScanAtMs),
    lastError: stringValue(row?.lastError) || null,
    droppedDeliveries: integerValue(row?.droppedDeliveries),
  };
}

async function errorFrom(response: Response, fallback: string): Promise<WorldTriggersApiError> {
  let message = fallback;
  try {
    const body = recordValue(await response.json());
    if (stringValue(body?.error)) message = stringValue(body?.error);
  } catch {
    /* keep the action-specific fallback */
  }
  return new WorldTriggersApiError(response.status, message);
}

export async function fetchWorldTriggers(worldId: string, signal?: AbortSignal): Promise<WorldTriggersSnapshot> {
  const response = await fetch(worldTriggersUrl(worldId), { signal });
  if (!response.ok) throw await errorFrom(response, `Could not load world triggers (${response.status}).`);
  return normalizeWorldTriggersSnapshot(await response.json());
}

export async function upsertWorldTrigger(
  worldId: string,
  input: UpsertWorldTriggerInput,
): Promise<WorldTriggerDefinition> {
  const response = await fetch(worldTriggersUrl(worldId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      triggerId: input.triggerId,
      enabled: input.enabled ?? true,
      shape: {
        kind: input.shape.kind,
        center: input.shape.center,
        radius: input.shape.radius ?? 0,
        halfExtents: input.shape.halfExtents ?? { x: 1, y: 1, z: 1 },
        yawDegrees: input.shape.yawDegrees ?? 0,
      },
      actorFilter: input.actorFilter ?? "both",
      transitionKinds: serializeWorldTriggerTransitions(input.transitions),
      dwellMs: input.dwellMs ?? null,
      enterMargin: input.enterMargin ?? 0.1,
      exitMargin: input.exitMargin ?? 0.25,
      cooldownMs: input.cooldownMs ?? 10_000,
      oncePerVisit: input.oncePerVisit ?? true,
      maxEventsPerMinute: input.maxEventsPerMinute ?? 30,
    }),
  });
  if (!response.ok) throw await errorFrom(response, `Could not save world trigger (${response.status}).`);
  const result = recordValue(await response.json());
  const definition = normalizeWorldTriggerDefinition(result?.definition);
  if (!definition) throw new WorldTriggersApiError(response.status, stringValue(result?.error) || "The server returned an invalid trigger.");
  return definition;
}

export async function deleteWorldTrigger(worldId: string, triggerId: string): Promise<void> {
  const response = await fetch(worldTriggersUrl(worldId, triggerId), { method: "DELETE" });
  if (!response.ok) throw await errorFrom(response, `Could not delete world trigger (${response.status}).`);
}

export async function upsertWorldTriggerBinding(
  worldId: string,
  triggerId: string,
  input: UpsertWorldTriggerBindingInput,
): Promise<WorldTriggerBinding> {
  const response = await fetch(worldTriggerBindingsUrl(worldId, triggerId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bindingId: input.bindingId,
      agentId: input.agentId,
      eventLabel: input.eventLabel,
      enabled: input.enabled ?? true,
      deliveryTtlMs: input.deliveryTtlMs ?? 300_000,
      wakeCooldownMs: input.wakeCooldownMs ?? 10_000,
    }),
  });
  if (!response.ok) throw await errorFrom(response, `Could not bind agent to trigger (${response.status}).`);
  const result = recordValue(await response.json());
  const binding = normalizeWorldTriggerBinding(result?.binding);
  if (!binding) throw new WorldTriggersApiError(response.status, stringValue(result?.error) || "The server returned an invalid binding.");
  return binding;
}

export async function deleteWorldTriggerBinding(
  worldId: string,
  triggerId: string,
  bindingId: string,
): Promise<void> {
  const response = await fetch(worldTriggersUrl(worldId, triggerId, bindingId), { method: "DELETE" });
  if (!response.ok) throw await errorFrom(response, `Could not delete trigger binding (${response.status}).`);
}
