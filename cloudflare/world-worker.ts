import { DurableObject } from "cloudflare:workers";
import {
  type QueuedGenerationJob,
  type TellusTerrainState,
  type WorldAction,
  type WorldGeneratedThing,
  type WorldPatch,
  type WorldPresence,
  isTellusTerrainState,
  isWorldGeneratedThing,
  isWorldAction,
} from "../src/world-protocol";

interface Env {
  TELLUS_WORLD: DurableObjectNamespace<TellusWorld>;
  TELLUS_GENERATION_QUEUE?: Queue<QueuedGenerationJob>;
  TELLUS_PERSISTENCE_API_BASE?: string;
  TELLUS_PERSISTENCE_API_TOKEN?: string;
  TELLUS_DO_STORAGE_MODE?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
const assetLibraryBaseUrl = "https://3d.flobots.xyz";
const presenceTtlMs = 90_000;

function isPendingGeneratedThing(thing: WorldGeneratedThing): boolean {
  return thing.generationStatus === "queued" || thing.generationStatus === "generating";
}

function isResolvedGeneratedThing(thing: WorldGeneratedThing): boolean {
  return Boolean(thing.modelUrl) || thing.generationStatus === "ready" || thing.generationStatus === "local";
}

function mergeGeneratedThing(
  existing: WorldGeneratedThing | undefined,
  incoming: WorldGeneratedThing,
  updatedAt: string,
): WorldGeneratedThing {
  const next = {
    ...incoming,
    updatedAt,
  };
  if (
    existing &&
    isResolvedGeneratedThing(existing) &&
    isPendingGeneratedThing(incoming) &&
    !incoming.modelUrl
  ) {
    next.modelUrl = existing.modelUrl;
    next.pipelineId = existing.modelUrl ? undefined : existing.pipelineId;
    next.generationStatus = existing.modelUrl ? "ready" : existing.generationStatus;
  }
  return next;
}

interface PersistedWorldState {
  version: number;
  worldId: string;
  name?: string;
  description?: string;
  is_public?: boolean;
  owner?: {
    id?: string | null;
    username?: string;
  };
  terrain: TellusTerrainState;
  generated: WorldGeneratedThing[];
  queuedGenerationJobs: QueuedGenerationJob[];
  savedAt: string;
}

const defaultTerrainState = (): TellusTerrainState => ({
  version: 2,
  revision: 0,
  terrainSculptOffsets: [],
  terrainPaint: [],
  distantIslandSculptOffsets: {},
  distantIslandPaint: {},
  savedAt: new Date(0).toISOString(),
});

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...corsHeaders,
      ...init?.headers,
    },
  });
}

function emptyCorsResponse(init?: ResponseInit): Response {
  return new Response(null, {
    ...init,
    headers: {
      ...corsHeaders,
      ...init?.headers,
    },
  });
}

function worldIdFromPath(pathname: string): { worldId: string; route: string } | null {
  const match = /^\/api\/world\/([^/]+)(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!match) return null;
  return {
    worldId: decodeURIComponent(match[1]),
    route: match[2] ?? "state",
  };
}

function isQueuedGenerationJob(value: unknown): value is QueuedGenerationJob {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { worldId?: unknown }).worldId === "string" &&
    typeof (value as { request?: { prompt?: unknown } }).request?.prompt === "string" &&
    ((value as { status?: unknown }).status === "queued" ||
      (value as { status?: unknown }).status === "generating" ||
      (value as { status?: unknown }).status === "completed" ||
      (value as { status?: unknown }).status === "failed") &&
    typeof (value as { createdAt?: unknown }).createdAt === "string" &&
    typeof (value as { updatedAt?: unknown }).updatedAt === "string"
  );
}

function persistedStateFrom(value: unknown, worldId: string): PersistedWorldState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source =
    (value as Partial<WorldPatch>).type === "world.snapshot"
      ? value
      : (value as { state?: unknown }).state && typeof (value as { state?: unknown }).state === "object"
        ? (value as { state: unknown }).state
        : value;
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const terrain = (source as { terrain?: unknown }).terrain;
  if (!isTellusTerrainState(terrain)) return null;
  const generated = Array.isArray((source as { generated?: unknown }).generated)
    ? (source as { generated: unknown[] }).generated.filter(isWorldGeneratedThing)
    : [];
  const queuedGenerationJobs = Array.isArray(
    (source as { queuedGenerationJobs?: unknown }).queuedGenerationJobs,
  )
    ? (source as { queuedGenerationJobs: unknown[] }).queuedGenerationJobs.filter(isQueuedGenerationJob)
    : [];
  return {
    version:
      typeof (source as { version?: unknown }).version === "number"
        ? (source as { version: number }).version
        : 1,
    worldId:
      typeof (source as { worldId?: unknown }).worldId === "string"
        ? (source as { worldId: string }).worldId
        : worldId,
    name:
      typeof (source as { name?: unknown }).name === "string"
        ? (source as { name: string }).name
        : undefined,
    description:
      typeof (source as { description?: unknown }).description === "string"
        ? (source as { description: string }).description
        : undefined,
    is_public:
      typeof (source as { is_public?: unknown }).is_public === "boolean"
        ? (source as { is_public: boolean }).is_public
        : undefined,
    owner:
      (source as { owner?: unknown }).owner &&
      typeof (source as { owner?: unknown }).owner === "object" &&
      !Array.isArray((source as { owner?: unknown }).owner)
        ? {
            id:
              typeof ((source as { owner: { id?: unknown } }).owner.id) === "string" ||
              (source as { owner: { id?: unknown } }).owner.id === null
                ? (source as { owner: { id?: string | null } }).owner.id
                : undefined,
            username:
              typeof ((source as { owner: { username?: unknown } }).owner.username) === "string"
                ? (source as { owner: { username: string } }).owner.username
                : undefined,
          }
        : undefined,
    terrain,
    generated,
    queuedGenerationJobs,
    savedAt:
      typeof (source as { savedAt?: unknown }).savedAt === "string"
        ? (source as { savedAt: string }).savedAt
        : new Date().toISOString(),
  };
}

async function assetLibraryResponse(request: Request, pathname: string): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET") {
    return emptyCorsResponse({ status: 405 });
  }

  if (pathname === "/api/assets/models") {
    const upstream = new URL("/api/models", assetLibraryBaseUrl);
    for (const key of ["page", "per_page", "search", "user_only"]) {
      const value = url.searchParams.get(key);
      if (value !== null) upstream.searchParams.set(key, value);
    }
    const response = await fetch(upstream);
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": response.headers.get("Content-Type") ?? "application/json",
        ...corsHeaders,
      },
    });
  }

  const downloadMatch = /^\/api\/assets\/download\/([^/]+)$/.exec(pathname);
  if (downloadMatch) {
    const response = await fetch(`${assetLibraryBaseUrl}/api/download/${encodeURIComponent(downloadMatch[1])}`);
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": response.headers.get("Content-Type") ?? "model/gltf-binary",
        ...corsHeaders,
      },
    });
  }

  return emptyCorsResponse({ status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return emptyCorsResponse({ status: 204 });
    }
    if (url.pathname.startsWith("/api/assets/")) {
      return assetLibraryResponse(request, url.pathname);
    }
    const target = worldIdFromPath(url.pathname);
    if (!target) {
      return emptyCorsResponse({ status: 404 });
    }

    const id = env.TELLUS_WORLD.idFromName(target.worldId);
    const stub = env.TELLUS_WORLD.get(id);
    return stub.fetch(request);
  },
};

export class TellusWorld extends DurableObject<Env> {
  private worldId = "main";
  private terrain: TellusTerrainState | null = null;
  private presence = new Map<string, WorldPresence>();
  private generated = new Map<string, WorldGeneratedThing>();
  private queuedGenerationJobs = new Map<string, QueuedGenerationJob>();
  private storageWritesAvailable = true;
  private externalPersistenceAvailable = true;

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const target = worldIdFromPath(url.pathname);
    if (target) this.worldId = target.worldId;

    if (request.method === "OPTIONS") {
      return emptyCorsResponse({ status: 204 });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      return this.acceptWebSocket(request);
    }

    if (request.method === "GET") {
      return jsonResponse(await this.snapshot());
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!isWorldAction(body)) {
        return jsonResponse({ error: "Invalid Tellus world action" }, { status: 400 });
      }
      return jsonResponse(await this.applyAction(body));
    }

    return emptyCorsResponse({ status: 405 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") return;
    const action = JSON.parse(message) as unknown;
    if (!isWorldAction(action)) {
      ws.send(JSON.stringify({ type: "error", error: "Invalid Tellus world action" }));
      return;
    }
    const patch = await this.applyAction(action);
    this.broadcast(patch);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const visitorId = ws.deserializeAttachment()?.visitorId;
    if (typeof visitorId === "string") {
      this.presence.delete(visitorId);
      await this.persistPresence();
      this.broadcast({ type: "presence.updated", presence: [...this.presence.values()] });
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private async acceptWebSocket(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const url = new URL(request.url);
    const visitorId =
      url.searchParams.get("visitorId") || crypto.randomUUID();
    const now = new Date().toISOString();
    this.presence.set(visitorId, {
      visitorId,
      connectedAt: now,
      lastSeenAt: now,
    });
    server.serializeAttachment({ visitorId });
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify(await this.snapshot()));
    this.broadcast({ type: "presence.updated", presence: [...this.presence.values()] });
    await this.persistPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  private async snapshot(): Promise<WorldPatch> {
    await this.loadState();
    await this.prunePresence();
    return {
      type: "world.snapshot",
      worldId: this.worldId,
      terrain: this.terrain ?? defaultTerrainState(),
      presence: [...this.presence.values()],
      generated: [...this.generated.values()],
      queuedGenerationJobs: [...this.queuedGenerationJobs.values()],
    };
  }

  private async applyAction(action: WorldAction): Promise<WorldPatch> {
    await this.loadState();
    await this.prunePresence();
    const now = new Date().toISOString();

    if (action.type === "presence.update") {
      const existing = this.presence.get(action.visitorId);
      this.presence.set(action.visitorId, {
        visitorId: action.visitorId,
        name: action.name ?? existing?.name,
        position: action.position ?? existing?.position,
        connectedAt: existing?.connectedAt ?? now,
        lastSeenAt: now,
      });
      await this.persistPresence();
      return { type: "presence.updated", presence: [...this.presence.values()] };
    }

    if (action.type === "terrain.replace") {
      this.terrain = {
        ...action.terrain,
        revision: Math.max((this.terrain?.revision ?? 0) + 1, action.terrain.revision),
        savedAt: now,
      };
      await this.persistWorldState();
      return {
        type: "terrain.updated",
        terrain: this.terrain,
        actorId: action.visitorId,
      };
    }

    if (action.type === "generation.request") {
      const job: QueuedGenerationJob = {
        id: crypto.randomUUID(),
        worldId: this.worldId,
        request: action.request,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      };
      this.queuedGenerationJobs.set(job.id, job);
      await this.persistWorldState();
      await this.env.TELLUS_GENERATION_QUEUE?.send(job);
      return { type: "generation.queued", job };
    }

    if (action.type === "generated.upsert") {
      const thing = mergeGeneratedThing(this.generated.get(action.thing.id), action.thing, now);
      this.generated.set(thing.id, thing);
      await this.persistWorldState();
      return { type: "generated.updated", thing, actorId: action.visitorId };
    }

    if (action.type === "generated.delete") {
      this.generated.delete(action.id);
      await this.persistWorldState();
      return { type: "generated.deleted", id: action.id, actorId: action.visitorId };
    }

    return {
      type: "action.rejected",
      actionType: action.type,
      reason: "Server-authoritative sculpt actions are not implemented yet. Send terrain.replace snapshots for now.",
    };
  }

  private async loadState(): Promise<void> {
    if (this.terrain) return;
    const externalState = await this.loadExternalWorldState();
    if (externalState) {
      this.applyPersistedState(externalState);
      return;
    }

    if (!this.doStorageEnabled()) {
      this.terrain = defaultTerrainState();
      return;
    }

    if (!this.terrain) {
      try {
        const terrain = await this.ctx.storage.get<TellusTerrainState>("terrain");
        this.terrain = isTellusTerrainState(terrain) ? terrain : defaultTerrainState();
      } catch (error) {
        console.warn("Tellus world terrain storage unavailable; using default terrain", error);
        this.terrain = defaultTerrainState();
      }
    }
    if (this.queuedGenerationJobs.size === 0) {
      try {
        const jobs = await this.ctx.storage.get<QueuedGenerationJob[]>("queuedGenerationJobs");
        if (Array.isArray(jobs)) {
          this.queuedGenerationJobs = new Map(jobs.map((item) => [item.id, item]));
        }
      } catch (error) {
        console.warn("Tellus world queued job storage unavailable; using memory only", error);
      }
    }
    if (this.generated.size === 0) {
      try {
        const generated = await this.ctx.storage.get<WorldGeneratedThing[]>("generated");
        if (Array.isArray(generated)) {
          this.generated = new Map(
            generated.filter(isWorldGeneratedThing).map((item) => [item.id, item]),
          );
        }
      } catch (error) {
        console.warn("Tellus world generated storage unavailable; using memory only", error);
      }
    }
  }

  private async persistPresence(): Promise<void> {
    // Presence is live-only. Persisting it on every heartbeat burns Durable Object
    // storage writes without adding useful recovery state.
  }

  private async safeStoragePut(key: string, value: unknown): Promise<boolean> {
    if (!this.storageWritesAvailable) return false;
    try {
      await this.ctx.storage.put(key, value);
      return true;
    } catch (error) {
      this.storageWritesAvailable = false;
      console.warn(`Tellus world storage write failed for ${key}; continuing in memory`, error);
      return false;
    }
  }

  private doStorageEnabled(): boolean {
    return this.env.TELLUS_DO_STORAGE_MODE?.trim().toLowerCase() === "durable";
  }

  private persistedWorldState(): PersistedWorldState {
    return {
      version: 1,
      worldId: this.worldId,
      name: this.worldId === "main" ? "Tellus" : this.worldId,
      is_public: this.worldId === "main",
      terrain: this.terrain ?? defaultTerrainState(),
      generated: [...this.generated.values()],
      queuedGenerationJobs: [...this.queuedGenerationJobs.values()],
      savedAt: new Date().toISOString(),
    };
  }

  private applyPersistedState(state: PersistedWorldState): void {
    this.terrain = state.terrain;
    this.generated = new Map(
      state.generated.filter(isWorldGeneratedThing).map((item) => [item.id, item]),
    );
    this.queuedGenerationJobs = new Map(
      state.queuedGenerationJobs.filter(isQueuedGenerationJob).map((item) => [item.id, item]),
    );
  }

  private externalPersistenceUrl(): string | null {
    const base = this.env.TELLUS_PERSISTENCE_API_BASE?.trim().replace(/\/+$/, "");
    if (!base) return null;
    return `${base}/api/tellus/worlds/${encodeURIComponent(this.worldId)}/state`;
  }

  private externalPersistenceHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = this.env.TELLUS_PERSISTENCE_API_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  private async loadExternalWorldState(): Promise<PersistedWorldState | null> {
    const url = this.externalPersistenceUrl();
    if (!url || !this.externalPersistenceAvailable) return null;
    try {
      const response = await fetch(url, {
        headers: this.externalPersistenceHeaders(),
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        this.externalPersistenceAvailable = false;
        console.warn(`Tellus external world load failed: ${response.status}`);
        return null;
      }
      return persistedStateFrom(await response.json(), this.worldId);
    } catch (error) {
      this.externalPersistenceAvailable = false;
      console.warn("Tellus external world load failed", error);
      return null;
    }
  }

  private async saveExternalWorldState(): Promise<boolean> {
    const url = this.externalPersistenceUrl();
    if (!url || !this.externalPersistenceAvailable) return false;
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: this.externalPersistenceHeaders(),
        body: JSON.stringify(this.persistedWorldState()),
      });
      if (!response.ok) {
        this.externalPersistenceAvailable = false;
        console.warn(`Tellus external world save failed: ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.externalPersistenceAvailable = false;
      console.warn("Tellus external world save failed", error);
      return false;
    }
  }

  private async persistWorldState(): Promise<void> {
    if (await this.saveExternalWorldState()) return;
    if (!this.doStorageEnabled()) return;
    const state = this.persistedWorldState();
    await Promise.all([
      this.safeStoragePut("terrain", state.terrain),
      this.safeStoragePut("generated", state.generated),
      this.safeStoragePut("queuedGenerationJobs", state.queuedGenerationJobs),
    ]);
  }

  private async prunePresence(): Promise<boolean> {
    const now = Date.now();
    let pruned = false;
    for (const [visitorId, presence] of this.presence) {
      const lastSeenAt = Date.parse(presence.lastSeenAt);
      if (!Number.isFinite(lastSeenAt) || now - lastSeenAt > presenceTtlMs) {
        this.presence.delete(visitorId);
        pruned = true;
      }
    }
    if (pruned) {
      await this.persistPresence();
      this.broadcast({ type: "presence.updated", presence: [...this.presence.values()] });
    }
    return pruned;
  }

  private broadcast(patch: WorldPatch): void {
    const payload = JSON.stringify(patch);
    for (const ws of this.ctx.getWebSockets()) {
      ws.send(payload);
    }
  }
}
