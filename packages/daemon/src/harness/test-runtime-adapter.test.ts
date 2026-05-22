import assert from "node:assert/strict";

import { collectRuntimeEvents } from "@linka/harness";
import {
  docId,
  harnessRunId,
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  unixMs,
  type HarnessProjection,
  type HarnessRun,
} from "@linka/shared";

import { createTestRuntimeAdapter, formatTestRuntimeOutputText } from "./test-runtime-adapter.js";

const now = unixMs(1_716_000_000_000);
const defaultVisibility = { scope: "room" as const };
const notification = { level: "normal" as const };
const permissions = {
  canReadHistory: true,
  canPostMessage: true,
  canMentionMembers: true,
  canUploadFiles: true,
  canManageMembers: false,
};

const run: HarnessRun = {
  id: harnessRunId("hrun_test_runtime_1"),
  roomId: roomId("room_test_runtime"),
  targetMemberId: roomMemberId("rmem_test_runtime_agent"),
  status: "running",
  createdAt: now,
  updatedAt: now,
  startedAt: now,
  triggerMessageId: roomMessageId("rmsg_test_runtime_trigger"),
};

const projection: HarnessProjection = {
  request: {
    roomId: run.roomId,
    memberId: run.targetMemberId,
    participantId: participantId("part_test_runtime_agent"),
    trigger: { type: "member_mentioned" },
  },
  room: {
    id: run.roomId,
    displayName: "Deterministic Runtime Room",
    topic: "stable UI run loop assertions",
    createdAt: now,
    updatedAt: now,
    defaultVisibility,
    permissionPolicy: {
      owner: permissions,
      admin: permissions,
      member: permissions,
      guest: permissions,
    },
  },
  viewer: {
    id: run.targetMemberId,
    roomId: run.roomId,
    participantId: participantId("part_test_runtime_agent"),
    kind: "agent",
    role: "member",
    status: "active",
    displayName: "LinkA",
  },
  members: [
    {
      id: roomMemberId("rmem_test_runtime_human"),
      roomId: run.roomId,
      participantId: participantId("part_test_runtime_human"),
      kind: "human",
      role: "owner",
      status: "active",
      displayName: "Alice",
    },
    {
      id: run.targetMemberId,
      roomId: run.roomId,
      participantId: participantId("part_test_runtime_agent"),
      kind: "agent",
      role: "member",
      status: "active",
      displayName: "LinkA",
    },
  ],
  messages: [
    {
      id: roomMessageId("rmsg_test_runtime_trigger"),
      roomId: run.roomId,
      sequence: 1,
      sender: { kind: "member", memberId: roomMemberId("rmem_test_runtime_human") },
      kind: "text",
      createdAt: now,
      text: "@LinkA summarize this deterministic run",
      mentions: [{ memberId: run.targetMemberId, displayText: "@LinkA" }],
      visibility: defaultVisibility,
      notification,
    },
  ],
  events: [],
  announcements: [],
  pins: [],
  files: [],
  docs: [
    {
      id: docId("doc_test_runtime_brief"),
      contextRoomId: run.roomId,
      title: "Runtime brief",
      format: "markdown",
      status: "active",
      body: "Deterministic test context.",
      createdAt: now,
      updatedAt: now,
      createdByMemberId: roomMemberId("rmem_test_runtime_human"),
      visibility: defaultVisibility,
    },
  ],
  docComments: [],
};

const adapter = createTestRuntimeAdapter();
const capabilities = adapter.getCapabilities();

assert.equal(capabilities.kind, "test");
assert.equal(capabilities.supportsInteractiveSession, false);
assert.equal(capabilities.supportsStreamingEvents, true);
assert.equal(capabilities.supportsDocContext, true);
assert.equal(capabilities.supportsCancellation, false);
assert.deepEqual(capabilities.supportedEventTypes, [
  "run.started",
  "adapter.output",
  "run.completed",
]);

const runtimeRun = await adapter.startRun({ run, projection });
const events = await collectRuntimeEvents(runtimeRun.events);

assert.deepEqual(
  events.map((event) => event.type),
  ["run.started", "adapter.output", "run.completed"],
);
assert.deepEqual(
  events.map((event) => event.id),
  [
    "rtevt_test_hrun_test_runtime_1_started",
    "rtevt_test_hrun_test_runtime_1_output",
    "rtevt_test_hrun_test_runtime_1_completed",
  ],
);
assert.deepEqual(
  events.map((event) => event.sequence),
  [1, 2, 3],
);
assert.ok(events.every((event) => event.runId === run.id));
assert.ok(events.every((event) => event.roomId === run.roomId));
assert.ok(events.every((event) => event.targetMemberId === run.targetMemberId));
assert.ok(events.every((event) => event.createdAt === now));
assert.ok(events.every((event) => event.runtime?.kind === "test"));
assert.equal(events[0]?.runtime?.adapterSessionId, `test:${run.roomId}:${run.targetMemberId}`);

const output = events[1];
assert.equal(output?.type, "adapter.output");
assert.equal(output?.payload.kind, "adapter_output");
if (output?.payload.kind === "adapter_output") {
  assert.equal(output.payload.text, formatTestRuntimeOutputText(run, projection));
  assert.match(output.payload.text ?? "", /LinkA test runtime completed/);
  assert.match(output.payload.text ?? "", /room=Deterministic Runtime Room/);
  assert.match(output.payload.text ?? "", /projection messages=1 docs=1 members=2/);
  assert.match(output.payload.text ?? "", /trigger=member_mentioned target=LinkA/);
  assert.match(output.payload.text ?? "", /@LinkA summarize this deterministic run/);
}

assert.deepEqual(events[2]?.payload, {
  kind: "run_status",
  status: "succeeded",
  message: "test runtime completed",
});

console.log("test runtime adapter: ok");
