import type {
  HarnessRun,
  HarnessRunId,
  HarnessSession,
  HarnessSessionId,
  HarnessTriggerId,
  RoomMember,
  RoomMemberId,
  RuntimeEvent,
  UnixMs,
} from "@linka/shared";

export type AgentActivityItemKind =
  | "session_ready"
  | "session_status"
  | "run_queued"
  | "run_running"
  | "run_completed"
  | "run_failed"
  | "run_cancelled"
  | "adapter_output"
  | "adapter_error";

export type AgentActivityItemStatus =
  | "ready"
  | "queued"
  | "running"
  | "waiting_user"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "terminated"
  | "output"
  | "error";

export type AgentActivitySeverity = "info" | "success" | "warning" | "error";

export interface AgentActivityItem {
  readonly id: string;
  readonly kind: AgentActivityItemKind;
  readonly status: AgentActivityItemStatus;
  readonly severity: AgentActivitySeverity;
  readonly title: string;
  readonly summary: string;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly agentMemberId: RoomMemberId;
  readonly agentDisplayName: string;
  readonly runId?: HarnessRunId;
  readonly sessionId?: HarnessSessionId;
  readonly triggerId?: HarnessTriggerId;
  readonly rawEventCount: number;
  readonly rawEvents: readonly RuntimeEvent[];
}

export interface AgentActivityProjectionInput {
  readonly members: readonly RoomMember[];
  readonly sessions: readonly HarnessSession[];
  readonly runs: readonly HarnessRun[];
  readonly runtimeEventsByRunId: Readonly<Record<string, readonly RuntimeEvent[]>>;
}

const statusRuntimeEventTypes = new Set<RuntimeEvent["type"]>([
  "run.queued",
  "run.started",
  "run.updated",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "runtime.session.started",
  "runtime.session.updated",
  "runtime.session.ended",
]);

const adapterRuntimeEventTypes = new Set<RuntimeEvent["type"]>(["adapter.output", "adapter.error"]);

const getAgentDisplayName = (
  membersById: ReadonlyMap<RoomMemberId, RoomMember>,
  agentMemberId: RoomMemberId,
): string => membersById.get(agentMemberId)?.displayName ?? "Agent";

const describeRuntime = (session: HarnessSession): string | undefined => {
  if (!session.runtime) return undefined;

  return session.runtime.label ?? session.runtime.adapterSessionId ?? session.runtime.kind;
};

const sessionStatusToItemStatus = (status: HarnessSession["status"]): AgentActivityItemStatus => {
  switch (status) {
    case "created":
    case "idle":
      return "ready";
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "waiting_user":
      return "waiting_user";
    case "paused":
      return "paused";
    case "failed":
      return "failed";
    case "terminating":
    case "terminated":
      return "terminated";
  }
};

const sessionSeverity = (status: AgentActivityItemStatus): AgentActivitySeverity => {
  switch (status) {
    case "failed":
      return "error";
    case "waiting_user":
    case "paused":
    case "terminated":
      return "warning";
    default:
      return "info";
  }
};

const runKind = (status: HarnessRun["status"]): AgentActivityItemKind => {
  switch (status) {
    case "queued":
      return "run_queued";
    case "running":
      return "run_running";
    case "succeeded":
      return "run_completed";
    case "failed":
      return "run_failed";
    case "cancelled":
      return "run_cancelled";
  }
};

const runStatus = (status: HarnessRun["status"]): AgentActivityItemStatus => {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
};

const runSeverity = (status: AgentActivityItemStatus): AgentActivitySeverity => {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "cancelled":
      return "warning";
    default:
      return "info";
  }
};

const truncateSummary = (text: string, maxLength = 180): string => {
  const normalized = text.trim().replace(/\s+/gu, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}...`;
};

const statusMessageFromEvents = (events: readonly RuntimeEvent[]): string | undefined => {
  for (const event of [...events].reverse()) {
    if (event.payload.kind === "run_status" && event.payload.message) {
      return event.payload.message;
    }
  }

  return undefined;
};

const findSessionForRun = (
  run: HarnessRun,
  sessionsByAgentId: ReadonlyMap<RoomMemberId, readonly HarnessSession[]>,
): HarnessSession | undefined => {
  const agentSessions = sessionsByAgentId.get(run.targetMemberId) ?? [];

  if (agentSessions.length === 0) return undefined;

  const runtimeId = run.runtime?.id;
  if (runtimeId) {
    const runtimeMatch = agentSessions.find((session) => session.runtime?.id === runtimeId);
    if (runtimeMatch) return runtimeMatch;
  }

  if (agentSessions.length === 1) return agentSessions[0];

  return agentSessions
    .filter((session) => session.createdAt <= run.updatedAt)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
};

const buildSessionItem = (
  session: HarnessSession,
  membersById: ReadonlyMap<RoomMemberId, RoomMember>,
): AgentActivityItem => {
  const status = sessionStatusToItemStatus(session.status);
  const agentDisplayName = getAgentDisplayName(membersById, session.agentMemberId);
  const runtimeDescription = describeRuntime(session);
  const isReady = status === "ready";
  const summaryParts = [
    isReady ? "Session is ready for room work." : `Session status is ${session.status}.`,
    session.lastTriggerId ? `Last trigger: ${session.lastTriggerId}.` : undefined,
    runtimeDescription ? `Runtime: ${runtimeDescription}.` : undefined,
    session.error ? `Error: ${session.error}` : undefined,
  ].filter((part): part is string => Boolean(part));

  return {
    id: `activity:session:${session.id}`,
    kind: isReady ? "session_ready" : "session_status",
    status,
    severity: sessionSeverity(status),
    title: isReady
      ? `${agentDisplayName} session ready`
      : `${agentDisplayName} session ${session.status}`,
    summary: summaryParts.join(" "),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    agentMemberId: session.agentMemberId,
    agentDisplayName,
    sessionId: session.id,
    triggerId: session.lastTriggerId,
    rawEventCount: 0,
    rawEvents: [],
  };
};

const buildRunItem = (
  run: HarnessRun,
  session: HarnessSession | undefined,
  rawEvents: readonly RuntimeEvent[],
  membersById: ReadonlyMap<RoomMemberId, RoomMember>,
): AgentActivityItem => {
  const status = runStatus(run.status);
  const agentDisplayName = getAgentDisplayName(membersById, run.targetMemberId);
  const statusEvents = rawEvents.filter((event) => statusRuntimeEventTypes.has(event.type));
  const eventMessage = statusMessageFromEvents(statusEvents);
  const summary = run.error ?? run.summary ?? eventMessage ?? `Run status is ${run.status}.`;

  return {
    id: `activity:run:${run.id}:${status}`,
    kind: runKind(run.status),
    status,
    severity: runSeverity(status),
    title: `${agentDisplayName} run ${status}`,
    summary: truncateSummary(summary),
    createdAt: run.createdAt,
    updatedAt: run.completedAt ?? run.updatedAt,
    agentMemberId: run.targetMemberId,
    agentDisplayName,
    runId: run.id,
    sessionId: session?.id,
    rawEventCount: rawEvents.length,
    rawEvents: statusEvents,
  };
};

const buildAdapterItem = (
  event: RuntimeEvent,
  run: HarnessRun | undefined,
  session: HarnessSession | undefined,
  membersById: ReadonlyMap<RoomMemberId, RoomMember>,
): AgentActivityItem | undefined => {
  if (!adapterRuntimeEventTypes.has(event.type)) return undefined;

  const agentMemberId = run?.targetMemberId ?? event.targetMemberId;
  const agentDisplayName = getAgentDisplayName(membersById, agentMemberId);

  if (event.payload.kind === "adapter_output") {
    const stream = event.payload.stream;
    const outputSummary = event.payload.text
      ? truncateSummary(event.payload.text)
      : `${stream} output received.`;

    return {
      id: `activity:event:${event.id}`,
      kind: "adapter_output",
      status: "output",
      severity: stream === "stderr" ? "warning" : "info",
      title: `${agentDisplayName} adapter output`,
      summary: outputSummary,
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
      agentMemberId,
      agentDisplayName,
      runId: event.runId,
      sessionId: session?.id,
      rawEventCount: 1,
      rawEvents: [event],
    };
  }

  if (event.payload.kind === "adapter_error") {
    return {
      id: `activity:event:${event.id}`,
      kind: "adapter_error",
      status: "error",
      severity: "error",
      title: `${agentDisplayName} adapter error`,
      summary: truncateSummary(event.payload.message),
      createdAt: event.createdAt,
      updatedAt: event.createdAt,
      agentMemberId,
      agentDisplayName,
      runId: event.runId,
      sessionId: session?.id,
      rawEventCount: 1,
      rawEvents: [event],
    };
  }

  return undefined;
};

export const buildAgentActivityItems = (
  input: AgentActivityProjectionInput,
): readonly AgentActivityItem[] => {
  const membersById = new Map(input.members.map((member) => [member.id, member] as const));
  const sessionsByAgentId = new Map<RoomMemberId, HarnessSession[]>();
  const runsById = new Map(input.runs.map((run) => [run.id, run] as const));
  const runSessionById = new Map<HarnessRunId, HarnessSession | undefined>();

  for (const session of input.sessions) {
    const sessions = sessionsByAgentId.get(session.agentMemberId) ?? [];
    sessions.push(session);
    sessionsByAgentId.set(session.agentMemberId, sessions);
  }

  for (const run of input.runs) {
    runSessionById.set(run.id, findSessionForRun(run, sessionsByAgentId));
  }

  const items: AgentActivityItem[] = input.sessions.map((session) =>
    buildSessionItem(session, membersById),
  );

  for (const run of input.runs) {
    const rawEvents = input.runtimeEventsByRunId[run.id] ?? [];
    const session = runSessionById.get(run.id);
    items.push(buildRunItem(run, session, rawEvents, membersById));
  }

  for (const [runId, events] of Object.entries(input.runtimeEventsByRunId)) {
    const run = runsById.get(runId as HarnessRunId);
    const session = run ? runSessionById.get(run.id) : undefined;

    for (const event of events) {
      const item = buildAdapterItem(event, run, session, membersById);
      if (item) items.push(item);
    }
  }

  return items.sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
    if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
    return left.id.localeCompare(right.id);
  });
};
