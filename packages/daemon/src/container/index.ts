import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { getDataDir, getProfile, resolvePort } from "@linka/config";

import { openDatabase, type DatabaseHandle } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { createEventBus, type EventBus } from "../event-bus/index.js";
import { createDocStore, type DocStore } from "../store/doc-store.js";
import { createEventStore, type EventStore } from "../store/event-store.js";
import { createHarnessRunStore, type HarnessRunStore } from "../store/harness-run-store.js";
import { createMessageStore, type MessageStore } from "../store/message-store.js";
import { createRoomStore, type RoomStore } from "../store/room-store.js";

export const DAEMON_VERSION = "0.0.0";

export type ConfigEnv = Record<string, string | undefined>;

export interface GitInfo {
  branch?: string | null;
  worktreeRoot?: string | null;
}

export interface DaemonContainerOptions {
  env?: ConfigEnv;
  cwd?: string;
  git?: GitInfo | (() => GitInfo | null | undefined) | null;
  home?: string;
  profile?: string;
  version?: string;
  now?: () => Date;
  databasePath?: string;
  database?: DatabaseHandle;
  eventStore?: EventStore;
  eventBus?: EventBus;
  roomStore?: RoomStore;
  messageStore?: MessageStore;
  docStore?: DocStore;
  harnessRunStore?: HarnessRunStore;
}

export interface DaemonContainer {
  readonly profile: string;
  readonly port: number;
  readonly dataDir: string;
  readonly version: string;
  readonly startedAt: Date;
  readonly databasePath: string | null;
  readonly database: DatabaseHandle | null;
  readonly eventStore: EventStore;
  readonly eventBus: EventBus;
  readonly roomStore: RoomStore;
  readonly messageStore: MessageStore;
  readonly docStore: DocStore;
  readonly harnessRunStore: HarnessRunStore;
  readonly uptimeMs: () => number;
  readonly close: () => void;
}

export function createDaemonContainer(options: DaemonContainerOptions = {}): DaemonContainer {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const profile = resolveContainerProfile(options);
  const port = resolvePort({ ...options, profile });
  const dataDir = getDataDir({ ...options, profile });
  const databasePath = options.databasePath ?? join(dataDir, "linka.sqlite");
  const allStoresProvided =
    options.eventStore !== undefined &&
    options.roomStore !== undefined &&
    options.messageStore !== undefined &&
    options.docStore !== undefined &&
    options.harnessRunStore !== undefined;
  const ownsDatabase = options.database === undefined && !allStoresProvided;
  const database = options.database ?? (allStoresProvided ? null : openContainerDatabase(databasePath));
  const eventStore = options.eventStore ?? createMigratedEventStore(database);
  const eventBus = options.eventBus ?? createEventBus();
  const roomStore = options.roomStore ?? createMigratedRoomStore(database);
  const messageStore = options.messageStore ?? createMigratedMessageStore(database);
  const docStore = options.docStore ?? createMigratedDocStore(database);
  const harnessRunStore = options.harnessRunStore ?? createMigratedHarnessRunStore(database);

  return {
    profile,
    port,
    dataDir,
    version: options.version ?? DAEMON_VERSION,
    startedAt,
    databasePath: database?.databasePath ?? null,
    database,
    eventStore,
    eventBus,
    roomStore,
    messageStore,
    docStore,
    harnessRunStore,
    uptimeMs: () => Math.max(0, now().getTime() - startedAt.getTime()),
    close: () => {
      if (ownsDatabase) {
        database?.close();
      }
    },
  };
}

function resolveContainerProfile(options: DaemonContainerOptions): string {
  if (options.profile === undefined) {
    return getProfile(options);
  }

  return getProfile({ ...options, env: { ...options.env, LINKA_PROFILE: options.profile } });
}

function openContainerDatabase(databasePath: string): DatabaseHandle {
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  return openDatabase({ databasePath });
}

function createMigratedEventStore(database: DatabaseHandle | null): EventStore {
  if (!database) {
    throw new Error("database is required when eventStore is not provided");
  }

  runMigrations(database);
  return createEventStore(database);
}

function createMigratedRoomStore(database: DatabaseHandle | null): RoomStore {
  if (!database) {
    throw new Error("database is required when roomStore is not provided");
  }

  runMigrations(database);
  return createRoomStore(database);
}

function createMigratedMessageStore(database: DatabaseHandle | null): MessageStore {
  if (!database) {
    throw new Error("database is required when messageStore is not provided");
  }

  runMigrations(database);
  return createMessageStore(database);
}

function createMigratedDocStore(database: DatabaseHandle | null): DocStore {
  if (!database) {
    throw new Error("database is required when docStore is not provided");
  }

  runMigrations(database);
  return createDocStore(database);
}

function createMigratedHarnessRunStore(database: DatabaseHandle | null): HarnessRunStore {
  if (!database) {
    throw new Error("database is required when harnessRunStore is not provided");
  }

  runMigrations(database);
  return createHarnessRunStore(database);
}
