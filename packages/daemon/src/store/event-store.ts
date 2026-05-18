import type { DatabaseHandle } from "../db/connection.js";

export type DaemonEventCursor = number;

export interface DaemonEventEnvelope {
  readonly id: string;
  readonly roomId?: string;
  readonly type: string;
  readonly createdAt: number;
  readonly payload: unknown;
}

export interface PersistedDaemonEvent extends DaemonEventEnvelope {
  readonly cursor: DaemonEventCursor;
}

export interface EventStore {
  append(event: DaemonEventEnvelope): PersistedDaemonEvent;
  listAfter(cursor: DaemonEventCursor, limit: number): readonly PersistedDaemonEvent[];
}

export class DaemonDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DaemonDatabaseError";
  }
}

interface EventRow {
  readonly cursor: number;
  readonly event_id: string;
  readonly room_id: string | null;
  readonly type: string;
  readonly created_at: number;
  readonly payload_json: string;
}

const tableExists = (handle: DatabaseHandle, tableName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
};

const assertSchemaReady = (handle: DatabaseHandle): void => {
  if (!tableExists(handle, "daemon_events")) {
    throw new DaemonDatabaseError("runMigrations must be called before createEventStore");
  }
};

const toPersistedEvent = (row: EventRow): PersistedDaemonEvent => ({
  cursor: row.cursor,
  id: row.event_id,
  roomId: row.room_id ?? undefined,
  type: row.type,
  createdAt: row.created_at,
  payload: JSON.parse(row.payload_json) as unknown,
});

const assertPositiveLimit = (limit: number): void => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }
};

const assertCursor = (cursor: number): void => {
  if (!Number.isInteger(cursor) || cursor < 0) {
    throw new Error("cursor must be a non-negative integer");
  }
};

const assertNonEmptyString = (value: string, label: string): void => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`event ${label} must be a non-empty string`);
  }
};

const assertCreatedAt = (createdAt: number): void => {
  if (!Number.isSafeInteger(createdAt) || createdAt < 0) {
    throw new Error("event createdAt must be a non-negative safe integer");
  }
};

const serializePayload = (payload: unknown): string => {
  try {
    const payloadJson = JSON.stringify(payload);

    if (payloadJson === undefined) {
      throw new Error("payload serialized to undefined");
    }

    return payloadJson;
  } catch {
    throw new Error("event payload must be JSON-serializable");
  }
};

const validateEvent = (event: DaemonEventEnvelope): string => {
  assertNonEmptyString(event.id, "id");
  assertNonEmptyString(event.type, "type");
  assertCreatedAt(event.createdAt);

  return serializePayload(event.payload);
};

export const createEventStore = (handle: DatabaseHandle): EventStore => {
  assertSchemaReady(handle);

  const { database } = handle;
  const insertEvent = database.prepare(`
    INSERT INTO daemon_events (event_id, room_id, type, created_at, payload_json, inserted_at)
    VALUES (@id, @roomId, @type, @createdAt, @payloadJson, @insertedAt)
  `);
  const selectByCursor = database.prepare("SELECT * FROM daemon_events WHERE cursor = ?");
  const listAfterCursor = database.prepare(`
    SELECT * FROM daemon_events
    WHERE cursor > ?
    ORDER BY cursor ASC
    LIMIT ?
  `);

  return {
    append: (event) => {
      const payloadJson = validateEvent(event);
      const result = insertEvent.run({
        id: event.id,
        roomId: event.roomId ?? null,
        type: event.type,
        createdAt: event.createdAt,
        payloadJson,
        insertedAt: Date.now(),
      });
      const row = selectByCursor.get(result.lastInsertRowid) as EventRow | undefined;

      if (!row) {
        throw new Error("failed to read appended event");
      }

      return toPersistedEvent(row);
    },

    listAfter: (cursor, limit) => {
      assertCursor(cursor);
      assertPositiveLimit(limit);

      const rows = listAfterCursor.all(cursor, limit) as EventRow[];
      return rows.map(toPersistedEvent);
    },
  };
};
