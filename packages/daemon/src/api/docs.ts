import {
  docId,
  isDocFormat,
  isDocId,
  isDocStatus,
  isRoomId,
  isRoomMemberId,
  roomId,
  roomMemberId,
  type Doc,
  type DocComment,
  type DocFormat,
  type DocRevision,
  type DocStatus,
  type Room,
  type RoomMember,
  type RoomVisibility,
  unixMs,
} from "@linka/shared";
import { Hono } from "hono";

import { errorResponse } from "./errors.js";
import type { DaemonContainer } from "../container/index.js";

interface CreateDocRequestBody {
  readonly title?: unknown;
  readonly body?: unknown;
  readonly format?: unknown;
  readonly status?: unknown;
  readonly createdByMemberId?: unknown;
  readonly visibility?: unknown;
}

type DocResponse = { readonly ok: true; readonly doc: Doc };
type DocListResponse = { readonly ok: true; readonly docs: readonly Doc[] };
type DocDetailResponse = {
  readonly ok: true;
  readonly doc: Doc;
  readonly revisions: readonly DocRevision[];
  readonly comments: readonly DocComment[];
};

const defaultVisibility: RoomVisibility = { scope: "room" };

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

const createDocApiId = (): Doc["id"] => docId(`doc_${crypto.randomUUID()}`);

const readJsonBody = async <T>(request: { json: () => Promise<unknown> }): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new BadRequestError("Request body must be JSON");
  }
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertBodyObject = (body: unknown): Record<string, unknown> => {
  if (!isJsonObject(body)) {
    throw new BadRequestError("Request body must be a JSON object");
  }

  return body;
};

const parseNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestError(`${label} must be a non-empty string`);
  }

  return value.trim();
};

const parseStringWithDefault = (value: unknown, label: string, defaultValue: string): string => {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== "string") {
    throw new BadRequestError(`${label} must be a string when provided`);
  }

  return value;
};

const parseDocFormat = (value: unknown): DocFormat => {
  if (value === undefined || value === null) {
    return "markdown";
  }

  if (!isDocFormat(value)) {
    throw new BadRequestError("format must be a valid doc format");
  }

  return value;
};

const parseDocStatus = (value: unknown): DocStatus => {
  if (value === undefined || value === null) {
    return "active";
  }

  if (!isDocStatus(value)) {
    throw new BadRequestError("status must be a valid doc status");
  }

  return value;
};

const parseCreatedByMemberId = (value: unknown): RoomMember["id"] => {
  if (!isRoomMemberId(value)) {
    throw new BadRequestError("createdByMemberId must be a valid room member id");
  }

  return roomMemberId(value);
};

const parseVisibility = (value: unknown): RoomVisibility => {
  if (value === undefined || value === null) {
    return defaultVisibility;
  }

  if (!isJsonObject(value)) {
    throw new BadRequestError("visibility must be a JSON object when provided");
  }

  return value as unknown as RoomVisibility;
};

const parseRoomPathId = (value: string): Room["id"] => {
  if (!isRoomId(value)) {
    throw new BadRequestError("roomId must be a valid room id");
  }

  return roomId(value);
};

const parseDocPathId = (value: string): Doc["id"] => {
  if (!isDocId(value)) {
    throw new BadRequestError("docId must be a valid doc id");
  }

  return docId(value);
};

const ensureRoom = (container: DaemonContainer, id: Room["id"]): Room => {
  const room = container.roomStore.getRoom(id);
  if (!room) {
    throw new NotFoundError("room not found");
  }

  return room;
};

const ensureDoc = (container: DaemonContainer, id: Doc["id"]): Doc => {
  const doc = container.docStore.getDoc(id);
  if (!doc) {
    throw new NotFoundError("doc not found");
  }

  return doc;
};

const ensureCreatorMember = (
  container: DaemonContainer,
  contextRoomId: Room["id"],
  memberId: RoomMember["id"],
): RoomMember => {
  const member = container.roomStore
    .listMembers(contextRoomId)
    .find((candidate) => candidate.id === memberId);

  if (!member) {
    throw new NotFoundError("creator member not found");
  }

  return member;
};

const createDoc = (
  container: DaemonContainer,
  contextRoomId: Room["id"],
  body: CreateDocRequestBody,
): Doc => {
  ensureRoom(container, contextRoomId);
  const object = assertBodyObject(body);
  const title = parseNonEmptyString(object.title, "title");
  const docBody = parseStringWithDefault(object.body, "body", "");
  const format = parseDocFormat(object.format);
  const status = parseDocStatus(object.status);
  const createdByMemberId = parseCreatedByMemberId(object.createdByMemberId);
  const visibility = parseVisibility(object.visibility);

  ensureCreatorMember(container, contextRoomId, createdByMemberId);

  const now = unixMs(Date.now());
  return container.docStore.createDoc({
    id: createDocApiId(),
    contextRoomId,
    title,
    format,
    status,
    body: docBody,
    createdAt: now,
    updatedAt: now,
    createdByMemberId,
    visibility,
  });
};

const handleRouteError = (c: Parameters<typeof errorResponse>[0], error: unknown): Response => {
  if (error instanceof BadRequestError) {
    return errorResponse(c, 400, "BAD_REQUEST", error.message);
  }

  if (error instanceof NotFoundError) {
    return errorResponse(c, 404, "NOT_FOUND", error.message);
  }

  throw error;
};

export function createDocsRoute(container: DaemonContainer): Hono {
  const app = new Hono();

  app.post("/rooms/:roomId/docs", async (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      const doc = createDoc(container, id, await readJsonBody<CreateDocRequestBody>(c.req));
      const response: DocResponse = { ok: true, doc };
      return c.json(response, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/rooms/:roomId/docs", (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      ensureRoom(container, id);
      const response: DocListResponse = { ok: true, docs: container.docStore.listDocsByRoom(id) };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/docs/:docId", (c) => {
    try {
      const id = parseDocPathId(c.req.param("docId"));
      const doc = ensureDoc(container, id);
      const response: DocDetailResponse = {
        ok: true,
        doc,
        revisions: container.docStore.listRevisions(id),
        comments: container.docStore.listComments(id),
      };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
