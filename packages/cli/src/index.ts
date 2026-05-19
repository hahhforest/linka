#!/usr/bin/env node

type JsonObject = Record<string, unknown>;
type OutputWriter = (text: string) => void;
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type CliCommand =
  | { readonly kind: "help" }
  | { readonly kind: "health" }
  | { readonly kind: "start"; readonly once: boolean }
  | { readonly kind: "rooms.create"; readonly name: string }
  | { readonly kind: "messages.send"; readonly roomId: string; readonly senderMemberId: string; readonly text: string };

interface ConfigOptions {
  readonly profile?: string;
  readonly home?: string;
  readonly env?: Record<string, string | undefined>;
  readonly cwd?: string;
  readonly git?: unknown;
}

interface PidFileInput {
  readonly profile?: string;
  readonly pid?: number;
  readonly port: number;
  readonly startedAt?: string | Date;
}

interface PidFileRecord {
  readonly version: 1;
  readonly profile: string;
  readonly pid: number;
  readonly port: number;
  readonly dataDir: string;
  readonly cwd: string;
  readonly startedAt: string;
}

interface ConfigApi {
  readonly getProfile: (options?: ConfigOptions) => string;
  readonly getDataDir: (options?: ConfigOptions) => string;
  readonly resolvePort: (options?: ConfigOptions) => number;
  readonly getRunningDaemonPort: (options?: ConfigOptions) => number | null;
  readonly writePidFile: (input: PidFileInput, options?: ConfigOptions) => PidFileRecord;
  readonly removePidFile: (options?: ConfigOptions) => void;
}

interface MinimalDaemonContainer {
  readonly profile: string;
  readonly port: number;
  readonly dataDir: string;
  readonly startedAt: Date;
  readonly close: () => void;
}

interface MinimalDaemonServer {
  readonly start: () => unknown;
  readonly shutdown: () => Promise<void>;
}

interface DaemonRuntime {
  readonly container: MinimalDaemonContainer;
  readonly server: MinimalDaemonServer;
}

interface DaemonRuntimeOptions {
  readonly profile: string;
}

interface CliDependencies extends ConfigApi {
  readonly fetch: FetchLike;
  readonly stdout: OutputWriter;
  readonly stderr: OutputWriter;
  readonly createDaemonRuntime: (options: DaemonRuntimeOptions) => Promise<DaemonRuntime>;
}

type CliDependencyOverrides = Partial<CliDependencies>;

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

const USAGE = `Usage:
  linka health
  linka start [--once]
  linka rooms create <name>
  linka messages send <roomId> <senderMemberId> <text>`;

const CONFIG_PACKAGE = "@linka/config";

export function parseArgs(argv: readonly string[]): CliCommand {
  const [command, subcommand, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h") {
    return { kind: "help" };
  }

  if (command === "health" && subcommand === undefined) {
    return { kind: "health" };
  }

  if (command === "start") {
    if (subcommand === undefined) {
      return { kind: "start", once: false };
    }

    if (subcommand === "--once" && rest.length === 0) {
      return { kind: "start", once: true };
    }
  }

  if (command === "rooms" && subcommand === "create") {
    const [name, ...extra] = rest;

    if (name && extra.length === 0) {
      return { kind: "rooms.create", name };
    }
  }

  if (command === "messages" && subcommand === "send") {
    const [roomId, senderMemberId, ...textParts] = rest;
    const text = textParts.join(" ").trim();

    if (roomId && senderMemberId && text.length > 0) {
      return { kind: "messages.send", roomId, senderMemberId, text };
    }
  }

  throw new CliError(`Invalid arguments.\n\n${USAGE}`, 2);
}

export async function runCli(argv: readonly string[], overrides: CliDependencyOverrides = {}): Promise<number> {
  const deps = await resolveDependencies(overrides);

  try {
    const command = parseArgs(argv);

    switch (command.kind) {
      case "help":
        deps.stdout(`${USAGE}\n`);
        return 0;
      case "health":
        await runHealth(deps);
        return 0;
      case "start":
        await runStart(command.once, deps);
        return 0;
      case "rooms.create":
        await postJson(deps, "/rooms", { displayName: command.name });
        return 0;
      case "messages.send":
        await postJson(deps, `/rooms/${encodeURIComponent(command.roomId)}/messages`, {
          senderMemberId: command.senderMemberId,
          kind: "text",
          text: command.text,
        });
        return 0;
    }
  } catch (error) {
    const exitCode = error instanceof CliError ? error.exitCode : 1;
    const message = error instanceof Error ? error.message : String(error);
    deps.stderr(`${message}\n`);
    return exitCode;
  }
}

async function resolveDependencies(overrides: CliDependencyOverrides): Promise<CliDependencies> {
  const needsConfig =
    overrides.getProfile === undefined ||
    overrides.getDataDir === undefined ||
    overrides.resolvePort === undefined ||
    overrides.getRunningDaemonPort === undefined ||
    overrides.writePidFile === undefined ||
    overrides.removePidFile === undefined;
  const config = needsConfig ? await loadConfigApi() : undefined;

  return {
    fetch: overrides.fetch ?? globalThis.fetch.bind(globalThis),
    stdout: overrides.stdout ?? ((text) => process.stdout.write(text)),
    stderr: overrides.stderr ?? ((text) => process.stderr.write(text)),
    getProfile: overrides.getProfile ?? configRequired(config).getProfile,
    getDataDir: overrides.getDataDir ?? configRequired(config).getDataDir,
    resolvePort: overrides.resolvePort ?? configRequired(config).resolvePort,
    getRunningDaemonPort: overrides.getRunningDaemonPort ?? configRequired(config).getRunningDaemonPort,
    writePidFile: overrides.writePidFile ?? configRequired(config).writePidFile,
    removePidFile: overrides.removePidFile ?? configRequired(config).removePidFile,
    createDaemonRuntime: overrides.createDaemonRuntime ?? createDefaultDaemonRuntime,
  };
}

function configRequired(config: ConfigApi | undefined): ConfigApi {
  if (!config) {
    throw new CliError("Missing config dependency");
  }

  return config;
}

async function loadConfigApi(): Promise<ConfigApi> {
  const currentFile = new URL(import.meta.url).pathname;

  if (currentFile.endsWith(".ts")) {
    return (await import(new URL("../../config/src/index.ts", import.meta.url).href)) as ConfigApi;
  }

  try {
    return (await import(CONFIG_PACKAGE)) as ConfigApi;
  } catch {
    return (await import(new URL("../../config/dist/index.js", import.meta.url).href)) as ConfigApi;
  }
}

async function runHealth(deps: CliDependencies): Promise<JsonObject> {
  const response = await getJson(deps, "/health");
  writeJson(deps.stdout, response);
  return response;
}

async function runStart(once: boolean, deps: CliDependencies): Promise<void> {
  const profile = deps.getProfile();
  deps.getDataDir({ profile });
  deps.resolvePort({ profile });

  const runtime = await deps.createDaemonRuntime({ profile });
  let pidFileWritten = false;

  try {
    runtime.server.start();
    deps.writePidFile(
      { profile: runtime.container.profile, port: runtime.container.port, startedAt: runtime.container.startedAt },
      { profile },
    );
    pidFileWritten = true;

    const health = await waitForHealth(deps, runtime.container.port);

    if (once) {
      writeJson(deps.stdout, health);
      return;
    }

    deps.stdout(`${JSON.stringify({ ok: true, profile: runtime.container.profile, port: runtime.container.port })}\n`);
    await waitForShutdownSignal();
  } finally {
    await runtime.server.shutdown().catch(() => undefined);
    runtime.container.close();

    if (pidFileWritten) {
      deps.removePidFile({ profile: runtime.container.profile });
    }
  }
}

async function getJson(deps: CliDependencies, path: string): Promise<JsonObject> {
  const port = getDaemonPort(deps);
  const response = await deps.fetch(`http://127.0.0.1:${port}/linka${path}`);
  return readJsonResponse(response);
}

async function postJson(deps: CliDependencies, path: string, body: JsonObject): Promise<void> {
  const port = getDaemonPort(deps);
  const response = await deps.fetch(`http://127.0.0.1:${port}/linka${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  writeJson(deps.stdout, await readJsonResponse(response));
}

function getDaemonPort(deps: CliDependencies): number {
  const profile = deps.getProfile();
  return deps.getRunningDaemonPort({ profile }) ?? deps.resolvePort({ profile });
}

async function readJsonResponse(response: Response): Promise<JsonObject> {
  const body = (await response.json().catch(() => ({
    ok: false,
    error: { code: "INVALID_JSON", message: "Response was not JSON" },
  }))) as JsonObject;

  if (!response.ok) {
    throw new CliError(JSON.stringify(body, null, 2));
  }

  return body;
}

async function waitForHealth(deps: CliDependencies, port: number): Promise<JsonObject> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await deps.fetch(`http://127.0.0.1:${port}/linka/health`);
      return await readJsonResponse(response);
    } catch (error) {
      lastError = error;
      await delay(25);
    }
  }

  throw lastError instanceof Error ? lastError : new CliError("Daemon health check failed");
}

function writeJson(write: OutputWriter, value: unknown): void {
  write(`${JSON.stringify(value, null, 2)}\n`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForShutdownSignal(): Promise<void> {
  return new Promise((resolve) => {
    const shutdown = (): void => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      resolve();
    };

    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

async function createDefaultDaemonRuntime(options: DaemonRuntimeOptions): Promise<DaemonRuntime> {
  const daemonModule = await loadDaemonModule();
  const container = daemonModule.createDaemonContainer({ profile: options.profile });
  const app = daemonModule.createDaemonApp(container);
  const server = daemonModule.createDaemonServer({ app, port: container.port, hostname: "127.0.0.1" });

  return { container, server };
}

async function loadDaemonModule(): Promise<{
  readonly createDaemonApp: (container: MinimalDaemonContainer) => unknown;
  readonly createDaemonContainer: (options: { profile: string }) => MinimalDaemonContainer;
  readonly createDaemonServer: (options: { app: unknown; port: number; hostname: string }) => MinimalDaemonServer;
}> {
  const currentFile = new URL(import.meta.url).pathname;
  const relativePaths = currentFile.endsWith(".ts")
    ? ["../../daemon/src/index.ts"]
    : ["../../daemon/dist/index.js", "../../daemon/dist/daemon/src/index.js"];
  let lastError: unknown;

  for (const relativePath of relativePaths) {
    try {
      return (await import(new URL(relativePath, import.meta.url).href)) as {
        readonly createDaemonApp: (container: MinimalDaemonContainer) => unknown;
        readonly createDaemonContainer: (options: { profile: string }) => MinimalDaemonContainer;
        readonly createDaemonServer: (options: { app: unknown; port: number; hostname: string }) => MinimalDaemonServer;
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new CliError("Failed to load @linka/daemon");
}

const isEntrypoint = process.argv[1] ? import.meta.url === new URL(process.argv[1], "file:").href : false;

if (isEntrypoint) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
