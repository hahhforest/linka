import type { RuntimeAdapter, RuntimeAdapterRun, RuntimeAdapterRunInput } from "@linka/harness";
import {
  getRoomMessagePlainText,
  runtimeEventId,
  runtimeSessionId,
  type HarnessProjection,
  type HarnessRun,
  type RuntimeAdapterCapabilities,
  type RuntimeEvent,
  type RuntimeSessionRef,
  type UnixMs,
} from "@linka/shared";

export const TEST_RUNTIME_ADAPTER_CAPABILITIES: RuntimeAdapterCapabilities = {
  kind: "test",
  supportsInteractiveSession: false,
  supportsStreamingEvents: true,
  supportsDocContext: true,
  supportsCancellation: false,
  supportedEventTypes: ["run.started", "adapter.output", "run.completed"],
};

const ID_PART_LIMIT = 72;

const toIdPart = (value: string): string =>
  value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, ID_PART_LIMIT);

const getEventCreatedAt = (run: HarnessRun): UnixMs => run.startedAt ?? run.createdAt;

const getSenderLabel = (message: HarnessProjection["messages"][number]): string => {
  if (message.sender.kind === "member") return String(message.sender.memberId);
  return message.sender.label ?? "system";
};

const getLastMessageSummary = (projection: HarnessProjection): string => {
  const message = projection.messages.at(-1);
  if (message === undefined) return "none";

  const text = getRoomMessagePlainText(message).trim();
  const textSummary = text && text.length > 0 ? text : `[${message.kind}]`;
  return `#${message.sequence} ${getSenderLabel(message)}: ${textSummary}`;
};

const createRuntimeSession = (run: HarnessRun, projection: HarnessProjection): RuntimeSessionRef =>
  run.runtime ?? {
    id: runtimeSessionId(
      `rsess_test_${toIdPart(String(run.roomId))}_${toIdPart(String(run.targetMemberId))}`,
    ),
    kind: "test",
    adapterSessionId: `test:${run.roomId}:${run.targetMemberId}`,
    label: `Test Runtime - ${projection.room.displayName}`,
  };

const createEventId = (run: HarnessRun, suffix: string) =>
  runtimeEventId(`rtevt_test_${toIdPart(String(run.id))}_${suffix}`);

export const formatTestRuntimeOutputText = (
  run: HarnessRun,
  projection: HarnessProjection,
): string =>
  [
    "LinkA test runtime completed.",
    `room=${projection.room.displayName} (${projection.room.id})`,
    `projection messages=${projection.messages.length} docs=${projection.docs.length} members=${projection.members.length}`,
    `trigger=${projection.request.trigger.type} target=${projection.viewer.displayName} (${run.targetMemberId})`,
    `lastMessage=${getLastMessageSummary(projection)}`,
  ].join("\n");

async function* runtimeEvents(events: readonly RuntimeEvent[]): AsyncIterable<RuntimeEvent> {
  for (const event of events) {
    yield event;
  }
}

export class TestRuntimeAdapter implements RuntimeAdapter {
  getCapabilities(): RuntimeAdapterCapabilities {
    return TEST_RUNTIME_ADAPTER_CAPABILITIES;
  }

  async startRun(input: RuntimeAdapterRunInput): Promise<RuntimeAdapterRun> {
    const { run, projection } = input;
    const runtime = createRuntimeSession(run, projection);
    const createdAt = getEventCreatedAt(run);
    const outputText = formatTestRuntimeOutputText(run, projection);

    return {
      events: runtimeEvents([
        {
          id: createEventId(run, "started"),
          runId: run.id,
          roomId: run.roomId,
          targetMemberId: run.targetMemberId,
          sequence: 1,
          type: "run.started",
          createdAt,
          runtime,
          payload: { kind: "run_status", status: "running", message: "test runtime started" },
        },
        {
          id: createEventId(run, "output"),
          runId: run.id,
          roomId: run.roomId,
          targetMemberId: run.targetMemberId,
          sequence: 2,
          type: "adapter.output",
          createdAt,
          runtime,
          payload: { kind: "adapter_output", stream: "summary", text: outputText },
        },
        {
          id: createEventId(run, "completed"),
          runId: run.id,
          roomId: run.roomId,
          targetMemberId: run.targetMemberId,
          sequence: 3,
          type: "run.completed",
          createdAt,
          runtime,
          payload: { kind: "run_status", status: "succeeded", message: "test runtime completed" },
        },
      ]),
    };
  }
}

export const createTestRuntimeAdapter = (): TestRuntimeAdapter => new TestRuntimeAdapter();
