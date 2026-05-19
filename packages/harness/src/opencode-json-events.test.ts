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

const errorEvent = toOpenCodeRuntimeEvent({
  event: { type: "assistant_error", error: "OpenCode failed.", code: "E_OPENCODE" },
  run,
  sequence: 12,
  createdAt: now,
});

assert.equal(errorEvent.runId, runId);
assert.equal(errorEvent.roomId, testRoomId);
assert.equal(errorEvent.targetMemberId, targetMemberId);
assert.equal(errorEvent.sequence, 12);
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
  sequence: 13,
  createdAt: now,
});

assert.equal(metadataEvent.runId, runId);
assert.equal(metadataEvent.roomId, testRoomId);
assert.equal(metadataEvent.targetMemberId, targetMemberId);
assert.equal(metadataEvent.sequence, 13);
assert.equal(metadataEvent.type, "run.updated");
assert.deepEqual(metadataEvent.payload, {
  kind: "adapter_metadata",
  data: unknownEvent,
});

const unknownTextEvent = { type: "session.updated", message: "busy" };
const metadataTextEvent = toOpenCodeRuntimeEvent({
  event: unknownTextEvent,
  run,
  sequence: 14,
  createdAt: now,
});

assert.equal(metadataTextEvent.runId, runId);
assert.equal(metadataTextEvent.roomId, testRoomId);
assert.equal(metadataTextEvent.targetMemberId, targetMemberId);
assert.equal(metadataTextEvent.sequence, 14);
assert.equal(metadataTextEvent.type, "run.updated");
assert.deepEqual(metadataTextEvent.payload, {
  kind: "adapter_metadata",
  data: unknownTextEvent,
});

console.log("opencode json events: ok");
