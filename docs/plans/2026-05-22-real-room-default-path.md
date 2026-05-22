# Real Room Default Path Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the WebUI default path represent real daemon-backed Rooms, with no automatic demo seed and no sticky fallback state before Human Intervention Loop work.

**Architecture:** `RoomDataSource` becomes an explicit daemon state model: `checking`, `api`, `offline`, and reserved `demo`. Offline errors leave the workspace empty instead of injecting `demoRoom`; an empty daemon remains `api` with no active Room so users can create a real Room. Composer failures report mutation errors and do not mutate global source or append fake timeline messages.

**Tech Stack:** React + Zustand UI store, existing LinkA daemon HTTP services, existing Node/tsx UI tests, daemon-backed smoke script.

---

## Design Decisions

- Keep `demoRoom` as a test/dev fixture, but remove it from product default initialization and no-room fallback rendering.
- Do not add a visible demo action in this lane; that can be a later explicit development affordance.
- Keep Room creation modal as the main empty-daemon action; source `api` means daemon is reachable even if there are no rooms.
- Use compact operational empty states in the existing UI style: no landing page, no marketing copy.
- Do not touch Harness/HIL lifecycle code in this lane.

## Task 1: Room Store Source Model

**Files:**

- Modify: `packages/ui/src/store/roomStore.ts`
- Modify: `packages/ui/src/store/roomStore.test.ts`
- Modify: `packages/ui/src/store/composerMentions.test.ts`

**Steps:**

1. Change `RoomDataSource` to include `offline` and `demo`, and stop using `fallback` as a product default source.
2. Remove automatic `createDemoLikeApiRoom()` from `initializeRoomWorkspace()`.
3. On `listRooms()` success with `[]`, set `source: "api"`, no active room, and empty maps.
4. On API failure, set `source: "offline"`, no active room, and empty maps; preserve error message.
5. Change `sendComposerMessage()` so non-API/no-room/no-sender and send failure only set errors; no fake local RoomMessage and no source downgrade.
6. Update tests to assert no demo seed, no fallback timeline append, and explicit create-room remains real API-backed.

**Validation:**

- `pnpm --filter @linka/ui test`

## Task 2: Workspace Empty/Offline UI

**Files:**

- Modify: `packages/ui/src/app/App.tsx`
- Modify: `packages/ui/src/components/shell/RoomWorkspace.tsx`
- Modify: `packages/ui/src/components/room/RoomNav.tsx`
- Modify: `packages/ui/src/components/room/Composer.tsx`

**Steps:**

1. Reinitialize room workspace when daemon status becomes online after an offline/error source.
2. Remove `demoRoom` fallback rendering from `RoomWorkspace`.
3. Add no-room empty state in the main panel and compact empty context side panels.
4. Update nav source labels to `daemon`, `offline`, `checking`, and reserved `demo`; show an empty room-list state.
5. Disable composer submit outside `api` source and avoid local draft language.
6. Keep existing dense operational visual style and stable layout.

**Validation:**

- `pnpm --filter @linka/ui typecheck`
- `pnpm --filter @linka/ui test`

## Task 3: Integration Verification

**Files:**

- Modify if needed: `scripts/daemon-ui-e2e.mjs`
- Modify if needed: `scripts/ui-smoke.mjs`

**Steps:**

1. Run UI typecheck/test.
2. Run `node --check scripts/daemon-ui-e2e.mjs`.
3. Run `pnpm smoke:daemon-ui` because this lane changes the daemon-backed UI startup path.
4. If smoke fails only because the expected text still assumes fallback/demo, update the smoke assertion to match real empty/api state without weakening the `@LinkA` main path.

**Validation:**

- `pnpm --filter @linka/ui typecheck`
- `pnpm --filter @linka/ui test`
- `node --check scripts/daemon-ui-e2e.mjs`
- `pnpm smoke:daemon-ui`
