import { Hono } from "hono";

import { errorResponse } from "./errors.js";
import type { DaemonContainer } from "../container/index.js";
import { createEventStream, parseCursor } from "../event-bus/sse.js";

export function createEventsRoute(container: DaemonContainer): Hono {
  const app = new Hono();

  app.get("/events", (c) => {
    let cursor: number;

    try {
      cursor = parseCursor(c.req.query("cursor") ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid event cursor";
      return errorResponse(c, 400, "INVALID_CURSOR", message);
    }

    return c.body(
      createEventStream({ eventStore: container.eventStore, eventBus: container.eventBus, cursor }),
      200,
      {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    );
  });

  return app;
}
