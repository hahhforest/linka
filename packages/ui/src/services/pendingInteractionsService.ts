import type {
  PendingInteraction,
  PendingInteractionId,
  PendingInteractionKind,
  PendingInteractionStatus,
  RoomId,
  RoomMemberId,
  RoomMessage,
} from "@linka/shared";

import { requestJson, type ApiClientOptions } from "./apiClient.js";

export type PendingInteractionsServiceOptions = Pick<
  ApiClientOptions,
  "baseUrl" | "fetchImpl" | "signal"
>;

type OkResponse<T extends string, Value> = Readonly<Record<T, Value>> & { readonly ok: true };

type PendingInteractionListResponse = OkResponse<"interactions", readonly PendingInteraction[]>;
type PendingInteractionResponse = OkResponse<"interaction", PendingInteraction>;
type PendingInteractionRespondResponse = PendingInteractionResponse & {
  readonly message: RoomMessage;
};

export interface CreatePendingInteractionInput {
  readonly sessionId: PendingInteraction["sessionId"];
  readonly kind: PendingInteractionKind;
  readonly requestMessageId?: RoomMessage["id"];
  readonly expiresAt?: PendingInteraction["expiresAt"];
  readonly payload?: Record<string, unknown>;
}

export interface RespondPendingInteractionInput {
  readonly senderMemberId: RoomMemberId;
  readonly text: string;
  readonly status?: Exclude<PendingInteractionStatus, "requested">;
  readonly payload?: Record<string, unknown>;
}

export const listRoomPendingInteractions = async (
  roomId: RoomId,
  options: PendingInteractionsServiceOptions = {},
): Promise<readonly PendingInteraction[]> => {
  const response = await requestJson<PendingInteractionListResponse>(
    `/linka/rooms/${roomId}/pending-interactions`,
    options,
  );
  return response.interactions;
};

export const createRoomPendingInteraction = async (
  roomId: RoomId,
  input: CreatePendingInteractionInput,
  options: PendingInteractionsServiceOptions = {},
): Promise<PendingInteraction> => {
  const response = await requestJson<PendingInteractionResponse>(
    `/linka/rooms/${roomId}/pending-interactions`,
    { ...options, method: "POST", body: input },
  );
  return response.interaction;
};

export const respondPendingInteraction = async (
  interactionId: PendingInteractionId,
  input: RespondPendingInteractionInput,
  options: PendingInteractionsServiceOptions = {},
): Promise<{ readonly interaction: PendingInteraction; readonly message: RoomMessage }> => {
  const response = await requestJson<PendingInteractionRespondResponse>(
    `/linka/pending-interactions/${interactionId}/respond`,
    { ...options, method: "POST", body: input },
  );
  return { interaction: response.interaction, message: response.message };
};
