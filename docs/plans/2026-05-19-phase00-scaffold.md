# Phase 00 Scaffold Lane

## Scope

This lane establishes the minimal TypeScript monorepo scaffold for LinkA. It adds pnpm workspace metadata, Turbo task orchestration, shared TypeScript configuration, empty package shells, a React + Vite UI shell, and a placeholder dev stack script.

## Packages

- `@linka/shared`: shared placeholder export, no internal dependencies.
- `@linka/config`: config placeholder export, no internal dependencies.
- `@linka/harness`: harness placeholder export, depends on `@linka/shared` via `workspace:^`.
- `@linka/daemon`: daemon placeholder export/dev process, depends on `@linka/shared`, `@linka/config`, and `@linka/harness` via `workspace:^`.
- `@linka/ui`: React 18 + Vite 5 SPA scaffold, runtime depends on `@linka/shared` and dev tooling depends on `@linka/config` via `workspace:^`.
- `@linka/cli`: CLI placeholder export, depends on `@linka/shared` and `@linka/config` via `workspace:^`.

## Quality Gates

Required verification for this lane:

- `pnpm install`
- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

Formatting is available through the root `format` script with `.prettierrc`. A base `.eslintrc.cjs` is present because the root package uses ESM (`type: module`), while lint execution is intentionally deferred to the Phase 02 quality gate.

No Room, Message, daemon runtime, UI workflow, product business logic, Hono, SQLite, or SSE is implemented in this lane.
