import assert from "node:assert/strict";

import {
  harnessContextSnapshotId,
  harnessRunId,
  runtimeEventId,
  runtimeSessionId,
  unixMs,
  type HarnessRun,
  type RuntimeEvent,
} from "@linka/shared";

import { demoRoom } from "../fixtures/demoRoom.js";
import {
  exportHarnessRunTrajectory,
  listHarnessRunEvents,
  listRoomHarnessRuns,
  parseTrajectoryExport,
} from "./harnessRunsService.js";

interface CapturedRequest {
  readonly input: string;
  readonly init: RequestInit;
}

const makeJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 || status === 201 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });

const makeTextResponse = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    statusText: status === 200 || status === 201 ? "OK" : "Error",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

const runtime = {
  id: runtimeSessionId("rsess_ui_service_run"),
  kind: "opencode" as const,
  adapterSessionId: "ui-service-session",
};

const run: HarnessRun = {
  id: harnessRunId("hrun_ui_service_run"),
  roomId: demoRoom.room.id,
  targetMemberId: demoRoom.members[1].id,
  status: "succeeded",
  runtime,
  createdAt: unixMs(1_716_000_000_000),
  updatedAt: unixMs(1_716_000_000_100),
  startedAt: unixMs(1_716_000_000_010),
  completedAt: unixMs(1_716_000_000_100),
  summary: "UI service run complete",
};

const event: RuntimeEvent = {
  id: runtimeEventId("rtevt_ui_service_output"),
  runId: run.id,
  roomId: run.roomId,
  targetMemberId: run.targetMemberId,
  sequence: 1,
  type: "adapter.output",
  createdAt: unixMs(1_716_000_000_090),
  runtime,
  payload: { kind: "adapter_output", stream: "summary", text: "UI service run complete" },
};

const trajectoryRecord = {
  metadata: {
    version: "linka-trajectory-jsonl.v1",
    format: "linka-trajectory-jsonl",
    runId: run.id,
    roomId: run.roomId,
    agentMemberId: run.targetMemberId,
    snapshotId: harnessContextSnapshotId("hctx_ui_service_snapshot"),
    projectionVersion: 1,
    redactionState: "raw",
    exportedAt: unixMs(1_716_000_000_020),
  },
  messages: [{ id: "msg_fixture" }],
  runtimeEvents: [event],
  outputMessages: [{ id: "msg_output" }],
  labels: { runStatus: "succeeded" },
};

const trajectoryText = `${JSON.stringify(trajectoryRecord)}\n`;

const requests: CapturedRequest[] = [];
const responses = [
  makeJsonResponse({ ok: true, runs: [run] }),
  makeJsonResponse({ ok: true, events: [event] }),
  makeTextResponse(trajectoryText),
  makeTextResponse(JSON.stringify({ ok: false, error: { code: "BAD_REQUEST" } }), 400),
];

const fetchImpl: typeof fetch = async (input, init = {}) => {
  requests.push({ input: String(input), init });
  const response = responses.shift();

  if (!response) {
    throw new Error("unexpected fetch call");
  }

  return response;
};

const options = { baseUrl: "http://daemon.test/", fetchImpl };

assert.deepEqual(await listRoomHarnessRuns(demoRoom.room.id, options), [run]);
assert.equal(requests[0]?.input, `http://daemon.test/linka/rooms/${demoRoom.room.id}/harness-runs`);
assert.equal(requests[0]?.init.method, "GET");

assert.deepEqual(await listHarnessRunEvents(run.id, options), [event]);
assert.equal(requests[1]?.input, `http://daemon.test/linka/harness-runs/${run.id}/events`);
assert.equal(requests[1]?.init.method, "GET");

const signal = AbortSignal.timeout(1_000);
const exportResult = await exportHarnessRunTrajectory(run.id, { ...options, signal });
assert.equal(
  requests[2]?.input,
  `http://daemon.test/linka/harness-runs/${run.id}/export?format=linka-trajectory-jsonl`,
);
assert.equal(requests[2]?.init.method, "GET");
assert.equal(requests[2]?.init.signal, signal);
assert.equal(requests[2]?.init.headers instanceof Headers, false);
assert.deepEqual(requests[2]?.init.headers, { Accept: "application/x-ndjson, text/plain" });
assert.equal(exportResult.text, trajectoryText);
assert.deepEqual(exportResult.record, trajectoryRecord);
assert.deepEqual(parseTrajectoryExport(trajectoryText), trajectoryRecord);
assert.equal(exportResult.record.metadata.runId, run.id);
assert.equal(exportResult.record.metadata.snapshotId, trajectoryRecord.metadata.snapshotId);

await assert.rejects(
  exportHarnessRunTrajectory(run.id, options),
  /LinkA daemon request failed: 400 Error/,
);
assert.equal(
  requests[3]?.input,
  `http://daemon.test/linka/harness-runs/${run.id}/export?format=linka-trajectory-jsonl`,
);
assert.equal(requests[3]?.init.method, "GET");
assert.equal(responses.length, 0);

console.log("harness runs service api shape: ok");
