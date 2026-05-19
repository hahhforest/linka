#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const targetUrl = process.env.LINKA_UI_SMOKE_URL ?? "http://127.0.0.1:5173/";
const timeoutMs = Number.parseInt(process.env.LINKA_UI_SMOKE_TIMEOUT_MS ?? "60000", 10);
const requireDaemon = process.env.LINKA_UI_SMOKE_REQUIRE_DAEMON === "1";
const smokeMode = requireDaemon ? "strict daemon" : "fallback-tolerant";

const fail = (message, details = []) => {
  console.error(`UI smoke failed (${smokeMode} mode): ${message}`);
  for (const detail of details) {
    console.error(`- ${detail}`);
  }
  process.exitCode = 1;
};

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

        reject(new Error("unable to allocate Chrome debugging port"));
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

    const message = JSON.stringify({ id, method, params });
    const result = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });

    this.socket.send(message);
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

const assertServerIsReachable = async () => {
  try {
    const response = await fetch(targetUrl, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
  } catch (error) {
    throw new Error(
      `cannot reach ${targetUrl}; start the UI dev server first, for example: pnpm --filter @linka/ui dev (${error.message})`,
    );
  }
};

const toSameOriginUrl = (candidate) => {
  if (!candidate || typeof candidate !== "string") return undefined;

  try {
    return new URL(candidate, targetUrl);
  } catch {
    return undefined;
  }
};

const isLinkaApiUrl = (candidate) => {
  const url = toSameOriginUrl(candidate);
  return Boolean(url?.pathname.startsWith("/linka/"));
};

const isExpectedDaemonFailureText = (text) =>
  /net::ERR_(CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|EMPTY_RESPONSE|FAILED)/.test(
    text,
  ) ||
  /server responded with a status of 5\d\d/i.test(text) ||
  /\b5\d\d\b/.test(text);

const isExpectedLinkaApiResourceError = (entry) => {
  if (requireDaemon || entry?.level !== "error" || entry?.source !== "network") return false;
  if (!isLinkaApiUrl(entry.url)) return false;

  const text = entry.text ?? "";
  return /Failed to load resource/i.test(text) && isExpectedDaemonFailureText(text);
};

const recordExpectedResourceError = (url, detail, expectedResourceErrors) => {
  if (requireDaemon || !isLinkaApiUrl(url) || !isExpectedDaemonFailureText(detail)) return;

  expectedResourceErrors.push({
    at: Date.now(),
    detail: `${url}: ${detail}`,
  });
};

const consumeExpectedResourceError = (message, expectedResourceErrors, ignoredResourceErrors) => {
  if (requireDaemon || !/Failed to load resource/i.test(message)) return false;

  const now = Date.now();
  const index = expectedResourceErrors.findIndex((entry) => now - entry.at < 5000);
  if (index === -1) return false;

  const [entry] = expectedResourceErrors.splice(index, 1);
  ignoredResourceErrors.push(`${entry.detail}: ${message}`);
  return true;
};

const pushConsoleError = (
  message,
  consoleErrors,
  expectedResourceErrors,
  ignoredResourceErrors,
  pendingResourceConsoleErrors,
) => {
  if (consumeExpectedResourceError(message, expectedResourceErrors, ignoredResourceErrors)) return;

  if (!requireDaemon && /Failed to load resource/i.test(message)) {
    pendingResourceConsoleErrors.push({ at: Date.now(), message });
    return;
  }

  consoleErrors.push(message);
};

const flushPendingResourceConsoleErrors = (
  consoleErrors,
  expectedResourceErrors,
  ignoredResourceErrors,
  pendingResourceConsoleErrors,
) => {
  for (const pending of pendingResourceConsoleErrors) {
    if (
      consumeExpectedResourceError(pending.message, expectedResourceErrors, ignoredResourceErrors)
    ) {
      continue;
    }

    consoleErrors.push(pending.message);
  }

  pendingResourceConsoleErrors.length = 0;
};

const pushLogError = (entry, consoleErrors, ignoredResourceErrors) => {
  if (entry?.level !== "error") return;

  if (isExpectedLinkaApiResourceError(entry)) {
    ignoredResourceErrors.push(`${entry.url}: ${entry.text}`);
    return;
  }

  consoleErrors.push(entry.text);
};

const run = async () => {
  await assertServerIsReachable();

  const chrome = findChromeExecutable();
  if (!chrome) {
    throw new Error("Chrome/Chromium executable not found; set CHROME_PATH to run UI smoke");
  }

  const userDataDir = await mkdtemp(join(tmpdir(), "linka-ui-smoke-"));
  let chromeProcess;

  try {
    const debuggingPort = await findAvailablePort();
    let stderr = "";
    chromeProcess = spawn(
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
            if (jsonVersionUrl) {
              finish(resolve, jsonVersionUrl);
            }
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
    const ignoredResourceErrors = [];
    const networkRequests = new Map();
    const expectedResourceErrors = [];
    const pendingResourceConsoleErrors = [];

    page.on("Runtime.consoleAPICalled", (params) => {
      if (params.type === "error") {
        pushConsoleError(
          params.args.map(formatRemoteValue).join(" "),
          consoleErrors,
          expectedResourceErrors,
          ignoredResourceErrors,
          pendingResourceConsoleErrors,
        );
      }
    });
    page.on("Runtime.exceptionThrown", (params) => {
      const details = params.exceptionDetails;
      pageErrors.push(details.exception?.description ?? details.text ?? "uncaught exception");
    });
    page.on("Log.entryAdded", (params) => {
      pushLogError(params.entry, consoleErrors, ignoredResourceErrors);
    });
    page.on("Network.requestWillBeSent", (params) => {
      networkRequests.set(params.requestId, params.request?.url ?? "");
    });
    page.on("Network.responseReceived", (params) => {
      const status = params.response?.status;
      const url = params.response?.url ?? networkRequests.get(params.requestId);
      if (typeof status === "number" && status >= 500) {
        recordExpectedResourceError(url, String(status), expectedResourceErrors);
      }
    });
    page.on("Network.loadingFailed", (params) => {
      const url = networkRequests.get(params.requestId);
      recordExpectedResourceError(url, params.errorText ?? "", expectedResourceErrors);
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

    let snapshot;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const evaluation = await page.send("Runtime.evaluate", {
        expression: `(() => {
          const text = document.body?.innerText ?? "";
          const root = document.getElementById("root");
          return {
            bodyLength: text.trim().length,
            hasRootContent: Boolean(root && root.children.length > 0),
            hasKeyText: /LinkA|Room|room workspace/i.test(text),
            hasDaemonOnline: text.includes("GET /linka/health · online"),
            hasDaemonApi: /daemon api/i.test(text),
            hasSseOpen: /sse open/i.test(text),
            text: text.trim().replace(/[\\s\\u00a0]+/g, " ").slice(0, 500),
            title: document.title
          };
        })()`,
        returnByValue: true,
      });
      if (evaluation.exceptionDetails) {
        throw new Error(evaluation.exceptionDetails.text ?? "runtime snapshot evaluation failed");
      }
      snapshot = evaluation.result?.value;

      const hasBaseUi = snapshot?.bodyLength > 0 && snapshot.hasRootContent && snapshot.hasKeyText;
      const hasStrictDaemonUi =
        snapshot?.hasDaemonOnline && snapshot.hasDaemonApi && snapshot.hasSseOpen;
      if (hasBaseUi && (!requireDaemon || hasStrictDaemonUi)) {
        break;
      }

      await delay(250);
    }

    await delay(250);
    flushPendingResourceConsoleErrors(
      consoleErrors,
      expectedResourceErrors,
      ignoredResourceErrors,
      pendingResourceConsoleErrors,
    );

    const failures = [];
    if (!snapshot?.bodyLength) failures.push("document.body is empty");
    if (!snapshot?.hasRootContent) failures.push("#root did not render child content");
    if (!snapshot?.hasKeyText) failures.push("page did not contain LinkA/Room key UI text");
    if (requireDaemon && !snapshot?.hasDaemonOnline) {
      failures.push("strict daemon mode did not observe 'GET /linka/health · online'");
    }
    if (requireDaemon && !snapshot?.hasDaemonApi) {
      failures.push("strict daemon mode did not observe room source 'daemon api'");
    }
    if (requireDaemon && !snapshot?.hasSseOpen) {
      failures.push("strict daemon mode did not observe 'sse open'");
    }
    for (const error of consoleErrors) failures.push(`console error: ${error}`);
    for (const error of pageErrors) failures.push(`page error: ${error}`);

    page.close();

    if (failures.length > 0) {
      fail(`runtime check failed for ${targetUrl}`, [
        ...failures,
        `observed text: ${snapshot?.text ?? "<empty>"}`,
        `ignored expected daemon resource errors: ${ignoredResourceErrors.length}`,
      ]);
      return;
    }

    console.log(`UI smoke passed (${smokeMode} mode): ${targetUrl}`);
    if (ignoredResourceErrors.length > 0) {
      console.log(`Ignored expected daemon resource errors: ${ignoredResourceErrors.length}`);
    }
    console.log(`Observed: ${snapshot.text}`);
  } finally {
    if (chromeProcess && chromeProcess.exitCode === null) {
      chromeProcess.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => chromeProcess.once("exit", resolve)),
        delay(1000),
      ]);
    }

    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(
      (error) => {
        console.warn(
          "UI smoke warning: unable to remove temporary profile " +
            userDataDir +
            ": " +
            error.message,
        );
      },
    );
  }
};

run().catch((error) => {
  fail(error.message);
});
