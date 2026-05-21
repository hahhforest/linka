# Phase 33 Daemon UI E2E

## Producer Scope

Phase 33 adds a daemon-backed browser E2E script without changing product code. The script owns process orchestration and browser automation only; product behavior failures should be left visible for Fix Worker and Verifier instead of being patched in this lane.

## Script Behavior

- Allocates separate daemon and UI ports at runtime.
- Creates a temporary `LINKA_HOME` and unique `LINKA_PROFILE`, and sets `LINKA_PORT` so the test does not touch the user's default LinkA data.
- Starts the daemon with an equivalent non-watch command, `pnpm --filter @linka/daemon exec tsx src/index.ts`, and waits for `/linka/health`.
- Starts the UI with an equivalent explicit-port command, `pnpm --filter @linka/ui exec vite --host 127.0.0.1 --port <uiPort>`, and waits for the Vite UI.
- Opens Chrome through CDP, reusing the no-Playwright approach from `scripts/ui-smoke.mjs`.
- Requires strict daemon UI evidence: `/linka/health · online`, daemon source text, and `sse open`.
- Creates a real Room through the UI modal and waits for it to appear selected in the nav and main heading.
- Opens Docs, disables the default LinkA handoff checkbox, creates a Doc, and waits for Doc detail.
- Opens Announcements, creates an announcement, edits it, deletes it, and waits for the empty state.
- Opens Activity and accepts either projected items or the explicit empty state.
- Collects browser console errors, page exceptions, and `/linka` network failures. Daemon-backed API errors are treated as failures.
- Runs the strict `scripts/ui-smoke.mjs` daemon predicates equivalently inside the active CDP session: root content, `/linka/health · online`, daemon source text, and `sse open`.
- Tears down Chrome, UI, daemon, Chrome profile, and temporary `LINKA_HOME` on exit.

## Notes For Fix Worker And Verifier

The daemon now returns local-development CORS headers for browser requests from `localhost`, `127.0.0.1`, and `[::1]` origins. Preflight `OPTIONS` requests are answered before route dispatch with `GET, POST, PATCH, DELETE, OPTIONS` and `Content-Type`, without enabling credentials or wildcard production access.

The E2E Chrome profile runs with normal browser web security. `VITE_LINKA_DAEMON_URL` points the UI directly at the real daemon port, so the script still exercises the real daemon, database profile, UI service calls, and SSE connection.

## Validation

Producer validation target:

```bash
node scripts/daemon-ui-e2e.mjs
```

The script also runs the equivalent strict smoke check internally:

```bash
LINKA_UI_SMOKE_REQUIRE_DAEMON=1 LINKA_UI_SMOKE_URL=http://127.0.0.1:<uiPort>/ pnpm smoke:ui
```

The standalone command above now relies on daemon CORS support and should not require any Chrome web-security workaround when `VITE_LINKA_DAEMON_URL` points directly at the daemon.
