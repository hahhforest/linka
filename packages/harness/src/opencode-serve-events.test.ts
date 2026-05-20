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

const propertiesOutputEvent = {
  type: "message.part.delta",
  properties: {
    sessionID: "oc-session-events",
    part: { type: "text", text: "properties text" },
  },
};
assert.equal(getOpenCodeServeSessionId(propertiesOutputEvent), "oc-session-events");
const propertiesOutputRuntimeEvent = toOpenCodeServeRuntimeEvent({
  event: propertiesOutputEvent,
  run,
  runtime,
  sequence: 6,
  createdAt: now,
});
assert.equal(propertiesOutputRuntimeEvent.type, "adapter.output");
assert.deepEqual(propertiesOutputRuntimeEvent.payload, {
  kind: "adapter_output",
  stream: "summary",
  text: "properties text",
  data: propertiesOutputEvent,
});

const propertiesDeltaOutputEvent = {
  type: "message.part.delta",
  properties: {
    sessionId: "oc-session-events",
    delta: { text: "delta text" },
  },
};
assert.equal(getOpenCodeServeSessionId(propertiesDeltaOutputEvent), "oc-session-events");
const propertiesDeltaRuntimeEvent = toOpenCodeServeRuntimeEvent({
  event: propertiesDeltaOutputEvent,
  run,
  runtime,
  sequence: 7,
  createdAt: now,
});
assert.equal(propertiesDeltaRuntimeEvent.type, "adapter.output");
assert.deepEqual(propertiesDeltaRuntimeEvent.payload, {
  kind: "adapter_output",
  stream: "summary",
  text: "delta text",
  data: propertiesDeltaOutputEvent,
});

const propertiesTextOutputEvent = {
  type: "message.part.delta",
  properties: {
    session_id: "oc-session-events",
    text: "direct properties text",
  },
};
assert.equal(getOpenCodeServeSessionId(propertiesTextOutputEvent), "oc-session-events");
const propertiesTextRuntimeEvent = toOpenCodeServeRuntimeEvent({
  event: propertiesTextOutputEvent,
  run,
  runtime,
  sequence: 8,
  createdAt: now,
});
assert.equal(propertiesTextRuntimeEvent.type, "adapter.output");
assert.deepEqual(propertiesTextRuntimeEvent.payload, {
  kind: "adapter_output",
  stream: "summary",
  text: "direct properties text",
  data: propertiesTextOutputEvent,
});

const propertiesIdleEvent = {
  type: "session.status",
  properties: { sessionID: "oc-session-events", status: "idle" },
};
assert.equal(getOpenCodeServeSessionId(propertiesIdleEvent), "oc-session-events");
const propertiesCompletedEvent = toOpenCodeServeRuntimeEvent({
  event: propertiesIdleEvent,
  run,
  runtime,
  sequence: 9,
  createdAt: now,
});
assert.equal(propertiesCompletedEvent.type, "run.completed");
assert.deepEqual(propertiesCompletedEvent.payload, {
  kind: "run_status",
  status: "succeeded",
  details: propertiesIdleEvent,
});

const propertiesSessionIdleEvent = {
  type: "session.idle",
  properties: { sessionID: "oc-session-events", state: "done" },
};
const propertiesSessionCompletedEvent = toOpenCodeServeRuntimeEvent({
  event: propertiesSessionIdleEvent,
  run,
  runtime,
  sequence: 10,
  createdAt: now,
});
assert.equal(propertiesSessionCompletedEvent.type, "run.completed");

const propertiesErrorEvent = {
  type: "session.status",
  properties: { sessionID: "oc-session-events", state: "error", error: "properties boom" },
};
assert.equal(getOpenCodeServeSessionId(propertiesErrorEvent), "oc-session-events");
const propertiesFailedEvent = toOpenCodeServeRuntimeEvent({
  event: propertiesErrorEvent,
  run,
  runtime,
  sequence: 11,
  createdAt: now,
});
assert.equal(propertiesFailedEvent.type, "run.failed");
assert.deepEqual(propertiesFailedEvent.payload, {
  kind: "run_status",
  status: "failed",
  message: "properties boom",
  details: propertiesErrorEvent,
});

const propertiesSessionErrorEvent = {
  type: "session.error",
  properties: { sessionID: "oc-session-events", error: { message: "nested properties boom" } },
};
const propertiesSessionFailedEvent = toOpenCodeServeRuntimeEvent({
  event: propertiesSessionErrorEvent,
  run,
  runtime,
  sequence: 12,
  createdAt: now,
});
assert.equal(propertiesSessionFailedEvent.type, "run.failed");
assert.deepEqual(propertiesSessionFailedEvent.payload, {
  kind: "run_status",
  status: "failed",
  message: "nested properties boom",
  details: propertiesSessionErrorEvent,
});

console.log("opencode serve events: ok");
