import assert from "node:assert/strict";

import {
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  unixMs,
  type RoomPermissions,
} from "@linka/shared";

import { openDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
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
const visibility = { scope: "room" as const };

const makeMember = (suffix: string, role: RoomMember["role"]): RoomMember => ({
  id: roomMemberId(`rmem_${suffix}`),
  roomId: roomId("room_alpha"),
  participantId: participantId(`part_${suffix}`),
  kind: suffix === "agent" ? "agent" : "human",
  role,
  status: "active",
  displayName: suffix,
  joinedAt: unixMs(suffix === "owner" ? 1_716_000_000_100 : 1_716_000_000_101),
  permissions: allPermissions,
  notificationPolicy,
});

const handle = openDatabase({ databasePath: ":memory:" });

try {
  runMigrations(handle);

  const rooms = createRoomStore(handle);
  const messages = createMessageStore(handle);

  const room: Room = {
    id: roomId("room_alpha"),
    displayName: "Alpha Room",
    topic: "minimal room store test",
    createdAt: unixMs(1_716_000_000_000),
    updatedAt: unixMs(1_716_000_000_000),
    defaultVisibility: visibility,
    notificationPolicy,
    permissionPolicy,
  };
  rooms.createRoom(room);

  const owner = rooms.addMember(makeMember("owner", "owner"));
  const agent = rooms.addMember(makeMember("agent", "member"));

  assert.deepEqual(
    rooms.listMembers(room.id).map((member) => member.id),
    [owner.id, agent.id],
  );

  const first = messages.appendMessage({
    id: roomMessageId("rmsg_first"),
    roomId: room.id,
    sender: { kind: "member", memberId: owner.id },
    kind: "text",
    createdAt: unixMs(1_716_000_000_200),
    text: "hello",
    visibility,
    notification: notificationPolicy,
  });
  const second = messages.appendMessage({
    id: roomMessageId("rmsg_second"),
    roomId: room.id,
    sender: { kind: "member", memberId: agent.id },
    kind: "text",
    createdAt: unixMs(1_716_000_000_300),
    text: "hi",
    visibility,
    notification: notificationPolicy,
  });

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);

  assert.deepEqual(
    messages.listMessages(room.id).map((message) => message.sequence),
    [1, 2],
  );
  assert.deepEqual(
    messages.listMessages(room.id, { afterSequence: 1 }).map((message) => message.id),
    [second.id],
  );

  handle.database
    .prepare(
      `
        INSERT INTO room_messages (
          message_id,
          room_id,
          sequence,
          sender_json,
          kind,
          created_at,
          visibility_json,
          notification_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "rmsg_bad_kind",
      room.id,
      3,
      JSON.stringify({ kind: "system", label: "test" }),
      "bad_kind",
      1_716_000_000_400,
      JSON.stringify(visibility),
      JSON.stringify(notificationPolicy),
    );
  assert.throws(
    () => messages.listMessages(room.id),
    /Invalid room message kind in database: bad_kind/,
  );

  handle.database
    .prepare(
      `
        INSERT INTO room_members (
          member_id,
          room_id,
          participant_id,
          kind,
          role,
          status,
          display_name,
          joined_at,
          permissions_json,
          notification_policy_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "rmem_bad_kind",
      room.id,
      "part_bad_kind",
      "bad_kind",
      "member",
      "active",
      "bad kind",
      1_716_000_000_500,
      JSON.stringify(allPermissions),
      JSON.stringify(notificationPolicy),
    );
  assert.throws(() => rooms.listMembers(room.id), /Invalid room member kind in database: bad_kind/);

  console.log("room message store: ok");
} finally {
  handle.close();
}
