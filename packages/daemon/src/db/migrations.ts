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
  {
    version: 2,
    name: "create_rooms",
    sql: `
CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  topic TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by_member_id TEXT,
  owner_member_id TEXT,
  default_visibility_json TEXT NOT NULL,
  notification_policy_json TEXT NOT NULL,
  permission_policy_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_members (
  member_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  joined_at INTEGER,
  last_seen_at INTEGER,
  permissions_json TEXT NOT NULL,
  notification_policy_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_members_room_id
  ON room_members (room_id);

CREATE TABLE IF NOT EXISTS room_messages (
  message_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  sender_json TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  text TEXT,
  mentions_json TEXT,
  reply_to_json TEXT,
  references_json TEXT,
  attachments_json TEXT,
  evidence_json TEXT,
  visibility_json TEXT NOT NULL,
  notification_json TEXT NOT NULL,
  UNIQUE (room_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_room_messages_room_sequence
  ON room_messages (room_id, sequence);
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
