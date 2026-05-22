import {
  harnessSessionId,
  harnessTurnId,
  isPendingInteractionKind,
  isPendingInteractionStatus,
  pendingInteractionId,
  roomId,
  roomMemberId,
  roomMessageId,
  type HarnessSessionId,
  type PendingInteraction,
  type PendingInteractionId,
  type PendingInteractionStatus,
  type RoomId,
  unixMs,
} from "@linka/shared";

import type { DatabaseHandle } from "../db/connection.js";
import { DaemonDatabaseError } from "./event-store.js";

export interface UpdatePendingInteractionStatusInput {
  readonly id: PendingInteractionId;
  readonly status: PendingInteractionStatus;
  readonly updatedAt: PendingInteraction["updatedAt"];
  readonly responseMessageId?: PendingInteraction["responseMessageId"] | null;
  readonly payload?: PendingInteraction["payload"] | null;
}

export interface PendingInteractionStore {
  createInteraction(interaction: PendingInteraction): PendingInteraction;
  getInteraction(id: PendingInteractionId): PendingInteraction | undefined;
  listInteractionsByRoom(roomId: RoomId): readonly PendingInteraction[];
  listOpenInteractionsBySession(sessionId: HarnessSessionId): readonly PendingInteraction[];
  updateInteractionStatus(input: UpdatePendingInteractionStatusInput): PendingInteraction;
}

interface PendingInteractionRow {
  readonly pending_interaction_id: string;
  readonly session_id: string;
  readonly turn_id: string | null;
  readonly room_id: string;
  readonly agent_member_id: string;
  readonly kind: string;
  readonly status: string;
  readonly created_at: number;
  readonly updated_at: number;
  readonly request_message_id: string | null;
  readonly response_message_id: string | null;
  readonly expires_at: number | null;
  readonly payload_json: string | null;
}

const openStatuses = new Set<PendingInteractionStatus>(["requested"]);

const tableExists = (handle: DatabaseHandle, tableName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
};

const assertSchemaReady = (handle: DatabaseHandle): void => {
  if (!tableExists(handle, "pending_interactions")) {
    throw new DaemonDatabaseError(
      "runMigrations must be called before createPendingInteractionStore",
    );
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

const stringifyJson = (value: unknown, label: string): string => {
  try {
    const json = JSON.stringify(value);
    if (json === undefined) throw new Error(`${label} serialized to undefined`);
    return json;
  } catch {
    throw new Error(`${label} must be JSON-serializable`);
  }
};

const parsePayload = (value: string | null): Record<string, unknown> | undefined => {
  if (value === null) return undefined;

  const parsed = parseJsonValue(value, "pending interaction payload_json");
  if (!isJsonObject(parsed)) {
    throw new Error("pending interaction payload_json in database must be a JSON object");
  }

  return parsed;
};

const parseKind = (value: string): PendingInteraction["kind"] => {
  if (!isPendingInteractionKind(value)) {
    throw new Error("Invalid pending interaction kind in database: " + value);
  }

  return value;
};

const parseStatus = (value: string): PendingInteractionStatus => {
  if (!isPendingInteractionStatus(value)) {
    throw new Error("Invalid pending interaction status in database: " + value);
  }

  return value;
};

const toInteraction = (row: PendingInteractionRow): PendingInteraction => {
  const payload = parsePayload(row.payload_json);

  return {
    id: pendingInteractionId(row.pending_interaction_id),
    sessionId: harnessSessionId(row.session_id),
    ...(row.turn_id === null ? {} : { turnId: harnessTurnId(row.turn_id) }),
    roomId: roomId(row.room_id),
    agentMemberId: roomMemberId(row.agent_member_id),
    kind: parseKind(row.kind),
    status: parseStatus(row.status),
    createdAt: unixMs(row.created_at),
    updatedAt: unixMs(row.updated_at),
    ...(row.request_message_id === null
      ? {}
      : { requestMessageId: roomMessageId(row.request_message_id) }),
    ...(row.response_message_id === null
      ? {}
      : { responseMessageId: roomMessageId(row.response_message_id) }),
    ...(row.expires_at === null ? {} : { expiresAt: unixMs(row.expires_at) }),
    ...(payload === undefined ? {} : { payload }),
  };
};

export const createPendingInteractionStore = (handle: DatabaseHandle): PendingInteractionStore => {
  assertSchemaReady(handle);

  const { database } = handle;
  const insertInteraction = database.prepare(`
    INSERT INTO pending_interactions (
      pending_interaction_id,
      session_id,
      turn_id,
      room_id,
      agent_member_id,
      kind,
      status,
      created_at,
      updated_at,
      request_message_id,
      response_message_id,
      expires_at,
      payload_json
    ) VALUES (
      @id,
      @sessionId,
      @turnId,
      @roomId,
      @agentMemberId,
      @kind,
      @status,
      @createdAt,
      @updatedAt,
      @requestMessageId,
      @responseMessageId,
      @expiresAt,
      @payloadJson
    )
  `);
  const selectInteraction = database.prepare(
    "SELECT * FROM pending_interactions WHERE pending_interaction_id = ?",
  );
  const listByRoom = database.prepare(`
    SELECT *
    FROM pending_interactions
    WHERE room_id = ?
    ORDER BY created_at, pending_interaction_id
  `);
  const listOpenBySession = database.prepare(`
    SELECT *
    FROM pending_interactions
    WHERE session_id = ? AND status = 'requested'
    ORDER BY created_at, pending_interaction_id
  `);
  const updateStatus = database.prepare(`
    UPDATE pending_interactions
    SET
      status = @status,
      updated_at = @updatedAt,
      response_message_id = @responseMessageId,
      payload_json = @payloadJson
    WHERE pending_interaction_id = @id
  `);

  const serialize = (interaction: PendingInteraction) => ({
    id: interaction.id,
    sessionId: interaction.sessionId,
    turnId: interaction.turnId ?? null,
    roomId: interaction.roomId,
    agentMemberId: interaction.agentMemberId,
    kind: interaction.kind,
    status: interaction.status,
    createdAt: interaction.createdAt,
    updatedAt: interaction.updatedAt,
    requestMessageId: interaction.requestMessageId ?? null,
    responseMessageId: interaction.responseMessageId ?? null,
    expiresAt: interaction.expiresAt ?? null,
    payloadJson:
      interaction.payload === undefined
        ? null
        : stringifyJson(interaction.payload, "pending interaction payload"),
  });

  return {
    createInteraction(interaction) {
      insertInteraction.run(serialize(interaction));
      const row = selectInteraction.get(interaction.id) as PendingInteractionRow | undefined;
      if (!row) throw new Error("failed to read created pending interaction");
      return toInteraction(row);
    },

    getInteraction(id) {
      const row = selectInteraction.get(id) as PendingInteractionRow | undefined;
      return row === undefined ? undefined : toInteraction(row);
    },

    listInteractionsByRoom(targetRoomId) {
      return (listByRoom.all(targetRoomId) as PendingInteractionRow[]).map(toInteraction);
    },

    listOpenInteractionsBySession(sessionId) {
      return (listOpenBySession.all(sessionId) as PendingInteractionRow[])
        .map(toInteraction)
        .filter((interaction) => openStatuses.has(interaction.status));
    },

    updateInteractionStatus(input) {
      const current = selectInteraction.get(input.id) as PendingInteractionRow | undefined;
      if (!current) throw new Error("pending interaction not found: " + input.id);

      updateStatus.run({
        id: input.id,
        status: input.status,
        updatedAt: input.updatedAt,
        responseMessageId:
          input.responseMessageId === undefined
            ? current.response_message_id
            : (input.responseMessageId ?? null),
        payloadJson:
          input.payload === undefined
            ? current.payload_json
            : input.payload === null
              ? null
              : stringifyJson(input.payload, "pending interaction payload"),
      });

      const row = selectInteraction.get(input.id) as PendingInteractionRow | undefined;
      if (!row) throw new Error("failed to read updated pending interaction");
      return toInteraction(row);
    },
  };
};
