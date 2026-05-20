import assert from "node:assert/strict";

import {
  docId,
  harnessRunId,
  participantId,
  roomId,
  roomMemberId,
  runtimeEventId,
  runtimeSessionId,
  type Doc,
  type HarnessRun,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  type RoomPermissions,
  type RuntimeEvent,
  type RuntimeSessionRef,
  unixMs,
} from "@linka/shared";

import { openDatabase, type DatabaseHandle } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { createDocStore, type DocStore } from "./doc-store.js";
import { DaemonDatabaseError } from "./event-store.js";
import { createHarnessRunStore, type HarnessRunStore } from "./harness-run-store.js";
import { createRoomStore } from "./room-store.js";

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

interface HarnessRunStoreContext {
  readonly handle: DatabaseHandle;
  readonly store: HarnessRunStore;
  readonly docs: DocStore;
  readonly room: Room;
  readonly owner: RoomMember;
  readonly target: RoomMember;
  readonly doc: Doc;
}

const makeMember = (suffix: string, role: RoomMember["role"]): RoomMember => ({
  id: roomMemberId(`rmem_${suffix}`),
  roomId: roomId("room_harness"),
  participantId: participantId(`part_${suffix}`),
  kind: suffix === "agent" ? "agent" : "human",
  role,
  status: "active",
  displayName: suffix,
  joinedAt: unixMs(1_716_000_000_100),
  permissions: allPermissions,
  notificationPolicy,
});

const makeDoc = (owner: RoomMember): Doc => ({
  id: docId("doc_harness_brief"),
  contextRoomId: owner.roomId,
  title: "Harness brief",
  format: "markdown",
  status: "active",
  body: "# Harness brief\n\nContext for a runtime run.",
  createdAt: now,
  updatedAt: now,
  createdByMemberId: owner.id,
  visibility: roomVisibility,
});

const withHarnessRunStore = (run: (context: HarnessRunStoreContext) => void): void => {
  const handle = openDatabase({ databasePath: ":memory:" });

  try {
    runMigrations(handle);

    const rooms = createRoomStore(handle);
    const docs = createDocStore(handle);
    const store = createHarnessRunStore(handle);
    const room: Room = {
      id: roomId("room_harness"),
      displayName: "Harness Room",
      topic: "runtime store test",
      createdAt: now,
      updatedAt: now,
      defaultVisibility: roomVisibility,
      notificationPolicy,
      permissionPolicy,
    };
    rooms.createRoom(room);

    const owner = rooms.addMember(makeMember("owner", "owner"));
    const target = rooms.addMember(makeMember("agent", "member"));
    const doc = docs.createDoc(makeDoc(owner));

    run({ handle, store, docs, room, owner, target, doc });
  } finally {
    handle.close();
  }
};

const withoutMigrations = openDatabase({ databasePath: ":memory:" });
try {
  assert.throws(
    () => createHarnessRunStore(withoutMigrations),
    (error) =>
      error instanceof DaemonDatabaseError &&
      error.message === "runMigrations must be called before createHarnessRunStore",
  );
} finally {
  withoutMigrations.close();
}

withHarnessRunStore(({ store, room, target, doc }) => {
  const runtime: RuntimeSessionRef = {
    id: runtimeSessionId("rsess_alpha"),
    kind: "opencode",
    adapterSessionId: "opencode-session-opaque-alpha",
    label: "OpenCode alpha",
  };

  assert.deepEqual(store.createRuntimeSession(runtime), runtime);
  assert.deepEqual(store.getRuntimeSession(runtime.id), runtime);
  assert.equal(store.getRuntimeSession(runtimeSessionId("rsess_missing")), undefined);

  const queued: HarnessRun = {
    id: harnessRunId("hrun_queued"),
    roomId: room.id,
    targetMemberId: target.id,
    status: "queued",
    createdAt: unixMs(1_716_000_000_200),
    updatedAt: unixMs(1_716_000_000_200),
  };
  const running: HarnessRun = {
    id: harnessRunId("hrun_running"),
    roomId: room.id,
    targetMemberId: target.id,
    status: "running",
    runtime,
    createdAt: unixMs(1_716_000_000_300),
    updatedAt: unixMs(1_716_000_000_400),
    startedAt: unixMs(1_716_000_000_350),
    docIds: [doc.id],
    summary: "runtime started",
  };

  assert.deepEqual(store.createRun(queued), queued);
  assert.deepEqual(store.createRun(running), running);
  assert.deepEqual(store.getRun(queued.id), queued);
  assert.deepEqual(store.getRun(running.id), running);
  assert.equal(store.getRun(harnessRunId("hrun_missing")), undefined);
  assert.deepEqual(store.listRunsByRoom(room.id), [queued, running]);
  assert.deepEqual(store.listRunsByRoom(roomId("room_empty")), []);

  const startedEvent: RuntimeEvent = {
    id: runtimeEventId("rtevt_started"),
    runId: running.id,
    roomId: room.id,
    targetMemberId: target.id,
    sequence: 2,
    type: "run.started",
    createdAt: unixMs(1_716_000_000_500),
    runtime,
    payload: { kind: "run_status", status: "running", message: "started" },
  };
  const outputEvent: RuntimeEvent = {
    id: runtimeEventId("rtevt_output"),
    runId: running.id,
    roomId: room.id,
    targetMemberId: target.id,
    sequence: 1,
    type: "adapter.output",
    createdAt: unixMs(1_716_000_000_450),
    payload: { kind: "adapter_output", stream: "summary", text: "read doc" },
  };

  assert.deepEqual(store.appendEvent(startedEvent), startedEvent);
  assert.deepEqual(store.appendEvent(outputEvent), outputEvent);
  assert.deepEqual(store.listEvents(running.id), [outputEvent, startedEvent]);
  assert.deepEqual(store.listEvents(harnessRunId("hrun_missing")), []);

  const succeededAt = unixMs(1_716_000_000_600);
  const succeeded = store.updateRunStatus({
    id: running.id,
    status: "succeeded",
    updatedAt: succeededAt,
    completedAt: succeededAt,
    runtime,
    summary: "read doc",
  });
  assert.deepEqual(succeeded, {
    ...running,
    status: "succeeded",
    updatedAt: succeededAt,
    completedAt: succeededAt,
    summary: "read doc",
  });
  assert.deepEqual(store.getRun(running.id), succeeded);

  const failedAt = unixMs(1_716_000_000_700);
  const failed = store.updateRunStatus({
    id: queued.id,
    status: "failed",
    updatedAt: failedAt,
    completedAt: failedAt,
    error: "runtime unavailable",
  });
  assert.deepEqual(failed, {
    ...queued,
    status: "failed",
    updatedAt: failedAt,
    completedAt: failedAt,
    error: "runtime unavailable",
  });
  assert.deepEqual(store.getRun(queued.id), failed);
  assert.throws(
    () =>
      store.updateRunStatus({
        id: harnessRunId("hrun_missing"),
        status: "succeeded",
        updatedAt: succeededAt,
        completedAt: succeededAt,
      }),
    /harness run not found: hrun_missing/,
  );
});

withHarnessRunStore(({ handle, store, room, target, doc }) => {
  handle.database
    .prepare(
      `
        INSERT INTO runtime_sessions (
          runtime_session_id,
          kind,
          adapter_session_id,
          label
        ) VALUES (?, ?, ?, ?)
      `,
    )
    .run("rsess_bad_kind", "custom", "opaque", "bad kind");
  assert.throws(
    () => store.getRuntimeSession(runtimeSessionId("rsess_bad_kind")),
    /Invalid runtime kind in database: custom/,
  );

  handle.database
    .prepare(
      `
        INSERT INTO harness_runs (
          harness_run_id,
          room_id,
          target_member_id,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .run("hrun_bad_status", room.id, target.id, "done", now, now);
  assert.throws(
    () => store.getRun(harnessRunId("hrun_bad_status")),
    /Invalid harness run status in database: done/,
  );

  handle.database
    .prepare(
      `
        INSERT INTO harness_runs (
          harness_run_id,
          room_id,
          target_member_id,
          status,
          created_at,
          updated_at,
          doc_ids_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run("hrun_bad_doc_json", room.id, target.id, "queued", now, now, "{}");
  assert.throws(
    () => store.getRun(harnessRunId("hrun_bad_doc_json")),
    /harness run doc_ids_json in database must be a JSON array/,
  );

  handle.database
    .prepare(
      `
        INSERT INTO harness_runs (
          harness_run_id,
          room_id,
          target_member_id,
          status,
          created_at,
          updated_at,
          doc_ids_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run("hrun_bad_doc_id", room.id, target.id, "queued", now, now, JSON.stringify(["rmsg_bad"]));
  assert.throws(
    () => store.getRun(harnessRunId("hrun_bad_doc_id")),
    /Invalid harness run doc id in database: rmsg_bad/,
  );

  handle.database
    .prepare(
      `
        INSERT INTO harness_runs (
          harness_run_id,
          room_id,
          target_member_id,
          status,
          created_at,
          updated_at,
          doc_ids_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run("hrun_valid_doc_ids", room.id, target.id, "queued", now, now, JSON.stringify([doc.id]));
  assert.deepEqual(store.getRun(harnessRunId("hrun_valid_doc_ids"))?.docIds, [doc.id]);
});

withHarnessRunStore(({ handle, store, room, target }) => {
  const run: HarnessRun = {
    id: harnessRunId("hrun_bad_event_type"),
    roomId: room.id,
    targetMemberId: target.id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  store.createRun(run);

  handle.database
    .prepare(
      `
        INSERT INTO harness_run_events (
          runtime_event_id,
          harness_run_id,
          room_id,
          target_member_id,
          sequence,
          type,
          created_at,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "rtevt_bad_type",
      run.id,
      room.id,
      target.id,
      1,
      "runtime.log",
      now,
      JSON.stringify({ kind: "run_status", status: "queued" }),
    );
  assert.throws(
    () => store.listEvents(run.id),
    /Invalid runtime event type in database: runtime\.log/,
  );
});

withHarnessRunStore(({ handle, store, room, target }) => {
  const run: HarnessRun = {
    id: harnessRunId("hrun_bad_event_payload_json"),
    roomId: room.id,
    targetMemberId: target.id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  store.createRun(run);

  handle.database
    .prepare(
      `
        INSERT INTO harness_run_events (
          runtime_event_id,
          harness_run_id,
          room_id,
          target_member_id,
          sequence,
          type,
          created_at,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run("rtevt_bad_payload_json", run.id, room.id, target.id, 1, "run.queued", now, "[]");
  assert.throws(
    () => store.listEvents(run.id),
    /runtime event payload_json in database must be a JSON object/,
  );
});

withHarnessRunStore(({ handle, store, room, target }) => {
  const run: HarnessRun = {
    id: harnessRunId("hrun_malformed_event_payload_json"),
    roomId: room.id,
    targetMemberId: target.id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  store.createRun(run);

  handle.database
    .prepare(
      `
        INSERT INTO harness_run_events (
          runtime_event_id,
          harness_run_id,
          room_id,
          target_member_id,
          sequence,
          type,
          created_at,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run("rtevt_malformed_payload_json", run.id, room.id, target.id, 1, "run.queued", now, "{");
  assert.throws(
    () => store.listEvents(run.id),
    /runtime event payload_json in database contains invalid JSON/,
  );
});

withHarnessRunStore(({ handle, store, room, target }) => {
  const run: HarnessRun = {
    id: harnessRunId("hrun_bad_event_payload_kind"),
    roomId: room.id,
    targetMemberId: target.id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  store.createRun(run);

  handle.database
    .prepare(
      `
        INSERT INTO harness_run_events (
          runtime_event_id,
          harness_run_id,
          room_id,
          target_member_id,
          sequence,
          type,
          created_at,
          payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "rtevt_bad_payload_kind",
      run.id,
      room.id,
      target.id,
      1,
      "run.queued",
      now,
      JSON.stringify({ kind: "raw_log" }),
    );
  assert.throws(
    () => store.listEvents(run.id),
    /Invalid runtime event payload kind in database: raw_log/,
  );
});

console.log("harness run store: ok");
