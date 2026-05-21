import {
  announcementId,
  isAnnouncementId,
  isRoomId,
  isRoomMemberId,
  roomId,
  roomMemberId,
  type Announcement,
  type Room,
  type RoomMember,
  type RoomVisibility,
  unixMs,
} from "@linka/shared";
import { Hono } from "hono";

import { errorResponse } from "./errors.js";
import type { DaemonContainer } from "../container/index.js";

interface CreateAnnouncementRequestBody {
  readonly title?: unknown;
  readonly body?: unknown;
  readonly createdByMemberId?: unknown;
  readonly visibility?: unknown;
}

interface UpdateAnnouncementRequestBody {
  readonly title?: unknown;
  readonly body?: unknown;
  readonly visibility?: unknown;
}

type AnnouncementResponse = { readonly ok: true; readonly announcement: Announcement };
type AnnouncementListResponse = {
  readonly ok: true;
  readonly announcements: readonly Announcement[];
};
type DeleteAnnouncementResponse = { readonly ok: true };

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

const createAnnouncementApiId = (): Announcement["id"] =>
  announcementId(`ann_${crypto.randomUUID()}`);

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

const parseOptionalTitle = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new BadRequestError("title must be a string when provided");
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const parseOptionalBody = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return parseNonEmptyString(value, "body");
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

const parseOptionalVisibility = (value: unknown): RoomVisibility | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return parseVisibility(value);
};

const parseRoomPathId = (value: string): Room["id"] => {
  if (!isRoomId(value)) {
    throw new BadRequestError("roomId must be a valid room id");
  }

  return roomId(value);
};

const parseAnnouncementPathId = (value: string): Announcement["id"] => {
  if (!isAnnouncementId(value)) {
    throw new BadRequestError("announcementId must be a valid announcement id");
  }

  return announcementId(value);
};

const ensureRoom = (container: DaemonContainer, id: Room["id"]): Room => {
  const room = container.roomStore.getRoom(id);
  if (!room) {
    throw new NotFoundError("room not found");
  }

  return room;
};

const ensureAnnouncement = (
  container: DaemonContainer,
  id: Announcement["id"],
): Announcement => {
  const announcement = container.announcementStore.getAnnouncement(id);
  if (!announcement) {
    throw new NotFoundError("announcement not found");
  }

  return announcement;
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

const createAnnouncement = (
  container: DaemonContainer,
  contextRoomId: Room["id"],
  body: CreateAnnouncementRequestBody,
): Announcement => {
  ensureRoom(container, contextRoomId);
  const object = assertBodyObject(body);
  const announcementBody = parseNonEmptyString(object.body, "body");
  const createdByMemberId = parseCreatedByMemberId(object.createdByMemberId);
  ensureCreatorMember(container, contextRoomId, createdByMemberId);

  const now = unixMs(Date.now());
  return container.announcementStore.createAnnouncement({
    id: createAnnouncementApiId(),
    roomId: contextRoomId,
    title: parseOptionalTitle(object.title),
    body: announcementBody,
    createdAt: now,
    updatedAt: now,
    createdByMemberId,
    visibility: parseVisibility(object.visibility),
  });
};

const updateAnnouncement = (
  container: DaemonContainer,
  id: Announcement["id"],
  body: UpdateAnnouncementRequestBody,
): Announcement => {
  const current = ensureAnnouncement(container, id);
  ensureRoom(container, current.roomId);
  if (current.createdByMemberId) {
    ensureCreatorMember(container, current.roomId, current.createdByMemberId);
  }

  const object = assertBodyObject(body);
  const nextBody = parseOptionalBody(object.body) ?? current.body;
  const nextVisibility = parseOptionalVisibility(object.visibility) ?? current.visibility;

  return container.announcementStore.updateAnnouncement({
    ...current,
    title: object.title === undefined ? current.title : parseOptionalTitle(object.title),
    body: nextBody,
    updatedAt: unixMs(Date.now()),
    visibility: nextVisibility,
  });
};

const deleteAnnouncement = (container: DaemonContainer, id: Announcement["id"]): void => {
  const current = ensureAnnouncement(container, id);
  ensureRoom(container, current.roomId);
  if (current.createdByMemberId) {
    ensureCreatorMember(container, current.roomId, current.createdByMemberId);
  }

  if (!container.announcementStore.deleteAnnouncement(id)) {
    throw new NotFoundError("announcement not found");
  }
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

export function createAnnouncementsRoute(container: DaemonContainer): Hono {
  const app = new Hono();

  app.get("/rooms/:roomId/announcements", (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      ensureRoom(container, id);
      const response: AnnouncementListResponse = {
        ok: true,
        announcements: container.announcementStore.listAnnouncementsByRoom(id),
      };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/rooms/:roomId/announcements", async (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      const announcement = createAnnouncement(
        container,
        id,
        await readJsonBody<CreateAnnouncementRequestBody>(c.req),
      );
      const response: AnnouncementResponse = { ok: true, announcement };
      return c.json(response, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.patch("/announcements/:announcementId", async (c) => {
    try {
      const id = parseAnnouncementPathId(c.req.param("announcementId"));
      const announcement = updateAnnouncement(
        container,
        id,
        await readJsonBody<UpdateAnnouncementRequestBody>(c.req),
      );
      const response: AnnouncementResponse = { ok: true, announcement };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.delete("/announcements/:announcementId", (c) => {
    try {
      const id = parseAnnouncementPathId(c.req.param("announcementId"));
      deleteAnnouncement(container, id);
      const response: DeleteAnnouncementResponse = { ok: true };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
