import type {
  Doc,
  DocComment,
  DocFormat,
  DocId,
  DocRevision,
  DocStatus,
  RoomId,
  RoomMemberId,
  RoomVisibility,
} from "@linka/shared";

import { requestJson, type ApiClientOptions } from "./apiClient.js";

export type DocsServiceOptions = Pick<ApiClientOptions, "baseUrl" | "fetchImpl" | "signal">;

export interface CreateRoomDocInput {
  readonly title: string;
  readonly body?: string;
  readonly format?: DocFormat;
  readonly status?: DocStatus;
  readonly createdByMemberId: RoomMemberId;
  readonly visibility?: RoomVisibility;
}

export interface DocDetail {
  readonly doc: Doc;
  readonly revisions: readonly DocRevision[];
  readonly comments: readonly DocComment[];
}

type OkResponse<T extends string, Value> = Readonly<Record<T, Value>> & { readonly ok: true };

type DocResponse = OkResponse<"doc", Doc>;
type DocListResponse = OkResponse<"docs", readonly Doc[]>;
type DocDetailResponse = DocDetail & { readonly ok: true };

export const listRoomDocs = async (
  roomId: RoomId,
  options: DocsServiceOptions = {},
): Promise<readonly Doc[]> => {
  const response = await requestJson<DocListResponse>(`/linka/rooms/${roomId}/docs`, options);
  return response.docs;
};

export const getDoc = async (
  docId: DocId,
  options: DocsServiceOptions = {},
): Promise<DocDetail> => {
  const response = await requestJson<DocDetailResponse>(`/linka/docs/${docId}`, options);
  return {
    doc: response.doc,
    revisions: response.revisions,
    comments: response.comments,
  };
};

export const createRoomDoc = async (
  roomId: RoomId,
  input: CreateRoomDocInput,
  options: DocsServiceOptions = {},
): Promise<Doc> => {
  const response = await requestJson<DocResponse>(`/linka/rooms/${roomId}/docs`, {
    ...options,
    method: "POST",
    body: input,
  });
  return response.doc;
};
