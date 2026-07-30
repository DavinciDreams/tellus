import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Box, CheckCircle2, ChevronDown, RefreshCw, WandSparkles, XCircle } from "lucide-react";
import type { MakerAgentSummary } from "./tellus-maker-agents";
import {
  AssetWorkshopApiError,
  assetWorkshopIdempotencyKey,
  fetchAssetWorkshop,
  reviewAssetWorkshop,
  startAssetWorkshop,
  type AssetWorkshopReviewDecision,
  type AssetWorkshopSnapshot,
} from "./tellus-agent-workshops";

interface AgentAssetWorkshopPanelProps {
  agents: MakerAgentSummary[];
}

const ACTIVE_STATUSES = new Set(["queued", "building", "validating"]);

function label(value: string): string {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AgentAssetWorkshopPanel({ agents }: AgentAssetWorkshopPanelProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(agents[0]?.agentId ?? "");
  const [snapshot, setSnapshot] = useState<AssetWorkshopSnapshot | null>(null);
  const [brief, setBrief] = useState("");
  const [goalId, setGoalId] = useState("asset-workshop");
  const [referenceText, setReferenceText] = useState("");
  const [maxPasses, setMaxPasses] = useState(3);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rolloutPending, setRolloutPending] = useState(false);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agentId === agentId) ?? agents[0] ?? null,
    [agentId, agents],
  );
  const knownJobId = selectedAgent?.lastAssetWorkshop?.jobId ?? null;

  useEffect(() => {
    if (!agents.some((agent) => agent.agentId === agentId)) setAgentId(agents[0]?.agentId ?? "");
  }, [agentId, agents]);

  const load = useCallback(async (requestedJobId?: string | null, signal?: AbortSignal) => {
    if (!selectedAgent) return;
    const jobId = requestedJobId || selectedAgent.lastAssetWorkshop?.jobId;
    if (!jobId) {
      setSnapshot(null);
      return;
    }
    setBusy("load");
    setError(null);
    try {
      setSnapshot(await fetchAssetWorkshop(selectedAgent.agentId, jobId, signal));
      setRolloutPending(false);
    } catch (caught) {
      if (signal?.aborted) return;
      if (caught instanceof AssetWorkshopApiError && (caught.status === 404 || caught.status === 405)) {
        setRolloutPending(true);
        setSnapshot(null);
      } else {
        setError(caught instanceof Error ? caught.message : "Could not load the asset workshop.");
      }
    } finally {
      if (!signal?.aborted) setBusy(null);
    }
  }, [selectedAgent]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(knownJobId, controller.signal);
    return () => controller.abort();
  }, [knownJobId, load, open]);

  useEffect(() => {
    if (!open || !snapshot || !ACTIVE_STATUSES.has(snapshot.status)) return;
    const timer = window.setTimeout(() => { void load(snapshot.jobId); }, 3_000);
    return () => window.clearTimeout(timer);
  }, [load, open, snapshot]);

  const start = useCallback(async () => {
    if (!selectedAgent || brief.trim().length < 4) {
      setError("Choose an agent and provide a meaningful asset brief.");
      return;
    }
    setBusy("start");
    setError(null);
    setNotice(null);
    try {
      const references = referenceText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean).slice(0, 8);
      const started = await startAssetWorkshop(selectedAgent.agentId, {
        goalId: goalId.trim().slice(0, 160) || "asset-workshop",
        idempotencyKey: assetWorkshopIdempotencyKey("maker-submit"),
        backend: "procedural",
        brief: brief.trim().slice(0, 4_000),
        referenceUrls: references,
        budget: { maxPasses },
      });
      setSnapshot(started);
      setRolloutPending(false);
      setNotice("Workshop queued. The agent can continue while the sandbox builds and validates passes.");
    } catch (caught) {
      if (caught instanceof AssetWorkshopApiError && (caught.status === 404 || caught.status === 405))
        setRolloutPending(true);
      else setError(caught instanceof Error ? caught.message : "Could not start the asset workshop.");
    } finally {
      setBusy(null);
    }
  }, [brief, goalId, maxPasses, referenceText, selectedAgent]);

  const review = useCallback(async (decision: AssetWorkshopReviewDecision) => {
    if (!selectedAgent || !snapshot) return;
    if (decision === "revise" && !feedback.trim()) {
      setError("Revision feedback is required so the next pass has a deterministic target.");
      return;
    }
    setBusy(`review:${decision}`);
    setError(null);
    setNotice(null);
    try {
      const next = await reviewAssetWorkshop(
        selectedAgent.agentId,
        snapshot.jobId,
        decision,
        feedback.trim().slice(0, 2_000),
        assetWorkshopIdempotencyKey(`maker-${decision}`),
      );
      setSnapshot(next);
      setFeedback("");
      setNotice(decision === "approve" ? "Validated asset approved. It can now be placed through the normal world tools."
        : decision === "revise" ? "Revision queued with your feedback." : "Workshop rejected; nothing was placed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not review the asset workshop.");
    } finally {
      setBusy(null);
    }
  }, [feedback, selectedAgent, snapshot]);

  return (
    <section className="agent-workshop" aria-label="Agent asset workshop">
      <button
        type="button"
        className="agent-workshop__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <WandSparkles size={12} aria-hidden="true" />
        <span>Asset workshop</span>
        <span className="agent-workshop__summary">
          {selectedAgent?.lastAssetWorkshop ? label(selectedAgent.lastAssetWorkshop.status) : "Sandboxed 3D creation"}
        </span>
        <ChevronDown size={12} data-open={open ? "true" : "false"} aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="agent-workshop__body" aria-busy={busy !== null}>
          <p className="agent-workshop__intro">
            Procedural workers build, render, validate, and register a GLB. Nothing is placed until you approve it.
          </p>
          {rolloutPending ? (
            <p className="agent-workshop__pending" role="status">
              Workshop controls are installed and waiting for Hyades to enable AgentAssetWorkshop and configure its sandbox.
            </p>
          ) : (
            <>
              <form className="agent-workshop__form" onSubmit={(event) => { event.preventDefault(); void start(); }}>
                <label>Agent<select value={selectedAgent?.agentId ?? ""} onChange={(event) => setAgentId(event.target.value)}>
                  {agents.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.name} · {agent.worldId}</option>)}
                </select></label>
                <label>Goal id<input value={goalId} maxLength={160} onChange={(event) => setGoalId(event.target.value)} /></label>
                <label className="agent-workshop__wide">Asset brief<textarea value={brief} maxLength={4_000} onChange={(event) => setBrief(event.target.value)} placeholder="What should the asset be, how should it look, and what must it be able to do?" required /></label>
                <label className="agent-workshop__wide">Reference URLs, one per line<textarea value={referenceText} onChange={(event) => setReferenceText(event.target.value)} placeholder="Only operator allow-listed HTTPS hosts are accepted" /></label>
                <label>Maximum passes<input type="number" min={1} max={6} value={maxPasses} onChange={(event) => setMaxPasses(Math.max(1, Math.min(6, Number(event.target.value) || 1)))} /></label>
                <button type="submit" disabled={busy !== null || !selectedAgent || brief.trim().length < 4}>
                  <WandSparkles size={11} aria-hidden="true" /> {busy === "start" ? "Queuing…" : "Start workshop"}
                </button>
              </form>

              {snapshot && (
                <article className="agent-workshop__job" data-status={snapshot.status}>
                  <header>
                    <span><Box size={13} aria-hidden="true" /><strong>{label(snapshot.status)}</strong></span>
                    <button type="button" disabled={busy !== null} onClick={() => void load(snapshot.jobId)}><RefreshCw size={10} /> Refresh</button>
                    <small>pass {snapshot.currentPass} · revision {snapshot.reviewRevision} · {snapshot.backend}</small>
                    <p>{snapshot.summary || snapshot.error || snapshot.brief}</p>
                  </header>

                  {snapshot.validations.length > 0 && <div className="agent-workshop__gates">
                    <strong>Deterministic gates</strong>
                    {snapshot.validations.map((gate) => <span key={gate.gate} data-passed={gate.passed ? "true" : "false"}>
                      {gate.passed ? <CheckCircle2 size={10} aria-hidden="true" /> : <XCircle size={10} aria-hidden="true" />}
                      {label(gate.gate)}{gate.detail ? ` · ${gate.detail}` : ""}
                    </span>)}
                  </div>}

                  {snapshot.artifacts.length > 0 && <div className="agent-workshop__artifacts">
                    <strong>Artifacts and provenance</strong>
                    {snapshot.artifacts.map((artifact, index) => {
                      const external = artifact.reference.startsWith("https://");
                      return external
                        ? <a key={`${artifact.pass}:${artifact.kind}:${index}`} href={artifact.reference} target="_blank" rel="noreferrer">Pass {artifact.pass} · {label(artifact.kind)}</a>
                        : <span key={`${artifact.pass}:${artifact.kind}:${index}`}>Pass {artifact.pass} · {label(artifact.kind)} · {artifact.reference}</span>;
                    })}
                  </div>}

                  {snapshot.modelUrl && <a className="agent-workshop__model" href={snapshot.modelUrl} target="_blank" rel="noreferrer">Open validated registry asset</a>}

                  {snapshot.status === "awaiting-maker" && <div className="agent-workshop__review">
                    <label>Maker feedback<textarea value={feedback} maxLength={2_000} onChange={(event) => setFeedback(event.target.value)} placeholder="Required for revision; optional for approval or rejection" /></label>
                    <span>
                      <button type="button" disabled={busy !== null || !snapshot.registryAssetId} onClick={() => void review("approve")}><CheckCircle2 size={10} /> Approve</button>
                      <button type="button" disabled={busy !== null || !feedback.trim()} onClick={() => void review("revise")}><RefreshCw size={10} /> Revise</button>
                      <button type="button" disabled={busy !== null} onClick={() => void review("reject")}><XCircle size={10} /> Reject</button>
                    </span>
                  </div>}
                </article>
              )}
            </>
          )}

          {error && <p className="agent-workshop__error" role="alert">{error}</p>}
          {notice && <p className="agent-workshop__notice" role="status">{notice}</p>}
        </div>
      )}
    </section>
  );
}
