import assert from "node:assert/strict";
import { test } from "node:test";

import { createDaemonApp } from "./app.js";
import { createDaemonContainer } from "./container/index.js";

const container = createDaemonContainer({
  env: { LINKA_PORT: "6202" },
  git: null,
  home: "/tmp/linka-home",
  cwd: "/tmp/linka-core-test",
  profile: "core-test",
  version: "test-version",
  now: () => new Date("2026-05-19T00:00:00.000Z"),
});

test("createDaemonApp serves health under /linka base path", async () => {
  const app = createDaemonApp(container);
  const response = await app.request("http://127.0.0.1/linka/health");
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    ok: true,
    profile: "core-test",
    port: 6202,
    dataDir: "/tmp/linka-home/.linka/profiles/core-test",
    version: "test-version",
    startedAt: "2026-05-19T00:00:00.000Z",
    uptimeMs: 0,
  });
});

test("createDaemonApp returns uniform not found errors", async () => {
  const app = createDaemonApp(container);
  const response = await app.request("http://127.0.0.1/unknown");
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.deepEqual(body, {
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: "Route not found",
    },
  });
});
