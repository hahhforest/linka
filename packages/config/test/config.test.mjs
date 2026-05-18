import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ConfigError,
  DEFAULT_PORT,
  formatPidFile,
  getDataDir,
  getPidFilePath,
  getProfile,
  getRunningDaemonPort,
  parsePidFile,
  readPidFile,
  removePidFile,
  resolvePort,
  writePidFile
} from "../dist/index.js";

function tempHome() {
  return mkdtempSync(join(tmpdir(), "linka-config-test-"));
}

function assertHasHash(profile, prefix) {
  assert.match(profile, new RegExp(`^${prefix}-[0-9a-f]{8}$`));
}

test("getProfile prefers explicit LINKA_PROFILE and does not append a hash", () => {
  assert.equal(getProfile({ env: { LINKA_PROFILE: " Feature/Profile 01 " }, git: null }), "feature-profile-01");
});

test("getProfile maps main-like branches to main", () => {
  assert.equal(getProfile({ env: {}, git: { branch: "master", worktreeRoot: "/repo/.worktree/master-copy" } }), "main");
  assert.equal(getProfile({ env: {}, git: { branch: "trunk", worktreeRoot: "/repo/.worktree/trunk-copy" } }), "main");
});

test("getProfile derives non-main profiles from branch plus stable hash", () => {
  const profile = getProfile({
    env: {},
    git: { branch: "feat/01-config-profile", worktreeRoot: "/repo/.worktree/01-config-profile" }
  });

  assertHasHash(profile, "feat-01-config-profile");
  assert.equal(
    profile,
    getProfile({ env: {}, git: { branch: "feat/01-config-profile", worktreeRoot: "/repo/.worktree/01-config-profile" } })
  );
});

test("getProfile separates identical branches in different worktree roots", () => {
  const first = getProfile({ env: {}, git: { branch: "feat/01-config-profile", worktreeRoot: "/repo-a/.worktree/config" } });
  const second = getProfile({ env: {}, git: { branch: "feat/01-config-profile", worktreeRoot: "/repo-b/.worktree/config" } });

  assertHasHash(first, "feat-01-config-profile");
  assertHasHash(second, "feat-01-config-profile");
  assert.notEqual(first, second);
});

test("getProfile falls back to cwd basename plus hash when git info is unavailable", () => {
  assertHasHash(getProfile({ env: {}, cwd: "/tmp/LinkA Local Copy", git: null }), "linka-local-copy");
});

test("getDataDir uses profile isolation under default home", () => {
  assert.equal(getDataDir({ env: {}, home: "/home/alice", profile: "feature-a" }), "/home/alice/.linka/profiles/feature-a");
});

test("getDataDir supports LINKA_HOME while still appending profile", () => {
  assert.equal(
    getDataDir({ env: { LINKA_HOME: "~/custom-linka" }, home: "/home/alice", profile: "feature-a" }),
    "/home/alice/custom-linka/profiles/feature-a"
  );
});

test("resolvePort uses DEFAULT_PORT for main", () => {
  assert.equal(DEFAULT_PORT, 4510);
  assert.equal(resolvePort({ env: {}, profile: "main" }), DEFAULT_PORT);
});

test("resolvePort gives stable non-main offsets", () => {
  const first = resolvePort({ env: {}, profile: "feature-a" });
  const second = resolvePort({ env: {}, profile: "feature-a" });
  assert.equal(first, second);
  assert.ok(first >= DEFAULT_PORT + 1);
  assert.ok(first <= DEFAULT_PORT + 20_000);
});

test("resolvePort validates LINKA_PORT override", () => {
  assert.equal(resolvePort({ env: { LINKA_PORT: "6200" }, profile: "main" }), 6200);
  assert.throws(() => resolvePort({ env: { LINKA_PORT: "0" }, profile: "main" }), ConfigError);
  assert.throws(() => resolvePort({ env: { LINKA_PORT: "70000" }, profile: "main" }), ConfigError);
  assert.throws(() => resolvePort({ env: { LINKA_PORT: "abc" }, profile: "main" }), ConfigError);
});

test("formatPidFile and parsePidFile round trip strict version/dataDir/cwd JSON", () => {
  const record = {
    version: 1,
    profile: "Feature/A",
    pid: 1234,
    port: 4511,
    dataDir: "/tmp/linka/profiles/feature-a",
    cwd: "/tmp/linka-worktree",
    startedAt: "2026-05-19T00:00:00.000Z"
  };
  const content = formatPidFile(record);

  assert.deepEqual(parsePidFile(content), {
    ...record,
    profile: "feature-a"
  });
  assert.throws(() => parsePidFile(JSON.stringify({ ...record, version: 2 })), ConfigError);
  assert.throws(() => parsePidFile(JSON.stringify({ ...record, dataDir: "relative/path" })), ConfigError);
});

test("read/write/remove PID file stay inside current profile and include dataDir/cwd", () => {
  const home = tempHome();

  try {
    const options = { env: {}, home, cwd: "/tmp/linka-cwd", profile: "feature-a" };
    const filePath = getPidFilePath(options);
    const record = writePidFile({ pid: 4321, port: 5010, startedAt: "2026-05-19T01:00:00.000Z" }, options);

    assert.deepEqual(record, {
      version: 1,
      profile: "feature-a",
      pid: 4321,
      port: 5010,
      dataDir: join(home, ".linka", "profiles", "feature-a"),
      cwd: "/tmp/linka-cwd",
      startedAt: "2026-05-19T01:00:00.000Z"
    });
    assert.equal(filePath, join(home, ".linka", "profiles", "feature-a", "daemon.pid.json"));
    assert.equal(JSON.parse(readFileSync(filePath, "utf8")).version, 1);
    assert.deepEqual(readPidFile(options), record);
    assert.equal(getRunningDaemonPort(options), 5010);

    removePidFile(options);
    assert.equal(readPidFile(options), null);
    assert.equal(getRunningDaemonPort(options), null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("PID profile mismatch does not fall back to another profile", () => {
  const home = tempHome();

  try {
    writePidFile({ pid: 1111, port: 5111, startedAt: "2026-05-19T02:00:00.000Z" }, { env: {}, home, profile: "feature-a" });
    assert.equal(readPidFile({ env: {}, home, profile: "feature-b" }), null);
    assert.equal(getRunningDaemonPort({ env: {}, home, profile: "feature-b" }), null);
    assert.throws(
      () => writePidFile({ profile: "feature-b", pid: 1111, port: 5111 }, { env: {}, home, profile: "feature-a" }),
      ConfigError
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("PID file with mismatched embedded profile is ignored for current profile", () => {
  const home = tempHome();

  try {
    const path = getPidFilePath({ env: {}, home, profile: "feature-a" });
    writePidFile({ pid: 2222, port: 5222, startedAt: "2026-05-19T03:00:00.000Z" }, { env: {}, home, profile: "feature-a" });
    assert.equal(readPidFile({ env: {}, home, profile: "feature-b", pidFilePath: path }), null);
    assert.equal(getRunningDaemonPort({ env: {}, home, profile: "feature-b", pidFilePath: path }), null);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
