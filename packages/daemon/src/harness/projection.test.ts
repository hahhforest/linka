import assert from "node:assert/strict";

import {
  docCommentId,
  docId,
  docRevisionId,
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  type Doc,
  type DocComment,
  type HarnessProjectionRequest,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  type RoomMessage,
  type RoomPermissions,
  unixMs,
} from "@linka/shared";

import { createHarnessProjection } from "./projection.js";

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

const room: Room = {
  id: roomId("room_harness_projection"),
  displayName: "Harness Projection Room",
  topic: "daemon projection test",
  createdAt: now,
  updatedAt: now,
  createdByMemberId: roomMemberId("rmem_owner"),
  defaultVisibility: roomVisibility,
  notificationPolicy,
  permissionPolicy,
};

const makeMember = (suffix: string, kind: RoomMember["kind"]): RoomMember => ({
  id: roomMemberId(`rmem_${suffix}`),
  roomId: room.id,
  participantId: participantId(`part_${suffix}`),
  kind,
  role: kind === "agent" ? "member" : "owner",
  status: "active",
  displayName: suffix,
  avatarUrl: `https://example.test/${suffix}.png`,
  joinedAt: unixMs(1_716_000_000_100),
  lastSeenAt: unixMs(1_716_000_000_200),
  permissions: allPermissions,
  notificationPolicy,
});

const human = makeMember("human", "human");
const agent = makeMember("agent", "agent");
const otherRoomId = roomId("room_other");

const makeRequest = (overrides: Partial<HarnessProjectionRequest> = {}): HarnessProjectionRequest => ({
  roomId: room.id,
  memberId: agent.id,
  participantId: agent.participantId,
  trigger: { type: "manual" },
  ...overrides,
});

const makeMessage = (sequence: number): RoomMessage => ({
  id: roomMessageId(`rmsg_${sequence}`),
  roomId: room.id,
  sequence,
  sender: { kind: "member", memberId: human.id },
  kind: "text",
  createdAt: unixMs(1_716_000_000_000 + sequence),
  editedAt: unixMs(1_716_000_001_000 + sequence),
  text: `message ${sequence}`,
  mentions: [{ memberId: agent.id, displayText: "@agent" }],
  visibility: roomVisibility,
  notification: notificationPolicy,
});

const makeDoc = (sequence: number): Doc => ({
  id: docId(`doc_${sequence}`),
  contextRoomId: room.id,
  title: `Doc ${sequence}`,
  format: "markdown",
  status: "active",
  body: `# Doc ${sequence}`,
  createdAt: unixMs(1_716_000_010_000 + sequence),
  updatedAt: unixMs(1_716_000_020_000 + sequence),
  createdByMemberId: human.id,
  currentRevisionId: docRevisionId(`drev_${sequence}`),
  visibility: roomVisibility,
});

const makeComment = (doc: Doc, sequence: number): DocComment => ({
  id: docCommentId(`dcmt_${sequence}`),
  docId: doc.id,
  contextRoomId: doc.contextRoomId,
  revisionId: doc.currentRevisionId,
  body: `comment ${sequence}`,
  status: "open",
  createdAt: unixMs(1_716_000_030_000 + sequence),
  updatedAt: unixMs(1_716_000_040_000 + sequence),
  createdByMemberId: human.id,
  mentions: [{ kind: "member", memberId: agent.id, displayText: "@agent" }],
  anchor: { revisionId: doc.currentRevisionId, lineStart: sequence, lineEnd: sequence },
  visibility: roomVisibility,
});

{
  const doc = makeDoc(1);
  const comment = makeComment(doc, 1);
  const projection = createHarnessProjection({
    request: makeRequest(),
    room,
    viewer: agent,
    members: [human, agent],
    messages: [makeMessage(1)],
    docs: [doc],
    docComments: [comment],
  });

  assert.deepEqual(projection.docs, [doc]);
  assert.deepEqual(
    projection.docComments.map((projectedComment) => projectedComment.id),
    [comment.id],
  );
  assert.deepEqual(projection.docComments[0]?.mentions, comment.mentions);
  assert.deepEqual(projection.events, []);
  assert.deepEqual(projection.announcements, []);
  assert.deepEqual(projection.pins, []);
  assert.deepEqual(projection.files, []);
  assert.equal("permissions" in projection.viewer, false);
  assert.equal("notificationPolicy" in projection.room, false);
  assert.equal("editedAt" in projection.messages[0], false);
}

{
  const docs = [makeDoc(1), makeDoc(2), makeDoc(3)];
  const docComments = docs.map((doc, index) => makeComment(doc, index + 1));
  const projection = createHarnessProjection({
    request: makeRequest({ limit: 2 }),
    room,
    viewer: agent,
    members: [human, agent],
    messages: [makeMessage(1), makeMessage(2), makeMessage(3)],
    docs,
    docComments,
  });

  assert.deepEqual(
    projection.messages.map((message) => message.sequence),
    [2, 3],
  );
  assert.deepEqual(
    projection.docs.map((doc) => doc.id),
    [docs[1].id, docs[2].id],
  );
  assert.deepEqual(
    projection.docComments.map((comment) => comment.id),
    [docComments[1].id, docComments[2].id],
  );
}

assert.throws(
  () =>
    createHarnessProjection({
      request: makeRequest({ roomId: otherRoomId }),
      room,
      viewer: agent,
      members: [human, agent],
      messages: [],
    }),
  /room mismatch/,
);

assert.throws(
  () =>
    createHarnessProjection({
      request: makeRequest({ memberId: human.id }),
      room,
      viewer: agent,
      members: [human, agent],
      messages: [],
    }),
  /viewer mismatch: memberId/,
);

assert.throws(
  () =>
    createHarnessProjection({
      request: makeRequest({ participantId: participantId("part_other") }),
      room,
      viewer: agent,
      members: [human, agent],
      messages: [],
    }),
  /viewer mismatch: participantId/,
);

assert.throws(
  () =>
    createHarnessProjection({
      request: makeRequest({ memberId: human.id, participantId: human.participantId }),
      room,
      viewer: human,
      members: [human, agent],
      messages: [],
    }),
  /viewer must be an agent/,
);

assert.throws(
  () =>
    createHarnessProjection({
      request: makeRequest(),
      room,
      viewer: { ...agent, roomId: otherRoomId },
      members: [human, agent],
      messages: [],
    }),
  /viewer room mismatch/,
);

assert.throws(
  () =>
    createHarnessProjection({
      request: makeRequest(),
      room,
      viewer: agent,
      members: [human, { ...agent, roomId: otherRoomId }],
      messages: [],
    }),
  /member room mismatch/,
);

assert.throws(
  () =>
    createHarnessProjection({
      request: makeRequest(),
      room,
      viewer: agent,
      members: [human, agent],
      messages: [{ ...makeMessage(1), roomId: otherRoomId }],
    }),
  /message room mismatch/,
);

assert.throws(
  () =>
    createHarnessProjection({
      request: makeRequest(),
      room,
      viewer: agent,
      members: [human, agent],
      messages: [],
      docs: [{ ...makeDoc(1), contextRoomId: otherRoomId }],
    }),
  /doc room mismatch/,
);

assert.throws(
  () =>
    createHarnessProjection({
      request: makeRequest(),
      room,
      viewer: agent,
      members: [human, agent],
      messages: [],
      docComments: [{ ...makeComment(makeDoc(1), 1), contextRoomId: otherRoomId }],
    }),
  /doc comment room mismatch/,
);
