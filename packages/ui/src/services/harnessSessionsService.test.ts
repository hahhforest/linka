import assert from "node:assert/strict";

import { harnessSessionId, runtimeSessionId, unixMs, type HarnessSession } from "@linka/shared";

import { demoRoom } from "../fixtures/demoRoom.js";
import { createRoomHarnessSession, listRoomHarnessSessions } from "./harnessSessionsService.js";

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

const policy = {
  triggerMode: "mention_only" as const,
  maxConcurrentTurns: 1,
  allowAutonomousContinue: false,
  visibleContext: "room" as const,
};

const session: HarnessSession = {
  id: harnessSessionId("hsess_ui_service_session"),
  roomId: demoRoom.room.id,
  agentMemberId: demoRoom.members[1].id,
  status: "idle",
  runtime: {
    id: runtimeSessionId("rsess_ui_service_session"),
    kind: "opencode",
    adapterSessionId: "opaque-ui-service-session",
    label: "OpenCode serve",
  },
  policy,
  createdAt: unixMs(1_716_000_000_000),
  updatedAt: unixMs(1_716_000_000_100),
};

const requests: CapturedRequest[] = [];
const responses = [
  makeJsonResponse({ ok: true, sessions: [session] }),
  makeJsonResponse({ ok: true, session }, 201),
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

assert.deepEqual(await listRoomHarnessSessions(demoRoom.room.id, options), [session]);
assert.equal(
  requests[0]?.input,
  `http://daemon.test/linka/rooms/${demoRoom.room.id}/harness-sessions`,
);
assert.equal(requests[0]?.init.method, "GET");

assert.deepEqual(
  await createRoomHarnessSession(
    demoRoom.room.id,
    { agentMemberId: demoRoom.members[1].id, policy },
    options,
  ),
  session,
);
assert.equal(
  requests[1]?.input,
  `http://daemon.test/linka/rooms/${demoRoom.room.id}/harness-sessions`,
);
assert.equal(requests[1]?.init.method, "POST");
assert.deepEqual(JSON.parse(String(requests[1]?.init.body)), {
  agentMemberId: demoRoom.members[1].id,
  policy,
});
assert.equal(responses.length, 0);

console.log("harness sessions service api shape: ok");
