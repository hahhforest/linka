import {
  LINKA_SHARED_CONTRACT_VERSION,
  announcementId,
  getMentionedMemberIds,
  isAnnouncementId,
  isHarnessProjectionTriggerType,
  isPinnedItemId,
  isPinnedItemKind,
  isRoomEventType,
  isRoomId,
  isRoomMemberKind,
  isRoomMessageKind,
  isUnixMs,
  messageMentionsMember,
  parseAnnouncementId,
  parseParticipantId,
  parsePinnedItemId,
  parseRoomId,
  parseRoomMemberId,
  pinnedItemId,
  roomFileId,
  roomId,
  roomMemberId,
  roomMessageId,
  unixMs,
  type HarnessProjection,
  type PermissionPolicy,
  type RoomMessage,
} from "../src/index.js";

const check = (condition: boolean, label: string): void => {
  if (!condition) {
    throw new Error(`Contract test failed: ${label}`);
  }
};

const same = (actual: unknown, expected: unknown, label: string): void => {
  if (!Object.is(actual, expected)) {
    throw new Error(`Contract test failed: ${label}`);
  }
};

const throws = (fn: () => unknown, label: string): void => {
  try {
    fn();
  } catch {
    return;
  }

  throw new Error(`Contract test failed: ${label}`);
};

same(typeof LINKA_SHARED_CONTRACT_VERSION, "string", "contract version is exported");

same(isRoomId("room_abc"), true, "room id guard accepts room_ prefix");
same(isRoomId("rmem_abc"), false, "room id guard rejects member prefix");
same(parseRoomId("room alpha"), undefined, "room id parser rejects spaces");
same(parseRoomMemberId("room_abc"), undefined, "member id parser rejects room prefix");
same(parseParticipantId("part_linka"), "part_linka", "participant parser brands ids");
throws(() => roomMessageId("message:1"), "message id constructor rejects legacy prefix");
same(roomMessageId("rmsg_1"), "rmsg_1", "message id constructor accepts rmsg_ prefix");
same(isAnnouncementId("ann_rules"), true, "announcement id guard accepts ann_ prefix");
same(isAnnouncementId("pin_rules"), false, "announcement id guard rejects pin_ prefix");
same(parseAnnouncementId("rmsg_1"), undefined, "announcement parser rejects message prefix");
same(announcementId("ann_rules"), "ann_rules", "announcement constructor accepts ann_ prefix");
same(isPinnedItemId("pin_rules"), true, "pinned item id guard accepts pin_ prefix");
same(isPinnedItemId("ann_rules"), false, "pinned item id guard rejects ann_ prefix");
same(parsePinnedItemId("ann_rules"), undefined, "pinned item parser rejects announcement prefix");
same(pinnedItemId("pin_rules"), "pin_rules", "pinned item constructor accepts pin_ prefix");
same(isUnixMs(1_716_000_000_000), true, "UnixMs accepts safe unix milliseconds");
same(isUnixMs(Number.MAX_SAFE_INTEGER + 1), false, "UnixMs rejects unsafe integers");

same(isRoomMemberKind("human"), true, "member kind guard accepts human");
same(isRoomMemberKind("agent"), true, "member kind guard accepts agent");
same(isRoomMemberKind("linka"), false, "member kind guard rejects linka");
same(isRoomMemberKind("system"), false, "member kind guard rejects system");
same(isRoomMessageKind("text"), true, "message kind guard accepts text");
same(isRoomMessageKind("unknown_kind"), false, "message kind guard rejects unknown values");
same(isRoomEventType("message.created"), true, "event type guard accepts message.created");
same(isRoomEventType("unknown.event"), false, "event type guard rejects unknown values");
same(isPinnedItemKind("announcement"), true, "pin kind guard accepts announcement");
same(isPinnedItemKind("task"), false, "pin kind guard rejects task");
same(
  isHarnessProjectionTriggerType("member_mentioned"),
  true,
  "projection trigger guard accepts mentions",
);

const now = unixMs(1_716_000_000_000);
const baseRoomId = roomId("room_alpha");
const alice = roomMemberId("rmem_alice");
const bob = roomMemberId("rmem_bob");
const rulesAnnouncement = announcementId("ann_rules");
const pinnedRules = pinnedItemId("pin_rules");
const roomFile = roomFileId("rfile_brief");

const message: Pick<RoomMessage, "mentions" | "id"> = {
  id: roomMessageId("rmsg_1"),
  mentions: [
    { memberId: alice, displayText: "@Alice" },
    { memberId: alice, displayText: "@Alice" },
  ],
};

const mentions = getMentionedMemberIds(message);
check(mentions.length === 1 && mentions[0] === alice, "mentions are unique and ordered");
same(messageMentionsMember(message, alice), true, "message mentions Alice");
same(messageMentionsMember(message, bob), false, "message does not mention Bob");

const permissions: PermissionPolicy = {
  owner: {
    canReadHistory: true,
    canPostMessage: true,
    canMentionMembers: true,
    canUploadFiles: true,
    canManageMembers: true,
  },
  admin: {
    canReadHistory: true,
    canPostMessage: true,
    canMentionMembers: true,
    canUploadFiles: true,
    canManageMembers: true,
  },
  member: {
    canReadHistory: true,
    canPostMessage: true,
    canMentionMembers: true,
    canUploadFiles: true,
    canManageMembers: false,
  },
  guest: {
    canReadHistory: true,
    canPostMessage: false,
    canMentionMembers: false,
    canUploadFiles: false,
    canManageMembers: false,
  },
};

const projection: HarnessProjection = {
  request: {
    roomId: baseRoomId,
    memberId: alice,
    participantId: "part_alice",
    trigger: { type: "manual" },
  },
  room: {
    id: baseRoomId,
    displayName: "Alpha",
    createdAt: now,
    updatedAt: now,
    defaultVisibility: { scope: "room" },
    permissionPolicy: permissions,
  },
  viewer: {
    id: alice,
    roomId: baseRoomId,
    participantId: "part_alice",
    kind: "human",
    role: "owner",
    status: "active",
    displayName: "Alice",
  },
  members: [],
  messages: [],
  events: [],
  announcements: [
    {
      id: rulesAnnouncement,
      roomId: baseRoomId,
      title: "Rules",
      body: "Keep evidence visible.",
      createdAt: now,
      updatedAt: now,
      createdByMemberId: alice,
      visibility: { scope: "room" },
    },
  ],
  pins: [
    {
      id: pinnedRules,
      roomId: baseRoomId,
      kind: "announcement",
      announcementId: rulesAnnouncement,
      label: "Room rules",
      createdAt: now,
      createdByMemberId: alice,
    },
  ],
  files: [
    {
      id: roomFile,
      roomId: baseRoomId,
      name: "brief.md",
      createdAt: now,
      addedBy: { kind: "member", memberId: alice },
      contentType: "text/markdown",
    },
  ],
};

same(projection.announcements[0]?.id, rulesAnnouncement, "projection carries announcements");
same(projection.pins[0]?.announcementId, rulesAnnouncement, "projection carries pins");
same(projection.files[0]?.id, roomFile, "projection carries files");
same(
  projection.room.permissionPolicy.guest.canPostMessage,
  false,
  "projection carries permissions",
);

console.log("shared contracts: ok");
