#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_FILE="${ITS_CONTROLLER_JAR:-$SCRIPT_DIR/ItsController.jar}"
. "$SCRIPT_DIR/controller-classpath.sh"
LOCAL_PORT="${ITS_CAMERA_WEBRTC_PORT:-8080}"
CAMERA_PATH="${ITS_CAMERA_WEBRTC_PATH:-cam/}"
CAMERA_HEALTH_PATH="${ITS_CAMERA_STREAM_HEALTH_PATH:-$CAMERA_PATH}"
RETRY_DELAY_SECONDS="${ITS_TUNNEL_RETRY_DELAY_SECONDS:-60}"
TUNNEL_MAX_ATTEMPTS="${ITS_TUNNEL_MAX_ATTEMPTS:-3}"
PUBLIC_CAMERA_CHECK_SECONDS="${ITS_PUBLIC_CAMERA_CHECK_SECONDS:-30}"
PUBLIC_CAMERA_MAX_FAILURES="${ITS_PUBLIC_CAMERA_MAX_FAILURES:-3}"
TUNNEL_LOG="$(mktemp)"
TUNNEL_PID=""
PUBLIC_BASE_URL=""

cleanup() {
  if [ -n "$TUNNEL_PID" ]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
  rm -f "$TUNNEL_LOG"
}

trap cleanup EXIT

camera_path() {
  local path="${CAMERA_PATH#/}"
  printf '%s' "$path"
}

join_url() {
  local base="${1%/}"
  local path
  path="$(camera_path)"
  printf '%s/%s' "$base" "$path"
}

normalize_ngrok_url() {
  local value="$1"
  if [[ "$value" == http://* || "$value" == https://* ]]; then
    printf '%s' "$value"
  else
    printf 'https://%s' "$value"
  fi
}

wait_for_log_url() {
  local pattern="$1"
  local seconds="${2:-60}"
  local found=""
  for _ in $(seq 1 "$seconds"); do
    found="$(grep -oE "$pattern" "$TUNNEL_LOG" | tail -n 1 || true)"
    if [ -n "$found" ]; then
      PUBLIC_BASE_URL="$found"
      return 0
    fi
    if [ -n "$TUNNEL_PID" ] && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      return 1
    fi
    sleep 1
  done
  return 1
}

start_ngrok_tunnel() {
  command -v ngrok >/dev/null 2>&1 || return 1

  if [ -n "${ITS_NGROK_AUTHTOKEN:-}" ]; then
    ngrok config add-authtoken "$ITS_NGROK_AUTHTOKEN" >/dev/null
  fi

  local requested_url="${ITS_NGROK_URL:-${ITS_NGROK_DOMAIN:-${NGROK_DOMAIN:-}}}"
  : > "$TUNNEL_LOG"

  if [ -n "$requested_url" ]; then
    requested_url="$(normalize_ngrok_url "$requested_url")"
    ngrok http "http://127.0.0.1:$LOCAL_PORT" --url "$requested_url" --log stdout >"$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    sleep 3
    if kill -0 "$TUNNEL_PID" 2>/dev/null; then
      PUBLIC_BASE_URL="$requested_url"
      return 0
    fi
    return 1
  fi

  ngrok http "http://127.0.0.1:$LOCAL_PORT" --log stdout >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!
  if wait_for_log_url 'https://[A-Za-z0-9._-]+\.ngrok(-free)?\.(app|dev|pizza|io)' 60; then
    return 0
  fi
  kill "$TUNNEL_PID" 2>/dev/null || true
  wait "$TUNNEL_PID" 2>/dev/null || true
  TUNNEL_PID=""
  return 1
}

start_cloudflare_quick_tunnel() {
  command -v cloudflared >/dev/null 2>&1 || return 1

  local attempt=1
  while [ "$attempt" -le "$TUNNEL_MAX_ATTEMPTS" ]; do
    : > "$TUNNEL_LOG"
    cloudflared tunnel --url "http://127.0.0.1:$LOCAL_PORT" --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!

    if wait_for_log_url 'https://[A-Za-z0-9.-]+trycloudflare\.com' 60; then
      return 0
    fi

    wait "$TUNNEL_PID" 2>/dev/null || true
    echo "cloudflared quick tunnel unavailable, attempt ${attempt}/${TUNNEL_MAX_ATTEMPTS}." >&2
    cat "$TUNNEL_LOG" >&2
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
    TUNNEL_PID=""
    attempt=$((attempt + 1))
    if [ "$attempt" -le "$TUNNEL_MAX_ATTEMPTS" ]; then
      echo "Retrying Cloudflare quick tunnel in ${RETRY_DELAY_SECONDS}s..." >&2
      sleep "$RETRY_DELAY_SECONDS"
    fi
  done
  return 1
}

wait_for_local_camera_port() {
  local seconds="${ITS_CAMERA_LOCAL_WAIT_SECONDS:-30}"
  local path
  path="${CAMERA_HEALTH_PATH#/}"
  local local_url="http://127.0.0.1:${LOCAL_PORT}/${path}"
  echo "Waiting for local camera stream on ${local_url}"
  for _ in $(seq 1 "$seconds"); do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 4 --range 0-256 "$local_url" >/dev/null 2>&1; then
        return 0
      fi
    elif (echo >"/dev/tcp/127.0.0.1/${LOCAL_PORT}") >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

public_camera_healthy() {
  local url="$1"
  if [ -z "$url" ] || ! command -v curl >/dev/null 2>&1; then
    return 1
  fi
  curl -fsS --max-time 8 --range 0-1024 "$url" >/dev/null 2>&1
}

camera_mode="${ITS_CAMERA_MODE:-mjpeg}"
tunnel_enabled="${ITS_CAMERA_TUNNEL_ENABLED:-true}"
tunnel_provider="${ITS_CAMERA_TUNNEL_PROVIDER:-cloudflare}"
public_camera_url="${ITS_CAMERA_WEBRTC_URL:-}"
if [ -z "$public_camera_url" ]; then
  public_camera_url="${ITS_CAMERA_PUBLIC_URL:-}"
fi

if [ -z "$public_camera_url" ] && { [ "$camera_mode" != "webrtc" ] || [ "$tunnel_enabled" = "true" ]; }; then
  if wait_for_local_camera_port; then
    if [ "$tunnel_provider" = "cloudflare" ]; then
      if start_cloudflare_quick_tunnel; then
        echo "Public camera tunnel: cloudflare-quick"
      else
        echo "Cloudflare quick tunnel failed; controller will run without public camera URL." >&2
      fi
    else
      if start_ngrok_tunnel; then
        echo "Public camera tunnel: ngrok"
      else
        echo "ngrok unavailable; trying Cloudflare quick tunnel." >&2
        if start_cloudflare_quick_tunnel; then
          echo "Public camera tunnel: cloudflare-quick"
        else
          echo "Cloudflare quick tunnel failed; controller will run without public camera URL." >&2
        fi
      fi
    fi
    if [ -n "$PUBLIC_BASE_URL" ]; then
      public_camera_url="$(join_url "$PUBLIC_BASE_URL")"
    fi
  else
    echo "Local camera stream is not reachable on port ${LOCAL_PORT}; skipping public tunnel for now." >&2
    if [ "$tunnel_enabled" = "true" ]; then
      echo "Tunnel mode is enabled; restarting later so camera/tunnel can recover." >&2
      exit 1
    fi
  fi
fi

export ITS_CAMERA_ENABLED="${ITS_CAMERA_ENABLED:-true}"
export ITS_CAMERA_MODE="$camera_mode"
if [ "$camera_mode" = "webrtc" ]; then
  export ITS_WEBRTC_ENABLED="${ITS_WEBRTC_ENABLED:-true}"
else
  export ITS_WEBRTC_ENABLED="${ITS_WEBRTC_ENABLED:-false}"
fi
export ITS_YOLO_CAMERA_SOURCE="${ITS_YOLO_CAMERA_SOURCE:-${ITS_CAMERA_SOURCE:-${ITS_CAMERA_DEVICE:-/dev/video0}}}"
export ITS_CAMERA_SNAPSHOT_URL="${ITS_CAMERA_SNAPSHOT_URL:-http://127.0.0.1:${LOCAL_PORT}/snapshot.jpg}"
if [ -n "$public_camera_url" ]; then
  export ITS_CAMERA_PUBLIC_URL="$public_camera_url"
  export ITS_CAMERA_WEBRTC_URL="$public_camera_url"
else
  unset ITS_CAMERA_PUBLIC_URL
  unset ITS_CAMERA_WEBRTC_URL
fi

echo "Camera mode: $ITS_CAMERA_MODE"
echo "Public camera URL: ${public_camera_url:-'(firebase-webrtc-signaling)'}"
echo "YOLO camera source: $ITS_YOLO_CAMERA_SOURCE"
echo "Snapshot URL: $ITS_CAMERA_SNAPSHOT_URL"
if [ -n "$public_camera_url" ] && command -v curl >/dev/null 2>&1; then
  if ! public_camera_healthy "$ITS_CAMERA_WEBRTC_URL"; then
    echo "Warning: public camera URL is not serving yet. Check MediaMTX/IP-camera service on 127.0.0.1:$LOCAL_PORT." >&2
    if [ "$tunnel_enabled" = "true" ]; then
      echo "Restarting controller to request a fresh public tunnel." >&2
      exit 1
    fi
  fi
fi

controller_java "$JAR_FILE" "$@" &
JAVA_PID=$!
LAST_PUBLIC_CHECK=0
PUBLIC_CAMERA_FAILURES=0

while kill -0 "$JAVA_PID" 2>/dev/null; do
  if [ -n "$TUNNEL_PID" ] && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "Camera tunnel stopped; stopping controller so systemd can restart it." >&2
    kill "$JAVA_PID" 2>/dev/null || true
    break
  fi
  if [ -n "$public_camera_url" ] && command -v curl >/dev/null 2>&1; then
    now="$(date +%s)"
    if [ $((now - LAST_PUBLIC_CHECK)) -ge "$PUBLIC_CAMERA_CHECK_SECONDS" ]; then
      LAST_PUBLIC_CHECK="$now"
      if public_camera_healthy "$public_camera_url"; then
        PUBLIC_CAMERA_FAILURES=0
      else
        PUBLIC_CAMERA_FAILURES=$((PUBLIC_CAMERA_FAILURES + 1))
        echo "Public camera health failed ${PUBLIC_CAMERA_FAILURES}/${PUBLIC_CAMERA_MAX_FAILURES}: $public_camera_url" >&2
        if [ "$PUBLIC_CAMERA_FAILURES" -ge "$PUBLIC_CAMERA_MAX_FAILURES" ]; then
          echo "Public camera tunnel is stale; stopping controller so systemd can obtain a new tunnel URL." >&2
          kill "$JAVA_PID" 2>/dev/null || true
          break
        fi
      fi
    fi
  fi
  sleep 2
done

wait "$JAVA_PID" 2>/dev/null || true
