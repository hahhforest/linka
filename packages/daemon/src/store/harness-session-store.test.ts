import assert from "node:assert/strict";

import {
  harnessSessionId,
  harnessTriggerId,
  harnessTurnId,
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  runtimeSessionId,
  type AgentParticipationPolicy,
  type HarnessSession,
  type HarnessTrigger,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  type RoomPermissions,
  type RuntimeSessionRef,
  unixMs,
} from "@linka/shared";

import { openDatabase, type DatabaseHandle } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { DaemonDatabaseError } from "./event-store.js";
import { createHarnessSessionStore, type HarnessSessionStore } from "./harness-session-store.js";
import { createMessageStore } from "./message-store.js";
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
const policy: AgentParticipationPolicy = {
  triggerMode: "mention_only",
  maxConcurrentTurns: 1,
  allowAutonomousContinue: false,
  visibleContext: "room",
};

interface HarnessSessionStoreContext {
  readonly handle: DatabaseHandle;
  readonly store: HarnessSessionStore;
  readonly room: Room;
  readonly owner: RoomMember;
  readonly agent: RoomMember;
  readonly humanMessageId: ReturnType<typeof roomMessageId>;
}

const makeMember = (
  suffix: string,
  kind: RoomMember["kind"],
  role: RoomMember["role"],
): RoomMember => ({
  id: roomMemberId(`rmem_hsess_${suffix}`),
  roomId: roomId("room_hsess"),
  participantId: participantId(`part_hsess_${suffix}`),
  kind,
  role,
  status: "active",
  displayName: suffix,
  joinedAt: unixMs(1_716_000_000_100),
  permissions: allPermissions,
  notificationPolicy,
});

const withHarnessSessionStore = (run: (context: HarnessSessionStoreContext) => void): void => {
  const handle = openDatabase({ databasePath: ":memory:" });

  try {
    runMigrations(handle);

    const rooms = createRoomStore(handle);
    const messages = createMessageStore(handle);
    const store = createHarnessSessionStore(handle);
    const room: Room = {
      id: roomId("room_hsess"),
      displayName: "Harness Session Room",
      topic: "session store test",
      createdAt: now,
      updatedAt: now,
      defaultVisibility: roomVisibility,
      notificationPolicy,
      permissionPolicy,
    };
    rooms.createRoom(room);

    const owner = rooms.addMember(makeMember("owner", "human", "owner"));
    const agent = rooms.addMember(makeMember("agent", "agent", "member"));
    const humanMessage = messages.appendMessage({
      id: roomMessageId("rmsg_hsess_source"),
      roomId: room.id,
      sender: { kind: "member", memberId: owner.id },
      kind: "text",
      createdAt: unixMs(1_716_000_000_120),
      text: "@agent please inspect the room",
      mentions: [{ memberId: agent.id, displayText: "@agent" }],
      visibility: roomVisibility,
      notification: notificationPolicy,
    });

    run({ handle, store, room, owner, agent, humanMessageId: humanMessage.id });
  } finally {
    handle.close();
  }
};

const withoutMigrations = openDatabase({ databasePath: ":memory:" });
try {
  assert.throws(
    () => createHarnessSessionStore(withoutMigrations),
    (error) =>
      error instanceof DaemonDatabaseError &&
      error.message === "runMigrations must be called before createHarnessSessionStore",
  );
} finally {
  withoutMigrations.close();
}

withHarnessSessionStore(({ store, room, agent }) => {
  const session: HarnessSession = {
    id: harnessSessionId("hsess_primary"),
    roomId: room.id,
    agentMemberId: agent.id,
    status: "idle",
    policy,
    createdAt: unixMs(1_716_000_000_200),
    updatedAt: unixMs(1_716_000_000_200),
  };

  assert.deepEqual(store.createSession(session), session);
  assert.deepEqual(store.getSession(session.id), session);
  assert.deepEqual(store.getSessionByRoomAgent(room.id, agent.id), session);
  assert.deepEqual(store.listSessions(), [session]);
  assert.deepEqual(store.listSessionsByRoom(room.id), [session]);
  assert.equal(store.getSession(harnessSessionId("hsess_missing")), undefined);
  assert.deepEqual(store.listSessionsByRoom(roomId("room_empty")), []);

  assert.throws(
    () =>
      store.createSession({
        ...session,
        id: harnessSessionId("hsess_duplicate_room_agent"),
      }),
    /UNIQUE constraint failed: harness_sessions\.room_id, harness_sessions\.agent_member_id/,
  );

  const fromGetOrCreate = store.getOrCreateSessionByRoomAgent(room.id, agent.id, {
    ...policy,
    triggerMode: "manual",
  });
  assert.deepEqual(fromGetOrCreate, session);

  const runtime: RuntimeSessionRef = {
    id: runtimeSessionId("rsess_hsess_primary"),
    kind: "opencode",
    adapterSessionId: "opaque-runtime-session",
    label: "OpenCode room runtime",
  };
  const bound = store.bindRuntimeSession({
    id: session.id,
    runtime,
    updatedAt: unixMs(1_716_000_000_300),
  });
  assert.deepEqual(bound, {
    ...session,
    runtime,
    updatedAt: unixMs(1_716_000_000_300),
  });

  const failed = store.updateSessionStatus({
    id: session.id,
    status: "failed",
    updatedAt: unixMs(1_716_000_000_400),
    lastTurnId: harnessTurnId("hturn_hsess_failed"),
    error: "runtime unavailable",
  });
  assert.deepEqual(failed, {
    ...bound,
    status: "failed",
    updatedAt: unixMs(1_716_000_000_400),
    lastTurnId: harnessTurnId("hturn_hsess_failed"),
    error: "runtime unavailable",
  });

  assert.throws(
    () =>
      store.bindRuntimeSession({
        id: harnessSessionId("hsess_missing"),
        runtime,
        updatedAt: now,
      }),
    /harness session not found: hsess_missing/,
  );
});

withHarnessSessionStore(({ store, room, agent, humanMessageId }) => {
  const session = store.createSession({
    id: harnessSessionId("hsess_trigger"),
    roomId: room.id,
    agentMemberId: agent.id,
    status: "idle",
    policy,
    createdAt: now,
    updatedAt: now,
  });
  const trigger: HarnessTrigger = {
    id: harnessTriggerId("htrig_pending"),
    sessionId: session.id,
    roomId: room.id,
    agentMemberId: agent.id,
    kind: "member_mentioned",
    status: "pending",
    createdAt: unixMs(1_716_000_000_500),
    updatedAt: unixMs(1_716_000_000_500),
    sourceMessageId: humanMessageId,
    attemptCount: 0,
    payload: { reason: "mention" },
  };

  assert.deepEqual(store.createTrigger(trigger), trigger);
  assert.deepEqual(store.getTrigger(trigger.id), trigger);
  assert.deepEqual(store.listTriggersBySession(session.id), [trigger]);
  assert.deepEqual(store.getSession(session.id)?.lastTriggerId, trigger.id);

  const claimed = store.claimTrigger({
    id: trigger.id,
    claimedTurnId: harnessTurnId("hturn_claimed"),
    updatedAt: unixMs(1_716_000_000_600),
  });
  assert.deepEqual(claimed, {
    ...trigger,
    status: "claimed",
    claimedTurnId: harnessTurnId("hturn_claimed"),
    updatedAt: unixMs(1_716_000_000_600),
    attemptCount: 1,
  });
  assert.equal(
    store.claimTrigger({
      id: trigger.id,
      claimedTurnId: harnessTurnId("hturn_second_claim"),
      updatedAt: unixMs(1_716_000_000_650),
    }),
    undefined,
  );

  const consumed = store.updateTriggerStatus({
    id: trigger.id,
    status: "consumed",
    updatedAt: unixMs(1_716_000_000_700),
  });
  assert.deepEqual(consumed, {
    ...claimed,
    status: "consumed",
    updatedAt: unixMs(1_716_000_000_700),
  });

  const deadLetter = store.updateTriggerStatus({
    id: trigger.id,
    status: "dead_letter",
    updatedAt: unixMs(1_716_000_000_800),
    claimedTurnId: null,
    attemptCount: 3,
    error: "too many attempts",
  });
  assert.deepEqual(deadLetter, {
    ...trigger,
    status: "dead_letter",
    updatedAt: unixMs(1_716_000_000_800),
    attemptCount: 3,
    error: "too many attempts",
  });

  assert.throws(
    () =>
      store.updateTriggerStatus({
        id: harnessTriggerId("htrig_missing"),
        status: "consumed",
        updatedAt: now,
      }),
    /harness trigger not found: htrig_missing/,
  );
});

withHarnessSessionStore(({ handle, store, room, owner, agent }) => {
  const session = store.createSession({
    id: harnessSessionId("hsess_invalid_rows"),
    roomId: room.id,
    agentMemberId: agent.id,
    status: "idle",
    policy,
    createdAt: now,
    updatedAt: now,
  });

  handle.database
    .prepare(
      `
        INSERT INTO harness_sessions (
          harness_session_id,
          room_id,
          agent_member_id,
          status,
          policy_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run("hsess_bad_status", room.id, owner.id, "done", JSON.stringify(policy), now, now);
  assert.throws(
    () => store.getSession(harnessSessionId("hsess_bad_status")),
    /Invalid harness session status in database: done/,
  );

  handle.database
    .prepare(
      `
        INSERT INTO harness_triggers (
          harness_trigger_id,
          session_id,
          room_id,
          agent_member_id,
          kind,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run("htrig_bad_kind", session.id, room.id, agent.id, "room_watched", "pending", now, now);
  assert.throws(
    () => store.getTrigger(harnessTriggerId("htrig_bad_kind")),
    /Invalid harness trigger kind in database: room_watched/,
  );

  handle.database
    .prepare(
      `
        INSERT INTO harness_triggers (
          harness_trigger_id,
          session_id,
          room_id,
          agent_member_id,
          kind,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "htrig_bad_status",
      session.id,
      room.id,
      agent.id,
      "member_mentioned",
      "running",
      now,
      now,
    );
  assert.throws(
    () => store.getTrigger(harnessTriggerId("htrig_bad_status")),
    /Invalid harness trigger status in database: running/,
  );
});

console.log("harness session store: ok");
