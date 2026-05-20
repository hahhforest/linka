import assert from "node:assert/strict";

import {
  docId,
  harnessRunId,
  runtimeEventId,
  runtimeSessionId,
  unixMs,
  type Doc,
  type HarnessRun,
  type RuntimeEvent,
} from "@linka/shared";

import { demoRoom } from "../fixtures/demoRoom.js";
import * as roomStoreModule from "./roomStore.js";
import { useRoomStore } from "./roomStore.js";

interface CapturedRequest {
  readonly input: string;
  readonly init: RequestInit;
}

assert.equal(
  Object.prototype.hasOwnProperty.call(roomStoreModule, "selectActiveRoomSnapshot"),
  false,
  "roomStore must not export object-creating Zustand selectors",
);

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
    docsByRoomId: {},
    harnessRunsByRoomId: {},
    runtimeEventsByRunId: {},
    filesByRoomId: {},
    announcementsByRoomId: {},
    pinnedItemsByRoomId: {},
    source: "checking",
    isLoading: true,
    isSending: false,
    isCreatingDoc: false,
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

let fallbackFetchCalls = 0;

await withMockFetch(
  async () => {
    fallbackFetchCalls += 1;
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
    assert.deepEqual(state.docsByRoomId[demoRoom.room.id], []);
    assert.deepEqual(state.harnessRunsByRoomId[demoRoom.room.id], []);
    assert.deepEqual(state.runtimeEventsByRunId, {});
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

    const callsBeforeCreateDoc = fallbackFetchCalls;
    await useRoomStore.getState().createActiveRoomDoc({ title: "本地文档" });
    state = useRoomStore.getState();

    assert.equal(fallbackFetchCalls, callsBeforeCreateDoc);
    assert.equal(state.isCreatingDoc, false);
    assert.match(state.errorMessage ?? "", /API-backed room/);
    assert.deepEqual(state.docsByRoomId[demoRoom.room.id], []);
  },
);

console.log("room store fallback: ok");

const apiRoom = demoRoom.room;
const apiMembers = demoRoom.members;
const apiDocs: readonly Doc[] = [
  {
    id: docId("doc_room_store_brief"),
    contextRoomId: apiRoom.id,
    title: "Room Store Brief",
    format: "markdown",
    status: "active",
    body: "# Brief\n\nLoaded through room store.",
    createdAt: unixMs(1_716_000_100_000),
    updatedAt: unixMs(1_716_000_100_100),
    createdByMemberId: apiMembers[0].id,
    visibility: { scope: "room" },
  },
];
const createdApiDoc: Doc = {
  id: docId("doc_room_store_created"),
  contextRoomId: apiRoom.id,
  title: "Created Room Doc",
  format: "markdown",
  status: "active",
  body: "# Created\n\nCreated through the room store.",
  createdAt: unixMs(1_716_000_200_000),
  updatedAt: unixMs(1_716_000_200_100),
  createdByMemberId: apiMembers[0].id,
  visibility: { scope: "room" },
};

const apiRuntime = {
  id: runtimeSessionId("rsess_room_store_run"),
  kind: "opencode" as const,
  adapterSessionId: "room-store-session",
};
const apiRun: HarnessRun = {
  id: harnessRunId("hrun_room_store_run"),
  roomId: apiRoom.id,
  targetMemberId: apiMembers[1].id,
  status: "succeeded",
  runtime: apiRuntime,
  createdAt: unixMs(1_716_000_300_000),
  updatedAt: unixMs(1_716_000_300_100),
  startedAt: unixMs(1_716_000_300_010),
  completedAt: unixMs(1_716_000_300_100),
  summary: "room store run complete",
};
const apiRunEvent: RuntimeEvent = {
  id: runtimeEventId("rtevt_room_store_output"),
  runId: apiRun.id,
  roomId: apiRoom.id,
  targetMemberId: apiMembers[1].id,
  sequence: 1,
  type: "adapter.output",
  createdAt: unixMs(1_716_000_300_090),
  runtime: apiRuntime,
  payload: { kind: "adapter_output", stream: "summary", text: "room store run complete" },
};

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
  makeJsonResponse({ ok: true, docs: apiDocs }),
  makeJsonResponse({ ok: true, runs: [apiRun] }),
  makeJsonResponse({ ok: true, events: [apiRunEvent] }),
  makeJsonResponse({ ok: true, message: composerApiMessage }, 201),
  makeJsonResponse({ ok: true, members: apiMembers }),
  makeJsonResponse({ ok: true, messages: [initialApiMessage, composerApiMessage] }),
  makeJsonResponse({ ok: true, docs: apiDocs }),
  makeJsonResponse({ ok: true, runs: [apiRun] }),
  makeJsonResponse({ ok: true, events: [apiRunEvent] }),
  makeJsonResponse({ ok: true, doc: createdApiDoc }, 201),
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
    assert.deepEqual(state.docsByRoomId[apiRoom.id], apiDocs);
    assert.deepEqual(state.harnessRunsByRoomId[apiRoom.id], [apiRun]);
    assert.deepEqual(state.runtimeEventsByRunId[apiRun.id], [apiRunEvent]);
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
        `GET /linka/rooms/${apiRoom.id}/docs`,
        `GET /linka/rooms/${apiRoom.id}/harness-runs`,
        `GET /linka/harness-runs/${apiRun.id}/events`,
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
    assert.deepEqual(state.docsByRoomId[apiRoom.id], apiDocs);
    assert.equal(state.isSending, false);

    const composerPost = requests[12];
    assert.equal(composerPost?.input, `/linka/rooms/${apiRoom.id}/messages`);
    assert.equal(composerPost?.init.method, "POST");
    assert.deepEqual(JSON.parse(String(composerPost?.init.body)), {
      senderMemberId: apiMembers[0].id,
      kind: "text",
      text: "API composer message",
    });

    assert.deepEqual(
      requests.slice(12).map((request) => `${request.init.method ?? "GET"} ${request.input}`),
      [
        `POST /linka/rooms/${apiRoom.id}/messages`,
        `GET /linka/rooms/${apiRoom.id}/members`,
        `GET /linka/rooms/${apiRoom.id}/messages?afterSequence=0&limit=500`,
        `GET /linka/rooms/${apiRoom.id}/docs`,
        `GET /linka/rooms/${apiRoom.id}/harness-runs`,
        `GET /linka/harness-runs/${apiRun.id}/events`,
      ],
    );
    await useRoomStore.getState().createActiveRoomDoc({
      title: "Created Room Doc",
      body: "# Created\n\nCreated through the room store.",
    });
    state = useRoomStore.getState();

    assert.equal(state.isCreatingDoc, false);
    assert.equal(state.errorMessage, undefined);
    assert.deepEqual(state.docsByRoomId[apiRoom.id], [...apiDocs, createdApiDoc]);

    const docPost = requests[18];
    assert.equal(docPost?.input, `/linka/rooms/${apiRoom.id}/docs`);
    assert.equal(docPost?.init.method, "POST");
    assert.deepEqual(JSON.parse(String(docPost?.init.body)), {
      title: "Created Room Doc",
      body: "# Created\n\nCreated through the room store.",
      format: "markdown",
      status: "active",
      createdByMemberId: apiMembers[0].id,
      visibility: { scope: "room" },
    });
    assert.equal(responses.length, 0);
  },
);

console.log("room store api path: ok");

const handoffDoc: Doc = {
  ...createdApiDoc,
  id: docId("doc_room_store_handoff"),
  title: "Nightly ToDo",
  body: "完成北极星任务。",
};
const handoffMessage = {
  ...composerApiMessage,
  id: "rmsg_room_store_handoff" as typeof composerApiMessage.id,
  sequence: 3,
  kind: "instruction" as const,
  text: "@LinkA 请根据刚创建的 Doc「Nightly ToDo」继续推进。",
  mentions: [{ memberId: apiMembers[1].id, displayText: "@LinkA" }],
};
const handoffRequests: CapturedRequest[] = [];
const handoffResponses = [
  makeJsonResponse({ ok: true, doc: handoffDoc }, 201),
  makeJsonResponse({ ok: true, message: handoffMessage }, 201),
  makeJsonResponse({ ok: true, members: apiMembers }),
  makeJsonResponse({ ok: true, messages: [...demoRoom.messages, handoffMessage] }),
  makeJsonResponse({ ok: true, docs: [...apiDocs, handoffDoc] }),
  makeJsonResponse({ ok: true, runs: [] }),
];

await withMockFetch(
  async (input, init = {}) => {
    handoffRequests.push({ input: String(input), init });
    const response = handoffResponses.shift();

    if (!response) {
      throw new Error(`unexpected handoff fetch call: ${String(input)}`);
    }

    return response;
  },
  async () => {
    resetStore();
    useRoomStore.setState({
      rooms: [apiRoom],
      activeRoomId: apiRoom.id,
      membersByRoomId: { [apiRoom.id]: apiMembers },
      messagesByRoomId: { [apiRoom.id]: demoRoom.messages },
      docsByRoomId: { [apiRoom.id]: apiDocs },
      harnessRunsByRoomId: { [apiRoom.id]: [] },
      runtimeEventsByRunId: {},
      filesByRoomId: { [apiRoom.id]: [] },
      announcementsByRoomId: { [apiRoom.id]: [] },
      pinnedItemsByRoomId: { [apiRoom.id]: [] },
      source: "api",
      isLoading: false,
      isSending: false,
      isCreatingDoc: false,
      errorMessage: undefined,
      appliedRoomEventKeys: [],
    });

    await useRoomStore.getState().createActiveRoomDoc({
      title: "Nightly ToDo",
      body: "完成北极星任务。",
      notifyLinkA: true,
    });
  },
);

assert.deepEqual(
  handoffRequests.map((request) => `${request.init.method ?? "GET"} ${request.input}`),
  [
    `POST /linka/rooms/${apiRoom.id}/docs`,
    `POST /linka/rooms/${apiRoom.id}/messages`,
    `GET /linka/rooms/${apiRoom.id}/members`,
    `GET /linka/rooms/${apiRoom.id}/messages?afterSequence=0&limit=500`,
    `GET /linka/rooms/${apiRoom.id}/docs`,
    `GET /linka/rooms/${apiRoom.id}/harness-runs`,
  ],
);
assert.deepEqual(JSON.parse(String(handoffRequests[1]?.init.body)), {
  senderMemberId: apiMembers[0].id,
  kind: "instruction",
  text: "@LinkA 请根据刚创建的 Doc「Nightly ToDo」继续推进。",
  mentions: [{ memberId: apiMembers[1].id, displayText: "@LinkA" }],
});
let handoffState = useRoomStore.getState();
assert.deepEqual(handoffState.docsByRoomId[apiRoom.id], [...apiDocs, handoffDoc]);
assert.deepEqual(handoffState.messagesByRoomId[apiRoom.id]?.at(-1), handoffMessage);
assert.equal(handoffState.errorMessage, undefined);
assert.equal(handoffResponses.length, 0);

const resetStoreForRealtimeEvents = (): void => {
  useRoomStore.setState({
    rooms: [demoRoom.room],
    activeRoomId: demoRoom.room.id,
    membersByRoomId: { [demoRoom.room.id]: [demoRoom.members[0]] },
    messagesByRoomId: { [demoRoom.room.id]: [initialApiMessage] },
    docsByRoomId: { [demoRoom.room.id]: apiDocs },
    harnessRunsByRoomId: { [demoRoom.room.id]: [apiRun] },
    runtimeEventsByRunId: { [apiRun.id]: [apiRunEvent] },
    filesByRoomId: { [demoRoom.room.id]: [] },
    announcementsByRoomId: { [demoRoom.room.id]: [] },
    pinnedItemsByRoomId: { [demoRoom.room.id]: [] },
    source: "api",
    isLoading: false,
    isSending: false,
    isCreatingDoc: false,
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
assert.deepEqual(realtimeState.docsByRoomId[eventRoom.id], []);
assert.deepEqual(realtimeState.harnessRunsByRoomId[eventRoom.id], []);

console.log("room store realtime events: ok");
