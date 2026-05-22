import assert from "node:assert/strict";

import { demoRoom } from "../fixtures/demoRoom.js";
import { parseComposerMentions } from "./composerMentions.js";
import { useRoomStore } from "./roomStore.js";

interface CapturedRequest {
  readonly input: string;
  readonly init: RequestInit;
}

const userMember = demoRoom.members[0];
const linkaMember = demoRoom.members[1];
const verificationMember = demoRoom.members[3];

assert.ok(userMember, "demo room should include user member");
assert.ok(linkaMember, "demo room should include LinkA member");
assert.ok(verificationMember, "demo room should include verification agent member");

const linkaMention = { memberId: linkaMember.id, displayText: "@LinkA" };

assert.deepEqual(parseComposerMentions("@LinkA 请处理", demoRoom.members), [linkaMention]);

assert.deepEqual(parseComposerMentions("@linka 请处理", demoRoom.members), [linkaMention]);

assert.deepEqual(parseComposerMentions("@LinkA请处理", demoRoom.members), [linkaMention]);

assert.deepEqual(parseComposerMentions("@Nobody 请处理", demoRoom.members), []);

assert.deepEqual(parseComposerMentions("@LinkA @LinkA @Nobody", demoRoom.members), [linkaMention]);

assert.deepEqual(parseComposerMentions("先 @核验 Agent 复核，再 @LinkA 收口", demoRoom.members), [
  { memberId: verificationMember.id, displayText: "@核验 Agent" },
  linkaMention,
]);

assert.deepEqual(parseComposerMentions("请 @用户确认中文名", demoRoom.members), [
  { memberId: userMember.id, displayText: "@用户" },
]);

assert.deepEqual(
  parseComposerMentions("@LinkA 不应匹配非 active member", [{ ...linkaMember, status: "removed" }]),
  [],
);

const makeJsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 || status === 201 ? "OK" : "Error",
    headers: { "Content-Type": "application/json" },
  });

const resetRoomStore = (source: "api" | "offline"): void => {
  useRoomStore.setState({
    rooms: [demoRoom.room],
    activeRoomId: demoRoom.room.id,
    membersByRoomId: { [demoRoom.room.id]: demoRoom.members },
    messagesByRoomId: { [demoRoom.room.id]: demoRoom.messages },
    docsByRoomId: { [demoRoom.room.id]: [] },
    harnessRunsByRoomId: { [demoRoom.room.id]: [] },
    runtimeEventsByRunId: {},
    filesByRoomId: { [demoRoom.room.id]: [] },
    announcementsByRoomId: { [demoRoom.room.id]: [] },
    pinnedItemsByRoomId: { [demoRoom.room.id]: [] },
    source,
    isLoading: false,
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

resetRoomStore("offline");
await useRoomStore.getState().sendComposerMessage("@LinkA 离线路径不应写 timeline");
const offlineStateAfterSend = useRoomStore.getState();
assert.equal(
  offlineStateAfterSend.messagesByRoomId[demoRoom.room.id]?.length,
  demoRoom.messages.length,
);
assert.match(offlineStateAfterSend.errorMessage ?? "", /running LinkA daemon/);

resetRoomStore("offline");
await useRoomStore.getState().sendComposerMessage("@Nobody 离线路径");
const offlineStateAfterBadMention = useRoomStore.getState();
assert.equal(
  offlineStateAfterBadMention.messagesByRoomId[demoRoom.room.id]?.length,
  demoRoom.messages.length,
);
assert.match(offlineStateAfterBadMention.errorMessage ?? "", /running LinkA daemon/);

const requests: CapturedRequest[] = [];
const apiComposerMessage = {
  ...demoRoom.messages[1],
  sequence: demoRoom.messages.length + 1,
  kind: "text",
  text: "@linka API path",
  mentions: [linkaMention],
};
const responses = [
  makeJsonResponse({ ok: true, message: apiComposerMessage }, 201),
  makeJsonResponse({ ok: true, members: demoRoom.members }),
  makeJsonResponse({ ok: true, messages: [...demoRoom.messages, apiComposerMessage] }),
  makeJsonResponse({ ok: true, docs: [] }),
  makeJsonResponse({ ok: true, runs: [] }),
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
    resetRoomStore("api");
    await useRoomStore.getState().sendComposerMessage("@linka API path");
  },
);

assert.equal(requests[0]?.input, `/linka/rooms/${demoRoom.room.id}/messages`);
assert.equal(requests[0]?.init.method, "POST");
assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
  senderMemberId: userMember.id,
  kind: "text",
  text: "@linka API path",
  mentions: [linkaMention],
});
assert.equal(responses.length, 0);

const badMentionRequests: CapturedRequest[] = [];
await withMockFetch(
  async (input, init = {}) => {
    badMentionRequests.push({ input: String(input), init });
    throw new Error("bad mention should not be sent");
  },
  async () => {
    resetRoomStore("api");
    await useRoomStore.getState().sendComposerMessage("@Nobody API path");
  },
);
assert.equal(badMentionRequests.length, 0);
assert.match(useRoomStore.getState().errorMessage ?? "", /未识别 @ 成员/);

console.log("composer mention parser and store integration: ok");
