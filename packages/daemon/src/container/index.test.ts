import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { resolvePort } from "@linka/config";

import { createDaemonContainer } from "./index.js";

test("createDaemonContainer normalizes explicit profile without adding a hash", () => {
  let current = new Date("2026-05-19T00:00:00.000Z");
  const container = createDaemonContainer({
    databasePath: ":memory:",
    env: {},
    git: { branch: "ignored-branch", worktreeRoot: "/repo/.worktree/ignored" },
    home: "/tmp/linka-home",
    cwd: "/tmp/linka-core-test",
    profile: "Feature/Core",
    version: "test-version",
    now: () => current,
  });

  try {
    assert.equal(container.profile, "feature-core");
    assert.doesNotMatch(container.profile, /-[0-9a-f]{8}$/);
    assert.equal(container.port, resolvePort({ env: {}, profile: "feature-core" }));
    assert.equal(container.dataDir, "/tmp/linka-home/.linka/profiles/feature-core");
    assert.equal(container.version, "test-version");
    assert.equal(container.startedAt.toISOString(), "2026-05-19T00:00:00.000Z");

    current = new Date("2026-05-19T00:00:02.500Z");
    assert.equal(container.uptimeMs(), 2500);
  } finally {
    container.close();
  }
});

test("createDaemonContainer lets LINKA_PORT override explicit profile derived port", () => {
  const container = createDaemonContainer({
    databasePath: ":memory:",
    env: { LINKA_PORT: "6201" },
    git: null,
    home: "/tmp/linka-home",
    cwd: "/tmp/linka-core-test",
    profile: "Feature/Core",
  });

  try {
    assert.equal(container.profile, "feature-core");
    assert.equal(container.port, 6201);
    assert.equal(container.dataDir, "/tmp/linka-home/.linka/profiles/feature-core");
  } finally {
    container.close();
  }
});

test("createDaemonContainer returns independent plain objects", () => {
  const first = createDaemonContainer({ databasePath: ":memory:", env: {}, git: null, home: "/tmp/a", profile: "alpha" });
  const second = createDaemonContainer({ databasePath: ":memory:", env: {}, git: null, home: "/tmp/b", profile: "beta" });

  try {
    assert.notEqual(first, second);
    assert.equal(first.profile, "alpha");
    assert.equal(second.profile, "beta");
    assert.equal(Object.getPrototypeOf(first), Object.prototype);
  } finally {
    first.close();
    second.close();
  }
});

test("createDaemonContainer opens SQLite, runs migrations, and creates event dependencies", () => {
  const root = mkdtempSync(join(tmpdir(), "linka-daemon-container-"));
  const databasePath = join(root, "nested", "linka.sqlite");
  const container = createDaemonContainer({ databasePath, env: {}, git: null, home: root, profile: "db-test" });

  try {
    assert.equal(container.databasePath, databasePath);
    assert.ok(container.database);
    assert.equal(container.eventBus.getSubscriberCount(), 0);

    const event = container.eventStore.append({
      id: "evt_container",
      type: "container.ready",
      createdAt: 1,
      payload: { ok: true },
    });

    assert.equal(event.cursor, 1);
    assert.deepEqual(container.eventStore.listAfter(0, 10), [event]);
  } finally {
    container.close();
    rmSync(root, { recursive: true, force: true });
  }
});
