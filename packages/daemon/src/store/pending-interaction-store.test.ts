import assert from "node:assert/strict";

import {
  harnessSessionId,
  pendingInteractionId,
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  unixMs,
  type AgentParticipationPolicy,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  type RoomPermissions,
} from "@linka/shared";

import { openDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { createHarnessSessionStore } from "./harness-session-store.js";
import { createMessageStore } from "./message-store.js";
import { createRoomStore } from "./room-store.js";
import { createPendingInteractionStore } from "./pending-interaction-store.js";

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
  member: { ...allPermissions, canManageMembers: false },
  guest: { ...allPermissions, canPostMessage: false, canMentionMembers: false },
};
const notificationPolicy = { level: "normal" as const };
const visibility = { scope: "room" as const };
const now = unixMs(1_716_000_000_000);
const later = unixMs(1_716_000_001_000);
const policy: AgentParticipationPolicy = {
  triggerMode: "mention_only",
  maxConcurrentTurns: 1,
  allowAutonomousContinue: false,
  visibleContext: "room",
};

const room: Room = {
  id: roomId("room_pending_interaction"),
  displayName: "Pending Interaction Room",
  createdAt: now,
  updatedAt: now,
  defaultVisibility: visibility,
  notificationPolicy,
  permissionPolicy,
};

const makeMember = (
  suffix: string,
  kind: RoomMember["kind"],
  role: RoomMember["role"],
): RoomMember => ({
  id: roomMemberId(`rmem_pending_${suffix}`),
  roomId: room.id,
  participantId: participantId(`part_pending_${suffix}`),
  kind,
  role,
  status: "active",
  displayName: suffix,
  joinedAt: now,
  permissions: permissionPolicy[role],
  notificationPolicy,
});

const handle = openDatabase({ databasePath: ":memory:" });

try {
  assert.throws(
    () => createPendingInteractionStore(handle),
    /runMigrations must be called before createPendingInteractionStore/,
  );

  runMigrations(handle);
  const roomStore = createRoomStore(handle);
  const messageStore = createMessageStore(handle);
  const harnessSessionStore = createHarnessSessionStore(handle);
  const pendingStore = createPendingInteractionStore(handle);

  const createdRoom = roomStore.createRoom(room);
  const human = roomStore.addMember(makeMember("human", "human", "owner"));
  const agent = roomStore.addMember(makeMember("agent", "agent", "member"));
  const requestMessage = messageStore.appendMessage({
    id: roomMessageId("rmsg_pending_request"),
    roomId: createdRoom.id,
    sender: { kind: "member", memberId: agent.id },
    kind: "question",
    createdAt: now,
    text: "Need user decision",
    visibility,
    notification: notificationPolicy,
  });
  const responseMessage = messageStore.appendMessage({
    id: roomMessageId("rmsg_pending_response"),
    roomId: createdRoom.id,
    sender: { kind: "member", memberId: human.id },
    kind: "decision",
    createdAt: later,
    text: "Approved",
    replyTo: { messageId: requestMessage.id },
    visibility,
    notification: notificationPolicy,
  });
  const session = harnessSessionStore.createSession({
    id: harnessSessionId("hsess_pending_interaction"),
    roomId: createdRoom.id,
    agentMemberId: agent.id,
    status: "waiting_user",
    policy,
    createdAt: now,
    updatedAt: now,
  });

  const created = pendingStore.createInteraction({
    id: pendingInteractionId("pint_pending_interaction"),
    sessionId: session.id,
    roomId: createdRoom.id,
    agentMemberId: agent.id,
    kind: "approval",
    status: "requested",
    createdAt: now,
    updatedAt: now,
    requestMessageId: requestMessage.id,
    expiresAt: unixMs(1_716_000_999_000),
    payload: { reason: "needs approval" },
  });

  assert.equal(created.kind, "approval");
  assert.equal(created.status, "requested");
  assert.deepEqual(created.payload, { reason: "needs approval" });
  assert.deepEqual(pendingStore.getInteraction(created.id), created);
  assert.deepEqual(pendingStore.listInteractionsByRoom(createdRoom.id), [created]);
  assert.deepEqual(pendingStore.listOpenInteractionsBySession(session.id), [created]);

  const answered = pendingStore.updateInteractionStatus({
    id: created.id,
    status: "approved",
    updatedAt: later,
    responseMessageId: responseMessage.id,
    payload: { decision: "approved" },
  });

  assert.equal(answered.status, "approved");
  assert.equal(answered.responseMessageId, responseMessage.id);
  assert.deepEqual(answered.payload, { decision: "approved" });
  assert.deepEqual(pendingStore.listOpenInteractionsBySession(session.id), []);

  handle.database
    .prepare("UPDATE pending_interactions SET status = ? WHERE pending_interaction_id = ?")
    .run("unknown", created.id);
  assert.throws(
    () => pendingStore.getInteraction(created.id),
    /Invalid pending interaction status in database: unknown/,
  );

  console.log("pending interaction store: ok");
} finally {
  handle.close();
}
