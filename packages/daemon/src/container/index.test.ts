import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePort } from "@linka/config";

import { createDaemonContainer } from "./index.js";

test("createDaemonContainer normalizes explicit profile without adding a hash", () => {
  let current = new Date("2026-05-19T00:00:00.000Z");
  const container = createDaemonContainer({
    env: {},
    git: { branch: "ignored-branch", worktreeRoot: "/repo/.worktree/ignored" },
    home: "/tmp/linka-home",
    cwd: "/tmp/linka-core-test",
    profile: "Feature/Core",
    version: "test-version",
    now: () => current,
  });

  assert.equal(container.profile, "feature-core");
  assert.doesNotMatch(container.profile, /-[0-9a-f]{8}$/);
  assert.equal(container.port, resolvePort({ env: {}, profile: "feature-core" }));
  assert.equal(container.dataDir, "/tmp/linka-home/.linka/profiles/feature-core");
  assert.equal(container.version, "test-version");
  assert.equal(container.startedAt.toISOString(), "2026-05-19T00:00:00.000Z");

  current = new Date("2026-05-19T00:00:02.500Z");
  assert.equal(container.uptimeMs(), 2500);
});

test("createDaemonContainer lets LINKA_PORT override explicit profile derived port", () => {
  const container = createDaemonContainer({
    env: { LINKA_PORT: "6201" },
    git: null,
    home: "/tmp/linka-home",
    cwd: "/tmp/linka-core-test",
    profile: "Feature/Core",
  });

  assert.equal(container.profile, "feature-core");
  assert.equal(container.port, 6201);
  assert.equal(container.dataDir, "/tmp/linka-home/.linka/profiles/feature-core");
});

test("createDaemonContainer returns independent plain objects", () => {
  const first = createDaemonContainer({ env: {}, git: null, home: "/tmp/a", profile: "alpha" });
  const second = createDaemonContainer({ env: {}, git: null, home: "/tmp/b", profile: "beta" });

  assert.notEqual(first, second);
  assert.equal(first.profile, "alpha");
  assert.equal(second.profile, "beta");
  assert.equal(Object.getPrototypeOf(first), Object.prototype);
});
