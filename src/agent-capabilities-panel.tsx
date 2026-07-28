import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, RefreshCw, ShieldCheck, UsersRound, X } from "lucide-react";
import type { MakerAgentSummary } from "./tellus-maker-agents";
import {
  AgentCapabilityApiError,
  fetchDelegatedAgentCreationLease,
  fetchAgentCapabilityCatalog,
  fetchAgentCapabilityState,
  grantDelegatedAgentCreationLease,
  grantAgentCapabilityLease,
  revokeDelegatedAgentCreationLease,
  revokeAgentCapabilityLease,
  type AgentCapabilityManifest,
  type AgentCapabilityState,
  type DelegatedAgentCreationLease,
} from "./tellus-agent-capabilities";

interface AgentCapabilitiesPanelProps {
  agent: MakerAgentSummary;
}

const EMPTY_STATE: AgentCapabilityState = { activeGoal: null, leases: [], workflows: [] };

function capabilityName(manifests: AgentCapabilityManifest[], capabilityId: string): string {
  return manifests.find((manifest) => manifest.id === capabilityId)?.name ?? capabilityId;
}

function expiryLabel(expiresAtMs: number): string {
  if (!expiresAtMs) return "unknown expiry";
  const remaining = expiresAtMs - Date.now();
  if (remaining <= 0) return "expired";
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.ceil(minutes / 60);
  return hours < 24 ? `${hours}h left` : `${Math.ceil(hours / 24)}d left`;
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
}

export function AgentCapabilitiesPanel({ agent }: AgentCapabilitiesPanelProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AgentCapabilityState>(EMPTY_STATE);
  const [manifests, setManifests] = useState<AgentCapabilityManifest[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rolloutPending, setRolloutPending] = useState(false);
  const [delegatedRolloutPending, setDelegatedRolloutPending] = useState(false);
  const [delegatedLease, setDelegatedLease] = useState<DelegatedAgentCreationLease | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [invocations, setInvocations] = useState(8);
  const [budgetSeconds, setBudgetSeconds] = useState(120);
  const [childCount, setChildCount] = useState(1);
  const [maxLineageDepth, setMaxLineageDepth] = useState(1);
  const [maxDailyTokenBudget, setMaxDailyTokenBudget] = useState(5_000);
  const [allowedWorlds, setAllowedWorlds] = useState(agent.worldId);
  const [templateId, setTemplateId] = useState("collaborator");
  const [defaultChildName, setDefaultChildName] = useState("Collaborator");
  const [persona, setPersona] = useState("");
  const [startChildren, setStartChildren] = useState(false);

  const load = useCallback(async (signal?: AbortSignal, search = "") => {
    setLoading(true);
    setError(null);
    try {
      const delegatedPromise = fetchDelegatedAgentCreationLease(agent.agentId, signal)
        .then((lease) => ({ lease, unavailable: false }))
        .catch((caught: unknown) => {
          if (caught instanceof AgentCapabilityApiError && (caught.status === 404 || caught.status === 405)) {
            return { lease: null, unavailable: true };
          }
          throw caught;
        });
      const [nextState, nextManifests, nextDelegated] = await Promise.all([
        fetchAgentCapabilityState(agent.agentId, signal),
        fetchAgentCapabilityCatalog(search, signal),
        delegatedPromise,
      ]);
      setState(nextState);
      setManifests(nextManifests);
      setDelegatedLease(nextDelegated.lease);
      setDelegatedRolloutPending(nextDelegated.unavailable);
      setRolloutPending(false);
    } catch (caught) {
      if (signal?.aborted) return;
      if (caught instanceof AgentCapabilityApiError && (caught.status === 404 || caught.status === 405)) {
        setRolloutPending(true);
        setDelegatedRolloutPending(true);
        setDelegatedLease(null);
        setState(EMPTY_STATE);
        setManifests([]);
      } else {
        setError(caught instanceof Error ? caught.message : "Could not load capabilities.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [agent.agentId]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(controller.signal, "");
    return () => controller.abort();
  }, [load, open]);

  const makerManifests = useMemo(
    () => manifests.filter((manifest) => manifest.grantMode === "maker" && manifest.id !== "agents.create"),
    [manifests],
  );
  const delegatedCreationManifest = manifests.find((manifest) => manifest.id === "agents.create") ?? null;

  const approve = useCallback(async (manifest: AgentCapabilityManifest) => {
    const goal = state.activeGoal;
    if (!goal) {
      setError(`${agent.name} needs to set an active goal before you can approve a capability.`);
      return;
    }
    setBusyId(manifest.id);
    setError(null);
    setNotice(null);
    try {
      await grantAgentCapabilityLease(agent.agentId, {
        capabilityId: manifest.id,
        goalId: goal.goalId,
        durationMinutes: clampInteger(durationMinutes, 1, 1_440, 30),
        invocations: clampInteger(invocations, 1, 100, 8),
        budgetMs: clampInteger(budgetSeconds, 1, 3_600, 120) * 1_000,
        worldIds: [agent.worldId],
      });
      setNotice(`${manifest.name} approved for ${agent.name}'s active goal.`);
      await load(undefined, query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve capability.");
    } finally {
      setBusyId(null);
    }
  }, [agent.agentId, agent.name, agent.worldId, budgetSeconds, durationMinutes, invocations, load, query, state.activeGoal]);

  const revoke = useCallback(async (leaseId: string, name: string) => {
    setBusyId(leaseId);
    setError(null);
    setNotice(null);
    try {
      await revokeAgentCapabilityLease(agent.agentId, leaseId);
      setNotice(`${name} revoked for ${agent.name}.`);
      await load(undefined, query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke capability.");
    } finally {
      setBusyId(null);
    }
  }, [agent.agentId, agent.name, load, query]);

  const approveDelegatedCreation = useCallback(async () => {
    const goal = state.activeGoal;
    if (!goal) {
      setError(`${agent.name} needs an active goal before you can delegate agent creation.`);
      return;
    }
    const worlds = Array.from(new Set(allowedWorlds.split(",").map((world) => world.trim()).filter(Boolean))).slice(0, 32);
    if (!templateId.trim() || !persona.trim() || worlds.length === 0) {
      setError("Template id, persona, and at least one allowed world are required.");
      return;
    }
    setBusyId("agents.create");
    setError(null);
    setNotice(null);
    try {
      await grantDelegatedAgentCreationLease(agent.agentId, {
        goalId: goal.goalId,
        durationMinutes: clampInteger(durationMinutes, 1, 1_440, 30),
        childCount: clampInteger(childCount, 1, 16, 1),
        maxLineageDepth: clampInteger(maxLineageDepth, 1, 8, 1),
        personaTemplates: [{
          templateId: templateId.trim().slice(0, 80),
          persona: persona.trim().slice(0, 8_000),
          defaultName: defaultChildName.trim().slice(0, 80) || null,
        }],
        worldIds: worlds,
        maxDailyTokenBudget: clampInteger(maxDailyTokenBudget, 1, 20_000_000, 5_000),
        startChildren,
      });
      setNotice(`Agent creation approved for ${agent.name}'s active goal.`);
      await load(undefined, query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve delegated creation.");
    } finally {
      setBusyId(null);
    }
  }, [
    agent.agentId,
    agent.name,
    allowedWorlds,
    childCount,
    defaultChildName,
    durationMinutes,
    load,
    maxDailyTokenBudget,
    maxLineageDepth,
    persona,
    query,
    startChildren,
    state.activeGoal,
    templateId,
  ]);

  const revokeDelegatedCreation = useCallback(async () => {
    if (!delegatedLease) return;
    setBusyId(delegatedLease.leaseId);
    setError(null);
    setNotice(null);
    try {
      await revokeDelegatedAgentCreationLease(agent.agentId, delegatedLease.leaseId);
      setNotice(`Agent creation revoked for ${agent.name}.`);
      await load(undefined, query);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke delegated creation.");
    } finally {
      setBusyId(null);
    }
  }, [agent.agentId, agent.name, delegatedLease, load, query]);

  return (
    <section className="agent-capabilities" aria-label={`Capabilities for ${agent.name}`}>
      <button
        type="button"
        className="agent-capabilities__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <ShieldCheck size={12} aria-hidden="true" />
        <span>Capabilities</span>
        <span className="agent-capabilities__summary">
          {state.activeGoal ? state.activeGoal.goalId : "Goal-scoped"}
        </span>
        <ChevronDown size={12} aria-hidden="true" data-open={open ? "true" : "false"} />
      </button>

      {open && (
        <div id={panelId} className="agent-capabilities__body" aria-busy={loading}>
          <div className="agent-capabilities__intro">
            <span>Safe tools are opened by the agent. Maker approval is required for portals and triggers.</span>
            <button
              type="button"
              aria-label={`Refresh capabilities for ${agent.name}`}
              disabled={loading || busyId !== null}
              onClick={() => void load(undefined, query)}
            >
              <RefreshCw size={11} aria-hidden="true" /> Refresh
            </button>
          </div>

          {rolloutPending ? (
            <p className="agent-capabilities__pending" role="status">
              Capability controls are installed and waiting for Hyades to enable the rollout flag.
            </p>
          ) : (
            <>
              <div className="agent-capabilities__goal">
                <strong>Active goal</strong>
                {state.activeGoal ? (
                  <span><b>{state.activeGoal.goalId}</b> — {state.activeGoal.description}</span>
                ) : (
                  <span>No active goal yet. The agent sets one when it begins capability-guided work.</span>
                )}
              </div>

              <form
                className="agent-capabilities__search"
                onSubmit={(event) => {
                  event.preventDefault();
                  void load(undefined, query);
                }}
              >
                <label htmlFor={`${panelId}-search`}>Find approval</label>
                <input
                  id={`${panelId}-search`}
                  type="search"
                  value={query}
                  maxLength={120}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Portal, trigger, concierge…"
                />
                <button type="submit" disabled={loading || busyId !== null}>Search</button>
              </form>

              <fieldset className="agent-capabilities__limits">
                <legend>Approval limits</legend>
                <label>
                  Minutes
                  <input
                    type="number"
                    min={1}
                    max={1_440}
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(Number(event.target.value))}
                  />
                </label>
                <label>
                  Uses
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={invocations}
                    onChange={(event) => setInvocations(Number(event.target.value))}
                  />
                </label>
                <label>
                  Seconds
                  <input
                    type="number"
                    min={1}
                    max={3_600}
                    value={budgetSeconds}
                    onChange={(event) => setBudgetSeconds(Number(event.target.value))}
                  />
                </label>
              </fieldset>

              <div className="agent-capabilities__approvals">
                <strong>Maker approvals</strong>
                {loading && manifests.length === 0 ? (
                  <span className="agent-capabilities__muted">Loading capabilities…</span>
                ) : makerManifests.length === 0 ? (
                  <span className="agent-capabilities__muted">No maker-approved capabilities match.</span>
                ) : makerManifests.map((manifest) => {
                  const existing = state.leases.find((lease) =>
                    lease.capabilityId === manifest.id
                    && lease.goalId === state.activeGoal?.goalId
                    && lease.worldIds.includes(agent.worldId));
                  return (
                    <article key={`${manifest.id}:${manifest.version}`} className="agent-capability-card">
                      <div>
                        <strong>{manifest.name}</strong>
                        <span>{manifest.description}</span>
                        {manifest.requiredFeatureFlags.length > 0 && (
                          <small>Requires {manifest.requiredFeatureFlags.map((flag) => flag.split(":").pop() ?? flag).join(", ")}</small>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={!state.activeGoal || busyId !== null || Boolean(existing)}
                        aria-describedby={!state.activeGoal ? `${panelId}-goal-help` : undefined}
                        onClick={() => void approve(manifest)}
                      >
                        {busyId === manifest.id ? "Approving…" : existing ? "Approved" : "Approve"}
                      </button>
                    </article>
                  );
                })}
                {!state.activeGoal && (
                  <span id={`${panelId}-goal-help`} className="agent-capabilities__muted">
                    Approval becomes available after the agent sets an active goal.
                  </span>
                )}
              </div>

              {delegatedCreationManifest && (
                <div className="agent-capabilities__delegation">
                  <div className="agent-capabilities__delegation-title">
                    <span>
                      <UsersRound size={12} aria-hidden="true" />
                      <strong>Delegated agent creation</strong>
                    </span>
                    <small>Children stay directly owned and billed by you.</small>
                  </div>

                  {delegatedRolloutPending ? (
                    <p className="agent-capabilities__pending" role="status">
                      Creation approvals are installed and waiting for Hyades to enable the delegated-creation flag.
                    </p>
                  ) : (
                    <>
                      {delegatedLease ? (
                        <article className="agent-capability-card agent-capability-card--delegated">
                          <div>
                            <strong>{delegatedLease.remainingChildren} child approvals remaining</strong>
                            <span>
                              {expiryLabel(delegatedLease.expiresAtMs)} · depth {delegatedLease.maxLineageDepth}
                              {` · ${delegatedLease.maxDailyTokenBudget.toLocaleString()} tokens/day`}
                            </span>
                            <small>
                              {delegatedLease.personaTemplates.map((template) => template.templateId).join(", ")}
                              {` · ${delegatedLease.worldIds.join(", ")}`}
                            </small>
                          </div>
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => void revokeDelegatedCreation()}
                          >
                            <X size={11} aria-hidden="true" /> Revoke
                          </button>
                        </article>
                      ) : (
                        <span className="agent-capabilities__muted">No active creation approval.</span>
                      )}

                      <form
                        className="agent-capabilities__delegation-form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void approveDelegatedCreation();
                        }}
                      >
                        <label>
                          Template id
                          <input
                            value={templateId}
                            maxLength={80}
                            onChange={(event) => setTemplateId(event.target.value)}
                            placeholder="crop-keeper"
                            required
                          />
                        </label>
                        <label>
                          Default child name
                          <input
                            value={defaultChildName}
                            maxLength={80}
                            onChange={(event) => setDefaultChildName(event.target.value)}
                            placeholder="Crop Keeper"
                          />
                        </label>
                        <label className="agent-capabilities__delegation-wide">
                          Approved persona
                          <textarea
                            value={persona}
                            maxLength={8_000}
                            onChange={(event) => setPersona(event.target.value)}
                            placeholder="Tend the orchard, coordinate harvest work, and report evidence."
                            required
                          />
                        </label>
                        <label className="agent-capabilities__delegation-wide">
                          Allowed initial worlds
                          <input
                            value={allowedWorlds}
                            maxLength={2_000}
                            onChange={(event) => setAllowedWorlds(event.target.value)}
                            placeholder="world-one, world-two"
                            required
                          />
                          <small>Comma-separated world ids; Hyades verifies your access.</small>
                        </label>
                        <label>
                          Children
                          <input
                            type="number"
                            min={1}
                            max={16}
                            value={childCount}
                            onChange={(event) => setChildCount(Number(event.target.value))}
                          />
                        </label>
                        <label>
                          Max depth
                          <input
                            type="number"
                            min={1}
                            max={8}
                            value={maxLineageDepth}
                            onChange={(event) => setMaxLineageDepth(Number(event.target.value))}
                          />
                        </label>
                        <label>
                          Daily tokens
                          <input
                            type="number"
                            min={1}
                            max={20_000_000}
                            value={maxDailyTokenBudget}
                            onChange={(event) => setMaxDailyTokenBudget(Number(event.target.value))}
                          />
                        </label>
                        <label className="agent-capabilities__delegation-checkbox">
                          <input
                            type="checkbox"
                            checked={startChildren}
                            onChange={(event) => setStartChildren(event.target.checked)}
                          />
                          Start children immediately
                        </label>
                        <button
                          type="submit"
                          className="agent-capabilities__delegation-submit"
                          disabled={!state.activeGoal || busyId !== null}
                        >
                          {busyId === "agents.create"
                            ? "Approving…"
                            : delegatedLease ? "Replace creation approval" : "Approve agent creation"}
                        </button>
                        {!state.activeGoal && (
                          <span className="agent-capabilities__muted agent-capabilities__delegation-wide">
                            Approval becomes available after the agent sets an active goal.
                          </span>
                        )}
                      </form>
                    </>
                  )}
                </div>
              )}

              <div className="agent-capabilities__leases">
                <strong>Current leases ({state.leases.length})</strong>
                {state.leases.length === 0 ? (
                  <span className="agent-capabilities__muted">No active leases.</span>
                ) : (
                  <ul>
                    {state.leases.map((lease) => {
                      const name = capabilityName(manifests, lease.capabilityId);
                      return (
                        <li key={lease.leaseId}>
                          <span>
                            <b>{name}</b>
                            <small>{lease.remainingInvocations} uses · {expiryLabel(lease.expiresAtMs)} · {lease.goalId}</small>
                          </span>
                          <button
                            type="button"
                            aria-label={`Revoke ${name} from ${agent.name}`}
                            disabled={busyId !== null}
                            onClick={() => void revoke(lease.leaseId, name)}
                          >
                            <X size={11} aria-hidden="true" /> Revoke
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {state.workflows.length > 0 && (
                <div className="agent-capabilities__workflows">
                  <strong>Recent workflows</strong>
                  <ul>
                    {state.workflows.slice(0, 3).map((workflow) => (
                      <li key={workflow.workflowId} data-status={workflow.status}>
                        <span>{workflow.operation || capabilityName(manifests, workflow.capabilityId)}</span>
                        <b>{workflow.status}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {error && <p className="agent-capabilities__error" role="alert">{error}</p>}
          {notice && <p className="agent-capabilities__notice" role="status">{notice}</p>}
        </div>
      )}
    </section>
  );
}
