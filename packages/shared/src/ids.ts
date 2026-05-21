import type { Brand } from "./primitives.js";

export type RoomId = Brand<string, "RoomId">;
export type RoomMemberId = Brand<string, "RoomMemberId">;
export type RoomMessageId = Brand<string, "RoomMessageId">;
export type RoomEventId = Brand<string, "RoomEventId">;
export type ParticipantId = Brand<string, "ParticipantId">;
export type AttachmentId = Brand<string, "AttachmentId">;
export type RoomFileId = Brand<string, "RoomFileId">;
export type AnnouncementId = Brand<string, "AnnouncementId">;
export type PinnedItemId = Brand<string, "PinnedItemId">;
export type DocId = Brand<string, "DocId">;
export type DocRevisionId = Brand<string, "DocRevisionId">;
export type DocCommentId = Brand<string, "DocCommentId">;
export type HarnessSessionId = Brand<string, "HarnessSessionId">;
export type HarnessTurnId = Brand<string, "HarnessTurnId">;
export type HarnessTriggerId = Brand<string, "HarnessTriggerId">;
export type HarnessRunId = Brand<string, "HarnessRunId">;
export type HarnessContextSnapshotId = Brand<string, "HarnessContextSnapshotId">;
export type RuntimeProcessId = Brand<string, "RuntimeProcessId">;
export type RuntimeSessionId = Brand<string, "RuntimeSessionId">;
export type PendingInteractionId = Brand<string, "PendingInteractionId">;
export type RuntimeEventId = Brand<string, "RuntimeEventId">;

export const ID_PREFIXES = {
  room: "room_",
  roomMember: "rmem_",
  roomMessage: "rmsg_",
  roomEvent: "revt_",
  participant: "part_",
  attachment: "att_",
  roomFile: "rfile_",
  announcement: "ann_",
  pinnedItem: "pin_",
  doc: "doc_",
  docRevision: "drev_",
  docComment: "dcmt_",
  harnessSession: "hsess_",
  harnessTurn: "hturn_",
  harnessTrigger: "htrig_",
  harnessRun: "hrun_",
  harnessContextSnapshot: "hctx_",
  runtimeProcess: "rproc_",
  runtimeSession: "rsess_",
  pendingInteraction: "pint_",
  runtimeEvent: "rtevt_",
} as const;

type IdPrefixKey = keyof typeof ID_PREFIXES;

type IdOf<Key extends IdPrefixKey> = Key extends "room"
  ? RoomId
  : Key extends "roomMember"
    ? RoomMemberId
    : Key extends "roomMessage"
      ? RoomMessageId
      : Key extends "roomEvent"
        ? RoomEventId
        : Key extends "participant"
          ? ParticipantId
          : Key extends "attachment"
            ? AttachmentId
            : Key extends "roomFile"
              ? RoomFileId
              : Key extends "announcement"
                ? AnnouncementId
                : Key extends "pinnedItem"
                  ? PinnedItemId
                  : Key extends "doc"
                    ? DocId
                    : Key extends "docRevision"
                      ? DocRevisionId
                      : Key extends "docComment"
                        ? DocCommentId
                        : Key extends "harnessSession"
                          ? HarnessSessionId
                          : Key extends "harnessTurn"
                            ? HarnessTurnId
                            : Key extends "harnessTrigger"
                              ? HarnessTriggerId
                              : Key extends "harnessRun"
                                ? HarnessRunId
                                : Key extends "harnessContextSnapshot"
                                  ? HarnessContextSnapshotId
                                  : Key extends "runtimeProcess"
                                    ? RuntimeProcessId
                                    : Key extends "runtimeSession"
                                      ? RuntimeSessionId
                                      : Key extends "pendingInteraction"
                                        ? PendingInteractionId
                                        : RuntimeEventId;

const ID_SUFFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const isPrefixedId = <Key extends IdPrefixKey>(value: unknown, key: Key): value is IdOf<Key> => {
  if (typeof value !== "string") {
    return false;
  }

  const prefix = ID_PREFIXES[key];

  return value.startsWith(prefix) && ID_SUFFIX_PATTERN.test(value.slice(prefix.length));
};

const parsePrefixedId = <Key extends IdPrefixKey>(
  value: unknown,
  key: Key,
): IdOf<Key> | undefined => (isPrefixedId(value, key) ? value : undefined);

const toPrefixedId = <Key extends IdPrefixKey>(
  value: string,
  key: Key,
  label: string,
): IdOf<Key> => {
  const parsed = parsePrefixedId(value, key);

  if (!parsed) {
    throw new TypeError(`Invalid ${label}: ${value}`);
  }

  return parsed;
};

export const isRoomId = (value: unknown): value is RoomId => isPrefixedId(value, "room");
export const parseRoomId = (value: unknown): RoomId | undefined => parsePrefixedId(value, "room");
export const roomId = (value: string): RoomId => toPrefixedId(value, "room", "RoomId");

export const isRoomMemberId = (value: unknown): value is RoomMemberId =>
  isPrefixedId(value, "roomMember");
export const parseRoomMemberId = (value: unknown): RoomMemberId | undefined =>
  parsePrefixedId(value, "roomMember");
export const roomMemberId = (value: string): RoomMemberId =>
  toPrefixedId(value, "roomMember", "RoomMemberId");

export const isRoomMessageId = (value: unknown): value is RoomMessageId =>
  isPrefixedId(value, "roomMessage");
export const parseRoomMessageId = (value: unknown): RoomMessageId | undefined =>
  parsePrefixedId(value, "roomMessage");
export const roomMessageId = (value: string): RoomMessageId =>
  toPrefixedId(value, "roomMessage", "RoomMessageId");

export const isRoomEventId = (value: unknown): value is RoomEventId =>
  isPrefixedId(value, "roomEvent");
export const parseRoomEventId = (value: unknown): RoomEventId | undefined =>
  parsePrefixedId(value, "roomEvent");
export const roomEventId = (value: string): RoomEventId =>
  toPrefixedId(value, "roomEvent", "RoomEventId");

export const isParticipantId = (value: unknown): value is ParticipantId =>
  isPrefixedId(value, "participant");
export const parseParticipantId = (value: unknown): ParticipantId | undefined =>
  parsePrefixedId(value, "participant");
export const participantId = (value: string): ParticipantId =>
  toPrefixedId(value, "participant", "ParticipantId");

export const isAttachmentId = (value: unknown): value is AttachmentId =>
  isPrefixedId(value, "attachment");
export const parseAttachmentId = (value: unknown): AttachmentId | undefined =>
  parsePrefixedId(value, "attachment");
export const attachmentId = (value: string): AttachmentId =>
  toPrefixedId(value, "attachment", "AttachmentId");

export const isRoomFileId = (value: unknown): value is RoomFileId =>
  isPrefixedId(value, "roomFile");
export const parseRoomFileId = (value: unknown): RoomFileId | undefined =>
  parsePrefixedId(value, "roomFile");
export const roomFileId = (value: string): RoomFileId =>
  toPrefixedId(value, "roomFile", "RoomFileId");

export const isAnnouncementId = (value: unknown): value is AnnouncementId =>
  isPrefixedId(value, "announcement");
export const parseAnnouncementId = (value: unknown): AnnouncementId | undefined =>
  parsePrefixedId(value, "announcement");
export const announcementId = (value: string): AnnouncementId =>
  toPrefixedId(value, "announcement", "AnnouncementId");

export const isPinnedItemId = (value: unknown): value is PinnedItemId =>
  isPrefixedId(value, "pinnedItem");
export const parsePinnedItemId = (value: unknown): PinnedItemId | undefined =>
  parsePrefixedId(value, "pinnedItem");
export const pinnedItemId = (value: string): PinnedItemId =>
  toPrefixedId(value, "pinnedItem", "PinnedItemId");

export const isDocId = (value: unknown): value is DocId => isPrefixedId(value, "doc");
export const parseDocId = (value: unknown): DocId | undefined => parsePrefixedId(value, "doc");
export const docId = (value: string): DocId => toPrefixedId(value, "doc", "DocId");

export const isDocRevisionId = (value: unknown): value is DocRevisionId =>
  isPrefixedId(value, "docRevision");
export const parseDocRevisionId = (value: unknown): DocRevisionId | undefined =>
  parsePrefixedId(value, "docRevision");
export const docRevisionId = (value: string): DocRevisionId =>
  toPrefixedId(value, "docRevision", "DocRevisionId");

export const isDocCommentId = (value: unknown): value is DocCommentId =>
  isPrefixedId(value, "docComment");
export const parseDocCommentId = (value: unknown): DocCommentId | undefined =>
  parsePrefixedId(value, "docComment");
export const docCommentId = (value: string): DocCommentId =>
  toPrefixedId(value, "docComment", "DocCommentId");

export const isHarnessSessionId = (value: unknown): value is HarnessSessionId =>
  isPrefixedId(value, "harnessSession");
export const parseHarnessSessionId = (value: unknown): HarnessSessionId | undefined =>
  parsePrefixedId(value, "harnessSession");
export const harnessSessionId = (value: string): HarnessSessionId =>
  toPrefixedId(value, "harnessSession", "HarnessSessionId");

export const isHarnessTurnId = (value: unknown): value is HarnessTurnId =>
  isPrefixedId(value, "harnessTurn");
export const parseHarnessTurnId = (value: unknown): HarnessTurnId | undefined =>
  parsePrefixedId(value, "harnessTurn");
export const harnessTurnId = (value: string): HarnessTurnId =>
  toPrefixedId(value, "harnessTurn", "HarnessTurnId");

export const isHarnessTriggerId = (value: unknown): value is HarnessTriggerId =>
  isPrefixedId(value, "harnessTrigger");
export const parseHarnessTriggerId = (value: unknown): HarnessTriggerId | undefined =>
  parsePrefixedId(value, "harnessTrigger");
export const harnessTriggerId = (value: string): HarnessTriggerId =>
  toPrefixedId(value, "harnessTrigger", "HarnessTriggerId");

export const isHarnessRunId = (value: unknown): value is HarnessRunId =>
  isPrefixedId(value, "harnessRun");
export const parseHarnessRunId = (value: unknown): HarnessRunId | undefined =>
  parsePrefixedId(value, "harnessRun");
export const harnessRunId = (value: string): HarnessRunId =>
  toPrefixedId(value, "harnessRun", "HarnessRunId");

export const isHarnessContextSnapshotId = (value: unknown): value is HarnessContextSnapshotId =>
  isPrefixedId(value, "harnessContextSnapshot");
export const parseHarnessContextSnapshotId = (
  value: unknown,
): HarnessContextSnapshotId | undefined => parsePrefixedId(value, "harnessContextSnapshot");
export const harnessContextSnapshotId = (value: string): HarnessContextSnapshotId =>
  toPrefixedId(value, "harnessContextSnapshot", "HarnessContextSnapshotId");

export const isRuntimeProcessId = (value: unknown): value is RuntimeProcessId =>
  isPrefixedId(value, "runtimeProcess");
export const parseRuntimeProcessId = (value: unknown): RuntimeProcessId | undefined =>
  parsePrefixedId(value, "runtimeProcess");
export const runtimeProcessId = (value: string): RuntimeProcessId =>
  toPrefixedId(value, "runtimeProcess", "RuntimeProcessId");

export const isRuntimeSessionId = (value: unknown): value is RuntimeSessionId =>
  isPrefixedId(value, "runtimeSession");
export const parseRuntimeSessionId = (value: unknown): RuntimeSessionId | undefined =>
  parsePrefixedId(value, "runtimeSession");
export const runtimeSessionId = (value: string): RuntimeSessionId =>
  toPrefixedId(value, "runtimeSession", "RuntimeSessionId");

export const isPendingInteractionId = (value: unknown): value is PendingInteractionId =>
  isPrefixedId(value, "pendingInteraction");
export const parsePendingInteractionId = (value: unknown): PendingInteractionId | undefined =>
  parsePrefixedId(value, "pendingInteraction");
export const pendingInteractionId = (value: string): PendingInteractionId =>
  toPrefixedId(value, "pendingInteraction", "PendingInteractionId");

export const isRuntimeEventId = (value: unknown): value is RuntimeEventId =>
  isPrefixedId(value, "runtimeEvent");
export const parseRuntimeEventId = (value: unknown): RuntimeEventId | undefined =>
  parsePrefixedId(value, "runtimeEvent");
export const runtimeEventId = (value: string): RuntimeEventId =>
  toPrefixedId(value, "runtimeEvent", "RuntimeEventId");
