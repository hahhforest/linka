import assert from "node:assert/strict";
import { test } from "node:test";

import { createDaemonApp } from "./app.js";
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
      body: JSON.stringify({ type: "dev.message", roomId: "room_alpha", payload: { text: "hello" } }),
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


test("fake harness replies as mentioned agent without creating a system log", async () => {
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
        body: JSON.stringify({ participantId: "part_harness_human", kind: "human", displayName: "Human" }),
      },
    );
    const agentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: "part_harness_agent", kind: "agent", displayName: "Research Agent" }),
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
      messages: readonly { id: string; sequence: number; sender: { kind: string; memberId?: string }; text?: string; replyTo?: { messageId: string } }[];
    };

    assert.equal(historyBody.messages.length, 2);
    assert.equal(historyBody.messages[0]?.sender.memberId, humanBody.member.id);
    assert.equal(historyBody.messages[1]?.sender.kind, "member");
    assert.equal(historyBody.messages[1]?.sender.memberId, agentBody.member.id);
    assert.match(historyBody.messages[1]?.text ?? "", /Research Agent/);
    assert.equal(historyBody.messages[1]?.replyTo?.messageId, historyBody.messages[0]?.id);
    assert.deepEqual(
      container.eventStore.listAfter(0, 20).map((event) => event.type).slice(-2),
      ["message.created", "message.created"],
    );
  } finally {
    container.close();
  }
});

test("fake harness does not reply to agent-authored mentions", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
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
        body: JSON.stringify({ participantId: "part_agent_a", kind: "agent", displayName: "Agent A" }),
      },
    );
    const secondAgentResponse = await app.request(
      `http://127.0.0.1/linka/rooms/${createRoomBody.room.id}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: "part_agent_b", kind: "agent", displayName: "Agent B" }),
      },
    );
    const firstAgentBody = (await firstAgentResponse.json()) as { ok: true; member: { id: string } };
    const secondAgentBody = (await secondAgentResponse.json()) as { ok: true; member: { id: string } };

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
    const historyBody = (await historyResponse.json()) as { ok: true; messages: readonly unknown[] };

    assert.equal(historyBody.messages.length, 1);
  } finally {
    container.close();
  }
});
