import assert from "node:assert/strict";

import {
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  unixMs,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  type RoomPermissions,
  type RoomMessage,
} from "@linka/shared";

import { createFakeHarnessReply } from "./index.js";

const permissions: RoomPermissions = {
  canReadHistory: true,
  canPostMessage: true,
  canMentionMembers: true,
  canUploadFiles: true,
  canManageMembers: false,
};

const permissionPolicy: PermissionPolicy = {
  owner: { ...permissions, canManageMembers: true },
  admin: { ...permissions, canManageMembers: true },
  member: permissions,
  guest: { ...permissions, canPostMessage: false },
};

const room: Room = {
  id: roomId("room_harness_test"),
  displayName: "Harness Test Room",
  createdAt: unixMs(1),
  updatedAt: unixMs(1),
  defaultVisibility: { scope: "room" },
  notificationPolicy: { level: "normal" },
  permissionPolicy,
};

const human: RoomMember = {
  id: roomMemberId("rmem_human"),
  roomId: room.id,
  participantId: participantId("part_human"),
  kind: "human",
  role: "owner",
  status: "active",
  displayName: "Human",
  permissions,
  notificationPolicy: { level: "normal" },
};

const agent: RoomMember = {
  id: roomMemberId("rmem_agent"),
  roomId: room.id,
  participantId: participantId("part_agent"),
  kind: "agent",
  role: "member",
  status: "active",
  displayName: "Research Agent",
  permissions,
  notificationPolicy: { level: "normal" },
};

const message: RoomMessage = {
  id: roomMessageId("rmsg_human"),
  roomId: room.id,
  sequence: 1,
  sender: { kind: "member", memberId: human.id },
  kind: "instruction",
  createdAt: unixMs(2),
  text: "请检查这个页面是否是一年内更新，并说明证据。",
  mentions: [{ memberId: agent.id, displayText: "@Research Agent" }],
  visibility: { scope: "room" },
  notification: { level: "normal" },
};

const reply = createFakeHarnessReply({ room, members: [human, agent], messages: [message], targetMember: agent });

assert.match(reply.text, /Research Agent/);
assert.match(reply.text, /Harness Test Room/);
assert.match(reply.text, /一年内更新/);

console.log("fake harness reply: ok");
