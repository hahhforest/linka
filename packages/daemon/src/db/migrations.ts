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
  {
    version: 3,
    name: "create_docs",
    sql: `
CREATE TABLE IF NOT EXISTS docs (
  doc_id TEXT PRIMARY KEY,
  context_room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by_member_id TEXT NOT NULL REFERENCES room_members(member_id),
  current_revision_id TEXT,
  visibility_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_docs_context_room_updated
  ON docs (context_room_id, updated_at);

CREATE TABLE IF NOT EXISTS doc_revisions (
  revision_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES docs(doc_id) ON DELETE CASCADE,
  context_room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  format TEXT NOT NULL,
  status TEXT NOT NULL,
  body TEXT NOT NULL,
  title TEXT,
  created_at INTEGER NOT NULL,
  created_by_member_id TEXT NOT NULL REFERENCES room_members(member_id),
  parent_revision_id TEXT REFERENCES doc_revisions(revision_id),
  summary TEXT,
  UNIQUE (doc_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_doc_revisions_doc_revision_number
  ON doc_revisions (doc_id, revision_number);

CREATE INDEX IF NOT EXISTS idx_doc_revisions_context_room_created
  ON doc_revisions (context_room_id, created_at);

CREATE TABLE IF NOT EXISTS doc_comments (
  comment_id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL REFERENCES docs(doc_id) ON DELETE CASCADE,
  context_room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  revision_id TEXT REFERENCES doc_revisions(revision_id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by_member_id TEXT NOT NULL REFERENCES room_members(member_id),
  resolved_at INTEGER,
  resolved_by_member_id TEXT REFERENCES room_members(member_id),
  mentions_json TEXT,
  anchor_json TEXT,
  visibility_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doc_comments_doc_created
  ON doc_comments (doc_id, created_at);

CREATE INDEX IF NOT EXISTS idx_doc_comments_context_room_created
  ON doc_comments (context_room_id, created_at);

CREATE INDEX IF NOT EXISTS idx_doc_comments_revision
  ON doc_comments (revision_id);
`,
  },
  {
    version: 4,
    name: "create_harness_runtime",
    sql: `
CREATE TABLE IF NOT EXISTS runtime_sessions (
  runtime_session_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  adapter_session_id TEXT,
  label TEXT
);

CREATE INDEX IF NOT EXISTS idx_runtime_sessions_kind_adapter
  ON runtime_sessions (kind, adapter_session_id);

CREATE TABLE IF NOT EXISTS harness_runs (
  harness_run_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  target_member_id TEXT NOT NULL REFERENCES room_members(member_id),
  status TEXT NOT NULL,
  runtime_session_id TEXT REFERENCES runtime_sessions(runtime_session_id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  trigger_message_id TEXT REFERENCES room_messages(message_id) ON DELETE SET NULL,
  doc_ids_json TEXT,
  summary TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_harness_runs_room_created
  ON harness_runs (room_id, created_at);

CREATE INDEX IF NOT EXISTS idx_harness_runs_target_member_created
  ON harness_runs (target_member_id, created_at);

CREATE TABLE IF NOT EXISTS harness_run_events (
  runtime_event_id TEXT PRIMARY KEY,
  harness_run_id TEXT NOT NULL REFERENCES harness_runs(harness_run_id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  target_member_id TEXT NOT NULL REFERENCES room_members(member_id),
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  runtime_session_id TEXT REFERENCES runtime_sessions(runtime_session_id),
  payload_json TEXT NOT NULL,
  UNIQUE (harness_run_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_harness_run_events_run_sequence
  ON harness_run_events (harness_run_id, sequence);

CREATE INDEX IF NOT EXISTS idx_harness_run_events_room_created
  ON harness_run_events (room_id, created_at);
`,
  },
  {
    version: 5,
    name: "create_harness_sessions",
    sql: `
CREATE TABLE IF NOT EXISTS harness_sessions (
  harness_session_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  agent_member_id TEXT NOT NULL REFERENCES room_members(member_id),
  status TEXT NOT NULL,
  runtime_session_id TEXT REFERENCES runtime_sessions(runtime_session_id),
  policy_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_turn_id TEXT,
  last_trigger_id TEXT,
  error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_harness_sessions_room_agent
  ON harness_sessions (room_id, agent_member_id);

CREATE INDEX IF NOT EXISTS idx_harness_sessions_room_updated
  ON harness_sessions (room_id, updated_at);

CREATE TABLE IF NOT EXISTS harness_triggers (
  harness_trigger_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES harness_sessions(harness_session_id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  agent_member_id TEXT NOT NULL REFERENCES room_members(member_id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  source_message_id TEXT REFERENCES room_messages(message_id) ON DELETE SET NULL,
  claimed_turn_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_harness_triggers_session_created
  ON harness_triggers (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_harness_triggers_room_status_created
  ON harness_triggers (room_id, status, created_at);
`,
  },
  {
    version: 6,
    name: "add_room_message_v2_columns",
    sql: `
ALTER TABLE room_messages ADD COLUMN content_json TEXT;
ALTER TABLE room_messages ADD COLUMN llm_role TEXT;
ALTER TABLE room_messages ADD COLUMN thread_json TEXT;
ALTER TABLE room_messages ADD COLUMN trace_json TEXT;
ALTER TABLE room_messages ADD COLUMN export_meta_json TEXT;
`,
  },
  {
    version: 7,
    name: "create_announcements",
    sql: `
CREATE TABLE IF NOT EXISTS announcements (
  announcement_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  title TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by_member_id TEXT REFERENCES room_members(member_id),
  visibility_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_room_updated
  ON announcements (room_id, updated_at);
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
