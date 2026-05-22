# Real Agent Run Loop UI

## Runtime Opt-In Adapter

The daemon entrypoint keeps the normal OpenCode runtime path as the default. When no test runtime environment flag is present, `src/index.ts` still creates `createDefaultOpenCodeServeRuntimeAdapter({ cwd: process.cwd(), env: process.env })` through the entrypoint selection helper.

For daemon-backed UI and E2E runs that need deterministic agent output, the entrypoint now supports an explicit opt-in test runtime:

```bash
LINKA_RUNTIME_ADAPTER=test pnpm --filter @linka/daemon exec tsx src/index.ts
```

`LINKA_TEST_RUNTIME=1` is also accepted as a short compatibility flag. Both flags select the daemon-local `TestRuntimeAdapter`; any other value leaves the default OpenCode adapter unchanged.

The test adapter implements `RuntimeAdapter` with `capabilities.kind = "test"`. It does not create an interactive runtime session, does not support cancellation, and reports doc context support because the output is generated from the Harness projection. Each run yields deterministic `run.started`, `adapter.output`, and `run.completed` runtime events. The `adapter.output` text includes a compact room/projection/message summary so UI and E2E assertions can verify that an `@LinkA` mention reached the Harness runner and produced a Room output message without depending on OpenCode availability.

## Validation

Runtime worker validation targets:

```bash
pnpm --filter @linka/daemon typecheck
pnpm --filter @linka/daemon test
```

## Daemon-Backed UI E2E Main Path

`scripts/daemon-ui-e2e.mjs` now starts the daemon with `LINKA_RUNTIME_ADAPTER=test` and keeps the existing daemon-backed UI setup for creating a Room, Doc, and Announcement. The Harness run path no longer inserts trajectory rows directly into SQLite. The browser E2E sends a real composer message containing `@LinkA`, lets the daemon mention handler create the Harness session/run/context snapshot/runtime events/output Room message, and waits for the deterministic test runtime text in the Room timeline.

After the output message appears, the script refreshes the selected Room data through the UI, opens the Activity tab, verifies a real run item backed by runtime events, opens run detail, clicks `导出 trajectory`, and checks the metadata plus JSONL preview. This makes the primary path `WebUI @LinkA -> Harness run -> Activity/output -> trajectory export`; direct SQLite seed code is not used for the main E2E flow.

E2E worker validation targets:

```bash
node --check scripts/daemon-ui-e2e.mjs
node scripts/daemon-ui-e2e.mjs
pnpm smoke:daemon-ui
```
