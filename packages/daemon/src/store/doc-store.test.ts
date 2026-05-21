import assert from "node:assert/strict";

import {
  docCommentId,
  docId,
  docRevisionId,
  participantId,
  roomId,
  roomMemberId,
  type Doc,
  type DocComment,
  type DocRevision,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  type RoomPermissions,
  unixMs,
} from "@linka/shared";

import { openDatabase, type DatabaseHandle } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { DaemonDatabaseError } from "./event-store.js";
import { createDocStore, type DocStore } from "./doc-store.js";
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

interface DocStoreContext {
  readonly handle: DatabaseHandle;
  readonly docs: DocStore;
  readonly room: Room;
  readonly owner: RoomMember;
  readonly reviewer: RoomMember;
}

const makeMember = (suffix: string, role: RoomMember["role"]): RoomMember => ({
  id: roomMemberId(`rmem_${suffix}`),
  roomId: roomId("room_context"),
  participantId: participantId(`part_${suffix}`),
  kind: "human",
  role,
  status: "active",
  displayName: suffix,
  joinedAt: unixMs(1_716_000_000_100),
  permissions: allPermissions,
  notificationPolicy,
});

const withDocStore = (run: (context: DocStoreContext) => void): void => {
  const handle = openDatabase({ databasePath: ":memory:" });

  try {
    runMigrations(handle);

    const rooms = createRoomStore(handle);
    const docs = createDocStore(handle);
    const room: Room = {
      id: roomId("room_context"),
      displayName: "Docs Room",
      topic: "doc store test",
      createdAt: now,
      updatedAt: now,
      defaultVisibility: roomVisibility,
      notificationPolicy,
      permissionPolicy,
    };
    rooms.createRoom(room);

    const owner = rooms.addMember(makeMember("owner", "owner"));
    const reviewer = rooms.addMember(makeMember("reviewer", "member"));

    run({ handle, docs, room, owner, reviewer });
  } finally {
    handle.close();
  }
};

const makeDoc = (owner: RoomMember): Doc => ({
  id: docId("doc_brief"),
  contextRoomId: owner.roomId,
  title: "Brief",
  format: "markdown",
  status: "active",
  body: "# Brief\n\nShared context for the run.",
  createdAt: now,
  updatedAt: now,
  createdByMemberId: owner.id,
  currentRevisionId: undefined,
  visibility: { scope: "members", memberIds: [owner.id] },
});

const makeRevision = (doc: Doc, owner: RoomMember): DocRevision => ({
  id: docRevisionId("drev_brief_1"),
  docId: doc.id,
  contextRoomId: doc.contextRoomId,
  revisionNumber: 1,
  format: "markdown",
  status: "committed",
  body: doc.body,
  title: doc.title,
  createdAt: unixMs(1_716_000_000_010),
  createdByMemberId: owner.id,
  parentRevisionId: undefined,
  summary: "initial brief",
});

const makeComment = (doc: Doc, revision: DocRevision, author: RoomMember): DocComment => ({
  id: docCommentId("dcmt_brief_1"),
  docId: doc.id,
  contextRoomId: doc.contextRoomId,
  revisionId: revision.id,
  body: "Please check the opening line.",
  status: "open",
  createdAt: unixMs(1_716_000_000_020),
  updatedAt: unixMs(1_716_000_000_021),
  createdByMemberId: author.id,
  resolvedAt: undefined,
  resolvedByMemberId: undefined,
  mentions: [{ kind: "member", memberId: author.id, displayText: "@reviewer" }],
  anchor: { revisionId: revision.id, lineStart: 1, lineEnd: 1, quote: "# Brief" },
  visibility: { scope: "members", memberIds: [author.id] },
});

const withoutMigrations = openDatabase({ databasePath: ":memory:" });
try {
  assert.throws(
    () => createDocStore(withoutMigrations),
    (error) =>
      error instanceof DaemonDatabaseError &&
      error.message === "runMigrations must be called before createDocStore",
  );
} finally {
  withoutMigrations.close();
}

withDocStore(({ docs, room, owner, reviewer }) => {
  const doc = makeDoc(owner);
  const createdDoc = docs.createDoc(doc);

  assert.deepEqual(createdDoc, doc);
  assert.deepEqual(docs.getDoc(doc.id), doc);
  assert.deepEqual(docs.listDocsByRoom(room.id), [doc]);
  assert.deepEqual(docs.listRevisions(doc.id), []);

  const revision = makeRevision(doc, owner);
  assert.deepEqual(docs.createRevision(revision), revision);
  assert.deepEqual(docs.listRevisions(doc.id), [revision]);
  assert.deepEqual(docs.getDoc(doc.id), { ...doc, currentRevisionId: revision.id });

  const updatedDoc: Doc = {
    ...doc,
    title: "Updated Brief",
    body: "# Updated\n\nSaved body.",
    updatedAt: unixMs(1_716_000_000_030),
    currentRevisionId: revision.id,
  };
  const updateDoc = docs.updateDoc;
  assert.ok(updateDoc);
  assert.deepEqual(updateDoc(updatedDoc), updatedDoc);
  assert.deepEqual(docs.getDoc(doc.id), updatedDoc);

  const comment = makeComment(doc, revision, reviewer);
  assert.deepEqual(docs.createComment(comment), comment);
  assert.deepEqual(docs.listComments(doc.id), [comment]);

  assert.deepEqual(docs.listDocsByRoom(room.id), [updatedDoc]);
});

withDocStore(({ docs, owner }) => {
  const missingDoc = makeDoc(owner);
  const updateDoc = docs.updateDoc;

  assert.ok(updateDoc);

  assert.throws(
    () => updateDoc({ ...missingDoc, id: docId("doc_missing") }),
    /failed to update doc/,
  );
});

withDocStore(({ handle, docs, room, owner }) => {
  handle.database
    .prepare(
      `
        INSERT INTO docs (
          doc_id,
          context_room_id,
          title,
          format,
          status,
          body,
          created_at,
          updated_at,
          created_by_member_id,
          visibility_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "doc_bad_format",
      room.id,
      "Bad format",
      "board",
      "active",
      "body",
      now,
      now,
      owner.id,
      JSON.stringify(roomVisibility),
    );
  assert.throws(
    () => docs.getDoc(docId("doc_bad_format")),
    /Invalid doc format in database: board/,
  );

  handle.database
    .prepare(
      `
        INSERT INTO docs (
          doc_id,
          context_room_id,
          title,
          format,
          status,
          body,
          created_at,
          updated_at,
          created_by_member_id,
          visibility_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "doc_bad_status",
      room.id,
      "Bad status",
      "markdown",
      "published",
      "body",
      now,
      now,
      owner.id,
      JSON.stringify(roomVisibility),
    );
  assert.throws(
    () => docs.getDoc(docId("doc_bad_status")),
    /Invalid doc status in database: published/,
  );

  const doc = docs.createDoc({ ...makeDoc(owner), id: docId("doc_for_bad_children") });
  handle.database
    .prepare(
      `
        INSERT INTO doc_revisions (
          revision_id,
          doc_id,
          context_room_id,
          revision_number,
          format,
          status,
          body,
          created_at,
          created_by_member_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run("drev_bad_status", doc.id, room.id, 1, "markdown", "reviewing", "body", now, owner.id);
  assert.throws(
    () => docs.listRevisions(doc.id),
    /Invalid doc revision status in database: reviewing/,
  );

  handle.database
    .prepare(
      `
        INSERT INTO doc_comments (
          comment_id,
          doc_id,
          context_room_id,
          body,
          status,
          created_at,
          updated_at,
          created_by_member_id,
          visibility_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "dcmt_bad_status",
      doc.id,
      room.id,
      "body",
      "hidden",
      now,
      now,
      owner.id,
      JSON.stringify(roomVisibility),
    );
  assert.throws(() => docs.listComments(doc.id), /Invalid doc comment status in database: hidden/);
});

withDocStore(({ handle, docs, owner, reviewer }) => {
  const doc = docs.createDoc(makeDoc(owner));
  const revision = docs.createRevision(makeRevision(doc, owner));
  const comment = docs.createComment(makeComment(doc, revision, reviewer));

  handle.database.prepare("UPDATE docs SET visibility_json = ? WHERE doc_id = ?").run("[]", doc.id);
  assert.throws(() => docs.getDoc(doc.id), /doc visibility_json in database must be a JSON object/);

  handle.database
    .prepare("UPDATE docs SET visibility_json = ? WHERE doc_id = ?")
    .run(JSON.stringify(doc.visibility), doc.id);
  handle.database
    .prepare("UPDATE doc_comments SET mentions_json = ? WHERE comment_id = ?")
    .run(JSON.stringify({ kind: "member", memberId: reviewer.id }), comment.id);
  assert.throws(
    () => docs.listComments(doc.id),
    /doc comment mentions_json in database must be a JSON array/,
  );

  handle.database
    .prepare("UPDATE doc_comments SET mentions_json = ? WHERE comment_id = ?")
    .run(JSON.stringify([{ kind: "linka", memberId: reviewer.id }]), comment.id);
  assert.throws(() => docs.listComments(doc.id), /Invalid doc mention kind in database: linka/);

  handle.database
    .prepare("UPDATE doc_comments SET mentions_json = ?, anchor_json = ? WHERE comment_id = ?")
    .run(JSON.stringify(comment.mentions), "[]", comment.id);
  assert.throws(
    () => docs.listComments(doc.id),
    /doc comment anchor_json in database must be a JSON object/,
  );
});

console.log("doc store: ok");
