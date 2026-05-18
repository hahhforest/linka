# Test Discovery Gate

## Scope

Phase 03 will add more daemon and UI tests. Package test scripts must discover new `*.test.ts` files automatically so root `pnpm test` cannot silently skip new coverage.

## Decision

- `@linka/daemon` now runs every `src/**/*.test.ts` through Node's test runner with `tsx` registered.
- `@linka/ui` first typechecks test files with `tsconfig.test.json`, then runs every `src/**/*.test.ts` with `tsx`.

This is a quality gate change only. It does not alter runtime behavior.

## Verification

Run:

- `pnpm --filter @linka/daemon test`
- `pnpm --filter @linka/ui test`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm format`
