import {
  docCommentId,
  docId,
  docRevisionId,
  isDocFormat,
  isDocId,
  isDocMentionKind,
  isDocStatus,
  isRoomId,
  isRoomMemberId,
  roomId,
  roomMemberId,
  type Doc,
  type DocComment,
  type DocCommentAnchor,
  type DocFormat,
  type DocMention,
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

interface UpdateDocRequestBody {
  readonly title?: unknown;
  readonly body?: unknown;
  readonly status?: unknown;
  readonly updatedByMemberId?: unknown;
  readonly summary?: unknown;
}

interface CreateDocCommentRequestBody {
  readonly body?: unknown;
  readonly createdByMemberId?: unknown;
  readonly revisionId?: unknown;
  readonly mentions?: unknown;
  readonly anchor?: unknown;
  readonly visibility?: unknown;
}

type DocResponse = { readonly ok: true; readonly doc: Doc };
type DocUpdateResponse = { readonly ok: true; readonly doc: Doc; readonly revision: DocRevision };
type DocListResponse = { readonly ok: true; readonly docs: readonly Doc[] };
type DocCommentResponse = { readonly ok: true; readonly comment: DocComment };
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
const createDocRevisionApiId = (): DocRevision["id"] =>
  docRevisionId(`drev_${crypto.randomUUID()}`);
const createDocCommentApiId = (): DocComment["id"] =>
  docCommentId(`dcmt_${crypto.randomUUID()}`);

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

const parseOptionalString = (value: unknown, label: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new BadRequestError(`${label} must be a string when provided`);
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
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

const parseRequiredMemberId = (value: unknown, label: string): RoomMember["id"] => {
  if (!isRoomMemberId(value)) {
    throw new BadRequestError(`${label} must be a valid room member id`);
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

const parseOptionalRevisionId = (value: unknown): DocRevision["id"] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new BadRequestError("revisionId must be a string when provided");
  }

  try {
    return docRevisionId(value);
  } catch {
    throw new BadRequestError("revisionId must be a valid doc revision id");
  }
};

const parseMentions = (value: unknown): readonly DocMention[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new BadRequestError("mentions must be an array when provided");
  }

  return value.map((item, index) => {
    const mention = assertBodyObject(item);

    if (!isDocMentionKind(mention.kind)) {
      throw new BadRequestError(`mentions[${index}].kind must be member`);
    }

    if (!isRoomMemberId(mention.memberId)) {
      throw new BadRequestError(`mentions[${index}].memberId must be a valid room member id`);
    }

    const displayText = parseOptionalString(mention.displayText, `mentions[${index}].displayText`);
    return displayText === undefined
      ? { kind: mention.kind, memberId: roomMemberId(mention.memberId) }
      : { kind: mention.kind, memberId: roomMemberId(mention.memberId), displayText };
  });
};

const parseAnchor = (value: unknown): DocCommentAnchor | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isJsonObject(value)) {
    throw new BadRequestError("anchor must be a JSON object when provided");
  }

  return value as unknown as DocCommentAnchor;
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

const ensureRoomMember = (
  container: DaemonContainer,
  contextRoomId: Room["id"],
  memberId: RoomMember["id"],
  label: string,
): RoomMember => {
  const member = container.roomStore
    .listMembers(contextRoomId)
    .find((candidate) => candidate.id === memberId);

  if (!member) {
    throw new NotFoundError(`${label} member not found`);
  }

  return member;
};

const ensureDocRevision = (
  container: DaemonContainer,
  doc: Doc,
  revisionId: DocRevision["id"] | undefined,
): DocRevision["id"] | undefined => {
  if (revisionId === undefined) {
    return undefined;
  }

  const revision = container.docStore
    .listRevisions(doc.id)
    .find((candidate) => candidate.id === revisionId);

  if (!revision || revision.contextRoomId !== doc.contextRoomId) {
    throw new NotFoundError("doc revision not found");
  }

  return revision.id;
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

  ensureRoomMember(container, contextRoomId, createdByMemberId, "creator");

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

const updateDoc = (
  container: DaemonContainer,
  id: Doc["id"],
  body: UpdateDocRequestBody,
): { readonly doc: Doc; readonly revision: DocRevision } => {
  const current = ensureDoc(container, id);
  const object = assertBodyObject(body);
  const updatedByMemberId = parseRequiredMemberId(object.updatedByMemberId, "updatedByMemberId");
  ensureRoomMember(container, current.contextRoomId, updatedByMemberId, "updater");

  const nextTitle = parseOptionalString(object.title, "title") ?? current.title;
  const nextBody = parseStringWithDefault(object.body, "body", current.body);
  const nextStatus = parseDocStatus(object.status ?? current.status);
  const summary = parseOptionalString(object.summary, "summary");
  const revisions = container.docStore.listRevisions(id);
  const revisionNumber = Math.max(0, ...revisions.map((revision) => revision.revisionNumber)) + 1;
  const now = unixMs(Date.now());
  if (!container.docStore.updateDoc) {
    throw new Error("doc store updateDoc is not available");
  }

  const revision = container.docStore.createRevision({
    id: createDocRevisionApiId(),
    docId: current.id,
    contextRoomId: current.contextRoomId,
    revisionNumber,
    format: current.format,
    status: "committed",
    body: nextBody,
    title: nextTitle,
    createdAt: now,
    createdByMemberId: updatedByMemberId,
    parentRevisionId: current.currentRevisionId,
    summary,
  });

  const doc = container.docStore.updateDoc({
    ...current,
    title: nextTitle,
    body: nextBody,
    status: nextStatus,
    updatedAt: now,
    currentRevisionId: revision.id,
  });

  return { doc, revision };
};

const createDocComment = (
  container: DaemonContainer,
  id: Doc["id"],
  body: CreateDocCommentRequestBody,
): DocComment => {
  const doc = ensureDoc(container, id);
  const object = assertBodyObject(body);
  const commentBody = parseNonEmptyString(object.body, "body");
  const createdByMemberId = parseRequiredMemberId(object.createdByMemberId, "createdByMemberId");
  ensureRoomMember(container, doc.contextRoomId, createdByMemberId, "creator");
  const revisionId = ensureDocRevision(container, doc, parseOptionalRevisionId(object.revisionId));
  const now = unixMs(Date.now());

  return container.docStore.createComment({
    id: createDocCommentApiId(),
    docId: doc.id,
    contextRoomId: doc.contextRoomId,
    revisionId,
    body: commentBody,
    status: "open",
    createdAt: now,
    updatedAt: now,
    createdByMemberId,
    mentions: parseMentions(object.mentions),
    anchor: parseAnchor(object.anchor),
    visibility: parseVisibility(object.visibility),
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

  app.patch("/docs/:docId", async (c) => {
    try {
      const id = parseDocPathId(c.req.param("docId"));
      const result = updateDoc(container, id, await readJsonBody<UpdateDocRequestBody>(c.req));
      const response: DocUpdateResponse = { ok: true, ...result };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/docs/:docId/comments", async (c) => {
    try {
      const id = parseDocPathId(c.req.param("docId"));
      const comment = createDocComment(
        container,
        id,
        await readJsonBody<CreateDocCommentRequestBody>(c.req),
      );
      const response: DocCommentResponse = { ok: true, comment };
      return c.json(response, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
