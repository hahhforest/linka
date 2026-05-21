#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const timeoutMs = Number.parseInt(process.env.LINKA_DAEMON_UI_E2E_TIMEOUT_MS ?? "120000", 10);
const rootUrlPrefix = "http://127.0.0.1";
const roomName = `Phase 33 E2E Room ${Date.now()}`;
const roomTopic = "Daemon-backed browser E2E coverage for room, docs, announcements, and activity.";
const docTitle = `Phase 33 E2E Doc ${Date.now()}`;
const docBody =
  "Acceptance: daemon-backed UI can create and select a real Room, then create a Doc.";
const announcementTitle = `Phase 33 E2E Notice ${Date.now()}`;
const announcementBody = "Initial daemon-backed announcement body.";
const editedAnnouncementTitle = `${announcementTitle} Edited`;
const editedAnnouncementBody = "Edited daemon-backed announcement body.";
const trajectorySeedSuffix = `${process.pid}_${Date.now()}`;
const trajectoryExportSummary = `Phase 34 trajectory export fixture answer ${trajectorySeedSuffix}`;
let seededTrajectoryExport;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = (promise, ms, label) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

const findAvailablePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
          return;
        }

        reject(new Error("unable to allocate a local port"));
      });
    });
  });

const findChromeExecutable = () => {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.BROWSER_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
};

const messageDataToText = async (data) => {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString();
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString();
  }
  if (typeof data?.arrayBuffer === "function") {
    return Buffer.from(await data.arrayBuffer()).toString();
  }

  return String(data);
};

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  async connect() {
    if (typeof WebSocket !== "function") {
      throw new Error("global WebSocket is not available in this Node runtime");
    }

    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", (event) => this.#handleMessage(event.data));

    await withTimeout(
      new Promise((resolve, reject) => {
        this.socket.addEventListener("open", resolve, { once: true });
        this.socket.addEventListener("error", () => reject(new Error("CDP websocket error")), {
          once: true,
        });
      }),
      timeoutMs,
      "CDP websocket connection",
    );
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) ?? [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;

    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  close() {
    this.socket?.close();
  }

  async #handleMessage(data) {
    const text = await messageDataToText(data);
    const message = JSON.parse(text);

    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }

    const handlers = this.handlers.get(message.method) ?? [];
    for (const handler of handlers) {
      handler(message.params ?? {});
    }
  }
}

const formatRemoteValue = (value) => {
  if ("value" in value) return String(value.value);
  return value.description ?? value.type ?? "<unserializable>";
};

const getBrowserWebSocketUrl = (stderr) => {
  const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
  return match?.[1];
};

const getBrowserWebSocketUrlFromActivePort = async (userDataDir) => {
  const activePortPath = join(userDataDir, "DevToolsActivePort");

  let content;
  try {
    content = await readFile(activePortPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }

  const [port, path] = content.trim().split(/\r?\n/);
  if (!port || !path) return undefined;

  return "ws://127.0.0.1:" + port + (path.startsWith("/") ? path : "/" + path);
};

const getBrowserWebSocketUrlFromJsonVersion = async (port) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(500),
    });
    if (!response.ok) return undefined;

    const version = await response.json();
    return typeof version.webSocketDebuggerUrl === "string"
      ? version.webSocketDebuggerUrl
      : undefined;
  } catch {
    return undefined;
  }
};

const createPageTarget = async (browserWebSocketUrl) => {
  const browserUrl = new URL(browserWebSocketUrl);
  const endpoint = `http://${browserUrl.host}/json/new?${encodeURIComponent("about:blank")}`;
  let response = await fetch(endpoint, { method: "PUT" });

  if (!response.ok) {
    response = await fetch(endpoint);
  }

  if (!response.ok) {
    throw new Error(`unable to create Chrome target: ${response.status} ${response.statusText}`);
  }

  const target = await response.json();
  if (!target.webSocketDebuggerUrl) {
    throw new Error("Chrome target response did not include webSocketDebuggerUrl");
  }

  return target.webSocketDebuggerUrl;
};

const spawnManaged = (label, command, args, options) => {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];

  const collect = (streamLabel, chunk) => {
    const text = chunk.toString();
    output.push(text);
    if (output.join("").length > 20000) output.splice(0, output.length - 20);
    if (process.env.LINKA_DAEMON_UI_E2E_VERBOSE === "1") {
      process.stderr.write(`[${label}:${streamLabel}] ${text}`);
    }
  };

  child.stdout.on("data", (chunk) => collect("stdout", chunk));
  child.stderr.on("data", (chunk) => collect("stderr", chunk));

  child.once("exit", (code, signal) => {
    if (code !== 0 && signal === null) {
      collect("exit", `process exited with code ${code}\n`);
    }
  });

  return {
    child,
    label,
    getOutput: () => output.join("").trim().slice(-4000),
  };
};

const stopProcess = async (managed) => {
  if (!managed?.child || managed.child.exitCode !== null) return;

  managed.child.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => managed.child.once("exit", resolve)), delay(2500)]);

  if (managed.child.exitCode === null) {
    managed.child.kill("SIGKILL");
    await Promise.race([
      new Promise((resolve) => managed.child.once("exit", resolve)),
      delay(1000),
    ]);
  }
};

const waitForHttp = async (url, label, accept = (response) => response.ok) => {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (accept(response)) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`${label} did not become ready at ${url}: ${lastError?.message ?? "unknown"}`);
};

const pageEvaluate = async (page, expression, label) => {
  const evaluation = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (evaluation.exceptionDetails) {
    const details = evaluation.exceptionDetails;
    const message = details.exception?.description ?? details.text ?? `${label} failed`;
    throw new Error(message);
  }

  return evaluation.result?.value;
};

const js = (value) => JSON.stringify(value);

const json = (value) => JSON.stringify(value);

const requestJson = async (url, label, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

const getProfileDatabasePath = (linkaHome, profile) =>
  join(linkaHome, "profiles", profile, "linka.sqlite");

const sqlValue = (value) => {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
};

const sqlJson = (value) => sqlValue(json(value));

const runDaemonSqliteScript = (databasePath, sql) => {
  const script = `
    import Database from "better-sqlite3";
    const database = new Database(process.argv[1]);
    database.pragma("foreign_keys = ON");
    try {
      database.exec(process.argv[2]);
    } finally {
      database.close();
    }
  `;
  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      "@linka/daemon",
      "exec",
      "node",
      "--input-type=module",
      "-e",
      script,
      databasePath,
      sql,
    ],
    { cwd: process.cwd(), encoding: "utf8", env: process.env },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `sqlite seed failed with code ${result.status}: ${result.stderr || result.stdout || "<empty>"}`,
    );
  }
};

const seedTrajectoryExportFixture = async ({ daemonUrl, linkaHome, profile }) => {
  const roomsBody = await requestJson(`${daemonUrl}/linka/rooms`, "list rooms before run seed");
  const room = roomsBody.rooms?.find((candidate) => candidate.displayName === roomName);

  if (!room) {
    throw new Error(`unable to seed trajectory export: created room not found (${roomName})`);
  }

  const membersBody = await requestJson(
    `${daemonUrl}/linka/rooms/${room.id}/members`,
    "list room members before run seed",
  );
  const human = membersBody.members?.find((member) => member.kind === "human");
  const agent = membersBody.members?.find((member) => member.kind === "agent");

  if (!human || !agent) {
    throw new Error("unable to seed trajectory export: room needs human and agent members");
  }

  const now = Date.now();
  const runId = `hrun_phase34_export_${trajectorySeedSuffix}`;
  const snapshotId = `hctx_phase34_export_${trajectorySeedSuffix}`;
  const runtimeSessionId = `rsess_phase34_export_${trajectorySeedSuffix}`;
  const sourceMessageId = `rmsg_phase34_export_source_${trajectorySeedSuffix}`;
  const outputMessageId = `rmsg_phase34_export_output_${trajectorySeedSuffix}`;
  const databasePath = getProfileDatabasePath(linkaHome, profile);
  const projection = {
    roomId: room.id,
    agentMemberId: agent.id,
    messages: [{ id: sourceMessageId, text: `@${agent.displayName} verify trajectory export` }],
    docs: [],
  };
  const visibility = { scope: "room" };
  const notification = { level: "normal" };
  const sourceText = `@${agent.displayName} verify trajectory export`;
  const sql = `
    BEGIN IMMEDIATE;
    INSERT INTO runtime_sessions (runtime_session_id, kind, adapter_session_id, label)
    VALUES (${sqlValue(runtimeSessionId)}, 'test', ${sqlValue(`phase34-${trajectorySeedSuffix}`)}, 'Phase 34 E2E runtime');

    INSERT INTO room_messages (
      message_id, room_id, sequence, sender_json, kind, created_at, edited_at, text,
      content_json, llm_role, thread_json, mentions_json, reply_to_json, references_json,
      attachments_json, evidence_json, trace_json, export_meta_json, visibility_json,
      notification_json
    ) VALUES (
      ${sqlValue(sourceMessageId)}, ${sqlValue(room.id)},
      (SELECT COALESCE(MAX(sequence), 0) + 1 FROM room_messages WHERE room_id = ${sqlValue(room.id)}),
      ${sqlJson({ kind: "member", memberId: human.id })}, 'text', ${now - 2800}, NULL,
      ${sqlValue(sourceText)}, NULL, 'user', NULL,
      ${sqlJson([{ memberId: agent.id, displayText: `@${agent.displayName}` }])}, NULL, NULL,
      NULL, NULL, NULL, NULL, ${sqlJson(visibility)}, ${sqlJson(notification)}
    );

    INSERT INTO harness_runs (
      harness_run_id, room_id, target_member_id, status, runtime_session_id, created_at,
      updated_at, started_at, completed_at, trigger_message_id, doc_ids_json, summary, error
    ) VALUES (
      ${sqlValue(runId)}, ${sqlValue(room.id)}, ${sqlValue(agent.id)}, 'succeeded',
      ${sqlValue(runtimeSessionId)}, ${now - 3000}, ${now}, ${now - 2500}, ${now},
      ${sqlValue(sourceMessageId)}, ${sqlJson([])}, ${sqlValue(trajectoryExportSummary)}, NULL
    );

    INSERT INTO harness_context_snapshots (
      harness_context_snapshot_id, room_id, agent_member_id, harness_session_id,
      harness_trigger_id, harness_turn_id, harness_run_id, created_at, projection_version,
      projection_json, source_message_ids_json, source_doc_revision_ids_json, token_estimate,
      redaction_state
    ) VALUES (
      ${sqlValue(snapshotId)}, ${sqlValue(room.id)}, ${sqlValue(agent.id)}, NULL, NULL, NULL,
      ${sqlValue(runId)}, ${now - 2600}, 1, ${sqlJson(projection)},
      ${sqlJson([sourceMessageId])}, ${sqlJson([])}, 128, 'raw'
    );

    INSERT INTO harness_run_events (
      runtime_event_id, harness_run_id, room_id, target_member_id, sequence, type, created_at,
      runtime_session_id, payload_json
    ) VALUES
      (${sqlValue(`rtevt_phase34_export_started_${trajectorySeedSuffix}`)}, ${sqlValue(runId)}, ${sqlValue(room.id)}, ${sqlValue(agent.id)}, 1, 'run.started', ${now - 2400}, ${sqlValue(runtimeSessionId)}, ${sqlJson({ kind: "run_status", status: "running", message: "Phase 34 export E2E started" })}),
      (${sqlValue(`rtevt_phase34_export_output_${trajectorySeedSuffix}`)}, ${sqlValue(runId)}, ${sqlValue(room.id)}, ${sqlValue(agent.id)}, 2, 'adapter.output', ${now - 1200}, ${sqlValue(runtimeSessionId)}, ${sqlJson({ kind: "adapter_output", stream: "stdout", text: trajectoryExportSummary })}),
      (${sqlValue(`rtevt_phase34_export_completed_${trajectorySeedSuffix}`)}, ${sqlValue(runId)}, ${sqlValue(room.id)}, ${sqlValue(agent.id)}, 3, 'run.completed', ${now}, ${sqlValue(runtimeSessionId)}, ${sqlJson({ kind: "run_status", status: "succeeded", message: trajectoryExportSummary })});

    INSERT INTO room_messages (
      message_id, room_id, sequence, sender_json, kind, created_at, edited_at, text,
      content_json, llm_role, thread_json, mentions_json, reply_to_json, references_json,
      attachments_json, evidence_json, trace_json, export_meta_json, visibility_json,
      notification_json
    ) VALUES (
      ${sqlValue(outputMessageId)}, ${sqlValue(room.id)},
      (SELECT COALESCE(MAX(sequence), 0) + 1 FROM room_messages WHERE room_id = ${sqlValue(room.id)}),
      ${sqlJson({ kind: "member", memberId: agent.id })}, 'text', ${now - 500}, NULL,
      ${sqlValue(trajectoryExportSummary)}, NULL, 'assistant', NULL, NULL,
      ${sqlJson({ messageId: sourceMessageId })}, NULL, NULL, NULL,
      ${sqlJson({
        harnessRunId: runId,
        runtimeSessionId,
        projectionSnapshotId: snapshotId,
        sourceMessageIds: [sourceMessageId],
        visibleMessageIds: [sourceMessageId],
        visibleDocRevisionIds: [],
      })},
      ${sqlJson({
        includeInTraining: true,
        lossMask: "assistant_only",
        evalLabels: { e2e: true, phase: 34 },
        tags: ["phase34", "daemon-ui-e2e"],
        redactionState: "raw",
      })},
      ${sqlJson(visibility)}, ${sqlJson(notification)}
    );
    COMMIT;
  `;

  runDaemonSqliteScript(databasePath, sql);

  const exportResponse = await fetch(
    `${daemonUrl}/linka/harness-runs/${runId}/export?format=linka-trajectory-jsonl`,
  );
  if (!exportResponse.ok) {
    throw new Error(
      `seeded trajectory export was not readable: ${exportResponse.status} ${exportResponse.statusText}`,
    );
  }
  const exportText = await exportResponse.text();
  if (!exportText.includes(snapshotId) || !exportText.includes("linka-trajectory-jsonl.v1")) {
    throw new Error("seeded trajectory export did not include expected metadata");
  }

  return { roomId: room.id, runId, snapshotId, outputMessageId, sourceMessageId };
};

const reloadPage = async (page) => {
  const loaded = new Promise((resolve) => page.on("Page.loadEventFired", resolve));
  await page.send("Page.reload", { ignoreCache: true });
  await withTimeout(loaded, timeoutMs, "page reload");
};

const getSnapshot = async (page) =>
  pageEvaluate(
    page,
    `(() => {
      const text = document.body?.innerText ?? "";
      const normalized = text.trim().replace(/[\\s\\u00a0]+/g, " ");
      const seedRunId = ${js(seededTrajectoryExport?.runId ?? null)};
      const seedSnapshotId = ${js(seededTrajectoryExport?.snapshotId ?? null)};
      const activityButtons = [...document.querySelectorAll("button")].filter((button) => /run completed|adapter output|adapter error|run running|run queued/i.test(button.textContent ?? ""));
      return {
        title: document.title,
        bodyLength: normalized.length,
        text: normalized.slice(0, 2400),
        hasRootContent: Boolean(document.getElementById("root")?.children.length),
        hasDaemonOnline: /\\/linka\\/health\\s*·\\s*online/i.test(normalized),
        hasDaemonSource: /\\bdaemon\\b/i.test(normalized),
        hasSseOpen: /sse\\s+open/i.test(normalized),
        hasRoom: normalized.includes(${js(roomName)}),
        hasSelectedRoom: Boolean([...document.querySelectorAll("nav button[aria-current='page']")].some((button) => button.textContent?.includes(${js(roomName)}))) && Boolean([...document.querySelectorAll("h1")].some((heading) => heading.textContent?.includes(${js(roomName)}))),
        hasDocDetail: /Doc detail/i.test(normalized) && normalized.includes(${js(docTitle)}),
        hasAnnouncement: normalized.includes(${js(announcementTitle)}) && normalized.includes(${js(announcementBody)}),
        hasEditedAnnouncement: normalized.includes(${js(editedAnnouncementTitle)}) && normalized.includes(${js(editedAnnouncementBody)}),
        hasDeletedAnnouncement: !normalized.includes(${js(editedAnnouncementTitle)}) && !normalized.includes(${js(editedAnnouncementBody)}),
        hasActivity: /Agent 活动/.test(normalized) && (/暂无 Agent 活动/.test(normalized) || /session|run|events|LinkA|资料 Agent|核验 Agent/i.test(normalized)),
        activityItemCount: activityButtons.length,
        hasSeededActivityItem: Boolean(seedRunId) && normalized.includes(${js(trajectoryExportSummary)}),
        hasRunDetail: Boolean(seedRunId) && /Run detail/i.test(normalized) && normalized.includes(seedRunId),
        hasTrajectoryExportButton: [...document.querySelectorAll("button")].some((button) => (button.textContent ?? "").includes("导出 trajectory")),
        hasTrajectoryExportMetadata: Boolean(seedRunId && seedSnapshotId) && normalized.includes("runId") && normalized.includes(seedRunId) && normalized.includes("snapshotId") && normalized.includes(seedSnapshotId) && normalized.includes("version") && normalized.includes("linka-trajectory-jsonl.v1") && normalized.includes("format") && normalized.includes("linka-trajectory-jsonl"),
        hasTrajectoryJsonlPreview: /JSONL preview/i.test(normalized) && Boolean(seedRunId) && (normalized.includes("linka-trajectory-jsonl.v1") || normalized.includes(seedRunId))
      };
    })()`,
    "snapshot evaluation",
  );

const waitFor = async (page, label, predicate) => {
  const deadline = Date.now() + timeoutMs;
  let snapshot;

  while (Date.now() < deadline) {
    snapshot = await getSnapshot(page);
    if (predicate(snapshot)) return snapshot;
    await delay(250);
  }

  throw new Error(`${label} timed out. observed text: ${snapshot?.text ?? "<empty>"}`);
};

const runDomAction = async (page, label, body) => {
  const result = await pageEvaluate(
    page,
    `(() => {
      const byText = (selector, text) => [...document.querySelectorAll(selector)].find((node) => (node.textContent ?? "").trim().includes(text));
      const setValue = (element, value) => {
        const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
        setter?.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const clickText = (selector, text) => {
        const element = byText(selector, text);
        if (!element) throw new Error(
          "missing " + selector + " containing " + text + ". observed: " + (document.body?.innerText ?? "").replace(/[\\s\\u00a0]+/g, " ").slice(0, 700)
        );
        element.click();
        return element;
      };
      ${body}
      return true;
    })()`,
    label,
  );

  if (result !== true) {
    throw new Error(`${label} did not return success`);
  }
};

const openChromePage = async (targetUrl) => {
  const chrome = findChromeExecutable();
  if (!chrome) {
    throw new Error("Chrome/Chromium executable not found; set CHROME_PATH to run daemon UI E2E");
  }

  const userDataDir = await mkdtemp(join(tmpdir(), "linka-daemon-ui-e2e-chrome-"));
  const debuggingPort = await findAvailablePort();
  let stderr = "";
  const chromeProcess = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-gpu",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1",
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  chromeProcess.stderr.setEncoding("utf8");
  chromeProcess.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const browserWebSocketUrl = await withTimeout(
    new Promise((resolve, reject) => {
      let settled = false;
      let intervalId;

      const finish = (settle, value) => {
        if (settled) return;
        settled = true;
        clearInterval(intervalId);
        chromeProcess.off("exit", onExit);
        settle(value);
      };
      const onExit = (code) => {
        finish(
          reject,
          new Error(`Chrome exited before CDP was ready with code ${code ?? "unknown"}`),
        );
      };
      const checkForDebugger = async () => {
        const stderrUrl = getBrowserWebSocketUrl(stderr);
        if (stderrUrl) {
          finish(resolve, stderrUrl);
          return;
        }

        try {
          const activePortUrl = await getBrowserWebSocketUrlFromActivePort(userDataDir);
          if (activePortUrl) {
            finish(resolve, activePortUrl);
            return;
          }

          const jsonVersionUrl = await getBrowserWebSocketUrlFromJsonVersion(debuggingPort);
          if (jsonVersionUrl) finish(resolve, jsonVersionUrl);
        } catch (error) {
          finish(reject, error);
        }
      };

      intervalId = setInterval(() => {
        void checkForDebugger();
      }, 25);
      chromeProcess.once("exit", onExit);
      void checkForDebugger();
    }),
    timeoutMs,
    "Chrome startup",
  );

  const pageWebSocketUrl = await createPageTarget(browserWebSocketUrl);
  const page = new CdpClient(pageWebSocketUrl);
  await page.connect();

  const consoleErrors = [];
  const pageErrors = [];
  const apiErrors = [];
  const networkRequests = new Map();

  page.on("Runtime.consoleAPICalled", (params) => {
    if (params.type === "error") {
      consoleErrors.push(params.args.map(formatRemoteValue).join(" "));
    }
  });
  page.on("Runtime.exceptionThrown", (params) => {
    const details = params.exceptionDetails;
    pageErrors.push(details.exception?.description ?? details.text ?? "uncaught exception");
  });
  page.on("Log.entryAdded", (params) => {
    if (params.entry?.level === "error") {
      consoleErrors.push(params.entry.text ?? "browser log error");
    }
  });
  page.on("Network.requestWillBeSent", (params) => {
    networkRequests.set(params.requestId, params.request?.url ?? "");
  });
  page.on("Network.responseReceived", (params) => {
    const status = params.response?.status;
    const url = params.response?.url ?? networkRequests.get(params.requestId) ?? "";
    if (
      typeof status === "number" &&
      status >= 400 &&
      new URL(url).pathname.startsWith("/linka/")
    ) {
      apiErrors.push(`${status} ${url}`);
    }
  });
  page.on("Network.loadingFailed", (params) => {
    const url = networkRequests.get(params.requestId) ?? "";
    if (url && new URL(url).pathname.startsWith("/linka/")) {
      apiErrors.push(`${params.errorText ?? "loading failed"} ${url}`);
    }
    networkRequests.delete(params.requestId);
  });
  page.on("Network.loadingFinished", (params) => {
    networkRequests.delete(params.requestId);
  });

  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Log.enable");
  await page.send("Network.enable");

  const loaded = new Promise((resolve) => page.on("Page.loadEventFired", resolve));
  await page.send("Page.navigate", { url: targetUrl });
  await withTimeout(loaded, timeoutMs, "page load");

  return {
    page,
    chromeProcess,
    userDataDir,
    getFailures: () => [
      ...consoleErrors.map((error) => `console error: ${error}`),
      ...pageErrors.map((error) => `page error: ${error}`),
      ...apiErrors.map((error) => `/linka API error: ${error}`),
    ],
  };
};

const assertStrictUiSmokeEquivalent = (snapshot) => {
  const failures = [];
  if (!snapshot?.bodyLength) failures.push("document.body is empty");
  if (!snapshot?.hasRootContent) failures.push("#root did not render child content");
  if (!snapshot?.hasDaemonOnline)
    failures.push("strict daemon mode did not observe '/linka/health · online'");
  if (!snapshot?.hasDaemonSource)
    failures.push("strict daemon mode did not observe daemon source text");
  if (!snapshot?.hasSseOpen) failures.push("strict daemon mode did not observe 'sse open'");

  if (failures.length > 0) {
    throw new Error(
      `strict ui-smoke equivalent failed:\n- ${failures.join("\n- ")}\nobserved text: ${snapshot?.text ?? "<empty>"}`,
    );
  }
};

const run = async () => {
  const daemonPort = await findAvailablePort();
  const uiPort = await findAvailablePort();
  const linkaHome = await mkdtemp(join(tmpdir(), "linka-daemon-ui-e2e-home-"));
  const profile = `phase33-e2e-${process.pid}-${Date.now()}`;
  const daemonUrl = `${rootUrlPrefix}:${daemonPort}`;
  const uiUrl = `${rootUrlPrefix}:${uiPort}/`;
  const commonEnv = {
    ...process.env,
    LINKA_PORT: String(daemonPort),
    LINKA_PROFILE: profile,
    LINKA_HOME: linkaHome,
  };

  let daemon;
  let ui;
  let browser;
  const chromePath = findChromeExecutable();

  if (!chromePath) {
    throw new Error("Chrome/Chromium executable not found; set CHROME_PATH to run daemon UI E2E");
  }

  try {
    daemon = spawnManaged(
      "daemon",
      "pnpm",
      ["--filter", "@linka/daemon", "exec", "tsx", "src/index.ts"],
      {
        cwd: process.cwd(),
        env: commonEnv,
      },
    );
    await waitForHttp(`${daemonUrl}/linka/health`, "daemon health");

    ui = spawnManaged(
      "ui",
      "pnpm",
      ["--filter", "@linka/ui", "exec", "vite", "--host", "127.0.0.1", "--port", String(uiPort)],
      {
        cwd: process.cwd(),
        env: {
          ...commonEnv,
          // The UI reads this at build time so browser requests target the real daemon port.
          VITE_LINKA_DAEMON_URL: daemonUrl,
          LINKA_DAEMON_URL: daemonUrl,
        },
      },
    );
    await waitForHttp(uiUrl, "UI dev server", (response) => response.status < 500);

    browser = await openChromePage(uiUrl);
    const { page } = browser;

    const onlineSnapshot = await waitFor(
      page,
      "strict daemon online UI",
      (snapshot) =>
        snapshot.bodyLength > 0 &&
        snapshot.hasRootContent &&
        snapshot.hasDaemonOnline &&
        snapshot.hasDaemonSource &&
        snapshot.hasSseOpen,
    );

    await runDomAction(page, "open create room modal", `clickText("button", "新建 Room");`);
    await runDomAction(
      page,
      "create room",
      `
        const nameInput = [...document.querySelectorAll("input")].find((input) => input.closest("label")?.textContent?.includes("Room 名称"));
        const topicInput = [...document.querySelectorAll("textarea")].find((input) => input.closest("label")?.textContent?.includes("Topic"));
        if (!nameInput || !topicInput) throw new Error("missing create room form controls");
        setValue(nameInput, ${js(roomName)});
        setValue(topicInput, ${js(roomTopic)});
        clickText("button", "创建并进入 Room");
      `,
    );
    const roomSnapshot = await waitFor(
      page,
      "created room selected",
      (snapshot) => snapshot.hasSelectedRoom,
    );

    await runDomAction(page, "open Docs tab", `clickText("button", "Docs");`);
    await runDomAction(
      page,
      "create doc",
      `
        const title = document.querySelector("#room-doc-title");
        const body = document.querySelector("#room-doc-body");
        const handoff = [...document.querySelectorAll("input[type='checkbox']")].find((input) => input.closest("label")?.textContent?.includes("创建后 @LinkA"));
        if (!title || !body) throw new Error("missing doc form controls");
        setValue(title, ${js(docTitle)});
        setValue(body, ${js(docBody)});
        if (handoff?.checked) handoff.click();
        clickText("button", "新建 Doc");
      `,
    );
    const docSnapshot = await waitFor(
      page,
      "doc detail visible",
      (snapshot) => snapshot.hasDocDetail,
    );

    await runDomAction(page, "open Announcements tab", `clickText("button", "公告");`);
    await runDomAction(
      page,
      "create announcement",
      `
        const title = [...document.querySelectorAll("input")].find((input) => input.placeholder === "公告标题");
        const body = [...document.querySelectorAll("textarea")].find((input) => input.placeholder === "公告内容");
        if (!title || !body) throw new Error("missing announcement form controls");
        setValue(title, ${js(announcementTitle)});
        setValue(body, ${js(announcementBody)});
        clickText("button", "创建公告");
      `,
    );
    await waitFor(page, "announcement created", (snapshot) => snapshot.hasAnnouncement);

    await runDomAction(
      page,
      "edit announcement",
      `
        const article = [...document.querySelectorAll("article")].find((node) => node.textContent?.includes(${js(announcementTitle)}));
        const edit = [...(article?.querySelectorAll("button") ?? [])].find((button) => button.textContent?.includes("编辑"));
        if (!edit) throw new Error("missing edit announcement button");
        edit.click();
      `,
    );
    await runDomAction(
      page,
      "save edited announcement",
      `
        const title = [...document.querySelectorAll("input")].find((input) => input.placeholder === "公告标题");
        const body = [...document.querySelectorAll("textarea")].find((input) => input.placeholder === "公告内容");
        if (!title || !body) throw new Error("missing editable announcement controls");
        setValue(title, ${js(editedAnnouncementTitle)});
        setValue(body, ${js(editedAnnouncementBody)});
        clickText("button", "保存公告");
      `,
    );
    const editedAnnouncementSnapshot = await waitFor(
      page,
      "announcement edited",
      (snapshot) => snapshot.hasEditedAnnouncement,
    );

    await runDomAction(
      page,
      "delete announcement",
      `
        const article = [...document.querySelectorAll("article")].find((node) => node.textContent?.includes(${js(editedAnnouncementTitle)}));
        const remove = [...(article?.querySelectorAll("button") ?? [])].find((button) => button.textContent?.includes("删除"));
        if (!remove) throw new Error("missing delete announcement button");
        remove.click();
      `,
    );
    const deletedAnnouncementSnapshot = await waitFor(
      page,
      "announcement deleted",
      (snapshot) => snapshot.hasDeletedAnnouncement && /暂无公告/.test(snapshot.text),
    );

    seededTrajectoryExport = await seedTrajectoryExportFixture({ daemonUrl, linkaHome, profile });
    await reloadPage(page);
    await waitFor(
      page,
      "strict daemon online UI after trajectory seed",
      (snapshot) =>
        snapshot.bodyLength > 0 &&
        snapshot.hasRootContent &&
        snapshot.hasDaemonOnline &&
        snapshot.hasDaemonSource &&
        snapshot.hasSseOpen,
    );
    await runDomAction(page, "select seeded room after reload", `clickText("nav button", ${js(roomName)});`);
    await waitFor(page, "seeded room selected after reload", (snapshot) => snapshot.hasSelectedRoom);

    await runDomAction(page, "open Activity tab", `clickText("button", "活动");`);
    const activitySnapshot = await waitFor(
      page,
      "seeded activity item visible",
      (snapshot) =>
        snapshot.hasActivity && snapshot.activityItemCount > 0 && snapshot.hasSeededActivityItem,
    );
    await runDomAction(page, "open seeded run detail", `clickText("button", "run completed");`);
    const runDetailSnapshot = await waitFor(
      page,
      "trajectory run detail visible",
      (snapshot) => snapshot.hasRunDetail && snapshot.hasTrajectoryExportButton,
    );
    await runDomAction(page, "export seeded trajectory", `clickText("button", "导出 trajectory");`);
    const trajectoryExportSnapshot = await waitFor(
      page,
      "trajectory export metadata visible",
      (snapshot) => snapshot.hasTrajectoryExportMetadata && snapshot.hasTrajectoryJsonlPreview,
    );

    await delay(300);
    const browserFailures = browser.getFailures();
    if (browserFailures.length > 0) {
      const finalSnapshot = await getSnapshot(page);
      throw new Error(
        `browser reported errors:\n- ${browserFailures.join("\n- ")}\nobserved text: ${finalSnapshot.text}`,
      );
    }

    const finalSmokeSnapshot = await getSnapshot(page);
    assertStrictUiSmokeEquivalent(finalSmokeSnapshot);

    console.log("daemon UI E2E passed");
    console.log(`daemon: ${daemonUrl}/linka`);
    console.log(`ui: ${uiUrl}`);
    console.log(`LINKA_HOME: ${linkaHome}`);
    console.log(`profile: ${profile}`);
    console.log(`observed online: ${onlineSnapshot.text}`);
    console.log(`created and selected room: ${roomName}`);
    console.log(
      `created doc detail: ${docTitle} (${docSnapshot.hasDocDetail ? "visible" : "missing"})`,
    );
    console.log(
      `edited then deleted announcement: ${editedAnnouncementSnapshot.hasEditedAnnouncement && deletedAnnouncementSnapshot.hasDeletedAnnouncement}`,
    );
    console.log(
      `seeded trajectory export: run=${seededTrajectoryExport.runId} snapshot=${seededTrajectoryExport.snapshotId}`,
    );
    console.log(`activity tab observed: ${activitySnapshot.text}`);
    console.log(`run detail observed: ${runDetailSnapshot.text}`);
    console.log(`trajectory export observed: ${trajectoryExportSnapshot.text}`);
    console.log("strict ui-smoke equivalent: passed");
  } catch (error) {
    const details = [
      `daemon output: ${daemon?.getOutput() || "<empty>"}`,
      `ui output: ${ui?.getOutput() || "<empty>"}`,
    ];
    if (browser?.page) {
      try {
        const snapshot = await getSnapshot(browser.page);
        details.push(`observed text: ${snapshot.text}`);
      } catch {
        // Ignore snapshot failures during teardown reporting.
      }
    }

    console.error(
      `daemon UI E2E failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    for (const detail of details) {
      console.error(`- ${detail}`);
    }
    process.exitCode = 1;
  } finally {
    browser?.page?.close();
    if (browser?.chromeProcess && browser.chromeProcess.exitCode === null) {
      browser.chromeProcess.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => browser.chromeProcess.once("exit", resolve)),
        delay(1000),
      ]);
    }
    if (browser?.userDataDir) {
      await rm(browser.userDataDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
      }).catch((error) =>
        console.warn(`daemon UI E2E warning: unable to remove Chrome profile: ${error.message}`),
      );
    }

    await stopProcess(ui);
    await stopProcess(daemon);
    await rm(linkaHome, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(
      (error) =>
        console.warn(`daemon UI E2E warning: unable to remove LINKA_HOME: ${error.message}`),
    );
  }
};

run();
