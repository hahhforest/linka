import assert from "node:assert/strict";

import {
  docId,
  docRevisionId,
  harnessContextSnapshotId,
  harnessRunId,
  harnessSessionId,
  harnessTriggerId,
  harnessTurnId,
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  type AgentParticipationPolicy,
  type Doc,
  type DocRevision,
  type HarnessContextSnapshot,
  type HarnessRun,
  type HarnessTrigger,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  type RoomPermissions,
  unixMs,
} from "@linka/shared";

import { openDatabase, type DatabaseHandle } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { createDocStore } from "./doc-store.js";
import { DaemonDatabaseError } from "./event-store.js";
import { createHarnessRunStore } from "./harness-run-store.js";
import { createHarnessSessionStore } from "./harness-session-store.js";
import { createMessageStore } from "./message-store.js";
import { createRoomStore } from "./room-store.js";
import { createContextSnapshotStore, type ContextSnapshotStore } from "./context-snapshot-store.js";

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
const policy: AgentParticipationPolicy = {
  triggerMode: "mention_only",
  maxConcurrentTurns: 1,
  allowAutonomousContinue: false,
  visibleContext: "room",
};

interface ContextSnapshotStoreContext {
  readonly handle: DatabaseHandle;
  readonly store: ContextSnapshotStore;
  readonly room: Room;
  readonly owner: RoomMember;
  readonly agent: RoomMember;
  readonly messageId: ReturnType<typeof roomMessageId>;
  readonly revision: DocRevision;
  readonly trigger: HarnessTrigger;
  readonly run: HarnessRun;
}

const makeMember = (
  suffix: string,
  kind: RoomMember["kind"],
  role: RoomMember["role"],
): RoomMember => ({
  id: roomMemberId(`rmem_hctx_${suffix}`),
  roomId: roomId("room_hctx"),
  participantId: participantId(`part_hctx_${suffix}`),
  kind,
  role,
  status: "active",
  displayName: suffix,
  joinedAt: unixMs(1_716_000_000_100),
  permissions: allPermissions,
  notificationPolicy,
});

const makeDoc = (owner: RoomMember): Doc => ({
  id: docId("doc_hctx_brief"),
  contextRoomId: owner.roomId,
  title: "Context brief",
  format: "markdown",
  status: "active",
  body: "# Brief\n\nSnapshot source doc.",
  createdAt: now,
  updatedAt: now,
  createdByMemberId: owner.id,
  visibility: roomVisibility,
});

const makeRevision = (doc: Doc, owner: RoomMember): DocRevision => ({
  id: docRevisionId("drev_hctx_brief_1"),
  docId: doc.id,
  contextRoomId: doc.contextRoomId,
  revisionNumber: 1,
  format: "markdown",
  status: "committed",
  body: doc.body,
  title: doc.title,
  createdAt: unixMs(1_716_000_000_130),
  createdByMemberId: owner.id,
  summary: "initial brief",
});

const withContextSnapshotStore = (run: (context: ContextSnapshotStoreContext) => void): void => {
  const handle = openDatabase({ databasePath: ":memory:" });

  try {
    runMigrations(handle);

    const rooms = createRoomStore(handle);
    const messages = createMessageStore(handle);
    const docs = createDocStore(handle);
    const harnessSessions = createHarnessSessionStore(handle);
    const harnessRuns = createHarnessRunStore(handle);
    const store = createContextSnapshotStore(handle);
    const room: Room = {
      id: roomId("room_hctx"),
      displayName: "Context Snapshot Room",
      topic: "snapshot store test",
      createdAt: now,
      updatedAt: now,
      defaultVisibility: roomVisibility,
      notificationPolicy,
      permissionPolicy,
    };
    rooms.createRoom(room);

    const owner = rooms.addMember(makeMember("owner", "human", "owner"));
    const agent = rooms.addMember(makeMember("agent", "agent", "member"));
    const message = messages.appendMessage({
      id: roomMessageId("rmsg_hctx_source"),
      roomId: room.id,
      sender: { kind: "member", memberId: owner.id },
      kind: "text",
      createdAt: unixMs(1_716_000_000_120),
      text: "@agent please build context",
      mentions: [{ memberId: agent.id, displayText: "@agent" }],
      visibility: roomVisibility,
      notification: notificationPolicy,
    });
    const doc = docs.createDoc(makeDoc(owner));
    const revision = docs.createRevision(makeRevision(doc, owner));
    const session = harnessSessions.createSession({
      id: harnessSessionId("hsess_hctx_primary"),
      roomId: room.id,
      agentMemberId: agent.id,
      status: "idle",
      policy,
      createdAt: unixMs(1_716_000_000_140),
      updatedAt: unixMs(1_716_000_000_140),
    });
    const trigger = harnessSessions.createTrigger({
      id: harnessTriggerId("htrig_hctx_primary"),
      sessionId: session.id,
      roomId: room.id,
      agentMemberId: agent.id,
      kind: "member_mentioned",
      status: "pending",
      createdAt: unixMs(1_716_000_000_150),
      updatedAt: unixMs(1_716_000_000_150),
      sourceMessageId: message.id,
      attemptCount: 0,
      payload: { reason: "mention" },
    });
    const runRecord = harnessRuns.createRun({
      id: harnessRunId("hrun_hctx_primary"),
      roomId: room.id,
      targetMemberId: agent.id,
      status: "queued",
      createdAt: unixMs(1_716_000_000_160),
      updatedAt: unixMs(1_716_000_000_160),
    });

    run({
      handle,
      store,
      room,
      owner,
      agent,
      messageId: message.id,
      revision,
      trigger,
      run: runRecord,
    });
  } finally {
    handle.close();
  }
};

const withoutMigrations = openDatabase({ databasePath: ":memory:" });
try {
  assert.throws(
    () => createContextSnapshotStore(withoutMigrations),
    (error) =>
      error instanceof DaemonDatabaseError &&
      error.message === "runMigrations must be called before createContextSnapshotStore",
  );
} finally {
  withoutMigrations.close();
}

withContextSnapshotStore(({ store, room, agent, messageId, revision, trigger, run }) => {
  const earlySnapshot: HarnessContextSnapshot = {
    id: harnessContextSnapshotId("hctx_early"),
    roomId: room.id,
    agentMemberId: agent.id,
    createdAt: unixMs(1_716_000_000_170),
    projectionVersion: 1,
    projectionJson: JSON.stringify({ messages: [messageId], docs: [revision.id] }),
    sourceMessageIds: [messageId],
    sourceDocRevisionIds: [revision.id],
    redactionState: "raw",
  };
  const fullSnapshot: HarnessContextSnapshot = {
    id: harnessContextSnapshotId("hctx_full"),
    roomId: room.id,
    agentMemberId: agent.id,
    harnessSessionId: harnessSessionId("hsess_hctx_primary"),
    harnessTriggerId: trigger.id,
    harnessTurnId: harnessTurnId("hturn_hctx_dispatch"),
    harnessRunId: run.id,
    createdAt: unixMs(1_716_000_000_180),
    projectionVersion: 2,
    projectionJson: JSON.stringify({ prompt: "projected context", sourceCount: 2 }),
    sourceMessageIds: [messageId],
    sourceDocRevisionIds: [revision.id],
    tokenEstimate: 42,
    redactionState: "redacted",
  };

  assert.deepEqual(store.createSnapshot(fullSnapshot), fullSnapshot);
  assert.deepEqual(store.createSnapshot(earlySnapshot), earlySnapshot);
  assert.deepEqual(store.getSnapshot(fullSnapshot.id), fullSnapshot);
  assert.equal(store.getSnapshot(harnessContextSnapshotId("hctx_missing")), undefined);
  assert.deepEqual(store.listSnapshotsByRoom(room.id), [earlySnapshot, fullSnapshot]);
  assert.deepEqual(store.listSnapshotsByRoom(roomId("room_empty")), []);
  assert.deepEqual(store.listSnapshotsByAgent(agent.id), [earlySnapshot, fullSnapshot]);
  assert.deepEqual(store.listSnapshotsByAgent(roomMemberId("rmem_empty")), []);

  assert.throws(
    () => store.createSnapshot(fullSnapshot),
    /UNIQUE constraint failed: harness_context_snapshots\.harness_context_snapshot_id/,
  );
});

withContextSnapshotStore(({ handle, store, room, agent }) => {
  const insertBadSnapshot = handle.database.prepare(`
    INSERT INTO harness_context_snapshots (
      harness_context_snapshot_id,
      room_id,
      agent_member_id,
      created_at,
      projection_version,
      projection_json,
      source_message_ids_json,
      source_doc_revision_ids_json,
      redaction_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertBadSnapshot.run(
    "hctx_bad_projection_json",
    room.id,
    agent.id,
    now,
    1,
    "{",
    JSON.stringify([]),
    JSON.stringify([]),
    "raw",
  );
  assert.throws(
    () => store.getSnapshot(harnessContextSnapshotId("hctx_bad_projection_json")),
    /harness context snapshot projection_json in database contains invalid JSON/,
  );

  insertBadSnapshot.run(
    "hctx_bad_source_messages_json",
    room.id,
    agent.id,
    now,
    1,
    JSON.stringify({ ok: true }),
    JSON.stringify({ messageIds: [] }),
    JSON.stringify([]),
    "raw",
  );
  assert.throws(
    () => store.getSnapshot(harnessContextSnapshotId("hctx_bad_source_messages_json")),
    /harness context snapshot source_message_ids_json in database must be a JSON array/,
  );

  insertBadSnapshot.run(
    "hctx_bad_source_doc_revision_id",
    room.id,
    agent.id,
    now,
    1,
    JSON.stringify({ ok: true }),
    JSON.stringify([]),
    JSON.stringify(["doc_not_revision"]),
    "raw",
  );
  assert.throws(
    () => store.getSnapshot(harnessContextSnapshotId("hctx_bad_source_doc_revision_id")),
    /Invalid harness context snapshot source doc revision id in database: doc_not_revision/,
  );

  insertBadSnapshot.run(
    "hctx_bad_redaction_state",
    room.id,
    agent.id,
    now,
    1,
    JSON.stringify({ ok: true }),
    JSON.stringify([]),
    JSON.stringify([]),
    "excluded",
  );
  assert.throws(
    () => store.getSnapshot(harnessContextSnapshotId("hctx_bad_redaction_state")),
    /Invalid harness context snapshot redaction state in database: excluded/,
  );
});

console.log("context snapshot store: ok");
