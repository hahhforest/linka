import assert from "node:assert/strict";

import { openDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import {
  DaemonDatabaseError,
  createEventStore,
  type DaemonEventEnvelope,
} from "./event-store.js";

const withoutMigrations = openDatabase({ databasePath: ":memory:" });
try {
  assert.throws(
    () => createEventStore(withoutMigrations),
    (error) =>
      error instanceof DaemonDatabaseError &&
      error.message === "runMigrations must be called before createEventStore",
  );
} finally {
  withoutMigrations.close();
}

const handle = openDatabase({ databasePath: ":memory:" });

try {
  runMigrations(handle);
  const store = createEventStore(handle);

  const first: DaemonEventEnvelope = {
    id: "evt_alpha",
    roomId: "room_alpha",
    type: "test.created",
    createdAt: 1_716_000_000_000,
    payload: { text: "hello" },
  };
  const second: DaemonEventEnvelope = {
    id: "evt_beta",
    roomId: "room_alpha",
    type: "test.updated",
    createdAt: 1_716_000_000_001,
    payload: { edited: true },
  };

  const persistedFirst = store.append(first);
  const persistedSecond = store.append(second);

  assert.equal(persistedFirst.cursor, 1);
  assert.equal(persistedSecond.cursor, 2);
  assert.equal(persistedFirst.id, first.id);
  assert.deepEqual(persistedFirst.payload, first.payload);

  assert.deepEqual(
    store.listAfter(0, 10).map((event) => event.id),
    ["evt_alpha", "evt_beta"],
  );
  assert.deepEqual(
    store.listAfter(persistedFirst.cursor, 10).map((event) => event.id),
    ["evt_beta"],
  );
  assert.deepEqual(
    store.listAfter(0, 1).map((event) => event.id),
    ["evt_alpha"],
  );

  const circularPayload: Record<string, unknown> = {};
  circularPayload.self = circularPayload;

  assert.throws(() => store.listAfter(-1, 10), /cursor/);
  assert.throws(() => store.listAfter(0, 0), /limit/);
  assert.throws(() => store.append({ ...first, id: "evt_payload", payload: undefined }), /payload/);
  assert.throws(
    () => store.append({ ...first, id: "evt_circular", payload: circularPayload }),
    /event payload must be JSON-serializable/,
  );
  assert.throws(() => store.append({ ...first, id: "" }), /event id/);
  assert.throws(() => store.append({ ...first, type: " " }), /event type/);
  assert.throws(() => store.append({ ...first, createdAt: -1 }), /createdAt/);
  assert.throws(
    () => store.append({ ...first, createdAt: Number.MAX_SAFE_INTEGER + 1 }),
    /createdAt/,
  );

  console.log("daemon event store: ok");
} finally {
  handle.close();
}
