import type { DocCommentId, DocId, DocRevisionId, RoomId, RoomMemberId } from "./ids.js";
import type { UnixMs } from "./primitives.js";
import type { RoomVisibility } from "./room.js";

export const DOC_FORMATS = ["markdown", "plain_text"] as const;
export type DocFormat = (typeof DOC_FORMATS)[number];

export const DOC_STATUSES = ["draft", "active", "archived"] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const DOC_REVISION_STATUSES = ["draft", "committed", "superseded"] as const;
export type DocRevisionStatus = (typeof DOC_REVISION_STATUSES)[number];

export const DOC_COMMENT_STATUSES = ["open", "resolved", "deleted"] as const;
export type DocCommentStatus = (typeof DOC_COMMENT_STATUSES)[number];

export const DOC_MENTION_KINDS = ["member"] as const;
export type DocMentionKind = (typeof DOC_MENTION_KINDS)[number];

export interface DocMention {
  readonly kind: DocMentionKind;
  readonly memberId: RoomMemberId;
  readonly displayText?: string;
}

export interface Doc {
  readonly id: DocId;
  readonly contextRoomId: RoomId;
  readonly title: string;
  readonly format: DocFormat;
  readonly status: DocStatus;
  readonly body: string;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly createdByMemberId: RoomMemberId;
  readonly currentRevisionId?: DocRevisionId;
  readonly visibility: RoomVisibility;
}

export interface DocRevision {
  readonly id: DocRevisionId;
  readonly docId: DocId;
  readonly contextRoomId: RoomId;
  readonly revisionNumber: number;
  readonly format: DocFormat;
  readonly status: DocRevisionStatus;
  readonly body: string;
  readonly title?: string;
  readonly createdAt: UnixMs;
  readonly createdByMemberId: RoomMemberId;
  readonly parentRevisionId?: DocRevisionId;
  readonly summary?: string;
}

export interface DocCommentAnchor {
  readonly revisionId?: DocRevisionId;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly quote?: string;
}

export interface DocComment {
  readonly id: DocCommentId;
  readonly docId: DocId;
  readonly contextRoomId: RoomId;
  readonly revisionId?: DocRevisionId;
  readonly body: string;
  readonly status: DocCommentStatus;
  readonly createdAt: UnixMs;
  readonly updatedAt: UnixMs;
  readonly createdByMemberId: RoomMemberId;
  readonly resolvedAt?: UnixMs;
  readonly resolvedByMemberId?: RoomMemberId;
  readonly mentions?: readonly DocMention[];
  readonly anchor?: DocCommentAnchor;
  readonly visibility: RoomVisibility;
}

export const isDocFormat = (value: unknown): value is DocFormat =>
  typeof value === "string" && DOC_FORMATS.includes(value as DocFormat);

export const isDocStatus = (value: unknown): value is DocStatus =>
  typeof value === "string" && DOC_STATUSES.includes(value as DocStatus);

export const isDocRevisionStatus = (value: unknown): value is DocRevisionStatus =>
  typeof value === "string" && DOC_REVISION_STATUSES.includes(value as DocRevisionStatus);

export const isDocCommentStatus = (value: unknown): value is DocCommentStatus =>
  typeof value === "string" && DOC_COMMENT_STATUSES.includes(value as DocCommentStatus);

export const isDocMentionKind = (value: unknown): value is DocMentionKind =>
  typeof value === "string" && DOC_MENTION_KINDS.includes(value as DocMentionKind);
