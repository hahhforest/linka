import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { resolvePort } from "@linka/config";
import { harnessSessionId, roomId, roomMemberId, unixMs } from "@linka/shared";

import type { AnnouncementStore } from "../store/announcement-store.js";
import type { ContextSnapshotStore } from "../store/context-snapshot-store.js";
import type { EventStore } from "../store/event-store.js";
import type { DocStore } from "../store/doc-store.js";
import type { HarnessRunStore } from "../store/harness-run-store.js";
import type { HarnessSessionStore } from "../store/harness-session-store.js";
import type { MessageStore } from "../store/message-store.js";
import type { PendingInteractionStore } from "../store/pending-interaction-store.js";
import type { RoomStore } from "../store/room-store.js";
import { createDaemonContainer } from "./index.js";

test("createDaemonContainer normalizes explicit profile without adding a hash", () => {
  let current = new Date("2026-05-19T00:00:00.000Z");
  const container = createDaemonContainer({
    databasePath: ":memory:",
    env: {},
    git: { branch: "ignored-branch", worktreeRoot: "/repo/.worktree/ignored" },
    home: "/tmp/linka-home",
    cwd: "/tmp/linka-core-test",
    profile: "Feature/Core",
    version: "test-version",
    now: () => current,
  });

  try {
    assert.equal(container.profile, "feature-core");
    assert.doesNotMatch(container.profile, /-[0-9a-f]{8}$/);
    assert.equal(container.port, resolvePort({ env: {}, profile: "feature-core" }));
    assert.equal(container.dataDir, "/tmp/linka-home/.linka/profiles/feature-core");
    assert.equal(container.version, "test-version");
    assert.equal(container.startedAt.toISOString(), "2026-05-19T00:00:00.000Z");

    current = new Date("2026-05-19T00:00:02.500Z");
    assert.equal(container.uptimeMs(), 2500);
  } finally {
    container.close();
  }
});

test("createDaemonContainer lets LINKA_PORT override explicit profile derived port", () => {
  const container = createDaemonContainer({
    databasePath: ":memory:",
    env: { LINKA_PORT: "6201" },
    git: null,
    home: "/tmp/linka-home",
    cwd: "/tmp/linka-core-test",
    profile: "Feature/Core",
  });

  try {
    assert.equal(container.profile, "feature-core");
    assert.equal(container.port, 6201);
    assert.equal(container.dataDir, "/tmp/linka-home/.linka/profiles/feature-core");
  } finally {
    container.close();
  }
});

test("createDaemonContainer returns independent plain objects", () => {
  const first = createDaemonContainer({
    databasePath: ":memory:",
    env: {},
    git: null,
    home: "/tmp/a",
    profile: "alpha",
  });
  const second = createDaemonContainer({
    databasePath: ":memory:",
    env: {},
    git: null,
    home: "/tmp/b",
    profile: "beta",
  });

  try {
    assert.notEqual(first, second);
    assert.equal(first.profile, "alpha");
    assert.equal(second.profile, "beta");
    assert.equal(Object.getPrototypeOf(first), Object.prototype);
  } finally {
    first.close();
    second.close();
  }
});

test("createDaemonContainer opens SQLite, runs migrations, and creates stores", () => {
  const root = mkdtempSync(join(tmpdir(), "linka-daemon-container-"));
  const databasePath = join(root, "nested", "linka.sqlite");
  const container = createDaemonContainer({
    databasePath,
    env: {},
    git: null,
    home: root,
    profile: "db-test",
  });

  try {
    assert.equal(container.databasePath, databasePath);
    assert.ok(container.database);
    assert.equal(container.eventBus.getSubscriberCount(), 0);
    assert.equal(typeof container.docStore.createDoc, "function");
    assert.equal(typeof container.harnessRunStore.createRun, "function");
    assert.equal(typeof container.harnessSessionStore.createSession, "function");
    assert.equal(typeof container.pendingInteractionStore.createInteraction, "function");
    assert.deepEqual(container.docStore.listDocsByRoom(roomId("room_empty")), []);
    assert.deepEqual(container.harnessRunStore.listRunsByRoom(roomId("room_empty")), []);

    const event = container.eventStore.append({
      id: "evt_container",
      type: "container.ready",
      createdAt: 1,
      payload: { ok: true },
    });

    assert.equal(event.cursor, 1);
    assert.deepEqual(container.eventStore.listAfter(0, 10), [event]);
  } finally {
    container.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("createDaemonContainer uses provided stores without opening SQLite", () => {
  const eventStore = {
    append: (event) => ({ ...event, cursor: 1 }),
    listAfter: () => [],
  } satisfies EventStore;
  const roomStore = {
    createRoom: (room) => room,
    getRoom: () => undefined,
    listRooms: () => [],
    addMember: (member) => member,
    listMembers: () => [],
  } satisfies RoomStore;
  const messageStore = {
    appendMessage: (message) => ({ ...message, sequence: 1 }),
    listMessages: () => [],
  } satisfies MessageStore;
  const docStore = {
    createDoc: (doc) => doc,
    getDoc: () => undefined,
    listDocsByRoom: () => [],
    createRevision: (revision) => revision,
    listRevisions: () => [],
    createComment: (comment) => comment,
    listComments: () => [],
  } satisfies DocStore;
  const announcementStore = {
    createAnnouncement: (announcement) => announcement,
    updateAnnouncement: (update) => ({
      id: update.id,
      roomId: roomId("room_empty"),
      body: update.body ?? "body",
      createdAt: unixMs(0),
      updatedAt: update.updatedAt,
      visibility: { scope: "room" },
      ...(update.title === undefined ? {} : { title: update.title ?? undefined }),
    }),
    deleteAnnouncement: () => false,
    getAnnouncement: () => undefined,
    listAnnouncementsByRoom: () => [],
  } satisfies AnnouncementStore;
  const harnessRunStore = {
    createRuntimeSession: (session) => session,
    getRuntimeSession: () => undefined,
    createRun: (run) => run,
    updateRunStatus: (update) => ({
      id: update.id,
      roomId: roomId("room_empty"),
      targetMemberId: roomMemberId("rmem_empty"),
      status: update.status,
      createdAt: update.updatedAt,
      updatedAt: update.updatedAt,
      ...(update.completedAt === undefined ? {} : { completedAt: update.completedAt }),
      ...(update.runtime === undefined ? {} : { runtime: update.runtime }),
      ...(update.summary === undefined ? {} : { summary: update.summary }),
      ...(update.error === undefined ? {} : { error: update.error }),
    }),
    getRun: () => undefined,
    listRunsByRoom: () => [],
    appendEvent: (event) => event,
    listEvents: () => [],
  } satisfies HarnessRunStore;

  const harnessSessionStore = {
    createSession: (session) => session,
    getSession: () => undefined,
    getSessionByRoomAgent: () => undefined,
    listSessions: () => [],
    listSessionsByRoom: () => [],
    getOrCreateSessionByRoomAgent: (contextRoomId, agentMemberId, policy) => ({
      id: harnessSessionId("hsess_empty"),
      roomId: contextRoomId,
      agentMemberId,
      status: "idle",
      policy,
      createdAt: unixMs(0),
      updatedAt: unixMs(0),
    }),
    updateSessionStatus: (update) => ({
      id: update.id,
      roomId: roomId("room_empty"),
      agentMemberId: roomMemberId("rmem_empty"),
      status: update.status,
      policy: {
        triggerMode: "mention_only",
        maxConcurrentTurns: 1,
        allowAutonomousContinue: false,
        visibleContext: "room",
      },
      createdAt: update.updatedAt,
      updatedAt: update.updatedAt,
      ...(update.lastTurnId === undefined ? {} : { lastTurnId: update.lastTurnId ?? undefined }),
      ...(update.lastTriggerId === undefined
        ? {}
        : { lastTriggerId: update.lastTriggerId ?? undefined }),
      ...(update.error === undefined ? {} : { error: update.error ?? undefined }),
    }),
    bindRuntimeSession: (input) => ({
      id: input.id,
      roomId: roomId("room_empty"),
      agentMemberId: roomMemberId("rmem_empty"),
      status: "idle",
      runtime: input.runtime,
      policy: {
        triggerMode: "mention_only",
        maxConcurrentTurns: 1,
        allowAutonomousContinue: false,
        visibleContext: "room",
      },
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
    }),
    createTrigger: (trigger) => trigger,
    getTrigger: () => undefined,
    listTriggersBySession: () => [],
    claimTrigger: () => undefined,
    updateTriggerStatus: (update) => ({
      id: update.id,
      sessionId: harnessSessionId("hsess_empty"),
      roomId: roomId("room_empty"),
      agentMemberId: roomMemberId("rmem_empty"),
      kind: "member_mentioned",
      status: update.status,
      createdAt: update.updatedAt,
      updatedAt: update.updatedAt,
      attemptCount: update.attemptCount ?? 0,
      ...(update.claimedTurnId === undefined
        ? {}
        : { claimedTurnId: update.claimedTurnId ?? undefined }),
      ...(update.error === undefined ? {} : { error: update.error ?? undefined }),
    }),
  } satisfies HarnessSessionStore;
  const contextSnapshotStore = {
    createSnapshot: (snapshot) => snapshot,
    getSnapshot: () => undefined,
    listSnapshotsByRoom: () => [],
    listSnapshotsByAgent: () => [],
  } satisfies ContextSnapshotStore;
  const pendingInteractionStore = {
    createInteraction: (interaction) => interaction,
    getInteraction: () => undefined,
    listInteractionsByRoom: () => [],
    listOpenInteractionsBySession: () => [],
    updateInteractionStatus: (input) => ({
      id: input.id,
      sessionId: harnessSessionId("hsess_empty"),
      roomId: roomId("room_empty"),
      agentMemberId: roomMemberId("rmem_empty"),
      kind: "question",
      status: input.status,
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt,
      ...(input.responseMessageId === undefined
        ? {}
        : { responseMessageId: input.responseMessageId ?? undefined }),
      ...(input.payload === undefined ? {} : { payload: input.payload ?? undefined }),
    }),
  } satisfies PendingInteractionStore;

  const container = createDaemonContainer({
    databasePath: "",
    env: {},
    git: null,
    home: "/tmp/linka-home",
    profile: "provided-stores",
    eventStore,
    roomStore,
    messageStore,
    docStore,
    announcementStore,
    harnessRunStore,
    harnessSessionStore,
    contextSnapshotStore,
    pendingInteractionStore,
  });

  try {
    assert.equal(container.database, null);
    assert.equal(container.databasePath, null);
    assert.equal(container.eventStore, eventStore);
    assert.equal(container.roomStore, roomStore);
    assert.equal(container.messageStore, messageStore);
    assert.equal(container.docStore, docStore);
    assert.equal(container.announcementStore, announcementStore);
    assert.equal(container.harnessRunStore, harnessRunStore);
    assert.equal(container.harnessSessionStore, harnessSessionStore);
    assert.equal(container.contextSnapshotStore, contextSnapshotStore);
    assert.equal(container.pendingInteractionStore, pendingInteractionStore);
  } finally {
    container.close();
  }
});
