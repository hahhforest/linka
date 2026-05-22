import {
  OpenCodeServeRuntimeAdapter,
  type OpenCodeServeModelRef,
  type OpenCodeServeRuntimeAdapterOptions,
  type RuntimeAdapter,
} from "@linka/harness";
import {
  harnessTriggerId,
  roomMessageId,
  unixMs,
  type Room,
  type RoomMessage,
  type RoomNotificationPolicy,
  type RoomVisibility,
  type RuntimeEvent,
  type HarnessContextSnapshot,
  type AgentParticipationPolicy,
  type HarnessSessionId,
  type HarnessTriggerId,
  type RuntimeSessionRef,
  type RoomMessageTrace,
  type UnixMs,
} from "@linka/shared";

import type { RoomHarnessRunner, RoomHarnessRunnerInput } from "../api/rooms.js";
import type { DaemonContainer } from "../container/index.js";
import type { DaemonEventEnvelope, PersistedDaemonEvent } from "../store/event-store.js";
import { startHarnessRun } from "./run-service.js";

export const DEFAULT_OPENCODE_MODEL = "azure/gpt-5.5";
export const DEFAULT_OPENCODE_VARIANT = "xhigh";
export const DEFAULT_OPENCODE_AGENT = "build";

export interface CreateOpenCodeRoomHarnessRunnerOptions {
  readonly container: Pick<
    DaemonContainer,
    | "roomStore"
    | "messageStore"
    | "docStore"
    | "harnessRunStore"
    | "harnessSessionStore"
    | "contextSnapshotStore"
    | "eventStore"
    | "eventBus"
  >;
  readonly adapter?: RuntimeAdapter;
  readonly policy?: AgentParticipationPolicy;
  readonly now?: () => Date | number;
}

type DefaultOpenCodeServeRuntimeAdapterOptions = Omit<
  OpenCodeServeRuntimeAdapterOptions,
  "model" | "variant" | "agent"
>;

export const parseOpenCodeModelRef = (model: string): OpenCodeServeModelRef => {
  const slashIndex = model.indexOf("/");
  if (slashIndex <= 0 || slashIndex === model.length - 1) {
    throw new Error(`OpenCode model must be provider/model, got: ${model}`);
  }

  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  };
};

export const createDefaultOpenCodeServeRuntimeAdapter = (
  options: DefaultOpenCodeServeRuntimeAdapterOptions = {},
): OpenCodeServeRuntimeAdapter =>
  new OpenCodeServeRuntimeAdapter({
    ...options,
    model: parseOpenCodeModelRef(DEFAULT_OPENCODE_MODEL),
    variant: DEFAULT_OPENCODE_VARIANT,
    agent: DEFAULT_OPENCODE_AGENT,
  });

const defaultVisibility: RoomVisibility = { scope: "room" };
const defaultNotificationPolicy: RoomNotificationPolicy = { level: "normal" };

const createMessageApiId = (): RoomMessage["id"] => roomMessageId(`rmsg_${crypto.randomUUID()}`);
const createHarnessTriggerApiId = () => harnessTriggerId(`htrig_${crypto.randomUUID()}`);
const createDaemonEventId = (): string => `evt_${crypto.randomUUID()}`;

const readNow = (now: CreateOpenCodeRoomHarnessRunnerOptions["now"]): UnixMs => {
  const value = now?.() ?? Date.now();
  return unixMs(value instanceof Date ? value.getTime() : value);
};

const selectLastAdapterOutputText = (events: readonly RuntimeEvent[]): string | undefined => {
  let outputText: string | undefined;

  for (const event of events) {
    if (event.type !== "adapter.output" || event.payload.kind !== "adapter_output") {
      continue;
    }

    const { text } = event.payload;
    if (typeof text === "string" && text.trim().length > 0) {
      outputText = text;
    }
  }

  return outputText;
};

const formatFailureReplyText = (error: string | undefined): string => {
  const detail = error?.trim();
  return detail && detail.length > 0
    ? `LinkA 运行失败：${detail}`
    : "LinkA 运行失败，请查看运行状态。";
};

const publishRoomEvent = (
  container: Pick<DaemonContainer, "eventStore" | "eventBus">,
  event: Omit<DaemonEventEnvelope, "id" | "createdAt">,
  createdAt: UnixMs,
): PersistedDaemonEvent => {
  const persisted = container.eventStore.append({
    ...event,
    id: createDaemonEventId(),
    createdAt,
  });

  container.eventBus.publish(persisted);
  return persisted;
};

const publishMessageCreated = (
  container: CreateOpenCodeRoomHarnessRunnerOptions["container"],
  roomId: Room["id"],
  message: RoomMessage,
  createdAt: UnixMs,
): void => {
  publishRoomEvent(
    container,
    {
      roomId,
      type: "message.created",
      payload: { message },
    },
    createdAt,
  );
};

const appendOutputMessage = (
  container: CreateOpenCodeRoomHarnessRunnerOptions["container"],
  input: RoomHarnessRunnerInput,
  text: string,
  trace: RoomMessageTrace,
  createdAt: UnixMs,
): RoomMessage =>
  container.messageStore.appendMessage({
    id: createMessageApiId(),
    roomId: input.room.id,
    sender: { kind: "member", memberId: input.targetMember.id },
    kind: "text",
    createdAt,
    text,
    replyTo: { messageId: input.message.id },
    trace,
    visibility: defaultVisibility,
    notification: defaultNotificationPolicy,
  });

const buildOutputTrace = (
  result: Awaited<ReturnType<typeof startHarnessRun>>,
  snapshot: HarnessContextSnapshot,
  sessionId: HarnessSessionId,
  triggerId: HarnessTriggerId,
): RoomMessageTrace => ({
  harnessSessionId: sessionId,
  harnessTriggerId: triggerId,
  harnessRunId: result.run.id,
  ...(result.run.runtime === undefined ? {} : { runtimeSessionId: result.run.runtime.id }),
  projectionSnapshotId: snapshot.id,
  sourceMessageIds: snapshot.sourceMessageIds,
  visibleMessageIds: snapshot.sourceMessageIds,
  visibleDocRevisionIds: snapshot.sourceDocRevisionIds,
});

const defaultPolicy: AgentParticipationPolicy = {
  triggerMode: "mention_only",
  maxConcurrentTurns: 1,
  allowAutonomousContinue: false,
  visibleContext: "room",
};

const bindSessionRuntime = (
  container: CreateOpenCodeRoomHarnessRunnerOptions["container"],
  sessionId: HarnessSessionId,
  runtime: RuntimeSessionRef | undefined,
  updatedAt: UnixMs,
): void => {
  if (runtime === undefined) return;

  container.harnessSessionStore.bindRuntimeSession({
    id: sessionId,
    runtime,
    updatedAt,
  });
};

const markSessionRunning = (
  container: CreateOpenCodeRoomHarnessRunnerOptions["container"],
  sessionId: HarnessSessionId,
  triggerId: HarnessTriggerId,
  updatedAt: UnixMs,
): void => {
  container.harnessSessionStore.updateSessionStatus({
    id: sessionId,
    status: "running",
    updatedAt,
    lastTriggerId: triggerId,
    error: null,
  });
};

const markTriggerDispatched = (
  container: CreateOpenCodeRoomHarnessRunnerOptions["container"],
  triggerId: HarnessTriggerId,
  updatedAt: UnixMs,
): void => {
  container.harnessSessionStore.updateTriggerStatus({
    id: triggerId,
    status: "dispatched",
    updatedAt,
    attemptCount: 1,
    error: null,
  });
};

const completeSessionAndTrigger = (
  container: CreateOpenCodeRoomHarnessRunnerOptions["container"],
  sessionId: HarnessSessionId,
  triggerId: HarnessTriggerId,
  result: Awaited<ReturnType<typeof startHarnessRun>>,
  updatedAt: UnixMs,
): void => {
  const failed = result.run.status === "failed";

  container.harnessSessionStore.updateTriggerStatus({
    id: triggerId,
    status: failed ? "dead_letter" : "consumed",
    updatedAt,
    error: failed ? (result.run.error ?? "run failed") : null,
  });
  container.harnessSessionStore.updateSessionStatus({
    id: sessionId,
    status: failed ? "failed" : "idle",
    updatedAt,
    lastTriggerId: triggerId,
    error: failed ? (result.run.error ?? "run failed") : null,
  });
};

export const createOpenCodeRoomHarnessRunner = ({
  container,
  adapter,
  policy = defaultPolicy,
  now,
}: CreateOpenCodeRoomHarnessRunnerOptions): RoomHarnessRunner => {
  const runtimeAdapter = adapter ?? createDefaultOpenCodeServeRuntimeAdapter();

  return async (input) => {
    const session = container.harnessSessionStore.getOrCreateSessionByRoomAgent(
      input.room.id,
      input.targetMember.id,
      policy,
    );
    const triggeredAt = readNow(now);
    const trigger = container.harnessSessionStore.createTrigger({
      id: createHarnessTriggerApiId(),
      sessionId: session.id,
      roomId: input.room.id,
      agentMemberId: input.targetMember.id,
      kind: "member_mentioned",
      status: "pending",
      createdAt: triggeredAt,
      updatedAt: triggeredAt,
      sourceMessageId: input.message.id,
      attemptCount: 0,
    });
    markSessionRunning(container, session.id, trigger.id, triggeredAt);
    markTriggerDispatched(container, trigger.id, triggeredAt);

    const result = await startHarnessRun({
      container,
      adapter: runtimeAdapter,
      roomId: input.room.id,
      targetMemberId: input.targetMember.id,
      triggerMessageId: input.message.id,
      harnessSessionId: session.id,
      harnessTriggerId: trigger.id,
      runtime: session.runtime,
      now,
    });
    const completedAt = readNow(now);
    bindSessionRuntime(container, session.id, result.run.runtime, completedAt);
    completeSessionAndTrigger(container, session.id, trigger.id, result, completedAt);
    const outputText =
      selectLastAdapterOutputText(result.events) ??
      (result.run.status === "failed" ? formatFailureReplyText(result.run.error) : undefined);

    if (outputText === undefined) {
      return;
    }

    const createdAt = readNow(now);
    const message = appendOutputMessage(
      container,
      input,
      outputText,
      buildOutputTrace(result, result.snapshot, session.id, trigger.id),
      createdAt,
    );
    publishMessageCreated(container, input.room.id, message, createdAt);
  };
};
