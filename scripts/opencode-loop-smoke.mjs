#!/usr/bin/env node
/**
 * Room-scoped OpenCode loop smoke. Requires daemon + OpenCode serve runner.
 * Verifies same Room/agent reuses the harness/runtime session, another Room gets isolation,
 * and the second turn can recover the first turn's agreed phrase.
 */
const baseUrl = (
  process.env.LINKA_OPENCODE_LOOP_SMOKE_URL ??
  process.env.LINKA_OPENCODE_SMOKE_URL ??
  "http://127.0.0.1:4510/linka"
).replace(/\/$/, "");
const timeoutMs = Number.parseInt(
  process.env.LINKA_OPENCODE_LOOP_SMOKE_TIMEOUT_MS ??
    process.env.LINKA_OPENCODE_SMOKE_TIMEOUT_MS ??
    "180000",
  10,
);
const pollMs = Number.parseInt(
  process.env.LINKA_OPENCODE_LOOP_SMOKE_POLL_MS ??
    process.env.LINKA_OPENCODE_SMOKE_POLL_MS ??
    "2000",
  10,
);

const startedAt = Date.now();
const stamp = `${startedAt}`;
const roomAPhrase = `linka-loop-phrase-${stamp}`;
const roomAFirstReply = `loop turn one ready ${stamp}`;
const roomBReply = `loop room b isolated ${stamp}`;

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

const createFixture = async (label) => {
  const room = (
    await post("/rooms", {
      displayName: `Loop Smoke ${label} ${stamp}`,
      topic: "room-scoped harness session loop smoke",
    })
  ).room;
  const human = (
    await post(`/rooms/${room.id}/members`, {
      participantId: `part_loop_${label}_human_${stamp}`,
      kind: "human",
      role: "owner",
      displayName: `Loop Human ${label}`,
    })
  ).member;
  const linka = (
    await post(`/rooms/${room.id}/members`, {
      participantId: `part_loop_${label}_linka_${stamp}`,
      kind: "agent",
      role: "admin",
      displayName: "LinkA",
    })
  ).member;

  return { room, human, linka };
};

const triggerLinkA = async (fixture, text) =>
  (
    await post(`/rooms/${fixture.room.id}/messages`, {
      senderMemberId: fixture.human.id,
      kind: "instruction",
      text,
      mentions: [{ memberId: fixture.linka.id, displayText: "@LinkA" }],
    })
  ).message;

const readState = async ({ room, linka }, trigger) => {
  const runs = (await request(`/rooms/${room.id}/harness-runs`)).runs;
  const run = runs.find((candidate) => candidate.triggerMessageId === trigger.id) ?? runs.at(-1);
  const events = run ? (await request(`/harness-runs/${run.id}/events`)).events : [];
  const sessions = (await request(`/rooms/${room.id}/harness-sessions`)).sessions;
  const messages = (await request(`/rooms/${room.id}/messages?afterSequence=0&limit=200`)).messages;
  const reply = messages.find(
    (message) =>
      message.sender?.kind === "member" &&
      message.sender.memberId === linka.id &&
      message.replyTo?.messageId === trigger.id,
  );

  return { run, events, sessions, reply, messages };
};

const waitForSucceededReply = async (fixture, trigger, expectedText) => {
  let state = { run: undefined, events: [], sessions: [], reply: undefined, messages: [] };
  const waitStartedAt = Date.now();

  while (Date.now() - waitStartedAt < timeoutMs) {
    state = await readState(fixture, trigger);
    const status = state.run?.status;

    if (status === "failed" || status === "cancelled") break;
    if (status === "succeeded" && state.reply) break;

    await delay(pollMs);
  }

  if (!state.run) throw new Error(`no harness run was created for trigger ${trigger.id}`);
  if (state.run.status !== "succeeded") {
    throw new Error(`harness run did not succeed: ${state.run.status} ${state.run.error ?? ""}`);
  }
  if (!state.reply) throw new Error(`no LinkA reply message was created for trigger ${trigger.id}`);
  if (!String(state.reply.text ?? "").includes(expectedText)) {
    throw new Error(
      `LinkA reply did not include expected text ${JSON.stringify(expectedText)}: ${
        state.reply.text ?? "<empty>"
      }`,
    );
  }

  return state;
};

const assertRuntimeBound = (session, label) => {
  if (!session?.runtime?.adapterSessionId) {
    throw new Error(`${label} did not bind a harness runtime session`);
  }
};

await assertDaemon();

const roomA = await createFixture("A");
const firstTrigger = await triggerLinkA(
  roomA,
  `@LinkA 请在当前 Room 里记住约定短语「${roomAPhrase}」。本轮只回复：${roomAFirstReply}`,
);
const firstState = await waitForSucceededReply(roomA, firstTrigger, roomAFirstReply);
const firstSession = firstState.sessions[0];
assertRuntimeBound(firstSession, "Room A first turn");

const secondTrigger = await triggerLinkA(
  roomA,
  "@LinkA 请复述上一轮让你记住的约定短语，只回复该短语，不要解释。",
);
const secondState = await waitForSucceededReply(roomA, secondTrigger, roomAPhrase);
const secondSession = secondState.sessions[0];
assertRuntimeBound(secondSession, "Room A second turn");

if (secondState.sessions.length !== 1 || secondSession.id !== firstSession.id) {
  throw new Error("Room A turns did not reuse the same harness session");
}

if (secondSession.runtime.adapterSessionId !== firstSession.runtime.adapterSessionId) {
  throw new Error("Room A turns did not reuse the same runtime adapter session");
}

const roomB = await createFixture("B");
const roomBTrigger = await triggerLinkA(
  roomB,
  `@LinkA 这是另一个 Room 的隔离检查。请只回复：${roomBReply}`,
);
const roomBState = await waitForSucceededReply(roomB, roomBTrigger, roomBReply);
const roomBSession = roomBState.sessions[0];
assertRuntimeBound(roomBSession, "Room B turn");

if (roomBSession.id === secondSession.id) {
  throw new Error("Room B reused Room A harness session");
}

if (roomBSession.runtime.adapterSessionId === secondSession.runtime.adapterSessionId) {
  throw new Error("Room B reused Room A runtime adapter session");
}

const result = {
  roomA: {
    roomId: roomA.room.id,
    firstTriggerMessageId: firstTrigger.id,
    secondTriggerMessageId: secondTrigger.id,
    harnessSessionId: secondSession.id,
    adapterSessionId: secondSession.runtime.adapterSessionId,
    firstRunId: firstState.run.id,
    secondRunId: secondState.run.id,
    secondReplyText: secondState.reply.text ?? null,
  },
  roomB: {
    roomId: roomB.room.id,
    triggerMessageId: roomBTrigger.id,
    harnessSessionId: roomBSession.id,
    adapterSessionId: roomBSession.runtime.adapterSessionId,
    runId: roomBState.run.id,
    replyText: roomBState.reply.text ?? null,
  },
};

console.log(JSON.stringify(result, null, 2));
