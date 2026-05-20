import type { AgentParticipationPolicy, HarnessSession, RoomId, RoomMemberId } from "@linka/shared";

import { requestJson, type ApiClientOptions } from "./apiClient.js";

export type HarnessSessionsServiceOptions = Pick<
  ApiClientOptions,
  "baseUrl" | "fetchImpl" | "signal"
>;

type OkResponse<T extends string, Value> = Readonly<Record<T, Value>> & { readonly ok: true };

type HarnessSessionListResponse = OkResponse<"sessions", readonly HarnessSession[]>;
type HarnessSessionResponse = OkResponse<"session", HarnessSession>;

export interface CreateHarnessSessionInput {
  readonly agentMemberId: RoomMemberId;
  readonly policy?: AgentParticipationPolicy;
}

export const listRoomHarnessSessions = async (
  roomId: RoomId,
  options: HarnessSessionsServiceOptions = {},
): Promise<readonly HarnessSession[]> => {
  const response = await requestJson<HarnessSessionListResponse>(
    `/linka/rooms/${roomId}/harness-sessions`,
    options,
  );
  return response.sessions;
};

export const createRoomHarnessSession = async (
  roomId: RoomId,
  input: CreateHarnessSessionInput,
  options: HarnessSessionsServiceOptions = {},
): Promise<HarnessSession> => {
  const response = await requestJson<HarnessSessionResponse>(
    `/linka/rooms/${roomId}/harness-sessions`,
    { ...options, method: "POST", body: input },
  );
  return response.session;
};
