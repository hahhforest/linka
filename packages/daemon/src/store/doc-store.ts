import {
  docCommentId,
  docId,
  docRevisionId,
  isDocCommentStatus,
  isDocFormat,
  isDocMentionKind,
  isDocRevisionStatus,
  isDocStatus,
  roomId,
  roomMemberId,
  type Doc,
  type DocComment,
  type DocCommentAnchor,
  type DocCommentStatus,
  type DocFormat,
  type DocId,
  type DocMention,
  type DocRevision,
  type DocRevisionStatus,
  type DocStatus,
  type RoomId,
  type RoomVisibility,
  unixMs,
} from "@linka/shared";

import type { DatabaseHandle } from "../db/connection.js";
import { DaemonDatabaseError } from "./event-store.js";

export interface DocStore {
  createDoc(doc: Doc): Doc;
  getDoc(id: Doc["id"]): Doc | undefined;
  listDocsByRoom(contextRoomId: RoomId): readonly Doc[];
  createRevision(revision: DocRevision): DocRevision;
  listRevisions(docId: DocId): readonly DocRevision[];
  createComment(comment: DocComment): DocComment;
  listComments(docId: DocId): readonly DocComment[];
}

interface DocRow {
  readonly doc_id: string;
  readonly context_room_id: string;
  readonly title: string;
  readonly format: string;
  readonly status: string;
  readonly body: string;
  readonly created_at: number;
  readonly updated_at: number;
  readonly created_by_member_id: string;
  readonly current_revision_id: string | null;
  readonly visibility_json: string;
}

interface DocRevisionRow {
  readonly revision_id: string;
  readonly doc_id: string;
  readonly context_room_id: string;
  readonly revision_number: number;
  readonly format: string;
  readonly status: string;
  readonly body: string;
  readonly title: string | null;
  readonly created_at: number;
  readonly created_by_member_id: string;
  readonly parent_revision_id: string | null;
  readonly summary: string | null;
}

interface DocCommentRow {
  readonly comment_id: string;
  readonly doc_id: string;
  readonly context_room_id: string;
  readonly revision_id: string | null;
  readonly body: string;
  readonly status: string;
  readonly created_at: number;
  readonly updated_at: number;
  readonly created_by_member_id: string;
  readonly resolved_at: number | null;
  readonly resolved_by_member_id: string | null;
  readonly mentions_json: string | null;
  readonly anchor_json: string | null;
  readonly visibility_json: string;
}

const tableExists = (handle: DatabaseHandle, tableName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
};

const assertSchemaReady = (handle: DatabaseHandle): void => {
  if (
    !tableExists(handle, "docs") ||
    !tableExists(handle, "doc_revisions") ||
    !tableExists(handle, "doc_comments")
  ) {
    throw new DaemonDatabaseError("runMigrations must be called before createDocStore");
  }
};

const stringifyJson = (value: unknown, label: string): string => {
  try {
    const json = JSON.stringify(value);

    if (json === undefined) {
      throw new Error(`${label} serialized to undefined`);
    }

    return json;
  } catch {
    throw new Error(`${label} must be JSON-serializable`);
  }
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

const parseOptionalJsonObject = <T>(value: string | null, label: string): T | undefined =>
  value === null ? undefined : parseJsonObject<T>(value, label);

const parseJsonObjectArray = <T>(value: string, label: string): readonly T[] => {
  const parsed = parseJsonValue(value, label);

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} in database must be a JSON array`);
  }

  if (!parsed.every(isJsonObject)) {
    throw new Error(`${label} in database must contain JSON objects`);
  }

  return parsed as readonly T[];
};

const parseOptionalJsonObjectArray = <T>(
  value: string | null,
  label: string,
): readonly T[] | undefined => (value === null ? undefined : parseJsonObjectArray<T>(value, label));

const parseDocMention = (value: Record<string, unknown>): DocMention => {
  if (!isDocMentionKind(value.kind)) {
    throw new Error("Invalid doc mention kind in database: " + String(value.kind));
  }

  if (typeof value.memberId !== "string") {
    throw new Error("Invalid doc mention memberId in database: " + String(value.memberId));
  }

  let memberId: DocMention["memberId"];
  try {
    memberId = roomMemberId(value.memberId);
  } catch {
    throw new Error("Invalid doc mention memberId in database: " + value.memberId);
  }

  if (value.displayText !== undefined && typeof value.displayText !== "string") {
    throw new Error("Invalid doc mention displayText in database");
  }

  return value.displayText === undefined
    ? { kind: value.kind, memberId }
    : { kind: value.kind, memberId, displayText: value.displayText };
};

const parseDocMentions = (value: string | null): readonly DocMention[] | undefined => {
  const mentions = parseOptionalJsonObjectArray<Record<string, unknown>>(
    value,
    "doc comment mentions_json",
  );

  return mentions?.map(parseDocMention);
};

const parseDocFormat = (value: string): DocFormat => {
  if (!isDocFormat(value)) {
    throw new Error("Invalid doc format in database: " + value);
  }

  return value;
};

const parseDocStatus = (value: string): DocStatus => {
  if (!isDocStatus(value)) {
    throw new Error("Invalid doc status in database: " + value);
  }

  return value;
};

const parseDocRevisionStatus = (value: string): DocRevisionStatus => {
  if (!isDocRevisionStatus(value)) {
    throw new Error("Invalid doc revision status in database: " + value);
  }

  return value;
};

const parseDocCommentStatus = (value: string): DocCommentStatus => {
  if (!isDocCommentStatus(value)) {
    throw new Error("Invalid doc comment status in database: " + value);
  }

  return value;
};

const toDoc = (row: DocRow): Doc => ({
  id: docId(row.doc_id),
  contextRoomId: roomId(row.context_room_id),
  title: row.title,
  format: parseDocFormat(row.format),
  status: parseDocStatus(row.status),
  body: row.body,
  createdAt: unixMs(row.created_at),
  updatedAt: unixMs(row.updated_at),
  createdByMemberId: roomMemberId(row.created_by_member_id),
  currentRevisionId:
    row.current_revision_id === null ? undefined : docRevisionId(row.current_revision_id),
  visibility: parseJsonObject<RoomVisibility>(row.visibility_json, "doc visibility_json"),
});

const toDocRevision = (row: DocRevisionRow): DocRevision => ({
  id: docRevisionId(row.revision_id),
  docId: docId(row.doc_id),
  contextRoomId: roomId(row.context_room_id),
  revisionNumber: row.revision_number,
  format: parseDocFormat(row.format),
  status: parseDocRevisionStatus(row.status),
  body: row.body,
  title: row.title ?? undefined,
  createdAt: unixMs(row.created_at),
  createdByMemberId: roomMemberId(row.created_by_member_id),
  parentRevisionId:
    row.parent_revision_id === null ? undefined : docRevisionId(row.parent_revision_id),
  summary: row.summary ?? undefined,
});

const toDocComment = (row: DocCommentRow): DocComment => ({
  id: docCommentId(row.comment_id),
  docId: docId(row.doc_id),
  contextRoomId: roomId(row.context_room_id),
  revisionId: row.revision_id === null ? undefined : docRevisionId(row.revision_id),
  body: row.body,
  status: parseDocCommentStatus(row.status),
  createdAt: unixMs(row.created_at),
  updatedAt: unixMs(row.updated_at),
  createdByMemberId: roomMemberId(row.created_by_member_id),
  resolvedAt: row.resolved_at === null ? undefined : unixMs(row.resolved_at),
  resolvedByMemberId:
    row.resolved_by_member_id === null ? undefined : roomMemberId(row.resolved_by_member_id),
  mentions: parseDocMentions(row.mentions_json),
  anchor: parseOptionalJsonObject<DocCommentAnchor>(row.anchor_json, "doc comment anchor_json"),
  visibility: parseJsonObject<RoomVisibility>(row.visibility_json, "doc comment visibility_json"),
});

export const createDocStore = (handle: DatabaseHandle): DocStore => {
  assertSchemaReady(handle);

  const { database } = handle;
  const insertDoc = database.prepare(`
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
      current_revision_id,
      visibility_json
    ) VALUES (
      @id,
      @contextRoomId,
      @title,
      @format,
      @status,
      @body,
      @createdAt,
      @updatedAt,
      @createdByMemberId,
      @currentRevisionId,
      @visibilityJson
    )
  `);
  const selectDoc = database.prepare("SELECT * FROM docs WHERE doc_id = ?");
  const listDocsByRoom = database.prepare(`
    SELECT * FROM docs
    WHERE context_room_id = ?
    ORDER BY updated_at ASC, doc_id ASC
  `);

  const insertRevision = database.prepare(`
    INSERT INTO doc_revisions (
      revision_id,
      doc_id,
      context_room_id,
      revision_number,
      format,
      status,
      body,
      title,
      created_at,
      created_by_member_id,
      parent_revision_id,
      summary
    ) VALUES (
      @id,
      @docId,
      @contextRoomId,
      @revisionNumber,
      @format,
      @status,
      @body,
      @title,
      @createdAt,
      @createdByMemberId,
      @parentRevisionId,
      @summary
    )
  `);
  const selectRevision = database.prepare("SELECT * FROM doc_revisions WHERE revision_id = ?");
  const listRevisions = database.prepare(`
    SELECT * FROM doc_revisions
    WHERE doc_id = ?
    ORDER BY revision_number ASC, revision_id ASC
  `);
  const updateDocCurrentRevision = database.prepare(`
    UPDATE docs
    SET current_revision_id = @revisionId
    WHERE doc_id = @docId
  `);

  const insertComment = database.prepare(`
    INSERT INTO doc_comments (
      comment_id,
      doc_id,
      context_room_id,
      revision_id,
      body,
      status,
      created_at,
      updated_at,
      created_by_member_id,
      resolved_at,
      resolved_by_member_id,
      mentions_json,
      anchor_json,
      visibility_json
    ) VALUES (
      @id,
      @docId,
      @contextRoomId,
      @revisionId,
      @body,
      @status,
      @createdAt,
      @updatedAt,
      @createdByMemberId,
      @resolvedAt,
      @resolvedByMemberId,
      @mentionsJson,
      @anchorJson,
      @visibilityJson
    )
  `);
  const selectComment = database.prepare("SELECT * FROM doc_comments WHERE comment_id = ?");
  const listComments = database.prepare(`
    SELECT * FROM doc_comments
    WHERE doc_id = ?
    ORDER BY created_at ASC, comment_id ASC
  `);

  const createRevisionInTransaction = database.transaction((revision: DocRevision): DocRevision => {
    insertRevision.run({
      id: revision.id,
      docId: revision.docId,
      contextRoomId: revision.contextRoomId,
      revisionNumber: revision.revisionNumber,
      format: revision.format,
      status: revision.status,
      body: revision.body,
      title: revision.title ?? null,
      createdAt: revision.createdAt,
      createdByMemberId: revision.createdByMemberId,
      parentRevisionId: revision.parentRevisionId ?? null,
      summary: revision.summary ?? null,
    });

    const result = updateDocCurrentRevision.run({
      docId: revision.docId,
      revisionId: revision.id,
    });
    if (result.changes !== 1) {
      throw new Error("failed to update doc current revision");
    }

    const row = selectRevision.get(revision.id) as DocRevisionRow | undefined;
    if (!row) {
      throw new Error("failed to read created doc revision");
    }

    return toDocRevision(row);
  });

  return {
    createDoc: (doc) => {
      insertDoc.run({
        id: doc.id,
        contextRoomId: doc.contextRoomId,
        title: doc.title,
        format: doc.format,
        status: doc.status,
        body: doc.body,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        createdByMemberId: doc.createdByMemberId,
        currentRevisionId: doc.currentRevisionId ?? null,
        visibilityJson: stringifyJson(doc.visibility, "doc visibility"),
      });

      const row = selectDoc.get(doc.id) as DocRow | undefined;
      if (!row) {
        throw new Error("failed to read created doc");
      }

      return toDoc(row);
    },

    getDoc: (id) => {
      const row = selectDoc.get(id) as DocRow | undefined;
      return row ? toDoc(row) : undefined;
    },

    listDocsByRoom: (contextRoomId) => {
      const rows = listDocsByRoom.all(contextRoomId) as DocRow[];
      return rows.map(toDoc);
    },

    createRevision: (revision) => createRevisionInTransaction(revision),

    listRevisions: (id) => {
      const rows = listRevisions.all(id) as DocRevisionRow[];
      return rows.map(toDocRevision);
    },

    createComment: (comment) => {
      insertComment.run({
        id: comment.id,
        docId: comment.docId,
        contextRoomId: comment.contextRoomId,
        revisionId: comment.revisionId ?? null,
        body: comment.body,
        status: comment.status,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        createdByMemberId: comment.createdByMemberId,
        resolvedAt: comment.resolvedAt ?? null,
        resolvedByMemberId: comment.resolvedByMemberId ?? null,
        mentionsJson: comment.mentions
          ? stringifyJson(comment.mentions, "doc comment mentions")
          : null,
        anchorJson: comment.anchor ? stringifyJson(comment.anchor, "doc comment anchor") : null,
        visibilityJson: stringifyJson(comment.visibility, "doc comment visibility"),
      });

      const row = selectComment.get(comment.id) as DocCommentRow | undefined;
      if (!row) {
        throw new Error("failed to read created doc comment");
      }

      return toDocComment(row);
    },

    listComments: (id) => {
      const rows = listComments.all(id) as DocCommentRow[];
      return rows.map(toDocComment);
    },
  };
};
