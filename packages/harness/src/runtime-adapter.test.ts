import assert from "node:assert/strict";

import {
  harnessRunId,
  participantId,
  roomId,
  roomMemberId,
  runtimeEventId,
  runtimeSessionId,
  unixMs,
  type HarnessProjection,
  type HarnessRun,
  type PermissionPolicy,
  type RuntimeAdapterCapabilities,
  type RuntimeEvent,
  type RuntimeSessionRef,
} from "@linka/shared";

import { collectRuntimeEvents, type RuntimeAdapter } from "./index.js";

const now = unixMs(1_716_000_000_000);
const testRoomId = roomId("room_runtime_adapter_contract");
const targetMemberId = roomMemberId("rmem_runtime_target");
const runtimeSession = runtimeSessionId("rsess_harness_contract");
const runId = harnessRunId("hrun_harness_contract");

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

const runtimeRef: RuntimeSessionRef = {
  id: runtimeSession,
  kind: "opencode",
  adapterSessionId: "opaque-runtime-session",
  label: "OpenCode",
};

const run: HarnessRun = {
  id: runId,
  roomId: testRoomId,
  targetMemberId,
  status: "running",
  runtime: runtimeRef,
  createdAt: now,
  updatedAt: now,
  startedAt: now,
};

const projection: HarnessProjection = {
  request: {
    roomId: testRoomId,
    memberId: targetMemberId,
    participantId: participantId("part_runtime_target"),
    trigger: { type: "member_mentioned" },
  },
  room: {
    id: testRoomId,
    displayName: "Runtime Adapter Contract Room",
    createdAt: now,
    updatedAt: now,
    defaultVisibility: { scope: "room" },
    permissionPolicy,
  },
  viewer: {
    id: targetMemberId,
    roomId: testRoomId,
    participantId: participantId("part_runtime_target"),
    kind: "agent",
    role: "member",
    status: "active",
    displayName: "Runtime Agent",
  },
  members: [],
  messages: [],
  events: [],
  announcements: [],
  pins: [],
  files: [],
  docs: [],
  docComments: [],
};

const startedEvent: RuntimeEvent = {
  id: runtimeEventId("rtevt_harness_contract_started"),
  runId,
  roomId: testRoomId,
  targetMemberId,
  sequence: 1,
  type: "run.started",
  createdAt: now,
  runtime: runtimeRef,
  payload: { kind: "run_status", status: "running" },
};

const outputEvent: RuntimeEvent = {
  id: runtimeEventId("rtevt_harness_contract_output"),
  runId,
  roomId: testRoomId,
  targetMemberId,
  sequence: 2,
  type: "adapter.output",
  createdAt: now,
  runtime: runtimeRef,
  payload: {
    kind: "adapter_output",
    stream: "summary",
    text: "Adapter produced a structured runtime event.",
  },
};

async function* runtimeEvents(events: readonly RuntimeEvent[]): AsyncIterable<RuntimeEvent> {
  for (const event of events) {
    yield event;
  }
}

assert.deepEqual(await collectRuntimeEvents(runtimeEvents([startedEvent, outputEvent])), [
  startedEvent,
  outputEvent,
]);

const capabilities: RuntimeAdapterCapabilities = {
  kind: "opencode",
  supportsInteractiveSession: true,
  supportsStreamingEvents: true,
  supportsDocContext: true,
  supportsCancellation: true,
  supportedEventTypes: ["run.started", "adapter.output"],
};

const contractAdapter = {
  getCapabilities: () => capabilities,
  startRun: async (input) => {
    assert.equal(input.run.id, run.id);
    assert.equal(input.projection.request.roomId, testRoomId);

    return { events: runtimeEvents([startedEvent]) };
  },
} satisfies RuntimeAdapter;

assert.deepEqual(contractAdapter.getCapabilities(), capabilities);
assert.deepEqual(await collectRuntimeEvents((await contractAdapter.startRun({ run, projection })).events), [
  startedEvent,
]);

console.log("runtime adapter contract: ok");
