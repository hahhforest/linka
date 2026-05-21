import {
  docRevisionId,
  harnessContextSnapshotId,
  harnessRunId,
  harnessSessionId,
  harnessTriggerId,
  harnessTurnId,
  isHarnessContextSnapshotRedactionState,
  roomId,
  roomMemberId,
  roomMessageId,
  type DocRevisionId,
  type HarnessContextSnapshot,
  type HarnessContextSnapshotId,
  type HarnessContextSnapshotRedactionState,
  type RoomId,
  type RoomMemberId,
  type RoomMessageId,
  unixMs,
} from "@linka/shared";

import type { DatabaseHandle } from "../db/connection.js";
import { DaemonDatabaseError } from "./event-store.js";

export interface ContextSnapshotStore {
  createSnapshot(snapshot: HarnessContextSnapshot): HarnessContextSnapshot;
  getSnapshot(id: HarnessContextSnapshotId): HarnessContextSnapshot | undefined;
  listSnapshotsByRoom(roomId: RoomId): readonly HarnessContextSnapshot[];
  listSnapshotsByAgent(agentMemberId: RoomMemberId): readonly HarnessContextSnapshot[];
}

interface ContextSnapshotRow {
  readonly harness_context_snapshot_id: string;
  readonly room_id: string;
  readonly agent_member_id: string;
  readonly harness_session_id: string | null;
  readonly harness_trigger_id: string | null;
  readonly harness_turn_id: string | null;
  readonly harness_run_id: string | null;
  readonly created_at: number;
  readonly projection_version: number;
  readonly projection_json: string;
  readonly source_message_ids_json: string;
  readonly source_doc_revision_ids_json: string;
  readonly token_estimate: number | null;
  readonly redaction_state: string;
}

const tableExists = (handle: DatabaseHandle, tableName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
};

const assertSchemaReady = (handle: DatabaseHandle): void => {
  if (!tableExists(handle, "harness_context_snapshots")) {
    throw new DaemonDatabaseError("runMigrations must be called before createContextSnapshotStore");
  }
};

const parseJsonValue = (value: string, label: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} in database contains invalid JSON`);
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

const assertValidProjectionJson = (value: string): string => {
  parseJsonValue(value, "harness context snapshot projection_json");
  return value;
};

const parseRoomMessageIds = (value: string): readonly RoomMessageId[] => {
  const parsed = parseJsonValue(value, "harness context snapshot source_message_ids_json");

  if (!Array.isArray(parsed)) {
    throw new Error(
      "harness context snapshot source_message_ids_json in database must be a JSON array",
    );
  }

  return parsed.map((item) => {
    if (typeof item !== "string") {
      throw new Error(
        "Invalid harness context snapshot source message id in database: " + String(item),
      );
    }

    try {
      return roomMessageId(item);
    } catch {
      throw new Error("Invalid harness context snapshot source message id in database: " + item);
    }
  });
};

const parseDocRevisionIds = (value: string): readonly DocRevisionId[] => {
  const parsed = parseJsonValue(value, "harness context snapshot source_doc_revision_ids_json");

  if (!Array.isArray(parsed)) {
    throw new Error(
      "harness context snapshot source_doc_revision_ids_json in database must be a JSON array",
    );
  }

  return parsed.map((item) => {
    if (typeof item !== "string") {
      throw new Error(
        "Invalid harness context snapshot source doc revision id in database: " + String(item),
      );
    }

    try {
      return docRevisionId(item);
    } catch {
      throw new Error(
        "Invalid harness context snapshot source doc revision id in database: " + item,
      );
    }
  });
};

const parseRedactionState = (value: string): HarnessContextSnapshotRedactionState => {
  if (!isHarnessContextSnapshotRedactionState(value)) {
    throw new Error("Invalid harness context snapshot redaction state in database: " + value);
  }

  return value;
};

const stringifyIds = (ids: readonly string[], label: string): string => stringifyJson(ids, label);

const toSnapshot = (row: ContextSnapshotRow): HarnessContextSnapshot => ({
  id: harnessContextSnapshotId(row.harness_context_snapshot_id),
  roomId: roomId(row.room_id),
  agentMemberId: roomMemberId(row.agent_member_id),
  ...(row.harness_session_id === null
    ? {}
    : { harnessSessionId: harnessSessionId(row.harness_session_id) }),
  ...(row.harness_trigger_id === null
    ? {}
    : { harnessTriggerId: harnessTriggerId(row.harness_trigger_id) }),
  ...(row.harness_turn_id === null ? {} : { harnessTurnId: harnessTurnId(row.harness_turn_id) }),
  ...(row.harness_run_id === null ? {} : { harnessRunId: harnessRunId(row.harness_run_id) }),
  createdAt: unixMs(row.created_at),
  projectionVersion: row.projection_version,
  projectionJson: assertValidProjectionJson(row.projection_json),
  sourceMessageIds: parseRoomMessageIds(row.source_message_ids_json),
  sourceDocRevisionIds: parseDocRevisionIds(row.source_doc_revision_ids_json),
  ...(row.token_estimate === null ? {} : { tokenEstimate: row.token_estimate }),
  redactionState: parseRedactionState(row.redaction_state),
});

export const createContextSnapshotStore = (handle: DatabaseHandle): ContextSnapshotStore => {
  assertSchemaReady(handle);

  const { database } = handle;
  const insertSnapshot = database.prepare(`
    INSERT INTO harness_context_snapshots (
      harness_context_snapshot_id,
      room_id,
      agent_member_id,
      harness_session_id,
      harness_trigger_id,
      harness_turn_id,
      harness_run_id,
      created_at,
      projection_version,
      projection_json,
      source_message_ids_json,
      source_doc_revision_ids_json,
      token_estimate,
      redaction_state
    ) VALUES (
      @id,
      @roomId,
      @agentMemberId,
      @harnessSessionId,
      @harnessTriggerId,
      @harnessTurnId,
      @harnessRunId,
      @createdAt,
      @projectionVersion,
      @projectionJson,
      @sourceMessageIdsJson,
      @sourceDocRevisionIdsJson,
      @tokenEstimate,
      @redactionState
    )
  `);
  const selectSnapshot = database.prepare(
    "SELECT * FROM harness_context_snapshots WHERE harness_context_snapshot_id = ?",
  );
  const listSnapshotsByRoom = database.prepare(`
    SELECT *
    FROM harness_context_snapshots
    WHERE room_id = ?
    ORDER BY created_at, harness_context_snapshot_id
  `);
  const listSnapshotsByAgent = database.prepare(`
    SELECT *
    FROM harness_context_snapshots
    WHERE agent_member_id = ?
    ORDER BY created_at, harness_context_snapshot_id
  `);

  const serialize = (snapshot: HarnessContextSnapshot) => ({
    id: snapshot.id,
    roomId: snapshot.roomId,
    agentMemberId: snapshot.agentMemberId,
    harnessSessionId: snapshot.harnessSessionId ?? null,
    harnessTriggerId: snapshot.harnessTriggerId ?? null,
    harnessTurnId: snapshot.harnessTurnId ?? null,
    harnessRunId: snapshot.harnessRunId ?? null,
    createdAt: snapshot.createdAt,
    projectionVersion: snapshot.projectionVersion,
    projectionJson: assertValidProjectionJson(snapshot.projectionJson),
    sourceMessageIdsJson: stringifyIds(
      snapshot.sourceMessageIds,
      "harness context snapshot sourceMessageIds",
    ),
    sourceDocRevisionIdsJson: stringifyIds(
      snapshot.sourceDocRevisionIds,
      "harness context snapshot sourceDocRevisionIds",
    ),
    tokenEstimate: snapshot.tokenEstimate ?? null,
    redactionState: snapshot.redactionState,
  });

  return {
    createSnapshot(snapshot) {
      insertSnapshot.run(serialize(snapshot));
      return snapshot;
    },

    getSnapshot(id) {
      const row = selectSnapshot.get(id) as ContextSnapshotRow | undefined;
      return row === undefined ? undefined : toSnapshot(row);
    },

    listSnapshotsByRoom(targetRoomId) {
      return (listSnapshotsByRoom.all(targetRoomId) as ContextSnapshotRow[]).map(toSnapshot);
    },

    listSnapshotsByAgent(agentMemberId) {
      return (listSnapshotsByAgent.all(agentMemberId) as ContextSnapshotRow[]).map(toSnapshot);
    },
  };
};
