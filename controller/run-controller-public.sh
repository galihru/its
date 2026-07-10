#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_FILE="${ITS_CONTROLLER_JAR:-$SCRIPT_DIR/ItsController.jar}"
. "$SCRIPT_DIR/controller-classpath.sh"
CAMERA_MODE_FOR_PORT="${ITS_CAMERA_MODE:-webrtc}"
WEBRTC_PORT="${ITS_CAMERA_WEBRTC_PORT:-8889}"
HLS_PORT="${ITS_CAMERA_HLS_PORT:-8888}"
PROXY_PORT="${ITS_CAMERA_PUBLIC_PROXY_PORT:-8890}"
LOCAL_PORT="${ITS_CAMERA_TUNNEL_PORT:-}"
if [ -z "$LOCAL_PORT" ]; then
  if [ "$CAMERA_MODE_FOR_PORT" = "webrtc" ]; then
    LOCAL_PORT="$PROXY_PORT"
  else
    LOCAL_PORT="$WEBRTC_PORT"
  fi
fi
CAMERA_PATH="${ITS_CAMERA_WEBRTC_PATH:-cam/}"
RETRY_DELAY_SECONDS="${ITS_TUNNEL_RETRY_DELAY_SECONDS:-8}"
TUNNEL_MAX_ATTEMPTS="${ITS_TUNNEL_MAX_ATTEMPTS:-6}"
TUNNEL_ALLOW_FALLBACK="${ITS_CAMERA_TUNNEL_ALLOW_FALLBACK:-false}"
PUBLIC_HEALTH_CHECK_SECONDS="${ITS_PUBLIC_CAMERA_HEALTH_CHECK_SECONDS:-30}"
PUBLIC_HEALTH_FAILURE_LIMIT="${ITS_PUBLIC_CAMERA_FAILURE_LIMIT:-3}"
LOCAL_HEALTH_FAILURE_LIMIT="${ITS_LOCAL_CAMERA_FAILURE_LIMIT:-2}"
PUBLIC_STABLE_CHECKS="${ITS_PUBLIC_CAMERA_STABLE_CHECKS:-2}"
PUBLIC_STABLE_SECONDS="${ITS_PUBLIC_CAMERA_STABLE_SECONDS:-3}"
CLOUDFLARE_QUICK_URL_SECONDS="${ITS_CLOUDFLARE_QUICK_URL_SECONDS:-30}"
CLOUDFLARE_QUICK_REGISTER_SECONDS="${ITS_CLOUDFLARE_QUICK_REGISTER_SECONDS:-20}"
CLOUDFLARE_QUICK_PUBLIC_SECONDS="${ITS_CLOUDFLARE_QUICK_PUBLIC_SECONDS:-25}"
CLOUDFLARE_ACCEPT_REGISTERED_WITHOUT_DNS="${ITS_CLOUDFLARE_ACCEPT_REGISTERED_WITHOUT_DNS:-false}"
TUNNEL_LOG="$(mktemp)"
TUNNEL_PID_FILE="${ITS_CAMERA_TUNNEL_PID_FILE:-$SCRIPT_DIR/.camera-tunnel.pid}"
TUNNEL_PID=""
PUBLIC_URL_FILE="${ITS_CAMERA_PUBLIC_URL_FILE:-$SCRIPT_DIR/camera-public-url.current}"
PROXY_LOG="$(mktemp)"
PROXY_PID_FILE="${ITS_CAMERA_PROXY_PID_FILE:-$SCRIPT_DIR/.camera-public-proxy.pid}"
PROXY_PID=""
PUBLIC_BASE_URL=""
TUNNEL_HOST_IP=""
TUNNEL_TARGET_BASE_URL=""

cleanup() {
  if [ -n "$TUNNEL_PID" ]; then
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
  if [ -f "$TUNNEL_PID_FILE" ] && [ "$(cat "$TUNNEL_PID_FILE" 2>/dev/null || true)" = "$TUNNEL_PID" ]; then
    rm -f "$TUNNEL_PID_FILE"
  fi
  if [ -n "$PROXY_PID" ]; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
  if [ -f "$PROXY_PID_FILE" ] && [ "$(cat "$PROXY_PID_FILE" 2>/dev/null || true)" = "$PROXY_PID" ]; then
    rm -f "$PROXY_PID_FILE"
  fi
  rm -f "$TUNNEL_LOG"
  rm -f "$PROXY_LOG"
}

trap cleanup EXIT
trap 'cleanup; exit 143' TERM
trap 'cleanup; exit 130' INT

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

camera_health_urls() {
  local url="$1"
  if [[ "$url" == */ ]]; then
    printf '%sindex.m3u8\n' "$url"
    printf '%ssnapshot.jpg\n' "$(url_origin "$url")"
    return
  fi
  printf '%s\n' "$url"
}

url_origin() {
  printf '%s' "$1" | sed -E 's#^(https?://[^/]+).*$#\1/#'
}

url_dir() {
  local url="${1%%\?*}"
  printf '%s/' "${url%/*}"
}

hls_segment_is_ready() {
  local playlist_url="$1"
  local curl_ip_flag="${2:-}"
  local depth="${3:-0}"
  local playlist segment segment_url sample size
  playlist="$(curl ${curl_ip_flag:+"$curl_ip_flag"} -fsS --max-time 12 "$playlist_url" 2>/dev/null || true)"
  printf '%s' "$playlist" | head -c 256 | grep -q '#EXTM3U' || return 1
  segment="$(printf '%s\n' "$playlist" | awk 'NF && $0 !~ /^#/ { line=$0 } END { print line }')"
  [ -n "$segment" ] || return 1
  case "$segment" in
    http://*|https://*) segment_url="$segment" ;;
    *) segment_url="$(url_dir "$playlist_url")$segment" ;;
  esac
  if [[ "$segment_url" == *.m3u8* ]]; then
    [ "$depth" -lt 2 ] || return 1
    hls_segment_is_ready "$segment_url" "$curl_ip_flag" $((depth + 1))
    return
  fi
  sample="$(curl ${curl_ip_flag:+"$curl_ip_flag"} -fsS --max-time 12 --range 0-4095 "$segment_url" 2>/dev/null | head -c 4096 || true)"
  printf '%s' "$sample" | head -c 32 | grep -q '#EXTM3U' && return 1
  size="$(printf '%s' "$sample" | wc -c | tr -d ' ' || true)"
  [ "${size:-0}" -ge 512 ]
}

jpeg_snapshot_is_ready() {
  local snapshot_url="$1"
  local curl_ip_flag="${2:-}"
  local magic
  magic="$(curl ${curl_ip_flag:+"$curl_ip_flag"} -fsS --max-time 12 "$snapshot_url" 2>/dev/null | head -c 2 | od -An -tx1 | tr -d ' \n' || true)"
  [ "$magic" = "ffd8" ]
}

url_is_ready_with_curl() {
  local url="$1"
  local curl_ip_flag="${2:-}"
  local candidate
  while IFS= read -r candidate; do
    [ -z "$candidate" ] && continue
    if [[ "$candidate" == *.m3u8* ]]; then
      if hls_segment_is_ready "$candidate" "$curl_ip_flag"; then
        return 0
      fi
    elif [[ "$candidate" == *.jpg* || "$candidate" == *.jpeg* ]]; then
      if jpeg_snapshot_is_ready "$candidate" "$curl_ip_flag"; then
        return 0
      fi
    else
      local body
      body="$(curl ${curl_ip_flag:+"$curl_ip_flag"} -fsS --max-time 12 "$candidate" 2>/dev/null | head -c 256 || true)"
      if [ -n "$body" ] && ! printf '%s' "$body" | grep -Eiq '<html|cloudflare tunnel error|error code: 1033|no tunnel here'; then
        return 0
      fi
    fi
  done < <(camera_health_urls "$url")
  return 1
}

url_is_ready() {
  url_is_ready_with_curl "$1"
}

url_host() {
  printf '%s' "$1" | sed -E 's#^https?://([^/:]+).*$#\1#'
}

normalize_ngrok_url() {
  local value="$1"
  if [[ "$value" == http://* || "$value" == https://* ]]; then
    printf '%s' "$value"
  else
    printf 'https://%s' "$value"
  fi
}

resolve_host_ip() {
  local host_ip=""

  host_ip="$(hostname -I 2>/dev/null | tr ' ' '\n' | awk '/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ && $0 != "127.0.0.1" { print; exit }' || true)"
  if [ -z "$host_ip" ] && command -v ip >/dev/null 2>&1; then
    host_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }' || true)"
  fi
  if [ -z "$host_ip" ] && command -v ip >/dev/null 2>&1; then
    host_ip="$(ip -4 -o addr show scope global 2>/dev/null | awk '{ split($4, a, "/"); if (a[1] != "127.0.0.1") { print a[1]; exit } }' || true)"
  fi

  if [ -z "$host_ip" ] || [ "$host_ip" = "127.0.0.1" ]; then
    echo "Tidak menemukan IP Raspberry non-loopback dari hostname -I/ip route/ip addr." >&2
    return 1
  fi

  printf '%s' "$host_ip"
}

set_tunnel_target() {
  TUNNEL_HOST_IP="$(resolve_host_ip)"
  TUNNEL_TARGET_BASE_URL="http://${TUNNEL_HOST_IP}:${LOCAL_PORT}"
}

remember_tunnel_pid() {
  if [ -n "$TUNNEL_PID" ]; then
    printf '%s\n' "$TUNNEL_PID" >"$TUNNEL_PID_FILE"
  fi
}

stop_process_if_running() {
  local pid="$1"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 5); do
      kill -0 "$pid" 2>/dev/null || return 0
      sleep 1
    done
  fi
}

camera_public_proxy_enabled() {
  [ "${ITS_CAMERA_PUBLIC_PROXY_ENABLED:-true}" = "true" ] && [ "$CAMERA_MODE_FOR_PORT" = "webrtc" ] && [ "$LOCAL_PORT" = "$PROXY_PORT" ]
}

start_camera_public_proxy() {
  camera_public_proxy_enabled || return 0
  command -v python3 >/dev/null 2>&1 || {
    echo "python3 not found; camera public proxy cannot start." >&2
    return 1
  }

  if [ -f "$PROXY_PID_FILE" ]; then
    local old_proxy_pid
    old_proxy_pid="$(cat "$PROXY_PID_FILE" 2>/dev/null || true)"
    if [ -n "$old_proxy_pid" ] && [ "$old_proxy_pid" != "$$" ]; then
      stop_process_if_running "$old_proxy_pid"
    fi
    rm -f "$PROXY_PID_FILE"
  fi

  : > "$PROXY_LOG"
  echo "Starting camera public proxy on :${PROXY_PORT} (WHEP :${WEBRTC_PORT}, HLS :${HLS_PORT})"
  python3 "$SCRIPT_DIR/camera-public-proxy.py" \
    --host 0.0.0.0 \
    --port "$PROXY_PORT" \
    --webrtc-port "$WEBRTC_PORT" \
    --hls-port "$HLS_PORT" >"$PROXY_LOG" 2>&1 &
  PROXY_PID=$!
  printf '%s\n' "$PROXY_PID" >"$PROXY_PID_FILE"

  for _ in $(seq 1 20); do
    if ! kill -0 "$PROXY_PID" 2>/dev/null; then
      echo "Camera public proxy stopped while starting." >&2
      sed -n '1,120p' "$PROXY_LOG" >&2 || true
      PROXY_PID=""
      return 1
    fi
    if url_is_ready "http://127.0.0.1:${PROXY_PORT}/cam/"; then
      return 0
    fi
    sleep 1
  done

  echo "Camera public proxy did not become ready." >&2
  sed -n '1,120p' "$PROXY_LOG" >&2 || true
  return 1
}

stop_stale_tunnel_processes() {
  set_tunnel_target || return 1

  if [ -f "$TUNNEL_PID_FILE" ]; then
    local old_pid
    old_pid="$(cat "$TUNNEL_PID_FILE" 2>/dev/null || true)"
    if [ -n "$old_pid" ] && [ "$old_pid" != "$$" ]; then
      stop_process_if_running "$old_pid"
    fi
    rm -f "$TUNNEL_PID_FILE"
  fi

  while IFS= read -r line; do
    local pid args
    pid="${line%% *}"
    args="${line#* }"
    [ -z "$pid" ] && continue
    [ "$pid" = "$$" ] && continue
    [ -n "$TUNNEL_PID" ] && [ "$pid" = "$TUNNEL_PID" ] && continue

    case "$args" in
      *"cloudflared tunnel"*'--url http://'*":${LOCAL_PORT}"*|*"nokey@localhost.run"*"-R 80:"*":${LOCAL_PORT}"*|*"nokey@localhost.run"*"-R 80:"*":${WEBRTC_PORT}"*|*"nokey@localhost.run"*"-R 80:"*":${PROXY_PORT}"*)
        echo "Stopping stale camera tunnel process $pid"
        stop_process_if_running "$pid"
        ;;
    esac
  done < <(ps -u "$(id -u)" -o pid=,args= 2>/dev/null || true)
}

local_camera_url() {
  if [ -z "$TUNNEL_TARGET_BASE_URL" ]; then
    set_tunnel_target
  fi
  join_url "$TUNNEL_TARGET_BASE_URL"
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

wait_for_log_text() {
  local pattern="$1"
  local seconds="${2:-60}"
  for _ in $(seq 1 "$seconds"); do
    if grep -Eq "$pattern" "$TUNNEL_LOG" 2>/dev/null; then
      return 0
    fi
    if [ -n "$TUNNEL_PID" ] && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      return 1
    fi
    sleep 1
  done
  return 1
}

wait_for_public_url() {
  local url="$1"
  local seconds="${2:-45}"
  for _ in $(seq 1 "$seconds"); do
    if public_url_is_ready "$url"; then
      return 0
    fi
    if [ -n "$TUNNEL_PID" ] && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      return 1
    fi
    sleep 1
  done
  return 1
}

public_url_stays_ready() {
  local url="$1"
  local checks="${2:-$PUBLIC_STABLE_CHECKS}"
  local pause_seconds="${3:-$PUBLIC_STABLE_SECONDS}"
  local passed=0

  while [ "$passed" -lt "$checks" ]; do
    if ! public_url_is_ready "$url"; then
      return 1
    fi
    passed=$((passed + 1))
    if [ "$passed" -lt "$checks" ]; then
      sleep "$pause_seconds"
    fi
  done

  return 0
}

public_url_is_ready() {
  local url="$1"
  local host
  host="$(url_host "$url")"
  if [[ "$host" == *.trycloudflare.com ]]; then
    getent ahostsv4 "$host" >/dev/null 2>&1 && url_is_ready_with_curl "$url" -4
    return
  fi
  getent ahosts "$host" >/dev/null 2>&1 && url_is_ready "$url"
}

public_dns_is_ready() {
  local url="$1"
  local host
  host="$(url_host "$url")"
  getent ahosts "$host" >/dev/null 2>&1
}

wait_for_public_dns() {
  local url="$1"
  local seconds="${2:-45}"
  for _ in $(seq 1 "$seconds"); do
    if public_dns_is_ready "$url"; then
      return 0
    fi
    if [ -n "$TUNNEL_PID" ] && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      return 1
    fi
    sleep 1
  done
  return 1
}

public_health_can_restart() {
  local url="$1"
  local host
  host="$(url_host "$url")"
  [[ "$host" != *.lhr.life ]]
}

start_ngrok_tunnel() {
  command -v ngrok >/dev/null 2>&1 || return 1
  set_tunnel_target || return 1
  local target_url="$TUNNEL_TARGET_BASE_URL"

  if [ -n "${ITS_NGROK_AUTHTOKEN:-}" ]; then
    ngrok config add-authtoken "$ITS_NGROK_AUTHTOKEN" >/dev/null
  fi

  local requested_url="${ITS_NGROK_URL:-${ITS_NGROK_DOMAIN:-${NGROK_DOMAIN:-}}}"
  : > "$TUNNEL_LOG"

  if [ -n "$requested_url" ]; then
    requested_url="$(normalize_ngrok_url "$requested_url")"
    echo "Starting ngrok tunnel: $requested_url -> $target_url"
    ngrok http "$target_url" --url "$requested_url" --log stdout >"$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    remember_tunnel_pid
    sleep 3
    if kill -0 "$TUNNEL_PID" 2>/dev/null; then
      PUBLIC_BASE_URL="$requested_url"
      return 0
    fi
    return 1
  fi

  echo "Starting ngrok tunnel -> $target_url"
  ngrok http "$target_url" --log stdout >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!
  remember_tunnel_pid
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
  local edge_ip_version="${TUNNEL_EDGE_IP_VERSION:-4}"
  while [ "$attempt" -le "$TUNNEL_MAX_ATTEMPTS" ]; do
    set_tunnel_target || return 1
    local target_url="$TUNNEL_TARGET_BASE_URL"
    : > "$TUNNEL_LOG"
    PUBLIC_BASE_URL=""
    echo "Starting Cloudflare quick tunnel -> $target_url"
    cloudflared tunnel --edge-ip-version "$edge_ip_version" --url "$target_url" --no-autoupdate >"$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    remember_tunnel_pid

    if wait_for_log_url 'https://[A-Za-z0-9.-]+trycloudflare\.com' "$CLOUDFLARE_QUICK_URL_SECONDS" && wait_for_log_text 'Registered tunnel connection' "$CLOUDFLARE_QUICK_REGISTER_SECONDS"; then
      local public_url
      public_url="$(join_url "$PUBLIC_BASE_URL")"
      if wait_for_public_url "$public_url" "$CLOUDFLARE_QUICK_PUBLIC_SECONDS" && public_url_stays_ready "$public_url"; then
        return 0
      fi
      if ! public_health_can_restart "$public_url" && [ "$CLOUDFLARE_ACCEPT_REGISTERED_WITHOUT_DNS" = "true" ]; then
        echo "cloudflared quick tunnel registered; accepting URL despite public HTTP self-check failure: $public_url" >&2
        return 0
      fi
      echo "cloudflared quick tunnel registered but DNS/HTTP is not reachable from this network: $public_url" >&2
      kill "$TUNNEL_PID" 2>/dev/null || true
      wait "$TUNNEL_PID" 2>/dev/null || true
      TUNNEL_PID=""
      PUBLIC_BASE_URL=""
      attempt=$((attempt + 1))
      if [ "$attempt" -le "$TUNNEL_MAX_ATTEMPTS" ]; then
        echo "Retrying Cloudflare quick tunnel in ${RETRY_DELAY_SECONDS}s..." >&2
        sleep "$RETRY_DELAY_SECONDS"
      fi
      continue
    fi

    wait "$TUNNEL_PID" 2>/dev/null || true
    echo "cloudflared quick tunnel unavailable or not registered, attempt ${attempt}/${TUNNEL_MAX_ATTEMPTS}." >&2
    cat "$TUNNEL_LOG" >&2
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
    TUNNEL_PID=""
    PUBLIC_BASE_URL=""
    attempt=$((attempt + 1))
    if [ "$attempt" -le "$TUNNEL_MAX_ATTEMPTS" ]; then
      echo "Retrying Cloudflare quick tunnel in ${RETRY_DELAY_SECONDS}s..." >&2
      sleep "$RETRY_DELAY_SECONDS"
    fi
  done
  return 1
}

start_cloudflare_named_tunnel() {
  command -v cloudflared >/dev/null 2>&1 || return 1

  local token="${ITS_CLOUDFLARE_TUNNEL_TOKEN:-${TUNNEL_TOKEN:-}}"
  if [ -z "$token" ]; then
    return 1
  fi

  : > "$TUNNEL_LOG"
  PUBLIC_BASE_URL=""
  echo "Starting Cloudflare named tunnel from token"
  cloudflared tunnel --no-autoupdate run --token "$token" >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID=$!
  remember_tunnel_pid

  if wait_for_log_text 'Registered tunnel connection|Connection[[:space:]].*registered' 60; then
    return 0
  fi

  wait "$TUNNEL_PID" 2>/dev/null || true
  echo "Cloudflare named tunnel did not register." >&2
  sed -n '1,120p' "$TUNNEL_LOG" >&2 || true
  kill "$TUNNEL_PID" 2>/dev/null || true
  wait "$TUNNEL_PID" 2>/dev/null || true
  TUNNEL_PID=""
  return 1
}

start_localhost_run_tunnel() {
  command -v ssh >/dev/null 2>&1 || return 1

  local attempt=1
  while [ "$attempt" -le "$TUNNEL_MAX_ATTEMPTS" ]; do
    set_tunnel_target || return 1
    local target_host="$TUNNEL_HOST_IP"
    local target_url="$TUNNEL_TARGET_BASE_URL"
    : > "$TUNNEL_LOG"
    PUBLIC_BASE_URL=""
    echo "Starting localhost.run tunnel -> $target_url"
    ssh \
      -T \
      -o StrictHostKeyChecking=no \
      -o UserKnownHostsFile=/tmp/its-localhost-run-known-hosts \
      -o ServerAliveInterval=15 \
      -o ServerAliveCountMax=2 \
      -o ExitOnForwardFailure=yes \
      -R "80:${target_host}:${LOCAL_PORT}" \
      nokey@localhost.run >"$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    remember_tunnel_pid

    if wait_for_log_url 'https://[A-Za-z0-9.-]+\.lhr\.life' 45; then
      local public_url
      public_url="$(join_url "$PUBLIC_BASE_URL")"
      if ! public_health_can_restart "$public_url"; then
        echo "localhost.run tunnel registered; accepting URL without Raspberry self-check: $public_url" >&2
        return 0
      fi
      if wait_for_public_url "$public_url" 45 && public_url_stays_ready "$public_url"; then
        return 0
      fi
      echo "localhost.run tunnel registered; accepting URL despite local self-check failure: $public_url" >&2
      return 0
    fi

    wait "$TUNNEL_PID" 2>/dev/null || true
    echo "localhost.run tunnel unavailable or not reachable, attempt ${attempt}/${TUNNEL_MAX_ATTEMPTS}." >&2
    sed -n '1,80p' "$TUNNEL_LOG" >&2 || true
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
    TUNNEL_PID=""
    PUBLIC_BASE_URL=""
    attempt=$((attempt + 1))
    if [ "$attempt" -le "$TUNNEL_MAX_ATTEMPTS" ]; then
      echo "Retrying localhost.run tunnel in ${RETRY_DELAY_SECONDS}s..." >&2
      sleep "$RETRY_DELAY_SECONDS"
    fi
  done
  return 1
}

wait_for_local_camera_port() {
  local seconds="${ITS_CAMERA_LOCAL_WAIT_SECONDS:-30}"
  set_tunnel_target || return 1
  local url
  url="$(local_camera_url)"
  echo "Waiting for local camera stream on $url"
  for _ in $(seq 1 "$seconds"); do
    if url_is_ready "$url"; then
      return 0
    fi
    local current_ip
    current_ip="$(resolve_host_ip || true)"
    if [ -n "$current_ip" ] && [ "$current_ip" != "$TUNNEL_HOST_IP" ]; then
      set_tunnel_target || return 1
      url="$(local_camera_url)"
      echo "Raspberry IP changed while waiting; now checking $url"
    fi
    sleep 1
  done
  return 1
}

camera_mode="${ITS_CAMERA_MODE:-mjpeg}"
tunnel_enabled="${ITS_CAMERA_TUNNEL_ENABLED:-false}"
tunnel_provider="${ITS_CAMERA_TUNNEL_PROVIDER:-cloudflare}"
public_camera_url="${ITS_CAMERA_WEBRTC_URL:-}"
if [ -z "$public_camera_url" ]; then
  public_camera_url="${ITS_CAMERA_PUBLIC_URL:-}"
fi
if [ -z "$public_camera_url" ]; then
  public_camera_url="${ITS_CLOUDFLARE_PUBLIC_URL:-}"
fi

configure_gps_serial() {
  if [ "${ITS_GPS_ENABLED:-true}" = "false" ]; then
    return 0
  fi

  local gps_device="${ITS_GPS_DEVICE:-/dev/serial0}"
  local gps_baud="${ITS_GPS_BAUD:-9600}"
  if [ -e "$gps_device" ] && command -v stty >/dev/null 2>&1; then
    stty -F "$gps_device" "$gps_baud" raw -echo -echoe -echok -ixon -ixoff cs8 -cstopb || true
  fi

  if [ "${ITS_GPS_UBLOX_INIT:-true}" = "true" ] && command -v python3 >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/gps-init-ublox.py" ]; then
    timeout "${ITS_GPS_UBLOX_INIT_TIMEOUT_SECONDS:-8}" python3 "$SCRIPT_DIR/gps-init-ublox.py" "$gps_device" "$gps_baud" || true
  fi
}

configure_gps_serial

if [ "$tunnel_enabled" = "true" ]; then
  start_camera_public_proxy || true
  stop_stale_tunnel_processes || true
fi

if [ "$tunnel_enabled" = "true" ] && start_cloudflare_named_tunnel; then
  echo "Public camera tunnel: cloudflare-named"
elif [ -z "$public_camera_url" ] && { [ "$camera_mode" != "webrtc" ] || [ "$tunnel_enabled" = "true" ]; }; then
  if wait_for_local_camera_port; then
    if [ "$tunnel_provider" = "cloudflare" ]; then
      if start_cloudflare_quick_tunnel; then
        echo "Public camera tunnel: cloudflare-quick"
      elif [ "$TUNNEL_ALLOW_FALLBACK" = "true" ] && start_localhost_run_tunnel; then
        echo "Public camera tunnel: localhost.run"
      else
        echo "Cloudflare quick tunnel failed; controller will run without public camera URL. For stable public streaming, set ITS_CLOUDFLARE_TUNNEL_TOKEN and ITS_CLOUDFLARE_PUBLIC_URL in cloudflare-tunnel.env." >&2
      fi
    elif [ "$tunnel_provider" = "localhost.run" ] || [ "$tunnel_provider" = "localhostrun" ]; then
      if start_localhost_run_tunnel; then
        echo "Public camera tunnel: localhost.run"
      else
        echo "localhost.run tunnel failed; controller will run without public camera URL." >&2
      fi
    else
      if start_ngrok_tunnel; then
        echo "Public camera tunnel: ngrok"
      else
        echo "ngrok unavailable; trying Cloudflare quick tunnel." >&2
        if start_cloudflare_quick_tunnel; then
          echo "Public camera tunnel: cloudflare-quick"
        elif [ "$TUNNEL_ALLOW_FALLBACK" = "true" ] && start_localhost_run_tunnel; then
          echo "Public camera tunnel: localhost.run"
        else
          echo "Cloudflare quick tunnel failed; controller will run without public camera URL." >&2
        fi
      fi
    fi
    if [ -n "$PUBLIC_BASE_URL" ]; then
      public_camera_url="$(join_url "$PUBLIC_BASE_URL")"
    fi
  else
    echo "Local camera stream is not reachable on $(local_camera_url); skipping public tunnel for now." >&2
  fi
fi

export ITS_CAMERA_ENABLED="${ITS_CAMERA_ENABLED:-true}"
export ITS_CAMERA_MODE="$camera_mode"
if [ "$camera_mode" = "webrtc" ]; then
  export ITS_WEBRTC_ENABLED="${ITS_WEBRTC_ENABLED:-true}"
else
  export ITS_WEBRTC_ENABLED="${ITS_WEBRTC_ENABLED:-false}"
fi
export ITS_YOLO_CAMERA_SOURCE="${ITS_YOLO_CAMERA_SOURCE:-${ITS_CAMERA_DEVICE:-${ITS_CAMERA_SOURCE:-/dev/video0}}}"
if [ -n "$public_camera_url" ]; then
  export ITS_CAMERA_PUBLIC_URL="$public_camera_url"
  export ITS_CAMERA_WEBRTC_URL="$public_camera_url"
  printf '%s\n' "$public_camera_url" >"$PUBLIC_URL_FILE" 2>/dev/null || true
else
  unset ITS_CAMERA_PUBLIC_URL
  unset ITS_CAMERA_WEBRTC_URL
  rm -f "$PUBLIC_URL_FILE" 2>/dev/null || true
fi

echo "Camera mode: $ITS_CAMERA_MODE"
echo "Local camera target: ${TUNNEL_TARGET_BASE_URL:-not checked}"
echo "Public camera URL: ${public_camera_url:-'(firebase-webrtc-signaling)'}"
echo "YOLO camera source: $ITS_YOLO_CAMERA_SOURCE"
if [ -n "$public_camera_url" ] && command -v curl >/dev/null 2>&1 && public_health_can_restart "$public_camera_url"; then
  if ! public_url_is_ready "$ITS_CAMERA_WEBRTC_URL"; then
    echo "Warning: public camera URL is not serving yet. Check MediaMTX/IP-camera service on $(local_camera_url)." >&2
  fi
fi

controller_java "$JAR_FILE" "$@" &
JAVA_PID=$!
last_public_check=0
local_health_failures=0
public_health_failures=0

while kill -0 "$JAVA_PID" 2>/dev/null; do
  if [ -n "$TUNNEL_PID" ] && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "Camera tunnel stopped; stopping controller so systemd can restart it." >&2
    kill "$JAVA_PID" 2>/dev/null || true
    break
  fi

  if [ -n "$TUNNEL_HOST_IP" ]; then
    current_host_ip="$(resolve_host_ip || true)"
    if [ -n "$current_host_ip" ] && [ "$current_host_ip" != "$TUNNEL_HOST_IP" ]; then
      echo "Raspberry IP changed from $TUNNEL_HOST_IP to $current_host_ip; restarting controller to rebuild Cloudflare tunnel." >&2
      kill "$JAVA_PID" 2>/dev/null || true
      break
    fi
  fi

  now="$(date +%s)"
  if [ -n "${public_camera_url:-}" ] && [ $((now - last_public_check)) -ge "$PUBLIC_HEALTH_CHECK_SECONDS" ]; then
    last_public_check="$now"
    if ! url_is_ready "$(local_camera_url)"; then
      local_health_failures=$((local_health_failures + 1))
      echo "Local camera health check failed (${local_health_failures}/${LOCAL_HEALTH_FAILURE_LIMIT})." >&2
      if [ "$local_health_failures" -ge "$LOCAL_HEALTH_FAILURE_LIMIT" ]; then
        echo "Local camera stream stopped; restarting controller/tunnel." >&2
        kill "$JAVA_PID" 2>/dev/null || true
        break
      fi
    else
      local_health_failures=0
    fi
    if ! public_url_is_ready "$public_camera_url"; then
      public_health_failures=$((public_health_failures + 1))
      echo "Public camera URL health check failed (${public_health_failures}/${PUBLIC_HEALTH_FAILURE_LIMIT}): $public_camera_url" >&2
      if ! public_health_can_restart "$public_camera_url"; then
        echo "Keeping quick tunnel alive; Raspberry-side public self-check can fail while external clients still connect." >&2
        public_health_failures=0
      elif ! public_dns_is_ready "$public_camera_url"; then
        echo "Public camera DNS is not reachable: $public_camera_url" >&2
        if [ "$public_health_failures" -ge "$PUBLIC_HEALTH_FAILURE_LIMIT" ]; then
          echo "Public camera DNS stayed unreachable; restarting controller to rebuild tunnel." >&2
          kill "$JAVA_PID" 2>/dev/null || true
          break
        fi
      elif [ "$public_health_failures" -ge "$PUBLIC_HEALTH_FAILURE_LIMIT" ]; then
        echo "Public camera URL is not reachable anymore: $public_camera_url; restarting controller to rebuild tunnel." >&2
        kill "$JAVA_PID" 2>/dev/null || true
        break
      fi
    else
      public_health_failures=0
    fi
  fi

  sleep 10
done

wait "$JAVA_PID" 2>/dev/null || true
