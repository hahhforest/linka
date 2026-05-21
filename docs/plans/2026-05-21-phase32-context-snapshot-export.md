# Phase 32 Context Snapshot Export

## Snapshot Store Scope

This lane implements the shared contract and daemon persistence boundary for immutable Harness context snapshots. It does not change the Harness runner, export API, UI, or Room data model.

A snapshot records the exact projected context that Harness can later audit or export:

- `HarnessContextSnapshotId` uses the `hctx_` branded id prefix.
- `HarnessContextSnapshot` includes room and agent ids, optional Harness session/trigger/turn/run ids, `createdAt`, `projectionVersion`, raw `projectionJson`, source message and doc revision ids, optional token estimate, and redaction state.
- `redactionState` is currently `raw` or `redacted`, matching the context snapshot boundary rather than Room message export metadata.

## SQLite Store

Migration `version 8` creates `harness_context_snapshots` with one row per immutable snapshot. Array fields are stored as JSON text columns:

- `source_message_ids_json`
- `source_doc_revision_ids_json`

The table is indexed by `(room_id, created_at)` and `(agent_member_id, created_at)` for room and agent-scoped export/audit reads. Optional Harness references are stored as nullable columns. `harness_turn_id` remains text-only because there is no turn table in the current daemon schema.

## Store API

`ContextSnapshotStore` exposes only immutable operations:

- `createSnapshot(snapshot)`
- `getSnapshot(id)`
- `listSnapshotsByRoom(roomId)`
- `listSnapshotsByAgent(agentMemberId)`

There is no update method. Duplicate snapshot ids fail through the SQLite primary key. Reads validate JSON fields and branded ids so corrupted rows fail loudly during audit/export development.

## Harness Trace Wiring

`startHarnessRun` now persists one immutable context snapshot after building the Harness projection and creating the run, but before calling `adapter.startRun`. The snapshot stores `JSON.stringify(projection)` as `projectionJson`, uses `projection.messages[].id` as `sourceMessageIds`, and uses each projected doc `currentRevisionId` as `sourceDocRevisionIds` when present. It links `roomId`, `agentMemberId`, and `harnessRunId`; session, trigger, and turn ids remain empty at this layer because the current run-service dispatch contract does not receive them.

The OpenCode room runner uses the returned snapshot when converting adapter output into a Room message. The output message trace now carries `projectionSnapshotId`, `harnessRunId`, `runtimeSessionId` when available, `sourceMessageIds`, `visibleMessageIds`, and `visibleDocRevisionIds`. Because the runner owns the room Harness session and trigger, it also writes `harnessSessionId` and `harnessTriggerId` into the message trace. Snapshot payloads are stored only through `contextSnapshotStore`; no snapshot JSON is copied into Room data.

## Trajectory JSONL Export

The daemon exposes the current deterministic export boundary at:

`GET /linka/harness-runs/:runId/export?format=linka-trajectory-jsonl`

The response is `application/x-ndjson; charset=utf-8` and currently emits one JSONL record per run. The original Phase 32 plan references turn-level export, but the daemon does not yet have a `harness_turns` table. Until that schema exists, a Harness run is the equivalent stable boundary for a trajectory record.

Snapshot selection is strict to keep training data auditable:

- first, use the run output message trace `projectionSnapshotId` when a message is linked to the target `harnessRunId`;
- otherwise, scan `contextSnapshotStore.listSnapshotsByRoom(roomId)` for a snapshot whose `harnessRunId` matches the run;
- if no matching snapshot exists, return `404 NOT_FOUND` instead of exporting with `projection: null`.

Each record includes the room, target agent member, parsed `projection` from `snapshot.projectionJson`, deterministic room messages, room documents with revisions and comments, runtime events, output messages linked by `trace.harnessRunId` or `trace.projectionSnapshotId`, labels derived from output message `exportMeta`, and metadata. Metadata includes `version`, `format`, `runId`, `roomId`, `agentMemberId`, `snapshotId`, `projectionVersion`, `redactionState`, and deterministic `exportedAt` set to the snapshot creation timestamp rather than wall-clock export time.

## Validation

Focused daemon tests cover:

- migration table, index, and column creation for `harness_context_snapshots`;
- no-migrations store construction error;
- create/get/list round trip, including optional Harness references;
- duplicate id failure;
- invalid JSON and invalid id/redaction-state rows.
- run-level trajectory JSONL export, deterministic repeat output, missing run, missing snapshot, and unsupported format handling.

The next Harness/Export lanes can write snapshots before runtime dispatch and later bind exported trajectories to `trace.projectionSnapshotId` without storing snapshot data in Room data.
