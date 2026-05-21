import {
  harnessContextSnapshotId,
  harnessRunId,
  isHarnessContextSnapshotId,
  isHarnessRunId,
  type Doc,
  type DocComment,
  type DocRevision,
  type HarnessContextSnapshot,
  type HarnessRun,
  type Room,
  type RoomMember,
  type RoomMessage,
  type RuntimeEvent,
} from "@linka/shared";
import { Hono } from "hono";

import { errorResponse } from "./errors.js";
import type { DaemonContainer } from "../container/index.js";

const TRAJECTORY_JSONL_FORMAT = "linka-trajectory-jsonl";
const TRAJECTORY_EXPORT_VERSION = "linka-trajectory-jsonl.v1";
const ROOM_MESSAGE_PAGE_SIZE = 500;

interface DocumentExportRecord {
  readonly doc: Doc;
  readonly revisions: readonly DocRevision[];
  readonly comments: readonly DocComment[];
}

interface OutputMessageLabelRecord {
  readonly messageId: RoomMessage["id"];
  readonly includeInTraining?: boolean;
  readonly lossMask?: NonNullable<RoomMessage["exportMeta"]>["lossMask"];
  readonly evalLabels?: NonNullable<RoomMessage["exportMeta"]>["evalLabels"];
  readonly tags?: NonNullable<RoomMessage["exportMeta"]>["tags"];
  readonly redactionState?: NonNullable<RoomMessage["exportMeta"]>["redactionState"];
}

interface TrajectoryExportRecord {
  readonly room: Room;
  readonly agent: RoomMember;
  readonly projection: unknown;
  readonly messages: readonly RoomMessage[];
  readonly documents: readonly DocumentExportRecord[];
  readonly runtimeEvents: readonly RuntimeEvent[];
  readonly outputMessages: readonly RoomMessage[];
  readonly labels: {
    readonly runStatus: HarnessRun["status"];
    readonly outputMessageCount: number;
    readonly outputMessages: readonly OutputMessageLabelRecord[];
  };
  readonly metadata: {
    readonly version: typeof TRAJECTORY_EXPORT_VERSION;
    readonly format: typeof TRAJECTORY_JSONL_FORMAT;
    readonly runId: HarnessRun["id"];
    readonly roomId: Room["id"];
    readonly agentMemberId: RoomMember["id"];
    readonly snapshotId: HarnessContextSnapshot["id"];
    readonly projectionVersion: number;
    readonly redactionState: HarnessContextSnapshot["redactionState"];
    readonly exportedAt: HarnessContextSnapshot["createdAt"];
  };
}

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

const parseRunPathId = (value: string): HarnessRun["id"] => {
  if (!isHarnessRunId(value)) {
    throw new BadRequestError("runId must be a valid harness run id");
  }

  return harnessRunId(value);
};

const parseFormat = (value: string | undefined): typeof TRAJECTORY_JSONL_FORMAT => {
  if (value !== TRAJECTORY_JSONL_FORMAT) {
    throw new BadRequestError(`format must be ${TRAJECTORY_JSONL_FORMAT}`);
  }

  return TRAJECTORY_JSONL_FORMAT;
};

const ensureRun = (container: DaemonContainer, id: HarnessRun["id"]): HarnessRun => {
  const run = container.harnessRunStore.getRun(id);
  if (!run) {
    throw new NotFoundError("harness run not found");
  }

  return run;
};

const ensureRoom = (container: DaemonContainer, id: Room["id"]): Room => {
  const room = container.roomStore.getRoom(id);
  if (!room) {
    throw new NotFoundError("room not found");
  }

  return room;
};

const ensureAgent = (members: readonly RoomMember[], id: RoomMember["id"]): RoomMember => {
  const agent = members.find((member) => member.id === id);
  if (!agent) {
    throw new NotFoundError("agent member not found");
  }

  return agent;
};

const listAllRoomMessages = (
  messageStore: DaemonContainer["messageStore"],
  roomId: Room["id"],
): readonly RoomMessage[] => {
  const messages: RoomMessage[] = [];
  let afterSequence = 0;

  while (true) {
    const page = messageStore.listMessages(roomId, {
      afterSequence,
      limit: ROOM_MESSAGE_PAGE_SIZE,
    });
    messages.push(...page);

    if (page.length < ROOM_MESSAGE_PAGE_SIZE) {
      return messages;
    }

    afterSequence = page[page.length - 1]?.sequence ?? afterSequence;
  }
};

const selectSnapshotIdFromOutputTrace = (
  run: HarnessRun,
  messages: readonly RoomMessage[],
): HarnessContextSnapshot["id"] | undefined => {
  const traced = messages.find(
    (message) =>
      message.trace?.harnessRunId === run.id && message.trace.projectionSnapshotId !== undefined,
  );

  if (traced?.trace?.projectionSnapshotId === undefined) {
    return undefined;
  }

  if (!isHarnessContextSnapshotId(traced.trace.projectionSnapshotId)) {
    throw new NotFoundError("context snapshot not found");
  }

  return harnessContextSnapshotId(traced.trace.projectionSnapshotId);
};

const assertSnapshotMatchesRun = (snapshot: HarnessContextSnapshot, run: HarnessRun): void => {
  if (
    snapshot.roomId !== run.roomId ||
    snapshot.agentMemberId !== run.targetMemberId ||
    (snapshot.harnessRunId !== undefined && snapshot.harnessRunId !== run.id)
  ) {
    throw new NotFoundError("context snapshot not found");
  }
};

const selectSnapshot = (
  container: DaemonContainer,
  run: HarnessRun,
  messages: readonly RoomMessage[],
): HarnessContextSnapshot => {
  const tracedSnapshotId = selectSnapshotIdFromOutputTrace(run, messages);
  if (tracedSnapshotId !== undefined) {
    const tracedSnapshot = container.contextSnapshotStore.getSnapshot(tracedSnapshotId);
    if (!tracedSnapshot) {
      throw new NotFoundError("context snapshot not found");
    }

    assertSnapshotMatchesRun(tracedSnapshot, run);
    return tracedSnapshot;
  }

  const snapshot = container.contextSnapshotStore
    .listSnapshotsByRoom(run.roomId)
    .find((candidate) => candidate.harnessRunId === run.id);

  if (!snapshot) {
    throw new NotFoundError("context snapshot not found");
  }

  assertSnapshotMatchesRun(snapshot, run);
  return snapshot;
};

const parseProjection = (snapshot: HarnessContextSnapshot): unknown =>
  JSON.parse(snapshot.projectionJson) as unknown;

const isOutputMessage = (
  run: HarnessRun,
  snapshot: HarnessContextSnapshot,
  message: RoomMessage,
): boolean =>
  message.trace?.harnessRunId === run.id || message.trace?.projectionSnapshotId === snapshot.id;

const selectOutputMessages = (
  run: HarnessRun,
  snapshot: HarnessContextSnapshot,
  messages: readonly RoomMessage[],
): readonly RoomMessage[] => messages.filter((message) => isOutputMessage(run, snapshot, message));

const listDocuments = (
  docStore: DaemonContainer["docStore"],
  roomId: Room["id"],
): readonly DocumentExportRecord[] =>
  docStore.listDocsByRoom(roomId).map((doc) => ({
    doc,
    revisions: docStore.listRevisions(doc.id),
    comments: docStore.listComments(doc.id),
  }));

const toOutputMessageLabel = (message: RoomMessage): OutputMessageLabelRecord => ({
  messageId: message.id,
  ...(message.exportMeta?.includeInTraining === undefined
    ? {}
    : { includeInTraining: message.exportMeta.includeInTraining }),
  ...(message.exportMeta?.lossMask === undefined ? {} : { lossMask: message.exportMeta.lossMask }),
  ...(message.exportMeta?.evalLabels === undefined
    ? {}
    : { evalLabels: message.exportMeta.evalLabels }),
  ...(message.exportMeta?.tags === undefined ? {} : { tags: message.exportMeta.tags }),
  ...(message.exportMeta?.redactionState === undefined
    ? {}
    : { redactionState: message.exportMeta.redactionState }),
});

const createTrajectoryRecord = (
  container: DaemonContainer,
  run: HarnessRun,
  room: Room,
  agent: RoomMember,
  messages: readonly RoomMessage[],
  snapshot: HarnessContextSnapshot,
): TrajectoryExportRecord => {
  const outputMessages = selectOutputMessages(run, snapshot, messages);

  return {
    room,
    agent,
    projection: parseProjection(snapshot),
    messages,
    documents: listDocuments(container.docStore, room.id),
    runtimeEvents: container.harnessRunStore.listEvents(run.id),
    outputMessages,
    labels: {
      runStatus: run.status,
      outputMessageCount: outputMessages.length,
      outputMessages: outputMessages.map(toOutputMessageLabel),
    },
    metadata: {
      version: TRAJECTORY_EXPORT_VERSION,
      format: TRAJECTORY_JSONL_FORMAT,
      runId: run.id,
      roomId: room.id,
      agentMemberId: agent.id,
      snapshotId: snapshot.id,
      projectionVersion: snapshot.projectionVersion,
      redactionState: snapshot.redactionState,
      exportedAt: snapshot.createdAt,
    },
  };
};

const toJsonlResponse = (record: TrajectoryExportRecord): Response =>
  new Response(`${JSON.stringify(record)}\n`, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });

const handleRouteError = (c: Parameters<typeof errorResponse>[0], error: unknown): Response => {
  if (error instanceof BadRequestError) {
    return errorResponse(c, 400, "BAD_REQUEST", error.message);
  }

  if (error instanceof NotFoundError) {
    return errorResponse(c, 404, "NOT_FOUND", error.message);
  }

  throw error;
};

export function createHarnessExportsRoute(container: DaemonContainer): Hono {
  const app = new Hono();

  app.get("/harness-runs/:runId/export", (c) => {
    try {
      parseFormat(c.req.query("format"));
      const run = ensureRun(container, parseRunPathId(c.req.param("runId")));
      const room = ensureRoom(container, run.roomId);
      const members = container.roomStore.listMembers(room.id);
      const agent = ensureAgent(members, run.targetMemberId);
      const messages = listAllRoomMessages(container.messageStore, room.id);
      const snapshot = selectSnapshot(container, run, messages);
      const record = createTrajectoryRecord(container, run, room, agent, messages, snapshot);

      return toJsonlResponse(record);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
