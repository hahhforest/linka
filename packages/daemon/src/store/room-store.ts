import {
  ROOM_MEMBER_ROLES,
  ROOM_MEMBER_STATUSES,
  isRoomMemberKind,
  participantId,
  roomId,
  roomMemberId,
  type Room,
  type RoomMember,
  type RoomMemberKind,
  type RoomMemberRole,
  type RoomMemberStatus,
  unixMs,
  type RoomNotificationPolicy,
  type RoomPermissions,
  type RoomVisibility,
} from "@linka/shared";

import type { DatabaseHandle } from "../db/connection.js";
import { DaemonDatabaseError } from "./event-store.js";

export interface RoomStore {
  createRoom(room: Room): Room;
  getRoom(id: Room["id"]): Room | undefined;
  listRooms(): readonly Room[];
  addMember(member: RoomMember): RoomMember;
  listMembers(id: Room["id"]): readonly RoomMember[];
}

interface RoomRow {
  readonly room_id: string;
  readonly display_name: string;
  readonly topic: string | null;
  readonly created_at: number;
  readonly updated_at: number;
  readonly created_by_member_id: string | null;
  readonly owner_member_id: string | null;
  readonly default_visibility_json: string;
  readonly notification_policy_json: string;
  readonly permission_policy_json: string;
}

interface RoomMemberRow {
  readonly member_id: string;
  readonly room_id: string;
  readonly participant_id: string;
  readonly kind: string;
  readonly role: string;
  readonly status: string;
  readonly display_name: string;
  readonly avatar_url: string | null;
  readonly joined_at: number | null;
  readonly last_seen_at: number | null;
  readonly permissions_json: string;
  readonly notification_policy_json: string;
}

const tableExists = (handle: DatabaseHandle, tableName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
};

const assertSchemaReady = (handle: DatabaseHandle): void => {
  if (!tableExists(handle, "rooms") || !tableExists(handle, "room_members")) {
    throw new DaemonDatabaseError("runMigrations must be called before createRoomStore");
  }
};

const stringifyJson = (value: unknown, label: string): string => {
  const json = JSON.stringify(value);

  if (json === undefined) {
    throw new Error(`${label} must be JSON-serializable`);
  }

  return json;
};

const parseJson = <T>(value: string): T => JSON.parse(value) as T;

const parseRoomMemberKind = (value: string): RoomMemberKind => {
  if (!isRoomMemberKind(value)) {
    throw new Error("Invalid room member kind in database: " + value);
  }

  return value;
};

const parseRoomMemberRole = (value: string): RoomMemberRole => {
  switch (value) {
    case "owner":
    case "admin":
    case "member":
    case "guest":
      return value;
    default:
      throw new Error(
        "Invalid room member role in database: " +
          value +
          "; expected one of " +
          ROOM_MEMBER_ROLES.join(", "),
      );
  }
};

const parseRoomMemberStatus = (value: string): RoomMemberStatus => {
  switch (value) {
    case "invited":
    case "active":
    case "left":
    case "removed":
      return value;
    default:
      throw new Error(
        "Invalid room member status in database: " +
          value +
          "; expected one of " +
          ROOM_MEMBER_STATUSES.join(", "),
      );
  }
};

const toRoom = (row: RoomRow): Room => ({
  id: roomId(row.room_id),
  displayName: row.display_name,
  topic: row.topic ?? undefined,
  createdAt: unixMs(row.created_at),
  updatedAt: unixMs(row.updated_at),
  createdByMemberId: row.created_by_member_id ? roomMemberId(row.created_by_member_id) : undefined,
  ownerMemberId: row.owner_member_id ? roomMemberId(row.owner_member_id) : undefined,
  defaultVisibility: parseJson<RoomVisibility>(row.default_visibility_json),
  notificationPolicy: parseJson<RoomNotificationPolicy>(row.notification_policy_json),
  permissionPolicy: parseJson<Room["permissionPolicy"]>(row.permission_policy_json),
});

const toRoomMember = (row: RoomMemberRow): RoomMember => ({
  id: roomMemberId(row.member_id),
  roomId: roomId(row.room_id),
  participantId: participantId(row.participant_id),
  kind: parseRoomMemberKind(row.kind),
  role: parseRoomMemberRole(row.role),
  status: parseRoomMemberStatus(row.status),
  displayName: row.display_name,
  avatarUrl: row.avatar_url ?? undefined,
  joinedAt: row.joined_at === null ? undefined : unixMs(row.joined_at),
  lastSeenAt: row.last_seen_at === null ? undefined : unixMs(row.last_seen_at),
  permissions: parseJson<RoomPermissions>(row.permissions_json),
  notificationPolicy: parseJson<RoomNotificationPolicy>(row.notification_policy_json),
});

export const createRoomStore = (handle: DatabaseHandle): RoomStore => {
  assertSchemaReady(handle);

  const { database } = handle;
  const insertRoom = database.prepare(`
    INSERT INTO rooms (
      room_id,
      display_name,
      topic,
      created_at,
      updated_at,
      created_by_member_id,
      owner_member_id,
      default_visibility_json,
      notification_policy_json,
      permission_policy_json
    ) VALUES (
      @id,
      @displayName,
      @topic,
      @createdAt,
      @updatedAt,
      @createdByMemberId,
      @ownerMemberId,
      @defaultVisibilityJson,
      @notificationPolicyJson,
      @permissionPolicyJson
    )
  `);
  const selectRoom = database.prepare("SELECT * FROM rooms WHERE room_id = ?");
  const listRooms = database.prepare("SELECT * FROM rooms ORDER BY created_at ASC, room_id ASC");
  const insertMember = database.prepare(`
    INSERT INTO room_members (
      member_id,
      room_id,
      participant_id,
      kind,
      role,
      status,
      display_name,
      avatar_url,
      joined_at,
      last_seen_at,
      permissions_json,
      notification_policy_json
    ) VALUES (
      @id,
      @roomId,
      @participantId,
      @kind,
      @role,
      @status,
      @displayName,
      @avatarUrl,
      @joinedAt,
      @lastSeenAt,
      @permissionsJson,
      @notificationPolicyJson
    )
  `);
  const selectMember = database.prepare("SELECT * FROM room_members WHERE member_id = ?");
  const listMembers = database.prepare(`
    SELECT * FROM room_members
    WHERE room_id = ?
    ORDER BY joined_at ASC, member_id ASC
  `);

  return {
    createRoom: (room) => {
      insertRoom.run({
        id: room.id,
        displayName: room.displayName,
        topic: room.topic ?? null,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        createdByMemberId: room.createdByMemberId ?? null,
        ownerMemberId: room.ownerMemberId ?? null,
        defaultVisibilityJson: stringifyJson(room.defaultVisibility, "room defaultVisibility"),
        notificationPolicyJson: stringifyJson(room.notificationPolicy, "room notificationPolicy"),
        permissionPolicyJson: stringifyJson(room.permissionPolicy, "room permissionPolicy"),
      });

      const row = selectRoom.get(room.id) as RoomRow | undefined;
      if (!row) {
        throw new Error("failed to read created room");
      }

      return toRoom(row);
    },

    getRoom: (id) => {
      const row = selectRoom.get(id) as RoomRow | undefined;
      return row ? toRoom(row) : undefined;
    },

    listRooms: () => {
      const rows = listRooms.all() as RoomRow[];
      return rows.map(toRoom);
    },

    addMember: (member) => {
      insertMember.run({
        id: member.id,
        roomId: member.roomId,
        participantId: member.participantId,
        kind: member.kind,
        role: member.role,
        status: member.status,
        displayName: member.displayName,
        avatarUrl: member.avatarUrl ?? null,
        joinedAt: member.joinedAt ?? null,
        lastSeenAt: member.lastSeenAt ?? null,
        permissionsJson: stringifyJson(member.permissions, "member permissions"),
        notificationPolicyJson: stringifyJson(
          member.notificationPolicy,
          "member notificationPolicy",
        ),
      });

      const row = selectMember.get(member.id) as RoomMemberRow | undefined;
      if (!row) {
        throw new Error("failed to read created room member");
      }

      return toRoomMember(row);
    },

    listMembers: (id) => {
      const rows = listMembers.all(id) as RoomMemberRow[];
      return rows.map(toRoomMember);
    },
  };
};
