import assert from "node:assert/strict";

import { pendingInteractionId, roomId, roomMemberId } from "@linka/shared";

import {
  createRoomPendingInteraction,
  listRoomPendingInteractions,
  respondPendingInteraction,
} from "./pendingInteractionsService.js";

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

const room = roomId("room_pending_service");
const interaction = {
  id: pendingInteractionId("pint_service_one"),
  sessionId: "hsess_service_one" as const,
  roomId: room,
  agentMemberId: roomMemberId("rmem_service_agent"),
  kind: "question" as const,
  status: "requested" as const,
  createdAt: 1,
  updatedAt: 1,
};
const message = {
  id: "rmsg_pending_response",
  roomId: room,
  sequence: 2,
  sender: { kind: "member", memberId: roomMemberId("rmem_service_human") },
  kind: "intervention",
  createdAt: 2,
  text: "Use option A",
  visibility: { scope: "room" },
  notification: { level: "normal" },
};

const requests: CapturedRequest[] = [];
const responses = [
  makeJsonResponse({ ok: true, interactions: [interaction] }),
  makeJsonResponse({ ok: true, interaction }, 201),
  makeJsonResponse({ ok: true, interaction: { ...interaction, status: "answered" }, message }),
];
const fetchImpl: typeof fetch = async (input, init = {}) => {
  requests.push({ input: String(input), init });
  const response = responses.shift();
  if (!response) throw new Error(`unexpected fetch call: ${String(input)}`);
  return response;
};

assert.deepEqual(
  await listRoomPendingInteractions(room, { baseUrl: "http://daemon.test", fetchImpl }),
  [interaction],
);
assert.deepEqual(
  await createRoomPendingInteraction(
    room,
    { sessionId: interaction.sessionId, kind: "question" },
    { fetchImpl },
  ),
  interaction,
);
assert.deepEqual(
  await respondPendingInteraction(
    interaction.id,
    { senderMemberId: roomMemberId("rmem_service_human"), text: "Use option A" },
    { fetchImpl },
  ),
  { interaction: { ...interaction, status: "answered" }, message },
);

assert.deepEqual(
  requests.map((request) => `${request.init.method ?? "GET"} ${request.input}`),
  [
    `GET http://daemon.test/linka/rooms/${room}/pending-interactions`,
    `POST /linka/rooms/${room}/pending-interactions`,
    `POST /linka/pending-interactions/${interaction.id}/respond`,
  ],
);

console.log("pending interactions service api shape: ok");
