#!/usr/bin/env node
/**
 * 中文说明：真实 OpenCode Room smoke。脚本要求 daemon 已运行，
 * 会创建 Room、Doc、LinkA agent，发送显式 @LinkA 指令，
 * 然后轮询 harness run、runtime events 和 agent RoomMessage。
 */
const baseUrl = (process.env.LINKA_OPENCODE_SMOKE_URL ?? "http://127.0.0.1:4510/linka").replace(
  /\/$/,
  "",
);
const timeoutMs = Number.parseInt(process.env.LINKA_OPENCODE_SMOKE_TIMEOUT_MS ?? "120000", 10);
const pollMs = Number.parseInt(process.env.LINKA_OPENCODE_SMOKE_POLL_MS ?? "2000", 10);
const expectedReply =
  process.env.LINKA_OPENCODE_SMOKE_EXPECTED_REPLY ?? "LinkA northstar smoke ok。";

const startedAt = Date.now();
const stamp = `${startedAt}`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok || body?.ok === false) {
    throw new Error(
      `${options.method ?? "GET"} ${path} failed: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  return body;
};

const post = (path, body) => request(path, { method: "POST", body: JSON.stringify(body) });

const assertDaemon = async () => {
  try {
    await request("/health");
  } catch (error) {
    throw new Error(`daemon is not reachable at ${baseUrl}: ${error.message}`);
  }
};

const createFixture = async () => {
  const room = (
    await post("/rooms", {
      displayName: `Northstar Smoke ${stamp}`,
      topic: "真实 OpenCode + Room + Doc + run status smoke",
    })
  ).room;
  const human = (
    await post(`/rooms/${room.id}/members`, {
      participantId: `part_smoke_human_${stamp}`,
      kind: "human",
      role: "owner",
      displayName: "Smoke Human",
    })
  ).member;
  const linka = (
    await post(`/rooms/${room.id}/members`, {
      participantId: `part_smoke_linka_${stamp}`,
      kind: "agent",
      role: "admin",
      displayName: "LinkA",
    })
  ).member;
  const doc = (
    await post(`/rooms/${room.id}/docs`, {
      title: `Northstar ToDo ${stamp}`,
      body: `请确认真实 OpenCode 能读取这个 Doc，并只回复：${expectedReply}`,
      createdByMemberId: human.id,
    })
  ).doc;
  const trigger = (
    await post(`/rooms/${room.id}/messages`, {
      senderMemberId: human.id,
      kind: "instruction",
      text: `@LinkA 请读取 Room 和 Doc 上下文，并只回复：${expectedReply}`,
      mentions: [{ memberId: linka.id, displayText: "@LinkA" }],
    })
  ).message;

  return { room, human, linka, doc, trigger };
};

const readState = async ({ room, linka, trigger }) => {
  const runs = (await request(`/rooms/${room.id}/harness-runs`)).runs;
  const run = runs.at(-1);
  const events = run ? (await request(`/harness-runs/${run.id}/events`)).events : [];
  const messages = (await request(`/rooms/${room.id}/messages?afterSequence=0&limit=100`)).messages;
  const reply = messages.find(
    (message) =>
      message.sender?.kind === "member" &&
      message.sender.memberId === linka.id &&
      message.replyTo?.messageId === trigger.id,
  );

  return { run, events, reply, messages };
};

await assertDaemon();
const fixture = await createFixture();
let lastState = { run: undefined, events: [], reply: undefined, messages: [] };

while (Date.now() - startedAt < timeoutMs) {
  lastState = await readState(fixture);
  const status = lastState.run?.status;

  if (status === "failed" || status === "cancelled") {
    break;
  }

  if (status === "succeeded" && lastState.reply) {
    break;
  }

  await delay(pollMs);
}

const result = {
  roomId: fixture.room.id,
  docId: fixture.doc.id,
  triggerMessageId: fixture.trigger.id,
  run: lastState.run
    ? {
        id: lastState.run.id,
        status: lastState.run.status,
        summary: lastState.run.summary,
        error: lastState.run.error,
        completedAt: lastState.run.completedAt,
      }
    : null,
  eventTypes: lastState.events.map((event) => event.type),
  replyText: lastState.reply?.text ?? null,
};

console.log(JSON.stringify(result, null, 2));

if (!lastState.run) {
  throw new Error("no harness run was created");
}

if (lastState.run.status !== "succeeded") {
  throw new Error(
    `harness run did not succeed: ${lastState.run.status} ${lastState.run.error ?? ""}`,
  );
}

if (!lastState.reply) {
  throw new Error("no LinkA reply message was created");
}

if (!String(lastState.reply.text ?? "").includes(expectedReply.replace(/。$/u, ""))) {
  throw new Error(
    `LinkA reply did not include expected text: ${lastState.reply.text ?? "<empty>"}`,
  );
}
