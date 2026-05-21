import {
  announcementId,
  attachmentId,
  docId,
  participantId,
  pinnedItemId,
  roomFileId,
  roomId,
  roomMemberId,
  roomMessageId,
  unixMs,
  type Announcement,
  type Doc,
  type PermissionPolicy,
  type PinnedItem,
  type Room,
  type RoomFile,
  type RoomMember,
  type RoomMessage,
  type RoomNotificationPolicy,
  type RoomPermissions,
  type RoomVisibility,
} from "@linka/shared";

const ts = (value: string) => unixMs(new Date(value).getTime());

const roomVisibility: RoomVisibility = { scope: "room" };
const normalNotification: RoomNotificationPolicy = { level: "normal" };
const silentNotification: RoomNotificationPolicy = { level: "silent" };
const urgentNotification: RoomNotificationPolicy = { level: "urgent" };

const ownerPermissions: RoomPermissions = {
  canReadHistory: true,
  canPostMessage: true,
  canMentionMembers: true,
  canUploadFiles: true,
  canManageMembers: true,
};

const memberPermissions: RoomPermissions = {
  canReadHistory: true,
  canPostMessage: true,
  canMentionMembers: true,
  canUploadFiles: true,
  canManageMembers: false,
};

const guestPermissions: RoomPermissions = {
  canReadHistory: true,
  canPostMessage: true,
  canMentionMembers: false,
  canUploadFiles: false,
  canManageMembers: false,
};

const permissionPolicy: PermissionPolicy = {
  owner: ownerPermissions,
  admin: { ...memberPermissions, canManageMembers: true },
  member: memberPermissions,
  guest: guestPermissions,
};

export interface DemoRoomFixture {
  readonly room: Room;
  readonly members: readonly RoomMember[];
  readonly messages: readonly RoomMessage[];
  readonly docs: readonly Doc[];
  readonly files: readonly RoomFile[];
  readonly announcements: readonly Announcement[];
  readonly pinnedItems: readonly PinnedItem[];
}

const demoRoomId = roomId("room_url_freshness_review");
const userMemberId = roomMemberId("rmem_user_minimax");
const linkaMemberId = roomMemberId("rmem_agent_linka");
const researchMemberId = roomMemberId("rmem_agent_research");
const verificationMemberId = roomMemberId("rmem_agent_verify");

const evidenceAttachmentId = attachmentId("att_release_note_snapshot");
const archiveAttachmentId = attachmentId("att_archive_capture_2026_05_18");
const evidenceFileId = roomFileId("rfile_release_note_bundle");
const reviewDocId = docId("doc_url_freshness_review_v1");

export const demoRoom: DemoRoomFixture = {
  room: {
    id: demoRoomId,
    displayName: "URL 时效核验 room",
    topic: "判断一组页面信息是否在一年内更新，并沉淀可回溯证据。",
    createdAt: ts("2026-05-19T09:12:00+08:00"),
    updatedAt: ts("2026-05-19T09:28:00+08:00"),
    createdByMemberId: linkaMemberId,
    ownerMemberId: userMemberId,
    defaultVisibility: roomVisibility,
    notificationPolicy: normalNotification,
    permissionPolicy,
  },
  members: [
    {
      id: userMemberId,
      roomId: demoRoomId,
      participantId: participantId("part_human_minimax"),
      kind: "human",
      role: "owner",
      status: "active",
      displayName: "用户",
      joinedAt: ts("2026-05-19T09:12:00+08:00"),
      lastSeenAt: ts("2026-05-19T09:29:00+08:00"),
      permissions: ownerPermissions,
      notificationPolicy: urgentNotification,
    },
    {
      id: linkaMemberId,
      roomId: demoRoomId,
      participantId: participantId("part_agent_linka"),
      kind: "agent",
      role: "admin",
      status: "active",
      displayName: "LinkA",
      joinedAt: ts("2026-05-19T09:12:00+08:00"),
      lastSeenAt: ts("2026-05-19T09:28:00+08:00"),
      permissions: { ...memberPermissions, canManageMembers: true },
      notificationPolicy: normalNotification,
    },
    {
      id: researchMemberId,
      roomId: demoRoomId,
      participantId: participantId("part_agent_research"),
      kind: "agent",
      role: "member",
      status: "active",
      displayName: "资料 Agent",
      joinedAt: ts("2026-05-19T09:13:00+08:00"),
      lastSeenAt: ts("2026-05-19T09:27:00+08:00"),
      permissions: memberPermissions,
      notificationPolicy: normalNotification,
    },
    {
      id: verificationMemberId,
      roomId: demoRoomId,
      participantId: participantId("part_agent_verify"),
      kind: "agent",
      role: "member",
      status: "active",
      displayName: "核验 Agent",
      joinedAt: ts("2026-05-19T09:13:00+08:00"),
      lastSeenAt: ts("2026-05-19T09:26:00+08:00"),
      permissions: memberPermissions,
      notificationPolicy: normalNotification,
    },
  ],
  files: [
    {
      id: evidenceFileId,
      roomId: demoRoomId,
      name: "release-note-evidence.json",
      createdAt: ts("2026-05-19T09:18:00+08:00"),
      addedBy: { kind: "member", memberId: researchMemberId },
      contentType: "application/json",
      sizeBytes: 18422,
      uri: "linka-demo://files/release-note-evidence.json",
    },
  ],
  docs: [
    {
      id: reviewDocId,
      contextRoomId: demoRoomId,
      title: "URL 时效核验 Doc (v1.3)",
      format: "markdown",
      status: "active",
      body: [
        "# 1. 任务目标",
        "判断一组页面信息是否都是一年内更新，并把每个结论关联到可回溯证据。",
        "# 2. 核验范围",
        "首批 12 个 URL 已完成资料采集，其中 2 个页面仍需要补充发布说明或可信快照。",
        "# 3. 当前标准",
        "发布说明可以作为证据，但必须明确指向目标 URL 或相同内容段落；只有站点整体更新记录不算。",
        "# 4. 下一步",
        "资料 Agent 继续补证，核验 Agent 按用户更新后的标准复核。",
      ].join("\n\n"),
      createdAt: ts("2026-05-19T09:20:00+08:00"),
      updatedAt: ts("2026-05-19T09:27:00+08:00"),
      createdByMemberId: linkaMemberId,
      visibility: roomVisibility,
    },
  ],
  announcements: [
    {
      id: announcementId("ann_review_standard"),
      roomId: demoRoomId,
      title: "核验标准",
      body: "页面正文、更新记录、发布说明或可信快照中至少一项能证明内容在 365 天内更新。",
      createdAt: ts("2026-05-19T09:12:00+08:00"),
      updatedAt: ts("2026-05-19T09:22:00+08:00"),
      createdByMemberId: linkaMemberId,
      visibility: roomVisibility,
    },
  ],
  pinnedItems: [
    {
      id: pinnedItemId("pin_review_standard"),
      roomId: demoRoomId,
      kind: "announcement",
      announcementId: announcementId("ann_review_standard"),
      label: "一年内判定标准",
      createdAt: ts("2026-05-19T09:12:00+08:00"),
      createdByMemberId: linkaMemberId,
    },
  ],
  messages: [
    {
      id: roomMessageId("rmsg_system_room_created"),
      roomId: demoRoomId,
      sequence: 1,
      sender: { kind: "system", label: "Room Runtime" },
      kind: "system",
      createdAt: ts("2026-05-19T09:12:03+08:00"),
      text: "Room 已创建。LinkA、资料 Agent、核验 Agent 已加入现场。",
      visibility: roomVisibility,
      notification: silentNotification,
    },
    {
      id: roomMessageId("rmsg_user_initial_request"),
      roomId: demoRoomId,
      sequence: 2,
      sender: { kind: "member", memberId: userMemberId },
      kind: "instruction",
      createdAt: ts("2026-05-19T09:12:20+08:00"),
      text: "请判断这批 URL 的信息是否都是一年内的。结论必须能回溯到证据，不确定时先把判断点列出来。",
      mentions: [{ memberId: linkaMemberId, displayText: "@LinkA" }],
      visibility: roomVisibility,
      notification: urgentNotification,
    },
    {
      id: roomMessageId("rmsg_linka_plan"),
      roomId: demoRoomId,
      sequence: 3,
      sender: { kind: "member", memberId: linkaMemberId },
      kind: "instruction",
      createdAt: ts("2026-05-19T09:13:04+08:00"),
      text: "我会先让资料 Agent 找页面时间和备用来源，再让核验 Agent 检查证据是否足以支持一年内结论。证据不足的 URL 不直接放过。",
      mentions: [
        { memberId: researchMemberId, displayText: "@资料 Agent" },
        { memberId: verificationMemberId, displayText: "@核验 Agent" },
      ],
      visibility: roomVisibility,
      notification: normalNotification,
    },
    {
      id: roomMessageId("rmsg_research_evidence"),
      roomId: demoRoomId,
      sequence: 4,
      sender: { kind: "member", memberId: researchMemberId },
      kind: "evidence",
      createdAt: ts("2026-05-19T09:18:16+08:00"),
      text: "已完成第一批 12 个 URL 的资料采集。8 个页面有页面内更新时间，2 个页面只有发布说明，2 个页面需要快照佐证。",
      attachments: [
        {
          id: evidenceAttachmentId,
          kind: "data",
          name: "release-note-evidence.json",
          contentType: "application/json",
          sizeBytes: 18422,
          uri: "linka-demo://attachments/release-note-evidence.json",
          roomFileId: evidenceFileId,
        },
        {
          id: archiveAttachmentId,
          kind: "link",
          name: "2026-05-18 archive capture",
          uri: "linka-demo://attachments/archive-capture",
        },
      ],
      evidence: [
        {
          label: "发布说明更新记录",
          summary: "页面显示 2026-02-11 更新，发布说明同日追加 API 字段变更。",
          uri: "linka-demo://evidence/release-note",
          attachmentIds: [evidenceAttachmentId],
        },
        {
          label: "网页快照",
          summary: "快照时间为 2026-05-18，可证明当前正文已包含 2026 年更新段落。",
          uri: "linka-demo://evidence/archive-capture",
          attachmentIds: [archiveAttachmentId],
        },
      ],
      visibility: roomVisibility,
      notification: normalNotification,
    },
    {
      id: roomMessageId("rmsg_verify_pushback"),
      roomId: demoRoomId,
      sequence: 5,
      sender: { kind: "member", memberId: verificationMemberId },
      kind: "question",
      createdAt: ts("2026-05-19T09:21:11+08:00"),
      text: "2 个 URL 的页面只证明抓取时间，不证明正文更新时间。建议要求补充站内 changelog 或第三方可信引用，否则不能判定为一年内。",
      replyTo: { messageId: roomMessageId("rmsg_research_evidence") },
      mentions: [{ memberId: linkaMemberId, displayText: "@LinkA" }],
      references: [
        {
          kind: "message",
          messageId: roomMessageId("rmsg_research_evidence"),
          label: "资料 Agent 第一批证据",
        },
      ],
      visibility: roomVisibility,
      notification: normalNotification,
    },
    {
      id: roomMessageId("rmsg_linka_invite_user"),
      roomId: demoRoomId,
      sequence: 6,
      sender: { kind: "member", memberId: linkaMemberId },
      kind: "question",
      createdAt: ts("2026-05-19T09:23:02+08:00"),
      text: "这里需要你判断：如果页面没有正文更新时间，但发布说明明确提到同一 URL 的内容变更，是否可算一年内？我不替你放宽标准。",
      mentions: [{ memberId: userMemberId, displayText: "@用户" }],
      visibility: roomVisibility,
      notification: urgentNotification,
    },
    {
      id: roomMessageId("rmsg_user_intervention"),
      roomId: demoRoomId,
      sequence: 7,
      sender: { kind: "member", memberId: userMemberId },
      kind: "intervention",
      createdAt: ts("2026-05-19T09:24:36+08:00"),
      text: "可以算，但发布说明必须明确指向该 URL 或同一段内容；只有站点整体更新记录不算。请把这条标准写进后续核验。",
      replyTo: { messageId: roomMessageId("rmsg_linka_invite_user") },
      mentions: [{ memberId: linkaMemberId, displayText: "@LinkA" }],
      visibility: roomVisibility,
      notification: urgentNotification,
    },
    {
      id: roomMessageId("rmsg_linka_resume"),
      roomId: demoRoomId,
      sequence: 8,
      sender: { kind: "member", memberId: linkaMemberId },
      kind: "decision",
      createdAt: ts("2026-05-19T09:26:10+08:00"),
      text: "已更新 room 标准：发布说明必须明确指向 URL 或同一段内容才可作为一年内证据。资料 Agent 继续补证，核验 Agent 按新标准复核。",
      replyTo: { messageId: roomMessageId("rmsg_user_intervention") },
      mentions: [
        { memberId: researchMemberId, displayText: "@资料 Agent" },
        { memberId: verificationMemberId, displayText: "@核验 Agent" },
      ],
      evidence: [
        {
          label: "用户干预后的判断标准",
          summary: "发布说明可作为证据，但必须明确关联到目标 URL 或相同内容段落。",
          messageIds: [roomMessageId("rmsg_user_intervention")],
        },
      ],
      visibility: roomVisibility,
      notification: normalNotification,
    },
  ],
};
