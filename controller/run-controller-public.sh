#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_FILE="$SCRIPT_DIR/ItsController.jar"
TUNNEL_LOG="$(mktemp)"
RETRY_DELAY_SECONDS="${ITS_CLOUDFLARED_RETRY_DELAY_SECONDS:-60}"

cleanup() {
  if [ -n "${TUNNEL_PID:-}" ]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
  fi
  rm -f "$TUNNEL_LOG"
}

trap cleanup EXIT

PUBLIC_URL=""
while [ -z "$PUBLIC_URL" ]; do
  : > "$TUNNEL_LOG"
  cloudflared tunnel --url http://127.0.0.1:8889 --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!

  for _ in $(seq 1 60); do
    PUBLIC_URL="$(grep -oE 'https://[A-Za-z0-9.-]+trycloudflare.com' "$TUNNEL_LOG" | tail -n 1 || true)"
    if [ -n "$PUBLIC_URL" ]; then
      break
    fi

    if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      break
    fi

    sleep 1
  done

  if [ -z "$PUBLIC_URL" ]; then
    wait "$TUNNEL_PID" 2>/dev/null || true
    echo "cloudflared quick tunnel unavailable, retrying in ${RETRY_DELAY_SECONDS}s..." >&2
    cat "$TUNNEL_LOG" >&2
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
    sleep "$RETRY_DELAY_SECONDS"
  fi
done

export ITS_CAMERA_WEBRTC_URL="$PUBLIC_URL/cam/"
echo "Public camera URL: $ITS_CAMERA_WEBRTC_URL"

java -jar "$JAR_FILE" "$@" &
JAVA_PID=$!

wait -n "$JAVA_PID" "$TUNNEL_PID" || true
kill "$JAVA_PID" 2>/dev/null || true
kill "$TUNNEL_PID" 2>/dev/null || true
wait "$JAVA_PID" 2>/dev/null || true
wait "$TUNNEL_PID" 2>/dev/null || true