import type { RuntimeAdapter } from "@linka/harness";
import {
  harnessContextSnapshotId,
  harnessRunId,
  runtimeEventId,
  unixMs,
  type Doc,
  type DocId,
  type DocRevisionId,
  type HarnessContextSnapshot,
  type HarnessRun,
  type RuntimeEvent,
  type RuntimeSessionRef,
  type Room,
  type RoomMember,
  type RoomMessage,
  type UnixMs,
} from "@linka/shared";

import type { DaemonContainer } from "../container/index.js";
import type { HarnessRunStore } from "../store/harness-run-store.js";
import { createHarnessProjection } from "./projection.js";

export interface StartHarnessRunInput {
  readonly container: Pick<
    DaemonContainer,
    "roomStore" | "messageStore" | "docStore" | "harnessRunStore" | "contextSnapshotStore"
  >;
  readonly adapter: RuntimeAdapter;
  readonly roomId: Room["id"];
  readonly targetMemberId: RoomMember["id"];
  readonly triggerMessageId?: RoomMessage["id"];
  readonly runtime?: RuntimeSessionRef;
  readonly docIds?: readonly DocId[];
  readonly now?: () => Date | number;
}

export interface StartHarnessRunResult {
  readonly run: HarnessRun;
  readonly snapshot: HarnessContextSnapshot;
  readonly events: readonly RuntimeEvent[];
}

const createRunId = (): HarnessRun["id"] => harnessRunId(`hrun_${crypto.randomUUID()}`);
const createContextSnapshotId = (): HarnessContextSnapshot["id"] =>
  harnessContextSnapshotId(`hctx_${crypto.randomUUID()}`);
const createRuntimeEventId = (): RuntimeEvent["id"] =>
  runtimeEventId(`rtevt_${crypto.randomUUID()}`);

const readNow = (now: StartHarnessRunInput["now"]): UnixMs => {
  const value = now?.() ?? Date.now();
  return unixMs(value instanceof Date ? value.getTime() : value);
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

const errorDetails = (error: unknown): Record<string, unknown> | undefined => {
  if (!(error instanceof Error)) {
    return undefined;
  }

  return { name: error.name };
};

const ensureRuntimeSession = (
  store: HarnessRunStore,
  runtime: RuntimeSessionRef | undefined,
): void => {
  if (runtime === undefined || store.getRuntimeSession(runtime.id) !== undefined) {
    return;
  }

  store.createRuntimeSession(runtime);
};

const appendRuntimeEvent = (store: HarnessRunStore, event: RuntimeEvent): RuntimeEvent => {
  ensureRuntimeSession(store, event.runtime);
  return store.appendEvent(event);
};

const selectCurrentDocRevisionIds = (docs: readonly Doc[]): readonly DocRevisionId[] =>
  docs.flatMap((doc) => (doc.currentRevisionId === undefined ? [] : [doc.currentRevisionId]));

const stringifyProjection = (projection: ReturnType<typeof createHarnessProjection>): string => {
  const projectionJson = JSON.stringify(projection);
  if (projectionJson === undefined) {
    throw new Error("harness projection must be JSON-serializable");
  }

  return projectionJson;
};

const createContextSnapshot = ({
  run,
  projection,
  createdAt,
}: {
  readonly run: HarnessRun;
  readonly projection: ReturnType<typeof createHarnessProjection>;
  readonly createdAt: UnixMs;
}): HarnessContextSnapshot => ({
  id: createContextSnapshotId(),
  roomId: run.roomId,
  agentMemberId: run.targetMemberId,
  harnessRunId: run.id,
  createdAt,
  projectionVersion: 1,
  projectionJson: stringifyProjection(projection),
  sourceMessageIds: projection.messages.map((message) => message.id),
  sourceDocRevisionIds: selectCurrentDocRevisionIds(projection.docs),
  redactionState: "raw",
});

const readDocs = (
  container: StartHarnessRunInput["container"],
  roomId: Room["id"],
  docIds: readonly DocId[] | undefined,
): readonly Doc[] => {
  if (docIds === undefined) {
    return container.docStore.listDocsByRoom(roomId);
  }

  return docIds.map((id) => {
    const doc = container.docStore.getDoc(id);
    if (!doc) {
      throw new Error(`doc not found: ${id}`);
    }

    if (doc.contextRoomId !== roomId) {
      throw new Error(`doc does not belong to room: ${id}`);
    }

    return doc;
  });
};

const assertRuntimeEventMatchesRun = (run: HarnessRun, event: RuntimeEvent): void => {
  if (event.runId !== run.id) {
    throw new Error("runtime event run mismatch");
  }

  if (event.roomId !== run.roomId) {
    throw new Error("runtime event room mismatch");
  }

  if (event.targetMemberId !== run.targetMemberId) {
    throw new Error("runtime event target member mismatch");
  }
};

const createFailedRuntimeEvent = (
  run: HarnessRun,
  sequence: number,
  createdAt: UnixMs,
  error: unknown,
): RuntimeEvent => ({
  id: createRuntimeEventId(),
  runId: run.id,
  roomId: run.roomId,
  targetMemberId: run.targetMemberId,
  sequence,
  type: "run.failed",
  createdAt,
  payload: {
    kind: "run_status",
    status: "failed",
    message: errorMessage(error),
    details: errorDetails(error),
  },
});

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

const selectFinalRuntime = (
  run: HarnessRun,
  events: readonly RuntimeEvent[],
): RuntimeSessionRef | undefined => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const runtime = events[index]?.runtime;
    if (runtime !== undefined) {
      return runtime;
    }
  }

  return run.runtime;
};

const isFailedRuntimeEvent = (event: RuntimeEvent): boolean =>
  event.type === "run.failed" ||
  event.type === "adapter.error" ||
  (event.payload.kind === "run_status" && event.payload.status === "failed");

const getRuntimeEventErrorMessage = (event: RuntimeEvent): string => {
  if (event.payload.kind === "adapter_error") {
    return event.payload.message;
  }

  if (event.payload.kind === "run_status" && event.payload.message) {
    return event.payload.message;
  }

  return event.type;
};

const completeHarnessRun = (
  store: HarnessRunStore,
  run: HarnessRun,
  events: readonly RuntimeEvent[],
  completedAt: UnixMs,
): HarnessRun => {
  const failedEvent = events.find(isFailedRuntimeEvent);
  const runtime = selectFinalRuntime(run, events);
  const summary = selectLastAdapterOutputText(events);

  return store.updateRunStatus({
    id: run.id,
    status: failedEvent === undefined ? "succeeded" : "failed",
    updatedAt: completedAt,
    completedAt,
    ...(runtime === undefined ? {} : { runtime }),
    ...(summary === undefined ? {} : { summary }),
    ...(failedEvent === undefined ? {} : { error: getRuntimeEventErrorMessage(failedEvent) }),
  });
};

export const startHarnessRun = async ({
  container,
  adapter,
  roomId,
  targetMemberId,
  triggerMessageId,
  runtime,
  docIds,
  now,
}: StartHarnessRunInput): Promise<StartHarnessRunResult> => {
  const room = container.roomStore.getRoom(roomId);
  if (!room) {
    throw new Error("room not found");
  }

  const members = container.roomStore.listMembers(roomId);
  const targetMember = members.find((member) => member.id === targetMemberId);
  if (!targetMember) {
    throw new Error("target member not found");
  }

  if (targetMember.kind !== "agent") {
    throw new Error("target member must be an agent");
  }

  const messages = container.messageStore.listMessages(roomId);
  const docs = readDocs(container, roomId, docIds);
  const docComments = docs.flatMap((doc) => container.docStore.listComments(doc.id));
  const createdAt = readNow(now);
  const projection = createHarnessProjection({
    request: {
      roomId,
      memberId: targetMember.id,
      participantId: targetMember.participantId,
      trigger: { type: triggerMessageId === undefined ? "manual" : "member_mentioned" },
    },
    room,
    viewer: targetMember,
    members,
    messages,
    docs,
    docComments,
  });
  ensureRuntimeSession(container.harnessRunStore, runtime);
  const run = container.harnessRunStore.createRun({
    id: createRunId(),
    roomId,
    targetMemberId,
    status: "running",
    ...(runtime === undefined ? {} : { runtime }),
    createdAt,
    updatedAt: createdAt,
    startedAt: createdAt,
    ...(triggerMessageId === undefined ? {} : { triggerMessageId }),
    ...(docIds === undefined ? {} : { docIds }),
  });
  const snapshot = container.contextSnapshotStore.createSnapshot(
    createContextSnapshot({ run, projection, createdAt }),
  );
  const events: RuntimeEvent[] = [];

  try {
    const runtimeRun = await adapter.startRun({ run, projection });
    const iterator = runtimeRun.events[Symbol.asyncIterator]();

    while (true) {
      let next: IteratorResult<RuntimeEvent>;
      try {
        next = await iterator.next();
      } catch (error) {
        const failedEvent = createFailedRuntimeEvent(run, events.length + 1, readNow(now), error);
        events.push(appendRuntimeEvent(container.harnessRunStore, failedEvent));
        break;
      }

      if (next.done === true) {
        break;
      }

      assertRuntimeEventMatchesRun(run, next.value);
      events.push(appendRuntimeEvent(container.harnessRunStore, next.value));
    }
  } catch (error) {
    const failedEvent = createFailedRuntimeEvent(run, events.length + 1, readNow(now), error);
    events.push(appendRuntimeEvent(container.harnessRunStore, failedEvent));
  }

  const finalRun = completeHarnessRun(container.harnessRunStore, run, events, readNow(now));

  return { run: finalRun, snapshot, events };
};
