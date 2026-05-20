import { createDaemonApp } from "./app.js";
import { createDaemonContainer } from "./container/index.js";
import {
  createDefaultOpenCodeServeRuntimeAdapter,
  createOpenCodeRoomHarnessRunner,
} from "./harness/opencode-room-runner.js";
import { createDaemonServer } from "./server.js";

export { createDaemonApp } from "./app.js";
export {
  DAEMON_VERSION,
  createDaemonContainer,
  type DaemonContainer,
  type DaemonContainerOptions,
} from "./container/index.js";
export { errorResponse, handleDaemonError, type DaemonErrorBody } from "./api/errors.js";
export { createHealthRoute, type HealthResponse } from "./api/health.js";
export { createDaemonServer, type DaemonServer, type DaemonServerOptions } from "./server.js";

const isEntrypoint = process.argv[1]
  ? import.meta.url === new URL(process.argv[1], "file:").href
  : false;

if (isEntrypoint) {
  const container = createDaemonContainer();
  const adapter = createDefaultOpenCodeServeRuntimeAdapter({
    cwd: process.cwd(),
    env: process.env,
  });
  const app = createDaemonApp(container, {
    rooms: { harnessRunner: createOpenCodeRoomHarnessRunner({ container, adapter }) },
  });
  const server = createDaemonServer({ app, port: container.port, hostname: "127.0.0.1" });

  server.start();
  console.log(`linka daemon listening on http://127.0.0.1:${container.port}/linka`);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    try {
      await server.shutdown();
      console.log(`linka daemon stopped after ${signal}`);
      process.exit(0);
    } catch (error) {
      console.error("linka daemon shutdown failed", error);
      process.exit(1);
    }
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
