import {
  harnessRunId,
  isHarnessRunId,
  isRoomId,
  roomId,
  type HarnessRun,
  type Room,
  type RuntimeEvent,
} from "@linka/shared";
import { Hono } from "hono";

import { errorResponse } from "./errors.js";
import type { DaemonContainer } from "../container/index.js";

interface HarnessRunListResponse {
  readonly ok: true;
  readonly runs: readonly HarnessRun[];
}

interface RuntimeEventListResponse {
  readonly ok: true;
  readonly events: readonly RuntimeEvent[];
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

const parseRoomPathId = (value: string): Room["id"] => {
  if (!isRoomId(value)) {
    throw new BadRequestError("roomId must be a valid room id");
  }

  return roomId(value);
};

const parseRunPathId = (value: string): HarnessRun["id"] => {
  if (!isHarnessRunId(value)) {
    throw new BadRequestError("runId must be a valid harness run id");
  }

  return harnessRunId(value);
};

const ensureRoom = (container: DaemonContainer, id: Room["id"]): Room => {
  const room = container.roomStore.getRoom(id);
  if (!room) {
    throw new NotFoundError("room not found");
  }

  return room;
};

const ensureRun = (container: DaemonContainer, id: HarnessRun["id"]): HarnessRun => {
  const run = container.harnessRunStore.getRun(id);
  if (!run) {
    throw new NotFoundError("harness run not found");
  }

  return run;
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

export function createHarnessRunsRoute(container: DaemonContainer): Hono {
  const app = new Hono();

  app.get("/rooms/:roomId/harness-runs", (c) => {
    try {
      const id = parseRoomPathId(c.req.param("roomId"));
      ensureRoom(container, id);
      const response: HarnessRunListResponse = {
        ok: true,
        runs: container.harnessRunStore.listRunsByRoom(id),
      };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  app.get("/harness-runs/:runId/events", (c) => {
    try {
      const id = parseRunPathId(c.req.param("runId"));
      ensureRun(container, id);
      const response: RuntimeEventListResponse = {
        ok: true,
        events: container.harnessRunStore.listEvents(id),
      };
      return c.json(response);
    } catch (error) {
      return handleRouteError(c, error);
    }
  });

  return app;
}
