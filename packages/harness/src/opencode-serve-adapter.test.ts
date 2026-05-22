import assert from "node:assert/strict";

import {
  harnessRunId,
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  runtimeSessionId,
  unixMs,
  type HarnessProjection,
  type HarnessRun,
  type PermissionPolicy,
  type RuntimeSessionRef,
} from "@linka/shared";

import {
  collectRuntimeEvents,
  OpenCodeServeRuntimeAdapter,
  type OpenCodeServeEvent,
  type OpenCodeServeProcessRunnerInput,
} from "./index.js";

interface FetchCall {
  readonly url: string;
  readonly method: string;
  readonly body?: unknown;
}

const now = unixMs(1_716_000_000_000);
const testRoomId = roomId("room_opencode_serve_adapter");
const targetMemberId = roomMemberId("rmem_opencode_serve_agent");
const humanMemberId = roomMemberId("rmem_opencode_serve_human");
const baseUrl = "http://opencode.test";

const permissions = {
  canReadHistory: true,
  canPostMessage: true,
  canMentionMembers: true,
  canUploadFiles: true,
  canManageMembers: false,
};

const permissionPolicy: PermissionPolicy = {
  owner: { ...permissions, canManageMembers: true },
  admin: { ...permissions, canManageMembers: true },
  member: permissions,
  guest: { ...permissions, canPostMessage: false, canMentionMembers: false },
};

const runtimeRef = (adapterSessionId: string): RuntimeSessionRef => ({
  id: runtimeSessionId(`rsess_${adapterSessionId.replace(/[^A-Za-z0-9._-]/g, "_")}`),
  kind: "opencode",
  adapterSessionId,
  label: "OpenCode serve",
});

const createRun = (suffix: string, runtime?: RuntimeSessionRef): HarnessRun => ({
  id: harnessRunId(`hrun_opencode_serve_${suffix}`),
  roomId: testRoomId,
  targetMemberId,
  status: "running",
  ...(runtime ? { runtime } : {}),
  createdAt: now,
  updatedAt: now,
  startedAt: now,
});

const projection: HarnessProjection = {
  request: {
    roomId: testRoomId,
    memberId: targetMemberId,
    participantId: participantId("part_opencode_serve_agent"),
    trigger: { type: "member_mentioned" },
  },
  room: {
    id: testRoomId,
    displayName: "OpenCode Serve Room",
    topic: "Adapter test",
    createdAt: now,
    updatedAt: now,
    defaultVisibility: { scope: "room" },
    permissionPolicy,
  },
  viewer: {
    id: targetMemberId,
    roomId: testRoomId,
    participantId: participantId("part_opencode_serve_agent"),
    kind: "agent",
    role: "member",
    status: "active",
    displayName: "Serve Agent",
  },
  members: [
    {
      id: targetMemberId,
      roomId: testRoomId,
      participantId: participantId("part_opencode_serve_agent"),
      kind: "agent",
      role: "member",
      status: "active",
      displayName: "Serve Agent",
    },
    {
      id: humanMemberId,
      roomId: testRoomId,
      participantId: participantId("part_opencode_serve_human"),
      kind: "human",
      role: "owner",
      status: "active",
      displayName: "Human Owner",
    },
  ],
  messages: [
    {
      id: roomMessageId("rmsg_opencode_serve_prompt"),
      roomId: testRoomId,
      sequence: 7,
      sender: { kind: "member", memberId: humanMemberId },
      kind: "text",
      createdAt: now,
      text: "legacy text should not be preferred",
      content: [{ type: "text", text: "Please inspect the repo and report back." }],
      visibility: { scope: "room" },
      notification: { level: "normal" },
    },
  ],
  events: [],
  announcements: [],
  pins: [],
  files: [],
  docs: [],
  docComments: [],
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const createFetch = (sessionIds: readonly string[] = ["oc-session-created"]) => {
  const calls: FetchCall[] = [];
  let sessionIndex = 0;

  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url =
      input instanceof URL ? input.toString() : typeof input === "string" ? input : input.url;
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, ...(body !== undefined ? { body } : {}) });

    if (url === `${baseUrl}/global/health` && method === "GET") {
      return jsonResponse({ ok: true });
    }

    if (url === `${baseUrl}/session` && method === "POST") {
      const id = sessionIds[Math.min(sessionIndex, sessionIds.length - 1)] ?? "oc-session-created";
      sessionIndex += 1;
      return jsonResponse({ id });
    }

    if (url.endsWith("/prompt_async") && method === "POST") {
      return jsonResponse({ ok: true });
    }

    if (url.endsWith("/abort") && method === "POST") {
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: `unexpected ${method} ${url}` }, 404);
  };

  return { calls, fetchImpl };
};

const createProcessRunner =
  (starts: OpenCodeServeProcessRunnerInput[]) => async (input: OpenCodeServeProcessRunnerInput) => {
    starts.push(input);
    return { pid: 42 };
  };

async function* streamEvents(
  events: readonly OpenCodeServeEvent[],
): AsyncIterable<OpenCodeServeEvent> {
  for (const event of events) yield event;
}

const createAdapter = (options: {
  readonly fetchImpl: typeof fetch;
  readonly processStarts: OpenCodeServeProcessRunnerInput[];
  readonly events?: readonly OpenCodeServeEvent[];
  readonly streamUrls?: string[];
}) =>
  new OpenCodeServeRuntimeAdapter({
    baseUrl,
    port: 4096,
    fetchImpl: options.fetchImpl,
    processRunner: createProcessRunner(options.processStarts),
    eventStreamFactory: ({ url }) => {
      options.streamUrls?.push(url);
      return streamEvents(options.events ?? []);
    },
    now: () => now,
    healthAttempts: 1,
    healthRetryDelayMs: 0,
  });

const fullPathFetch = createFetch(["oc-session-created"]);
const fullPathProcessStarts: OpenCodeServeProcessRunnerInput[] = [];
const fullPathStreamUrls: string[] = [];
const fullPathAdapter = createAdapter({
  fetchImpl: fullPathFetch.fetchImpl,
  processStarts: fullPathProcessStarts,
  streamUrls: fullPathStreamUrls,
  events: [
    {
      type: "message.part.delta",
      sessionID: "oc-session-created",
      part: { type: "text", text: "OpenCode streamed output." },
    },
    { type: "session.status", sessionID: "other-session", status: "idle" },
    { type: "session.status", sessionID: "oc-session-created", status: "idle" },
  ],
});

const fullPathEvents = await collectRuntimeEvents(
  (await fullPathAdapter.startRun({ run: createRun("full"), projection })).events,
);
assert.deepEqual(
  fullPathProcessStarts.map((start) => start.args),
  [["serve", "--port", "4096"]],
);
assert.deepEqual(
  fullPathFetch.calls.map((call) => `${call.method} ${call.url}`),
  [
    `GET ${baseUrl}/global/health`,
    `POST ${baseUrl}/session`,
    `POST ${baseUrl}/session/oc-session-created/prompt_async`,
  ],
);
assert.deepEqual(fullPathStreamUrls, [`${baseUrl}/global/event`]);
assert.equal(fullPathEvents.length, 3);
assert.equal(fullPathEvents[0]?.type, "runtime.session.started");
assert.equal(fullPathEvents[0]?.runtime?.adapterSessionId, "oc-session-created");
assert.equal(fullPathEvents[1]?.type, "adapter.output");
const fullPathOutputPayload = fullPathEvents[1]?.payload;
assert.equal(fullPathOutputPayload?.kind, "adapter_output");
if (fullPathOutputPayload?.kind !== "adapter_output") throw new Error("Expected adapter output.");
assert.equal(fullPathOutputPayload.text, "OpenCode streamed output.");
assert.equal(fullPathEvents[2]?.type, "run.completed");
const promptCall = fullPathFetch.calls.find((call) => call.url.endsWith("/prompt_async"));
assert.ok(promptCall !== undefined);
assert.ok(isRecord(promptCall.body));
assert.ok(Array.isArray(promptCall.body.parts));
assert.match(JSON.stringify(promptCall.body.parts), /Please inspect the repo/);

const wrappedStreamFetch = createFetch(["oc-session-wrapped"]);
const wrappedStreamProcessStarts: OpenCodeServeProcessRunnerInput[] = [];
const wrappedStreamAdapter = createAdapter({
  fetchImpl: wrappedStreamFetch.fetchImpl,
  processStarts: wrappedStreamProcessStarts,
  events: [
    {
      directory: "/tmp/linka",
      project: "linka",
      payload: {
        id: "evt_wrapped_stream",
        type: "message.part.delta",
        properties: {
          sessionID: "oc-session-wrapped",
          part: { text: "Wrapped stream output." },
          status: { type: "idle" },
        },
      },
    },
  ],
});
const wrappedStreamEvents = await collectRuntimeEvents(
  (await wrappedStreamAdapter.startRun({ run: createRun("wrapped"), projection })).events,
);
assert.equal(wrappedStreamEvents.length, 3);
assert.equal(wrappedStreamEvents[0]?.type, "runtime.session.started");
assert.equal(wrappedStreamEvents[1]?.type, "adapter.output");
assert.equal(wrappedStreamEvents[1]?.sequence, 2);
const wrappedStreamOutputPayload = wrappedStreamEvents[1]?.payload;
assert.equal(wrappedStreamOutputPayload?.kind, "adapter_output");
if (wrappedStreamOutputPayload?.kind !== "adapter_output") {
  throw new Error("Expected wrapped adapter output.");
}
assert.equal(wrappedStreamOutputPayload.text, "Wrapped stream output.");
assert.equal(wrappedStreamEvents[2]?.type, "run.completed");
assert.equal(wrappedStreamEvents[2]?.sequence, 3);

const configuredFetch = createFetch(["oc-session-configured"]);
const configuredProcessStarts: OpenCodeServeProcessRunnerInput[] = [];
const configuredAdapter = new OpenCodeServeRuntimeAdapter({
  baseUrl,
  fetchImpl: configuredFetch.fetchImpl,
  processRunner: createProcessRunner(configuredProcessStarts),
  eventStreamFactory: () =>
    streamEvents([{ type: "session.status", sessionID: "oc-session-configured", status: "idle" }]),
  model: { providerID: "azure", modelID: "gpt-5.5" },
  variant: "xhigh",
  agent: "build",
  now: () => now,
  healthAttempts: 1,
  healthRetryDelayMs: 0,
});
await collectRuntimeEvents(
  (await configuredAdapter.startRun({ run: createRun("configured"), projection })).events,
);
const configuredPromptCall = configuredFetch.calls.find((call) =>
  call.url.endsWith("/prompt_async"),
);
assert.ok(configuredPromptCall !== undefined);
assert.ok(isRecord(configuredPromptCall.body));
assert.deepEqual(configuredPromptCall.body, {
  parts: configuredPromptCall.body.parts,
  model: { providerID: "azure", modelID: "gpt-5.5" },
  variant: "xhigh",
  agent: "build",
});
const reusedFetch = createFetch();
const reusedProcessStarts: OpenCodeServeProcessRunnerInput[] = [];
const reusedAdapter = createAdapter({
  fetchImpl: reusedFetch.fetchImpl,
  processStarts: reusedProcessStarts,
  events: [{ type: "session.status", sessionID: "oc-session-reused", status: "idle" }],
});
const reusedEvents = await collectRuntimeEvents(
  (
    await reusedAdapter.startRun({
      run: createRun("reuse", runtimeRef("oc-session-reused")),
      projection,
    })
  ).events,
);
assert.equal(
  reusedFetch.calls.some((call) => call.url === `${baseUrl}/session`),
  false,
);
assert.deepEqual(
  reusedFetch.calls.map((call) => `${call.method} ${call.url}`),
  [`GET ${baseUrl}/global/health`, `POST ${baseUrl}/session/oc-session-reused/prompt_async`],
);
assert.equal(reusedEvents.length, 1);
assert.equal(reusedEvents[0]?.type, "run.completed");

const cancelFetch = createFetch(["oc-session-cancel-a", "oc-session-cancel-b"]);
const cancelProcessStarts: OpenCodeServeProcessRunnerInput[] = [];
const cancelAdapter = createAdapter({
  fetchImpl: cancelFetch.fetchImpl,
  processStarts: cancelProcessStarts,
});
const cancelRunA = createRun("cancel_a");
await cancelAdapter.startRun({ run: cancelRunA, projection });
await cancelAdapter.cancelRun(cancelRunA.id);
const cancelRunB = createRun("cancel_b");
const cancellable = await cancelAdapter.startRun({ run: cancelRunB, projection });
await cancellable.cancel?.();
assert.deepEqual(
  cancelFetch.calls.filter((call) => call.url.endsWith("/abort")).map((call) => call.url),
  [`${baseUrl}/session/oc-session-cancel-a/abort`, `${baseUrl}/session/oc-session-cancel-b/abort`],
);

const failedFetch = createFetch(["oc-session-failed"]);
const failedProcessStarts: OpenCodeServeProcessRunnerInput[] = [];
const failedAdapter = createAdapter({
  fetchImpl: failedFetch.fetchImpl,
  processStarts: failedProcessStarts,
  events: [{ type: "session.error", sessionID: "oc-session-failed", error: "boom" }],
});
const failedEvents = await collectRuntimeEvents(
  (await failedAdapter.startRun({ run: createRun("failed"), projection })).events,
);
assert.equal(failedEvents.at(-1)?.type, "run.failed");
const failedPayload = failedEvents.at(-1)?.payload;
assert.equal(failedPayload?.kind, "run_status");
if (failedPayload?.kind !== "run_status") throw new Error("Expected run status payload.");
assert.equal(failedPayload.status, "failed");
assert.equal(failedPayload.message, "boom");

const capabilities = new OpenCodeServeRuntimeAdapter({
  baseUrl,
  fetchImpl: createFetch().fetchImpl,
  processRunner: createProcessRunner([]),
  eventStreamFactory: () => streamEvents([]),
}).getCapabilities();
assert.equal(capabilities.kind, "opencode");
assert.equal(capabilities.supportsInteractiveSession, true);
assert.equal(capabilities.supportsStreamingEvents, true);
assert.equal(capabilities.supportsCancellation, true);

console.log("opencode serve adapter: ok");
