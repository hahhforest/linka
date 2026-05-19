import {
  LINKA_SHARED_CONTRACT_VERSION,
  announcementId,
  docCommentId,
  docId,
  docRevisionId,
  getMentionedMemberIds,
  harnessRunId,
  isAnnouncementId,
  isDocCommentId,
  isDocCommentStatus,
  isDocFormat,
  isDocId,
  isDocMentionKind,
  isDocRevisionId,
  isDocRevisionStatus,
  isDocStatus,
  isHarnessProjectionTriggerType,
  isHarnessRunId,
  isHarnessRunStatus,
  isPinnedItemId,
  isPinnedItemKind,
  isRoomEventType,
  isRoomId,
  isRoomMemberKind,
  isRoomMessageKind,
  isRuntimeEventId,
  isRuntimeEventType,
  isRuntimeKind,
  isRuntimeSessionId,
  isUnixMs,
  messageMentionsMember,
  parseAnnouncementId,
  parseDocCommentId,
  parseDocId,
  parseDocRevisionId,
  parseHarnessRunId,
  parseParticipantId,
  parsePinnedItemId,
  parseRoomId,
  parseRoomMemberId,
  pinnedItemId,
  roomFileId,
  roomId,
  roomMemberId,
  roomMessageId,
  runtimeEventId,
  runtimeSessionId,
  unixMs,
  type Doc,
  type DocComment,
  type HarnessProjection,
  type HarnessRun,
  type PermissionPolicy,
  type RoomMessage,
  type RuntimeAdapterCapabilities,
  type RuntimeEvent,
  type RuntimeSessionRef,
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
same(isDocId("doc_brief"), true, "doc id guard accepts doc_ prefix");
same(isDocId("room_brief"), false, "doc id guard rejects room prefix");
same(parseDocId("doc brief"), undefined, "doc id parser rejects spaces");
same(docId("doc_brief"), "doc_brief", "doc constructor accepts doc_ prefix");
same(isDocRevisionId("drev_brief_1"), true, "doc revision id guard accepts drev_ prefix");
same(parseDocRevisionId("doc_brief"), undefined, "revision parser rejects doc prefix");
same(docRevisionId("drev_brief_1"), "drev_brief_1", "revision constructor accepts drev_ prefix");
same(isDocCommentId("dcmt_note_1"), true, "doc comment id guard accepts dcmt_ prefix");
same(parseDocCommentId("drev_note_1"), undefined, "comment parser rejects revision prefix");
same(docCommentId("dcmt_note_1"), "dcmt_note_1", "comment constructor accepts dcmt_ prefix");
same(isHarnessRunId("hrun_alpha"), true, "harness run id guard accepts hrun_ prefix");
same(parseHarnessRunId("rsess_alpha"), undefined, "harness run parser rejects session prefix");
same(harnessRunId("hrun_alpha"), "hrun_alpha", "harness run constructor accepts hrun_ prefix");
same(isRuntimeSessionId("rsess_alpha"), true, "runtime session id guard accepts rsess_ prefix");
same(runtimeSessionId("rsess_alpha"), "rsess_alpha", "runtime session constructor accepts rsess_ prefix");
same(isRuntimeEventId("rtevt_alpha"), true, "runtime event id guard accepts rtevt_ prefix");
same(runtimeEventId("rtevt_alpha"), "rtevt_alpha", "runtime event constructor accepts rtevt_ prefix");
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
same(isDocFormat("markdown"), true, "doc format guard accepts markdown");
same(isDocFormat("board"), false, "doc format guard rejects board");
same(isDocStatus("active"), true, "doc status guard accepts active");
same(isDocRevisionStatus("committed"), true, "revision status guard accepts committed");
same(isDocCommentStatus("resolved"), true, "comment status guard accepts resolved");
same(isDocMentionKind("member"), true, "doc mention kind guard accepts member");
same(isDocMentionKind("linka"), false, "doc mention kind guard rejects linka");
same(isHarnessRunStatus("running"), true, "harness run status guard accepts running");
same(isHarnessRunStatus("done"), false, "harness run status guard rejects done");
same(isRuntimeKind("opencode"), true, "runtime kind guard accepts opencode adapter");
same(isRuntimeKind("test"), true, "runtime kind guard accepts test adapter");
same(isRuntimeKind("custom"), false, "runtime kind guard rejects custom adapter");
same(isRuntimeKind("room"), false, "runtime kind guard rejects room");
same(isRuntimeEventType("adapter.output"), true, "runtime event type guard accepts adapter output");
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
const briefDoc = docId("doc_brief");
const briefRevision = docRevisionId("drev_brief_1");
const briefComment = docCommentId("dcmt_brief_1");
const run = harnessRunId("hrun_brief_1");
const session = runtimeSessionId("rsess_opencode_1");
const runtimeEvent = runtimeEventId("rtevt_opencode_1");

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

const doc: Doc = {
  id: briefDoc,
  contextRoomId: baseRoomId,
  title: "Brief",
  format: "markdown",
  status: "active",
  body: "# Brief\n\nShared context for the run.",
  createdAt: now,
  updatedAt: now,
  createdByMemberId: alice,
  currentRevisionId: briefRevision,
  visibility: { scope: "room" },
};

const docComment: DocComment = {
  id: briefComment,
  docId: briefDoc,
  contextRoomId: baseRoomId,
  revisionId: briefRevision,
  body: "Please check this context before running.",
  status: "open",
  createdAt: now,
  updatedAt: now,
  createdByMemberId: alice,
  mentions: [{ kind: "member", memberId: bob, displayText: "@Bob" }],
  anchor: { revisionId: briefRevision, lineStart: 1, lineEnd: 1, quote: "# Brief" },
  visibility: { scope: "members", memberIds: [alice, bob] },
};

same(doc.contextRoomId, baseRoomId, "doc carries room context without becoming a room subtype");
same(doc.currentRevisionId, briefRevision, "doc carries current revision pointer");
same(docComment.docId, briefDoc, "doc comment attaches to doc");
same(docComment.mentions?.[0]?.memberId, bob, "doc comment carries member mentions");

const runtimeRef: RuntimeSessionRef = {
  id: session,
  kind: "opencode",
  adapterSessionId: "opaque-opencode-session",
  label: "OpenCode",
};

const capabilities: RuntimeAdapterCapabilities = {
  kind: "opencode",
  supportsInteractiveSession: true,
  supportsStreamingEvents: true,
  supportsDocContext: true,
  supportsCancellation: true,
  supportedEventTypes: ["run.started", "adapter.output"],
};

const harnessRun: HarnessRun = {
  id: run,
  roomId: baseRoomId,
  targetMemberId: bob,
  status: "running",
  runtime: runtimeRef,
  createdAt: now,
  updatedAt: now,
  triggerMessageId: message.id,
  docIds: [briefDoc],
};

const event: RuntimeEvent = {
  id: runtimeEvent,
  runId: run,
  roomId: baseRoomId,
  targetMemberId: bob,
  sequence: 1,
  type: "adapter.output",
  createdAt: now,
  runtime: runtimeRef,
  payload: {
    kind: "adapter_output",
    stream: "summary",
    text: "Read one doc before running.",
    data: { docCount: 1 },
  },
};

same(capabilities.kind, "opencode", "OpenCode is represented as runtime adapter kind");
same(harnessRun.docIds?.[0], briefDoc, "harness run can reference docs as context");
same(harnessRun.triggerMessageId, message.id, "harness run can reference trigger message");
same(event.payload.kind, "adapter_output", "runtime event uses structured payload union");

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
  docs: [doc],
  docComments: [docComment],
};

same(projection.announcements[0]?.id, rulesAnnouncement, "projection carries announcements");
same(projection.pins[0]?.announcementId, rulesAnnouncement, "projection carries pins");
same(projection.files[0]?.id, roomFile, "projection carries files");
same(projection.docs[0]?.id, briefDoc, "projection carries docs");
same(projection.docs[0]?.contextRoomId, baseRoomId, "projection keeps doc room context explicit");
same(projection.docComments[0]?.docId, briefDoc, "projection carries doc comments");
same(
  projection.room.permissionPolicy.guest.canPostMessage,
  false,
  "projection carries permissions",
);

console.log("shared contracts: ok");
