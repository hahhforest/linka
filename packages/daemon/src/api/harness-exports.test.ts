import assert from "node:assert/strict";
import { test } from "node:test";

import {
  harnessContextSnapshotId,
  harnessRunId,
  participantId,
  roomId,
  roomMemberId,
  roomMessageId,
  runtimeEventId,
  runtimeSessionId,
  unixMs,
  type HarnessContextSnapshot,
  type HarnessRun,
  type Room,
  type RoomMember,
  type RoomMessage,
  type RuntimeEvent,
} from "@linka/shared";

import { createDaemonApp } from "../app.js";
import { createDaemonContainer, type DaemonContainer } from "../container/index.js";

const visibility = { scope: "room" as const };
const notificationPolicy = { level: "normal" as const };
const permissions = {
  canReadHistory: true,
  canPostMessage: true,
  canMentionMembers: true,
  canUploadFiles: true,
  canManageMembers: true,
};
const permissionPolicy = {
  owner: permissions,
  admin: permissions,
  member: { ...permissions, canManageMembers: false },
  guest: {
    canReadHistory: true,
    canPostMessage: false,
    canMentionMembers: false,
    canUploadFiles: false,
    canManageMembers: false,
  },
};

const createTestContainer = (): DaemonContainer =>
  createDaemonContainer({
    databasePath: ":memory:",
    env: { LINKA_PORT: "6202" },
    git: null,
    home: "/tmp/linka-home",
    cwd: "/tmp/linka-harness-export-test",
    profile: "harness-export-test",
    version: "test-version",
    now: () => new Date("2026-05-21T00:00:00.000Z"),
  });

const toJsonBody = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const makeRoom = (): Room => ({
  id: roomId("room_export"),
  displayName: "Export Room",
  topic: "trajectory export",
  createdAt: unixMs(1_716_000_000_000),
  updatedAt: unixMs(1_716_000_000_010),
  defaultVisibility: visibility,
  notificationPolicy,
  permissionPolicy,
});

const makeMember = (
  suffix: string,
  kind: RoomMember["kind"],
  role: RoomMember["role"],
): RoomMember => ({
  id: roomMemberId(`rmem_export_${suffix}`),
  roomId: roomId("room_export"),
  participantId: participantId(`part_export_${suffix}`),
  kind,
  role,
  status: "active",
  displayName: `Export ${suffix}`,
  joinedAt: unixMs(1_716_000_000_020),
  permissions,
  notificationPolicy,
});

interface ExportFixture {
  readonly room: Room;
  readonly human: RoomMember;
  readonly agent: RoomMember;
  readonly run: HarnessRun;
  readonly snapshot: HarnessContextSnapshot;
  readonly sourceMessage: RoomMessage;
  readonly outputMessage: RoomMessage;
  readonly events: readonly RuntimeEvent[];
  readonly projection: Record<string, unknown>;
}

const seedExportFixture = (container: DaemonContainer): ExportFixture => {
  const room = container.roomStore.createRoom(makeRoom());
  const human = container.roomStore.addMember(makeMember("human", "human", "owner"));
  const agent = container.roomStore.addMember(makeMember("agent", "agent", "member"));
  const runtime = {
    id: runtimeSessionId("rsess_export"),
    kind: "opencode" as const,
    adapterSessionId: "adapter-export",
    label: "Export Runtime",
  };
  const run: HarnessRun = {
    id: harnessRunId("hrun_export"),
    roomId: room.id,
    targetMemberId: agent.id,
    status: "succeeded",
    runtime,
    createdAt: unixMs(1_716_000_000_100),
    updatedAt: unixMs(1_716_000_000_180),
    startedAt: unixMs(1_716_000_000_110),
    completedAt: unixMs(1_716_000_000_180),
    summary: "exported answer",
  };
  const sourceMessage = container.messageStore.appendMessage({
    id: roomMessageId("rmsg_export_source"),
    roomId: room.id,
    sender: { kind: "member", memberId: human.id },
    kind: "text",
    createdAt: unixMs(1_716_000_000_120),
    text: "@agent summarize the brief",
    mentions: [{ memberId: agent.id, displayText: "@agent" }],
    visibility,
    notification: notificationPolicy,
  });
  const projection = {
    roomId: room.id,
    agentMemberId: agent.id,
    messages: [{ id: sourceMessage.id, text: sourceMessage.text }],
    docs: [],
  };
  const snapshot: HarnessContextSnapshot = {
    id: harnessContextSnapshotId("hctx_export_trace"),
    roomId: room.id,
    agentMemberId: agent.id,
    harnessRunId: run.id,
    createdAt: unixMs(1_716_000_000_130),
    projectionVersion: 1,
    projectionJson: JSON.stringify(projection),
    sourceMessageIds: [sourceMessage.id],
    sourceDocRevisionIds: [],
    redactionState: "raw",
  };
  const events: readonly RuntimeEvent[] = [
    {
      id: runtimeEventId("rtevt_export_started"),
      runId: run.id,
      roomId: room.id,
      targetMemberId: agent.id,
      sequence: 1,
      type: "run.started",
      createdAt: unixMs(1_716_000_000_140),
      runtime,
      payload: { kind: "run_status", status: "running", message: "started" },
    },
    {
      id: runtimeEventId("rtevt_export_output"),
      runId: run.id,
      roomId: room.id,
      targetMemberId: agent.id,
      sequence: 2,
      type: "adapter.output",
      createdAt: unixMs(1_716_000_000_150),
      runtime,
      payload: { kind: "adapter_output", stream: "summary", text: "exported answer" },
    },
  ];

  container.harnessRunStore.createRuntimeSession(runtime);
  container.harnessRunStore.createRun(run);
  container.contextSnapshotStore.createSnapshot(snapshot);
  for (const event of events) {
    container.harnessRunStore.appendEvent(event);
  }
  const outputMessage = container.messageStore.appendMessage({
    id: roomMessageId("rmsg_export_output"),
    roomId: room.id,
    sender: { kind: "member", memberId: agent.id },
    kind: "text",
    createdAt: unixMs(1_716_000_000_160),
    text: "exported answer",
    llmRole: "assistant",
    replyTo: { messageId: sourceMessage.id },
    trace: {
      harnessRunId: run.id,
      runtimeSessionId: runtime.id,
      projectionSnapshotId: snapshot.id,
      sourceMessageIds: [sourceMessage.id],
      visibleMessageIds: [sourceMessage.id],
      visibleDocRevisionIds: [],
    },
    exportMeta: {
      includeInTraining: true,
      lossMask: "assistant_only",
      evalLabels: { accepted: true, score: 1 },
      tags: ["fixture"],
      redactionState: "raw",
    },
    visibility,
    notification: notificationPolicy,
  });

  return { room, human, agent, run, snapshot, sourceMessage, outputMessage, events, projection };
};

test("GET /linka/harness-runs/:runId/export returns deterministic trajectory JSONL", async () => {
  const container = createTestContainer();

  try {
    const fixture = seedExportFixture(container);
    const app = createDaemonApp(container);
    const url = `http://127.0.0.1/linka/harness-runs/${fixture.run.id}/export?format=linka-trajectory-jsonl`;
    const firstResponse = await app.request(url);
    const firstText = await firstResponse.text();
    const secondResponse = await app.request(url);
    const secondText = await secondResponse.text();

    assert.equal(firstResponse.status, 200);
    assert.equal(
      firstResponse.headers.get("Content-Type"),
      "application/x-ndjson; charset=utf-8",
    );
    assert.equal(firstText, secondText);
    assert.equal(firstText.endsWith("\n"), true);
    assert.equal(firstText.trim().split("\n").length, 1);

    const record = JSON.parse(firstText) as {
      room: Room;
      agent: RoomMember;
      projection: Record<string, unknown>;
      messages: readonly RoomMessage[];
      runtimeEvents: readonly RuntimeEvent[];
      outputMessages: readonly RoomMessage[];
      labels: Record<string, unknown>;
      metadata: Record<string, unknown>;
    };

    assert.deepEqual(record.room, toJsonBody(fixture.room));
    assert.deepEqual(record.agent, toJsonBody(fixture.agent));
    assert.deepEqual(record.projection, fixture.projection);
    assert.deepEqual(
      record.messages.map((message) => message.id),
      [fixture.sourceMessage.id, fixture.outputMessage.id],
    );
    assert.deepEqual(
      record.runtimeEvents.map((event) => event.id),
      fixture.events.map((event) => event.id),
    );
    assert.deepEqual(
      record.outputMessages.map((message) => message.id),
      [fixture.outputMessage.id],
    );
    assert.deepEqual(record.labels, {
      runStatus: "succeeded",
      outputMessageCount: 1,
      outputMessages: [
        {
          messageId: fixture.outputMessage.id,
          includeInTraining: true,
          lossMask: "assistant_only",
          evalLabels: { accepted: true, score: 1 },
          tags: ["fixture"],
          redactionState: "raw",
        },
      ],
    });
    assert.deepEqual(record.metadata, {
      version: "linka-trajectory-jsonl.v1",
      format: "linka-trajectory-jsonl",
      runId: fixture.run.id,
      roomId: fixture.room.id,
      agentMemberId: fixture.agent.id,
      snapshotId: fixture.snapshot.id,
      projectionVersion: 1,
      redactionState: "raw",
      exportedAt: fixture.snapshot.createdAt,
    });
  } finally {
    container.close();
  }
});

test("GET /linka/harness-runs/:runId/export returns 404 for missing runs", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const response = await app.request(
      "http://127.0.0.1/linka/harness-runs/hrun_missing/export?format=linka-trajectory-jsonl",
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: { code: "NOT_FOUND", message: "harness run not found" },
    });
  } finally {
    container.close();
  }
});

test("GET /linka/harness-runs/:runId/export returns 404 when snapshot is missing", async () => {
  const container = createTestContainer();

  try {
    const room = container.roomStore.createRoom(makeRoom());
    const agent = container.roomStore.addMember(makeMember("agent", "agent", "member"));
    const run: HarnessRun = {
      id: harnessRunId("hrun_export_no_snapshot"),
      roomId: room.id,
      targetMemberId: agent.id,
      status: "succeeded",
      createdAt: unixMs(1_716_000_001_000),
      updatedAt: unixMs(1_716_000_001_010),
    };
    container.harnessRunStore.createRun(run);

    const app = createDaemonApp(container);
    const response = await app.request(
      `http://127.0.0.1/linka/harness-runs/${run.id}/export?format=linka-trajectory-jsonl`,
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: { code: "NOT_FOUND", message: "context snapshot not found" },
    });
  } finally {
    container.close();
  }
});

test("GET /linka/harness-runs/:runId/export rejects unsupported formats", async () => {
  const container = createTestContainer();

  try {
    const app = createDaemonApp(container);
    const response = await app.request(
      "http://127.0.0.1/linka/harness-runs/hrun_missing/export?format=json",
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: { code: "BAD_REQUEST", message: "format must be linka-trajectory-jsonl" },
    });
  } finally {
    container.close();
  }
});
