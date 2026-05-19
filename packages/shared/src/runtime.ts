import type {
  DocId,
  HarnessRunId,
  RoomId,
  RoomMemberId,
  RoomMessageId,
  RuntimeEventId,
  RuntimeSessionId,
} from "./ids.js";
import type { UnixMs } from "./primitives.js";

export const HARNESS_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type HarnessRunStatus = (typeof HARNESS_RUN_STATUSES)[number];

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

export const isHarnessRunStatus = (value: unknown): value is HarnessRunStatus =>
  typeof value === "string" && HARNESS_RUN_STATUSES.includes(value as HarnessRunStatus);

export const isRuntimeKind = (value: unknown): value is RuntimeKind =>
  typeof value === "string" && RUNTIME_KINDS.includes(value as RuntimeKind);

export const isRuntimeEventType = (value: unknown): value is RuntimeEventType =>
  typeof value === "string" && RUNTIME_EVENT_TYPES.includes(value as RuntimeEventType);

export const isRuntimeEventPayloadKind = (value: unknown): value is RuntimeEventPayloadKind =>
  typeof value === "string" &&
  RUNTIME_EVENT_PAYLOAD_KINDS.includes(value as RuntimeEventPayloadKind);
