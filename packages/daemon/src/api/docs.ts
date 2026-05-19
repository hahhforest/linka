import {
  docId,
  isDocId,
  isRoomId,
  roomId,
  type Doc,
  type DocComment,
  type DocRevision,
  type Room,
} from "@linka/shared";
import { Hono } from "hono";

import { errorResponse } from "./errors.js";
import type { DaemonContainer } from "../container/index.js";

type DocListResponse = { readonly ok: true; readonly docs: readonly Doc[] };
type DocDetailResponse = {
  readonly ok: true;
  readonly doc: Doc;
  readonly revisions: readonly DocRevision[];
  readonly comments: readonly DocComment[];
};

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
