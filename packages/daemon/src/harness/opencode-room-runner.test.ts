import assert from "node:assert/strict";

import type { RuntimeAdapter } from "@linka/harness";
import {
  docCommentId,
  docId,
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  runtimeEventId,
  runtimeSessionId,
  type Doc,
  type DocComment,
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
import { createEventBus } from "../event-bus/index.js";
import { createDocStore } from "../store/doc-store.js";
import { createEventStore, type PersistedDaemonEvent } from "../store/event-store.js";
import { createHarnessRunStore } from "../store/harness-run-store.js";
import { createMessageStore } from "../store/message-store.js";
import { createRoomStore } from "../store/room-store.js";
import {
  createOpenCodeRoomHarnessRunner,
  DEFAULT_OPENCODE_MODEL,
  DEFAULT_OPENCODE_VARIANT,
  type CreateOpenCodeRoomHarnessRunnerOptions,
} from "./opencode-room-runner.js";

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

assert.equal(DEFAULT_OPENCODE_MODEL, "azure/gpt-5.5");
assert.equal(DEFAULT_OPENCODE_VARIANT, "xhigh");

interface OpenCodeRunnerContext {
  readonly handle: DatabaseHandle;
  readonly container: CreateOpenCodeRoomHarnessRunnerOptions["container"];
  readonly room: Room;
  readonly members: readonly RoomMember[];
  readonly human: RoomMember;
  readonly agent: RoomMember;
  readonly message: RoomMessage;
  readonly doc: Doc;
  readonly comment: DocComment;
}

const makeRoom = (): Room => ({
  id: roomId("room_opencode_runner"),
  displayName: "OpenCode Runner Room",
  topic: "runner factory test",
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
  id: roomMemberId(`rmem_opencode_${suffix}`),
  roomId: roomId("room_opencode_runner"),
  participantId: participantId(`part_opencode_${suffix}`),
  kind,
  role,
  status: "active",
  displayName: suffix,
  joinedAt: now,
  permissions: permissionPolicy[role],
  notificationPolicy,
});

const makeDoc = (owner: RoomMember): Doc => ({
  id: docId("doc_opencode_brief"),
  contextRoomId: owner.roomId,
  title: "OpenCode brief",
  format: "markdown",
  status: "active",
  body: "# OpenCode brief\n\nContext passed through the room runner.",
  createdAt: now,
  updatedAt: now,
  createdByMemberId: owner.id,
  visibility: roomVisibility,
});

const makeComment = (doc: Doc, owner: RoomMember, agent: RoomMember): DocComment => ({
  id: docCommentId("dcmt_opencode_brief"),
  docId: doc.id,
  contextRoomId: doc.contextRoomId,
  body: "Use this doc as runner context.",
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

const toJsonValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const withOpenCodeRunnerContext = async (
  run: (context: OpenCodeRunnerContext) => Promise<void> | void,
): Promise<void> => {
  const handle = openDatabase({ databasePath: ":memory:" });

  try {
    runMigrations(handle);

    const eventStore = createEventStore(handle);
    const eventBus = createEventBus();
    const roomStore = createRoomStore(handle);
    const messageStore = createMessageStore(handle);
    const docStore = createDocStore(handle);
    const harnessRunStore = createHarnessRunStore(handle);
    const container = { eventStore, eventBus, roomStore, messageStore, docStore, harnessRunStore };
    const room = roomStore.createRoom(makeRoom());
    const human = roomStore.addMember(makeMember("human", "human", "owner"));
    const agent = roomStore.addMember(makeMember("agent", "agent", "member"));
    const members = roomStore.listMembers(room.id);
    const message = messageStore.appendMessage({
      id: roomMessageId("rmsg_opencode_trigger"),
      roomId: room.id,
      sender: { kind: "member", memberId: human.id },
      kind: "text",
      createdAt: now,
      text: "@agent please read the opencode brief",
      mentions: [{ memberId: agent.id, displayText: "@agent" }],
      visibility: roomVisibility,
      notification: notificationPolicy,
    });
    const doc = docStore.createDoc(makeDoc(human));
    const comment = docStore.createComment(makeComment(doc, human, agent));

    await run({ handle, container, room, members, human, agent, message, doc, comment });
  } finally {
    handle.close();
  }
};

await withOpenCodeRunnerContext(async ({ container, room, members, agent, message, doc, comment }) => {
  let receivedRun: HarnessRun | undefined;
  let receivedProjection: HarnessProjection | undefined;
  const runtime: RuntimeSessionRef = {
    id: runtimeSessionId("rsess_opencode_runner_fake"),
    kind: "test",
    adapterSessionId: "fake-opencode-session",
    label: "Fake OpenCode Runtime",
  };
  const adapter = {
    getCapabilities: () => capabilities,
    startRun: async (input) => {
      receivedRun = input.run;
      receivedProjection = input.projection;

      return {
        events: runtimeEvents([
          {
            id: runtimeEventId("rtevt_opencode_runner_started"),
            runId: input.run.id,
            roomId: input.run.roomId,
            targetMemberId: input.run.targetMemberId,
            sequence: 1,
            type: "run.started",
            createdAt: now,
            runtime,
            payload: { kind: "run_status", status: "running", message: "started" },
          },
        ]),
      };
    },
  } satisfies RuntimeAdapter;

  const runner = createOpenCodeRoomHarnessRunner({ container, adapter, now: () => now });

  await runner({ room, members, message, targetMember: agent });

  const runs = container.harnessRunStore.listRunsByRoom(room.id);
  assert.equal(runs.length, 1);

  const run = runs[0];
  assert.ok(run);
  assert.match(run.id, /^hrun_/);
  assert.equal(run.roomId, room.id);
  assert.equal(run.targetMemberId, agent.id);
  assert.equal(run.status, "succeeded");
  assert.equal(run.createdAt, now);
  assert.equal(run.updatedAt, now);
  assert.equal(run.startedAt, now);
  assert.equal(run.completedAt, now);
  assert.equal(run.triggerMessageId, message.id);
  assert.equal(run.docIds, undefined);
  assert.deepEqual(run.runtime, runtime);

  assert.equal(receivedRun?.id, run.id);
  assert.equal(receivedProjection?.request.roomId, room.id);
  assert.equal(receivedProjection?.request.memberId, agent.id);
  assert.equal(receivedProjection?.request.trigger.type, "member_mentioned");
  assert.deepEqual(
    receivedProjection?.messages.map((projectedMessage) => projectedMessage.id),
    [message.id],
  );
  assert.deepEqual(receivedProjection?.docs, [doc]);
  assert.deepEqual(receivedProjection?.docComments, [comment]);

  const events = container.harnessRunStore.listEvents(run.id);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, runtimeEventId("rtevt_opencode_runner_started"));
  assert.equal(events[0]?.runId, run.id);
  assert.equal(events[0]?.type, "run.started");
  assert.deepEqual(events[0]?.runtime, runtime);
  assert.deepEqual(container.harnessRunStore.getRuntimeSession(runtime.id), runtime);
  assert.deepEqual(
    container.messageStore.listMessages(room.id).map((storedMessage) => storedMessage.id),
    [message.id],
  );
  assert.deepEqual(container.eventStore.listAfter(0, 10), []);
});

await withOpenCodeRunnerContext(async ({ container, room, members, agent, message }) => {
  const runtime: RuntimeSessionRef = {
    id: runtimeSessionId("rsess_opencode_runner_output"),
    kind: "test",
    adapterSessionId: "fake-opencode-output-session",
    label: "Fake OpenCode Output Runtime",
  };
  const adapter = {
    getCapabilities: () => capabilities,
    startRun: async (input) => ({
      events: runtimeEvents([
        {
          id: runtimeEventId("rtevt_opencode_output_started"),
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
          id: runtimeEventId("rtevt_opencode_output_first"),
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
            text: "first output should be replaced",
          },
        },
        {
          id: runtimeEventId("rtevt_opencode_output_wrong_type"),
          runId: input.run.id,
          roomId: input.run.roomId,
          targetMemberId: input.run.targetMemberId,
          sequence: 3,
          type: "run.updated",
          createdAt: now,
          runtime,
          payload: {
            kind: "adapter_output",
            stream: "summary",
            text: "wrong event type should be ignored",
          },
        },
        {
          id: runtimeEventId("rtevt_opencode_output_blank"),
          runId: input.run.id,
          roomId: input.run.roomId,
          targetMemberId: input.run.targetMemberId,
          sequence: 4,
          type: "adapter.output",
          createdAt: now,
          runtime,
          payload: { kind: "adapter_output", stream: "summary", text: "   " },
        },
        {
          id: runtimeEventId("rtevt_opencode_output_final"),
          runId: input.run.id,
          roomId: input.run.roomId,
          targetMemberId: input.run.targetMemberId,
          sequence: 5,
          type: "adapter.output",
          createdAt: now,
          runtime,
          payload: {
            kind: "adapter_output",
            stream: "summary",
            text: "final OpenCode answer",
          },
        },
      ]),
    }),
  } satisfies RuntimeAdapter;
  const publishedEvents: PersistedDaemonEvent[] = [];
  const subscription = container.eventBus.subscribe((event) => {
    publishedEvents.push(event);
  });
  const runner = createOpenCodeRoomHarnessRunner({ container, adapter, now: () => now });

  try {
    await runner({ room, members, message, targetMember: agent });
  } finally {
    subscription.unsubscribe();
  }

  const runs = container.harnessRunStore.listRunsByRoom(room.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]?.status, "succeeded");
  assert.equal(runs[0]?.completedAt, now);
  assert.equal(runs[0]?.summary, "final OpenCode answer");

  const messages = container.messageStore.listMessages(room.id);
  assert.equal(messages.length, 2);

  const reply = messages[1];
  assert.ok(reply);
  assert.match(reply.id, /^rmsg_/);
  assert.equal(reply.roomId, room.id);
  assert.equal(reply.sequence, 2);
  assert.deepEqual(reply.sender, { kind: "member", memberId: agent.id });
  assert.equal(reply.kind, "text");
  assert.equal(reply.createdAt, now);
  assert.equal(reply.text, "final OpenCode answer");
  assert.deepEqual(reply.replyTo, { messageId: message.id });
  assert.deepEqual(reply.visibility, roomVisibility);
  assert.deepEqual(reply.notification, notificationPolicy);

  const storedEvents = container.eventStore.listAfter(0, 10);
  assert.equal(storedEvents.length, 1);

  const messageCreated = storedEvents[0];
  assert.ok(messageCreated);
  assert.match(messageCreated.id, /^evt_/);
  assert.equal(messageCreated.roomId, room.id);
  assert.equal(messageCreated.type, "message.created");
  assert.equal(messageCreated.createdAt, now);
  assert.deepEqual(messageCreated.payload, { message: toJsonValue(reply) });
  assert.deepEqual(publishedEvents, [messageCreated]);
});

console.log("opencode room runner: ok");
