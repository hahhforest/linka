import type {
  HarnessProjection,
  HarnessRun,
  RuntimeAdapterCapabilities,
  RuntimeEvent,
} from "@linka/shared";

export interface RuntimeAdapterRunInput {
  readonly run: HarnessRun;
  readonly projection: HarnessProjection;
}

export interface RuntimeAdapterRun {
  readonly events: AsyncIterable<RuntimeEvent>;
  readonly cancel?: () => Promise<void>;
}

export interface RuntimeAdapter {
  getCapabilities(): RuntimeAdapterCapabilities;
  startRun(input: RuntimeAdapterRunInput): Promise<RuntimeAdapterRun>;
  cancelRun?(runId: HarnessRun["id"]): Promise<void>;
  resumeRun?(input: RuntimeAdapterRunInput): Promise<RuntimeAdapterRun>;
}

export const collectRuntimeEvents = async (
  iterable: AsyncIterable<RuntimeEvent>,
): Promise<readonly RuntimeEvent[]> => {
  const events: RuntimeEvent[] = [];

  for await (const event of iterable) {
    events.push(event);
  }

  return events;
};
