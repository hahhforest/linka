import type {
  Announcement,
  Doc,
  DocComment,
  HarnessProjection,
  HarnessProjectionRequest,
  PinnedItem,
  Room,
  RoomEvent,
  RoomFile,
  RoomMember,
  RoomMessage,
} from "@linka/shared";

export interface CreateHarnessProjectionInput {
  readonly request: HarnessProjectionRequest;
  readonly room: Room;
  readonly viewer: RoomMember;
  readonly members: readonly RoomMember[];
  readonly messages: readonly RoomMessage[];
  readonly docs?: readonly Doc[];
  readonly docComments?: readonly DocComment[];
  readonly events?: readonly RoomEvent[];
  readonly announcements?: readonly Announcement[];
  readonly pins?: readonly PinnedItem[];
  readonly files?: readonly RoomFile[];
}

const takeTail = <Value>(values: readonly Value[], limit: number | undefined): readonly Value[] => {
  if (limit === undefined) {
    return values;
  }

  return values.slice(Math.max(values.length - limit, 0));
};

const assertRoomMatch = (label: string, actual: Room["id"], expected: Room["id"]): void => {
  if (actual !== expected) {
    throw new Error(`Harness projection ${label} room mismatch`);
  }
};

const projectRoom = (room: Room): HarnessProjection["room"] => ({
  id: room.id,
  displayName: room.displayName,
  topic: room.topic,
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
  defaultVisibility: room.defaultVisibility,
  permissionPolicy: room.permissionPolicy,
});

const projectMember = (member: RoomMember): HarnessProjection["members"][number] => ({
  id: member.id,
  roomId: member.roomId,
  participantId: member.participantId,
  kind: member.kind,
  role: member.role,
  status: member.status,
  displayName: member.displayName,
});

const projectMessage = (message: RoomMessage): HarnessProjection["messages"][number] => ({
  id: message.id,
  roomId: message.roomId,
  sequence: message.sequence,
  sender: message.sender,
  kind: message.kind,
  createdAt: message.createdAt,
  text: message.text,
  mentions: message.mentions,
  replyTo: message.replyTo,
  references: message.references,
  attachments: message.attachments,
  evidence: message.evidence,
  visibility: message.visibility,
  notification: message.notification,
});

const projectEvent = (event: RoomEvent): HarnessProjection["events"][number] => ({
  id: event.id,
  roomId: event.roomId,
  sequence: event.sequence,
  type: event.type,
  createdAt: event.createdAt,
  actor: event.actor,
  messageId: event.messageId,
  memberId: event.memberId,
  fileId: event.fileId,
  visibility: event.visibility,
  notification: event.notification,
});

const projectAnnouncement = (
  announcement: Announcement,
): HarnessProjection["announcements"][number] => ({
  id: announcement.id,
  roomId: announcement.roomId,
  title: announcement.title,
  body: announcement.body,
  createdAt: announcement.createdAt,
  updatedAt: announcement.updatedAt,
  createdByMemberId: announcement.createdByMemberId,
  visibility: announcement.visibility,
});

const projectPin = (pin: PinnedItem): HarnessProjection["pins"][number] => ({
  id: pin.id,
  roomId: pin.roomId,
  kind: pin.kind,
  messageId: pin.messageId,
  announcementId: pin.announcementId,
  fileId: pin.fileId,
  uri: pin.uri,
  label: pin.label,
  createdAt: pin.createdAt,
  createdByMemberId: pin.createdByMemberId,
});

const projectFile = (file: RoomFile): HarnessProjection["files"][number] => ({
  id: file.id,
  roomId: file.roomId,
  name: file.name,
  createdAt: file.createdAt,
  addedBy: file.addedBy,
  contentType: file.contentType,
  sizeBytes: file.sizeBytes,
  uri: file.uri,
});

const projectDoc = (doc: Doc): HarnessProjection["docs"][number] => ({
  id: doc.id,
  contextRoomId: doc.contextRoomId,
  title: doc.title,
  format: doc.format,
  status: doc.status,
  body: doc.body,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
  createdByMemberId: doc.createdByMemberId,
  currentRevisionId: doc.currentRevisionId,
  visibility: doc.visibility,
});

const projectDocComment = (comment: DocComment): HarnessProjection["docComments"][number] => ({
  id: comment.id,
  docId: comment.docId,
  contextRoomId: comment.contextRoomId,
  revisionId: comment.revisionId,
  body: comment.body,
  status: comment.status,
  createdAt: comment.createdAt,
  updatedAt: comment.updatedAt,
  createdByMemberId: comment.createdByMemberId,
  resolvedAt: comment.resolvedAt,
  resolvedByMemberId: comment.resolvedByMemberId,
  mentions: comment.mentions,
  anchor: comment.anchor,
  visibility: comment.visibility,
});

export const createHarnessProjection = ({
  request,
  room,
  viewer,
  members,
  messages,
  docs = [],
  docComments = [],
  events = [],
  announcements = [],
  pins = [],
  files = [],
}: CreateHarnessProjectionInput): HarnessProjection => {
  if (request.roomId !== room.id) {
    throw new Error("Harness projection room mismatch");
  }

  if (viewer.id !== request.memberId) {
    throw new Error("Harness projection viewer mismatch: memberId");
  }

  if (viewer.participantId !== request.participantId) {
    throw new Error("Harness projection viewer mismatch: participantId");
  }

  if (viewer.kind !== "agent") {
    throw new Error("Harness projection viewer must be an agent");
  }

  assertRoomMatch("viewer", viewer.roomId, room.id);

  for (const member of members) {
    assertRoomMatch("member", member.roomId, room.id);
  }

  for (const message of messages) {
    assertRoomMatch("message", message.roomId, room.id);
  }

  for (const doc of docs) {
    assertRoomMatch("doc", doc.contextRoomId, room.id);
  }

  for (const comment of docComments) {
    assertRoomMatch("doc comment", comment.contextRoomId, room.id);
  }

  for (const event of events) {
    assertRoomMatch("event", event.roomId, room.id);
  }

  for (const announcement of announcements) {
    assertRoomMatch("announcement", announcement.roomId, room.id);
  }

  for (const pin of pins) {
    assertRoomMatch("pin", pin.roomId, room.id);
  }

  for (const file of files) {
    assertRoomMatch("file", file.roomId, room.id);
  }

  return {
    request,
    room: projectRoom(room),
    viewer: projectMember(viewer),
    members: members.map(projectMember),
    messages: takeTail(messages, request.limit).map(projectMessage),
    events: events.map(projectEvent),
    announcements: announcements.map(projectAnnouncement),
    pins: pins.map(projectPin),
    files: files.map(projectFile),
    docs: takeTail(docs, request.limit).map(projectDoc),
    docComments: takeTail(docComments, request.limit).map(projectDocComment),
  };
};
