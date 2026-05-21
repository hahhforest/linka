import type {
  ParticipantId,
  Room,
  RoomId,
  RoomMember,
  RoomMemberId,
  RoomMemberKind,
  RoomMemberRole,
  RoomMention,
  RoomMessage,
  RoomMessageContentPart,
  RoomMessageExportMeta,
  RoomMessageKind,
  RoomMessageLlmRole,
  RoomMessageThread,
  RoomMessageTrace,
} from "@linka/shared";

import { requestJson, type ApiClientOptions } from "./apiClient.js";

export type RoomServiceOptions = Pick<ApiClientOptions, "baseUrl" | "fetchImpl" | "signal">;

export interface CreateRoomInput {
  readonly displayName: string;
  readonly topic?: string;
}

export interface AddRoomMemberInput {
  readonly participantId?: ParticipantId;
  readonly kind: RoomMemberKind;
  readonly displayName: string;
  readonly role?: RoomMemberRole;
}

export interface SendRoomMessageInput {
  readonly senderMemberId: RoomMemberId;
  readonly kind?: RoomMessageKind;
  readonly text?: string;
  readonly content?: readonly RoomMessageContentPart[];
  readonly llmRole?: RoomMessageLlmRole;
  readonly thread?: RoomMessageThread;
  readonly mentions?: readonly RoomMention[];
  readonly trace?: RoomMessageTrace;
  readonly exportMeta?: RoomMessageExportMeta;
}

type OkResponse<T extends string, Value> = Readonly<Record<T, Value>> & { readonly ok: true };

type RoomResponse = OkResponse<"room", Room>;
type RoomListResponse = OkResponse<"rooms", readonly Room[]>;
type RoomDetailResponse = RoomResponse & { readonly members?: readonly RoomMember[] };
type MemberResponse = OkResponse<"member", RoomMember>;
type MemberListResponse = OkResponse<"members", readonly RoomMember[]>;
type MessageResponse = OkResponse<"message", RoomMessage>;
type MessageListResponse = OkResponse<"messages", readonly RoomMessage[]>;

export const listRooms = async (options: RoomServiceOptions = {}): Promise<readonly Room[]> => {
  const response = await requestJson<RoomListResponse>("/linka/rooms", options);
  return response.rooms;
};

export const createRoom = async (
  input: CreateRoomInput,
  options: RoomServiceOptions = {},
): Promise<Room> => {
  const response = await requestJson<RoomResponse>("/linka/rooms", {
    ...options,
    method: "POST",
    body: input,
  });
  return response.room;
};

export const getRoom = async (
  roomId: RoomId,
  options: RoomServiceOptions & { readonly includeMembers?: boolean } = {},
): Promise<RoomDetailResponse> => {
  const suffix = options.includeMembers ? "?members=true" : "";
  return requestJson<RoomDetailResponse>(`/linka/rooms/${roomId}${suffix}`, options);
};

export const listRoomMembers = async (
  roomId: RoomId,
  options: RoomServiceOptions = {},
): Promise<readonly RoomMember[]> => {
  const response = await requestJson<MemberListResponse>(`/linka/rooms/${roomId}/members`, options);
  return response.members;
};

export const addRoomMember = async (
  roomId: RoomId,
  input: AddRoomMemberInput,
  options: RoomServiceOptions = {},
): Promise<RoomMember> => {
  const response = await requestJson<MemberResponse>(`/linka/rooms/${roomId}/members`, {
    ...options,
    method: "POST",
    body: input,
  });
  return response.member;
};

export const listRoomMessages = async (
  roomId: RoomId,
  options: RoomServiceOptions & { readonly afterSequence?: number; readonly limit?: number } = {},
): Promise<readonly RoomMessage[]> => {
  const params = new URLSearchParams();

  if (options.afterSequence !== undefined) {
    params.set("afterSequence", String(options.afterSequence));
  }

  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }

  const query = params.toString();
  const response = await requestJson<MessageListResponse>(
    `/linka/rooms/${roomId}/messages${query ? `?${query}` : ""}`,
    options,
  );
  return response.messages;
};

export const sendRoomMessage = async (
  roomId: RoomId,
  input: SendRoomMessageInput,
  options: RoomServiceOptions = {},
): Promise<RoomMessage> => {
  const response = await requestJson<MessageResponse>(`/linka/rooms/${roomId}/messages`, {
    ...options,
    method: "POST",
    body: input,
  });
  return response.message;
};
