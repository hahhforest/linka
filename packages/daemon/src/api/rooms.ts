import {
  isParticipantId,
  isRoomId,
  isRoomMemberId,
  isRoomMemberKind,
  isRoomMessageKind,
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  type ParticipantId,
  type PermissionPolicy,
  type Room,
  type RoomMember,
  type RoomMemberKind,
  type RoomMemberRole,
  type RoomMention,
  type RoomMessage,
  type RoomMessageKind,
  type RoomNotificationPolicy,
  type RoomPermissions,
  type RoomVisibility,
  unixMs,
} from "@linka/shared";
import { Hono } from "hono";

import { errorResponse } from "./errors.js";
import type { DaemonContainer } from "../container/index.js";
import type { DaemonEventEnvelope, PersistedDaemonEvent } from "../store/event-store.js";

interface CreateRoomRequestBody {
  readonly displayName?: unknown;
  readonly topic?: unknown;
}

interface AddMemberRequestBody {
  readonly participantId?: unknown;
  readonly kind?: unknown;
  readonly displayName?: unknown;
  readonly role?: unknown;
}

interface AppendMessageRequestBody {
  readonly senderMemberId?: unknown;
  readonly kind?: unknown;
  readonly text?: unknown;
  readonly mentions?: unknown;
}

type RoomResponse = { readonly ok: true; readonly room: Room };
type RoomListResponse = { readonly ok: true; readonly rooms: readonly Room[] };
type RoomDetailResponse = {
  readonly ok: true;
  readonly room: Room;
  readonly members?: readonly RoomMember[];
};
type MemberResponse = { readonly ok: true; readonly member: RoomMember };
type MemberListResponse = { readonly ok: true; readonly members: readonly RoomMember[] };
type MessageResponse = { readonly ok: true; readonly message: RoomMessage };
type MessageListResponse = { readonly ok: true; readonly messages: readonly RoomMessage[] };

const defaultVisibility: RoomVisibility = { scope: "room" };
const defaultNotificationPolicy: RoomNotificationPolicy = { level: "normal" };

const ownerPermissions: RoomPermissions = {
  canReadHistory: true,
  canPostMessage: true,
  canMentionMembers: true,
  canUploadFiles: true,
  canManageMembers: true,
};

const memberPermissions: RoomPermissions = {
  ...ownerPermissions,
  canManageMembers: false,
};

const guestPermissions: RoomPermissions = {
  canReadHistory: true,
  canPostMessage: false,
  canMentionMembers: false,
  canUploadFiles: false,
  canManageMembers: false,
};

const defaultPermissionPolicy: PermissionPolicy = {
  owner: ownerPermissions,
  admin: ownerPermissions,
  member: memberPermissions,
  guest: guestPermissions,
};

const memberRoles = new Set<RoomMemberRole>(["owner", "admin", "member", "guest"]);

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

const createRoomApiId = (): Room["id"] => roomId(`room_${crypto.randomUUID()}`);
const createMemberApiId = (): RoomMember["id"] => roomMemberId(`rmem_${crypto.randomUUID()}`);
const createMessageApiId = (): RoomMessage["id"] => roomMessageId(`rmsg_${crypto.randomUUID()}`);
const createParticipantApiId = (): ParticipantId => participantId(`part_${crypto.randomUUID()}`);
const createDaemonEventId = (): string => `evt_${crypto.randomUUID()}`;

const readJsonBody = async <T>(request: { json: () => Promise<unknown> }): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new BadRequestError("Request body must be JSON");
  }
};

const assertBodyObject = (body: unknown): Record<string, unknown> => {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestError("Request body must be a JSON object");
  }

  return body as Record<string, unknown>;
};

const parseNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestError(`${label} must be a non-empty string`);
  }

  return value.trim();
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

const parseRoomPathId = (value: string): Room["id"] => {
  if (!isRoomId(value)) {
    throw new BadRequestError("roomId must be a valid room id");
  }

  return roomId(value);
};

const parseRole = (value: unknown): RoomMemberRole => {
  if (value === undefined || value === null) {
    return "member";
  }

  if (typeof value !== "string" || !memberRoles.has(value as RoomMemberRole)) {
    throw new BadRequestError("role must be one of owner, admin, member, guest");
  }

  return value as RoomMemberRole;
};

const parseMemberKind = (value: unknown): RoomMemberKind => {
  if (!isRoomMemberKind(value)) {
    throw new BadRequestError("kind must be one of human, agent");
  }

  return value;
};

const parseMessageKind = (value: unknown): RoomMessageKind => {
  if (value === undefined || value === null) {
    return "text";
  }

  if (!isRoomMessageKind(value)) {
    throw new BadRequestError("kind must be a valid room message kind");
  }

  return value;
};

const parseParticipant = (value: unknown): ParticipantId => {
  if (value === undefined || value === null || value === "") {
    return createParticipantApiId();
  }

  if (!isParticipantId(value)) {
    throw new BadRequestError("participantId must be a valid participant id when provided");
  }

  return participantId(value);
};

const parseSenderMemberId = (value: unknown): RoomMember["id"] => {
  if (!isRoomMemberId(value)) {
    throw new BadRequestError("senderMemberId must be a valid room member id");
  }

  return roomMemberId(value);
};

const parseMentions = (
  value: unknown,
  membersById: ReadonlyMap<RoomMember["id"], RoomMember>,
): readonly RoomMention[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new BadRequestError("mentions must be an array when provided");
  }

  return value.map((item, index) => {
    const mention = assertBodyObject(item);
    const rawMemberId = mention.memberId;

    if (!isRoomMemberId(rawMemberId)) {
      throw new BadRequestError(`mentions[${index}].memberId must be a valid room member id`);
    }

    const memberId = roomMemberId(rawMemberId);
    if (!membersById.has(memberId)) {
      throw new NotFoundError(`mentioned member not found: ${memberId}`);
    }

    const displayText = parseOptionalString(mention.displayText, `mentions[${index}].displayText`);
    return displayText === undefined ? { memberId } : { memberId, displayText };
  });
};

const parseAfterSequence = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new BadRequestError("afterSequence must be a non-negative integer");
  }

  return parsed;
};

const parseLimit = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new BadRequestError("limit must be an integer from 1 to 500");
  }

  return parsed;
};

const ensureRoom = (container: DaemonContainer, id: Room["id"]): Room => {
  const room = container.roomStore.getRoom(id);
  if (!room) {
    throw new NotFoundError("room not found");
  }

  return room;
};

const publishRoomEvent = (
  container: Pick<DaemonContainer, "eventStore" | "eventBus">,
  event: Omit<DaemonEventEnvelope, "id" | "createdAt">,
): PersistedDaemonEvent => {
  const persisted = container.eventStore.append({
    ...event,
    id: createDaemonEventId(),
    createdAt: Date.now(),
  });

  container.eventBus.publish(persisted);
  return persisted;
};

const createRoom = (container: DaemonContainer, body: CreateRoomRequestBody): Room => {
  const object = assertBodyObject(body);
  const now = unixMs(Date.now());
  const room = container.roomStore.createRoom({
    id: createRoomApiId(),
    displayName: parseNonEmptyString(object.displayName, "displayName"),
    topic: parseOptionalString(object.topic, "topic"),
    createdAt: now,
    updatedAt: now,
    defaultVisibility,
    notificationPolicy: defaultNotificationPolicy,
    permissionPolicy: defaultPermissionPolicy,
  });

  publishRoomEvent(container, {
    roomId: room.id,
    type: "room.created",
    payload: { room },
  });

  return room;
};

const addMember = (
  container: DaemonContainer,
  id: Room["id"],
  body: AddMemberRequestBody,
): RoomMember => {
  ensureRoom(container, id);
  const object = assertBodyObject(body);
  const role = parseRole(object.role);
  const member = container.roomStore.addMember({
    id: createMemberApiId(),
    roomId: id,
    participantId: parseParticipant(object.participantId),
    kind: parseMemberKind(object.kind),
    role,
    status: "active",
    displayName: parseNonEmptyString(object.displayName, "displayName"),
    joinedAt: unixMs(Date.now()),
    permissions: defaultPermissionPolicy[role],
    notificationPolicy: defaultNotificationPolicy,
  });

  publishRoomEvent(container, {
    roomId: id,
    type: "member.joined",
    payload: { member },
  });

  return member;
};

const appendMessage = (
  container: DaemonContainer,
  id: Room["id"],
  body: AppendMessageRequestBody,
): RoomMessage => {
  ensureRoom(container, id);
  const object = assertBodyObject(body);
  const members = container.roomStore.listMembers(id);
  const membersById = new Map(members.map((member) => [member.id, member]));
  const senderMemberId = parseSenderMemberId(object.senderMemberId);

  if (!membersById.has(senderMemberId)) {
    throw new NotFoundError("sender member not found");
  }

  const text = parseOptionalString(object.text, "text");
  const message = container.messageStore.appendMessage({
    id: createMessageApiId(),
    roomId: id,
    sender: { kind: "member", memberId: senderMemberId },
    kind: parseMessageKind(object.kind),
    createdAt: unixMs(Date.now()),
    text,
    mentions: parseMentions(object.mentions, membersById),
    visibility: defaultVisibility,
    notification: defaultNotificationPolicy,
  });

  publishRoomEvent(container, {
    roomId: id,
    type: "message.created",
    payload: { message },
  });

  return message;
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

export function createRoomsRoute(container: DaemonContainer): Hono {
  const app = new Hono();

  app.post("/rooms", async (c) => {
    try {
      const room = createRoom(container, await readJsonBody<CreateRoomRequestBody>(c.req));
      const response: RoomResponse = { ok: true, room };
      return c.json(response, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/rooms", (c) => {
    const response: RoomListResponse = { ok: true, rooms: container.roomStore.listRooms() };
    return c.json(response);
  });

  app.get("/rooms/:roomId", (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      const room = ensureRoom(container, id);
      const response: RoomDetailResponse =
        c.req.query("members") === "true"
          ? { ok: true, room, members: container.roomStore.listMembers(id) }
          : { ok: true, room };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/rooms/:roomId/members", async (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      const member = addMember(container, id, await readJsonBody<AddMemberRequestBody>(c.req));
      const response: MemberResponse = { ok: true, member };
      return c.json(response, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/rooms/:roomId/members", (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      ensureRoom(container, id);
      const response: MemberListResponse = { ok: true, members: container.roomStore.listMembers(id) };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/rooms/:roomId/messages", async (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      const message = appendMessage(container, id, await readJsonBody<AppendMessageRequestBody>(c.req));
      const response: MessageResponse = { ok: true, message };
      return c.json(response, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/rooms/:roomId/messages", (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      ensureRoom(container, id);
      const response: MessageListResponse = {
        ok: true,
        messages: container.messageStore.listMessages(id, {
          afterSequence: parseAfterSequence(c.req.query("afterSequence")),
          limit: parseLimit(c.req.query("limit")),
        }),
      };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
