import {
  isRoomMessageKind,
  isRoomMessageLlmRole,
  roomId,
  roomMessageId,
  type RoomAttachment,
  type RoomMessageContentPart,
  type RoomMessageExportMeta,
  type RoomEvidence,
  type RoomMention,
  type RoomMessage,
  type RoomMessageKind,
  type RoomMessageLlmRole,
  type RoomMessageReply,
  type RoomMessageSender,
  type RoomMessageThread,
  type RoomMessageTrace,
  type RoomNotificationPolicy,
  type RoomReference,
  unixMs,
  type RoomVisibility,
} from "@linka/shared";

import type { DatabaseHandle } from "../db/connection.js";
import { DaemonDatabaseError } from "./event-store.js";

export type NewRoomMessage = Omit<RoomMessage, "sequence">;

export interface ListMessagesOptions {
  readonly afterSequence?: number;
  readonly limit?: number;
}

export interface MessageStore {
  appendMessage(message: NewRoomMessage): RoomMessage;
  listMessages(
    roomId: RoomMessage["roomId"],
    options?: ListMessagesOptions,
  ): readonly RoomMessage[];
}

interface RoomMessageRow {
  readonly message_id: string;
  readonly room_id: string;
  readonly sequence: number;
  readonly sender_json: string;
  readonly kind: string;
  readonly created_at: number;
  readonly edited_at: number | null;
  readonly text: string | null;
  readonly content_json: string | null;
  readonly llm_role: string | null;
  readonly thread_json: string | null;
  readonly mentions_json: string | null;
  readonly reply_to_json: string | null;
  readonly references_json: string | null;
  readonly attachments_json: string | null;
  readonly evidence_json: string | null;
  readonly trace_json: string | null;
  readonly export_meta_json: string | null;
  readonly visibility_json: string;
  readonly notification_json: string;
}

const tableExists = (handle: DatabaseHandle, tableName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
};

const assertSchemaReady = (handle: DatabaseHandle): void => {
  if (!tableExists(handle, "room_messages")) {
    throw new DaemonDatabaseError("runMigrations must be called before createMessageStore");
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
const parseOptionalJson = <T>(value: string | null): T | undefined =>
  value === null ? undefined : parseJson<T>(value);

const assertNonNegativeInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
};

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
};

const parseRoomMessageKind = (value: string): RoomMessageKind => {
  if (!isRoomMessageKind(value)) {
    throw new Error("Invalid room message kind in database: " + value);
  }

  return value;
};

const parseOptionalRoomMessageLlmRole = (value: string | null): RoomMessageLlmRole | undefined => {
  if (value === null) {
    return undefined;
  }

  if (!isRoomMessageLlmRole(value)) {
    throw new Error("Invalid room message llm_role in database: " + value);
  }

  return value;
};

const toRoomMessage = (row: RoomMessageRow): RoomMessage => ({
  id: roomMessageId(row.message_id),
  roomId: roomId(row.room_id),
  sequence: row.sequence,
  sender: parseJson<RoomMessageSender>(row.sender_json),
  kind: parseRoomMessageKind(row.kind),
  createdAt: unixMs(row.created_at),
  editedAt: row.edited_at === null ? undefined : unixMs(row.edited_at),
  text: row.text ?? undefined,
  content: parseOptionalJson<readonly RoomMessageContentPart[]>(row.content_json),
  llmRole: parseOptionalRoomMessageLlmRole(row.llm_role),
  thread: parseOptionalJson<RoomMessageThread>(row.thread_json),
  mentions: parseOptionalJson<readonly RoomMention[]>(row.mentions_json),
  replyTo: parseOptionalJson<RoomMessageReply>(row.reply_to_json),
  references: parseOptionalJson<readonly RoomReference[]>(row.references_json),
  attachments: parseOptionalJson<readonly RoomAttachment[]>(row.attachments_json),
  evidence: parseOptionalJson<readonly RoomEvidence[]>(row.evidence_json),
  trace: parseOptionalJson<RoomMessageTrace>(row.trace_json),
  exportMeta: parseOptionalJson<RoomMessageExportMeta>(row.export_meta_json),
  visibility: parseJson<RoomVisibility>(row.visibility_json),
  notification: parseJson<RoomNotificationPolicy>(row.notification_json),
});

export const createMessageStore = (handle: DatabaseHandle): MessageStore => {
  assertSchemaReady(handle);

  const { database } = handle;
  const insertMessage = database.prepare(`
    INSERT INTO room_messages (
      message_id,
      room_id,
      sequence,
      sender_json,
      kind,
      created_at,
      edited_at,
      text,
      content_json,
      llm_role,
      thread_json,
      mentions_json,
      reply_to_json,
      references_json,
      attachments_json,
      evidence_json,
      trace_json,
      export_meta_json,
      visibility_json,
      notification_json
    ) VALUES (
      @id,
      @roomId,
      @sequence,
      @senderJson,
      @kind,
      @createdAt,
      @editedAt,
      @text,
      @contentJson,
      @llmRole,
      @threadJson,
      @mentionsJson,
      @replyToJson,
      @referencesJson,
      @attachmentsJson,
      @evidenceJson,
      @traceJson,
      @exportMetaJson,
      @visibilityJson,
      @notificationJson
    )
  `);
  const selectMessage = database.prepare("SELECT * FROM room_messages WHERE message_id = ?");
  const selectNextSequence = database.prepare(`
    SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
    FROM room_messages
    WHERE room_id = ?
  `);
  const listByRoom = database.prepare(`
    SELECT * FROM room_messages
    WHERE room_id = ? AND sequence > ?
    ORDER BY sequence ASC
    LIMIT ?
  `);

  const appendInTransaction = database.transaction((message: NewRoomMessage): RoomMessage => {
    const next = selectNextSequence.get(message.roomId) as { sequence: number };
    const sequence = next.sequence;

    insertMessage.run({
      id: message.id,
      roomId: message.roomId,
      sequence,
      senderJson: stringifyJson(message.sender, "message sender"),
      kind: message.kind,
      createdAt: message.createdAt,
      editedAt: message.editedAt ?? null,
      text: message.text ?? null,
      contentJson: message.content ? stringifyJson(message.content, "message content") : null,
      llmRole: message.llmRole ?? null,
      threadJson: message.thread ? stringifyJson(message.thread, "message thread") : null,
      mentionsJson: message.mentions ? stringifyJson(message.mentions, "message mentions") : null,
      replyToJson: message.replyTo ? stringifyJson(message.replyTo, "message replyTo") : null,
      referencesJson: message.references
        ? stringifyJson(message.references, "message references")
        : null,
      attachmentsJson: message.attachments
        ? stringifyJson(message.attachments, "message attachments")
        : null,
      evidenceJson: message.evidence ? stringifyJson(message.evidence, "message evidence") : null,
      traceJson: message.trace ? stringifyJson(message.trace, "message trace") : null,
      exportMetaJson: message.exportMeta
        ? stringifyJson(message.exportMeta, "message exportMeta")
        : null,
      visibilityJson: stringifyJson(message.visibility, "message visibility"),
      notificationJson: stringifyJson(message.notification, "message notification"),
    });

    const row = selectMessage.get(message.id) as RoomMessageRow | undefined;
    if (!row) {
      throw new Error("failed to read appended room message");
    }

    return toRoomMessage(row);
  });

  return {
    appendMessage: (message) => appendInTransaction(message),

    listMessages: (id, options = {}) => {
      const afterSequence = options.afterSequence ?? 0;
      const limit = options.limit ?? 100;
      assertNonNegativeInteger(afterSequence, "afterSequence");
      assertPositiveInteger(limit, "limit");

      const rows = listByRoom.all(id, afterSequence, limit) as RoomMessageRow[];
      return rows.map(toRoomMessage);
    },
  };
};
