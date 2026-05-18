import { requestJson } from "./apiClient.js";

export interface DaemonHealthSnapshot {
  readonly ok: boolean;
  readonly statusText: string;
  readonly checkedAt: Date;
  readonly version?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getStatusText = (payload: unknown): string => {
  if (!isRecord(payload)) {
    return "daemon returned a non-object health payload";
  }

  // Compatibility only while daemon-core is landing around this lane; this does not define a new health contract.
  if (typeof payload.status === "string") {
    return payload.status;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return "daemon health endpoint responded";
};

const getVersion = (payload: unknown): string | undefined => {
  if (!isRecord(payload)) {
    return undefined;
  }

  return typeof payload.version === "string" ? payload.version : undefined;
};

const getOk = (payload: unknown): boolean => {
  if (!isRecord(payload)) {
    return true;
  }

  if (typeof payload.ok === "boolean") {
    return payload.ok;
  }

  // Compatibility only while daemon-core is landing around this lane; this does not define a new health contract.
  if (typeof payload.status === "string") {
    return ["ok", "online", "healthy", "ready"].includes(payload.status.toLowerCase());
  }

  return true;
};

export const getDaemonHealth = async (signal?: AbortSignal): Promise<DaemonHealthSnapshot> => {
  const payload = await requestJson<unknown>("/linka/health", { signal });

  return {
    ok: getOk(payload),
    statusText: getStatusText(payload),
    checkedAt: new Date(),
    version: getVersion(payload),
  };
};
