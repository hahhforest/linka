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
                : PinnedItemId;

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
