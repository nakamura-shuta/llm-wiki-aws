#!/usr/bin/env bash
set -eu

API_PID=""
WORKER_PID=""

cleanup() {
  echo "[entrypoint] caught signal, shutting down children"
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
  [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  exit 143
}
trap cleanup TERM INT

bun run src/api.ts &
API_PID=$!

bun run src/worker.ts &
WORKER_PID=$!

echo "[entrypoint] api=$API_PID worker=$WORKER_PID"

set +e
wait -n "$API_PID" "$WORKER_PID"
FIRST_EXIT=$?
set -e

echo "[entrypoint] first exit=$FIRST_EXIT, terminating siblings"
kill "$API_PID" 2>/dev/null || true
kill "$WORKER_PID" 2>/dev/null || true
wait 2>/dev/null || true

exit "$FIRST_EXIT"
