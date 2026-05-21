import { Hono } from "hono";

import { createAnnouncementsRoute } from "./api/announcements.js";
import { createLocalDevCorsMiddleware } from "./api/cors.js";
import { createDevEventsRoute } from "./api/dev-events.js";
import { createDocsRoute } from "./api/docs.js";
import { errorResponse, handleDaemonError } from "./api/errors.js";
import { createEventsRoute } from "./api/events.js";
import { createHealthRoute } from "./api/health.js";
import { createHarnessExportsRoute } from "./api/harness-exports.js";
import { createHarnessRunsRoute } from "./api/harness-runs.js";
import { createHarnessSessionsRoute } from "./api/harness-sessions.js";
import { createRoomsRoute, type CreateRoomsRouteOptions } from "./api/rooms.js";
import type { DaemonContainer } from "./container/index.js";

export interface CreateDaemonAppOptions {
  readonly rooms?: CreateRoomsRouteOptions;
}

export function createDaemonApp(
  container: DaemonContainer,
  options: CreateDaemonAppOptions = {},
): Hono {
  const app = new Hono();
  const linka = app.basePath("/linka");

  app.use("*", createLocalDevCorsMiddleware());
  app.onError(handleDaemonError);
  app.notFound((c) => errorResponse(c, 404, "NOT_FOUND", "Route not found"));

  linka.route("/", createHealthRoute(container));
  linka.route("/", createEventsRoute(container));
  linka.route("/", createDevEventsRoute(container));
  linka.route("/", createRoomsRoute(container, options.rooms));
  linka.route("/", createDocsRoute(container));
  linka.route("/", createAnnouncementsRoute(container));
  linka.route("/", createHarnessExportsRoute(container));
  linka.route("/", createHarnessRunsRoute(container));
  linka.route("/", createHarnessSessionsRoute(container));

  return app;
}
