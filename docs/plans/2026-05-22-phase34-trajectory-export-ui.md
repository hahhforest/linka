# Phase 34 Trajectory Export UI

## Service Scope

Phase 34 adds the UI service boundary for daemon-backed run-level trajectory export. This lane does not change UI components, daemon routes, shared contracts, config, Room data, or runtime persistence.

The exported service API is `exportHarnessRunTrajectory(runId, options)` from `packages/ui/src/services/harnessRunsService.ts`.

## Service API

`exportHarnessRunTrajectory` calls:

```text
GET /linka/harness-runs/:runId/export?format=linka-trajectory-jsonl
```

The daemon response is NDJSON text, so the service intentionally does not use `requestJson`. It keeps the same base URL behavior as the JSON client:

- `options.baseUrl` overrides the daemon origin and is normalized without a trailing slash;
- `VITE_LINKA_DAEMON_URL` remains the default when no explicit base URL is supplied;
- `options.fetchImpl` supports tests and alternate fetch implementations;
- `options.signal` is forwarded to the fetch request.

The method returns `{ text, record }`, where `text` is the raw JSONL response and `record` is parsed through `parseTrajectoryExport(text)`. The parser currently expects exactly one non-empty JSONL record because the daemon run-level export emits one trajectory record per Harness run.

## Export Record Shape

The UI service models only the fields needed by follow-up UI preview work:

- `metadata.version`, `metadata.format`, `metadata.runId`, and `metadata.snapshotId` are typed explicitly;
- optional metadata fields cover room, agent, projection version, redaction state, and exported timestamp;
- `messages`, `runtimeEvents`, and `outputMessages` are typed as readonly unknown arrays;
- `labels` remains unknown so daemon-side label details can evolve without forcing UI service churn.

## Activity Detail UI

The Activity tab now exposes run-level trajectory export from the selected run detail card. When an activity has a `runId`, the detail view shows a `导出 trajectory` action. The action is disabled when the selected item has no `runId`, while the UI explicitly explains that fallback data cannot export and requires a daemon-backed session.

The export flow calls `exportHarnessRunTrajectory(runId)` directly from the UI service and keeps all export state local to `MemberRail` component state:

- `idle`, `loading`, `success`, and `error` render as visible export status;
- success renders metadata for `runId`, `snapshotId`, `version`, and `format`;
- success renders a truncated JSONL preview and a `复制 raw` action that copies the unmodified response text;
- error renders the daemon or parsing failure message without mutating Room data.

The UI intentionally does not write the JSONL payload, preview, copy state, or export errors back into Room data. The daemon API shape remains unchanged; T3 verifier can extend E2E coverage against the same run detail surface.

## Verifier E2E Coverage

`scripts/daemon-ui-e2e.mjs` now covers the daemon-backed trajectory export path from the browser UI. The script still starts and cleans up its own daemon, Vite UI, headless Chrome profile, and temp `LINKA_HOME`; strict daemon evidence remains required through `/linka/health · online`, `daemon`, and `sse open` assertions.

The E2E prepares run data with a deterministic seed step after creating the real Room through the UI:

- reads the created Room and its Alice/LinkA members through daemon APIs;
- writes a minimal harness run, runtime session, context snapshot, three runtime events, a source message, and a traced assistant output message into the temp profile SQLite database using the daemon package's `better-sqlite3` dependency;
- preflights the daemon export endpoint once to verify the seeded run is readable and contains `linka-trajectory-jsonl.v1` plus the expected snapshot id;
- reloads the WebUI and re-selects the seeded Room so Activity data is loaded through the normal UI services.

The browser path then verifies:

- Activity tab contains at least one seeded activity item;
- clicking `LinkA run completed` opens `Run detail` with the seeded `runId`;
- clicking `导出 trajectory` reaches success state;
- visible metadata contains `runId`, `snapshotId`, `version`, and `format`;
- `JSONL preview` contains `linka-trajectory-jsonl.v1` or the seeded run id.

## Quality Gate

Focused service tests in `packages/ui/src/services/harnessRunsService.test.ts` cover:

- the export URL and `GET` method;
- text/NDJSON parsing independent of JSON response helpers;
- `fetchImpl`, `baseUrl`, and `signal` propagation;
- non-OK daemon responses using the same error text pattern as `requestJson`.

T3 verifier commands:

- `node scripts/daemon-ui-e2e.mjs` passed.
- `pnpm smoke:daemon-ui` passed.

No UI component changes were required by T3, so `pnpm --filter @linka/ui typecheck/test/build` was not rerun in this verifier lane.
