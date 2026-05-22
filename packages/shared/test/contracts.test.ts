import {
  LINKA_SHARED_CONTRACT_VERSION,
  announcementId,
  docCommentId,
  docId,
  docRevisionId,
  getMentionedMemberIds,
  getRoomMessagePlainText,
  getRoomMessageReplyToId,
  harnessRunId,
  harnessSessionId,
  harnessTriggerId,
  harnessTurnId,
  isAgentActivityStatus,
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
  isHarnessSessionId,
  isHarnessSessionStatus,
  isHarnessTriggerId,
  isHarnessTriggerKind,
  isHarnessTriggerStatus,
  isHarnessTurnId,
  isHarnessTurnStatus,
  isPinnedItemId,
  isPinnedItemKind,
  isRoomEventType,
  isRoomId,
  isRoomMemberKind,
  isRoomMessageKind,
  isPendingInteractionId,
  isPendingInteractionKind,
  isPendingInteractionStatus,
  isRuntimeEventId,
  isRuntimeEventType,
  isRuntimeKind,
  isRuntimeProcessId,
  isRuntimeProcessStatus,
  isRuntimeSessionId,
  isRuntimeSessionStatus,
  isUnixMs,
  messageMentionsMember,
  parseAnnouncementId,
  parseDocCommentId,
  parseDocId,
  parseDocRevisionId,
  parseHarnessRunId,
  parseHarnessSessionId,
  parseHarnessTriggerId,
  parseHarnessTurnId,
  parseParticipantId,
  parsePendingInteractionId,
  parsePinnedItemId,
  parseRoomId,
  parseRoomMemberId,
  pinnedItemId,
  roomFileId,
  roomId,
  roomMemberId,
  roomMessageId,
  pendingInteractionId,
  runtimeEventId,
  runtimeProcessId,
  runtimeSessionId,
  unixMs,
  type Doc,
  type DocComment,
  type AgentActivity,
  type HarnessProjection,
  type HarnessRun,
  type HarnessSession,
  type HarnessTrigger,
  type HarnessTurn,
  type PendingInteraction,
  type PermissionPolicy,
  type RoomMessage,
  type RuntimeAdapterCapabilities,
  type RuntimeEvent,
  type RuntimeProcess,
  type RuntimeSessionRef,
  type RuntimeSessionState,
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
same(isHarnessSessionId("hsess_alpha"), true, "harness session id guard accepts hsess_ prefix");
same(parseHarnessSessionId("hrun_alpha"), undefined, "harness session parser rejects run prefix");
same(
  harnessSessionId("hsess_alpha"),
  "hsess_alpha",
  "harness session constructor accepts hsess_ prefix",
);
same(isHarnessTurnId("hturn_alpha"), true, "harness turn id guard accepts hturn_ prefix");
same(parseHarnessTurnId("hsess_alpha"), undefined, "harness turn parser rejects session prefix");
same(harnessTurnId("hturn_alpha"), "hturn_alpha", "harness turn constructor accepts hturn_ prefix");
same(isHarnessTriggerId("htrig_alpha"), true, "harness trigger id guard accepts htrig_ prefix");
same(parseHarnessTriggerId("hturn_alpha"), undefined, "harness trigger parser rejects turn prefix");
same(
  harnessTriggerId("htrig_alpha"),
  "htrig_alpha",
  "harness trigger constructor accepts htrig_ prefix",
);
same(isHarnessRunId("hrun_alpha"), true, "harness run id guard accepts hrun_ prefix");
same(parseHarnessRunId("rsess_alpha"), undefined, "harness run parser rejects session prefix");
same(harnessRunId("hrun_alpha"), "hrun_alpha", "harness run constructor accepts hrun_ prefix");
same(isRuntimeProcessId("rproc_alpha"), true, "runtime process id guard accepts rproc_ prefix");
same(
  runtimeProcessId("rproc_alpha"),
  "rproc_alpha",
  "runtime process constructor accepts rproc_ prefix",
);
same(isRuntimeSessionId("rsess_alpha"), true, "runtime session id guard accepts rsess_ prefix");
same(
  runtimeSessionId("rsess_alpha"),
  "rsess_alpha",
  "runtime session constructor accepts rsess_ prefix",
);
same(
  isPendingInteractionId("pint_alpha"),
  true,
  "pending interaction id guard accepts pint_ prefix",
);
same(
  parsePendingInteractionId("rtevt_alpha"),
  undefined,
  "pending interaction parser rejects runtime event prefix",
);
same(
  pendingInteractionId("pint_alpha"),
  "pint_alpha",
  "pending interaction constructor accepts pint_ prefix",
);
same(isRuntimeEventId("rtevt_alpha"), true, "runtime event id guard accepts rtevt_ prefix");
same(
  runtimeEventId("rtevt_alpha"),
  "rtevt_alpha",
  "runtime event constructor accepts rtevt_ prefix",
);
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
same(isHarnessSessionStatus("waiting_user"), true, "harness session status accepts waiting_user");
same(isHarnessSessionStatus("done"), false, "harness session status rejects done");
same(isHarnessTurnStatus("projecting"), true, "harness turn status accepts projecting");
same(isHarnessTurnStatus("succeeded"), false, "harness turn status rejects legacy succeeded");
same(isHarnessTriggerStatus("dead_letter"), true, "harness trigger status accepts dead_letter");
same(
  isHarnessTriggerKind("member_mentioned"),
  true,
  "harness trigger kind accepts member_mentioned",
);
same(isAgentActivityStatus("waiting_user"), true, "agent activity status accepts waiting_user");
same(isPendingInteractionStatus("requested"), true, "pending interaction status accepts requested");
same(isPendingInteractionKind("approval"), true, "pending interaction kind accepts approval");
same(isRuntimeProcessStatus("healthy"), true, "runtime process status accepts healthy");
same(isRuntimeSessionStatus("busy"), true, "runtime session status accepts busy");
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
const harnessSession = harnessSessionId("hsess_brief_1");
const turn = harnessTurnId("hturn_brief_1");
const trigger = harnessTriggerId("htrig_brief_1");
const run = harnessRunId("hrun_brief_1");
const process = runtimeProcessId("rproc_opencode_1");
const session = runtimeSessionId("rsess_opencode_1");
const pendingInteraction = pendingInteractionId("pint_brief_1");
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

same(
  getRoomMessagePlainText({
    kind: "text",
    text: "legacy text",
    content: [{ type: "text", text: "structured text", format: "markdown" }],
  }),
  "structured text",
  "structured message content takes precedence over legacy text",
);
same(
  getRoomMessagePlainText({
    kind: "tool_result_summary",
    content: [{ type: "tool_result", callId: "call_1", status: "ok", text: "tool output" }],
  }),
  "[tool_result:ok] tool output",
  "tool result content parts render to stable text",
);
same(
  getRoomMessagePlainText({ kind: "question" }),
  "[question]",
  "message plain text falls back to message kind",
);
same(
  getRoomMessageReplyToId({
    replyTo: { messageId: roomMessageId("rmsg_legacy_reply") },
    thread: { replyToMessageId: roomMessageId("rmsg_thread_reply") },
  }),
  roomMessageId("rmsg_thread_reply"),
  "thread reply target takes precedence over legacy replyTo",
);

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

const harnessSessionState: HarnessSession = {
  id: harnessSession,
  roomId: baseRoomId,
  agentMemberId: bob,
  status: "running",
  runtime: runtimeRef,
  policy: {
    triggerMode: "mention_only",
    maxConcurrentTurns: 1,
    allowAutonomousContinue: true,
    visibleContext: "room",
    toolPermissionProfile: "default",
  },
  createdAt: now,
  updatedAt: now,
  lastTurnId: turn,
  lastTriggerId: trigger,
};

const harnessTrigger: HarnessTrigger = {
  id: trigger,
  sessionId: harnessSession,
  roomId: baseRoomId,
  agentMemberId: bob,
  kind: "member_mentioned",
  status: "claimed",
  createdAt: now,
  updatedAt: now,
  sourceMessageId: message.id,
  claimedTurnId: turn,
  attemptCount: 1,
};

const harnessTurn: HarnessTurn = {
  id: turn,
  sessionId: harnessSession,
  roomId: baseRoomId,
  agentMemberId: bob,
  triggerId: trigger,
  status: "running",
  runtime: runtimeRef,
  createdAt: now,
  updatedAt: now,
  startedAt: now,
};

const runtimeProcessState: RuntimeProcess = {
  id: process,
  kind: "opencode",
  status: "healthy",
  pid: 12345,
  port: 45199,
  baseUrl: "http://127.0.0.1:45199",
  createdAt: now,
  updatedAt: now,
  lastHealthCheckAt: now,
  restartAttempts: 0,
};

const runtimeSessionState: RuntimeSessionState = {
  id: session,
  processId: process,
  kind: "opencode",
  status: "busy",
  adapterSessionId: "opaque-opencode-session",
  roomId: baseRoomId,
  agentMemberId: bob,
  createdAt: now,
  updatedAt: now,
  lastTurnId: turn,
};

const pending: PendingInteraction = {
  id: pendingInteraction,
  sessionId: harnessSession,
  turnId: turn,
  roomId: baseRoomId,
  agentMemberId: bob,
  kind: "approval",
  status: "requested",
  createdAt: now,
  updatedAt: now,
  requestMessageId: message.id,
};

const activity: AgentActivity = {
  roomId: baseRoomId,
  agentMemberId: bob,
  sessionId: harnessSession,
  status: "running",
  updatedAt: now,
  currentTurnId: turn,
  currentTriggerId: trigger,
  pendingInteractionId: pendingInteraction,
  summary: "Working in room-scoped OpenCode session.",
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
same(harnessSessionState.roomId, baseRoomId, "harness session is room scoped");
same(harnessSessionState.agentMemberId, bob, "harness session is agent scoped");
same(harnessTrigger.sourceMessageId, message.id, "harness trigger can reference source message");
same(harnessTurn.sessionId, harnessSession, "harness turn belongs to harness session");
same(runtimeProcessState.status, "healthy", "runtime process tracks health");
same(runtimeSessionState.roomId, baseRoomId, "runtime session state is room scoped");
same(pending.status, "requested", "pending interaction tracks user decision state");
same(activity.status, "running", "agent activity exposes room-visible activity state");
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
