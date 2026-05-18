import assert from "node:assert/strict";

import { demoRoom } from "../fixtures/demoRoom.js";
import {
  addRoomMember,
  createRoom,
  getRoom,
  listRoomMembers,
  listRoomMessages,
  listRooms,
  sendRoomMessage,
} from "./roomsService.js";

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

const requests: CapturedRequest[] = [];
const responses = [
  makeJsonResponse({ ok: true, rooms: [demoRoom.room] }),
  makeJsonResponse({ ok: true, room: demoRoom.room }, 201),
  makeJsonResponse({ ok: true, room: demoRoom.room, members: demoRoom.members }),
  makeJsonResponse({ ok: true, members: demoRoom.members }),
  makeJsonResponse({ ok: true, member: demoRoom.members[0] }, 201),
  makeJsonResponse({ ok: true, messages: demoRoom.messages }),
  makeJsonResponse({ ok: true, message: demoRoom.messages[1] }, 201),
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

assert.deepEqual(await listRooms(options), [demoRoom.room]);
assert.equal(requests[0]?.input, "http://daemon.test/linka/rooms");
assert.equal(requests[0]?.init.method, "GET");

assert.equal(
  (await createRoom({ displayName: "Room", topic: "Topic" }, options)).id,
  demoRoom.room.id,
);
assert.equal(requests[1]?.input, "http://daemon.test/linka/rooms");
assert.equal(requests[1]?.init.method, "POST");
assert.deepEqual(JSON.parse(String(requests[1]?.init.body)), {
  displayName: "Room",
  topic: "Topic",
});

const detail = await getRoom(demoRoom.room.id, { ...options, includeMembers: true });
assert.equal(detail.room.id, demoRoom.room.id);
assert.equal(requests[2]?.input, `http://daemon.test/linka/rooms/${demoRoom.room.id}?members=true`);

assert.deepEqual(await listRoomMembers(demoRoom.room.id, options), demoRoom.members);
assert.equal(requests[3]?.input, `http://daemon.test/linka/rooms/${demoRoom.room.id}/members`);

assert.equal(
  (
    await addRoomMember(
      demoRoom.room.id,
      { participantId: demoRoom.members[0].participantId, kind: "human", displayName: "Human" },
      options,
    )
  ).id,
  demoRoom.members[0].id,
);
assert.equal(requests[4]?.input, `http://daemon.test/linka/rooms/${demoRoom.room.id}/members`);
assert.equal(requests[4]?.init.method, "POST");

assert.equal(
  (await listRoomMessages(demoRoom.room.id, { ...options, afterSequence: 0, limit: 10 })).length,
  demoRoom.messages.length,
);
assert.equal(
  requests[5]?.input,
  `http://daemon.test/linka/rooms/${demoRoom.room.id}/messages?afterSequence=0&limit=10`,
);

assert.equal(
  (
    await sendRoomMessage(
      demoRoom.room.id,
      { senderMemberId: demoRoom.members[0].id, kind: "text", text: "hello" },
      options,
    )
  ).id,
  demoRoom.messages[1].id,
);
assert.equal(requests[6]?.input, `http://daemon.test/linka/rooms/${demoRoom.room.id}/messages`);
assert.deepEqual(JSON.parse(String(requests[6]?.init.body)), {
  senderMemberId: demoRoom.members[0].id,
  kind: "text",
  text: "hello",
});

console.log("rooms service api shape: ok");
