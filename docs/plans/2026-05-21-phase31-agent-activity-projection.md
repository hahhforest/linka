# Phase 31 Agent Activity Projection

## Projection Scope

Phase 31 adds a UI-side selector for the Activity tab. The selector is intentionally pure: it receives room members, harness sessions, harness runs, and runtime events grouped by run id, then returns sorted product Activity items. It does not create daemon persistence, SQLite tables, Room data writes, or UI component state.

The exported API is `buildAgentActivityItems(input)` from `packages/ui/src/store/agentActivity.ts`.

## Input Sources

- `members`: used to resolve `agentMemberId` into display names.
- `sessions`: used to show session readiness and session-level states such as `waiting_user`.
- `runs`: used to show queued, running, completed, failed, and cancelled work.
- `runtimeEventsByRunId`: used to attach raw status events to run items and produce run-scoped adapter output/error items.

## Activity Item Contract

Each item includes:

- `id`, `kind`, `status`, `severity`, `title`, `summary`.
- `createdAt`, `updatedAt` for deterministic sorting.
- `agentMemberId` and `agentDisplayName`.
- Optional `runId`, `sessionId`, and `triggerId` where the source data can support them.
- `rawEventCount` and `rawEvents` so UI detail views can drill into runtime evidence without changing persistence.

## Mapping Rules

- `created` and `idle` sessions become `session_ready` items.
- Other session states become `session_status` items, including `waiting_user` with warning severity.
- Harness run statuses map to `run_queued`, `run_running`, `run_completed`, `run_failed`, and `run_cancelled` items. `succeeded` is projected as UI status `completed`.
- `adapter.output` and `adapter.error` runtime events become separate run-scoped items. Output from `stderr` is warning severity; adapter errors are error severity.
- Runs are associated with sessions by matching agent member and runtime session id. If no runtime match exists, a single agent session is used; otherwise the latest compatible session before the run update time is used.

## UI Integration

`MemberRail` uses `buildAgentActivityItems({ members, sessions, runs, runtimeEventsByRunId })` as the only source for the Activity tab list. The previous hand-built session and run sections are replaced by projection items so the rail shows one sorted stream with item kind, status, severity, title, summary, update time, agent display name, and raw event count.

Clicking an activity item opens a compact detail panel in the same rail. The panel shows `runId`, `sessionId`, `triggerId`, `rawEventCount`, and raw runtime events. Runtime events are summarized with sequence, event type, payload kind, and a short payload-specific summary. Run-scoped items read the current `runtimeEventsByRunId[runId]` list for drilldown, while session-only items keep an explicit empty raw-event state.

This integration remains UI-only. It does not write task, workflow, build, worker, or projection state into Room data, and it does not change daemon, shared, config, or room store contracts.

## Quality Gate

The selector has focused pure-function tests in `packages/ui/src/store/agentActivity.test.ts`. The tests cover queued, running, waiting-user, failed, completed, cancelled, adapter output, adapter error, agent association, run/session association, raw event references, and descending sort order.
