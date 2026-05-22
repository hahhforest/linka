# Harness HIL Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the minimum Harness-layer foundation needed before Human Intervention Loop: structured message projection, session/trigger lifecycle, snapshot provenance, and persistent pending interactions.

**Architecture:** Room remains an IM aggregate. Waiting/approval/question/takeover state belongs to Harness `PendingInteraction`; Room timeline only carries human-readable request/response messages and trace/thread links. Runtime prompt formatting must read Message v2 structured content without removing the v1 `text` bridge.

**Tech Stack:** TypeScript shared contracts, daemon SQLite stores/migrations, daemon harness runner/service, Node test runner.

---

## Task 1: Message v2 Projection and Prompt Text

**Files:**

- Modify: `packages/shared/src/room.ts`
- Modify: `packages/shared/test/contracts.test.ts`
- Modify: `packages/daemon/src/harness/projection.ts`
- Modify: `packages/daemon/src/harness/projection.test.ts`
- Modify: `packages/harness/src/opencode-serve-adapter.ts`
- Modify: `packages/harness/src/opencode-serve-adapter.test.ts`
- Modify: `packages/daemon/src/harness/test-runtime-adapter.ts`

**Validation:** `pnpm --filter @linka/shared test`, `pnpm --filter @linka/harness test`, `pnpm --filter @linka/daemon test`.

## Task 2: Harness Run Provenance and Lifecycle

**Files:**

- Modify: `packages/daemon/src/harness/run-service.ts`
- Modify: `packages/daemon/src/harness/run-service.test.ts`
- Modify: `packages/daemon/src/harness/opencode-room-runner.ts`
- Modify: `packages/daemon/src/harness/opencode-room-runner.test.ts`

**Validation:** `pnpm --filter @linka/daemon test`.

## Task 3: Pending Interaction Store

**Files:**

- Modify: `packages/daemon/src/db/migrations.ts`
- Modify: `packages/daemon/src/db/migrations.test.ts`
- Create: `packages/daemon/src/store/pending-interaction-store.ts`
- Create: `packages/daemon/src/store/pending-interaction-store.test.ts`
- Modify: `packages/daemon/src/container/index.ts`
- Modify: `packages/daemon/src/container/index.test.ts`

**Validation:** `pnpm --filter @linka/daemon test`.

## Integration Gate

- `pnpm --filter @linka/shared test`
- `pnpm --filter @linka/harness test`
- `pnpm --filter @linka/daemon test`
- `pnpm smoke:daemon-ui`
