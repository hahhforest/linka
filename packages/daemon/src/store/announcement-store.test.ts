import assert from "node:assert/strict";

import {
  announcementId,
  participantId,
  roomId,
  roomMemberId,
  type Announcement,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  type RoomPermissions,
  unixMs,
} from "@linka/shared";

import { openDatabase, type DatabaseHandle } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { createAnnouncementStore, type AnnouncementStore } from "./announcement-store.js";
import { DaemonDatabaseError } from "./event-store.js";
import { createRoomStore } from "./room-store.js";

const allPermissions: RoomPermissions = {
  canReadHistory: true,
  canPostMessage: true,
  canMentionMembers: true,
  canUploadFiles: true,
  canManageMembers: true,
};

const permissionPolicy: PermissionPolicy = {
  owner: allPermissions,
  admin: allPermissions,
  member: allPermissions,
  guest: {
    ...allPermissions,
    canManageMembers: false,
  },
};

const notificationPolicy = { level: "normal" as const };
const roomVisibility = { scope: "room" as const };
const now = unixMs(1_716_000_000_000);

interface AnnouncementStoreContext {
  readonly handle: DatabaseHandle;
  readonly announcements: AnnouncementStore;
  readonly room: Room;
  readonly owner: RoomMember;
}

const makeMember = (suffix: string, role: RoomMember["role"]): RoomMember => ({
  id: roomMemberId(`rmem_${suffix}`),
  roomId: roomId("room_announcement_context"),
  participantId: participantId(`part_${suffix}`),
  kind: "human",
  role,
  status: "active",
  displayName: suffix,
  joinedAt: unixMs(1_716_000_000_100),
  permissions: allPermissions,
  notificationPolicy,
});

const withAnnouncementStore = (run: (context: AnnouncementStoreContext) => void): void => {
  const handle = openDatabase({ databasePath: ":memory:" });

  try {
    runMigrations(handle);

    const rooms = createRoomStore(handle);
    const announcements = createAnnouncementStore(handle);
    const room: Room = {
      id: roomId("room_announcement_context"),
      displayName: "Announcements Room",
      topic: "announcement store test",
      createdAt: now,
      updatedAt: now,
      defaultVisibility: roomVisibility,
      notificationPolicy,
      permissionPolicy,
    };
    rooms.createRoom(room);

    const owner = rooms.addMember(makeMember("announcement_owner", "owner"));
    run({ handle, announcements, room, owner });
  } finally {
    handle.close();
  }
};

const makeAnnouncement = (owner: RoomMember): Announcement => ({
  id: announcementId("ann_review_standard"),
  roomId: owner.roomId,
  title: "Review Standard",
  body: "Check evidence before merging.",
  createdAt: now,
  updatedAt: now,
  createdByMemberId: owner.id,
  visibility: { scope: "members", memberIds: [owner.id] },
});

const withoutMigrations = openDatabase({ databasePath: ":memory:" });
try {
  assert.throws(
    () => createAnnouncementStore(withoutMigrations),
    (error) =>
      error instanceof DaemonDatabaseError &&
      error.message === "runMigrations must be called before createAnnouncementStore",
  );
} finally {
  withoutMigrations.close();
}

withAnnouncementStore(({ announcements, room, owner }) => {
  const announcement = makeAnnouncement(owner);
  const createdAnnouncement = announcements.createAnnouncement(announcement);

  assert.deepEqual(createdAnnouncement, announcement);
  assert.deepEqual(announcements.getAnnouncement(announcement.id), announcement);
  assert.deepEqual(announcements.listAnnouncementsByRoom(room.id), [announcement]);

  const updatedAnnouncement: Announcement = {
    ...announcement,
    title: undefined,
    body: "Use source-backed claims before merging.",
    updatedAt: unixMs(1_716_000_000_010),
    visibility: roomVisibility,
  };
  assert.deepEqual(announcements.updateAnnouncement(updatedAnnouncement), updatedAnnouncement);
  assert.deepEqual(announcements.getAnnouncement(announcement.id), updatedAnnouncement);
  assert.deepEqual(announcements.listAnnouncementsByRoom(room.id), [updatedAnnouncement]);

  assert.equal(announcements.deleteAnnouncement(announcement.id), true);
  assert.equal(announcements.deleteAnnouncement(announcement.id), false);
  assert.deepEqual(announcements.listAnnouncementsByRoom(room.id), []);
});

withAnnouncementStore(({ handle, announcements, room, owner }) => {
  handle.database
    .prepare(
      `
        INSERT INTO announcements (
          announcement_id,
          room_id,
          title,
          body,
          created_at,
          updated_at,
          created_by_member_id,
          visibility_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "ann_bad_visibility",
      room.id,
      "Bad visibility",
      "body",
      now,
      now,
      owner.id,
      JSON.stringify([]),
    );

  assert.throws(
    () => announcements.getAnnouncement(announcementId("ann_bad_visibility")),
    /announcement visibility_json in database must be a JSON object/,
  );
});

console.log("announcement store: ok");
