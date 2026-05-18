import { Hono } from "hono";

import type { DaemonContainer } from "../container/index.js";

export interface HealthResponse {
  readonly ok: true;
  readonly profile: string;
  readonly port: number;
  readonly dataDir: string;
  readonly version: string;
  readonly startedAt: string;
  readonly uptimeMs: number;
}

export function createHealthRoute(container: DaemonContainer): Hono {
  const route = new Hono();

  route.get("/health", (c) => {
    const body: HealthResponse = {
      ok: true,
      profile: container.profile,
      port: container.port,
      dataDir: container.dataDir,
      version: container.version,
      startedAt: container.startedAt.toISOString(),
      uptimeMs: container.uptimeMs(),
    };

    return c.json(body);
  });

  return route;
}
