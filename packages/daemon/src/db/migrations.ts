import type { DatabaseHandle } from "./connection.js";

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export interface MigrationResult {
  readonly appliedVersions: readonly number[];
}

interface MigrationRow {
  readonly version: number;
}

const createMigrationTableSql = `
CREATE TABLE IF NOT EXISTS linka_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
`;

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "create_daemon_events",
    sql: `
CREATE TABLE IF NOT EXISTS daemon_events (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  room_id TEXT,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  inserted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daemon_events_room_cursor
  ON daemon_events (room_id, cursor);
`,
  },
];

export const runMigrations = (handle: DatabaseHandle): MigrationResult => {
  const { database } = handle;
  database.exec(createMigrationTableSql);

  const appliedRows = database
    .prepare("SELECT version FROM linka_migrations ORDER BY version")
    .all() as MigrationRow[];
  const applied = new Set(appliedRows.map((row) => row.version));
  const appliedVersions: number[] = [];

  const applyPending = database.transaction(() => {
    const insertMigration = database.prepare(
      "INSERT INTO linka_migrations (version, name, applied_at) VALUES (?, ?, ?)",
    );

    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        continue;
      }

      database.exec(migration.sql);
      insertMigration.run(migration.version, migration.name, Date.now());
      appliedVersions.push(migration.version);
    }
  });

  applyPending();
  return { appliedVersions };
};
