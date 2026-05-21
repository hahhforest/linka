import assert from "node:assert/strict";
import { test } from "node:test";

import {
  docCommentId,
  docId,
  docRevisionId,
  harnessRunId,
  roomId,
  roomMemberId,
  runtimeEventId,
  runtimeSessionId,
  unixMs,
  type Doc,
  type DocComment,
  type DocRevision,
  type HarnessRun,
  type HarnessSession,
  type RuntimeEvent,
} from "@linka/shared";

import { createDaemonApp } from "./app.js";
import type { RoomHarnessRunnerInput } from "./api/rooms.js";
import { createDaemonContainer, type DaemonContainer } from "./container/index.js";
import type { PersistedDaemonEvent } from "./store/event-store.js";

const createTestContainer = (): DaemonContainer =>
  createDaemonContainer({
    databasePath: ":memory:",
    env: { LINKA_PORT: "6202" },
    git: null,
    home: "/tmp/linka-home",
    cwd: "/tmp/linka-core-test",
    profile: "core-test",
    version: "test-version",
    now: () => new Date("2026-05-19T00:00:00.000Z"),
  });

const toJsonBody = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const readSseEvent = async (response: Response): Promise<PersistedDaemonEvent> => {
  assert.ok(response.body);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  try {
    while (!text.includes("\n\n")) {
      const chunk = await reader.read();

      if (chunk.done) {
        break;
      }

      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));

  assert.ok(dataLine, `expected SSE data line in ${JSON.stringify(text)}`);
  return JSON.parse(dataLine.slice("data: ".length)) as PersistedDaemonEvent;
};

test("createDaemonApp serves health under /linka base path", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const response = await app.request("http://127.0.0.1/linka/health");
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      profile: "core-test",
      port: 6202,
      dataDir: "/tmp/linka-home/.linka/profiles/core-test",
      version: "test-version",
      startedAt: "2026-05-19T00:00:00.000Z",
      uptimeMs: 0,
    });
  } finally {
    container.close();
  }
});

test("createDaemonApp returns uniform not found errors", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const response = await app.request("http://127.0.0.1/unknown");
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.deepEqual(body, {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
  } finally {
    container.close();
  }
});

test("POST /linka/dev/events appends before publishing to active SSE subscribers", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const streamResponse = await app.request("http://127.0.0.1/linka/events?cursor=0");
    const streamRead = readSseEvent(streamResponse);

    assert.equal(container.eventBus.getSubscriberCount(), 1);

    const postResponse = await app.request("http://127.0.0.1/linka/dev/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "dev.message",
        roomId: "room_alpha",
        payload: { text: "hello" },
      }),
    });
    const body = (await postResponse.json()) as { ok: true; event: PersistedDaemonEvent };
    const streamedEvent = await streamRead;

    assert.equal(postResponse.status, 201);
    assert.deepEqual(container.eventStore.listAfter(0, 10), [body.event]);
    assert.deepEqual(streamedEvent, body.event);
    assert.equal(container.eventBus.getSubscriberCount(), 0);
  } finally {
    container.close();
  }
});

test("GET /linka/events replays persisted history after query cursor", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const first = container.eventStore.append({
      id: "evt_first",
      type: "dev.first",
      createdAt: 1,
      payload: { order: 1 },
    });
    const second = container.eventStore.append({
      id: "evt_second",
      type: "dev.second",
      createdAt: 2,
      payload: { order: 2 },
    });

    const response = await app.request(`http://127.0.0.1/linka/events?cursor=${first.cursor}`);
    const event = await readSseEvent(response);

    assert.equal(response.status, 200);
    assert.equal(event.cursor, second.cursor);
    assert.equal(event.id, "evt_second");
  } finally {
    container.close();
  }
});

test("room API creates members and messages with sequenced history and replayable events", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Research Room", topic: "evidence check" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };

    assert.equal(createRoomResponse.status, 201);

    const humanResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: "part_human", kind: "human", displayName: "Human" }),
      },
    );
    const humanBody = (await humanResponse.json()) as { ok: true; member: { id: string } };
    const agentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: "part_agent", kind: "agent", displayName: "Agent" }),
      },
    );
    const agentBody = (await agentResponse.json()) as { ok: true; member: { id: string } };

    assert.equal(humanResponse.status, 201);
    assert.equal(agentResponse.status, 201);

    const firstMessageResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderMemberId: humanBody.member.id, text: "hello" }),
      },
    );
    const secondMessageResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderMemberId: agentBody.member.id, kind: "text", text: "hi" }),
      },
    );

    assert.equal(firstMessageResponse.status, 201);
    assert.equal(secondMessageResponse.status, 201);

    const historyResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages?afterSequence=0&limit=10`,
    );
    const historyBody = (await historyResponse.json()) as {
      ok: true;
      messages: readonly { sequence: number; text?: string }[];
    };

    assert.equal(historyResponse.status, 200);
    assert.deepEqual(
      historyBody.messages.map((message) => message.sequence),
      [1, 2],
    );
    assert.deepEqual(
      historyBody.messages.map((message) => message.text),
      ["hello", "hi"],
    );

    assert.deepEqual(
      container.eventStore.listAfter(0, 10).map((event) => event.type),
      ["room.created", "member.joined", "member.joined", "message.created", "message.created"],
    );

    const eventsResponse = await app.request("http://127.0.0.1/linka/events?cursor=0");
    const replayedEvent = await readSseEvent(eventsResponse);

    assert.equal(eventsResponse.status, 200);
    assert.equal(replayedEvent.type, "room.created");
    assert.equal(replayedEvent.roomId, createRoomBody.room.id);
  } finally {
    container.close();
  }
});

test("room API stores structured messages and exports Hugging Face chat JSONL", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Export Room", topic: "training data" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };
    const humanResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_export_human",
          kind: "human",
          displayName: "Human",
        }),
      },
    );
    const agentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_export_agent",
          kind: "agent",
          displayName: "Agent",
        }),
      },
    );
    const humanBody = (await humanResponse.json()) as { ok: true; member: { id: string } };
    const agentBody = (await agentResponse.json()) as { ok: true; member: { id: string } };

    const userMessageResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderMemberId: humanBody.member.id,
          kind: "instruction",
          text: "请核验这个 URL。",
          llmRole: "user",
          exportMeta: { includeInTraining: true, tags: ["hf-export"] },
        }),
      },
    );
    const agentMessageResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderMemberId: agentBody.member.id,
          kind: "tool_result_summary",
          text: "已找到证据。",
          content: [
            { type: "text", text: "已找到证据。", format: "plain" },
            {
              type: "tool_call",
              callId: "call_fetch_1",
              name: "fetch_url",
              argumentsJson: JSON.stringify({ url: "https://example.test" }),
            },
            {
              type: "tool_result",
              callId: "call_fetch_1",
              status: "ok",
              text: "updated 2026-05-01",
            },
          ],
          llmRole: "assistant",
          thread: { topicKey: "url-check" },
          trace: { trajectoryId: "traj_export_1" },
          exportMeta: {
            includeInTraining: true,
            lossMask: "assistant_only",
            redactionState: "raw",
          },
        }),
      },
    );

    assert.equal(userMessageResponse.status, 201);
    assert.equal(agentMessageResponse.status, 201);

    const historyResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages?afterSequence=0&limit=10`,
    );
    const historyBody = (await historyResponse.json()) as {
      ok: true;
      messages: readonly {
        llmRole?: string;
        content?: readonly { type: string }[];
        thread?: { topicKey?: string };
        trace?: { trajectoryId?: string };
        exportMeta?: { lossMask?: string; tags?: readonly string[] };
      }[];
    };

    assert.equal(historyResponse.status, 200);
    assert.deepEqual(
      historyBody.messages.map((message) => message.llmRole),
      ["user", "assistant"],
    );
    assert.deepEqual(
      historyBody.messages[1]?.content?.map((part) => part.type),
      ["text", "tool_call", "tool_result"],
    );
    assert.equal(historyBody.messages[1]?.thread?.topicKey, "url-check");
    assert.equal(historyBody.messages[1]?.trace?.trajectoryId, "traj_export_1");
    assert.equal(historyBody.messages[1]?.exportMeta?.lossMask, "assistant_only");

    const exportResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/exports/messages?format=hf-chat-jsonl`,
    );
    const exportedText = await exportResponse.text();
    const exported = JSON.parse(exportedText.trim()) as {
      messages: readonly { role: string; content: string }[];
      metadata: { roomId: string; messageIds: readonly string[]; trajectoryIds: readonly string[] };
    };

    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get("content-type") ?? "", /application\/x-ndjson/);
    assert.deepEqual(
      exported.messages.map((message) => message.role),
      ["user", "assistant"],
    );
    assert.equal(exported.messages[0]?.content, "请核验这个 URL。");
    assert.match(exported.messages[1]?.content ?? "", /\[tool_call:fetch_url\]/);
    assert.equal(exported.metadata.roomId, createRoomBody.room.id);
    assert.equal(exported.metadata.messageIds.length, 2);
    assert.deepEqual(exported.metadata.trajectoryIds, ["traj_export_1"]);
  } finally {
    container.close();
  }
});

test("room API rejects unsupported structured message fields", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Bad Structured Room" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };
    const humanResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_bad_structured_human",
          kind: "human",
          displayName: "Human",
        }),
      },
    );
    const humanBody = (await humanResponse.json()) as { ok: true; member: { id: string } };
    const badContentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderMemberId: humanBody.member.id,
          content: [{ type: "unknown", text: "bad" }],
        }),
      },
    );
    const badRoleResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderMemberId: humanBody.member.id,
          text: "hello",
          llmRole: "bot",
        }),
      },
    );

    assert.equal(badContentResponse.status, 400);
    assert.equal(badRoleResponse.status, 400);
  } finally {
    container.close();
  }
});

test("room API rejects bad member kind", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Research Room" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };
    const badKindResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "runtime", displayName: "Bad Member" }),
      },
    );
    const badKindBody = await badKindResponse.json();

    assert.equal(badKindResponse.status, 400);
    assert.deepEqual(badKindBody, {
      ok: false,
      error: { code: "BAD_REQUEST", message: "kind must be one of human, agent" },
    });
  } finally {
    container.close();
  }
});

test("room API rejects sending from an unknown sender member", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Research Room" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };
    const sendResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderMemberId: "rmem_unknown", text: "hello" }),
      },
    );
    const sendBody = await sendResponse.json();

    assert.equal(sendResponse.status, 404);
    assert.deepEqual(sendBody, {
      ok: false,
      error: { code: "NOT_FOUND", message: "sender member not found" },
    });
  } finally {
    container.close();
  }
});

test("room API does not run a harness without an injected runner", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Harness Room" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };
    const humanResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_harness_human",
          kind: "human",
          displayName: "Human",
        }),
      },
    );
    const agentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_harness_agent",
          kind: "agent",
          displayName: "Research Agent",
        }),
      },
    );
    const humanBody = (await humanResponse.json()) as { ok: true; member: { id: string } };
    const agentBody = (await agentResponse.json()) as { ok: true; member: { id: string } };

    const messageResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderMemberId: humanBody.member.id,
          kind: "instruction",
          text: "请检查这个页面是否一年内更新。",
          mentions: [{ memberId: agentBody.member.id, displayText: "@Research Agent" }],
        }),
      },
    );

    assert.equal(messageResponse.status, 201);

    const historyResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages?afterSequence=0&limit=10`,
    );
    const historyBody = (await historyResponse.json()) as {
      ok: true;
      messages: readonly unknown[];
    };

    assert.equal(historyBody.messages.length, 1);
    assert.deepEqual(
      container.eventStore
        .listAfter(0, 20)
        .map((event) => event.type)
        .slice(-1),
      ["message.created"],
    );
  } finally {
    container.close();
  }
});

test("injected harness runner does not reply to agent-authored mentions", async () => {
  const container = createTestContainer();

  try {
    const harnessCalls: RoomHarnessRunnerInput[] = [];
    const app = createDaemonApp(container, {
      rooms: {
        harnessRunner: (input) => {
          harnessCalls.push(input);
        },
      },
    });
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Harness Loop Room" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };
    const firstAgentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_agent_a",
          kind: "agent",
          displayName: "Agent A",
        }),
      },
    );
    const secondAgentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_agent_b",
          kind: "agent",
          displayName: "Agent B",
        }),
      },
    );
    const firstAgentBody = (await firstAgentResponse.json()) as {
      ok: true;
      member: { id: string };
    };
    const secondAgentBody = (await secondAgentResponse.json()) as {
      ok: true;
      member: { id: string };
    };

    const messageResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderMemberId: firstAgentBody.member.id,
          text: "@Agent B please continue",
          mentions: [{ memberId: secondAgentBody.member.id, displayText: "@Agent B" }],
        }),
      },
    );

    assert.equal(messageResponse.status, 201);

    const historyResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages?afterSequence=0&limit=10`,
    );
    const historyBody = (await historyResponse.json()) as {
      ok: true;
      messages: readonly unknown[];
    };

    assert.equal(historyBody.messages.length, 1);
    assert.equal(harnessCalls.length, 0);
  } finally {
    container.close();
  }
});

test("injected room harness runner replaces fake reply and ignores agent-authored mentions", async () => {
  const container = createTestContainer();
  const harnessCalls: RoomHarnessRunnerInput[] = [];

  try {
    const app = createDaemonApp(container, {
      rooms: {
        harnessRunner: (input) => {
          harnessCalls.push(input);
        },
      },
    });
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Harness Hook Room" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };
    const humanResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_hook_human",
          kind: "human",
          displayName: "Human",
        }),
      },
    );
    const firstAgentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_hook_agent_a",
          kind: "agent",
          displayName: "Agent A",
        }),
      },
    );
    const secondAgentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_hook_agent_b",
          kind: "agent",
          displayName: "Agent B",
        }),
      },
    );
    const humanBody = (await humanResponse.json()) as { ok: true; member: { id: string } };
    const firstAgentBody = (await firstAgentResponse.json()) as {
      ok: true;
      member: { id: string };
    };
    const secondAgentBody = (await secondAgentResponse.json()) as {
      ok: true;
      member: { id: string };
    };

    const humanMessageResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderMemberId: humanBody.member.id,
          kind: "instruction",
          text: "@Agent A please inspect this room.",
          mentions: [{ memberId: firstAgentBody.member.id, displayText: "@Agent A" }],
        }),
      },
    );
    const humanMessageBody = (await humanMessageResponse.json()) as {
      ok: true;
      message: { id: string };
    };

    assert.equal(humanMessageResponse.status, 201);
    assert.equal(harnessCalls.length, 1);

    const harnessCall = harnessCalls[0];
    assert.ok(harnessCall);
    assert.equal(harnessCall.room.id, createRoomBody.room.id);
    assert.equal(harnessCall.message.id, humanMessageBody.message.id);
    assert.equal(harnessCall.targetMember.id, firstAgentBody.member.id);

    const historyAfterHumanResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages?afterSequence=0&limit=10`,
    );
    const historyAfterHumanBody = (await historyAfterHumanResponse.json()) as {
      ok: true;
      messages: readonly { sequence: number; sender: { memberId?: string } }[];
    };

    assert.equal(historyAfterHumanBody.messages.length, 1);
    assert.equal(historyAfterHumanBody.messages[0]?.sender.memberId, humanBody.member.id);

    const agentMessageResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderMemberId: firstAgentBody.member.id,
          text: "@Agent B please continue",
          mentions: [{ memberId: secondAgentBody.member.id, displayText: "@Agent B" }],
        }),
      },
    );

    assert.equal(agentMessageResponse.status, 201);
    assert.equal(harnessCalls.length, 1);

    const historyAfterAgentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages?afterSequence=0&limit=10`,
    );
    const historyAfterAgentBody = (await historyAfterAgentResponse.json()) as {
      ok: true;
      messages: readonly { sequence: number; sender: { memberId?: string } }[];
    };

    assert.deepEqual(
      historyAfterAgentBody.messages.map((message) => message.sequence),
      [1, 2],
    );
    assert.deepEqual(
      historyAfterAgentBody.messages.map((message) => message.sender.memberId),
      [humanBody.member.id, firstAgentBody.member.id],
    );
  } finally {
    container.close();
  }
});

test("injected room harness runner failure does not fail message POST", async () => {
  const container = createTestContainer();
  const harnessCalls: RoomHarnessRunnerInput[] = [];
  const consoleErrors: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: Parameters<typeof console.error>) => {
    consoleErrors.push(args);
  };

  try {
    const app = createDaemonApp(container, {
      rooms: {
        harnessRunner: async (input) => {
          harnessCalls.push(input);
          throw new Error("runner failed");
        },
      },
    });
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Harness Failure Room" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };
    const humanResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_failure_human",
          kind: "human",
          displayName: "Human",
        }),
      },
    );
    const agentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_failure_agent",
          kind: "agent",
          displayName: "Agent",
        }),
      },
    );
    const humanBody = (await humanResponse.json()) as { ok: true; member: { id: string } };
    const agentBody = (await agentResponse.json()) as { ok: true; member: { id: string } };

    const messageResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderMemberId: humanBody.member.id,
          kind: "instruction",
          text: "@Agent please inspect this room.",
          mentions: [{ memberId: agentBody.member.id, displayText: "@Agent" }],
        }),
      },
    );

    assert.equal(messageResponse.status, 201);
    assert.equal(harnessCalls.length, 1);
    assert.equal(harnessCalls[0]?.targetMember.id, agentBody.member.id);

    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(consoleErrors.length, 1);

    const historyResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/messages?afterSequence=0&limit=10`,
    );
    const historyBody = (await historyResponse.json()) as {
      ok: true;
      messages: readonly { sender: { memberId?: string } }[];
    };

    assert.equal(historyBody.messages.length, 1);
    assert.equal(historyBody.messages[0]?.sender.memberId, humanBody.member.id);
  } finally {
    console.error = originalConsoleError;
    container.close();
  }
});

test("doc API lists room docs and returns doc detail with revisions and comments", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Docs Room", topic: "read docs" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };

    const memberResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_doc_owner",
          kind: "human",
          displayName: "Doc Owner",
        }),
      },
    );
    const memberBody = (await memberResponse.json()) as { ok: true; member: { id: string } };

    const contextRoomId = roomId(createRoomBody.room.id);
    const ownerMemberId = roomMemberId(memberBody.member.id);
    const now = unixMs(1_716_000_000_000);
    const doc: Doc = {
      id: docId("doc_api_read"),
      contextRoomId,
      title: "Read API Brief",
      format: "markdown",
      status: "active",
      body: "# Brief\n\nShared read context.",
      createdAt: now,
      updatedAt: now,
      createdByMemberId: ownerMemberId,
      visibility: { scope: "room" },
    };
    const revision: DocRevision = {
      id: docRevisionId("drev_api_read_1"),
      docId: doc.id,
      contextRoomId,
      revisionNumber: 1,
      format: "markdown",
      status: "committed",
      body: doc.body,
      title: doc.title,
      createdAt: unixMs(1_716_000_000_010),
      createdByMemberId: ownerMemberId,
      summary: "initial revision",
    };
    const comment: DocComment = {
      id: docCommentId("dcmt_api_read_1"),
      docId: doc.id,
      contextRoomId,
      revisionId: revision.id,
      body: "Check the opening line.",
      status: "open",
      createdAt: unixMs(1_716_000_000_020),
      updatedAt: unixMs(1_716_000_000_021),
      createdByMemberId: ownerMemberId,
      mentions: [{ kind: "member", memberId: ownerMemberId, displayText: "@Doc Owner" }],
      anchor: { revisionId: revision.id, lineStart: 1, lineEnd: 1, quote: "# Brief" },
      visibility: { scope: "room" },
    };

    assert.equal(createRoomResponse.status, 201);
    assert.equal(memberResponse.status, 201);

    container.docStore.createDoc(doc);
    const createdRevision = container.docStore.createRevision(revision);
    const createdComment = container.docStore.createComment(comment);
    const expectedDoc: Doc = { ...doc, currentRevisionId: createdRevision.id };
    const eventCountBeforeRead = container.eventStore.listAfter(0, 20).length;

    const listResponse = await app.request(`http://127.0.0.1/linka/rooms/${contextRoomId}/docs`);
    const listBody = (await listResponse.json()) as { ok: true; docs: readonly Doc[] };

    assert.equal(listResponse.status, 200);
    assert.deepEqual(listBody, { ok: true, docs: [toJsonBody(expectedDoc)] });

    const detailResponse = await app.request(`http://127.0.0.1/linka/docs/${doc.id}`);
    const detailBody = (await detailResponse.json()) as {
      ok: true;
      doc: Doc;
      revisions: readonly DocRevision[];
      comments: readonly DocComment[];
    };

    assert.equal(detailResponse.status, 200);
    assert.deepEqual(detailBody, {
      ok: true,
      doc: toJsonBody(expectedDoc),
      revisions: [toJsonBody(createdRevision)],
      comments: [toJsonBody(createdComment)],
    });
    assert.equal(container.eventStore.listAfter(0, 20).length, eventCountBeforeRead);
  } finally {
    container.close();
  }
});

test("doc API creates docs through room context", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Create Docs Room", topic: "write docs" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };

    const memberResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_doc_creator",
          kind: "human",
          displayName: "Doc Creator",
        }),
      },
    );
    const memberBody = (await memberResponse.json()) as { ok: true; member: { id: string } };
    const eventCountBeforeCreate = container.eventStore.listAfter(0, 20).length;

    const createDocResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/docs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Create API Brief",
          body: "# Brief\n\nCreated through the API.",
          createdByMemberId: memberBody.member.id,
        }),
      },
    );
    const createDocBody = (await createDocResponse.json()) as { ok: true; doc: Doc };

    assert.equal(createRoomResponse.status, 201);
    assert.equal(memberResponse.status, 201);
    assert.equal(createDocResponse.status, 201);
    assert.match(createDocBody.doc.id, /^doc_/);
    assert.equal(createDocBody.doc.contextRoomId, createRoomBody.room.id);
    assert.equal(createDocBody.doc.title, "Create API Brief");
    assert.equal(createDocBody.doc.body, "# Brief\n\nCreated through the API.");
    assert.equal(createDocBody.doc.format, "markdown");
    assert.equal(createDocBody.doc.status, "active");
    assert.equal(createDocBody.doc.createdByMemberId, memberBody.member.id);
    assert.deepEqual(createDocBody.doc.visibility, { scope: "room" });
    assert.equal(container.eventStore.listAfter(0, 20).length, eventCountBeforeCreate);

    const listResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/docs`,
    );
    const listBody = (await listResponse.json()) as { ok: true; docs: readonly Doc[] };

    assert.equal(listResponse.status, 200);
    assert.deepEqual(listBody, { ok: true, docs: [createDocBody.doc] });

    const detailResponse = await app.request(`http://127.0.0.1/linka/docs/${createDocBody.doc.id}`);
    const detailBody = (await detailResponse.json()) as {
      ok: true;
      doc: Doc;
      revisions: readonly DocRevision[];
      comments: readonly DocComment[];
    };

    assert.equal(detailResponse.status, 200);
    assert.deepEqual(detailBody, {
      ok: true,
      doc: createDocBody.doc,
      revisions: [],
      comments: [],
    });
  } finally {
    container.close();
  }
});

test("doc API rejects missing and cross-room creator members", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const firstRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "First Docs Room" }),
    });
    const secondRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Second Docs Room" }),
    });
    const firstRoomBody = (await firstRoomResponse.json()) as { ok: true; room: { id: string } };
    const secondRoomBody = (await secondRoomResponse.json()) as { ok: true; room: { id: string } };

    const memberResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${firstRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_cross_doc_creator",
          kind: "human",
          displayName: "Creator",
        }),
      },
    );
    const memberBody = (await memberResponse.json()) as { ok: true; member: { id: string } };

    const missingMemberResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${firstRoomBody.room.id}/docs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Missing Member", createdByMemberId: "rmem_missing" }),
      },
    );
    const missingMemberBody = await missingMemberResponse.json();

    assert.equal(firstRoomResponse.status, 201);
    assert.equal(secondRoomResponse.status, 201);
    assert.equal(memberResponse.status, 201);
    assert.equal(missingMemberResponse.status, 404);
    assert.deepEqual(missingMemberBody, {
      ok: false,
      error: { code: "NOT_FOUND", message: "creator member not found" },
    });

    const crossRoomMemberResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${secondRoomBody.room.id}/docs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Wrong Room Member",
          createdByMemberId: memberBody.member.id,
        }),
      },
    );
    const crossRoomMemberBody = await crossRoomMemberResponse.json();

    assert.equal(crossRoomMemberResponse.status, 404);
    assert.deepEqual(crossRoomMemberBody, {
      ok: false,
      error: { code: "NOT_FOUND", message: "creator member not found" },
    });
  } finally {
    container.close();
  }
});

test("doc API returns uniform errors for bad ids and missing docs", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const badRoomIdResponse = await app.request("http://127.0.0.1/linka/rooms/not-a-room/docs");
    const badRoomIdBody = await badRoomIdResponse.json();

    assert.equal(badRoomIdResponse.status, 400);
    assert.deepEqual(badRoomIdBody, {
      ok: false,
      error: { code: "BAD_REQUEST", message: "roomId must be a valid room id" },
    });

    const missingRoomResponse = await app.request("http://127.0.0.1/linka/rooms/room_missing/docs");
    const missingRoomBody = await missingRoomResponse.json();

    assert.equal(missingRoomResponse.status, 404);
    assert.deepEqual(missingRoomBody, {
      ok: false,
      error: { code: "NOT_FOUND", message: "room not found" },
    });

    const badDocIdResponse = await app.request("http://127.0.0.1/linka/docs/not-a-doc");
    const badDocIdBody = await badDocIdResponse.json();

    assert.equal(badDocIdResponse.status, 400);
    assert.deepEqual(badDocIdBody, {
      ok: false,
      error: { code: "BAD_REQUEST", message: "docId must be a valid doc id" },
    });

    const missingDocResponse = await app.request("http://127.0.0.1/linka/docs/doc_missing");
    const missingDocBody = await missingDocResponse.json();

    assert.equal(missingDocResponse.status, 404);
    assert.deepEqual(missingDocBody, {
      ok: false,
      error: { code: "NOT_FOUND", message: "doc not found" },
    });
  } finally {
    container.close();
  }
});

test("harness session API creates and lists room-scoped agent sessions", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Harness Session API Room" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };
    const humanResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_hsess_api_human",
          kind: "human",
          displayName: "Session Human",
        }),
      },
    );
    const agentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_hsess_api_agent",
          kind: "agent",
          displayName: "Session Agent",
        }),
      },
    );
    const humanBody = (await humanResponse.json()) as { ok: true; member: { id: string } };
    const agentBody = (await agentResponse.json()) as { ok: true; member: { id: string } };
    const policy = {
      triggerMode: "mention_only",
      maxConcurrentTurns: 1,
      allowAutonomousContinue: false,
      visibleContext: "room",
    };

    assert.equal(createRoomResponse.status, 201);
    assert.equal(humanResponse.status, 201);
    assert.equal(agentResponse.status, 201);

    const createSessionResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/harness-sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentMemberId: agentBody.member.id, policy }),
      },
    );
    const createSessionBody = (await createSessionResponse.json()) as {
      ok: true;
      session: HarnessSession;
    };

    assert.equal(createSessionResponse.status, 201);
    assert.equal(createSessionBody.ok, true);
    assert.equal(createSessionBody.session.roomId, createRoomBody.room.id);
    assert.equal(createSessionBody.session.agentMemberId, agentBody.member.id);
    assert.equal(createSessionBody.session.status, "idle");
    assert.deepEqual(createSessionBody.session.policy, policy);
    assert.equal(
      container.harnessSessionStore.listSessionsByRoom(roomId(createRoomBody.room.id)).length,
      1,
    );

    const createExistingResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/harness-sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentMemberId: agentBody.member.id,
          policy: { ...policy, triggerMode: "manual" },
        }),
      },
    );
    const createExistingBody = (await createExistingResponse.json()) as {
      ok: true;
      session: HarnessSession;
    };

    assert.equal(createExistingResponse.status, 200);
    assert.equal(createExistingBody.session.id, createSessionBody.session.id);
    assert.deepEqual(createExistingBody.session.policy, policy);

    const listResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/harness-sessions`,
    );
    const listBody = (await listResponse.json()) as {
      ok: true;
      sessions: readonly HarnessSession[];
    };

    assert.equal(listResponse.status, 200);
    assert.deepEqual(listBody, { ok: true, sessions: [createSessionBody.session] });

    const humanSessionResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/harness-sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentMemberId: humanBody.member.id }),
      },
    );
    const humanSessionBody = await humanSessionResponse.json();

    assert.equal(humanSessionResponse.status, 400);
    assert.deepEqual(humanSessionBody, {
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message: "agentMemberId must reference an agent room member",
      },
    });
  } finally {
    container.close();
  }
});

test("harness session API returns uniform errors", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const badRoomIdResponse = await app.request(
      "http://127.0.0.1/linka/rooms/not-a-room/harness-sessions",
    );
    const badRoomIdBody = await badRoomIdResponse.json();

    assert.equal(badRoomIdResponse.status, 400);
    assert.deepEqual(badRoomIdBody, {
      ok: false,
      error: { code: "BAD_REQUEST", message: "roomId must be a valid room id" },
    });

    const missingRoomResponse = await app.request(
      "http://127.0.0.1/linka/rooms/room_missing/harness-sessions",
    );
    const missingRoomBody = await missingRoomResponse.json();

    assert.equal(missingRoomResponse.status, 404);
    assert.deepEqual(missingRoomBody, {
      ok: false,
      error: { code: "NOT_FOUND", message: "room not found" },
    });

    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Harness Session Error Room" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };

    const badMemberIdResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/harness-sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentMemberId: "member_bad" }),
      },
    );
    const badMemberIdBody = await badMemberIdResponse.json();

    assert.equal(badMemberIdResponse.status, 400);
    assert.deepEqual(badMemberIdBody, {
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message: "agentMemberId must be a valid room member id",
      },
    });

    const missingMemberResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/harness-sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentMemberId: "rmem_missing" }),
      },
    );
    const missingMemberBody = await missingMemberResponse.json();

    assert.equal(missingMemberResponse.status, 404);
    assert.deepEqual(missingMemberBody, {
      ok: false,
      error: { code: "NOT_FOUND", message: "agent member not found" },
    });

    const agentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_hsess_error_agent",
          kind: "agent",
          displayName: "Error Agent",
        }),
      },
    );
    const agentBody = (await agentResponse.json()) as { ok: true; member: { id: string } };
    assert.equal(agentResponse.status, 201);

    const badPolicyResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/harness-sessions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentMemberId: agentBody.member.id,
          policy: { triggerMode: "always", maxConcurrentTurns: 1 },
        }),
      },
    );
    const badPolicyBody = await badPolicyResponse.json();

    assert.equal(badPolicyResponse.status, 400);
    assert.deepEqual(badPolicyBody, {
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message: "policy.triggerMode must be one of mention_only, watch_room, manual",
      },
    });
  } finally {
    container.close();
  }
});

test("harness run API lists room runs and run events without publishing room events", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const createRoomResponse = await app.request("http://127.0.0.1/linka/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Run API Room" }),
    });
    const createRoomBody = (await createRoomResponse.json()) as { ok: true; room: { id: string } };
    const agentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: "part_run_api_agent",
          kind: "agent",
          displayName: "Run Agent",
        }),
      },
    );
    const agentBody = (await agentResponse.json()) as { ok: true; member: { id: string } };
    const contextRoomId = roomId(createRoomBody.room.id);
    const targetMemberId = roomMemberId(agentBody.member.id);
    const now = unixMs(1_716_000_000_000);
    const runtime = {
      id: runtimeSessionId("rsess_api_run"),
      kind: "opencode" as const,
      adapterSessionId: "api-run-session",
      label: "API Run Session",
    };
    const run: HarnessRun = {
      id: harnessRunId("hrun_api_visible"),
      roomId: contextRoomId,
      targetMemberId,
      status: "succeeded",
      runtime,
      createdAt: now,
      updatedAt: unixMs(1_716_000_000_010),
      startedAt: now,
      completedAt: unixMs(1_716_000_000_010),
      summary: "run finished",
    };
    const event: RuntimeEvent = {
      id: runtimeEventId("rtevt_api_output"),
      runId: run.id,
      roomId: contextRoomId,
      targetMemberId,
      sequence: 1,
      type: "adapter.output",
      createdAt: unixMs(1_716_000_000_005),
      runtime,
      payload: { kind: "adapter_output", stream: "summary", text: "run finished" },
    };

    assert.equal(createRoomResponse.status, 201);
    assert.equal(agentResponse.status, 201);

    container.harnessRunStore.createRuntimeSession(runtime);
    const createdRun = container.harnessRunStore.createRun(run);
    const createdEvent = container.harnessRunStore.appendEvent(event);
    const eventCountBeforeRead = container.eventStore.listAfter(0, 20).length;

    const runsResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${contextRoomId}/harness-runs`,
    );
    const runsBody = (await runsResponse.json()) as { ok: true; runs: readonly HarnessRun[] };

    assert.equal(runsResponse.status, 200);
    assert.deepEqual(runsBody, { ok: true, runs: [toJsonBody(createdRun)] });

    const eventsResponse = await app.request(
      `http://127.0.0.1/linka/harness-runs/${run.id}/events`,
    );
    const eventsBody = (await eventsResponse.json()) as {
      ok: true;
      events: readonly RuntimeEvent[];
    };

    assert.equal(eventsResponse.status, 200);
    assert.deepEqual(eventsBody, { ok: true, events: [toJsonBody(createdEvent)] });
    assert.equal(container.eventStore.listAfter(0, 20).length, eventCountBeforeRead);
  } finally {
    container.close();
  }
});

test("harness run API returns uniform errors for bad ids and missing runs", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const badRoomIdResponse = await app.request(
      "http://127.0.0.1/linka/rooms/not-a-room/harness-runs",
    );
    const badRoomIdBody = await badRoomIdResponse.json();

    assert.equal(badRoomIdResponse.status, 400);
    assert.deepEqual(badRoomIdBody, {
      ok: false,
      error: { code: "BAD_REQUEST", message: "roomId must be a valid room id" },
    });

    const missingRoomResponse = await app.request(
      "http://127.0.0.1/linka/rooms/room_missing/harness-runs",
    );
    const missingRoomBody = await missingRoomResponse.json();

    assert.equal(missingRoomResponse.status, 404);
    assert.deepEqual(missingRoomBody, {
      ok: false,
      error: { code: "NOT_FOUND", message: "room not found" },
    });

    const badRunIdResponse = await app.request(
      "http://127.0.0.1/linka/harness-runs/not-a-run/events",
    );
    const badRunIdBody = await badRunIdResponse.json();

    assert.equal(badRunIdResponse.status, 400);
    assert.deepEqual(badRunIdBody, {
      ok: false,
      error: { code: "BAD_REQUEST", message: "runId must be a valid harness run id" },
    });

    const missingRunResponse = await app.request(
      "http://127.0.0.1/linka/harness-runs/hrun_missing/events",
    );
    const missingRunBody = await missingRunResponse.json();

    assert.equal(missingRunResponse.status, 404);
    assert.deepEqual(missingRunBody, {
      ok: false,
      error: { code: "NOT_FOUND", message: "harness run not found" },
    });
  } finally {
    container.close();
  }
});
