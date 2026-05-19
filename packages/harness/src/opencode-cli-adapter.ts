import { spawn } from "node:child_process";

import {
  unixMs,
  type HarnessProjection,
  type RuntimeAdapterCapabilities,
  type RuntimeEvent,
  type UnixMs,
} from "@linka/shared";

import { parseOpenCodeJsonLine, toOpenCodeRuntimeEvent } from "./opencode-json-events.js";
import type {
  RuntimeAdapter,
  RuntimeAdapterRun,
  RuntimeAdapterRunInput,
} from "./runtime-adapter.js";

export interface OpenCodeCliRunnerInput {
  readonly command: string;
  readonly args: readonly string[];
  readonly prompt: string;
  readonly cwd?: string;
}

export interface OpenCodeCliRunnerResult {
  readonly lines: AsyncIterable<string>;
  readonly cancel?: () => Promise<void>;
}

export type OpenCodeCliRunner = (input: OpenCodeCliRunnerInput) => Promise<OpenCodeCliRunnerResult>;

export interface OpenCodeCliRuntimeAdapterOptions {
  readonly command?: string;
  readonly agent?: string;
  readonly model?: string;
  readonly variant?: string;
  readonly cwd?: string;
  readonly runner?: OpenCodeCliRunner;
  readonly now?: () => UnixMs;
}

const MAX_RECENT_MESSAGES = 20;
const MAX_DOCS = 8;
const MESSAGE_TEXT_LIMIT = 500;
const DOC_BODY_LIMIT = 1_200;

const compactText = (text: string, maxLength: number): string => {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
};

const getMemberDisplayName = (
  projection: HarnessProjection,
  memberId: HarnessProjection["viewer"]["id"],
): string => {
  if (projection.viewer.id === memberId) return projection.viewer.displayName;

  return (
    projection.members.find((member) => member.id === memberId)?.displayName ??
    `member:${String(memberId)}`
  );
};

const getMessageSenderName = (
  projection: HarnessProjection,
  message: HarnessProjection["messages"][number],
): string => {
  switch (message.sender.kind) {
    case "system":
      return message.sender.label ?? "System";
    case "member":
      return getMemberDisplayName(projection, message.sender.memberId);
  }
};

const formatMessage = (
  projection: HarnessProjection,
  message: HarnessProjection["messages"][number],
): string => {
  const sender = getMessageSenderName(projection, message);
  const text = message.text ? compactText(message.text, MESSAGE_TEXT_LIMIT) : "(no text)";

  return `- #${message.sequence} ${sender} [${message.kind}]: ${text}`;
};

const formatDoc = (doc: HarnessProjection["docs"][number]): string => {
  const bodySummary =
    doc.body.trim().length > 0 ? compactText(doc.body, DOC_BODY_LIMIT) : "(empty)";

  return `- ${doc.title} [${doc.status}/${doc.format}]: ${bodySummary}`;
};

export const formatOpenCodeCliPrompt = (projection: HarnessProjection): string => {
  const recentMessages = projection.messages.slice(-MAX_RECENT_MESSAGES);
  const docs = projection.docs.slice(0, MAX_DOCS);
  const lines = [
    "LinkA room context for OpenCode.",
    `Room: ${projection.room.displayName}`,
    projection.room.topic ? `Topic: ${projection.room.topic}` : undefined,
    `Viewer: ${projection.viewer.displayName} (${projection.viewer.kind}, ${projection.viewer.role})`,
    `Trigger: ${projection.request.trigger.type}`,
    "",
    "Recent messages:",
    ...(recentMessages.length > 0
      ? recentMessages.map((message) => formatMessage(projection, message))
      : ["- (no recent messages)"]),
    "",
    "Docs:",
    ...(docs.length > 0 ? docs.map(formatDoc) : ["- (no docs visible)"]),
  ];

  return lines.filter((line): line is string => line !== undefined).join("\n");
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return String(error);
};

const formatExitError = (
  command: string,
  code: number | null,
  signal: NodeJS.Signals | null,
  stderr: string,
) => {
  const status = code === null ? `signal ${signal ?? "unknown"}` : `code ${code}`;
  const stderrText = stderr.trim();

  if (stderrText.length > 0) return `${command} exited with ${status}: ${stderrText}`;
  return `${command} exited with ${status}.`;
};

export const defaultOpenCodeCliRunner: OpenCodeCliRunner = async ({
  command,
  args,
  prompt,
  cwd,
}) => {
  const child = spawn(command, [...args, prompt], {
    cwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const closePromise = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(formatExitError(command, code, signal, stderr)));
    });
  });

  async function* lines(): AsyncIterable<string> {
    let buffer = "";

    for await (const chunk of child.stdout) {
      buffer += String(chunk);
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? "";

      for (const line of parts) {
        yield line;
      }
    }

    if (buffer.length > 0) yield buffer;
    await closePromise;
  }

  return {
    lines: lines(),
    cancel: async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      await closePromise.catch(() => undefined);
    },
  };
};

const createAdapterErrorEvent = (
  input: RuntimeAdapterRunInput,
  sequence: number,
  createdAt: UnixMs,
  message: string,
  details: Record<string, unknown>,
): RuntimeEvent =>
  toOpenCodeRuntimeEvent({
    event: {
      type: "adapter_error",
      error: message,
      ...details,
    },
    run: input.run,
    sequence,
    createdAt,
  });

export class OpenCodeCliRuntimeAdapter implements RuntimeAdapter {
  private readonly command: string;
  private readonly agent?: string;
  private readonly model?: string;
  private readonly variant?: string;
  private readonly cwd?: string;
  private readonly runner: OpenCodeCliRunner;
  private readonly now: () => UnixMs;

  constructor(options: OpenCodeCliRuntimeAdapterOptions = {}) {
    this.command = options.command ?? "opencode";
    this.agent = options.agent;
    this.model = options.model;
    this.variant = options.variant;
    this.cwd = options.cwd;
    this.runner = options.runner ?? defaultOpenCodeCliRunner;
    this.now = options.now ?? (() => unixMs(Date.now()));
  }

  getCapabilities(): RuntimeAdapterCapabilities {
    return {
      kind: "opencode",
      supportsInteractiveSession: false,
      supportsStreamingEvents: true,
      supportsDocContext: true,
      supportsCancellation: true,
      supportedEventTypes: ["adapter.output", "adapter.error", "run.updated"],
    };
  }

  async startRun(input: RuntimeAdapterRunInput): Promise<RuntimeAdapterRun> {
    const args = [
      "run",
      "--format",
      "json",
      ...(this.agent ? ["--agent", this.agent] : []),
      ...(this.model ? ["--model", this.model] : []),
      ...(this.variant ? ["--variant", this.variant] : []),
    ];
    const prompt = formatOpenCodeCliPrompt(input.projection);

    try {
      const runnerRun = await this.runner({
        command: this.command,
        args,
        prompt,
        ...(this.cwd ? { cwd: this.cwd } : {}),
      });
      const events = this.toRuntimeEvents(input, runnerRun.lines);

      return runnerRun.cancel ? { events, cancel: runnerRun.cancel } : { events };
    } catch (error) {
      return {
        events: this.runnerErrorEvents(input, getErrorMessage(error)),
      };
    }
  }

  private async *toRuntimeEvents(
    input: RuntimeAdapterRunInput,
    lines: AsyncIterable<string>,
  ): AsyncIterable<RuntimeEvent> {
    let sequence = 1;

    try {
      for await (const line of lines) {
        if (line.trim().length === 0) continue;

        const parsed = parseOpenCodeJsonLine(line);
        const createdAt = this.now();

        if (!parsed.ok) {
          yield createAdapterErrorEvent(input, sequence, createdAt, parsed.errorMessage, { line });
          sequence += 1;
          continue;
        }

        yield toOpenCodeRuntimeEvent({
          event: parsed.event,
          run: input.run,
          sequence,
          createdAt,
        });
        sequence += 1;
      }
    } catch (error) {
      yield createAdapterErrorEvent(input, sequence, this.now(), getErrorMessage(error), {
        code: "OPENCODE_CLI_RUNNER_ERROR",
      });
    }
  }

  private async *runnerErrorEvents(
    input: RuntimeAdapterRunInput,
    message: string,
  ): AsyncIterable<RuntimeEvent> {
    yield createAdapterErrorEvent(input, 1, this.now(), message, {
      code: "OPENCODE_CLI_RUNNER_ERROR",
    });
  }
}
