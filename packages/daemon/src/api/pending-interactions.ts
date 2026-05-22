import {
  isHarnessSessionId,
  isPendingInteractionId,
  isPendingInteractionKind,
  isPendingInteractionStatus,
  isRoomId,
  isRoomMemberId,
  isRoomMessageId,
  pendingInteractionId,
  roomId,
  roomMemberId,
  roomMessageId,
  unixMs,
  type HarnessSession,
  type PendingInteraction,
  type PendingInteractionKind,
  type PendingInteractionStatus,
  type Room,
  type RoomMember,
  type RoomMessage,
} from "@linka/shared";
import { Hono } from "hono";

import { errorResponse } from "./errors.js";
import type { DaemonContainer } from "../container/index.js";
import type { DaemonEventEnvelope, PersistedDaemonEvent } from "../store/event-store.js";

interface CreatePendingInteractionRequestBody {
  readonly sessionId?: unknown;
  readonly kind?: unknown;
  readonly requestMessageId?: unknown;
  readonly expiresAt?: unknown;
  readonly payload?: unknown;
}

interface RespondPendingInteractionRequestBody {
  readonly senderMemberId?: unknown;
  readonly text?: unknown;
  readonly status?: unknown;
  readonly payload?: unknown;
}

interface PendingInteractionResponse {
  readonly ok: true;
  readonly interaction: PendingInteraction;
}

interface PendingInteractionListResponse {
  readonly ok: true;
  readonly interactions: readonly PendingInteraction[];
}

interface PendingInteractionRespondResponse {
  readonly ok: true;
  readonly interaction: PendingInteraction;
  readonly message: RoomMessage;
}

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

const createPendingInteractionApiId = (): PendingInteraction["id"] =>
  pendingInteractionId(`pint_${crypto.randomUUID()}`);
const createRoomMessageApiId = (): RoomMessage["id"] =>
  roomMessageId(`rmsg_${crypto.randomUUID()}`);
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

const parseRoomPathId = (value: string): Room["id"] => {
  if (!isRoomId(value)) throw new BadRequestError("roomId must be a valid room id");
  return roomId(value);
};

const parsePendingInteractionPathId = (value: string): PendingInteraction["id"] => {
  if (!isPendingInteractionId(value)) {
    throw new BadRequestError("interactionId must be a valid pending interaction id");
  }
  return pendingInteractionId(value);
};

const parseSessionId = (value: unknown): HarnessSession["id"] => {
  if (!isHarnessSessionId(value)) {
    throw new BadRequestError("sessionId must be a valid harness session id");
  }
  return value;
};

const parseMemberId = (value: unknown): RoomMember["id"] => {
  if (!isRoomMemberId(value)) {
    throw new BadRequestError("senderMemberId must be a valid room member id");
  }
  return roomMemberId(value);
};

const parseKind = (value: unknown): PendingInteractionKind => {
  if (!isPendingInteractionKind(value)) {
    throw new BadRequestError(
      "kind must be one of approval, question, clarification, handoff, takeover",
    );
  }
  return value;
};

const parseResponseStatus = (value: unknown): PendingInteractionStatus => {
  if (value === undefined || value === null) return "answered";
  if (!isPendingInteractionStatus(value) || value === "requested") {
    throw new BadRequestError("status must resolve the pending interaction");
  }
  return value;
};

const parseOptionalMessageId = (value: unknown): RoomMessage["id"] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!isRoomMessageId(value)) {
    throw new BadRequestError("requestMessageId must be a valid room message id");
  }
  return roomMessageId(value);
};

const parseOptionalUnixMs = (value: unknown): PendingInteraction["expiresAt"] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new BadRequestError("expiresAt must be a non-negative integer when provided");
  }
  return unixMs(Number(value));
};

const parseOptionalPayload = (value: unknown): Record<string, unknown> | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestError("payload must be a JSON object when provided");
  }
  return value as Record<string, unknown>;
};

const parseText = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestError("text must be a non-empty string");
  }
  return value.trim();
};

const ensureRoom = (container: DaemonContainer, id: Room["id"]): Room => {
  const room = container.roomStore.getRoom(id);
  if (!room) throw new NotFoundError("room not found");
  return room;
};

const ensureSession = (
  container: DaemonContainer,
  roomId: Room["id"],
  id: HarnessSession["id"],
): HarnessSession => {
  const session = container.harnessSessionStore.getSession(id);
  if (!session || session.roomId !== roomId) throw new NotFoundError("harness session not found");
  return session;
};

const ensureSender = (
  container: DaemonContainer,
  roomId: Room["id"],
  id: RoomMember["id"],
): RoomMember => {
  const member = container.roomStore.listMembers(roomId).find((candidate) => candidate.id === id);
  if (!member) throw new NotFoundError("sender member not found");
  if (member.kind !== "human")
    throw new BadRequestError("senderMemberId must reference a human member");
  return member;
};

const publishRoomEvent = (
  container: Pick<DaemonContainer, "eventStore" | "eventBus">,
  event: Omit<DaemonEventEnvelope, "id" | "createdAt">,
  createdAt: number,
): PersistedDaemonEvent => {
  const persisted = container.eventStore.append({
    ...event,
    id: createDaemonEventId(),
    createdAt,
  });
  container.eventBus.publish(persisted);
  return persisted;
};

const messageKindForStatus = (status: PendingInteractionStatus): RoomMessage["kind"] =>
  status === "approved" || status === "rejected" ? "decision" : "intervention";

const handleRouteError = (c: Parameters<typeof errorResponse>[0], error: unknown): Response => {
  if (error instanceof BadRequestError) return errorResponse(c, 400, "BAD_REQUEST", error.message);
  if (error instanceof NotFoundError) return errorResponse(c, 404, "NOT_FOUND", error.message);
  throw error;
};

export function createPendingInteractionsRoute(container: DaemonContainer): Hono {
  const app = new Hono();

  app.get("/rooms/:roomId/pending-interactions", (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      ensureRoom(container, id);
      const response: PendingInteractionListResponse = {
        ok: true,
        interactions: container.pendingInteractionStore.listInteractionsByRoom(id),
      };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/rooms/:roomId/pending-interactions", async (c) => {
    try {
      const room = ensureRoom(container, parseRoomPathId(c.req.param("roomId")));
      const object = assertBodyObject(
        await readJsonBody<CreatePendingInteractionRequestBody>(c.req),
      );
      const session = ensureSession(container, room.id, parseSessionId(object.sessionId));
      const now = unixMs(Date.now());
      const interaction = container.pendingInteractionStore.createInteraction({
        id: createPendingInteractionApiId(),
        sessionId: session.id,
        roomId: room.id,
        agentMemberId: session.agentMemberId,
        kind: parseKind(object.kind),
        status: "requested",
        createdAt: now,
        updatedAt: now,
        requestMessageId: parseOptionalMessageId(object.requestMessageId),
        expiresAt: parseOptionalUnixMs(object.expiresAt),
        payload: parseOptionalPayload(object.payload),
      });
      const response: PendingInteractionResponse = { ok: true, interaction };
      return c.json(response, 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.post("/pending-interactions/:interactionId/respond", async (c) => {
    try {
      const id = parsePendingInteractionPathId(c.req.param("interactionId"));
      const interaction = container.pendingInteractionStore.getInteraction(id);
      if (!interaction) throw new NotFoundError("pending interaction not found");
      if (interaction.status !== "requested") {
        throw new BadRequestError("pending interaction is already resolved");
      }

      const object = assertBodyObject(
        await readJsonBody<RespondPendingInteractionRequestBody>(c.req),
      );
      ensureRoom(container, interaction.roomId);
      const sender = ensureSender(
        container,
        interaction.roomId,
        parseMemberId(object.senderMemberId),
      );
      const text = parseText(object.text);
      const status = parseResponseStatus(object.status);
      const now = unixMs(Date.now());
      const message = container.messageStore.appendMessage({
        id: createRoomMessageApiId(),
        roomId: interaction.roomId,
        sender: { kind: "member", memberId: sender.id },
        kind: messageKindForStatus(status),
        createdAt: now,
        text,
        ...(interaction.requestMessageId === undefined
          ? {}
          : { replyTo: { messageId: interaction.requestMessageId } }),
        trace: {
          harnessSessionId: interaction.sessionId,
          sourceMessageIds:
            interaction.requestMessageId === undefined ? [] : [interaction.requestMessageId],
        },
        visibility: { scope: "room" },
        notification: { level: "normal" },
      });
      publishRoomEvent(
        container,
        { roomId: interaction.roomId, type: "message.created", payload: { message } },
        now,
      );
      const updated = container.pendingInteractionStore.updateInteractionStatus({
        id,
        status,
        updatedAt: now,
        responseMessageId: message.id,
        payload: parseOptionalPayload(object.payload),
      });
      const response: PendingInteractionRespondResponse = {
        ok: true,
        interaction: updated,
        message,
      };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
