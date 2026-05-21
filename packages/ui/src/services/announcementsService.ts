import type {
  Announcement,
  AnnouncementId,
  RoomId,
  RoomMemberId,
  RoomVisibility,
} from "@linka/shared";

import { requestJson, type ApiClientOptions } from "./apiClient.js";

export type AnnouncementsServiceOptions = Pick<
  ApiClientOptions,
  "baseUrl" | "fetchImpl" | "signal"
>;

export interface CreateRoomAnnouncementInput {
  readonly title?: string;
  readonly body: string;
  readonly createdByMemberId: RoomMemberId;
  readonly visibility?: RoomVisibility;
}

export interface UpdateAnnouncementInput {
  readonly title?: string | null;
  readonly body?: string;
  readonly visibility?: RoomVisibility;
}

type OkResponse<T extends string, Value> = Readonly<Record<T, Value>> & { readonly ok: true };

type AnnouncementResponse = OkResponse<"announcement", Announcement>;
type AnnouncementListResponse = OkResponse<"announcements", readonly Announcement[]>;
type DeleteAnnouncementResponse = { readonly ok: true };

const requestWithMethod = async <ResponseBody>(
  path: string,
  method: "PATCH" | "DELETE",
  options: AnnouncementsServiceOptions,
  body?: unknown,
): Promise<ResponseBody> =>
  requestJson<ResponseBody>(path, {
    ...options,
    method: method as ApiClientOptions["method"],
    ...(body === undefined ? {} : { body }),
  });

export const listRoomAnnouncements = async (
  roomId: RoomId,
  options: AnnouncementsServiceOptions = {},
): Promise<readonly Announcement[]> => {
  const response = await requestJson<AnnouncementListResponse>(
    `/linka/rooms/${roomId}/announcements`,
    options,
  );
  return response.announcements;
};

export const createRoomAnnouncement = async (
  roomId: RoomId,
  input: CreateRoomAnnouncementInput,
  options: AnnouncementsServiceOptions = {},
): Promise<Announcement> => {
  const response = await requestJson<AnnouncementResponse>(`/linka/rooms/${roomId}/announcements`, {
    ...options,
    method: "POST",
    body: input,
  });
  return response.announcement;
};

export const updateAnnouncement = async (
  announcementId: AnnouncementId,
  input: UpdateAnnouncementInput,
  options: AnnouncementsServiceOptions = {},
): Promise<Announcement> => {
  const response = await requestWithMethod<AnnouncementResponse>(
    `/linka/announcements/${announcementId}`,
    "PATCH",
    options,
    input,
  );
  return response.announcement;
};

export const deleteAnnouncement = async (
  announcementId: AnnouncementId,
  options: AnnouncementsServiceOptions = {},
): Promise<void> => {
  await requestWithMethod<DeleteAnnouncementResponse>(
    `/linka/announcements/${announcementId}`,
    "DELETE",
    options,
  );
};
