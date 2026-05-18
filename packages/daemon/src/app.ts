import { Hono } from "hono";

import { createDevEventsRoute } from "./api/dev-events.js";
import { errorResponse, handleDaemonError } from "./api/errors.js";
import { createEventsRoute } from "./api/events.js";
import { createHealthRoute } from "./api/health.js";
import type { DaemonContainer } from "./container/index.js";

export function createDaemonApp(container: DaemonContainer): Hono {
  const app = new Hono();
  const linka = app.basePath("/linka");

  app.onError(handleDaemonError);
  app.notFound((c) => errorResponse(c, 404, "NOT_FOUND", "Route not found"));

  linka.route("/", createHealthRoute(container));
  linka.route("/", createEventsRoute(container));
  linka.route("/", createDevEventsRoute(container));

  return app;
}
