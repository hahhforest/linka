import { Hono } from "hono";

import { errorResponse } from "./errors.js";
import type { DaemonContainer } from "../container/index.js";
import type { DaemonEventEnvelope, PersistedDaemonEvent } from "../store/event-store.js";

interface DevEventRequestBody {
  readonly type?: unknown;
  readonly roomId?: unknown;
  readonly payload?: unknown;
}

export interface DevEventResponse {
  readonly ok: true;
  readonly event: PersistedDaemonEvent;
}

const createDaemonEventId = (): string => `evt_${crypto.randomUUID()}`;

const parseDevEventBody = (body: DevEventRequestBody): Omit<DaemonEventEnvelope, "id" | "createdAt"> => {
  if (typeof body.type !== "string" || body.type.trim().length === 0) {
    throw new Error("type must be a non-empty string");
  }

  if (body.roomId !== undefined && typeof body.roomId !== "string") {
    throw new Error("roomId must be a string when provided");
  }

  return {
    type: body.type,
    roomId: body.roomId === undefined || body.roomId.trim().length === 0 ? undefined : body.roomId,
    payload: body.payload ?? null,
  };
};

export const persistDevEvent = (
  container: Pick<DaemonContainer, "eventStore" | "eventBus">,
  body: DevEventRequestBody,
): PersistedDaemonEvent => {
  const event = container.eventStore.append({
    ...parseDevEventBody(body),
    id: createDaemonEventId(),
    createdAt: Date.now(),
  });

  container.eventBus.publish(event);
  return event;
};

export function createDevEventsRoute(container: DaemonContainer): Hono {
  const app = new Hono();

  app.post("/dev/events", async (c) => {
    let body: DevEventRequestBody;

    try {
      body = (await c.req.json()) as DevEventRequestBody;
    } catch {
      return errorResponse(c, 400, "INVALID_JSON", "Request body must be JSON");
    }

    try {
      const event = persistDevEvent(container, body);
      const response: DevEventResponse = { ok: true, event };
      return c.json(response, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid dev event";
      return errorResponse(c, 400, "INVALID_DEV_EVENT", message);
    }
  });

  return app;
}
