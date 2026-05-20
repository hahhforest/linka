import {
  isRecord,
  runtimeEventId,
  unixMs,
  type HarnessRun,
  type RuntimeEvent,
  type RuntimeEventType,
  type RuntimeSessionRef,
  type UnixMs,
} from "@linka/shared";

export type OpenCodeServeEvent = Record<string, unknown>;

export interface ToOpenCodeServeRuntimeEventInput {
  readonly event: OpenCodeServeEvent;
  readonly run: HarnessRun;
  readonly sequence: number;
  readonly runtime?: RuntimeSessionRef;
  readonly createdAt?: UnixMs;
}

export type OpenCodeServeTerminalState = "idle" | "error";

const EVENT_ID_RUN_PART_LIMIT = 80;
const EVENT_ID_SEQUENCE_PART_LIMIT = 24;

const MESSAGE_OUTPUT_TYPES = new Set(["message.part.delta", "message.part.updated"]);

const toEventIdPart = (value: string, maxLength: number): string =>
  value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, maxLength);

export const createOpenCodeServeRuntimeEventId = (run: HarnessRun, sequence: number) =>
  runtimeEventId(
    `rtevt_opencode_serve_${toEventIdPart(String(run.id), EVENT_ID_RUN_PART_LIMIT)}_${toEventIdPart(
      String(sequence),
      EVENT_ID_SEQUENCE_PART_LIMIT,
    )}`,
  );

const getStringField = (
  value: Record<string, unknown>,
  keys: readonly string[],
): string | undefined => {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === "string") return field;
  }

  return undefined;
};

const getNestedRecord = (
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | undefined => {
  for (const key of keys) {
    const field = value[key];
    if (isRecord(field)) return field;
  }

  return undefined;
};

const getRecordProperties = (
  record: Record<string, unknown>,
): Record<string, unknown> | undefined => getNestedRecord(record, ["properties"]);

const getPayload = (event: OpenCodeServeEvent): Record<string, unknown> | undefined =>
  getNestedRecord(event, ["payload"]);

const appendRecord = (
  records: Record<string, unknown>[],
  record: Record<string, unknown> | undefined,
) => {
  if (record !== undefined && !records.includes(record)) records.push(record);
};

const getEventRecords = (event: OpenCodeServeEvent): readonly Record<string, unknown>[] => {
  const records: Record<string, unknown>[] = [];
  const payload = getPayload(event);

  appendRecord(records, payload);
  appendRecord(records, payload === undefined ? undefined : getRecordProperties(payload));
  appendRecord(records, event);
  appendRecord(records, getRecordProperties(event));

  return records;
};

const getStringFieldFromEvent = (
  event: OpenCodeServeEvent,
  keys: readonly string[],
): string | undefined => {
  for (const record of getEventRecords(event)) {
    const field = getStringField(record, keys);
    if (field !== undefined) return field;
  }

  return undefined;
};

const getNestedRecordFromEvent = (
  event: OpenCodeServeEvent,
  keys: readonly string[],
): Record<string, unknown> | undefined => {
  for (const record of getEventRecords(event)) {
    const nested = getNestedRecord(record, keys);
    if (nested !== undefined) return nested;
  }

  return undefined;
};

const getOpenCodeServeEventType = (event: OpenCodeServeEvent): string | undefined =>
  getStringFieldFromEvent(event, ["type", "event"]);

export const getOpenCodeServeSessionId = (event: OpenCodeServeEvent): string | undefined => {
  const directSessionId = getStringFieldFromEvent(event, [
    "sessionID",
    "sessionId",
    "session_id",
    "session",
  ]);
  if (directSessionId !== undefined) return directSessionId;

  const session = getNestedRecordFromEvent(event, ["session"]);
  if (session === undefined) return undefined;

  return getStringField(session, ["id", "sessionID", "sessionId", "session_id"]);
};

export const isOpenCodeServeEventForSession = (
  event: OpenCodeServeEvent,
  adapterSessionId: string,
): boolean => getOpenCodeServeSessionId(event) === adapterSessionId;

const getRecordStatus = (record: Record<string, unknown>): string | undefined => {
  for (const key of ["status", "state"] as const) {
    const field = record[key];

    if (typeof field === "string") return field;

    if (isRecord(field)) {
      const status = getStringField(field, ["type", "status", "state", "name", "value"]);
      if (status !== undefined) return status;
    }
  }

  return undefined;
};

const getStatusFromEvent = (event: OpenCodeServeEvent): string | undefined => {
  for (const record of getEventRecords(event)) {
    const status = getRecordStatus(record);
    if (status !== undefined) return status;
  }

  return undefined;
};

export const getOpenCodeServeTerminalState = (
  event: OpenCodeServeEvent,
): OpenCodeServeTerminalState | undefined => {
  const type = getOpenCodeServeEventType(event)?.toLowerCase();
  const status = getStatusFromEvent(event)?.toLowerCase();

  if (type === "session.idle" || status === "idle") return "idle";
  if (type === "session.error" || type === "session.failed") return "error";
  if (status === "error" || status === "failed" || status === "failure") return "error";

  return undefined;
};

const getPartText = (part: Record<string, unknown>): string | undefined => {
  const directText = getStringField(part, ["text", "delta", "content"]);
  if (directText !== undefined) return directText;

  const nestedDelta = getNestedRecord(part, ["delta"]);
  if (nestedDelta !== undefined) return getStringField(nestedDelta, ["text", "content"]);

  return undefined;
};

export const getOpenCodeServeOutputText = (event: OpenCodeServeEvent): string | undefined => {
  const type = getOpenCodeServeEventType(event);
  const isMessageOutputType = type !== undefined && MESSAGE_OUTPUT_TYPES.has(type);
  const directText = getStringFieldFromEvent(event, ["text", "delta", "content"]);

  if (isMessageOutputType && directText !== undefined) return directText;

  const delta = getNestedRecordFromEvent(event, ["delta"]);
  if (isMessageOutputType && delta !== undefined) {
    const deltaText = getStringField(delta, ["text", "content"]);
    if (deltaText !== undefined) return deltaText;
  }

  const part = getNestedRecordFromEvent(event, ["part"]);
  if (part === undefined) return undefined;

  const partType = getStringField(part, ["type"]);
  const partText = getPartText(part);

  if (isMessageOutputType && partText !== undefined) return partText;
  if (partType === "text" && partText !== undefined) return partText;

  return undefined;
};

const getErrorMessage = (event: OpenCodeServeEvent): string => {
  const directMessage = getStringFieldFromEvent(event, ["error", "message", "text", "content"]);
  if (directMessage !== undefined && directMessage.trim().length > 0) return directMessage;

  const error = getNestedRecordFromEvent(event, ["error"]);
  if (error !== undefined) {
    const nestedMessage = getStringField(error, ["message", "name", "code", "text"]);
    if (nestedMessage !== undefined && nestedMessage.trim().length > 0) return nestedMessage;
  }

  const status = getNestedRecordFromEvent(event, ["status", "state"]);
  if (status !== undefined) {
    const statusMessage = getStringField(status, ["message", "error", "reason", "code"]);
    if (statusMessage !== undefined && statusMessage.trim().length > 0) return statusMessage;
  }

  return "OpenCode session reported an error.";
};

const createRuntimeBase = (input: ToOpenCodeServeRuntimeEventInput) => {
  const { run, sequence } = input;
  const runtime = input.runtime ?? run.runtime;
  const createdAt = input.createdAt ?? unixMs(Date.now());

  return {
    id: createOpenCodeServeRuntimeEventId(run, sequence),
    runId: run.id,
    roomId: run.roomId,
    targetMemberId: run.targetMemberId,
    sequence,
    createdAt,
    ...(runtime ? { runtime } : {}),
  };
};

const createOpenCodeServeOutputRuntimeEvent = (
  input: ToOpenCodeServeRuntimeEventInput,
  text: string,
): RuntimeEvent => ({
  ...createRuntimeBase(input),
  type: "adapter.output",
  payload: {
    kind: "adapter_output",
    stream: "summary",
    text,
    data: input.event,
  },
});

const createOpenCodeServeTerminalRuntimeEvent = (
  input: ToOpenCodeServeRuntimeEventInput,
  terminalState: OpenCodeServeTerminalState,
): RuntimeEvent => {
  const runtimeBase = createRuntimeBase(input);

  if (terminalState === "idle") {
    return {
      ...runtimeBase,
      type: "run.completed",
      payload: {
        kind: "run_status",
        status: "succeeded",
        details: input.event,
      },
    };
  }

  return {
    ...runtimeBase,
    type: "run.failed",
    payload: {
      kind: "run_status",
      status: "failed",
      message: getErrorMessage(input.event),
      details: input.event,
    },
  };
};

const createOpenCodeServeMetadataRuntimeEvent = (
  input: ToOpenCodeServeRuntimeEventInput,
): RuntimeEvent => ({
  ...createRuntimeBase(input),
  type: "run.updated",
  payload: {
    kind: "adapter_metadata",
    data: input.event,
  },
});

export const toOpenCodeServeRuntimeEvents = (
  input: ToOpenCodeServeRuntimeEventInput,
): readonly RuntimeEvent[] => {
  const terminalState = getOpenCodeServeTerminalState(input.event);
  const text = getOpenCodeServeOutputText(input.event);
  const events: RuntimeEvent[] = [];

  if (text !== undefined && text.trim().length > 0) {
    events.push(createOpenCodeServeOutputRuntimeEvent(input, text));
  }

  if (terminalState !== undefined) {
    events.push(
      createOpenCodeServeTerminalRuntimeEvent(
        { ...input, sequence: input.sequence + events.length },
        terminalState,
      ),
    );
  }

  if (events.length === 0) {
    events.push(createOpenCodeServeMetadataRuntimeEvent(input));
  }

  return events;
};

export const toOpenCodeServeRuntimeEvent = (
  input: ToOpenCodeServeRuntimeEventInput,
): RuntimeEvent =>
  toOpenCodeServeRuntimeEvents(input)[0] ?? createOpenCodeServeMetadataRuntimeEvent(input);

export const isOpenCodeServeTerminalRuntimeEvent = (event: RuntimeEvent): boolean => {
  const type: RuntimeEventType = event.type;
  return type === "run.completed" || type === "run.failed" || type === "run.cancelled";
};

export const parseOpenCodeServeSseFrame = (frame: string): OpenCodeServeEvent | undefined => {
  const eventNames: string[] = [];
  const dataLines: string[] = [];

  for (const rawLine of frame.split(/\r?\n/)) {
    if (rawLine.length === 0 || rawLine.startsWith(":")) continue;

    const separatorIndex = rawLine.indexOf(":");
    const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? "" : rawLine.slice(separatorIndex + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

    if (field === "event") eventNames.push(value);
    if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0) return undefined;

  const data = dataLines.join("\n");
  let parsed: unknown;

  try {
    parsed = JSON.parse(data) as unknown;
  } catch {
    parsed = data;
  }

  const eventName = eventNames.at(-1);

  if (isRecord(parsed)) {
    if (
      eventName !== undefined &&
      typeof parsed.type !== "string" &&
      typeof parsed.event !== "string"
    ) {
      return { ...parsed, type: eventName };
    }

    return parsed;
  }

  return {
    ...(eventName ? { type: eventName } : {}),
    data: parsed,
  };
};
