import type {
  DocId,
  DocRevisionId,
  HarnessContextSnapshotId,
  HarnessRunId,
  HarnessSessionId,
  HarnessTriggerId,
  HarnessTurnId,
  PendingInteractionId,
  RoomId,
  RoomMemberId,
  RoomMessageId,
  RuntimeEventId,
  RuntimeProcessId,
  RuntimeSessionId,
} from "./ids.js";
import type { UnixMs } from "./primitives.js";

export const HARNESS_SESSION_STATUSES = [
  "created",
  "idle",
  "queued",
  "running",
  "waiting_user",
  "paused",
  "failed",
  "terminating",
  "terminated",
] as const;
export type HarnessSessionStatus = (typeof HARNESS_SESSION_STATUSES)[number];

export const HARNESS_TURN_STATUSES = [
  "created",
  "queued",
  "projecting",
  "dispatching",
  "running",
  "translating",
  "writing_room",
  "completed",
  "waiting_user",
  "cancelling",
  "cancelled",
  "failed",
] as const;
export type HarnessTurnStatus = (typeof HARNESS_TURN_STATUSES)[number];

export const HARNESS_TRIGGER_STATUSES = [
  "pending",
  "claimed",
  "dispatched",
  "consumed",
  "deferred",
  "dead_letter",
] as const;
export type HarnessTriggerStatus = (typeof HARNESS_TRIGGER_STATUSES)[number];

export const HARNESS_TRIGGER_KINDS = [
  "member_mentioned",
  "user_continue",
  "intervention",
  "manual_start",
  "scheduled_resume",
  "approval_resolved",
  "runtime_recovered",
] as const;
export type HarnessTriggerKind = (typeof HARNESS_TRIGGER_KINDS)[number];

export const RUNTIME_PROCESS_STATUSES = [
  "stopped",
  "starting",
  "healthy",
  "degraded",
  "restarting",
  "stopping",
  "failed",
] as const;
export type RuntimeProcessStatus = (typeof RUNTIME_PROCESS_STATUSES)[number];

export const RUNTIME_SESSION_STATUSES = [
  "unbound",
  "creating",
  "active",
  "busy",
  "idle",
  "aborting",
  "failed",
  "recovering",
  "closed",
] as const;
export type RuntimeSessionStatus = (typeof RUNTIME_SESSION_STATUSES)[number];

export const PENDING_INTERACTION_STATUSES = [
  "requested",
  "approved",
  "rejected",
  "answered",
  "expired",
  "cancelled",
] as const;
export type PendingInteractionStatus = (typeof PENDING_INTERACTION_STATUSES)[number];

export const PENDING_INTERACTION_KINDS = [
  "approval",
  "question",
  "clarification",
  "handoff",
  "takeover",
] as const;
export type PendingInteractionKind = (typeof PENDING_INTERACTION_KINDS)[number];

export const AGENT_ACTIVITY_STATUSES = [
  "idle",
  "queued",
  "running",
  "waiting_user",
  "paused",
  "offline",
  "failed",
] as const;
export type AgentActivityStatus = (typeof AGENT_ACTIVITY_STATUSES)[number];

export const HARNESS_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type HarnessRunStatus = (typeof HARNESS_RUN_STATUSES)[number];

export const HARNESS_CONTEXT_SNAPSHOT_REDACTION_STATES = ["raw", "redacted"] as const;
export type HarnessContextSnapshotRedactionState =
  (typeof HARNESS_CONTEXT_SNAPSHOT_REDACTION_STATES)[number];

export const RUNTIME_KINDS = ["opencode", "test"] as const;
export type RuntimeKind = (typeof RUNTIME_KINDS)[number];

export const RUNTIME_EVENT_TYPES = [
  "run.queued",
  "run.started",
  "run.updated",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "runtime.session.started",
  "runtime.session.updated",
  "runtime.session.ended",
  "adapter.output",
  "adapter.error",
] as const;
export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

export const RUNTIME_EVENT_PAYLOAD_KINDS = [
  "run_status",
  "session_ref",
  "adapter_output",
  "adapter_error",
  "adapter_metadata",
] as const;
export type RuntimeEventPayloadKind = (typeof RUNTIME_EVENT_PAYLOAD_KINDS)[number];

export interface RuntimeSessionRef {
  readonly id: RuntimeSessionId;
  readonly kind: RuntimeKind;
  readonly adapterSessionId?: string;
  readonly label?: string;
}

export interface RuntimeAdapterCapabilities {
  readonly kind: RuntimeKind;
  readonly supportsInteractiveSession: boolean;
  readonly supportsStreamingEvents: boolean;
  readonly supportsDocContext: boolean;
  readonly supportsCancellation: boolean;
  readonly supportedEventTypes?: readonly RuntimeEventType[];
}

export interface AgentParticipationPolicy {
  readonly triggerMode: "mention_only" | "watch_room" | "manual";
  readonly maxConcurrentTurns: number;
  readonly allowAutonomousContinue: boolean;
  readonly visibleContext: "room" | "mentions" | "docs_only";
  readonly toolPermissionProfile?: string;
}

export interface HarnessSession {
  readonly id: HarnessSessionId;
  readonly roomId: RoomId;
  readonly agentMemberId: RoomMemberId;
  readonly status: HarnessSessionStatus;
  readonly runtime?: RuntimeSessionRef;
  readonly policy: AgentParticipationPolicy;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly lastTurnId?: HarnessTurnId;
  readonly lastTriggerId?: HarnessTriggerId;
  readonly error?: string;
}

export interface HarnessTurn {
  readonly id: HarnessTurnId;
  readonly sessionId: HarnessSessionId;
  readonly roomId: RoomId;
  readonly agentMemberId: RoomMemberId;
  readonly triggerId: HarnessTriggerId;
  readonly status: HarnessTurnStatus;
  readonly runtime?: RuntimeSessionRef;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly startedAt?: UnixMs;
  readonly completedAt?: UnixMs;
  readonly summary?: string;
  readonly error?: string;
}

export interface HarnessTrigger {
  readonly id: HarnessTriggerId;
  readonly sessionId: HarnessSessionId;
  readonly roomId: RoomId;
  readonly agentMemberId: RoomMemberId;
  readonly kind: HarnessTriggerKind;
  readonly status: HarnessTriggerStatus;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly sourceMessageId?: RoomMessageId;
  readonly claimedTurnId?: HarnessTurnId;
  readonly attemptCount: number;
  readonly payload?: Record<string, unknown>;
  readonly error?: string;
}

export interface RuntimeProcess {
  readonly id: RuntimeProcessId;
  readonly kind: RuntimeKind;
  readonly status: RuntimeProcessStatus;
  readonly pid?: number;
  readonly port?: number;
  readonly baseUrl?: string;
  readonly cwd?: string;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly lastHealthCheckAt?: UnixMs;
  readonly restartAttempts: number;
  readonly error?: string;
}

export interface RuntimeSessionState {
  readonly id: RuntimeSessionId;
  readonly processId?: RuntimeProcessId;
  readonly kind: RuntimeKind;
  readonly status: RuntimeSessionStatus;
  readonly adapterSessionId?: string;
  readonly roomId: RoomId;
  readonly agentMemberId: RoomMemberId;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly lastTurnId?: HarnessTurnId;
  readonly error?: string;
}

export interface PendingInteraction {
  readonly id: PendingInteractionId;
  readonly sessionId: HarnessSessionId;
  readonly turnId?: HarnessTurnId;
  readonly roomId: RoomId;
  readonly agentMemberId: RoomMemberId;
  readonly kind: PendingInteractionKind;
  readonly status: PendingInteractionStatus;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly requestMessageId?: RoomMessageId;
  readonly responseMessageId?: RoomMessageId;
  readonly expiresAt?: UnixMs;
  readonly payload?: Record<string, unknown>;
}

export interface AgentActivity {
  readonly roomId: RoomId;
  readonly agentMemberId: RoomMemberId;
  readonly sessionId?: HarnessSessionId;
  readonly status: AgentActivityStatus;
  readonly updatedAt: UnixMs;
  readonly currentTurnId?: HarnessTurnId;
  readonly currentTriggerId?: HarnessTriggerId;
  readonly pendingInteractionId?: PendingInteractionId;
  readonly summary?: string;
  readonly error?: string;
}

export interface HarnessRun {
  readonly id: HarnessRunId;
  readonly roomId: RoomId;
  readonly targetMemberId: RoomMemberId;
  readonly status: HarnessRunStatus;
  readonly runtime?: RuntimeSessionRef;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly startedAt?: UnixMs;
  readonly completedAt?: UnixMs;
  readonly triggerMessageId?: RoomMessageId;
  readonly docIds?: readonly DocId[];
  readonly summary?: string;
  readonly error?: string;
}

export interface HarnessContextSnapshot {
  readonly id: HarnessContextSnapshotId;
  readonly roomId: RoomId;
  readonly agentMemberId: RoomMemberId;
  readonly harnessSessionId?: HarnessSessionId;
  readonly harnessTriggerId?: HarnessTriggerId;
  readonly harnessTurnId?: HarnessTurnId;
  readonly harnessRunId?: HarnessRunId;
  readonly createdAt: UnixMs;
  readonly projectionVersion: number;
  readonly projectionJson: string;
  readonly sourceMessageIds: readonly RoomMessageId[];
  readonly sourceDocRevisionIds: readonly DocRevisionId[];
  readonly tokenEstimate?: number;
  readonly redactionState: HarnessContextSnapshotRedactionState;
}

export interface RuntimeRunStatusPayload {
  readonly kind: "run_status";
  readonly status: HarnessRunStatus;
  readonly message?: string;
  readonly details?: Record<string, unknown>;
}

export interface RuntimeSessionPayload {
  readonly kind: "session_ref";
  readonly session: RuntimeSessionRef;
  readonly details?: Record<string, unknown>;
}

export interface RuntimeAdapterOutputPayload {
  readonly kind: "adapter_output";
  readonly stream: "stdout" | "stderr" | "summary";
  readonly text?: string;
  readonly data?: Record<string, unknown>;
}

export interface RuntimeAdapterErrorPayload {
  readonly kind: "adapter_error";
  readonly message: string;
  readonly code?: string;
  readonly details?: Record<string, unknown>;
}

export interface RuntimeAdapterMetadataPayload {
  readonly kind: "adapter_metadata";
  readonly data: Record<string, unknown>;
}

export type RuntimeEventPayload =
  | RuntimeRunStatusPayload
  | RuntimeSessionPayload
  | RuntimeAdapterOutputPayload
  | RuntimeAdapterErrorPayload
  | RuntimeAdapterMetadataPayload;

export interface RuntimeEvent {
  readonly id: RuntimeEventId;
  readonly runId: HarnessRunId;
  readonly roomId: RoomId;
  readonly targetMemberId: RoomMemberId;
  readonly sequence: number;
  readonly type: RuntimeEventType;
  readonly createdAt: UnixMs;
  readonly runtime?: RuntimeSessionRef;
  readonly payload: RuntimeEventPayload;
}

const includesValue = <T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] => typeof value === "string" && values.includes(value);

export const isHarnessSessionStatus = (value: unknown): value is HarnessSessionStatus =>
  includesValue(HARNESS_SESSION_STATUSES, value);

export const isHarnessTurnStatus = (value: unknown): value is HarnessTurnStatus =>
  includesValue(HARNESS_TURN_STATUSES, value);

export const isHarnessTriggerStatus = (value: unknown): value is HarnessTriggerStatus =>
  includesValue(HARNESS_TRIGGER_STATUSES, value);

export const isHarnessTriggerKind = (value: unknown): value is HarnessTriggerKind =>
  includesValue(HARNESS_TRIGGER_KINDS, value);

export const isRuntimeProcessStatus = (value: unknown): value is RuntimeProcessStatus =>
  includesValue(RUNTIME_PROCESS_STATUSES, value);

export const isRuntimeSessionStatus = (value: unknown): value is RuntimeSessionStatus =>
  includesValue(RUNTIME_SESSION_STATUSES, value);

export const isPendingInteractionStatus = (value: unknown): value is PendingInteractionStatus =>
  includesValue(PENDING_INTERACTION_STATUSES, value);

export const isPendingInteractionKind = (value: unknown): value is PendingInteractionKind =>
  includesValue(PENDING_INTERACTION_KINDS, value);

export const isAgentActivityStatus = (value: unknown): value is AgentActivityStatus =>
  includesValue(AGENT_ACTIVITY_STATUSES, value);

export const isHarnessRunStatus = (value: unknown): value is HarnessRunStatus =>
  includesValue(HARNESS_RUN_STATUSES, value);

export const isHarnessContextSnapshotRedactionState = (
  value: unknown,
): value is HarnessContextSnapshotRedactionState =>
  includesValue(HARNESS_CONTEXT_SNAPSHOT_REDACTION_STATES, value);

export const isRuntimeKind = (value: unknown): value is RuntimeKind =>
  includesValue(RUNTIME_KINDS, value);

export const isRuntimeEventType = (value: unknown): value is RuntimeEventType =>
  includesValue(RUNTIME_EVENT_TYPES, value);

export const isRuntimeEventPayloadKind = (value: unknown): value is RuntimeEventPayloadKind =>
  includesValue(RUNTIME_EVENT_PAYLOAD_KINDS, value);
