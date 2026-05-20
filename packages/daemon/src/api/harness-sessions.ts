import {
  isRoomId,
  isRoomMemberId,
  roomId,
  roomMemberId,
  type AgentParticipationPolicy,
  type HarnessSession,
  type Room,
  type RoomMember,
} from "@linka/shared";
import { Hono } from "hono";

import { errorResponse } from "./errors.js";
import type { DaemonContainer } from "../container/index.js";

interface CreateHarnessSessionRequestBody {
  readonly agentMemberId?: unknown;
  readonly policy?: unknown;
}

interface HarnessSessionResponse {
  readonly ok: true;
  readonly session: HarnessSession;
}

interface HarnessSessionListResponse {
  readonly ok: true;
  readonly sessions: readonly HarnessSession[];
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

const defaultPolicy: AgentParticipationPolicy = {
  triggerMode: "mention_only",
  maxConcurrentTurns: 1,
  allowAutonomousContinue: false,
  visibleContext: "room",
};

const triggerModes = new Set<AgentParticipationPolicy["triggerMode"]>([
  "mention_only",
  "watch_room",
  "manual",
]);
const visibleContexts = new Set<AgentParticipationPolicy["visibleContext"]>([
  "room",
  "mentions",
  "docs_only",
]);

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
  if (!isRoomId(value)) {
    throw new BadRequestError("roomId must be a valid room id");
  }

  return roomId(value);
};

const parseAgentMemberId = (value: unknown): RoomMember["id"] => {
  if (!isRoomMemberId(value)) {
    throw new BadRequestError("agentMemberId must be a valid room member id");
  }

  return roomMemberId(value);
};

const parsePolicy = (value: unknown): AgentParticipationPolicy => {
  if (value === undefined || value === null) {
    return defaultPolicy;
  }

  const policy = assertBodyObject(value);
  if (!triggerModes.has(policy.triggerMode as AgentParticipationPolicy["triggerMode"])) {
    throw new BadRequestError("policy.triggerMode must be one of mention_only, watch_room, manual");
  }

  if (!Number.isInteger(policy.maxConcurrentTurns) || Number(policy.maxConcurrentTurns) < 1) {
    throw new BadRequestError("policy.maxConcurrentTurns must be a positive integer");
  }

  if (typeof policy.allowAutonomousContinue !== "boolean") {
    throw new BadRequestError("policy.allowAutonomousContinue must be a boolean");
  }

  if (!visibleContexts.has(policy.visibleContext as AgentParticipationPolicy["visibleContext"])) {
    throw new BadRequestError("policy.visibleContext must be one of room, mentions, docs_only");
  }

  if (
    policy.toolPermissionProfile !== undefined &&
    typeof policy.toolPermissionProfile !== "string"
  ) {
    throw new BadRequestError("policy.toolPermissionProfile must be a string when provided");
  }

  return {
    triggerMode: policy.triggerMode as AgentParticipationPolicy["triggerMode"],
    maxConcurrentTurns: policy.maxConcurrentTurns as number,
    allowAutonomousContinue: policy.allowAutonomousContinue,
    visibleContext: policy.visibleContext as AgentParticipationPolicy["visibleContext"],
    ...(policy.toolPermissionProfile === undefined
      ? {}
      : { toolPermissionProfile: policy.toolPermissionProfile }),
  };
};

const ensureRoom = (container: DaemonContainer, id: Room["id"]): Room => {
  const room = container.roomStore.getRoom(id);
  if (!room) {
    throw new NotFoundError("room not found");
  }

  return room;
};

const ensureAgentMember = (
  container: DaemonContainer,
  roomId: Room["id"],
  id: RoomMember["id"],
): RoomMember => {
  const member = container.roomStore.listMembers(roomId).find((candidate) => candidate.id === id);
  if (!member) {
    throw new NotFoundError("agent member not found");
  }

  if (member.kind !== "agent") {
    throw new BadRequestError("agentMemberId must reference an agent room member");
  }

  return member;
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

export function createHarnessSessionsRoute(container: DaemonContainer): Hono {
  const app = new Hono();

  app.post("/rooms/:roomId/harness-sessions", async (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      ensureRoom(container, id);
      const object = assertBodyObject(await readJsonBody<CreateHarnessSessionRequestBody>(c.req));
      const agentMemberId = parseAgentMemberId(object.agentMemberId);
      ensureAgentMember(container, id, agentMemberId);

      const existing = container.harnessSessionStore.getSessionByRoomAgent(id, agentMemberId);
      const session = container.harnessSessionStore.getOrCreateSessionByRoomAgent(
        id,
        agentMemberId,
        parsePolicy(object.policy),
      );
      const response: HarnessSessionResponse = { ok: true, session };
      return c.json(response, existing ? 200 : 201);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/rooms/:roomId/harness-sessions", (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      ensureRoom(container, id);
      const response: HarnessSessionListResponse = {
        ok: true,
        sessions: container.harnessSessionStore.listSessionsByRoom(id),
      };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
