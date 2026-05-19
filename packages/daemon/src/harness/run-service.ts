import type { RuntimeAdapter } from "@linka/harness";
import {
  harnessRunId,
  runtimeEventId,
  unixMs,
  type Doc,
  type DocId,
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
    "roomStore" | "messageStore" | "docStore" | "harnessRunStore"
  >;
  readonly adapter: RuntimeAdapter;
  readonly roomId: Room["id"];
  readonly targetMemberId: RoomMember["id"];
  readonly triggerMessageId?: RoomMessage["id"];
  readonly docIds?: readonly DocId[];
  readonly now?: () => Date | number;
}

export interface StartHarnessRunResult {
  readonly run: HarnessRun;
  readonly events: readonly RuntimeEvent[];
}

const createRunId = (): HarnessRun["id"] => harnessRunId(`hrun_${crypto.randomUUID()}`);
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

export const startHarnessRun = async ({
  container,
  adapter,
  roomId,
  targetMemberId,
  triggerMessageId,
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
  const run = container.harnessRunStore.createRun({
    id: createRunId(),
    roomId,
    targetMemberId,
    status: "running",
    createdAt,
    updatedAt: createdAt,
    startedAt: createdAt,
    ...(triggerMessageId === undefined ? {} : { triggerMessageId }),
    ...(docIds === undefined ? {} : { docIds }),
  });
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

  return { run, events };
};
