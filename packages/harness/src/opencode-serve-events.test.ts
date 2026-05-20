import assert from "node:assert/strict";

import {
  harnessRunId,
  roomId,
  roomMemberId,
  runtimeSessionId,
  unixMs,
  type HarnessRun,
  type RuntimeSessionRef,
} from "@linka/shared";

import {
  getOpenCodeServeSessionId,
  parseOpenCodeServeSseFrame,
  toOpenCodeServeRuntimeEvent,
} from "./index.js";

const now = unixMs(1_716_000_000_000);
const testRoomId = roomId("room_opencode_serve_events");
const targetMemberId = roomMemberId("rmem_opencode_serve_target");
const runId = harnessRunId("hrun_opencode_serve_events");

const runtime: RuntimeSessionRef = {
  id: runtimeSessionId("rsess_opencode_serve_events"),
  kind: "opencode",
  adapterSessionId: "oc-session-events",
  label: "OpenCode serve",
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

const parsedFrame = parseOpenCodeServeSseFrame(
  'event: message.part.delta\ndata: {"sessionID":"oc-session-events","part":{"type":"text","text":"hello"}}\n\n',
);
assert.deepEqual(parsedFrame, {
  type: "message.part.delta",
  sessionID: "oc-session-events",
  part: { type: "text", text: "hello" },
});
assert.equal(getOpenCodeServeSessionId(parsedFrame ?? {}), "oc-session-events");

const outputEvent = toOpenCodeServeRuntimeEvent({
  event: parsedFrame ?? {},
  run,
  runtime,
  sequence: 2,
  createdAt: now,
});
assert.equal(outputEvent.type, "adapter.output");
assert.deepEqual(outputEvent.payload, {
  kind: "adapter_output",
  stream: "summary",
  text: "hello",
  data: parsedFrame,
});

const completedEvent = toOpenCodeServeRuntimeEvent({
  event: { type: "session.status", sessionID: "oc-session-events", status: "idle" },
  run,
  runtime,
  sequence: 3,
  createdAt: now,
});
assert.equal(completedEvent.type, "run.completed");
assert.deepEqual(completedEvent.payload, {
  kind: "run_status",
  status: "succeeded",
  details: { type: "session.status", sessionID: "oc-session-events", status: "idle" },
});

const failedEvent = toOpenCodeServeRuntimeEvent({
  event: { type: "session.error", sessionID: "oc-session-events", error: "OpenCode failed." },
  run,
  runtime,
  sequence: 4,
  createdAt: now,
});
assert.equal(failedEvent.type, "run.failed");
assert.deepEqual(failedEvent.payload, {
  kind: "run_status",
  status: "failed",
  message: "OpenCode failed.",
  details: { type: "session.error", sessionID: "oc-session-events", error: "OpenCode failed." },
});

const metadataEvent = toOpenCodeServeRuntimeEvent({
  event: { type: "tool.call", sessionID: "oc-session-events", tool: "read" },
  run,
  runtime,
  sequence: 5,
  createdAt: now,
});
assert.equal(metadataEvent.type, "run.updated");
assert.deepEqual(metadataEvent.payload, {
  kind: "adapter_metadata",
  data: { type: "tool.call", sessionID: "oc-session-events", tool: "read" },
});

console.log("opencode serve events: ok");
