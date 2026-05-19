import assert from "node:assert/strict";

import { demoRoom } from "../fixtures/demoRoom.js";
import { useRoomStore } from "./roomStore.js";

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

const resetStore = (): void => {
  useRoomStore.setState({
    rooms: [],
    activeRoomId: undefined,
    membersByRoomId: {},
    messagesByRoomId: {},
    filesByRoomId: {},
    announcementsByRoomId: {},
    pinnedItemsByRoomId: {},
    source: "checking",
    isLoading: true,
    isSending: false,
    errorMessage: undefined,
    appliedRoomEventKeys: [],
  });
};

const withMockFetch = async (
  fetchImpl: typeof fetch,
  testBody: () => Promise<void>,
): Promise<void> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;

  try {
    await testBody();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

await withMockFetch(
  async () => {
    throw new Error("daemon offline");
  },
  async () => {
    resetStore();
    await useRoomStore.getState().initializeRoomWorkspace();

    let state = useRoomStore.getState();
    assert.equal(state.source, "fallback");
    assert.equal(state.activeRoomId, demoRoom.room.id);
    assert.equal(state.rooms[0]?.id, demoRoom.room.id);
    assert.equal(state.membersByRoomId[demoRoom.room.id]?.length, demoRoom.members.length);
    assert.equal(state.messagesByRoomId[demoRoom.room.id]?.length, demoRoom.messages.length);
    assert.equal(state.filesByRoomId[demoRoom.room.id]?.length, demoRoom.files.length);
    assert.equal(
      state.announcementsByRoomId[demoRoom.room.id]?.length,
      demoRoom.announcements.length,
    );
    assert.equal(state.pinnedItemsByRoomId[demoRoom.room.id]?.length, demoRoom.pinnedItems.length);

    await useRoomStore.getState().sendComposerMessage("本地补充一条判断");
    state = useRoomStore.getState();

    assert.equal(state.source, "fallback");
    assert.equal(state.messagesByRoomId[demoRoom.room.id]?.at(-1)?.text, "本地补充一条判断");
  },
);

console.log("room store fallback: ok");

const apiRoom = demoRoom.room;
const apiMembers = demoRoom.members;
const initialApiMessage = demoRoom.messages.find(
  (message) => message.id === "rmsg_user_initial_request",
);
const composerApiMessageBase = demoRoom.messages.find(
  (message) => message.id === "rmsg_linka_resume",
);

assert.ok(initialApiMessage, "demo room should include the initial user request message");
assert.ok(composerApiMessageBase, "demo room should include the LinkA resume message");

const composerApiMessage = {
  ...composerApiMessageBase,
  sequence: 2,
  text: "API composer message",
};

const requests: CapturedRequest[] = [];
const responses = [
  makeJsonResponse({ ok: true, rooms: [] }),
  makeJsonResponse({ ok: true, room: apiRoom }, 201),
  makeJsonResponse({ ok: true, member: apiMembers[0] }, 201),
  makeJsonResponse({ ok: true, member: apiMembers[1] }, 201),
  makeJsonResponse({ ok: true, member: apiMembers[2] }, 201),
  makeJsonResponse({ ok: true, member: apiMembers[3] }, 201),
  makeJsonResponse({ ok: true, message: initialApiMessage }, 201),
  makeJsonResponse({ ok: true, members: apiMembers }),
  makeJsonResponse({ ok: true, messages: [initialApiMessage] }),
  makeJsonResponse({ ok: true, message: composerApiMessage }, 201),
  makeJsonResponse({ ok: true, members: apiMembers }),
  makeJsonResponse({ ok: true, messages: [initialApiMessage, composerApiMessage] }),
];

await withMockFetch(
  async (input, init = {}) => {
    requests.push({ input: String(input), init });
    const response = responses.shift();

    if (!response) {
      throw new Error(`unexpected fetch call: ${String(input)}`);
    }

    return response;
  },
  async () => {
    resetStore();
    await useRoomStore.getState().initializeRoomWorkspace();

    let state = useRoomStore.getState();
    assert.equal(state.source, "api");
    assert.equal(state.activeRoomId, apiRoom.id);
    assert.deepEqual(state.membersByRoomId[apiRoom.id], apiMembers);
    assert.deepEqual(state.messagesByRoomId[apiRoom.id], [initialApiMessage]);
    assert.equal(state.errorMessage, undefined);

    assert.deepEqual(
      requests.map((request) => `${request.init.method ?? "GET"} ${request.input}`),
      [
        "GET /linka/rooms",
        "POST /linka/rooms",
        `POST /linka/rooms/${apiRoom.id}/members`,
        `POST /linka/rooms/${apiRoom.id}/members`,
        `POST /linka/rooms/${apiRoom.id}/members`,
        `POST /linka/rooms/${apiRoom.id}/members`,
        `POST /linka/rooms/${apiRoom.id}/messages`,
        `GET /linka/rooms/${apiRoom.id}/members`,
        `GET /linka/rooms/${apiRoom.id}/messages?afterSequence=0&limit=500`,
      ],
    );

    const createBody = JSON.parse(String(requests[1]?.init.body));
    assert.equal(createBody.displayName, demoRoom.room.displayName);
    assert.equal(createBody.topic, demoRoom.room.topic);

    const firstMessageBody = JSON.parse(String(requests[6]?.init.body));
    assert.equal(firstMessageBody.senderMemberId, apiMembers[0].id);
    assert.equal(firstMessageBody.kind, "instruction");
    assert.equal(firstMessageBody.mentions[0].memberId, apiMembers[1].id);

    await useRoomStore.getState().sendComposerMessage("API composer message");
    state = useRoomStore.getState();

    assert.equal(state.source, "api");
    assert.deepEqual(state.messagesByRoomId[apiRoom.id], [initialApiMessage, composerApiMessage]);
    assert.equal(state.isSending, false);

    const composerPost = requests[9];
    assert.equal(composerPost?.input, `/linka/rooms/${apiRoom.id}/messages`);
    assert.equal(composerPost?.init.method, "POST");
    assert.deepEqual(JSON.parse(String(composerPost?.init.body)), {
      senderMemberId: apiMembers[0].id,
      kind: "text",
      text: "API composer message",
    });

    assert.deepEqual(
      requests.slice(9).map((request) => `${request.init.method ?? "GET"} ${request.input}`),
      [
        `POST /linka/rooms/${apiRoom.id}/messages`,
        `GET /linka/rooms/${apiRoom.id}/members`,
        `GET /linka/rooms/${apiRoom.id}/messages?afterSequence=0&limit=500`,
      ],
    );
    assert.equal(responses.length, 0);
  },
);

console.log("room store api path: ok");

const resetStoreForRealtimeEvents = (): void => {
  useRoomStore.setState({
    rooms: [demoRoom.room],
    activeRoomId: demoRoom.room.id,
    membersByRoomId: { [demoRoom.room.id]: [demoRoom.members[0]] },
    messagesByRoomId: { [demoRoom.room.id]: [initialApiMessage] },
    filesByRoomId: { [demoRoom.room.id]: [] },
    announcementsByRoomId: { [demoRoom.room.id]: [] },
    pinnedItemsByRoomId: { [demoRoom.room.id]: [] },
    source: "api",
    isLoading: false,
    isSending: false,
    errorMessage: undefined,
    appliedRoomEventKeys: [],
  });
};

resetStoreForRealtimeEvents();
useRoomStore.getState().applyRoomEvent({
  cursor: 101,
  id: "evt_message_101",
  type: "message.created",
  roomId: demoRoom.room.id,
  payload: { message: composerApiMessage },
});
useRoomStore.getState().applyRoomEvent({
  cursor: 101,
  id: "evt_message_101_duplicate",
  type: "message.created",
  roomId: demoRoom.room.id,
  payload: { message: composerApiMessage },
});
let realtimeState = useRoomStore.getState();
assert.deepEqual(realtimeState.messagesByRoomId[demoRoom.room.id], [
  initialApiMessage,
  composerApiMessage,
]);

resetStoreForRealtimeEvents();
useRoomStore.getState().applyRoomEvent({
  cursor: 102,
  id: "evt_member_102",
  type: "member.joined",
  roomId: demoRoom.room.id,
  payload: { member: demoRoom.members[1] },
});
useRoomStore.getState().applyRoomEvent({
  cursor: 103,
  id: "evt_member_102",
  type: "member.joined",
  roomId: demoRoom.room.id,
  payload: { member: demoRoom.members[1] },
});
realtimeState = useRoomStore.getState();
assert.deepEqual(realtimeState.membersByRoomId[demoRoom.room.id], [
  demoRoom.members[0],
  demoRoom.members[1],
]);

resetStoreForRealtimeEvents();
const eventRoom = { ...demoRoom.room, id: "room_realtime_created" as typeof demoRoom.room.id };
useRoomStore.getState().applyRoomEvent({
  cursor: 104,
  id: "evt_room_104",
  type: "room.created",
  roomId: eventRoom.id,
  payload: { room: eventRoom },
});
useRoomStore.getState().applyRoomEvent({
  cursor: 105,
  id: "evt_room_105",
  type: "room.created",
  roomId: eventRoom.id,
  payload: { room: eventRoom },
});
realtimeState = useRoomStore.getState();
assert.equal(
  realtimeState.rooms.filter((roomCandidate) => roomCandidate.id === eventRoom.id).length,
  1,
);

console.log("room store realtime events: ok");
