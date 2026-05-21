import assert from "node:assert/strict";

import {
  harnessRunId,
  harnessSessionId,
  harnessTriggerId,
  runtimeEventId,
  runtimeSessionId,
  unixMs,
  type HarnessRun,
  type HarnessSession,
  type RuntimeEvent,
} from "@linka/shared";

import { demoRoom } from "../fixtures/demoRoom.js";
import { buildAgentActivityItems } from "./agentActivity.js";

const linka = demoRoom.members[1];
const verifier = demoRoom.members[3];

assert.ok(linka, "demo room should include LinkA member");
assert.ok(verifier, "demo room should include verifier member");

const linkaRuntime = {
  id: runtimeSessionId("rsess_activity_linka"),
  kind: "opencode" as const,
  adapterSessionId: "linka-runtime",
};
const verifierRuntime = {
  id: runtimeSessionId("rsess_activity_verifier"),
  kind: "opencode" as const,
  adapterSessionId: "verifier-runtime",
};

const readySession: HarnessSession = {
  id: harnessSessionId("hsess_activity_ready"),
  roomId: demoRoom.room.id,
  agentMemberId: linka.id,
  status: "idle",
  runtime: linkaRuntime,
  policy: {
    triggerMode: "mention_only",
    maxConcurrentTurns: 1,
    allowAutonomousContinue: false,
    visibleContext: "room",
  },
  createdAt: unixMs(1_000),
  updatedAt: unixMs(1_100),
  lastTriggerId: harnessTriggerId("htrig_activity_ready"),
};

const waitingSession: HarnessSession = {
  id: harnessSessionId("hsess_activity_waiting"),
  roomId: demoRoom.room.id,
  agentMemberId: verifier.id,
  status: "waiting_user",
  runtime: verifierRuntime,
  policy: {
    triggerMode: "mention_only",
    maxConcurrentTurns: 1,
    allowAutonomousContinue: false,
    visibleContext: "room",
  },
  createdAt: unixMs(1_200),
  updatedAt: unixMs(2_900),
  lastTriggerId: harnessTriggerId("htrig_activity_waiting"),
};

const queuedRun: HarnessRun = {
  id: harnessRunId("hrun_activity_queued"),
  roomId: demoRoom.room.id,
  targetMemberId: linka.id,
  status: "queued",
  runtime: linkaRuntime,
  createdAt: unixMs(1_300),
  updatedAt: unixMs(1_350),
};

const runningRun: HarnessRun = {
  id: harnessRunId("hrun_activity_running"),
  roomId: demoRoom.room.id,
  targetMemberId: verifier.id,
  status: "running",
  runtime: verifierRuntime,
  createdAt: unixMs(1_400),
  updatedAt: unixMs(2_400),
  startedAt: unixMs(1_420),
};

const failedRun: HarnessRun = {
  id: harnessRunId("hrun_activity_failed"),
  roomId: demoRoom.room.id,
  targetMemberId: linka.id,
  status: "failed",
  runtime: linkaRuntime,
  createdAt: unixMs(1_500),
  updatedAt: unixMs(2_600),
  startedAt: unixMs(1_520),
  completedAt: unixMs(2_600),
  error: "adapter crashed",
};

const completedRun: HarnessRun = {
  id: harnessRunId("hrun_activity_completed"),
  roomId: demoRoom.room.id,
  targetMemberId: verifier.id,
  status: "succeeded",
  runtime: verifierRuntime,
  createdAt: unixMs(1_600),
  updatedAt: unixMs(3_500),
  startedAt: unixMs(1_620),
  completedAt: unixMs(3_500),
  summary: "Verified the room projection.",
};

const cancelledRun: HarnessRun = {
  id: harnessRunId("hrun_activity_cancelled"),
  roomId: demoRoom.room.id,
  targetMemberId: linka.id,
  status: "cancelled",
  runtime: linkaRuntime,
  createdAt: unixMs(1_700),
  updatedAt: unixMs(2_200),
  completedAt: unixMs(2_200),
};

const completedStatusEvent: RuntimeEvent = {
  id: runtimeEventId("rtevt_activity_completed_status"),
  runId: completedRun.id,
  roomId: demoRoom.room.id,
  targetMemberId: verifier.id,
  sequence: 1,
  type: "run.completed",
  createdAt: unixMs(3_480),
  runtime: verifierRuntime,
  payload: { kind: "run_status", status: "succeeded", message: "completed from runtime" },
};

const completedOutputEvent: RuntimeEvent = {
  id: runtimeEventId("rtevt_activity_completed_output"),
  runId: completedRun.id,
  roomId: demoRoom.room.id,
  targetMemberId: verifier.id,
  sequence: 2,
  type: "adapter.output",
  createdAt: unixMs(3_490),
  runtime: verifierRuntime,
  payload: {
    kind: "adapter_output",
    stream: "summary",
    text: "Final answer from adapter output.",
  },
};

const failedStatusEvent: RuntimeEvent = {
  id: runtimeEventId("rtevt_activity_failed_status"),
  runId: failedRun.id,
  roomId: demoRoom.room.id,
  targetMemberId: linka.id,
  sequence: 1,
  type: "run.failed",
  createdAt: unixMs(2_550),
  runtime: linkaRuntime,
  payload: { kind: "run_status", status: "failed", message: "runtime failure" },
};

const failedErrorEvent: RuntimeEvent = {
  id: runtimeEventId("rtevt_activity_failed_error"),
  runId: failedRun.id,
  roomId: demoRoom.room.id,
  targetMemberId: linka.id,
  sequence: 2,
  type: "adapter.error",
  createdAt: unixMs(2_560),
  runtime: linkaRuntime,
  payload: { kind: "adapter_error", message: "tool call failed", code: "TOOL_FAILED" },
};

const runningOutputEvent: RuntimeEvent = {
  id: runtimeEventId("rtevt_activity_running_stderr"),
  runId: runningRun.id,
  roomId: demoRoom.room.id,
  targetMemberId: verifier.id,
  sequence: 1,
  type: "adapter.output",
  createdAt: unixMs(2_450),
  runtime: verifierRuntime,
  payload: { kind: "adapter_output", stream: "stderr", text: "waiting for input" },
};

const items = buildAgentActivityItems({
  members: demoRoom.members,
  sessions: [readySession, waitingSession],
  runs: [queuedRun, runningRun, failedRun, completedRun, cancelledRun],
  runtimeEventsByRunId: {
    [completedRun.id]: [completedStatusEvent, completedOutputEvent],
    [failedRun.id]: [failedStatusEvent, failedErrorEvent],
    [runningRun.id]: [runningOutputEvent],
  },
});

const itemByKind = new Map(items.map((item) => [item.kind, item] as const));

assert.equal(itemByKind.get("session_ready")?.status, "ready");
assert.equal(itemByKind.get("session_ready")?.sessionId, readySession.id);
assert.equal(itemByKind.get("session_ready")?.triggerId, readySession.lastTriggerId);

assert.equal(itemByKind.get("session_status")?.status, "waiting_user");
assert.equal(itemByKind.get("session_status")?.severity, "warning");
assert.equal(itemByKind.get("session_status")?.agentMemberId, verifier.id);

assert.equal(itemByKind.get("run_queued")?.status, "queued");
assert.equal(itemByKind.get("run_queued")?.runId, queuedRun.id);

assert.equal(itemByKind.get("run_running")?.status, "running");
assert.equal(itemByKind.get("run_running")?.sessionId, waitingSession.id);

const failedItem = itemByKind.get("run_failed");
assert.equal(failedItem?.status, "failed");
assert.equal(failedItem?.severity, "error");
assert.equal(failedItem?.agentMemberId, linka.id);
assert.equal(failedItem?.sessionId, readySession.id);
assert.equal(failedItem?.summary, "adapter crashed");
assert.equal(failedItem?.rawEventCount, 2);
assert.deepEqual(
  failedItem?.rawEvents.map((event) => event.id),
  [failedStatusEvent.id],
);

const completedItem = itemByKind.get("run_completed");
assert.equal(completedItem?.status, "completed");
assert.equal(completedItem?.severity, "success");
assert.equal(completedItem?.agentMemberId, verifier.id);
assert.equal(completedItem?.sessionId, waitingSession.id);
assert.equal(completedItem?.rawEventCount, 2);

assert.equal(itemByKind.get("run_cancelled")?.status, "cancelled");
assert.equal(itemByKind.get("run_cancelled")?.severity, "warning");

const outputItems = items.filter((item) => item.kind === "adapter_output");
assert.equal(outputItems.length, 2);
assert.equal(
  outputItems.some(
    (item) =>
      item.runId === completedRun.id &&
      item.sessionId === waitingSession.id &&
      item.summary === "Final answer from adapter output." &&
      item.rawEvents[0]?.id === completedOutputEvent.id,
  ),
  true,
);
assert.equal(
  outputItems.some((item) => item.runId === runningRun.id && item.severity === "warning"),
  true,
);

const adapterError = itemByKind.get("adapter_error");
assert.equal(adapterError?.status, "error");
assert.equal(adapterError?.severity, "error");
assert.equal(adapterError?.runId, failedRun.id);
assert.equal(adapterError?.sessionId, readySession.id);
assert.equal(adapterError?.rawEvents[0]?.id, failedErrorEvent.id);

assert.deepEqual(
  items.map((item) => item.updatedAt),
  [...items].map((item) => item.updatedAt).sort((left, right) => right - left),
);
assert.equal(items[0]?.kind, "run_completed");

console.log("agent activity projection: ok");
