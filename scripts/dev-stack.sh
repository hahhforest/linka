#!/usr/bin/env sh
set -eu

echo "Starting LinkA scaffold dev stack..."
echo "- daemon: packages/daemon dev placeholder"
echo "- ui: packages/ui Vite dev server"

pnpm --filter @linka/daemon dev &
DAEMON_PID=$!

pnpm --filter @linka/ui dev &
UI_PID=$!

cleanup() {
  kill "$DAEMON_PID" "$UI_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait
