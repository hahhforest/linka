import {
  docId,
  harnessRunId,
  isHarnessRunStatus,
  isRuntimeEventPayloadKind,
  isRuntimeEventType,
  isRuntimeKind,
  roomId,
  roomMemberId,
  roomMessageId,
  runtimeEventId,
  runtimeSessionId,
  type DocId,
  type HarnessRun,
  type HarnessRunId,
  type HarnessRunStatus,
  type RoomId,
  type RuntimeEvent,
  type RuntimeEventPayload,
  type RuntimeEventType,
  type RuntimeKind,
  type RuntimeSessionRef,
  unixMs,
} from "@linka/shared";

import type { DatabaseHandle } from "../db/connection.js";
import { DaemonDatabaseError } from "./event-store.js";

export interface UpdateHarnessRunStatusInput {
  readonly id: HarnessRun["id"];
  readonly status: HarnessRunStatus;
  readonly updatedAt: HarnessRun["updatedAt"];
  readonly completedAt?: HarnessRun["completedAt"];
  readonly runtime?: RuntimeSessionRef;
  readonly summary?: HarnessRun["summary"];
  readonly error?: HarnessRun["error"];
}

export interface HarnessRunStore {
  createRuntimeSession(session: RuntimeSessionRef): RuntimeSessionRef;
  getRuntimeSession(id: RuntimeSessionRef["id"]): RuntimeSessionRef | undefined;
  createRun(run: HarnessRun): HarnessRun;
  updateRunStatus(update: UpdateHarnessRunStatusInput): HarnessRun;
  getRun(id: HarnessRun["id"]): HarnessRun | undefined;
  listRunsByRoom(roomId: RoomId): readonly HarnessRun[];
  appendEvent(event: RuntimeEvent): RuntimeEvent;
  listEvents(runId: HarnessRunId): readonly RuntimeEvent[];
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

interface RuntimeEventRow {
  readonly runtime_event_id: string;
  readonly harness_run_id: string;
  readonly room_id: string;
  readonly target_member_id: string;
  readonly sequence: number;
  readonly type: string;
  readonly created_at: number;
  readonly runtime_session_id: string | null;
  readonly payload_json: string;
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
  if (
    !tableExists(handle, "runtime_sessions") ||
    !tableExists(handle, "harness_runs") ||
    !tableExists(handle, "harness_run_events")
  ) {
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

const parseRuntimeEventType = (value: string): RuntimeEventType => {
  if (!isRuntimeEventType(value)) {
    throw new Error("Invalid runtime event type in database: " + value);
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

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseRuntimeEventPayload = (value: string): RuntimeEventPayload => {
  const parsed = parseJsonValue(value, "runtime event payload_json");

  if (!isJsonObject(parsed)) {
    throw new Error("runtime event payload_json in database must be a JSON object");
  }

  if (typeof parsed.kind !== "string") {
    throw new Error("runtime event payload_json.kind in database must be a string");
  }

  if (!isRuntimeEventPayloadKind(parsed.kind)) {
    throw new Error("Invalid runtime event payload kind in database: " + parsed.kind);
  }

  return parsed as unknown as RuntimeEventPayload;
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

const toRuntimeEvent = (row: RuntimeEventRow): RuntimeEvent => {
  const runtime = toJoinedRuntimeSession({
    harness_run_id: row.harness_run_id,
    room_id: row.room_id,
    target_member_id: row.target_member_id,
    status: "queued",
    runtime_session_id: row.runtime_session_id,
    created_at: row.created_at,
    updated_at: row.created_at,
    started_at: null,
    completed_at: null,
    trigger_message_id: null,
    doc_ids_json: null,
    summary: null,
    error: null,
    runtime_kind: row.runtime_kind,
    runtime_adapter_session_id: row.runtime_adapter_session_id,
    runtime_label: row.runtime_label,
  });

  return {
    id: runtimeEventId(row.runtime_event_id),
    runId: harnessRunId(row.harness_run_id),
    roomId: roomId(row.room_id),
    targetMemberId: roomMemberId(row.target_member_id),
    sequence: row.sequence,
    type: parseRuntimeEventType(row.type),
    createdAt: unixMs(row.created_at),
    ...(runtime === undefined ? {} : { runtime }),
    payload: parseRuntimeEventPayload(row.payload_json),
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
  const updateRunStatus = database.prepare(`
    UPDATE harness_runs
    SET
      status = @status,
      runtime_session_id = @runtimeSessionId,
      updated_at = @updatedAt,
      completed_at = @completedAt,
      summary = @summary,
      error = @error
    WHERE harness_run_id = @id
  `);

  const eventColumns = `
    events.*,
    sessions.kind AS runtime_kind,
    sessions.adapter_session_id AS runtime_adapter_session_id,
    sessions.label AS runtime_label
  `;
  const insertEvent = database.prepare(`
    INSERT INTO harness_run_events (
      runtime_event_id,
      harness_run_id,
      room_id,
      target_member_id,
      sequence,
      type,
      created_at,
      runtime_session_id,
      payload_json
    ) VALUES (
      @id,
      @runId,
      @roomId,
      @targetMemberId,
      @sequence,
      @type,
      @createdAt,
      @runtimeSessionId,
      @payloadJson
    )
  `);
  const selectEvent = database.prepare(`
    SELECT ${eventColumns}
    FROM harness_run_events events
    LEFT JOIN runtime_sessions sessions
      ON sessions.runtime_session_id = events.runtime_session_id
    WHERE events.runtime_event_id = ?
  `);
  const listEvents = database.prepare(`
    SELECT ${eventColumns}
    FROM harness_run_events events
    LEFT JOIN runtime_sessions sessions
      ON sessions.runtime_session_id = events.runtime_session_id
    WHERE events.harness_run_id = ?
    ORDER BY events.sequence ASC, events.runtime_event_id ASC
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

    updateRunStatus: (update) => {
      if (
        update.runtime !== undefined &&
        selectRuntimeSession.get(update.runtime.id) === undefined
      ) {
        insertRuntimeSession.run({
          id: update.runtime.id,
          kind: update.runtime.kind,
          adapterSessionId: update.runtime.adapterSessionId ?? null,
          label: update.runtime.label ?? null,
        });
      }

      const result = updateRunStatus.run({
        id: update.id,
        status: update.status,
        runtimeSessionId: update.runtime?.id ?? null,
        updatedAt: update.updatedAt,
        completedAt: update.completedAt ?? null,
        summary: update.summary ?? null,
        error: update.error ?? null,
      });
      if (result.changes !== 1) {
        throw new Error("harness run not found: " + update.id);
      }

      const row = selectRun.get(update.id) as HarnessRunRow | undefined;
      if (!row) {
        throw new Error("failed to read updated harness run");
      }

      return toHarnessRun(row);
    },

    listRunsByRoom: (id) => {
      const rows = listRunsByRoom.all(id) as HarnessRunRow[];
      return rows.map(toHarnessRun);
    },

    appendEvent: (event) => {
      insertEvent.run({
        id: event.id,
        runId: event.runId,
        roomId: event.roomId,
        targetMemberId: event.targetMemberId,
        sequence: event.sequence,
        type: event.type,
        createdAt: event.createdAt,
        runtimeSessionId: event.runtime?.id ?? null,
        payloadJson: stringifyJson(event.payload, "runtime event payload"),
      });

      const row = selectEvent.get(event.id) as RuntimeEventRow | undefined;
      if (!row) {
        throw new Error("failed to read created runtime event");
      }

      return toRuntimeEvent(row);
    },

    listEvents: (id) => {
      const rows = listEvents.all(id) as RuntimeEventRow[];
      return rows.map(toRuntimeEvent);
    },
  };
};
