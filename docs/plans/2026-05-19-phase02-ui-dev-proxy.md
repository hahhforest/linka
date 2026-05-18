# Phase 02 UI Dev Proxy

## Scope

Vite serves the Web UI during local development while the daemon serves `/linka/*` HTTP endpoints. The UI calls `/linka/health` using a same-origin path, so the Vite dev server needs to proxy `/linka` to the daemon during `pnpm dev`.

## Decision

`packages/ui/vite.config.ts` now proxies `/linka` to the daemon target.

Target precedence:

1. `VITE_LINKA_DAEMON_URL`
2. `LINKA_DAEMON_URL`
3. `http://127.0.0.1:4510`

This is a Phase 02 local-development integration seam. Production desktop IPC, packaged desktop routing, and fully branch-aware proxy selection are deferred until daemon lifecycle and CLI startup are implemented.

## Verification

Run:

- `pnpm --filter @linka/ui typecheck`
- `pnpm --filter @linka/ui build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm format`
