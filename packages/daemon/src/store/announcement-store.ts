import {
  announcementId,
  roomId,
  roomMemberId,
  type Announcement,
  type RoomId,
  type RoomVisibility,
  unixMs,
} from "@linka/shared";

import type { DatabaseHandle } from "../db/connection.js";
import { DaemonDatabaseError } from "./event-store.js";

export interface AnnouncementStore {
  createAnnouncement(announcement: Announcement): Announcement;
  updateAnnouncement(announcement: Announcement): Announcement;
  deleteAnnouncement(id: Announcement["id"]): boolean;
  getAnnouncement(id: Announcement["id"]): Announcement | undefined;
  listAnnouncementsByRoom(roomId: RoomId): readonly Announcement[];
}

interface AnnouncementRow {
  readonly announcement_id: string;
  readonly room_id: string;
  readonly title: string | null;
  readonly body: string;
  readonly created_at: number;
  readonly updated_at: number;
  readonly created_by_member_id: string | null;
  readonly visibility_json: string;
}

const tableExists = (handle: DatabaseHandle, tableName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
};

const assertSchemaReady = (handle: DatabaseHandle): void => {
  if (!tableExists(handle, "announcements")) {
    throw new DaemonDatabaseError("runMigrations must be called before createAnnouncementStore");
  }
};

const stringifyJson = (value: unknown, label: string): string => {
  const json = JSON.stringify(value);

  if (json === undefined) {
    throw new Error(`${label} must be JSON-serializable`);
  }

  return json;
};

const parseJsonValue = (value: string, label: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} in database contains invalid JSON`);
  }
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonObject = <T>(value: string, label: string): T => {
  const parsed = parseJsonValue(value, label);

  if (!isJsonObject(parsed)) {
    throw new Error(`${label} in database must be a JSON object`);
  }

  return parsed as T;
};

const toAnnouncement = (row: AnnouncementRow): Announcement => ({
  id: announcementId(row.announcement_id),
  roomId: roomId(row.room_id),
  title: row.title ?? undefined,
  body: row.body,
  createdAt: unixMs(row.created_at),
  updatedAt: unixMs(row.updated_at),
  createdByMemberId:
    row.created_by_member_id === null ? undefined : roomMemberId(row.created_by_member_id),
  visibility: parseJsonObject<RoomVisibility>(
    row.visibility_json,
    "announcement visibility_json",
  ),
});

export const createAnnouncementStore = (handle: DatabaseHandle): AnnouncementStore => {
  assertSchemaReady(handle);

  const { database } = handle;
  const insertAnnouncement = database.prepare(`
    INSERT INTO announcements (
      announcement_id,
      room_id,
      title,
      body,
      created_at,
      updated_at,
      created_by_member_id,
      visibility_json
    ) VALUES (
      @id,
      @roomId,
      @title,
      @body,
      @createdAt,
      @updatedAt,
      @createdByMemberId,
      @visibilityJson
    )
  `);
  const selectAnnouncement = database.prepare(
    "SELECT * FROM announcements WHERE announcement_id = ?",
  );
  const listAnnouncementsByRoom = database.prepare(`
    SELECT * FROM announcements
    WHERE room_id = ?
    ORDER BY updated_at ASC, announcement_id ASC
  `);
  const updateAnnouncement = database.prepare(`
    UPDATE announcements
    SET
      room_id = @roomId,
      title = @title,
      body = @body,
      updated_at = @updatedAt,
      created_by_member_id = @createdByMemberId,
      visibility_json = @visibilityJson
    WHERE announcement_id = @id
  `);
  const deleteAnnouncement = database.prepare(
    "DELETE FROM announcements WHERE announcement_id = ?",
  );

  return {
    createAnnouncement: (announcement) => {
      insertAnnouncement.run({
        id: announcement.id,
        roomId: announcement.roomId,
        title: announcement.title ?? null,
        body: announcement.body,
        createdAt: announcement.createdAt,
        updatedAt: announcement.updatedAt,
        createdByMemberId: announcement.createdByMemberId ?? null,
        visibilityJson: stringifyJson(announcement.visibility, "announcement visibility"),
      });

      const row = selectAnnouncement.get(announcement.id) as AnnouncementRow | undefined;
      if (!row) {
        throw new Error("failed to read created announcement");
      }

      return toAnnouncement(row);
    },

    updateAnnouncement: (announcement) => {
      const result = updateAnnouncement.run({
        id: announcement.id,
        roomId: announcement.roomId,
        title: announcement.title ?? null,
        body: announcement.body,
        updatedAt: announcement.updatedAt,
        createdByMemberId: announcement.createdByMemberId ?? null,
        visibilityJson: stringifyJson(announcement.visibility, "announcement visibility"),
      });

      if (result.changes !== 1) {
        throw new Error("failed to update announcement");
      }

      const row = selectAnnouncement.get(announcement.id) as AnnouncementRow | undefined;
      if (!row) {
        throw new Error("failed to read updated announcement");
      }

      return toAnnouncement(row);
    },

    deleteAnnouncement: (id) => {
      const result = deleteAnnouncement.run(id);
      return result.changes === 1;
    },

    getAnnouncement: (id) => {
      const row = selectAnnouncement.get(id) as AnnouncementRow | undefined;
      return row ? toAnnouncement(row) : undefined;
    },

    listAnnouncementsByRoom: (id) => {
      const rows = listAnnouncementsByRoom.all(id) as AnnouncementRow[];
      return rows.map(toAnnouncement);
    },
  };
};
