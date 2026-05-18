# Phase 04 Fake Harness

## Scope

This phase validates that an agent participates as a Room member instead of appearing as a system log or runtime dump.

## Behavior

- `@linka/harness` exposes `createFakeHarnessReply()` as a pure deterministic fake harness.
- When a human member sends a message mentioning an agent member, the daemon reads recent room messages, asks the fake harness for a reply, appends that reply as the mentioned agent member, and publishes a second `message.created` event.
- Agent-authored messages do not trigger another fake reply, preventing loops.

## Non-goals

- No OpenCode adapter.
- No model calls.
- No planner or workflow engine.
- No shared contract changes.

## Verification

- `pnpm --filter @linka/harness test`
- `pnpm --filter @linka/daemon test`
- root `pnpm test/typecheck/build/format`
