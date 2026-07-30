import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, ClipboardList, Plus, RefreshCw, UsersRound, X } from "lucide-react";
import type { MakerAgentSummary } from "./tellus-maker-agents";
import {
  CollaborationApiError,
  collaborationIdempotencyKey,
  createCollaborationTask,
  createCollaborationWorkspace,
  fetchCollaborationWorkspace,
  fetchCollaborationWorkspaces,
  mutateCollaborationTask,
  removeCollaborationMember,
  setCollaborationMember,
  setCollaborationWorkspaceClosed,
  type CollaborationRole,
  type CollaborationWorkspace,
  type CollaborationWorkspaceSummary,
} from "./tellus-agent-collaboration";

interface AgentCollaborationPanelProps {
  agents: MakerAgentSummary[];
  currentWorldId: string;
}

const ROLE_OPTIONS: CollaborationRole[] = ["lead", "contributor", "reviewer"];

function roleLabel(role: CollaborationRole): string {
  return role[0].toUpperCase() + role.slice(1);
}

function statusLabel(status: string): string {
  return status.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase());
}

export function AgentCollaborationPanel({ agents, currentWorldId }: AgentCollaborationPanelProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [summaries, setSummaries] = useState<CollaborationWorkspaceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<CollaborationWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rolloutPending, setRolloutPending] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [sharedGoal, setSharedGoal] = useState("");
  const [projectWorldId, setProjectWorldId] = useState(currentWorldId);
  const [newMemberRoles, setNewMemberRoles] = useState<Record<string, CollaborationRole | "">>({});
  const [memberToAdd, setMemberToAdd] = useState("");
  const [memberRole, setMemberRole] = useState<CollaborationRole>("contributor");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("");

  const agentNames = useMemo(
    () => new Map(agents.map((agent) => [agent.agentId, agent.name])),
    [agents],
  );
  const memberIds = useMemo(
    () => new Set(workspace?.members.map((member) => member.agentId) ?? []),
    [workspace],
  );
  const availableAgents = agents.filter((agent) => !memberIds.has(agent.agentId));

  const loadList = useCallback(async (signal?: AbortSignal, preserveSelection = true) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchCollaborationWorkspaces(signal);
      setSummaries(next);
      setRolloutPending(false);
      setSelectedId((current) => {
        if (preserveSelection && current && next.some((row) => row.workspaceId === current)) return current;
        return next[0]?.workspaceId ?? null;
      });
    } catch (caught) {
      if (signal?.aborted) return;
      if (caught instanceof CollaborationApiError && (caught.status === 404 || caught.status === 405)) {
        setRolloutPending(true);
        setSummaries([]);
        setSelectedId(null);
        setWorkspace(null);
      } else {
        setError(caught instanceof Error ? caught.message : "Could not load projects.");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const loadWorkspace = useCallback(async (workspaceId: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      setWorkspace(await fetchCollaborationWorkspace(workspaceId, signal));
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : "Could not load project.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void loadList(controller.signal);
    return () => controller.abort();
  }, [loadList, open]);

  useEffect(() => {
    if (!open || !selectedId) {
      if (!selectedId) setWorkspace(null);
      return;
    }
    const controller = new AbortController();
    void loadWorkspace(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadWorkspace, open, selectedId]);

  const beginCreate = useCallback(() => {
    const roles: Record<string, CollaborationRole | ""> = {};
    agents.forEach((agent, index) => { roles[agent.agentId] = index === 0 ? "lead" : ""; });
    setNewMemberRoles(roles);
    setProjectWorldId(currentWorldId);
    setCreateOpen(true);
    setError(null);
    setNotice(null);
  }, [agents, currentWorldId]);

  const createProject = useCallback(async () => {
    const members = agents.flatMap((agent) => {
      const role = newMemberRoles[agent.agentId];
      return role ? [{ agentId: agent.agentId, role }] : [];
    });
    if (!projectName.trim() || !sharedGoal.trim() || !members.some((member) => member.role === "lead")) {
      setError("Project name, shared goal, and at least one lead are required.");
      return;
    }
    setBusy("create-project");
    setError(null);
    setNotice(null);
    try {
      const created = await createCollaborationWorkspace({
        idempotencyKey: collaborationIdempotencyKey("create-project"),
        name: projectName.trim().slice(0, 120),
        sharedGoal: sharedGoal.trim().slice(0, 2_000),
        worldId: projectWorldId.trim().slice(0, 240) || null,
        members,
      });
      setWorkspace(created);
      setSelectedId(created.workspaceId);
      setCreateOpen(false);
      setProjectName("");
      setSharedGoal("");
      setNotice(`Created ${created.name}.`);
      await loadList(undefined, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create project.");
    } finally {
      setBusy(null);
    }
  }, [agents, loadList, newMemberRoles, projectName, projectWorldId, sharedGoal]);

  const updateMember = useCallback(async (agentId: string, role: CollaborationRole) => {
    if (!workspace) return;
    setBusy(`member:${agentId}`);
    setError(null);
    try {
      const updated = await setCollaborationMember(
        workspace.workspaceId,
        agentId,
        role,
        collaborationIdempotencyKey("set-member"),
      );
      setWorkspace(updated);
      setNotice(`Updated ${agentNames.get(agentId) ?? agentId} to ${roleLabel(role)}.`);
      await loadList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update member.");
    } finally {
      setBusy(null);
    }
  }, [agentNames, loadList, workspace]);

  const removeMember = useCallback(async (agentId: string) => {
    if (!workspace) return;
    setBusy(`member:${agentId}`);
    setError(null);
    try {
      const updated = await removeCollaborationMember(
        workspace.workspaceId,
        agentId,
        collaborationIdempotencyKey("remove-member"),
      );
      setWorkspace(updated);
      setNotice(`Removed ${agentNames.get(agentId) ?? agentId} from the project.`);
      await loadList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove member.");
    } finally {
      setBusy(null);
    }
  }, [agentNames, loadList, workspace]);

  const addMember = useCallback(async () => {
    if (!memberToAdd) return;
    await updateMember(memberToAdd, memberRole);
    setMemberToAdd("");
  }, [memberRole, memberToAdd, updateMember]);

  const setWorkspaceClosed = useCallback(async (closed: boolean) => {
    if (!workspace) return;
    setBusy("workspace-lifecycle");
    setError(null);
    setNotice(null);
    try {
      const updated = await setCollaborationWorkspaceClosed(
        workspace.workspaceId,
        closed,
        collaborationIdempotencyKey(closed ? "close-project" : "reopen-project"),
      );
      setWorkspace(updated);
      setNotice(closed ? "Project closed. Its history remains available." : "Project reopened for new work.");
      await loadList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not ${closed ? "close" : "reopen"} project.`);
    } finally {
      setBusy(null);
    }
  }, [loadList, workspace]);

  const addTask = useCallback(async () => {
    if (!workspace || !taskTitle.trim()) return;
    setBusy("create-task");
    setError(null);
    try {
      const updated = await createCollaborationTask(workspace.workspaceId, {
        idempotencyKey: collaborationIdempotencyKey("create-task"),
        title: taskTitle.trim().slice(0, 160),
        description: taskDescription.trim().slice(0, 4_000),
        assignedAgentId: taskAssignee || null,
      });
      setWorkspace(updated);
      setTaskTitle("");
      setTaskDescription("");
      setTaskAssignee("");
      setNotice("Task added. The assigned agent will receive a durable project event.");
      await loadList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create task.");
    } finally {
      setBusy(null);
    }
  }, [loadList, taskAssignee, taskDescription, taskTitle, workspace]);

  const reviewTask = useCallback(async (taskId: string, approved: boolean) => {
    if (!workspace) return;
    setBusy(`task:${taskId}`);
    setError(null);
    try {
      const updated = await mutateCollaborationTask(workspace.workspaceId, taskId, {
        idempotencyKey: collaborationIdempotencyKey("review-task"),
        kind: "review",
        status: approved ? "approved" : "rejected",
        summary: approved ? "Approved by the maker." : "Returned by the maker for revision.",
      });
      setWorkspace(updated);
      setNotice(approved ? "Task approved." : "Task returned for revision.");
      await loadList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not review task.");
    } finally {
      setBusy(null);
    }
  }, [loadList, workspace]);

  return (
    <section className="agent-collaboration" aria-label="Agent collaboration projects">
      <button
        type="button"
        className="agent-collaboration__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <UsersRound size={12} aria-hidden="true" />
        <span>Projects</span>
        <span className="agent-collaboration__summary">
          {summaries.length > 0 ? `${summaries.length} shared` : "Multi-agent work"}
        </span>
        <ChevronDown size={12} data-open={open ? "true" : "false"} aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="agent-collaboration__body" aria-busy={loading}>
          <div className="agent-collaboration__toolbar">
            <span>Coordinate stable agents across worlds without changing ownership.</span>
            <button type="button" disabled={loading || busy !== null} onClick={() => void loadList()}>
              <RefreshCw size={11} aria-hidden="true" /> Refresh
            </button>
            <button type="button" disabled={busy !== null || agents.length === 0} onClick={beginCreate}>
              <Plus size={11} aria-hidden="true" /> New project
            </button>
          </div>

          {rolloutPending ? (
            <p className="agent-collaboration__pending" role="status">
              Project controls are installed and waiting for Hyades to enable AgentCollaboration.
            </p>
          ) : (
            <>
              {createOpen && (
                <form className="agent-collaboration__form" onSubmit={(event) => { event.preventDefault(); void createProject(); }}>
                  <div className="agent-collaboration__form-title">
                    <strong>New shared project</strong>
                    <button type="button" onClick={() => setCreateOpen(false)} aria-label="Close new project form"><X size={11} /></button>
                  </div>
                  <label>Project name<input value={projectName} maxLength={120} onChange={(event) => setProjectName(event.target.value)} required /></label>
                  <label>World context<input value={projectWorldId} maxLength={240} onChange={(event) => setProjectWorldId(event.target.value)} /></label>
                  <label className="agent-collaboration__wide">Shared goal<textarea value={sharedGoal} maxLength={2_000} onChange={(event) => setSharedGoal(event.target.value)} required /></label>
                  <fieldset className="agent-collaboration__wide">
                    <legend>Participants</legend>
                    {agents.map((agent) => (
                      <label key={agent.agentId} className="agent-collaboration__participant">
                        <span>{agent.name}<small>{agent.worldId}</small></span>
                        <select
                          value={newMemberRoles[agent.agentId] ?? ""}
                          onChange={(event) => setNewMemberRoles((current) => ({ ...current, [agent.agentId]: event.target.value as CollaborationRole | "" }))}
                        >
                          <option value="">Not included</option>
                          {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                        </select>
                      </label>
                    ))}
                  </fieldset>
                  <button type="submit" className="agent-collaboration__wide" disabled={busy !== null}>{busy === "create-project" ? "Creating…" : "Create project"}</button>
                </form>
              )}

              {summaries.length > 0 ? (
                <label className="agent-collaboration__picker">
                  Project
                  <select value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value || null)}>
                    {summaries.map((row) => (
                      <option key={row.workspaceId} value={row.workspaceId}>{row.name} · {row.openTaskCount} open</option>
                    ))}
                  </select>
                </label>
              ) : !createOpen && (
                <span className="agent-collaboration__muted">No shared projects yet.</span>
              )}

              {workspace && (
                <div className="agent-collaboration__workspace">
                  <header>
                    <span><ClipboardList size={13} aria-hidden="true" /><strong>{workspace.name}</strong></span>
                    <small>revision {workspace.revision}{workspace.worldId ? ` · ${workspace.worldId}` : ""}</small>
                    <p>{workspace.sharedGoal}</p>
                    <button
                      type="button"
                      disabled={busy !== null || (!workspace.closed && workspace.tasks.some((task) => !["approved", "rejected"].includes(task.status)))}
                      onClick={() => void setWorkspaceClosed(!workspace.closed)}
                    >
                      {workspace.closed ? "Reopen project" : "Close project"}
                    </button>
                  </header>

                  <div className="agent-collaboration__members">
                    <strong>Team</strong>
                    {workspace.members.map((member) => (
                      <div key={member.agentId}>
                        <span>{agentNames.get(member.agentId) ?? member.agentId}</span>
                        <select
                          value={member.role}
                          disabled={busy !== null}
                          aria-label={`Role for ${agentNames.get(member.agentId) ?? member.agentId}`}
                          onChange={(event) => void updateMember(member.agentId, event.target.value as CollaborationRole)}
                        >
                          {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                        </select>
                        <button type="button" disabled={busy !== null} onClick={() => void removeMember(member.agentId)} aria-label={`Remove ${agentNames.get(member.agentId) ?? member.agentId}`}><X size={10} /></button>
                      </div>
                    ))}
                    {availableAgents.length > 0 && (
                      <div className="agent-collaboration__add-member">
                        <select value={memberToAdd} onChange={(event) => setMemberToAdd(event.target.value)} aria-label="Agent to add">
                          <option value="">Add an agent…</option>
                          {availableAgents.map((agent) => <option key={agent.agentId} value={agent.agentId}>{agent.name}</option>)}
                        </select>
                        <select value={memberRole} onChange={(event) => setMemberRole(event.target.value as CollaborationRole)} aria-label="New member role">
                          {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                        </select>
                        <button type="button" disabled={!memberToAdd || busy !== null} onClick={() => void addMember()}>Add</button>
                      </div>
                    )}
                  </div>

                  <form className="agent-collaboration__task-form" onSubmit={(event) => { event.preventDefault(); void addTask(); }}>
                    <strong>New task</strong>
                    <input disabled={workspace.closed} value={taskTitle} maxLength={160} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Task title" aria-label="Task title" required />
                    <textarea disabled={workspace.closed} value={taskDescription} maxLength={4_000} onChange={(event) => setTaskDescription(event.target.value)} placeholder="Success conditions or context" aria-label="Task description" />
                    <select disabled={workspace.closed} value={taskAssignee} onChange={(event) => setTaskAssignee(event.target.value)} aria-label="Assign task">
                      <option value="">Open claim</option>
                      {workspace.members.map((member) => <option key={member.agentId} value={member.agentId}>{agentNames.get(member.agentId) ?? member.agentId}</option>)}
                    </select>
                    <button type="submit" disabled={workspace.closed || !taskTitle.trim() || busy !== null}>{busy === "create-task" ? "Adding…" : "Add task"}</button>
                  </form>

                  <div className="agent-collaboration__tasks">
                    <strong>Tasks</strong>
                    {workspace.tasks.length === 0 ? <span className="agent-collaboration__muted">No tasks yet.</span> : workspace.tasks.map((task) => (
                      <article key={task.taskId} data-status={task.status}>
                        <div>
                          <strong>{task.title}</strong>
                          <span>{statusLabel(task.status)}{task.claimedByAgentId ? ` · ${agentNames.get(task.claimedByAgentId) ?? task.claimedByAgentId}` : task.assignedAgentId ? ` · assigned to ${agentNames.get(task.assignedAgentId) ?? task.assignedAgentId}` : ""}</span>
                          {task.description && <p>{task.description}</p>}
                          {task.updateSummary && <p>Update: {task.updateSummary}</p>}
                          {task.reviewSummary && <p>Review: {task.reviewSummary}</p>}
                          {task.artifacts.map((artifact) => <a key={artifact.artifactId} href={artifact.reference} target="_blank" rel="noreferrer">{artifact.label || artifact.kind}</a>)}
                        </div>
                        {task.status === "inReview" && (
                          <span className="agent-collaboration__review">
                            <button type="button" disabled={busy !== null} onClick={() => void reviewTask(task.taskId, true)}>Approve</button>
                            <button type="button" disabled={busy !== null} onClick={() => void reviewTask(task.taskId, false)}>Revise</button>
                          </span>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="agent-collaboration__error" role="alert">{error}</p>}
          {notice && <p className="agent-collaboration__notice" role="status">{notice}</p>}
        </div>
      )}
    </section>
  );
}
