import {
  runtimeEventId,
  unixMs,
  isRecord,
  type HarnessRun,
  type RuntimeEvent,
  type RuntimeSessionRef,
  type UnixMs,
} from "@linka/shared";

export type OpenCodeJsonLineParseResult =
  | {
      readonly ok: true;
      readonly event: Record<string, unknown>;
    }
  | {
      readonly ok: false;
      readonly errorMessage: string;
    };

export interface ToOpenCodeRuntimeEventInput {
  readonly event: Record<string, unknown>;
  readonly run: HarnessRun;
  readonly sequence: number;
  readonly runtime?: RuntimeSessionRef;
  readonly createdAt?: UnixMs;
}

const EVENT_ID_RUN_PART_LIMIT = 80;
const EVENT_ID_SEQUENCE_PART_LIMIT = 24;

const OPENCODE_OUTPUT_EVENT_TYPES = new Set([
  "message",
  "assistant.message",
  "assistant.output",
  "output",
  "text",
  "content",
]);

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return String(error);
};

const getStringField = (
  event: Record<string, unknown>,
  keys: readonly string[],
): string | undefined => {
  for (const key of keys) {
    const value = event[key];
    if (typeof value === "string") return value;
  }

  return undefined;
};

const isOpenCodeOutputEvent = (event: Record<string, unknown>): boolean =>
  typeof event.type === "string" && OPENCODE_OUTPUT_EVENT_TYPES.has(event.type);

const toEventIdPart = (value: string, maxLength: number): string =>
  value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, maxLength);

const createRuntimeEventId = (run: HarnessRun, sequence: number) =>
  runtimeEventId(
    `rtevt_opencode_${toEventIdPart(String(run.id), EVENT_ID_RUN_PART_LIMIT)}_${toEventIdPart(
      String(sequence),
      EVENT_ID_SEQUENCE_PART_LIMIT,
    )}`,
  );

export const parseOpenCodeJsonLine = (line: string): OpenCodeJsonLineParseResult => {
  const trimmed = line.trim();

  if (trimmed.length === 0) {
    return { ok: false, errorMessage: "OpenCode JSON line is empty." };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch (error) {
    return {
      ok: false,
      errorMessage: `OpenCode JSON line is not valid JSON: ${getErrorMessage(error)}`,
    };
  }

  if (!isRecord(parsed)) {
    return { ok: false, errorMessage: "OpenCode JSON line must be a JSON object." };
  }

  return { ok: true, event: parsed };
};

export const parseOpenCodeJsonLines = (
  lines: readonly string[],
): readonly OpenCodeJsonLineParseResult[] => lines.map(parseOpenCodeJsonLine);

export const toOpenCodeRuntimeEvent = (input: ToOpenCodeRuntimeEventInput): RuntimeEvent => {
  const { event, run, sequence } = input;
  const runtime = input.runtime ?? run.runtime;
  const createdAt = input.createdAt ?? unixMs(Date.now());
  const typeValue = event.type;
  const errorValue = event.error;
  const hasErrorType = typeof typeValue === "string" && typeValue.toLowerCase().includes("error");
  const runtimeBase = {
    id: createRuntimeEventId(run, sequence),
    runId: run.id,
    roomId: run.roomId,
    targetMemberId: run.targetMemberId,
    sequence,
    createdAt,
    ...(runtime ? { runtime } : {}),
  };

  if (typeof errorValue === "string" || hasErrorType) {
    const fallbackMessage =
      typeof typeValue === "string"
        ? `OpenCode event reported error type: ${typeValue}`
        : "OpenCode event reported an error.";
    const message =
      getStringField(event, ["error", "message", "text", "content"]) ?? fallbackMessage;
    const code = getStringField(event, ["code"]);

    return {
      ...runtimeBase,
      type: "adapter.error",
      payload: {
        kind: "adapter_error",
        message,
        ...(code ? { code } : {}),
        details: event,
      },
    };
  }

  const text = getStringField(event, ["text", "message", "content"]);

  if (text !== undefined && isOpenCodeOutputEvent(event)) {
    return {
      ...runtimeBase,
      type: "adapter.output",
      payload: {
        kind: "adapter_output",
        stream: "summary",
        text,
        data: event,
      },
    };
  }

  return {
    ...runtimeBase,
    type: "run.updated",
    payload: {
      kind: "adapter_metadata",
      data: event,
    },
  };
};
