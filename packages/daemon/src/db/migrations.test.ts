import assert from "node:assert/strict";

import { openDatabase, type DatabaseHandle } from "./connection.js";
import { runMigrations } from "./migrations.js";

interface SchemaNameRow {
  readonly name: string;
}

interface TableColumnRow {
  readonly name: string;
}

const hasTable = (handle: DatabaseHandle, tableName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as SchemaNameRow | undefined;

  return row?.name === tableName;
};

const hasIndex = (handle: DatabaseHandle, indexName: string): boolean => {
  const row = handle.database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?")
    .get(indexName) as SchemaNameRow | undefined;

  return row?.name === indexName;
};

const hasColumn = (handle: DatabaseHandle, tableName: string, columnName: string): boolean => {
  const rows = handle.database.prepare(`PRAGMA table_info(${tableName})`).all() as TableColumnRow[];
  return rows.some((row) => row.name === columnName);
};

const assertColumns = (
  handle: DatabaseHandle,
  tableName: string,
  columns: readonly string[],
): void => {
  for (const column of columns) {
    assert.equal(hasColumn(handle, tableName, column), true, `${tableName}.${column}`);
  }
};

const handle = openDatabase({ databasePath: ":memory:" });

try {
  const firstRun = runMigrations(handle);
  assert.deepEqual(firstRun.appliedVersions, [1, 2, 3, 4, 5, 6, 7, 8]);

  const secondRun = runMigrations(handle);
  assert.deepEqual(secondRun.appliedVersions, []);

  const migrationCount = handle.database
    .prepare("SELECT COUNT(*) AS count FROM linka_migrations")
    .get() as { count: number };
  assert.equal(migrationCount.count, 8);

  for (const tableName of [
    "daemon_events",
    "rooms",
    "room_members",
    "room_messages",
    "docs",
    "doc_revisions",
    "doc_comments",
    "runtime_sessions",
    "harness_runs",
    "harness_run_events",
    "harness_sessions",
    "harness_triggers",
    "announcements",
    "harness_context_snapshots",
  ]) {
    assert.equal(hasTable(handle, tableName), true, tableName);
  }

  for (const indexName of [
    "idx_daemon_events_room_cursor",
    "idx_room_members_room_id",
    "idx_room_messages_room_sequence",
    "idx_docs_context_room_updated",
    "idx_doc_revisions_doc_revision_number",
    "idx_doc_revisions_context_room_created",
    "idx_doc_comments_doc_created",
    "idx_doc_comments_context_room_created",
    "idx_doc_comments_revision",
    "idx_runtime_sessions_kind_adapter",
    "idx_harness_runs_room_created",
    "idx_harness_runs_target_member_created",
    "idx_harness_run_events_run_sequence",
    "idx_harness_run_events_room_created",
    "idx_harness_sessions_room_agent",
    "idx_harness_sessions_room_updated",
    "idx_harness_triggers_session_created",
    "idx_harness_triggers_room_status_created",
    "idx_announcements_room_updated",
    "idx_harness_context_snapshots_room_created",
    "idx_harness_context_snapshots_agent_created",
  ]) {
    assert.equal(hasIndex(handle, indexName), true, indexName);
  }

  assertColumns(handle, "room_messages", [
    "message_id",
    "room_id",
    "sequence",
    "sender_json",
    "kind",
    "created_at",
    "edited_at",
    "text",
    "content_json",
    "llm_role",
    "thread_json",
    "mentions_json",
    "reply_to_json",
    "references_json",
    "attachments_json",
    "evidence_json",
    "trace_json",
    "export_meta_json",
    "visibility_json",
    "notification_json",
  ]);

  assertColumns(handle, "docs", [
    "doc_id",
    "context_room_id",
    "title",
    "format",
    "status",
    "body",
    "created_at",
    "updated_at",
    "created_by_member_id",
    "current_revision_id",
    "visibility_json",
  ]);

  assertColumns(handle, "doc_revisions", [
    "revision_id",
    "doc_id",
    "context_room_id",
    "revision_number",
    "format",
    "status",
    "body",
    "title",
    "created_at",
    "created_by_member_id",
    "parent_revision_id",
    "summary",
  ]);

  assertColumns(handle, "doc_comments", [
    "comment_id",
    "doc_id",
    "context_room_id",
    "revision_id",
    "body",
    "status",
    "created_at",
    "updated_at",
    "created_by_member_id",
    "resolved_at",
    "resolved_by_member_id",
    "mentions_json",
    "anchor_json",
    "visibility_json",
  ]);

  assertColumns(handle, "runtime_sessions", [
    "runtime_session_id",
    "kind",
    "adapter_session_id",
    "label",
  ]);

  assertColumns(handle, "harness_runs", [
    "harness_run_id",
    "room_id",
    "target_member_id",
    "status",
    "runtime_session_id",
    "created_at",
    "updated_at",
    "started_at",
    "completed_at",
    "trigger_message_id",
    "doc_ids_json",
    "summary",
    "error",
  ]);

  assertColumns(handle, "harness_run_events", [
    "runtime_event_id",
    "harness_run_id",
    "room_id",
    "target_member_id",
    "sequence",
    "type",
    "created_at",
    "runtime_session_id",
    "payload_json",
  ]);

  assertColumns(handle, "harness_sessions", [
    "harness_session_id",
    "room_id",
    "agent_member_id",
    "status",
    "runtime_session_id",
    "policy_json",
    "created_at",
    "updated_at",
    "last_turn_id",
    "last_trigger_id",
    "error",
  ]);

  assertColumns(handle, "harness_triggers", [
    "harness_trigger_id",
    "session_id",
    "room_id",
    "agent_member_id",
    "kind",
    "status",
    "created_at",
    "updated_at",
    "source_message_id",
    "claimed_turn_id",
    "attempt_count",
    "payload_json",
    "error",
  ]);

  assertColumns(handle, "announcements", [
    "announcement_id",
    "room_id",
    "title",
    "body",
    "created_at",
    "updated_at",
    "created_by_member_id",
    "visibility_json",
  ]);

  assertColumns(handle, "harness_context_snapshots", [
    "harness_context_snapshot_id",
    "room_id",
    "agent_member_id",
    "harness_session_id",
    "harness_trigger_id",
    "harness_turn_id",
    "harness_run_id",
    "created_at",
    "projection_version",
    "projection_json",
    "source_message_ids_json",
    "source_doc_revision_ids_json",
    "token_estimate",
    "redaction_state",
  ]);

  console.log("daemon db migrations: ok");
} finally {
  handle.close();
}
