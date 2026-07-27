import { useCallback, useEffect, useMemo, useState } from "react";
import type { MakerAgentSummary } from "./tellus-maker-agents";
import { runMakerAgentAction, setMakerAgentRuntimePolicy } from "./tellus-maker-agents";
import type { Vec3 } from "./tellus-types";
import {
  WorldTriggersApiError,
  deleteWorldTrigger,
  deleteWorldTriggerBinding,
  fetchWorldTriggers,
  upsertWorldTrigger,
  upsertWorldTriggerBinding,
  type WorldTriggerActorFilter,
  type WorldTriggerDefinition,
  type WorldTriggerShapeKind,
  type WorldTriggerTransition,
  type WorldTriggersSnapshot,
} from "./tellus-world-triggers";

interface WorldTriggersPanelProps {
  worldId: string;
  agents: MakerAgentSummary[];
  visitorPosition?: Vec3;
  onAgentUpdated(agent: MakerAgentSummary): void;
  onPreview(definitions: readonly WorldTriggerDefinition[] | null): void;
}

interface TriggerDraft {
  triggerId: string;
  shapeKind: WorldTriggerShapeKind;
  center: Vec3;
  radius: number;
  halfExtents: Vec3;
  yawDegrees: number;
  actorFilter: WorldTriggerActorFilter;
  transitions: WorldTriggerTransition[];
  dwellSeconds: number;
  cooldownSeconds: number;
  oncePerVisit: boolean;
  maxEventsPerMinute: number;
  agentId: string;
  eventLabel: string;
  wakeSleepingAgent: boolean;
}

const defaultDraft = (center: Vec3, agentId = ""): TriggerDraft => ({
  triggerId: "",
  shapeKind: "sphere",
  center: {
    x: Number(center.x.toFixed(2)),
    y: Number(center.y.toFixed(2)),
    z: Number(center.z.toFixed(2)),
  },
  radius: 7,
  halfExtents: { x: 5, y: 3, z: 5 },
  yawDegrees: 0,
  actorFilter: "both",
  transitions: ["entered"],
  dwellSeconds: 10,
  cooldownSeconds: 30,
  oncePerVisit: true,
  maxEventsPerMinute: 12,
  agentId,
  eventLabel: "world entrance",
  wakeSleepingAgent: true,
});

const numberFromInput = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const summaryLabel = (definition: WorldTriggerDefinition): string => {
  const shape = definition.shape.kind === "sphere"
    ? `sphere r${definition.shape.radius.toFixed(1)}`
    : `box ${definition.shape.halfExtents.x * 2}×${definition.shape.halfExtents.y * 2}×${definition.shape.halfExtents.z * 2}`;
  return `${shape} · ${definition.actorFilter} · ${definition.transitions.join("/")}`;
};

export function WorldTriggersPanel({
  worldId,
  agents,
  visitorPosition,
  onAgentUpdated,
  onPreview,
}: WorldTriggersPanelProps) {
  const hereAgents = useMemo(() => agents.filter((agent) => agent.worldId === worldId), [agents, worldId]);
  const fallbackCenter = visitorPosition ?? { x: 0, y: 0, z: 0 };
  const [snapshot, setSnapshot] = useState<WorldTriggersSnapshot | null>(null);
  const [support, setSupport] = useState<"loading" | "available" | "dark" | "forbidden" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [showVolumes, setShowVolumes] = useState(true);
  const [draft, setDraft] = useState<TriggerDraft>(() => defaultDraft(fallbackCenter, hereAgents[0]?.agentId));

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await fetchWorldTriggers(worldId, signal);
      setSnapshot(next);
      setSupport("available");
      setError(null);
    } catch (cause) {
      if (signal?.aborted) return;
      if (cause instanceof WorldTriggersApiError && (cause.status === 404 || cause.status === 405)) {
        setSupport("dark");
        setSnapshot(null);
        return;
      }
      if (cause instanceof WorldTriggersApiError && cause.status === 403) {
        setSupport("forbidden");
        setSnapshot(null);
        return;
      }
      setSupport("error");
      setError(cause instanceof Error ? cause.message : "Could not load world automations.");
    }
  }, [worldId]);

  useEffect(() => {
    if (support === "dark" || support === "forbidden") return;
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => void refresh(controller.signal), 5_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refresh, support]);

  useEffect(() => {
    onPreview(showVolumes && support === "available" ? snapshot?.definitions ?? [] : null);
    return () => onPreview(null);
  }, [onPreview, showVolumes, snapshot?.definitions, support]);

  useEffect(() => {
    if (draft.agentId && hereAgents.some((agent) => agent.agentId === draft.agentId)) return;
    setDraft((current) => ({ ...current, agentId: hereAgents[0]?.agentId ?? "" }));
  }, [draft.agentId, hereAgents]);

  if (support === "dark") return null;

  const resetDraft = () => setDraft(defaultDraft(visitorPosition ?? fallbackCenter, hereAgents[0]?.agentId));

  const createConcierge = async () => {
    const agent = hereAgents.find((candidate) => candidate.agentId === draft.agentId) ?? hereAgents[0];
    if (!agent) {
      setError("Bring an agent into this world before creating an entrance concierge.");
      return;
    }
    setBusy("concierge");
    setError(null);
    try {
      const trigger = await upsertWorldTrigger(worldId, {
        shape: { kind: "sphere", center: visitorPosition ?? fallbackCenter, radius: 7 },
        actorFilter: "both",
        transitions: ["entered"],
        cooldownMs: 30_000,
        oncePerVisit: true,
        maxEventsPerMinute: 12,
      });
      await upsertWorldTriggerBinding(worldId, trigger.triggerId, {
        agentId: agent.agentId,
        eventLabel: "world entrance",
        wakeCooldownMs: 30_000,
      });
      let updated = await setMakerAgentRuntimePolicy(agent.agentId, "eventDriven");
      if (!updated.optedIn) updated = await runMakerAgentAction(agent.agentId, "start");
      onAgentUpdated(updated);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create entrance concierge.");
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async () => {
    if (draft.transitions.length === 0) {
      setError("Choose at least one transition.");
      return;
    }
    const agent = hereAgents.find((candidate) => candidate.agentId === draft.agentId);
    if (!agent) {
      setError("Choose an agent placed in this world.");
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const trigger = await upsertWorldTrigger(worldId, {
        triggerId: draft.triggerId || undefined,
        shape: {
          kind: draft.shapeKind,
          center: draft.center,
          radius: Math.max(0.1, draft.radius),
          halfExtents: {
            x: Math.max(0.1, draft.halfExtents.x),
            y: Math.max(0.1, draft.halfExtents.y),
            z: Math.max(0.1, draft.halfExtents.z),
          },
          yawDegrees: draft.yawDegrees,
        },
        actorFilter: draft.actorFilter,
        transitions: draft.transitions,
        dwellMs: draft.transitions.includes("dwelled") ? Math.max(0, draft.dwellSeconds * 1_000) : null,
        cooldownMs: Math.max(0, draft.cooldownSeconds * 1_000),
        oncePerVisit: draft.oncePerVisit,
        maxEventsPerMinute: Math.min(30, Math.max(1, Math.round(draft.maxEventsPerMinute))),
      });
      const alreadyBound = snapshot?.bindings.some((binding) =>
        binding.triggerId === trigger.triggerId && binding.agentId === agent.agentId);
      if (!alreadyBound) {
        await upsertWorldTriggerBinding(worldId, trigger.triggerId, {
          agentId: agent.agentId,
          eventLabel: draft.eventLabel.trim() || "world event",
          wakeCooldownMs: Math.max(0, draft.cooldownSeconds * 1_000),
        });
      }
      if (draft.wakeSleepingAgent && agent.runtimePolicy !== "eventDriven") {
        let updated = await setMakerAgentRuntimePolicy(agent.agentId, "eventDriven");
        if (!updated.optedIn) updated = await runMakerAgentAction(agent.agentId, "start");
        onAgentUpdated(updated);
      } else if (draft.wakeSleepingAgent && !agent.optedIn) {
        onAgentUpdated(await runMakerAgentAction(agent.agentId, "start"));
      }
      await refresh();
      setFormOpen(false);
      resetDraft();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save world automation.");
    } finally {
      setBusy(null);
    }
  };

  const editDefinition = (definition: WorldTriggerDefinition) => {
    const binding = snapshot?.bindings.find((candidate) => candidate.triggerId === definition.triggerId);
    setDraft({
      triggerId: definition.triggerId,
      shapeKind: definition.shape.kind,
      center: { ...definition.shape.center },
      radius: definition.shape.radius,
      halfExtents: { ...definition.shape.halfExtents },
      yawDegrees: definition.shape.yawDegrees,
      actorFilter: definition.actorFilter,
      transitions: [...definition.transitions],
      dwellSeconds: (definition.dwellMs ?? 10_000) / 1_000,
      cooldownSeconds: definition.cooldownMs / 1_000,
      oncePerVisit: definition.oncePerVisit,
      maxEventsPerMinute: definition.maxEventsPerMinute,
      agentId: binding?.agentId ?? hereAgents[0]?.agentId ?? "",
      eventLabel: binding?.eventLabel || "world event",
      wakeSleepingAgent: true,
    });
    setFormOpen(true);
  };

  const removeDefinition = async (definition: WorldTriggerDefinition) => {
    setBusy(definition.triggerId);
    setError(null);
    try {
      await deleteWorldTrigger(worldId, definition.triggerId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete world automation.");
    } finally {
      setBusy(null);
    }
  };

  const removeBinding = async (triggerId: string, bindingId: string) => {
    setBusy(bindingId);
    setError(null);
    try {
      await deleteWorldTriggerBinding(worldId, triggerId, bindingId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove agent binding.");
    } finally {
      setBusy(null);
    }
  };

  const toggleTransition = (transition: WorldTriggerTransition) => {
    setDraft((current) => ({
      ...current,
      transitions: current.transitions.includes(transition)
        ? current.transitions.filter((item) => item !== transition)
        : [...current.transitions, transition],
    }));
  };

  return (
    <section className="world-trigger-panel" aria-label="World automations">
      <div className="world-trigger-panel__header">
        <span>World automations</span>
        {support === "available" && (
          <label className="world-trigger-panel__preview">
            <input type="checkbox" checked={showVolumes} onChange={(event) => setShowVolumes(event.target.checked)} />
            Volumes
          </label>
        )}
      </div>

      {support === "loading" && <span className="world-trigger-panel__muted">Checking automation support…</span>}
      {support === "forbidden" && (
        <span className="world-trigger-panel__muted">Only this world’s owner can manage its automations.</span>
      )}
      {support === "error" && (
        <button type="button" className="world-trigger-panel__retry" onClick={() => void refresh()}>
          Retry automations
        </button>
      )}

      {support === "available" && (
        <>
          <div className="world-trigger-panel__actions">
            <select
              aria-label="Concierge agent"
              value={draft.agentId}
              onChange={(event) => setDraft((current) => ({ ...current, agentId: event.target.value }))}
              disabled={busy !== null || hereAgents.length === 0}
            >
              {hereAgents.length === 0 && <option value="">No agent here</option>}
              {hereAgents.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.name}</option>)}
            </select>
            <button type="button" disabled={busy !== null || hereAgents.length === 0} onClick={() => void createConcierge()}>
              {busy === "concierge" ? "Creating…" : "Entrance concierge here"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (formOpen) resetDraft();
                else setDraft(defaultDraft(visitorPosition ?? fallbackCenter, hereAgents[0]?.agentId));
                setFormOpen((open) => !open);
              }}
            >
              {formOpen ? "Cancel" : "Custom"}
            </button>
          </div>
          <span className="world-trigger-panel__hint">
            Concierge creates a 7 m entrance sphere here, wakes the selected agent, and sends a nearby/world event—not an unsolicited DM.
          </span>

          {formOpen && (
            <div className="world-trigger-form">
              <div className="world-trigger-form__row">
                <label>Shape
                  <select value={draft.shapeKind} onChange={(event) => setDraft((current) => ({ ...current, shapeKind: event.target.value as WorldTriggerShapeKind }))}>
                    <option value="sphere">Sphere</option>
                    <option value="box">Box</option>
                  </select>
                </label>
                <label>Actors
                  <select value={draft.actorFilter} onChange={(event) => setDraft((current) => ({ ...current, actorFilter: event.target.value as WorldTriggerActorFilter }))}>
                    <option value="both">Players + agents</option>
                    <option value="player">Players</option>
                    <option value="agent">Agents</option>
                  </select>
                </label>
              </div>
              <div className="world-trigger-form__coords">
                {(["x", "y", "z"] as const).map((axis) => (
                  <label key={axis}>{axis.toUpperCase()}
                    <input type="number" step="0.5" value={draft.center[axis]} onChange={(event) => setDraft((current) => ({ ...current, center: { ...current.center, [axis]: numberFromInput(event.target.value, current.center[axis]) } }))} />
                  </label>
                ))}
                <button type="button" onClick={() => setDraft((current) => ({ ...current, center: { ...(visitorPosition ?? fallbackCenter) } }))}>Use my position</button>
              </div>
              {draft.shapeKind === "sphere" ? (
                <label>Radius (m)
                  <input type="number" min="0.1" step="0.5" value={draft.radius} onChange={(event) => setDraft((current) => ({ ...current, radius: numberFromInput(event.target.value, current.radius) }))} />
                </label>
              ) : (
                <div className="world-trigger-form__coords">
                  {(["x", "y", "z"] as const).map((axis) => (
                    <label key={axis}>Half {axis.toUpperCase()}
                      <input type="number" min="0.1" step="0.5" value={draft.halfExtents[axis]} onChange={(event) => setDraft((current) => ({ ...current, halfExtents: { ...current.halfExtents, [axis]: numberFromInput(event.target.value, current.halfExtents[axis]) } }))} />
                    </label>
                  ))}
                  <label>Yaw °
                    <input type="number" step="5" value={draft.yawDegrees} onChange={(event) => setDraft((current) => ({ ...current, yawDegrees: numberFromInput(event.target.value, current.yawDegrees) }))} />
                  </label>
                </div>
              )}
              <fieldset>
                <legend>Transitions</legend>
                {(["entered", "exited", "dwelled"] as WorldTriggerTransition[]).map((transition) => (
                  <label key={transition}>
                    <input type="checkbox" checked={draft.transitions.includes(transition)} onChange={() => toggleTransition(transition)} />
                    {transition}
                  </label>
                ))}
              </fieldset>
              <div className="world-trigger-form__row">
                {draft.transitions.includes("dwelled") && (
                  <label>Dwell (s)<input type="number" min="0" value={draft.dwellSeconds} onChange={(event) => setDraft((current) => ({ ...current, dwellSeconds: numberFromInput(event.target.value, current.dwellSeconds) }))} /></label>
                )}
                <label>Cooldown (s)<input type="number" min="0" value={draft.cooldownSeconds} onChange={(event) => setDraft((current) => ({ ...current, cooldownSeconds: numberFromInput(event.target.value, current.cooldownSeconds) }))} /></label>
                <label>Events/min<input type="number" min="1" max="30" value={draft.maxEventsPerMinute} onChange={(event) => setDraft((current) => ({ ...current, maxEventsPerMinute: numberFromInput(event.target.value, current.maxEventsPerMinute) }))} /></label>
              </div>
              <label>Agent
                <select value={draft.agentId} onChange={(event) => setDraft((current) => ({ ...current, agentId: event.target.value }))}>
                  {hereAgents.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.name}</option>)}
                </select>
              </label>
              <label>Event label
                <input maxLength={120} value={draft.eventLabel} onChange={(event) => setDraft((current) => ({ ...current, eventLabel: event.target.value }))} />
              </label>
              <div className="world-trigger-form__checks">
                <label><input type="checkbox" checked={draft.oncePerVisit} onChange={(event) => setDraft((current) => ({ ...current, oncePerVisit: event.target.checked }))} />Once per visit</label>
                <label><input type="checkbox" checked={draft.wakeSleepingAgent} onChange={(event) => setDraft((current) => ({ ...current, wakeSleepingAgent: event.target.checked }))} />Use event-driven presence</label>
              </div>
              <button type="button" disabled={busy !== null || !draft.agentId} onClick={() => void saveDraft()}>
                {busy === "save" ? "Saving…" : draft.triggerId ? "Update automation" : "Create automation"}
              </button>
            </div>
          )}

          {snapshot && snapshot.definitions.length > 0 ? (
            <div className="world-trigger-list">
              {snapshot.definitions.map((definition) => {
                const bindings = snapshot.bindings.filter((binding) => binding.triggerId === definition.triggerId);
                return (
                  <article key={definition.triggerId} className="world-trigger-card">
                    <div className="world-trigger-card__title">
                      <strong>{definition.triggerId}</strong>
                      <span>{definition.enabled ? "active" : "disabled"}</span>
                    </div>
                    <span>{summaryLabel(definition)}</span>
                    {bindings.map((binding) => {
                      const agent = agents.find((candidate) => candidate.agentId === binding.agentId);
                      return (
                        <div key={binding.bindingId} className="world-trigger-card__binding">
                          <span>→ {agent?.name ?? binding.agentId}: {binding.eventLabel || "world event"}</span>
                          <button type="button" disabled={busy !== null} onClick={() => void removeBinding(definition.triggerId, binding.bindingId)}>Unbind</button>
                        </div>
                      );
                    })}
                    <div className="world-trigger-card__buttons">
                      <button type="button" disabled={busy !== null} onClick={() => editDefinition(definition)}>Edit</button>
                      <button type="button" disabled={busy !== null} onClick={() => void removeDefinition(definition)}>{busy === definition.triggerId ? "Deleting…" : "Delete"}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : snapshot ? (
            <span className="world-trigger-panel__muted">No automations in this world yet.</span>
          ) : null}

          {snapshot && (
            <div className="world-trigger-diagnostics" title={snapshot.lastSuccessfulScanAtMs ? `Last successful scan ${new Date(snapshot.lastSuccessfulScanAtMs).toLocaleString()}` : "Waiting for the first scan"}>
              <span>{snapshot.presentActorCount} present</span>
              <span>{snapshot.activeVisits} active visits</span>
              <span>{snapshot.pendingDeliveries} queued</span>
              <span>{snapshot.droppedDeliveries} dropped</span>
            </div>
          )}
        </>
      )}
      {(error || snapshot?.lastError) && <span className="world-trigger-panel__error">{error || snapshot?.lastError}</span>}
    </section>
  );
}
