import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArgs, runCli } from "./index.js";

const createJsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const createOutput = (): { readonly lines: string[]; readonly write: (text: string) => void } => {
  const lines: string[] = [];
  return {
    lines,
    write: (text) => {
      lines.push(text);
    },
  };
};

test("parseArgs recognizes lifecycle and smoke commands", () => {
  assert.deepEqual(parseArgs(["health"]), { kind: "health" });
  assert.deepEqual(parseArgs(["start", "--once"]), { kind: "start", once: true });
  assert.deepEqual(parseArgs(["rooms", "create", "Research"]), { kind: "rooms.create", name: "Research" });
  assert.deepEqual(parseArgs(["messages", "send", "room_alpha", "rmem_human", "hello", "there"]), {
    kind: "messages.send",
    roomId: "room_alpha",
    senderMemberId: "rmem_human",
    text: "hello there",
  });
});

test("parseArgs rejects incomplete commands", () => {
  assert.throws(() => parseArgs(["rooms", "create"]), /Invalid arguments/);
  assert.throws(() => parseArgs(["messages", "send", "room_alpha", "rmem_human"]), /Invalid arguments/);
});

test("health reads PID file port before fetching daemon health", async () => {
  const stdout = createOutput();
  const stderr = createOutput();
  const requestedUrls: string[] = [];

  const exitCode = await runCli(["health"], {
    stdout: stdout.write,
    stderr: stderr.write,
    getProfile: () => "cli-health",
    getDataDir: () => "/tmp/linka-cli-health",
    resolvePort: () => 6200,
    getRunningDaemonPort: () => 6199,
    writePidFile: () => ({
      version: 1,
      profile: "cli-health",
      pid: process.pid,
      port: 6199,
      dataDir: "/tmp/linka-cli-health",
      cwd: "/tmp",
      startedAt: "2026-05-19T00:00:00.000Z",
    }),
    removePidFile: () => undefined,
    fetch: async (input) => {
      requestedUrls.push(String(input));
      return createJsonResponse({ ok: true, profile: "cli-health", port: 6199 });
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(requestedUrls, ["http://127.0.0.1:6199/linka/health"]);
  assert.deepEqual(JSON.parse(stdout.lines.join("")), { ok: true, profile: "cli-health", port: 6199 });
  assert.deepEqual(stderr.lines, []);
});

test("health falls back to resolved profile port when PID file is missing", async () => {
  const stdout = createOutput();
  const requestedUrls: string[] = [];

  const exitCode = await runCli(["health"], {
    stdout: stdout.write,
    getProfile: () => "cli-health-no-pid",
    getDataDir: () => "/tmp/linka-cli-health-no-pid",
    getRunningDaemonPort: () => null,
    resolvePort: () => 6200,
    writePidFile: () => ({
      version: 1,
      profile: "cli-health-no-pid",
      pid: process.pid,
      port: 6200,
      dataDir: "/tmp/linka-cli-health-no-pid",
      cwd: "/tmp",
      startedAt: "2026-05-19T00:00:00.000Z",
    }),
    removePidFile: () => undefined,
    fetch: async (input) => {
      requestedUrls.push(String(input));
      return createJsonResponse({ ok: true, profile: "cli-health-no-pid", port: 6200 });
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(requestedUrls, ["http://127.0.0.1:6200/linka/health"]);
  assert.deepEqual(JSON.parse(stdout.lines.join("")), { ok: true, profile: "cli-health-no-pid", port: 6200 });
});

test("start --once writes PID file, checks health, then shuts down and removes PID file", async () => {
  const stdout = createOutput();
  const calls: string[] = [];
  let runningPort: number | null = null;

  const exitCode = await runCli(["start", "--once"], {
    stdout: stdout.write,
    getProfile: () => "cli-start-once",
    getDataDir: () => "/tmp/linka-cli-start-once",
    resolvePort: () => 6300,
    getRunningDaemonPort: () => runningPort,
    writePidFile: (input) => {
      calls.push("writePidFile");
      runningPort = input.port;
      return {
        version: 1,
        profile: input.profile ?? "cli-start-once",
        pid: process.pid,
        port: input.port,
        dataDir: "/tmp/linka-cli-start-once",
        cwd: "/tmp",
        startedAt: "2026-05-19T00:00:00.000Z",
      };
    },
    removePidFile: () => {
      calls.push("removePidFile");
      runningPort = null;
    },
    createDaemonRuntime: async () => ({
      container: {
        profile: "cli-start-once",
        port: 6300,
        dataDir: "/tmp/linka-cli-start-once",
        startedAt: new Date("2026-05-19T00:00:00.000Z"),
        close: () => calls.push("container.close"),
      },
      server: {
        start: () => calls.push("server.start"),
        shutdown: async () => {
          calls.push("server.shutdown");
        },
      },
    }),
    fetch: async (input) => {
      calls.push(String(input));
      return createJsonResponse({ ok: true, profile: "cli-start-once", port: 6300 });
    },
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    "server.start",
    "writePidFile",
    "http://127.0.0.1:6300/linka/health",
    "server.shutdown",
    "container.close",
    "removePidFile",
  ]);
  assert.equal(runningPort, null);
  assert.deepEqual(JSON.parse(stdout.lines.join("")), { ok: true, profile: "cli-start-once", port: 6300 });
});

test("rooms create and messages send post JSON to daemon", async () => {
  const stdout = createOutput();
  const requests: { url: string; body: unknown }[] = [];

  const overrides = {
    stdout: stdout.write,
    getProfile: () => "cli-smoke",
    getDataDir: () => "/tmp/linka-cli-smoke",
    getRunningDaemonPort: () => 6400,
    resolvePort: () => 6400,
    writePidFile: () => ({
      version: 1 as const,
      profile: "cli-smoke",
      pid: process.pid,
      port: 6400,
      dataDir: "/tmp/linka-cli-smoke",
      cwd: "/tmp",
      startedAt: "2026-05-19T00:00:00.000Z",
    }),
    removePidFile: () => undefined,
    fetch: async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return createJsonResponse({ ok: true, url: String(input) }, { status: 201 });
    },
  };

  assert.equal(await runCli(["rooms", "create", "Research Room"], overrides), 0);
  assert.equal(await runCli(["messages", "send", "room_alpha", "rmem_human", "hello"], overrides), 0);

  assert.deepEqual(requests, [
    {
      url: "http://127.0.0.1:6400/linka/rooms",
      body: { displayName: "Research Room" },
    },
    {
      url: "http://127.0.0.1:6400/linka/rooms/room_alpha/messages",
      body: { senderMemberId: "rmem_human", kind: "text", text: "hello" },
    },
  ]);
});
