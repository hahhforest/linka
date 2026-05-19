import {
  docId,
  harnessRunId,
  isHarnessRunStatus,
  isRuntimeKind,
  roomId,
  roomMemberId,
  roomMessageId,
  runtimeSessionId,
  type DocId,
  type HarnessRun,
  type HarnessRunStatus,
  type RoomId,
  type RuntimeKind,
  type RuntimeSessionRef,
  unixMs,
} from "@linka/shared";

import type { DatabaseHandle } from "../db/connection.js";
import { DaemonDatabaseError } from "./event-store.js";

export interface HarnessRunStore {
  createRuntimeSession(session: RuntimeSessionRef): RuntimeSessionRef;
  getRuntimeSession(id: RuntimeSessionRef["id"]): RuntimeSessionRef | undefined;
  createRun(run: HarnessRun): HarnessRun;
  getRun(id: HarnessRun["id"]): HarnessRun | undefined;
  listRunsByRoom(roomId: RoomId): readonly HarnessRun[];
}

interface RuntimeSessionRow {
  readonly runtime_session_id: string;
  readonly kind: string;
  readonly adapter_session_id: string | null;
  readonly label: string | null;
}

interface HarnessRunRow {
  readonly harness_run_id: string;
  readonly room_id: string;
  readonly target_member_id: string;
  readonly status: string;
  readonly runtime_session_id: string | null;
  readonly created_at: number;
  readonly updated_at: number;
  readonly started_at: number | null;
  readonly completed_at: number | null;
  readonly trigger_message_id: string | null;
  readonly doc_ids_json: string | null;
  readonly summary: string | null;
  readonly error: string | null;
  readonly runtime_kind: string | null;
  readonly runtime_adapter_session_id: string | null;
  readonly runtime_label: string | null;
}

const tableExists = (handle: DatabaseHandle, tableName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
};

const assertSchemaReady = (handle: DatabaseHandle): void => {
  if (!tableExists(handle, "runtime_sessions") || !tableExists(handle, "harness_runs")) {
    throw new DaemonDatabaseError("runMigrations must be called before createHarnessRunStore");
  }
};

const parseRuntimeKind = (value: string): RuntimeKind => {
  if (!isRuntimeKind(value)) {
    throw new Error("Invalid runtime kind in database: " + value);
  }

  return value;
};

const parseHarnessRunStatus = (value: string): HarnessRunStatus => {
  if (!isHarnessRunStatus(value)) {
    throw new Error("Invalid harness run status in database: " + value);
  }

  return value;
};

const parseJsonValue = (value: string, label: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} in database contains invalid JSON`);
  }
};

const parseDocIds = (value: string | null): readonly DocId[] | undefined => {
  if (value === null) {
    return undefined;
  }

  const parsed = parseJsonValue(value, "harness run doc_ids_json");

  if (!Array.isArray(parsed)) {
    throw new Error("harness run doc_ids_json in database must be a JSON array");
  }

  return parsed.map((item) => {
    if (typeof item !== "string") {
      throw new Error("Invalid harness run doc id in database: " + String(item));
    }

    try {
      return docId(item);
    } catch {
      throw new Error("Invalid harness run doc id in database: " + item);
    }
  });
};

const stringifyDocIds = (ids: readonly DocId[]): string => JSON.stringify(ids);

const toRuntimeSession = (row: RuntimeSessionRow): RuntimeSessionRef => ({
  id: runtimeSessionId(row.runtime_session_id),
  kind: parseRuntimeKind(row.kind),
  ...(row.adapter_session_id === null ? {} : { adapterSessionId: row.adapter_session_id }),
  ...(row.label === null ? {} : { label: row.label }),
});

const toJoinedRuntimeSession = (row: HarnessRunRow): RuntimeSessionRef | undefined => {
  if (row.runtime_session_id === null) {
    return undefined;
  }

  if (row.runtime_kind === null) {
    throw new Error("Harness run references missing runtime session: " + row.runtime_session_id);
  }

  return {
    id: runtimeSessionId(row.runtime_session_id),
    kind: parseRuntimeKind(row.runtime_kind),
    ...(row.runtime_adapter_session_id === null
      ? {}
      : { adapterSessionId: row.runtime_adapter_session_id }),
    ...(row.runtime_label === null ? {} : { label: row.runtime_label }),
  };
};

const toHarnessRun = (row: HarnessRunRow): HarnessRun => {
  const runtime = toJoinedRuntimeSession(row);
  const docIds = parseDocIds(row.doc_ids_json);

  return {
    id: harnessRunId(row.harness_run_id),
    roomId: roomId(row.room_id),
    targetMemberId: roomMemberId(row.target_member_id),
    status: parseHarnessRunStatus(row.status),
    createdAt: unixMs(row.created_at),
    updatedAt: unixMs(row.updated_at),
    ...(runtime === undefined ? {} : { runtime }),
    ...(row.started_at === null ? {} : { startedAt: unixMs(row.started_at) }),
    ...(row.completed_at === null ? {} : { completedAt: unixMs(row.completed_at) }),
    ...(row.trigger_message_id === null
      ? {}
      : { triggerMessageId: roomMessageId(row.trigger_message_id) }),
    ...(docIds === undefined ? {} : { docIds }),
    ...(row.summary === null ? {} : { summary: row.summary }),
    ...(row.error === null ? {} : { error: row.error }),
  };
};

export const createHarnessRunStore = (handle: DatabaseHandle): HarnessRunStore => {
  assertSchemaReady(handle);

  const { database } = handle;
  const insertRuntimeSession = database.prepare(`
    INSERT INTO runtime_sessions (
      runtime_session_id,
      kind,
      adapter_session_id,
      label
    ) VALUES (
      @id,
      @kind,
      @adapterSessionId,
      @label
    )
  `);
  const selectRuntimeSession = database.prepare(
    "SELECT * FROM runtime_sessions WHERE runtime_session_id = ?",
  );

  const runColumns = `
    runs.*,
    sessions.kind AS runtime_kind,
    sessions.adapter_session_id AS runtime_adapter_session_id,
    sessions.label AS runtime_label
  `;
  const selectRun = database.prepare(`
    SELECT ${runColumns}
    FROM harness_runs runs
    LEFT JOIN runtime_sessions sessions
      ON sessions.runtime_session_id = runs.runtime_session_id
    WHERE runs.harness_run_id = ?
  `);
  const listRunsByRoom = database.prepare(`
    SELECT ${runColumns}
    FROM harness_runs runs
    LEFT JOIN runtime_sessions sessions
      ON sessions.runtime_session_id = runs.runtime_session_id
    WHERE runs.room_id = ?
    ORDER BY runs.created_at ASC, runs.harness_run_id ASC
  `);
  const insertRun = database.prepare(`
    INSERT INTO harness_runs (
      harness_run_id,
      room_id,
      target_member_id,
      status,
      runtime_session_id,
      created_at,
      updated_at,
      started_at,
      completed_at,
      trigger_message_id,
      doc_ids_json,
      summary,
      error
    ) VALUES (
      @id,
      @roomId,
      @targetMemberId,
      @status,
      @runtimeSessionId,
      @createdAt,
      @updatedAt,
      @startedAt,
      @completedAt,
      @triggerMessageId,
      @docIdsJson,
      @summary,
      @error
    )
  `);

  return {
    createRuntimeSession: (session) => {
      insertRuntimeSession.run({
        id: session.id,
        kind: session.kind,
        adapterSessionId: session.adapterSessionId ?? null,
        label: session.label ?? null,
      });

      const row = selectRuntimeSession.get(session.id) as RuntimeSessionRow | undefined;
      if (!row) {
        throw new Error("failed to read created runtime session");
      }

      return toRuntimeSession(row);
    },

    getRuntimeSession: (id) => {
      const row = selectRuntimeSession.get(id) as RuntimeSessionRow | undefined;
      return row ? toRuntimeSession(row) : undefined;
    },

    createRun: (run) => {
      insertRun.run({
        id: run.id,
        roomId: run.roomId,
        targetMemberId: run.targetMemberId,
        status: run.status,
        runtimeSessionId: run.runtime?.id ?? null,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        startedAt: run.startedAt ?? null,
        completedAt: run.completedAt ?? null,
        triggerMessageId: run.triggerMessageId ?? null,
        docIdsJson: run.docIds === undefined ? null : stringifyDocIds(run.docIds),
        summary: run.summary ?? null,
        error: run.error ?? null,
      });

      const row = selectRun.get(run.id) as HarnessRunRow | undefined;
      if (!row) {
        throw new Error("failed to read created harness run");
      }

      return toHarnessRun(row);
    },

    getRun: (id) => {
      const row = selectRun.get(id) as HarnessRunRow | undefined;
      return row ? toHarnessRun(row) : undefined;
    },

    listRunsByRoom: (id) => {
      const rows = listRunsByRoom.all(id) as HarnessRunRow[];
      return rows.map(toHarnessRun);
    },
  };
};
