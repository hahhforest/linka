import type {
  AnnouncementId,
  AttachmentId,
  DocId,
  DocRevisionId,
  HarnessRunId,
  HarnessSessionId,
  HarnessTriggerId,
  HarnessTurnId,
  ParticipantId,
  PinnedItemId,
  RoomEventId,
  RoomFileId,
  RoomId,
  RoomMemberId,
  RoomMessageId,
  RuntimeSessionId,
} from "./ids.js";
import type { UnixMs } from "./primitives.js";

export const ROOM_MEMBER_KINDS = ["human", "agent"] as const;
export type RoomMemberKind = (typeof ROOM_MEMBER_KINDS)[number];

export const ROOM_MEMBER_ROLES = ["owner", "admin", "member", "guest"] as const;
export type RoomMemberRole = (typeof ROOM_MEMBER_ROLES)[number];

export const ROOM_MEMBER_STATUSES = ["invited", "active", "left", "removed"] as const;
export type RoomMemberStatus = (typeof ROOM_MEMBER_STATUSES)[number];

export const ROOM_VISIBILITY_SCOPES = ["room", "members", "participants"] as const;
export type RoomVisibilityScope = (typeof ROOM_VISIBILITY_SCOPES)[number];

export const ROOM_NOTIFICATION_LEVELS = ["none", "silent", "normal", "urgent"] as const;
export type RoomNotificationLevel = (typeof ROOM_NOTIFICATION_LEVELS)[number];

export const ROOM_MESSAGE_KINDS = [
  "text",
  "instruction",
  "status",
  "question",
  "decision",
  "approval_request",
  "intervention",
  "evidence",
  "tool_result_summary",
  "system",
] as const;
export type RoomMessageKind = (typeof ROOM_MESSAGE_KINDS)[number];

export const ROOM_MESSAGE_LLM_ROLES = ["system", "user", "assistant", "tool", "observer"] as const;
export type RoomMessageLlmRole = (typeof ROOM_MESSAGE_LLM_ROLES)[number];

export const ROOM_MESSAGE_CONTENT_PART_TYPES = [
  "text",
  "image",
  "file_ref",
  "doc_ref",
  "evidence_ref",
  "tool_call",
  "tool_result",
  "event_ref",
] as const;
export type RoomMessageContentPartType = (typeof ROOM_MESSAGE_CONTENT_PART_TYPES)[number];

export const ROOM_EVENT_TYPES = [
  "room.created",
  "room.updated",
  "member.joined",
  "member.left",
  "member.updated",
  "message.created",
  "message.updated",
  "message.deleted",
  "file.added",
  "file.removed",
  "visibility.changed",
  "notification.requested",
] as const;
export type RoomEventType = (typeof ROOM_EVENT_TYPES)[number];

export const ROOM_ATTACHMENT_KINDS = ["file", "image", "link", "data"] as const;
export type RoomAttachmentKind = (typeof ROOM_ATTACHMENT_KINDS)[number];

export const ROOM_REFERENCE_KINDS = ["message", "event", "file", "external"] as const;
export type RoomReferenceKind = (typeof ROOM_REFERENCE_KINDS)[number];

export const PINNED_ITEM_KINDS = ["message", "announcement", "file", "link"] as const;
export type PinnedItemKind = (typeof PINNED_ITEM_KINDS)[number];

export interface RoomVisibility {
  readonly scope: RoomVisibilityScope;
  readonly memberIds?: readonly RoomMemberId[];
  readonly participantIds?: readonly ParticipantId[];
}

export interface RoomNotificationPolicy {
  readonly level: RoomNotificationLevel;
  readonly notifyMemberIds?: readonly RoomMemberId[];
}

export interface RoomPermissions {
  readonly canReadHistory: boolean;
  readonly canPostMessage: boolean;
  readonly canMentionMembers: boolean;
  readonly canUploadFiles: boolean;
  readonly canManageMembers: boolean;
}

export type PermissionPolicy = Readonly<Record<RoomMemberRole, RoomPermissions>>;

export interface Room {
  readonly id: RoomId;
  readonly displayName: string;
  readonly topic?: string;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly createdByMemberId?: RoomMemberId;
  readonly ownerMemberId?: RoomMemberId;
  readonly defaultVisibility: RoomVisibility;
  readonly notificationPolicy: RoomNotificationPolicy;
  readonly permissionPolicy: PermissionPolicy;
}

export interface RoomMember {
  readonly id: RoomMemberId;
  readonly roomId: RoomId;
  readonly participantId: ParticipantId;
  readonly kind: RoomMemberKind;
  readonly role: RoomMemberRole;
  readonly status: RoomMemberStatus;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly joinedAt?: UnixMs;
  readonly lastSeenAt?: UnixMs;
  readonly permissions: RoomPermissions;
  readonly notificationPolicy: RoomNotificationPolicy;
}

export interface RoomMessageSenderMember {
  readonly kind: "member";
  readonly memberId: RoomMemberId;
}

export interface RoomMessageSenderSystem {
  readonly kind: "system";
  readonly label?: string;
}

export type RoomMessageSender = RoomMessageSenderMember | RoomMessageSenderSystem;

export interface RoomMention {
  readonly memberId: RoomMemberId;
  readonly displayText?: string;
}

export interface RoomMessageReply {
  readonly messageId: RoomMessageId;
}

export interface RoomReference {
  readonly kind: RoomReferenceKind;
  readonly messageId?: RoomMessageId;
  readonly eventId?: RoomEventId;
  readonly fileId?: RoomFileId;
  readonly uri?: string;
  readonly label?: string;
}

export interface RoomAttachment {
  readonly id: AttachmentId;
  readonly kind: RoomAttachmentKind;
  readonly name: string;
  readonly contentType?: string;
  readonly sizeBytes?: number;
  readonly uri?: string;
  readonly roomFileId?: RoomFileId;
}

export interface RoomEvidence {
  readonly label: string;
  readonly summary?: string;
  readonly uri?: string;
  readonly attachmentIds?: readonly AttachmentId[];
  readonly messageIds?: readonly RoomMessageId[];
}

export interface RoomMessageTextPart {
  readonly type: "text";
  readonly text: string;
  readonly format?: "plain" | "markdown";
}

export interface RoomMessageImagePart {
  readonly type: "image";
  readonly attachmentId: AttachmentId;
  readonly alt?: string;
}

export interface RoomMessageFileRefPart {
  readonly type: "file_ref";
  readonly fileId: RoomFileId;
  readonly label?: string;
}

export interface RoomMessageDocRefPart {
  readonly type: "doc_ref";
  readonly docId: DocId;
  readonly revisionId?: DocRevisionId;
  readonly quote?: string;
}

export interface RoomMessageEvidenceRefPart {
  readonly type: "evidence_ref";
  readonly evidenceId?: string;
  readonly label: string;
  readonly uri?: string;
}

export interface RoomMessageToolCallPart {
  readonly type: "tool_call";
  readonly callId: string;
  readonly name: string;
  readonly argumentsJson: string;
}

export interface RoomMessageToolResultPart {
  readonly type: "tool_result";
  readonly callId: string;
  readonly status: "ok" | "error";
  readonly resultJson?: string;
  readonly text?: string;
}

export interface RoomMessageEventRefPart {
  readonly type: "event_ref";
  readonly eventId: RoomEventId;
  readonly label?: string;
}

export type RoomMessageContentPart =
  | RoomMessageTextPart
  | RoomMessageImagePart
  | RoomMessageFileRefPart
  | RoomMessageDocRefPart
  | RoomMessageEvidenceRefPart
  | RoomMessageToolCallPart
  | RoomMessageToolResultPart
  | RoomMessageEventRefPart;

export interface RoomMessageThread {
  readonly rootMessageId?: RoomMessageId;
  readonly replyToMessageId?: RoomMessageId;
  readonly topicKey?: string;
}

export interface RoomMessageTrace {
  readonly trajectoryId?: string;
  readonly harnessSessionId?: HarnessSessionId;
  readonly harnessTriggerId?: HarnessTriggerId;
  readonly harnessTurnId?: HarnessTurnId;
  readonly harnessRunId?: HarnessRunId;
  readonly runtimeSessionId?: RuntimeSessionId;
  readonly projectionSnapshotId?: string;
  readonly sourceMessageIds?: readonly RoomMessageId[];
  readonly visibleMessageIds?: readonly RoomMessageId[];
  readonly visibleDocRevisionIds?: readonly DocRevisionId[];
}

export interface RoomMessageExportMeta {
  readonly includeInTraining?: boolean;
  readonly lossMask?: "include" | "exclude" | "assistant_only";
  readonly evalLabels?: Readonly<Record<string, string | number | boolean>>;
  readonly tags?: readonly string[];
  readonly redactionState?: "raw" | "redacted" | "excluded";
}

export interface RoomMessage {
  readonly id: RoomMessageId;
  readonly roomId: RoomId;
  readonly sequence: number;
  readonly sender: RoomMessageSender;
  readonly kind: RoomMessageKind;
  readonly createdAt: UnixMs;
  readonly editedAt?: UnixMs;
  readonly text?: string;
  readonly content?: readonly RoomMessageContentPart[];
  readonly llmRole?: RoomMessageLlmRole;
  readonly thread?: RoomMessageThread;
  readonly mentions?: readonly RoomMention[];
  readonly replyTo?: RoomMessageReply;
  readonly references?: readonly RoomReference[];
  readonly attachments?: readonly RoomAttachment[];
  readonly evidence?: readonly RoomEvidence[];
  readonly trace?: RoomMessageTrace;
  readonly exportMeta?: RoomMessageExportMeta;
  readonly visibility: RoomVisibility;
  readonly notification: RoomNotificationPolicy;
}

export interface RoomEventActorMember {
  readonly kind: "member";
  readonly memberId: RoomMemberId;
}

export interface RoomEventActorSystem {
  readonly kind: "system";
  readonly label?: string;
}

export type RoomEventActor = RoomEventActorMember | RoomEventActorSystem;

export interface RoomEvent {
  readonly id: RoomEventId;
  readonly roomId: RoomId;
  readonly sequence: number;
  readonly type: RoomEventType;
  readonly createdAt: UnixMs;
  readonly actor: RoomEventActor;
  readonly messageId?: RoomMessageId;
  readonly memberId?: RoomMemberId;
  readonly fileId?: RoomFileId;
  readonly visibility: RoomVisibility;
  readonly notification: RoomNotificationPolicy;
}

export interface RoomFile {
  readonly id: RoomFileId;
  readonly roomId: RoomId;
  readonly name: string;
  readonly createdAt: UnixMs;
  readonly addedBy: RoomMessageSender;
  readonly contentType?: string;
  readonly sizeBytes?: number;
  readonly uri?: string;
}

export interface Announcement {
  readonly id: AnnouncementId;
  readonly roomId: RoomId;
  readonly title?: string;
  readonly body: string;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly createdByMemberId?: RoomMemberId;
  readonly visibility: RoomVisibility;
}

export interface PinnedItem {
  readonly id: PinnedItemId;
  readonly roomId: RoomId;
  readonly kind: PinnedItemKind;
  readonly messageId?: RoomMessageId;
  readonly announcementId?: AnnouncementId;
  readonly fileId?: RoomFileId;
  readonly uri?: string;
  readonly label?: string;
  readonly createdAt: UnixMs;
  readonly createdByMemberId?: RoomMemberId;
}

export const isRoomMessageKind = (value: unknown): value is RoomMessageKind =>
  typeof value === "string" && ROOM_MESSAGE_KINDS.includes(value as RoomMessageKind);

export const isRoomMessageLlmRole = (value: unknown): value is RoomMessageLlmRole =>
  typeof value === "string" && ROOM_MESSAGE_LLM_ROLES.includes(value as RoomMessageLlmRole);

export const isRoomMessageContentPartType = (value: unknown): value is RoomMessageContentPartType =>
  typeof value === "string" &&
  ROOM_MESSAGE_CONTENT_PART_TYPES.includes(value as RoomMessageContentPartType);

export const isRoomEventType = (value: unknown): value is RoomEventType =>
  typeof value === "string" && ROOM_EVENT_TYPES.includes(value as RoomEventType);

export const isRoomMemberKind = (value: unknown): value is RoomMemberKind =>
  typeof value === "string" && ROOM_MEMBER_KINDS.includes(value as RoomMemberKind);

export const isPinnedItemKind = (value: unknown): value is PinnedItemKind =>
  typeof value === "string" && PINNED_ITEM_KINDS.includes(value as PinnedItemKind);

export const getMentionedMemberIds = (message: Pick<RoomMessage, "mentions">): RoomMemberId[] => {
  const seen = new Set<RoomMemberId>();

  for (const mention of message.mentions ?? []) {
    seen.add(mention.memberId);
  }

  return [...seen];
};

export const messageMentionsMember = (
  message: Pick<RoomMessage, "mentions">,
  memberId: RoomMemberId,
): boolean => getMentionedMemberIds(message).includes(memberId);

export const isMemberSender = (
  sender: RoomMessageSender | RoomEventActor,
): sender is RoomMessageSenderMember | RoomEventActorMember => sender.kind === "member";

export const isSystemSender = (
  sender: RoomMessageSender | RoomEventActor,
): sender is RoomMessageSenderSystem | RoomEventActorSystem => sender.kind === "system";

export const roomMessageContentPartToText = (part: RoomMessageContentPart): string => {
  switch (part.type) {
    case "text":
      return part.text;
    case "tool_call":
      return `[tool_call:${part.name}] ${part.argumentsJson}`;
    case "tool_result":
      return `[tool_result:${part.status}] ${part.text ?? part.resultJson ?? ""}`;
    case "doc_ref":
      return `[doc_ref:${part.docId}]${part.quote ? ` ${part.quote}` : ""}`;
    case "file_ref":
      return `[file_ref:${part.fileId}]${part.label ? ` ${part.label}` : ""}`;
    case "evidence_ref":
      return `[evidence_ref] ${part.label}${part.uri ? ` ${part.uri}` : ""}`;
    case "image":
      return `[image:${part.attachmentId}]${part.alt ? ` ${part.alt}` : ""}`;
    case "event_ref":
      return `[event_ref:${part.eventId}]${part.label ? ` ${part.label}` : ""}`;
  }
};

export const getRoomMessagePlainText = (
  message: Pick<RoomMessage, "content" | "text" | "kind">,
): string => {
  const contentText = message.content
    ?.map(roomMessageContentPartToText)
    .filter((partText) => partText.trim().length > 0)
    .join("\n");

  if (contentText && contentText.trim().length > 0) {
    return contentText;
  }

  return message.text ?? `[${message.kind}]`;
};

export const getRoomMessageReplyToId = (
  message: Pick<RoomMessage, "replyTo" | "thread">,
): RoomMessageId | undefined => message.thread?.replyToMessageId ?? message.replyTo?.messageId;
