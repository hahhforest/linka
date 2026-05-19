import assert from "node:assert/strict";

import {
  docId,
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
  OpenCodeCliRuntimeAdapter,
  collectRuntimeEvents,
  type OpenCodeCliRunner,
  type OpenCodeCliRunnerInput,
} from "./index.js";

const now = unixMs(1_716_000_000_000);
const testRoomId = roomId("room_opencode_cli_adapter");
const targetMemberId = roomMemberId("rmem_opencode_cli_target");
const humanMemberId = roomMemberId("rmem_opencode_cli_human");
const targetParticipantId = participantId("part_opencode_cli_target");
const humanParticipantId = participantId("part_opencode_cli_human");
const runId = harnessRunId("hrun_opencode_cli_adapter");

const roomVisibility = { scope: "room" } as const;
const roomNotification = { level: "normal" } as const;
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

const runtime: RuntimeSessionRef = {
  id: runtimeSessionId("rsess_opencode_cli_adapter"),
  kind: "opencode",
  adapterSessionId: "opencode-cli-session",
  label: "OpenCode CLI",
};

const run: HarnessRun = {
  id: runId,
  roomId: testRoomId,
  targetMemberId,
  status: "running",
  runtime,
  createdAt: now,
  updatedAt: now,
  startedAt: now,
};

const projection: HarnessProjection = {
  request: {
    roomId: testRoomId,
    memberId: targetMemberId,
    participantId: targetParticipantId,
    trigger: { type: "member_mentioned" },
  },
  room: {
    id: testRoomId,
    displayName: "CLI Adapter Room",
    topic: "OpenCode adapter boundary",
    createdAt: now,
    updatedAt: now,
    defaultVisibility: roomVisibility,
    permissionPolicy,
  },
  viewer: {
    id: targetMemberId,
    roomId: testRoomId,
    participantId: targetParticipantId,
    kind: "agent",
    role: "member",
    status: "active",
    displayName: "CLI Agent",
  },
  members: [
    {
      id: humanMemberId,
      roomId: testRoomId,
      participantId: humanParticipantId,
      kind: "human",
      role: "owner",
      status: "active",
      displayName: "Ada",
    },
  ],
  messages: [
    {
      id: roomMessageId("rmsg_opencode_cli_instruction"),
      roomId: testRoomId,
      sequence: 7,
      sender: { kind: "member", memberId: humanMemberId },
      kind: "instruction",
      createdAt: now,
      text: "Please wire the OpenCode CLI adapter and preserve unknown events.",
      visibility: roomVisibility,
      notification: roomNotification,
    },
  ],
  events: [],
  announcements: [],
  pins: [],
  files: [],
  docs: [
    {
      id: docId("doc_opencode_cli_adapter_notes"),
      contextRoomId: testRoomId,
      title: "Adapter Design Notes",
      format: "markdown",
      status: "active",
      body: "Unknown OpenCode events must remain available as adapter metadata.",
      createdAt: now,
      updatedAt: now,
      createdByMemberId: humanMemberId,
      visibility: roomVisibility,
    },
  ],
  docComments: [],
};

async function* lines(values: readonly string[]): AsyncIterable<string> {
  for (const value of values) {
    yield value;
  }
}

let capturedInput: OpenCodeCliRunnerInput | undefined;
const successfulRunner: OpenCodeCliRunner = async (input) => {
  capturedInput = input;

  return {
    lines: lines([
      JSON.stringify({ type: "message", text: "OpenCode streamed text." }),
      JSON.stringify({ type: "session.updated", status: "busy" }),
    ]),
  };
};

const adapter = new OpenCodeCliRuntimeAdapter({
  agent: "build-agent",
  cwd: "/tmp/linka-opencode-cli-test",
  runner: successfulRunner,
  now: () => now,
});
const result = await adapter.startRun({ run, projection });
const events = await collectRuntimeEvents(result.events);

assert.equal(result.cancel, undefined);
assert.ok(capturedInput);
assert.equal(capturedInput.command, "opencode");
assert.deepEqual(capturedInput.args, ["run", "--format", "json", "--agent", "build-agent"]);
assert.equal(capturedInput.cwd, "/tmp/linka-opencode-cli-test");
assert.match(capturedInput.prompt, /CLI Adapter Room/);
assert.match(capturedInput.prompt, /CLI Agent/);
assert.match(capturedInput.prompt, /Adapter Design Notes/);

let capturedModelOptionsInput: OpenCodeCliRunnerInput | undefined;
const modelOptionsRunner: OpenCodeCliRunner = async (input) => {
  capturedModelOptionsInput = input;

  return {
    lines: lines([]),
  };
};

const modelOptionsAdapter = new OpenCodeCliRuntimeAdapter({
  agent: "build",
  model: "azure/gpt-5.5",
  variant: "xhigh",
  runner: modelOptionsRunner,
  now: () => now,
});
await modelOptionsAdapter.startRun({ run, projection });

assert.ok(capturedModelOptionsInput);
assert.deepEqual(capturedModelOptionsInput.args, [
  "run",
  "--format",
  "json",
  "--agent",
  "build",
  "--model",
  "azure/gpt-5.5",
  "--variant",
  "xhigh",
]);

assert.equal(events.length, 2);
assert.equal(events[0].type, "adapter.output");
assert.equal(events[0].sequence, 1);
if (events[0].payload.kind !== "adapter_output") throw new Error("Expected adapter output.");
assert.equal(events[0].payload.text, "OpenCode streamed text.");
assert.deepEqual(events[0].payload.data, { type: "message", text: "OpenCode streamed text." });

assert.equal(events[1].type, "run.updated");
assert.equal(events[1].sequence, 2);
if (events[1].payload.kind !== "adapter_metadata") throw new Error("Expected adapter metadata.");
assert.deepEqual(events[1].payload.data, { type: "session.updated", status: "busy" });

const parseFailureRunner: OpenCodeCliRunner = async () => ({
  lines: lines(["", "{not json"]),
});
const parseFailureAdapter = new OpenCodeCliRuntimeAdapter({
  runner: parseFailureRunner,
  now: () => now,
});
const parseFailureEvents = await collectRuntimeEvents(
  (await parseFailureAdapter.startRun({ run, projection })).events,
);

assert.equal(parseFailureEvents.length, 1);
assert.equal(parseFailureEvents[0].type, "adapter.error");
assert.equal(parseFailureEvents[0].sequence, 1);
if (parseFailureEvents[0].payload.kind !== "adapter_error") {
  throw new Error("Expected adapter error.");
}
assert.match(parseFailureEvents[0].payload.message, /not valid JSON/);
assert.equal(parseFailureEvents[0].payload.details?.line, "{not json");

console.log("opencode cli adapter: ok");
