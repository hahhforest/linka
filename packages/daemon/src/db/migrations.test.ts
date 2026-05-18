import assert from "node:assert/strict";

import { openDatabase } from "./connection.js";
import { runMigrations } from "./migrations.js";

const handle = openDatabase({ databasePath: ":memory:" });

try {
  const firstRun = runMigrations(handle);
  assert.deepEqual(firstRun.appliedVersions, [1]);

  const secondRun = runMigrations(handle);
  assert.deepEqual(secondRun.appliedVersions, []);

  const migrationCount = handle.database
    .prepare("SELECT COUNT(*) AS count FROM linka_migrations")
    .get() as { count: number };
  assert.equal(migrationCount.count, 1);

  const eventTable = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'daemon_events'")
    .get() as { name: string } | undefined;
  assert.equal(eventTable?.name, "daemon_events");

  console.log("daemon db migrations: ok");
} finally {
  handle.close();
}
