import assert from "node:assert/strict";
import { test } from "node:test";

import { createDaemonApp } from "./app.js";
import { createDaemonContainer } from "./container/index.js";
import { createDaemonServer } from "./server.js";

test("serveHTTP delegates to the Hono app without opening a port", async () => {
  const container = createDaemonContainer({
    env: {},
    git: null,
    home: "/tmp/linka-home",
    profile: "server-test",
  });
  const app = createDaemonApp(container);
  const server = createDaemonServer({ app, port: container.port });

  const response = await server.serveHTTP(new Request("http://127.0.0.1/linka/health"));

  assert.equal(response.status, 200);
  const body = (await response.json()) as { profile: string };
  assert.equal(body.profile, "server-test");
});

test("start is idempotent and shutdown closes the active node server", async () => {
  const container = createDaemonContainer({
    env: {},
    git: null,
    home: "/tmp/linka-home",
    profile: "server-test",
  });
  const app = createDaemonApp(container);
  let serveCalls = 0;
  let closeCalls = 0;
  const fakeNodeServer = {
    close: (callback: (error?: Error) => void) => {
      closeCalls += 1;
      callback();
    },
  };
  const server = createDaemonServer({
    app,
    port: 7777,
    serveImpl: (options) => {
      serveCalls += 1;
      assert.equal(options.port, 7777);
      return fakeNodeServer as never;
    },
  });

  assert.equal(server.start(), fakeNodeServer);
  assert.equal(server.start(), fakeNodeServer);
  assert.equal(serveCalls, 1);

  await server.shutdown();
  await server.shutdown();
  assert.equal(closeCalls, 1);
});
