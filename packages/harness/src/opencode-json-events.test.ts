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

import { parseOpenCodeJsonLine, toOpenCodeRuntimeEvent } from "./index.js";

const now = unixMs(1_716_000_000_000);
const testRoomId = roomId("room_opencode_json_events");
const targetMemberId = roomMemberId("rmem_opencode_json_target");
const runId = harnessRunId("hrun_opencode_json_events");

const runtime: RuntimeSessionRef = {
  id: runtimeSessionId("rsess_opencode_json_events"),
  kind: "opencode",
  adapterSessionId: "opencode-json-session",
  label: "OpenCode JSON",
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

assert.deepEqual(parseOpenCodeJsonLine("  \n  "), {
  ok: false,
  errorMessage: "OpenCode JSON line is empty.",
});

const invalidJson = parseOpenCodeJsonLine("{not json");
assert.equal(invalidJson.ok, false);
if (!invalidJson.ok) assert.match(invalidJson.errorMessage, /not valid JSON/);

assert.deepEqual(parseOpenCodeJsonLine('[{"type":"message"}]'), {
  ok: false,
  errorMessage: "OpenCode JSON line must be a JSON object.",
});

const textParse = parseOpenCodeJsonLine('{"type":"message","text":"OpenCode streamed text."}');
assert.equal(textParse.ok, true);

const textEvent = toOpenCodeRuntimeEvent({
  event: textParse.event,
  run,
  sequence: 11,
  createdAt: now,
});

assert.equal(textEvent.runId, runId);
assert.equal(textEvent.roomId, testRoomId);
assert.equal(textEvent.targetMemberId, targetMemberId);
assert.equal(textEvent.sequence, 11);
assert.equal(textEvent.type, "adapter.output");
assert.deepEqual(textEvent.payload, {
  kind: "adapter_output",
  stream: "summary",
  text: "OpenCode streamed text.",
  data: { type: "message", text: "OpenCode streamed text." },
});

const nestedTextEvent = {
  type: "text",
  timestamp: 1_779_213_249_891,
  sessionID: "opencode-json-session",
  part: { type: "text", text: "LinkA real opencode room reply ok" },
};
const nestedRuntimeEvent = toOpenCodeRuntimeEvent({
  event: nestedTextEvent,
  run,
  sequence: 12,
  createdAt: now,
});

assert.equal(nestedRuntimeEvent.runId, runId);
assert.equal(nestedRuntimeEvent.roomId, testRoomId);
assert.equal(nestedRuntimeEvent.targetMemberId, targetMemberId);
assert.equal(nestedRuntimeEvent.sequence, 12);
assert.equal(nestedRuntimeEvent.type, "adapter.output");
assert.deepEqual(nestedRuntimeEvent.payload, {
  kind: "adapter_output",
  stream: "summary",
  text: "LinkA real opencode room reply ok",
  data: nestedTextEvent,
});

const blankNestedTextEvent = {
  type: "text",
  timestamp: 1_779_213_249_892,
  sessionID: "opencode-json-session",
  part: { type: "text", text: "  \n\t  " },
};
const blankNestedMetadataEvent = toOpenCodeRuntimeEvent({
  event: blankNestedTextEvent,
  run,
  sequence: 13,
  createdAt: now,
});

assert.equal(blankNestedMetadataEvent.runId, runId);
assert.equal(blankNestedMetadataEvent.roomId, testRoomId);
assert.equal(blankNestedMetadataEvent.targetMemberId, targetMemberId);
assert.equal(blankNestedMetadataEvent.sequence, 13);
assert.equal(blankNestedMetadataEvent.type, "run.updated");
assert.deepEqual(blankNestedMetadataEvent.payload, {
  kind: "adapter_metadata",
  data: blankNestedTextEvent,
});

const errorEvent = toOpenCodeRuntimeEvent({
  event: { type: "assistant_error", error: "OpenCode failed.", code: "E_OPENCODE" },
  run,
  sequence: 14,
  createdAt: now,
});

assert.equal(errorEvent.runId, runId);
assert.equal(errorEvent.roomId, testRoomId);
assert.equal(errorEvent.targetMemberId, targetMemberId);
assert.equal(errorEvent.sequence, 14);
assert.equal(errorEvent.type, "adapter.error");
assert.deepEqual(errorEvent.payload, {
  kind: "adapter_error",
  message: "OpenCode failed.",
  code: "E_OPENCODE",
  details: { type: "assistant_error", error: "OpenCode failed.", code: "E_OPENCODE" },
});

const unknownEvent = { type: "session.updated", id: "opaque-session", status: "busy" };
const metadataEvent = toOpenCodeRuntimeEvent({
  event: unknownEvent,
  run,
  sequence: 15,
  createdAt: now,
});

assert.equal(metadataEvent.runId, runId);
assert.equal(metadataEvent.roomId, testRoomId);
assert.equal(metadataEvent.targetMemberId, targetMemberId);
assert.equal(metadataEvent.sequence, 15);
assert.equal(metadataEvent.type, "run.updated");
assert.deepEqual(metadataEvent.payload, {
  kind: "adapter_metadata",
  data: unknownEvent,
});

const unknownTextEvent = { type: "session.updated", message: "busy" };
const metadataTextEvent = toOpenCodeRuntimeEvent({
  event: unknownTextEvent,
  run,
  sequence: 16,
  createdAt: now,
});

assert.equal(metadataTextEvent.runId, runId);
assert.equal(metadataTextEvent.roomId, testRoomId);
assert.equal(metadataTextEvent.targetMemberId, targetMemberId);
assert.equal(metadataTextEvent.sequence, 16);
assert.equal(metadataTextEvent.type, "run.updated");
assert.deepEqual(metadataTextEvent.payload, {
  kind: "adapter_metadata",
  data: unknownTextEvent,
});

console.log("opencode json events: ok");
