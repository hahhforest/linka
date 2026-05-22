import assert from "node:assert/strict";

import type { RuntimeAdapter } from "@linka/harness";
import {
  docCommentId,
  harnessSessionId,
  harnessTriggerId,
  harnessRunId,
  docRevisionId,
  docId,
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  runtimeEventId,
  runtimeSessionId,
  type Doc,
  type DocComment,
  type DocRevision,
  type HarnessProjection,
  type HarnessRun,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  type RoomMessage,
  type RoomPermissions,
  type RuntimeAdapterCapabilities,
  type RuntimeEvent,
  type RuntimeSessionRef,
  unixMs,
} from "@linka/shared";

import { openDatabase, type DatabaseHandle } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { createDocStore } from "../store/doc-store.js";
import { createContextSnapshotStore } from "../store/context-snapshot-store.js";
import { createHarnessRunStore } from "../store/harness-run-store.js";
import {
  createHarnessSessionStore,
  type HarnessSessionStore,
} from "../store/harness-session-store.js";
import { createMessageStore } from "../store/message-store.js";
import { createRoomStore } from "../store/room-store.js";
import { startHarnessRun, type StartHarnessRunInput } from "./run-service.js";

const allPermissions: RoomPermissions = {
  canReadHistory: true,
  canPostMessage: true,
  canMentionMembers: true,
  canUploadFiles: true,
  canManageMembers: true,
};

const permissionPolicy: PermissionPolicy = {
  owner: allPermissions,
  admin: allPermissions,
  member: allPermissions,
  guest: {
    ...allPermissions,
    canManageMembers: false,
  },
};

const notificationPolicy = { level: "normal" as const };
const roomVisibility = { scope: "room" as const };
const now = unixMs(1_716_000_000_000);

const capabilities: RuntimeAdapterCapabilities = {
  kind: "test",
  supportsInteractiveSession: false,
  supportsStreamingEvents: true,
  supportsDocContext: true,
  supportsCancellation: false,
};

interface RunServiceContext {
  readonly handle: DatabaseHandle;
  readonly container: StartHarnessRunInput["container"];
  readonly harnessSessionStore: HarnessSessionStore;
  readonly room: Room;
  readonly human: RoomMember;
  readonly agent: RoomMember;
  readonly message: RoomMessage;
  readonly doc: Doc;
  readonly revision: DocRevision;
  readonly comment: DocComment;
}

const makeRoom = (): Room => ({
  id: roomId("room_run_service"),
  displayName: "Harness Run Service Room",
  topic: "run service test",
  createdAt: now,
  updatedAt: now,
  defaultVisibility: roomVisibility,
  notificationPolicy,
  permissionPolicy,
});

const makeMember = (
  suffix: string,
  kind: RoomMember["kind"],
  role: RoomMember["role"],
): RoomMember => ({
  id: roomMemberId(`rmem_service_${suffix}`),
  roomId: roomId("room_run_service"),
  participantId: participantId(`part_service_${suffix}`),
  kind,
  role,
  status: "active",
  displayName: suffix,
  joinedAt: now,
  permissions: permissionPolicy[role],
  notificationPolicy,
});

const makeDoc = (owner: RoomMember): Doc => ({
  id: docId("doc_service_brief"),
  contextRoomId: owner.roomId,
  title: "Service brief",
  format: "markdown",
  status: "active",
  body: "# Service brief\n\nContext for the injected runtime.",
  createdAt: now,
  updatedAt: now,
  createdByMemberId: owner.id,
  visibility: roomVisibility,
});

const makeRevision = (doc: Doc, owner: RoomMember): DocRevision => ({
  id: docRevisionId("drev_service_brief_1"),
  docId: doc.id,
  contextRoomId: doc.contextRoomId,
  revisionNumber: 1,
  format: "markdown",
  status: "committed",
  body: doc.body,
  title: doc.title,
  createdAt: now,
  createdByMemberId: owner.id,
  summary: "initial service brief",
});

const makeComment = (doc: Doc, owner: RoomMember, agent: RoomMember): DocComment => ({
  id: docCommentId("dcmt_service_brief"),
  docId: doc.id,
  contextRoomId: doc.contextRoomId,
  body: "Please consider this context.",
  status: "open",
  createdAt: now,
  updatedAt: now,
  createdByMemberId: owner.id,
  mentions: [{ kind: "member", memberId: agent.id, displayText: "@agent" }],
  visibility: roomVisibility,
});

async function* runtimeEvents(events: readonly RuntimeEvent[]): AsyncIterable<RuntimeEvent> {
  for (const event of events) {
    yield event;
  }
}

const withRunServiceContext = async (
  run: (context: RunServiceContext) => Promise<void> | void,
): Promise<void> => {
  const handle = openDatabase({ databasePath: ":memory:" });

  try {
    runMigrations(handle);

    const roomStore = createRoomStore(handle);
    const messageStore = createMessageStore(handle);
    const docStore = createDocStore(handle);
    const harnessRunStore = createHarnessRunStore(handle);
    const harnessSessionStore = createHarnessSessionStore(handle);
    const contextSnapshotStore = createContextSnapshotStore(handle);
    const container = { roomStore, messageStore, docStore, harnessRunStore, contextSnapshotStore };
    const room = roomStore.createRoom(makeRoom());
    const human = roomStore.addMember(makeMember("human", "human", "owner"));
    const agent = roomStore.addMember(makeMember("agent", "agent", "member"));
    const message = messageStore.appendMessage({
      id: roomMessageId("rmsg_service_trigger"),
      roomId: room.id,
      sender: { kind: "member", memberId: human.id },
      kind: "text",
      createdAt: now,
      text: "@agent please read the service brief",
      mentions: [{ memberId: agent.id, displayText: "@agent" }],
      visibility: roomVisibility,
      notification: notificationPolicy,
    });
    const createdDoc = docStore.createDoc(makeDoc(human));
    const revision = docStore.createRevision(makeRevision(createdDoc, human));
    const doc = docStore.getDoc(createdDoc.id);
    assert.ok(doc);
    const comment = docStore.createComment(makeComment(doc, human, agent));

    await run({
      handle,
      container,
      harnessSessionStore,
      room,
      human,
      agent,
      message,
      doc,
      revision,
      comment,
    });
  } finally {
    handle.close();
  }
};

await withRunServiceContext(
  async ({ container, harnessSessionStore, room, agent, message, doc, revision, comment }) => {
    let receivedRun: HarnessRun | undefined;
    let receivedProjection: HarnessProjection | undefined;
    let snapshotSeenBeforeAdapter = false;
    const sessionId = harnessSessionId("hsess_run_service_provenance");
    const triggerId = harnessTriggerId("htrig_run_service_provenance");
    harnessSessionStore.createSession({
      id: sessionId,
      roomId: room.id,
      agentMemberId: agent.id,
      status: "running",
      policy: {
        triggerMode: "mention_only",
        maxConcurrentTurns: 1,
        allowAutonomousContinue: false,
        visibleContext: "room",
      },
      createdAt: now,
      updatedAt: now,
    });
    harnessSessionStore.createTrigger({
      id: triggerId,
      sessionId,
      roomId: room.id,
      agentMemberId: agent.id,
      kind: "member_mentioned",
      status: "dispatched",
      createdAt: now,
      updatedAt: now,
      sourceMessageId: message.id,
      attemptCount: 1,
    });
    const runtime: RuntimeSessionRef = {
      id: runtimeSessionId("rsess_run_service_fake"),
      kind: "test",
      adapterSessionId: "fake-adapter-session",
      label: "Fake Runtime",
    };
    const adapter = {
      getCapabilities: () => capabilities,
      startRun: async (input) => {
        receivedRun = input.run;
        receivedProjection = input.projection;
        const snapshots = container.contextSnapshotStore.listSnapshotsByRoom(input.run.roomId);
        assert.equal(snapshots.length, 1);
        const snapshot = snapshots[0];
        assert.ok(snapshot);
        snapshotSeenBeforeAdapter = true;
        assert.equal(snapshot.roomId, room.id);
        assert.equal(snapshot.agentMemberId, agent.id);
        assert.equal(snapshot.harnessSessionId, sessionId);
        assert.equal(snapshot.harnessTriggerId, triggerId);
        assert.equal(snapshot.harnessRunId, input.run.id);
        assert.equal(snapshot.createdAt, now);
        assert.equal(snapshot.projectionVersion, 1);
        assert.equal(snapshot.projectionJson, JSON.stringify(input.projection));
        assert.deepEqual(snapshot.sourceMessageIds, [message.id]);
        assert.deepEqual(snapshot.sourceDocRevisionIds, [revision.id]);
        assert.equal(snapshot.redactionState, "raw");

        return {
          events: runtimeEvents([
            {
              id: runtimeEventId("rtevt_service_started"),
              runId: input.run.id,
              roomId: input.run.roomId,
              targetMemberId: input.run.targetMemberId,
              sequence: 1,
              type: "run.started",
              createdAt: now,
              runtime,
              payload: { kind: "run_status", status: "running", message: "started" },
            },
            {
              id: runtimeEventId("rtevt_service_output"),
              runId: input.run.id,
              roomId: input.run.roomId,
              targetMemberId: input.run.targetMemberId,
              sequence: 2,
              type: "adapter.output",
              createdAt: now,
              runtime,
              payload: {
                kind: "adapter_output",
                stream: "summary",
                text: "read docs and room context",
              },
            },
          ]),
        };
      },
    } satisfies RuntimeAdapter;

    const result = await startHarnessRun({
      container,
      adapter,
      roomId: room.id,
      targetMemberId: agent.id,
      triggerMessageId: message.id,
      harnessSessionId: sessionId,
      harnessTriggerId: triggerId,
      docIds: [doc.id],
      now: () => now,
    });

    assert.match(result.run.id, /^hrun_/);
    assert.equal(result.run.roomId, room.id);
    assert.equal(result.run.targetMemberId, agent.id);
    assert.equal(result.run.status, "succeeded");
    assert.equal(result.run.createdAt, now);
    assert.equal(result.run.updatedAt, now);
    assert.equal(result.run.startedAt, now);
    assert.equal(result.run.completedAt, now);
    assert.equal(result.run.triggerMessageId, message.id);
    assert.deepEqual(result.run.docIds, [doc.id]);
    assert.deepEqual(result.run.runtime, runtime);
    assert.equal(result.run.summary, "read docs and room context");
    assert.deepEqual(container.harnessRunStore.getRun(result.run.id), result.run);
    assert.equal(snapshotSeenBeforeAdapter, true);
    assert.equal(result.snapshot.roomId, room.id);
    assert.equal(result.snapshot.agentMemberId, agent.id);
    assert.equal(result.snapshot.harnessSessionId, sessionId);
    assert.equal(result.snapshot.harnessTriggerId, triggerId);
    assert.equal(result.snapshot.harnessRunId, result.run.id);
    assert.equal(result.snapshot.projectionJson, JSON.stringify(receivedProjection));
    assert.deepEqual(result.snapshot.sourceMessageIds, [message.id]);
    assert.deepEqual(result.snapshot.sourceDocRevisionIds, [revision.id]);
    assert.deepEqual(
      container.contextSnapshotStore.getSnapshot(result.snapshot.id),
      result.snapshot,
    );

    assert.equal(receivedRun?.id, result.run.id);
    assert.equal(receivedRun?.status, "running");
    assert.equal(receivedProjection?.request.trigger.type, "member_mentioned");
    assert.deepEqual(
      receivedProjection?.messages.map((projectedMessage) => projectedMessage.id),
      [message.id],
    );
    assert.deepEqual(receivedProjection?.docs, [doc]);
    assert.deepEqual(receivedProjection?.docComments, [comment]);

    assert.deepEqual(
      result.events.map((event) => event.type),
      ["run.started", "adapter.output"],
    );
    assert.deepEqual(container.harnessRunStore.listEvents(result.run.id), result.events);
    assert.deepEqual(container.harnessRunStore.getRuntimeSession(runtime.id), runtime);
  },
);

await withRunServiceContext(async ({ container, room, agent, message }) => {
  const existingRuntime: RuntimeSessionRef = {
    id: runtimeSessionId("rsess_run_service_existing"),
    kind: "test",
    adapterSessionId: "existing-adapter-session",
    label: "Existing Runtime",
  };
  let receivedRun: HarnessRun | undefined;
  const adapter = {
    getCapabilities: () => capabilities,
    startRun: async (input) => {
      receivedRun = input.run;
      return {
        events: runtimeEvents([
          {
            id: runtimeEventId("rtevt_service_existing_runtime"),
            runId: input.run.id,
            roomId: input.run.roomId,
            targetMemberId: input.run.targetMemberId,
            sequence: 1,
            type: "run.started",
            createdAt: now,
            runtime: existingRuntime,
            payload: { kind: "run_status", status: "running", message: "started" },
          },
        ]),
      };
    },
  } satisfies RuntimeAdapter;

  const result = await startHarnessRun({
    container,
    adapter,
    roomId: room.id,
    targetMemberId: agent.id,
    triggerMessageId: message.id,
    runtime: existingRuntime,
    now: () => now,
  });

  assert.deepEqual(receivedRun?.runtime, existingRuntime);
  assert.deepEqual(result.run.runtime, existingRuntime);
  assert.deepEqual(
    container.harnessRunStore.getRuntimeSession(existingRuntime.id),
    existingRuntime,
  );
});
await withRunServiceContext(async ({ container, room, human }) => {
  const adapter = {
    getCapabilities: () => capabilities,
    startRun: async () => {
      throw new Error("adapter should not be called");
    },
  } satisfies RuntimeAdapter;

  await assert.rejects(
    () => startHarnessRun({ container, adapter, roomId: room.id, targetMemberId: human.id }),
    /target member must be an agent/,
  );
  await assert.rejects(
    () =>
      startHarnessRun({
        container,
        adapter,
        roomId: roomId("room_missing"),
        targetMemberId: human.id,
      }),
    /room not found/,
  );
  await assert.rejects(
    () =>
      startHarnessRun({
        container,
        adapter,
        roomId: room.id,
        targetMemberId: roomMemberId("rmem_missing"),
      }),
    /target member not found/,
  );
  assert.deepEqual(container.harnessRunStore.listRunsByRoom(room.id), []);
});

await withRunServiceContext(async ({ container, room, agent }) => {
  const adapter = {
    getCapabilities: () => capabilities,
    startRun: async (input) => ({
      events: runtimeEvents([
        {
          id: runtimeEventId("rtevt_service_wrong_run"),
          runId: harnessRunId("hrun_wrong_run"),
          roomId: input.run.roomId,
          targetMemberId: input.run.targetMemberId,
          sequence: 1,
          type: "run.started",
          createdAt: now,
          payload: { kind: "run_status", status: "running" },
        },
      ]),
    }),
  } satisfies RuntimeAdapter;

  const result = await startHarnessRun({
    container,
    adapter,
    roomId: room.id,
    targetMemberId: agent.id,
    now: () => now,
  });

  assert.equal(result.run.status, "failed");
  assert.equal(result.run.completedAt, now);
  assert.equal(result.run.error, "runtime event run mismatch");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.type, "run.failed");
  assert.deepEqual(container.harnessRunStore.getRun(result.run.id), result.run);
  assert.deepEqual(container.harnessRunStore.listEvents(result.run.id), result.events);
});

await withRunServiceContext(async ({ container, room, agent }) => {
  const adapter = {
    getCapabilities: () => capabilities,
    startRun: async (input) => ({
      events: runtimeEvents([
        {
          id: runtimeEventId("rtevt_service_error_started"),
          runId: input.run.id,
          roomId: input.run.roomId,
          targetMemberId: input.run.targetMemberId,
          sequence: 1,
          type: "run.started",
          createdAt: now,
          payload: { kind: "run_status", status: "running" },
        },
        {
          id: runtimeEventId("rtevt_service_adapter_error"),
          runId: input.run.id,
          roomId: input.run.roomId,
          targetMemberId: input.run.targetMemberId,
          sequence: 2,
          type: "adapter.error",
          createdAt: now,
          payload: { kind: "adapter_error", message: "adapter reported failure" },
        },
      ]),
    }),
  } satisfies RuntimeAdapter;

  const result = await startHarnessRun({
    container,
    adapter,
    roomId: room.id,
    targetMemberId: agent.id,
    now: () => now,
  });

  assert.equal(result.run.status, "failed");
  assert.equal(result.run.completedAt, now);
  assert.equal(result.run.error, "adapter reported failure");
  assert.deepEqual(
    result.events.map((event) => event.type),
    ["run.started", "adapter.error"],
  );
  assert.deepEqual(container.harnessRunStore.getRun(result.run.id), result.run);
  assert.deepEqual(container.harnessRunStore.listEvents(result.run.id), result.events);
});

await withRunServiceContext(async ({ container, room, agent }) => {
  const adapter = {
    getCapabilities: () => capabilities,
    startRun: async () => {
      throw new Error("runtime unavailable");
    },
  } satisfies RuntimeAdapter;

  const result = await startHarnessRun({
    container,
    adapter,
    roomId: room.id,
    targetMemberId: agent.id,
    now: () => now,
  });

  assert.equal(result.run.status, "failed");
  assert.equal(result.run.completedAt, now);
  assert.equal(result.run.error, "runtime unavailable");
  assert.deepEqual(container.harnessRunStore.getRun(result.run.id), result.run);
  assert.equal(result.events.length, 1);

  const failedEvent = result.events[0];
  assert.ok(failedEvent);
  assert.match(failedEvent.id, /^rtevt_/);
  assert.equal(failedEvent.runId, result.run.id);
  assert.equal(failedEvent.sequence, 1);
  assert.equal(failedEvent.type, "run.failed");
  assert.equal(failedEvent.createdAt, now);
  assert.deepEqual(failedEvent.payload, {
    kind: "run_status",
    status: "failed",
    message: "runtime unavailable",
    details: { name: "Error" },
  });
  assert.deepEqual(container.harnessRunStore.listEvents(result.run.id), result.events);
});

console.log("harness run service: ok");
