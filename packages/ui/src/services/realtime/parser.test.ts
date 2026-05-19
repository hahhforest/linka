import assert from "node:assert/strict";

import { demoRoom } from "../../fixtures/demoRoom.js";
import { parsePersistedDaemonEventData } from "./parser.js";

const message = demoRoom.messages[0];
const member = demoRoom.members[0];
const room = demoRoom.room;

const parsedMessage = parsePersistedDaemonEventData(
  JSON.stringify({
    cursor: 12,
    id: "evt_message_12",
    type: "message.created",
    roomId: message.roomId,
    payload: { message },
  }),
);

assert.equal(parsedMessage?.cursor, 12);
assert.equal(parsedMessage?.id, "evt_message_12");
assert.equal(parsedMessage?.type, "message.created");
if (parsedMessage?.type !== "message.created") {
  throw new Error("expected message.created event");
}
assert.equal(parsedMessage.roomId, message.roomId);
assert.equal(parsedMessage.payload.message.id, message.id);

const parsedMember = parsePersistedDaemonEventData(
  JSON.stringify({
    cursor: 13,
    id: "evt_member_13",
    type: "member.joined",
    roomId: member.roomId,
    payload: { member },
  }),
);

assert.equal(parsedMember?.type, "member.joined");
if (parsedMember?.type !== "member.joined") {
  throw new Error("expected member.joined event");
}
assert.equal(parsedMember.payload.member.id, member.id);

const parsedRoom = parsePersistedDaemonEventData(
  JSON.stringify({
    cursor: 14,
    id: "evt_room_14",
    type: "room.created",
    roomId: room.id,
    payload: { room },
  }),
);

assert.equal(parsedRoom?.type, "room.created");
if (parsedRoom?.type !== "room.created") {
  throw new Error("expected room.created event");
}
assert.equal(parsedRoom.payload.room.id, room.id);

assert.equal(
  parsePersistedDaemonEventData(
    JSON.stringify({ cursor: 15, id: "evt_ignored", type: "member.left", payload: {} }),
  ),
  undefined,
);
assert.equal(parsePersistedDaemonEventData("not-json"), undefined);
assert.equal(
  parsePersistedDaemonEventData(
    JSON.stringify({ id: "evt_missing_cursor", type: "message.created", payload: { message } }),
  ),
  undefined,
);

console.log("realtime parser persisted event shape: ok");
