import type { Doc, DocComment } from "./doc.js";
import type { ParticipantId, RoomId, RoomMemberId } from "./ids.js";
import type {
  Announcement,
  PinnedItem,
  Room,
  RoomEvent,
  RoomEventType,
  RoomFile,
  RoomMember,
  RoomMessage,
  RoomMessageKind,
  RoomNotificationPolicy,
  RoomVisibility,
} from "./room.js";

export const HARNESS_PROJECTION_TRIGGER_TYPES = [
  "manual",
  "member_mentioned",
  "message_created",
  "event_created",
] as const;
export type HarnessProjectionTriggerType = (typeof HARNESS_PROJECTION_TRIGGER_TYPES)[number];

export interface HarnessProjectionTrigger {
  readonly type: HarnessProjectionTriggerType;
  readonly messageKinds?: readonly RoomMessageKind[];
  readonly eventTypes?: readonly RoomEventType[];
}

export interface HarnessProjectionRequest {
  readonly roomId: RoomId;
  readonly memberId: RoomMemberId;
  readonly participantId: ParticipantId;
  readonly trigger: HarnessProjectionTrigger;
  readonly afterSequence?: number;
  readonly limit?: number;
}

export type ProjectedRoom = Pick<
  Room,
  | "id"
  | "displayName"
  | "topic"
  | "createdAt"
  | "updatedAt"
  | "defaultVisibility"
  | "permissionPolicy"
>;

export type ProjectedRoomMember = Pick<
  RoomMember,
  "id" | "roomId" | "participantId" | "kind" | "role" | "status" | "displayName"
>;

export interface ProjectedRoomMessage extends Pick<
  RoomMessage,
  | "id"
  | "roomId"
  | "sequence"
  | "sender"
  | "kind"
  | "createdAt"
  | "text"
  | "content"
  | "llmRole"
  | "thread"
  | "mentions"
  | "replyTo"
  | "references"
  | "attachments"
  | "evidence"
  | "trace"
> {
  readonly visibility: RoomVisibility;
  readonly notification: RoomNotificationPolicy;
}

export interface ProjectedRoomEvent extends Pick<
  RoomEvent,
  | "id"
  | "roomId"
  | "sequence"
  | "type"
  | "createdAt"
  | "actor"
  | "messageId"
  | "memberId"
  | "fileId"
> {
  readonly visibility: RoomVisibility;
  readonly notification: RoomNotificationPolicy;
}

export type ProjectedAnnouncement = Pick<
  Announcement,
  | "id"
  | "roomId"
  | "title"
  | "body"
  | "createdAt"
  | "updatedAt"
  | "createdByMemberId"
  | "visibility"
>;

export type ProjectedPinnedItem = Pick<
  PinnedItem,
  | "id"
  | "roomId"
  | "kind"
  | "messageId"
  | "announcementId"
  | "fileId"
  | "uri"
  | "label"
  | "createdAt"
  | "createdByMemberId"
>;

export type ProjectedRoomFile = Pick<
  RoomFile,
  "id" | "roomId" | "name" | "createdAt" | "addedBy" | "contentType" | "sizeBytes" | "uri"
>;

export type ProjectedDoc = Pick<
  Doc,
  | "id"
  | "contextRoomId"
  | "title"
  | "format"
  | "status"
  | "body"
  | "createdAt"
  | "updatedAt"
  | "createdByMemberId"
  | "currentRevisionId"
  | "visibility"
>;

export type ProjectedDocComment = Pick<
  DocComment,
  | "id"
  | "docId"
  | "contextRoomId"
  | "revisionId"
  | "body"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "createdByMemberId"
  | "resolvedAt"
  | "resolvedByMemberId"
  | "mentions"
  | "anchor"
  | "visibility"
>;

export interface HarnessProjection {
  readonly request: HarnessProjectionRequest;
  readonly room: ProjectedRoom;
  readonly viewer: ProjectedRoomMember;
  readonly members: readonly ProjectedRoomMember[];
  readonly messages: readonly ProjectedRoomMessage[];
  readonly events: readonly ProjectedRoomEvent[];
  readonly announcements: readonly ProjectedAnnouncement[];
  readonly pins: readonly ProjectedPinnedItem[];
  readonly files: readonly ProjectedRoomFile[];
  readonly docs: readonly ProjectedDoc[];
  readonly docComments: readonly ProjectedDocComment[];
}

export const isHarnessProjectionTriggerType = (
  value: unknown,
): value is HarnessProjectionTriggerType =>
  typeof value === "string" &&
  HARNESS_PROJECTION_TRIGGER_TYPES.includes(value as HarnessProjectionTriggerType);
