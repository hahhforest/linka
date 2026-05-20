import type { HarnessRun, HarnessRunId, RoomId, RuntimeEvent } from "@linka/shared";

import { requestJson, type ApiClientOptions } from "./apiClient.js";

export type HarnessRunsServiceOptions = Pick<ApiClientOptions, "baseUrl" | "fetchImpl" | "signal">;

type OkResponse<T extends string, Value> = Readonly<Record<T, Value>> & { readonly ok: true };

type HarnessRunListResponse = OkResponse<"runs", readonly HarnessRun[]>;
type RuntimeEventListResponse = OkResponse<"events", readonly RuntimeEvent[]>;

export const listRoomHarnessRuns = async (
  roomId: RoomId,
  options: HarnessRunsServiceOptions = {},
): Promise<readonly HarnessRun[]> => {
  const response = await requestJson<HarnessRunListResponse>(
    `/linka/rooms/${roomId}/harness-runs`,
    options,
  );
  return response.runs;
};

export const listHarnessRunEvents = async (
  runId: HarnessRunId,
  options: HarnessRunsServiceOptions = {},
): Promise<readonly RuntimeEvent[]> => {
  const response = await requestJson<RuntimeEventListResponse>(
    `/linka/harness-runs/${runId}/events`,
    options,
  );
  return response.events;
};
