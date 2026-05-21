import type {
  HarnessContextSnapshot,
  HarnessRun,
  HarnessRunId,
  RoomId,
  RuntimeEvent,
} from "@linka/shared";

import { requestJson, type ApiClientOptions } from "./apiClient.js";

export type HarnessRunsServiceOptions = Pick<ApiClientOptions, "baseUrl" | "fetchImpl" | "signal">;

type OkResponse<T extends string, Value> = Readonly<Record<T, Value>> & { readonly ok: true };

type HarnessRunListResponse = OkResponse<"runs", readonly HarnessRun[]>;
type RuntimeEventListResponse = OkResponse<"events", readonly RuntimeEvent[]>;

const TRAJECTORY_EXPORT_FORMAT = "linka-trajectory-jsonl";

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/$/, "");

const getDefaultBaseUrl = (): string => {
  const env = (
    import.meta as ImportMeta & { readonly env?: { readonly VITE_LINKA_DAEMON_URL?: string } }
  ).env;
  const configuredUrl = env?.VITE_LINKA_DAEMON_URL;

  if (typeof configuredUrl === "string" && configuredUrl.trim().length > 0) {
    return normalizeBaseUrl(configuredUrl.trim());
  }

  return "";
};

const getFetch = (fetchImpl?: typeof fetch): typeof fetch => {
  const resolvedFetch = fetchImpl ?? globalThis.fetch;

  if (!resolvedFetch) {
    throw new Error("fetch is not available for LinkA daemon requests");
  }

  return resolvedFetch;
};

const requestText = async (
  path: string,
  options: HarnessRunsServiceOptions = {},
): Promise<string> => {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? getDefaultBaseUrl());
  const response = await getFetch(options.fetchImpl)(`${baseUrl}${path}`, {
    method: "GET",
    headers: { Accept: "application/x-ndjson, text/plain" },
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`LinkA daemon request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
};

export interface TrajectoryExportRecord {
  readonly metadata: {
    readonly version: "linka-trajectory-jsonl.v1";
    readonly format: typeof TRAJECTORY_EXPORT_FORMAT;
    readonly runId: HarnessRunId;
    readonly snapshotId: HarnessContextSnapshot["id"];
    readonly roomId?: RoomId;
    readonly agentMemberId?: HarnessRun["targetMemberId"];
    readonly projectionVersion?: number;
    readonly redactionState?: HarnessContextSnapshot["redactionState"];
    readonly exportedAt?: HarnessContextSnapshot["createdAt"];
  };
  readonly messages: readonly unknown[];
  readonly runtimeEvents: readonly unknown[];
  readonly outputMessages: readonly unknown[];
  readonly labels: unknown;
  readonly [key: string]: unknown;
}

export interface HarnessRunTrajectoryExport {
  readonly text: string;
  readonly record: TrajectoryExportRecord;
}

export const parseTrajectoryExport = (text: string): TrajectoryExportRecord => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length !== 1) {
    throw new Error(`expected exactly one trajectory export record, received ${lines.length}`);
  }

  return JSON.parse(lines[0]) as TrajectoryExportRecord;
};

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

export const exportHarnessRunTrajectory = async (
  runId: HarnessRunId,
  options: HarnessRunsServiceOptions = {},
): Promise<HarnessRunTrajectoryExport> => {
  const text = await requestText(
    `/linka/harness-runs/${runId}/export?format=${TRAJECTORY_EXPORT_FORMAT}`,
    options,
  );

  return { text, record: parseTrajectoryExport(text) };
};
