#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEVICE_ID="${ITS_DEVICE_ID:-raspberry-its}"
FIREBASE_ROOT_URL="${ITS_FIREBASE_ROOT_URL:-https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app}"
FIREBASE_AUTH="${ITS_FIREBASE_AUTH:-}"
INTERVAL_SECONDS="${ITS_HEARTBEAT_INTERVAL_SECONDS:-5}"
PUBLIC_URL_FILE="${ITS_CAMERA_PUBLIC_URL_FILE:-$SCRIPT_DIR/camera-public-url.current}"
LOCAL_CAMERA_PORT="${ITS_CAMERA_WEBRTC_PORT:-8080}"
LOCAL_CAMERA_HEALTH_PATH="${ITS_CAMERA_LOCAL_HEALTH_PATH:-health}"
LOCAL_CAMERA_EXTRA_PORTS="${ITS_CAMERA_LOCAL_PORTS:-${ITS_CAMERA_PUBLIC_PROXY_PORT:-8890} ${ITS_CAMERA_HLS_PORT:-8888} 8080}"

now_ms() {
  date +%s%3N
}

json_escape() {
  if command -v python3 >/dev/null 2>&1; then
    printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])'
  else
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
  fi
}

auth_query() {
  if [ -n "$FIREBASE_AUTH" ]; then
    printf '?auth=%s' "$FIREBASE_AUTH"
  fi
}

firebase_device_url() {
  printf '%s/devices/%s.json%s' "${FIREBASE_ROOT_URL%/}" "$DEVICE_ID" "$(auth_query)"
}

service_state() {
  local name="$1"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl is-active "$name" 2>/dev/null || true
  else
    printf 'unknown'
  fi
}

read_public_url() {
  local url=""
  if [ -f "$PUBLIC_URL_FILE" ]; then
    url="$(tr -d '\r\n' < "$PUBLIC_URL_FILE" 2>/dev/null || true)"
  fi
  if [ -z "$url" ]; then
    url="${ITS_CAMERA_PUBLIC_URL:-${ITS_CAMERA_WEBRTC_URL:-}}"
  fi
  printf '%s' "$url"
}

url_dir() {
  local url="${1%%\?*}"
  printf '%s/' "${url%/*}"
}

url_origin() {
  printf '%s' "$1" | sed -E 's#^(https?://[^/]+).*$#\1/#'
}

hls_segment_ok() {
  local playlist_url="$1"
  local depth="${2:-0}"
  local playlist segment segment_url sample size
  playlist="$(curl -fsS --max-time 8 "$playlist_url" 2>/dev/null || true)"
  printf '%s' "$playlist" | head -c 256 | grep -q '#EXTM3U' || return 1
  segment="$(printf '%s\n' "$playlist" | awk 'NF && $0 !~ /^#/ { line=$0 } END { print line }')"
  [ -n "$segment" ] || return 1
  case "$segment" in
    http://*|https://*) segment_url="$segment" ;;
    *) segment_url="$(url_dir "$playlist_url")$segment" ;;
  esac
  if [[ "$segment_url" == *.m3u8* ]]; then
    [ "$depth" -lt 2 ] || return 1
    hls_segment_ok "$segment_url" $((depth + 1))
    return
  fi
  sample="$(curl -fsS --max-time 8 --range 0-4095 "$segment_url" 2>/dev/null | head -c 4096 || true)"
  printf '%s' "$sample" | head -c 32 | grep -q '#EXTM3U' && return 1
  size="$(printf '%s' "$sample" | wc -c | tr -d ' ' || true)"
  [ "${size:-0}" -ge 512 ]
}

jpeg_snapshot_ok() {
  local snapshot_url="$1"
  local magic
  magic="$(curl -fsS --max-time 8 "$snapshot_url" 2>/dev/null | head -c 2 | od -An -tx1 | tr -d ' \n' || true)"
  [ "$magic" = "ffd8" ]
}

public_camera_ok() {
  local url="$1"
  [ -n "$url" ] || return 1
  if [[ "$url" == *.m3u8* ]]; then
    hls_segment_ok "$url"
    return
  fi
  if [[ "$url" == */ ]]; then
    hls_segment_ok "${url}index.m3u8" && return 0
    jpeg_snapshot_ok "$(url_origin "$url")snapshot.jpg" && return 0
    return 1
  fi
  if [[ "$url" == *.jpg* || "$url" == *.jpeg* ]]; then
    jpeg_snapshot_ok "$url"
    return
  fi
  local body
  body="$(curl -fsS --max-time 8 "$url" 2>/dev/null | head -c 256 || true)"
  [ -n "$body" ] && ! printf '%s' "$body" | grep -Eiq '<html|cloudflare tunnel error|error code: 1033'
}

local_camera_ok() {
  local port path url body
  for port in "$LOCAL_CAMERA_PORT" $LOCAL_CAMERA_EXTRA_PORTS; do
    [ -n "$port" ] || continue
    for path in "${LOCAL_CAMERA_HEALTH_PATH#/}" health cam/index.m3u8 stream.mjpg snapshot.jpg; do
      [ -n "$path" ] || continue
      url="http://127.0.0.1:${port}/${path}"
      if [ "$path" = "cam/index.m3u8" ]; then
        body="$(curl -fsS --max-time 5 "$url" 2>/dev/null | head -c 128 || true)"
        printf '%s' "$body" | grep -q '#EXTM3U' && return 0
      elif [ "$path" = "snapshot.jpg" ]; then
        jpeg_snapshot_ok "$url" && return 0
      elif curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
        return 0
      fi
    done
  done
  return 1
}

local_ip() {
  local ip=""
  ip="$(hostname -I 2>/dev/null | tr ' ' '\n' | awk '/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ && $0 != "127.0.0.1" { print; exit }' || true)"
  if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then
    ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }' || true)"
  fi
  printf '%s' "$ip"
}

boot_id() {
  cat /proc/sys/kernel/random/boot_id 2>/dev/null || hostname 2>/dev/null || printf 'unknown'
}

uptime_seconds() {
  awk '{ print int($1) }' /proc/uptime 2>/dev/null || printf '0'
}

publish_heartbeat() {
  local now public_url controller_state camera_state update_state local_ok public_ok camera_ready camera_status note
  now="$(now_ms)"
  public_url="$(read_public_url)"
  controller_state="$(service_state its-controller.service)"
  camera_state="$(service_state camera-stream.service)"
  update_state="$(service_state its-controller-update.timer)"

  local_ok=false
  public_ok=false
  if local_camera_ok; then local_ok=true; fi
  if public_camera_ok "$public_url"; then public_ok=true; fi

  camera_ready=false
  camera_status="error"
  note="kamera belum sehat"
  if [ "$public_ok" = "true" ]; then
    camera_ready=true
    camera_status="online"
    note="playlist dan segmen video publik valid"
  elif [ "$local_ok" = "true" ]; then
    camera_status="local-only"
    note="kamera lokal hidup, tunnel publik belum sehat"
  elif [ "$camera_state" = "active" ]; then
    note="service kamera aktif, frame/playlist belum valid"
  fi

  local payload
  payload="$(cat <<JSON
{
  "status": "online",
  "lastSeen": $now,
  "updatedAt": $now,
  "cameraStatus": "$(json_escape "$camera_status")",
  "cameraReady": $camera_ready,
  "cameraUpdatedAt": $now,
  "cameraUrl": "$(json_escape "$public_url")",
  "webrtcUrl": "$(json_escape "$public_url")",
  "runtime": {
    "source": "raspberry-heartbeat-agent",
    "heartbeatAt": $now,
    "localIp": "$(json_escape "$(local_ip)")",
    "bootId": "$(json_escape "$(boot_id)")",
    "uptimeSec": $(uptime_seconds),
    "controllerState": "$(json_escape "$controller_state")",
    "cameraStreamState": "$(json_escape "$camera_state")",
    "updateTimerState": "$(json_escape "$update_state")",
    "cameraLocalOk": $local_ok,
    "cameraPublicOk": $public_ok,
    "cameraPublicUrl": "$(json_escape "$public_url")",
    "cameraNote": "$(json_escape "$note")"
  }
}
JSON
)"

  curl -fsS -X PATCH \
    -H "Content-Type: application/json" \
    --data "$payload" \
    "$(firebase_device_url)" >/dev/null
}

while true; do
  publish_heartbeat || true
  sleep "$INTERVAL_SECONDS"
done
