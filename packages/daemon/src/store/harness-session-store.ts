import {
  harnessSessionId,
  harnessTriggerId,
  harnessTurnId,
  isHarnessSessionStatus,
  isHarnessTriggerKind,
  isHarnessTriggerStatus,
  isRuntimeKind,
  roomId,
  roomMemberId,
  roomMessageId,
  runtimeSessionId,
  type AgentParticipationPolicy,
  type HarnessSession,
  type HarnessSessionId,
  type HarnessSessionStatus,
  type HarnessTrigger,
  type HarnessTriggerId,
  type HarnessTriggerKind,
  type HarnessTriggerStatus,
  type HarnessTurnId,
  type RoomId,
  type RoomMemberId,
  type RuntimeKind,
  type RuntimeSessionRef,
  unixMs,
} from "@linka/shared";

import type { DatabaseHandle } from "../db/connection.js";
import { DaemonDatabaseError } from "./event-store.js";

export interface UpdateHarnessSessionStatusInput {
  readonly id: HarnessSessionId;
  readonly status: HarnessSessionStatus;
  readonly updatedAt: HarnessSession["updatedAt"];
  readonly lastTurnId?: HarnessTurnId | null;
  readonly lastTriggerId?: HarnessTriggerId | null;
  readonly error?: string | null;
}

export interface BindRuntimeSessionInput {
  readonly id: HarnessSessionId;
  readonly runtime: RuntimeSessionRef;
  readonly updatedAt: HarnessSession["updatedAt"];
}

export interface ClaimHarnessTriggerInput {
  readonly id: HarnessTriggerId;
  readonly claimedTurnId: HarnessTurnId;
  readonly updatedAt: HarnessTrigger["updatedAt"];
}

export interface UpdateHarnessTriggerStatusInput {
  readonly id: HarnessTriggerId;
  readonly status: HarnessTriggerStatus;
  readonly updatedAt: HarnessTrigger["updatedAt"];
  readonly claimedTurnId?: HarnessTurnId | null;
  readonly attemptCount?: number;
  readonly error?: string | null;
}

export interface HarnessSessionStore {
  createSession(session: HarnessSession): HarnessSession;
  getSession(id: HarnessSessionId): HarnessSession | undefined;
  getSessionByRoomAgent(roomId: RoomId, agentMemberId: RoomMemberId): HarnessSession | undefined;
  listSessions(): readonly HarnessSession[];
  listSessionsByRoom(roomId: RoomId): readonly HarnessSession[];
  getOrCreateSessionByRoomAgent(
    roomId: RoomId,
    agentMemberId: RoomMemberId,
    policy: AgentParticipationPolicy,
  ): HarnessSession;
  updateSessionStatus(update: UpdateHarnessSessionStatusInput): HarnessSession;
  bindRuntimeSession(input: BindRuntimeSessionInput): HarnessSession;
  createTrigger(trigger: HarnessTrigger): HarnessTrigger;
  getTrigger(id: HarnessTriggerId): HarnessTrigger | undefined;
  listTriggersBySession(sessionId: HarnessSessionId): readonly HarnessTrigger[];
  claimTrigger(input: ClaimHarnessTriggerInput): HarnessTrigger | undefined;
  updateTriggerStatus(input: UpdateHarnessTriggerStatusInput): HarnessTrigger;
}

interface RuntimeSessionRow {
  readonly runtime_session_id: string;
  readonly kind: string;
  readonly adapter_session_id: string | null;
  readonly label: string | null;
}

interface HarnessSessionRow {
  readonly harness_session_id: string;
  readonly room_id: string;
  readonly agent_member_id: string;
  readonly status: string;
  readonly runtime_session_id: string | null;
  readonly policy_json: string;
  readonly created_at: number;
  readonly updated_at: number;
  readonly last_turn_id: string | null;
  readonly last_trigger_id: string | null;
  readonly error: string | null;
  readonly runtime_kind: string | null;
  readonly runtime_adapter_session_id: string | null;
  readonly runtime_label: string | null;
}

interface HarnessTriggerRow {
  readonly harness_trigger_id: string;
  readonly session_id: string;
  readonly room_id: string;
  readonly agent_member_id: string;
  readonly kind: string;
  readonly status: string;
  readonly created_at: number;
  readonly updated_at: number;
  readonly source_message_id: string | null;
  readonly claimed_turn_id: string | null;
  readonly attempt_count: number;
  readonly payload_json: string | null;
  readonly error: string | null;
}

const triggerModes = new Set<AgentParticipationPolicy["triggerMode"]>([
  "mention_only",
  "watch_room",
  "manual",
]);
const visibleContexts = new Set<AgentParticipationPolicy["visibleContext"]>([
  "room",
  "mentions",
  "docs_only",
]);

const tableExists = (handle: DatabaseHandle, tableName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
};

const assertSchemaReady = (handle: DatabaseHandle): void => {
  if (
    !tableExists(handle, "runtime_sessions") ||
    !tableExists(handle, "harness_sessions") ||
    !tableExists(handle, "harness_triggers")
  ) {
    throw new DaemonDatabaseError("runMigrations must be called before createHarnessSessionStore");
  }
};

const parseRuntimeKind = (value: string): RuntimeKind => {
  if (!isRuntimeKind(value)) {
    throw new Error("Invalid runtime kind in database: " + value);
  }

  return value;
};

const parseHarnessSessionStatus = (value: string): HarnessSessionStatus => {
  if (!isHarnessSessionStatus(value)) {
    throw new Error("Invalid harness session status in database: " + value);
  }

  return value;
};

const parseHarnessTriggerKind = (value: string): HarnessTriggerKind => {
  if (!isHarnessTriggerKind(value)) {
    throw new Error("Invalid harness trigger kind in database: " + value);
  }

  return value;
};

const parseHarnessTriggerStatus = (value: string): HarnessTriggerStatus => {
  if (!isHarnessTriggerStatus(value)) {
    throw new Error("Invalid harness trigger status in database: " + value);
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

const parsePolicy = (value: string): AgentParticipationPolicy => {
  const parsed = parseJsonValue(value, "harness session policy_json");

  if (!isJsonObject(parsed)) {
    throw new Error("harness session policy_json in database must be a JSON object");
  }

  if (!triggerModes.has(parsed.triggerMode as AgentParticipationPolicy["triggerMode"])) {
    throw new Error(
      "Invalid harness session policy triggerMode in database: " + String(parsed.triggerMode),
    );
  }

  if (!Number.isInteger(parsed.maxConcurrentTurns) || Number(parsed.maxConcurrentTurns) < 1) {
    throw new Error(
      "harness session policy maxConcurrentTurns in database must be a positive integer",
    );
  }

  if (typeof parsed.allowAutonomousContinue !== "boolean") {
    throw new Error("harness session policy allowAutonomousContinue in database must be a boolean");
  }

  if (!visibleContexts.has(parsed.visibleContext as AgentParticipationPolicy["visibleContext"])) {
    throw new Error(
      "Invalid harness session policy visibleContext in database: " + String(parsed.visibleContext),
    );
  }

  if (
    parsed.toolPermissionProfile !== undefined &&
    typeof parsed.toolPermissionProfile !== "string"
  ) {
    throw new Error("harness session policy toolPermissionProfile in database must be a string");
  }

  return {
    triggerMode: parsed.triggerMode as AgentParticipationPolicy["triggerMode"],
    maxConcurrentTurns: parsed.maxConcurrentTurns as number,
    allowAutonomousContinue: parsed.allowAutonomousContinue,
    visibleContext: parsed.visibleContext as AgentParticipationPolicy["visibleContext"],
    ...(parsed.toolPermissionProfile === undefined
      ? {}
      : { toolPermissionProfile: parsed.toolPermissionProfile }),
  };
};

const parsePayload = (value: string | null): Record<string, unknown> | undefined => {
  if (value === null) {
    return undefined;
  }

  const parsed = parseJsonValue(value, "harness trigger payload_json");
  if (!isJsonObject(parsed)) {
    throw new Error("harness trigger payload_json in database must be a JSON object");
  }

  return parsed;
};

const toRuntimeSession = (row: RuntimeSessionRow): RuntimeSessionRef => ({
  id: runtimeSessionId(row.runtime_session_id),
  kind: parseRuntimeKind(row.kind),
  ...(row.adapter_session_id === null ? {} : { adapterSessionId: row.adapter_session_id }),
  ...(row.label === null ? {} : { label: row.label }),
});

const toJoinedRuntimeSession = (row: HarnessSessionRow): RuntimeSessionRef | undefined => {
  if (row.runtime_session_id === null) {
    return undefined;
  }

  if (row.runtime_kind === null) {
    throw new Error(
      "Harness session references missing runtime session: " + row.runtime_session_id,
    );
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

const toHarnessSession = (row: HarnessSessionRow): HarnessSession => {
  const runtime = toJoinedRuntimeSession(row);

  return {
    id: harnessSessionId(row.harness_session_id),
    roomId: roomId(row.room_id),
    agentMemberId: roomMemberId(row.agent_member_id),
    status: parseHarnessSessionStatus(row.status),
    policy: parsePolicy(row.policy_json),
    createdAt: unixMs(row.created_at),
    updatedAt: unixMs(row.updated_at),
    ...(runtime === undefined ? {} : { runtime }),
    ...(row.last_turn_id === null ? {} : { lastTurnId: harnessTurnId(row.last_turn_id) }),
    ...(row.last_trigger_id === null
      ? {}
      : { lastTriggerId: harnessTriggerId(row.last_trigger_id) }),
    ...(row.error === null ? {} : { error: row.error }),
  };
};

const toHarnessTrigger = (row: HarnessTriggerRow): HarnessTrigger => {
  const payload = parsePayload(row.payload_json);

  return {
    id: harnessTriggerId(row.harness_trigger_id),
    sessionId: harnessSessionId(row.session_id),
    roomId: roomId(row.room_id),
    agentMemberId: roomMemberId(row.agent_member_id),
    kind: parseHarnessTriggerKind(row.kind),
    status: parseHarnessTriggerStatus(row.status),
    createdAt: unixMs(row.created_at),
    updatedAt: unixMs(row.updated_at),
    ...(row.source_message_id === null
      ? {}
      : { sourceMessageId: roomMessageId(row.source_message_id) }),
    ...(row.claimed_turn_id === null ? {} : { claimedTurnId: harnessTurnId(row.claimed_turn_id) }),
    attemptCount: row.attempt_count,
    ...(payload === undefined ? {} : { payload }),
    ...(row.error === null ? {} : { error: row.error }),
  };
};

const hasOwn = <Key extends string>(
  value: object,
  key: Key,
): value is object & Record<Key, unknown> => Object.prototype.hasOwnProperty.call(value, key);

const assertValidAttemptCount = (value: number): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("harness trigger attemptCount must be a non-negative integer");
  }
};

export const createHarnessSessionStore = (handle: DatabaseHandle): HarnessSessionStore => {
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

  const ensureRuntimeSession = (runtime: RuntimeSessionRef | undefined): void => {
    if (runtime === undefined || selectRuntimeSession.get(runtime.id) !== undefined) {
      return;
    }

    insertRuntimeSession.run({
      id: runtime.id,
      kind: runtime.kind,
      adapterSessionId: runtime.adapterSessionId ?? null,
      label: runtime.label ?? null,
    });
  };

  const sessionColumns = `
    sessions.*,
    runtime.kind AS runtime_kind,
    runtime.adapter_session_id AS runtime_adapter_session_id,
    runtime.label AS runtime_label
  `;
  const selectSession = database.prepare(`
    SELECT ${sessionColumns}
    FROM harness_sessions sessions
    LEFT JOIN runtime_sessions runtime
      ON runtime.runtime_session_id = sessions.runtime_session_id
    WHERE sessions.harness_session_id = ?
  `);
  const selectSessionByRoomAgent = database.prepare(`
    SELECT ${sessionColumns}
    FROM harness_sessions sessions
    LEFT JOIN runtime_sessions runtime
      ON runtime.runtime_session_id = sessions.runtime_session_id
    WHERE sessions.room_id = ? AND sessions.agent_member_id = ?
  `);
  const listSessions = database.prepare(`
    SELECT ${sessionColumns}
    FROM harness_sessions sessions
    LEFT JOIN runtime_sessions runtime
      ON runtime.runtime_session_id = sessions.runtime_session_id
    ORDER BY sessions.created_at ASC, sessions.harness_session_id ASC
  `);
  const listSessionsByRoom = database.prepare(`
    SELECT ${sessionColumns}
    FROM harness_sessions sessions
    LEFT JOIN runtime_sessions runtime
      ON runtime.runtime_session_id = sessions.runtime_session_id
    WHERE sessions.room_id = ?
    ORDER BY sessions.created_at ASC, sessions.harness_session_id ASC
  `);
  const insertSession = database.prepare(`
    INSERT INTO harness_sessions (
      harness_session_id,
      room_id,
      agent_member_id,
      status,
      runtime_session_id,
      policy_json,
      created_at,
      updated_at,
      last_turn_id,
      last_trigger_id,
      error
    ) VALUES (
      @id,
      @roomId,
      @agentMemberId,
      @status,
      @runtimeSessionId,
      @policyJson,
      @createdAt,
      @updatedAt,
      @lastTurnId,
      @lastTriggerId,
      @error
    )
  `);
  const updateSessionStatusStatement = database.prepare(`
    UPDATE harness_sessions
    SET
      status = @status,
      updated_at = @updatedAt,
      last_turn_id = @lastTurnId,
      last_trigger_id = @lastTriggerId,
      error = @error
    WHERE harness_session_id = @id
  `);
  const bindRuntimeSessionStatement = database.prepare(`
    UPDATE harness_sessions
    SET
      runtime_session_id = @runtimeSessionId,
      updated_at = @updatedAt
    WHERE harness_session_id = @id
  `);
  const updateSessionLastTrigger = database.prepare(`
    UPDATE harness_sessions
    SET
      updated_at = @updatedAt,
      last_trigger_id = @lastTriggerId
    WHERE harness_session_id = @id
  `);

  const selectTrigger = database.prepare(
    "SELECT * FROM harness_triggers WHERE harness_trigger_id = ?",
  );
  const listTriggersBySession = database.prepare(`
    SELECT * FROM harness_triggers
    WHERE session_id = ?
    ORDER BY created_at ASC, harness_trigger_id ASC
  `);
  const insertTrigger = database.prepare(`
    INSERT INTO harness_triggers (
      harness_trigger_id,
      session_id,
      room_id,
      agent_member_id,
      kind,
      status,
      created_at,
      updated_at,
      source_message_id,
      claimed_turn_id,
      attempt_count,
      payload_json,
      error
    ) VALUES (
      @id,
      @sessionId,
      @roomId,
      @agentMemberId,
      @kind,
      @status,
      @createdAt,
      @updatedAt,
      @sourceMessageId,
      @claimedTurnId,
      @attemptCount,
      @payloadJson,
      @error
    )
  `);
  const claimTriggerStatement = database.prepare(`
    UPDATE harness_triggers
    SET
      status = 'claimed',
      claimed_turn_id = @claimedTurnId,
      attempt_count = attempt_count + 1,
      updated_at = @updatedAt,
      error = NULL
    WHERE harness_trigger_id = @id AND status IN ('pending', 'deferred')
  `);
  const updateTriggerStatusStatement = database.prepare(`
    UPDATE harness_triggers
    SET
      status = @status,
      updated_at = @updatedAt,
      claimed_turn_id = @claimedTurnId,
      attempt_count = @attemptCount,
      error = @error
    WHERE harness_trigger_id = @id
  `);

  return {
    createSession: (session) => {
      ensureRuntimeSession(session.runtime);
      insertSession.run({
        id: session.id,
        roomId: session.roomId,
        agentMemberId: session.agentMemberId,
        status: session.status,
        runtimeSessionId: session.runtime?.id ?? null,
        policyJson: stringifyJson(session.policy, "harness session policy"),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        lastTurnId: session.lastTurnId ?? null,
        lastTriggerId: session.lastTriggerId ?? null,
        error: session.error ?? null,
      });

      const row = selectSession.get(session.id) as HarnessSessionRow | undefined;
      if (!row) {
        throw new Error("failed to read created harness session");
      }

      return toHarnessSession(row);
    },

    getSession: (id) => {
      const row = selectSession.get(id) as HarnessSessionRow | undefined;
      return row ? toHarnessSession(row) : undefined;
    },

    getSessionByRoomAgent: (id, agentMemberId) => {
      const row = selectSessionByRoomAgent.get(id, agentMemberId) as HarnessSessionRow | undefined;
      return row ? toHarnessSession(row) : undefined;
    },

    listSessions: () => {
      const rows = listSessions.all() as HarnessSessionRow[];
      return rows.map(toHarnessSession);
    },

    listSessionsByRoom: (id) => {
      const rows = listSessionsByRoom.all(id) as HarnessSessionRow[];
      return rows.map(toHarnessSession);
    },

    getOrCreateSessionByRoomAgent: (id, agentMemberId, policy) => {
      const existing = selectSessionByRoomAgent.get(id, agentMemberId) as
        | HarnessSessionRow
        | undefined;
      if (existing) {
        return toHarnessSession(existing);
      }

      const now = unixMs(Date.now());
      const session: HarnessSession = {
        id: harnessSessionId("hsess_" + crypto.randomUUID()),
        roomId: id,
        agentMemberId,
        status: "idle",
        policy,
        createdAt: now,
        updatedAt: now,
      };

      insertSession.run({
        id: session.id,
        roomId: session.roomId,
        agentMemberId: session.agentMemberId,
        status: session.status,
        runtimeSessionId: null,
        policyJson: stringifyJson(session.policy, "harness session policy"),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        lastTurnId: null,
        lastTriggerId: null,
        error: null,
      });

      const row = selectSession.get(session.id) as HarnessSessionRow | undefined;
      if (!row) {
        throw new Error("failed to read created harness session");
      }

      return toHarnessSession(row);
    },

    updateSessionStatus: (update) => {
      const current = selectSession.get(update.id) as HarnessSessionRow | undefined;
      if (!current) {
        throw new Error("harness session not found: " + update.id);
      }

      updateSessionStatusStatement.run({
        id: update.id,
        status: update.status,
        updatedAt: update.updatedAt,
        lastTurnId: hasOwn(update, "lastTurnId")
          ? (update.lastTurnId ?? null)
          : current.last_turn_id,
        lastTriggerId: hasOwn(update, "lastTriggerId")
          ? (update.lastTriggerId ?? null)
          : current.last_trigger_id,
        error: hasOwn(update, "error") ? (update.error ?? null) : current.error,
      });

      const row = selectSession.get(update.id) as HarnessSessionRow | undefined;
      if (!row) {
        throw new Error("failed to read updated harness session");
      }

      return toHarnessSession(row);
    },

    bindRuntimeSession: (input) => {
      ensureRuntimeSession(input.runtime);
      const result = bindRuntimeSessionStatement.run({
        id: input.id,
        runtimeSessionId: input.runtime.id,
        updatedAt: input.updatedAt,
      });
      if (result.changes !== 1) {
        throw new Error("harness session not found: " + input.id);
      }

      const row = selectSession.get(input.id) as HarnessSessionRow | undefined;
      if (!row) {
        throw new Error("failed to read runtime-bound harness session");
      }

      return toHarnessSession(row);
    },

    createTrigger: (trigger) => {
      const session = selectSession.get(trigger.sessionId) as HarnessSessionRow | undefined;
      if (!session) {
        throw new Error("harness session not found: " + trigger.sessionId);
      }

      if (session.room_id !== trigger.roomId || session.agent_member_id !== trigger.agentMemberId) {
        throw new Error("harness trigger room and agent must match its session");
      }

      assertValidAttemptCount(trigger.attemptCount);
      insertTrigger.run({
        id: trigger.id,
        sessionId: trigger.sessionId,
        roomId: trigger.roomId,
        agentMemberId: trigger.agentMemberId,
        kind: trigger.kind,
        status: trigger.status,
        createdAt: trigger.createdAt,
        updatedAt: trigger.updatedAt,
        sourceMessageId: trigger.sourceMessageId ?? null,
        claimedTurnId: trigger.claimedTurnId ?? null,
        attemptCount: trigger.attemptCount,
        payloadJson:
          trigger.payload === undefined
            ? null
            : stringifyJson(trigger.payload, "harness trigger payload"),
        error: trigger.error ?? null,
      });
      updateSessionLastTrigger.run({
        id: trigger.sessionId,
        lastTriggerId: trigger.id,
        updatedAt: trigger.updatedAt,
      });

      const row = selectTrigger.get(trigger.id) as HarnessTriggerRow | undefined;
      if (!row) {
        throw new Error("failed to read created harness trigger");
      }

      return toHarnessTrigger(row);
    },

    getTrigger: (id) => {
      const row = selectTrigger.get(id) as HarnessTriggerRow | undefined;
      return row ? toHarnessTrigger(row) : undefined;
    },

    listTriggersBySession: (id) => {
      const rows = listTriggersBySession.all(id) as HarnessTriggerRow[];
      return rows.map(toHarnessTrigger);
    },

    claimTrigger: (input) => {
      const result = claimTriggerStatement.run({
        id: input.id,
        claimedTurnId: input.claimedTurnId,
        updatedAt: input.updatedAt,
      });
      if (result.changes !== 1) {
        return undefined;
      }

      const row = selectTrigger.get(input.id) as HarnessTriggerRow | undefined;
      if (!row) {
        throw new Error("failed to read claimed harness trigger");
      }

      return toHarnessTrigger(row);
    },

    updateTriggerStatus: (update) => {
      const current = selectTrigger.get(update.id) as HarnessTriggerRow | undefined;
      if (!current) {
        throw new Error("harness trigger not found: " + update.id);
      }

      const attemptCount = hasOwn(update, "attemptCount")
        ? (update.attemptCount as number)
        : current.attempt_count;
      assertValidAttemptCount(attemptCount);
      updateTriggerStatusStatement.run({
        id: update.id,
        status: update.status,
        updatedAt: update.updatedAt,
        claimedTurnId: hasOwn(update, "claimedTurnId")
          ? (update.claimedTurnId ?? null)
          : current.claimed_turn_id,
        attemptCount,
        error: hasOwn(update, "error") ? (update.error ?? null) : current.error,
      });

      const row = selectTrigger.get(update.id) as HarnessTriggerRow | undefined;
      if (!row) {
        throw new Error("failed to read updated harness trigger");
      }

      return toHarnessTrigger(row);
    },
  };
};
