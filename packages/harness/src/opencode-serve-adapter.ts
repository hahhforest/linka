import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { TextDecoder } from "node:util";

import {
  runtimeSessionId,
  unixMs,
  type HarnessProjection,
  type HarnessRun,
  type RuntimeAdapterCapabilities,
  type RuntimeEvent,
  type RuntimeSessionRef,
  type UnixMs,
} from "@linka/shared";

import type {
  RuntimeAdapter,
  RuntimeAdapterRun,
  RuntimeAdapterRunInput,
} from "./runtime-adapter.js";
import {
  createOpenCodeServeRuntimeEventId,
  isOpenCodeServeEventForSession,
  isOpenCodeServeTerminalRuntimeEvent,
  parseOpenCodeServeSseFrame,
  toOpenCodeServeRuntimeEvents,
  type OpenCodeServeEvent,
} from "./opencode-serve-events.js";

export interface OpenCodeServePromptPart {
  readonly type: "text";
  readonly text: string;
}

export interface OpenCodeServeProcessHandle {
  readonly pid?: number;
  stop?: () => Promise<void> | void;
}

export interface OpenCodeServeProcessRunnerInput {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export type OpenCodeServeProcessRunner = (
  input: OpenCodeServeProcessRunnerInput,
) => Promise<OpenCodeServeProcessHandle> | OpenCodeServeProcessHandle;

export interface OpenCodeServeEventStreamFactoryInput {
  readonly url: string;
  readonly fetchImpl: typeof fetch;
  readonly signal: AbortSignal;
}

export type OpenCodeServeEventStreamFactory = (
  input: OpenCodeServeEventStreamFactoryInput,
) => AsyncIterable<OpenCodeServeEvent>;

export interface OpenCodeServeModelRef {
  readonly providerID: string;
  readonly modelID: string;
}

export interface OpenCodeServeRuntimeAdapterOptions {
  readonly command?: string;
  readonly port?: number;
  readonly host?: string;
  readonly baseUrl?: string;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly processRunner?: OpenCodeServeProcessRunner;
  readonly eventStreamFactory?: OpenCodeServeEventStreamFactory;
  readonly model?: OpenCodeServeModelRef;
  readonly variant?: string;
  readonly agent?: string;
  readonly now?: () => UnixMs;
  readonly healthAttempts?: number;
  readonly healthRetryDelayMs?: number;
}

interface ActiveRun {
  readonly adapterSessionId: string;
  readonly controller: AbortController;
}

const DEFAULT_PORT = 4096;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_HEALTH_ATTEMPTS = 20;
const DEFAULT_HEALTH_RETRY_DELAY_MS = 250;
const EVENT_STREAM_READY_TIMEOUT_MS = 1000;
const EVENT_ID_SEQUENCE_STARTED = 1;
const RUNTIME_SESSION_ID_SESSION_PART_LIMIT = 112;

const getFetch = (fetchImpl?: typeof fetch): typeof fetch => {
  const resolvedFetch = fetchImpl ?? globalThis.fetch;

  if (typeof resolvedFetch !== "function") {
    throw new Error("OpenCode serve adapter requires fetch or an injected fetchImpl.");
  }

  return resolvedFetch;
};

const defaultOpenCodeServeProcessRunner: OpenCodeServeProcessRunner = ({
  command,
  args,
  cwd,
  env,
}) => {
  const child: ChildProcess = spawn(command, [...args], {
    cwd,
    env,
    stdio: "ignore",
  });

  child.unref();

  return {
    pid: child.pid,
    stop: async () => {
      if (!child.killed) child.kill();
    },
  };
};

const normalizeBaseUrl = (options: OpenCodeServeRuntimeAdapterOptions): string => {
  if (options.baseUrl !== undefined) return options.baseUrl.replace(/\/+$/, "");

  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;

  return `http://${host}:${port}`;
};

const toIdPart = (value: string, maxLength: number): string =>
  value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, maxLength);

const getResponseText = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

const readJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await getResponseText(response);
  if (text.trim().length === 0) return undefined;

  return JSON.parse(text) as unknown;
};

const getStringField = (value: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    const field = value[key];
    if (typeof field === "string") return field;
  }

  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const extractAdapterSessionId = (value: unknown): string | undefined => {
  if (!isRecord(value)) return undefined;

  const directId = getStringField(value, ["id", "sessionID", "sessionId", "session_id"]);
  if (directId !== undefined) return directId;

  const session = value.session;
  if (isRecord(session)) {
    return getStringField(session, ["id", "sessionID", "sessionId", "session_id"]);
  }

  return undefined;
};

const assertOkResponse = async (response: Response, context: string): Promise<void> => {
  if (response.ok) return;

  const body = await getResponseText(response);
  const suffix = body.trim().length > 0 ? `: ${body}` : "";

  throw new Error(`${context} failed with HTTP ${response.status}${suffix}`);
};

const findSseFrameEnd = (buffer: string): { readonly index: number; readonly length: number } => {
  const lfIndex = buffer.indexOf("\n\n");
  const crlfIndex = buffer.indexOf("\r\n\r\n");

  if (lfIndex === -1 && crlfIndex === -1) return { index: -1, length: 0 };
  if (lfIndex === -1) return { index: crlfIndex, length: 4 };
  if (crlfIndex === -1) return { index: lfIndex, length: 2 };

  return lfIndex < crlfIndex ? { index: lfIndex, length: 2 } : { index: crlfIndex, length: 4 };
};

export const createOpenCodeServeEventStream: OpenCodeServeEventStreamFactory = async function* ({
  url,
  fetchImpl,
  signal,
}) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "text/event-stream" },
    signal,
  });

  await assertOkResponse(response, "OpenCode event stream request");

  if (response.body === null) {
    throw new Error("OpenCode event stream response did not include a body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value === undefined) continue;

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const frameEnd = findSseFrameEnd(buffer);
        if (frameEnd.index === -1) break;

        const frame = buffer.slice(0, frameEnd.index);
        buffer = buffer.slice(frameEnd.index + frameEnd.length);
        const event = parseOpenCodeServeSseFrame(frame);
        if (event !== undefined) yield event;
      }
    }

    buffer += decoder.decode();

    if (buffer.trim().length > 0) {
      const event = parseOpenCodeServeSseFrame(buffer);
      if (event !== undefined) yield event;
    }
  } finally {
    reader.releaseLock();
  }
};

const formatProjectionText = (projection: HarnessProjection): string => {
  const lines: string[] = [
    "You are participating in a LinkA room as an agent runtime.",
    "Use the room projection below as your current context and respond as the target agent.",
    "",
    `Room: ${projection.room.displayName} (${projection.room.id})`,
    projection.room.topic ? `Topic: ${projection.room.topic}` : undefined,
    `Viewer: ${projection.viewer.displayName} (${projection.viewer.id})`,
    `Trigger: ${projection.request.trigger.type}`,
    "",
    "Members:",
    ...projection.members.map(
      (member) => `- ${member.displayName} (${member.kind}, ${member.role}, ${member.status})`,
    ),
    "",
    "Recent messages:",
    ...projection.messages.map((message) => {
      const sender =
        message.sender.kind === "member"
          ? message.sender.memberId
          : (message.sender.label ?? "system");
      const text = message.text ?? "";
      return `- #${message.sequence} ${sender} [${message.kind}]: ${text}`;
    }),
    "",
    "Announcements:",
    ...projection.announcements.map(
      (announcement) => `- ${announcement.title}: ${announcement.body}`,
    ),
    "",
    "Docs:",
    ...projection.docs.map((doc) => `- ${doc.title} (${doc.id}, ${doc.status}): ${doc.body}`),
  ].filter((line): line is string => line !== undefined);

  return lines.join("\n");
};

export const buildOpenCodeServePromptParts = (
  projection: HarnessProjection,
): readonly OpenCodeServePromptPart[] => [
  {
    type: "text",
    text: formatProjectionText(projection),
  },
];

export class OpenCodeServeRuntimeAdapter implements RuntimeAdapter {
  private readonly command: string;
  private readonly port: number;
  private readonly baseUrl: string;
  private readonly cwd?: string;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly processRunner: OpenCodeServeProcessRunner;
  private readonly eventStreamFactory: OpenCodeServeEventStreamFactory;
  private readonly model?: OpenCodeServeModelRef;
  private readonly variant?: string;
  private readonly agent?: string;
  private readonly now: () => UnixMs;
  private readonly healthAttempts: number;
  private readonly healthRetryDelayMs: number;
  private processHandle?: OpenCodeServeProcessHandle;
  private processStartPromise?: Promise<void>;
  private readonly activeRuns = new Map<string, ActiveRun>();

  constructor(options: OpenCodeServeRuntimeAdapterOptions = {}) {
    this.command = options.command ?? "opencode";
    this.port = options.port ?? DEFAULT_PORT;
    this.baseUrl = normalizeBaseUrl(options);
    this.cwd = options.cwd;
    this.env = options.env;
    this.fetchImpl = getFetch(options.fetchImpl);
    this.processRunner = options.processRunner ?? defaultOpenCodeServeProcessRunner;
    this.eventStreamFactory = options.eventStreamFactory ?? createOpenCodeServeEventStream;
    this.model = options.model;
    this.variant = options.variant;
    this.agent = options.agent;
    this.now = options.now ?? (() => unixMs(Date.now()));
    this.healthAttempts = options.healthAttempts ?? DEFAULT_HEALTH_ATTEMPTS;
    this.healthRetryDelayMs = options.healthRetryDelayMs ?? DEFAULT_HEALTH_RETRY_DELAY_MS;
  }

  getCapabilities(): RuntimeAdapterCapabilities {
    return {
      kind: "opencode",
      supportsInteractiveSession: true,
      supportsStreamingEvents: true,
      supportsDocContext: true,
      supportsCancellation: true,
      supportedEventTypes: [
        "runtime.session.started",
        "run.updated",
        "run.completed",
        "run.failed",
        "adapter.output",
        "adapter.error",
      ],
    };
  }

  async startRun(input: RuntimeAdapterRunInput): Promise<RuntimeAdapterRun> {
    await this.ensureServeProcessHealthy();

    const existingAdapterSessionId = input.run.runtime?.adapterSessionId;
    const sessionCreated = existingAdapterSessionId === undefined;
    const adapterSessionId = existingAdapterSessionId ?? (await this.createSession());
    const runtime = this.createRuntimeSessionRef(input.run, adapterSessionId);
    const controller = new AbortController();
    const activeRun = { adapterSessionId, controller };

    this.activeRuns.set(String(input.run.id), activeRun);

    return {
      events: this.runEvents(
        input.run,
        runtime,
        adapterSessionId,
        buildOpenCodeServePromptParts(input.projection),
        sessionCreated,
        activeRun,
      ),
      cancel: async () => {
        await this.abortSession(adapterSessionId);
        controller.abort();
        const currentRun = this.activeRuns.get(String(input.run.id));
        if (currentRun === activeRun) this.activeRuns.delete(String(input.run.id));
      },
    };
  }

  async cancelRun(runId: HarnessRun["id"]): Promise<void> {
    const activeRun = this.activeRuns.get(String(runId));
    if (activeRun === undefined) return;

    await this.abortSession(activeRun.adapterSessionId);
    activeRun.controller.abort();
    const currentRun = this.activeRuns.get(String(runId));
    if (currentRun === activeRun) this.activeRuns.delete(String(runId));
  }

  private async ensureServeProcessHealthy(): Promise<void> {
    if (this.processStartPromise === undefined) {
      this.processStartPromise = this.startProcessIfNeeded().catch((error: unknown) => {
        this.processStartPromise = undefined;
        throw error;
      });
    }

    await this.processStartPromise;
    await this.waitForHealth();
  }

  private async startProcessIfNeeded(): Promise<void> {
    if (this.processHandle !== undefined) return;

    this.processHandle = await this.processRunner({
      command: this.command,
      args: ["serve", "--port", String(this.port)],
      cwd: this.cwd,
      env: this.env,
    });
  }

  private async waitForHealth(): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.healthAttempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(this.url("/global/health"), { method: "GET" });
        if (response.ok) return;
        lastError = new Error(`OpenCode health returned HTTP ${response.status}.`);
      } catch (error) {
        lastError = error;
      }

      if (attempt < this.healthAttempts) {
        await delay(this.healthRetryDelayMs);
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`OpenCode serve did not become healthy: ${message}`);
  }

  private async createSession(): Promise<string> {
    const response = await this.fetchImpl(this.url("/session"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    await assertOkResponse(response, "OpenCode session create request");

    const adapterSessionId = extractAdapterSessionId(await readJsonResponse(response));
    if (adapterSessionId === undefined || adapterSessionId.trim().length === 0) {
      throw new Error("OpenCode session create response did not include a session id.");
    }

    return adapterSessionId;
  }

  private async postPrompt(
    adapterSessionId: string,
    parts: readonly OpenCodeServePromptPart[],
    signal: AbortSignal,
  ): Promise<void> {
    const response = await this.fetchImpl(
      this.url(`/session/${encodeURIComponent(adapterSessionId)}/prompt_async`),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parts,
          ...(this.model === undefined ? {} : { model: this.model }),
          ...(this.variant === undefined ? {} : { variant: this.variant }),
          ...(this.agent === undefined ? {} : { agent: this.agent }),
        }),
        signal,
      },
    );

    await assertOkResponse(response, "OpenCode prompt_async request");
  }

  private async abortSession(adapterSessionId: string): Promise<void> {
    const response = await this.fetchImpl(
      this.url(`/session/${encodeURIComponent(adapterSessionId)}/abort`),
      { method: "POST" },
    );

    await assertOkResponse(response, "OpenCode session abort request");
  }

  private async *runEvents(
    run: HarnessRun,
    runtime: RuntimeSessionRef,
    adapterSessionId: string,
    parts: readonly OpenCodeServePromptPart[],
    sessionCreated: boolean,
    activeRun: ActiveRun,
  ): AsyncIterable<RuntimeEvent> {
    let sequence = 0;

    try {
      if (sessionCreated) {
        sequence = EVENT_ID_SEQUENCE_STARTED;
        yield this.createSessionStartedEvent(run, runtime, sequence);
      }

      const eventIterator = this.eventStreamFactory({
        url: this.url("/global/event"),
        fetchImpl: this.fetchImpl,
        signal: activeRun.controller.signal,
      })[Symbol.asyncIterator]();
      let nextEvent = eventIterator.next();

      const createRuntimeEventsForServeEvent = (
        event: OpenCodeServeEvent,
      ): readonly RuntimeEvent[] => {
        sequence += 1;
        return toOpenCodeServeRuntimeEvents({
          event,
          run,
          runtime,
          sequence,
          createdAt: this.now(),
        });
      };

      try {
        const firstEvent = await Promise.race([
          nextEvent,
          delay(EVENT_STREAM_READY_TIMEOUT_MS).then(() => undefined),
        ]);
        const queuedEvent = firstEvent?.done === false ? firstEvent.value : undefined;

        if (firstEvent !== undefined) {
          nextEvent = eventIterator.next();
        }

        await this.postPrompt(adapterSessionId, parts, activeRun.controller.signal);

        if (
          queuedEvent !== undefined &&
          isOpenCodeServeEventForSession(queuedEvent, adapterSessionId)
        ) {
          const runtimeEvents = createRuntimeEventsForServeEvent(queuedEvent);
          for (const runtimeEvent of runtimeEvents) {
            yield runtimeEvent;
            sequence = runtimeEvent.sequence;
            if (isOpenCodeServeTerminalRuntimeEvent(runtimeEvent)) return;
          }
        }

        while (true) {
          const next = await nextEvent;
          if (next.done === true) break;

          nextEvent = eventIterator.next();
          const event = next.value;
          if (!isOpenCodeServeEventForSession(event, adapterSessionId)) continue;

          const runtimeEvents = createRuntimeEventsForServeEvent(event);

          let reachedTerminalEvent = false;
          for (const runtimeEvent of runtimeEvents) {
            yield runtimeEvent;
            sequence = runtimeEvent.sequence;
            if (isOpenCodeServeTerminalRuntimeEvent(runtimeEvent)) reachedTerminalEvent = true;
          }

          if (reachedTerminalEvent) break;
        }
      } finally {
        await eventIterator.return?.();
      }
    } catch (error) {
      if (!activeRun.controller.signal.aborted) throw error;
    } finally {
      const currentRun = this.activeRuns.get(String(run.id));
      if (currentRun === activeRun) this.activeRuns.delete(String(run.id));
    }
  }

  private createSessionStartedEvent(
    run: HarnessRun,
    runtime: RuntimeSessionRef,
    sequence: number,
  ): RuntimeEvent {
    return {
      id: createOpenCodeServeRuntimeEventId(run, sequence),
      runId: run.id,
      roomId: run.roomId,
      targetMemberId: run.targetMemberId,
      sequence,
      type: "runtime.session.started",
      createdAt: this.now(),
      runtime,
      payload: {
        kind: "session_ref",
        session: runtime,
        details: {
          adapter: "opencode serve",
          baseUrl: this.baseUrl,
        },
      },
    };
  }

  private createRuntimeSessionRef(run: HarnessRun, adapterSessionId: string): RuntimeSessionRef {
    if (run.runtime !== undefined) {
      return {
        ...run.runtime,
        adapterSessionId,
        label: run.runtime.label ?? "OpenCode serve",
      };
    }

    return {
      id: runtimeSessionId(
        `rsess_opencode_serve_${toIdPart(adapterSessionId, RUNTIME_SESSION_ID_SESSION_PART_LIMIT)}`,
      ),
      kind: "opencode",
      adapterSessionId,
      label: "OpenCode serve",
    };
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}
