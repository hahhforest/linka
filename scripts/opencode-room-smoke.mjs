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
  const sessions = (await request(`/rooms/${room.id}/harness-sessions`)).sessions;
  const messages = (await request(`/rooms/${room.id}/messages?afterSequence=0&limit=100`)).messages;
  const reply = messages.find(
    (message) =>
      message.sender?.kind === "member" &&
      message.sender.memberId === linka.id &&
      message.replyTo?.messageId === trigger.id,
  );

  return { run, events, sessions, reply, messages };
};

const waitForSucceededReply = async (fixture) => {
  let state = { run: undefined, events: [], sessions: [], reply: undefined, messages: [] };

  while (Date.now() - startedAt < timeoutMs) {
    state = await readState(fixture);
    const status = state.run?.status;

    if (status === "failed" || status === "cancelled") break;
    if (status === "succeeded" && state.reply) break;

    await delay(pollMs);
  }

  if (!state.run) throw new Error("no harness run was created");
  if (state.run.status !== "succeeded") {
    throw new Error(`harness run did not succeed: ${state.run.status} ${state.run.error ?? ""}`);
  }
  if (!state.reply) throw new Error("no LinkA reply message was created");
  if (!String(state.reply.text ?? "").includes(expectedReply.replace(/。$/u, ""))) {
    throw new Error(`LinkA reply did not include expected text: ${state.reply.text ?? "<empty>"}`);
  }

  return state;
};

await assertDaemon();
const fixture = await createFixture();
const firstState = await waitForSucceededReply(fixture);
const firstSession = firstState.sessions[0];

if (!firstSession?.runtime?.adapterSessionId) {
  throw new Error("first mention did not bind a harness runtime session");
}

const secondTrigger = (
  await post(`/rooms/${fixture.room.id}/messages`, {
    senderMemberId: fixture.human.id,
    kind: "instruction",
    text: `@LinkA 请继续使用同一个 OpenCode session，并只回复：${expectedReply}`,
    mentions: [{ memberId: fixture.linka.id, displayText: "@LinkA" }],
  })
).message;
const secondState = await waitForSucceededReply({ ...fixture, trigger: secondTrigger });
const secondSession = secondState.sessions[0];

if (secondState.sessions.length !== 1 || secondSession?.id !== firstSession.id) {
  throw new Error("mention triggers did not reuse the same harness session");
}

if (secondSession.runtime?.adapterSessionId !== firstSession.runtime.adapterSessionId) {
  throw new Error("mention triggers did not reuse the same runtime adapter session");
}

const result = {
  roomId: fixture.room.id,
  docId: fixture.doc.id,
  firstTriggerMessageId: fixture.trigger.id,
  secondTriggerMessageId: secondTrigger.id,
  harnessSessionId: secondSession.id,
  adapterSessionId: secondSession.runtime?.adapterSessionId ?? null,
  firstRun: {
    id: firstState.run.id,
    status: firstState.run.status,
    summary: firstState.run.summary,
    error: firstState.run.error,
    completedAt: firstState.run.completedAt,
  },
  secondRun: {
    id: secondState.run.id,
    status: secondState.run.status,
    summary: secondState.run.summary,
    error: secondState.run.error,
    completedAt: secondState.run.completedAt,
  },
  secondEventTypes: secondState.events.map((event) => event.type),
  secondReplyText: secondState.reply?.text ?? null,
};

console.log(JSON.stringify(result, null, 2));
