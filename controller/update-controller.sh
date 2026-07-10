#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_FILE="$SCRIPT_DIR/ItsController.jar"
BACKUP_FILE="$SCRIPT_DIR/ItsController.jar.previous"
LOCK_FILE="$SCRIPT_DIR/.update-controller.lock"
TMP_FILE="$(mktemp "$SCRIPT_DIR/.ItsController.jar.XXXXXX")"
TMP_BUNDLE="$(mktemp "$SCRIPT_DIR/.its-controller-files.tar.gz.XXXXXX")"
TMP_DIR="$(mktemp -d "$SCRIPT_DIR/.controller-bundle.XXXXXX")"
BUNDLE_CACHE="$SCRIPT_DIR/its-controller-files.tar.gz.current"

BUNDLE_URL="${ITS_CONTROLLER_BUNDLE_URL:-https://itstelkom.web.app/artifacts/its-controller-files.tar.gz?v=20260616-video-ip-hud}"
DOWNLOAD_URL="${ITS_CONTROLLER_JAR_URL:-https://itstelkom.web.app/artifacts/ItsController.jar?v=20260616-video-ip-hud}"
SERVICE_NAME="${ITS_CONTROLLER_SERVICE_NAME:-its-controller}"
SERVICE_USER="${ITS_CONTROLLER_SERVICE_USER:-raspberry5its}"
SERVICE_GROUP="${ITS_CONTROLLER_SERVICE_GROUP:-raspberry5its}"
REBOOT_AFTER_UPDATE="${ITS_CONTROLLER_REBOOT_AFTER_UPDATE:-false}"
DEVICE_ID="${ITS_DEVICE_ID:-raspberry-its}"
FIREBASE_URL="${ITS_FIREBASE_BASE_URL:-https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices}"
FIREBASE_AUTH="${ITS_FIREBASE_AUTH:-}"
PUBLISH_FIREBASE_STATUS="${ITS_UPDATE_STATUS_FIREBASE_ENABLED:-true}"
UPDATE_STATUS_FILE="${ITS_UPDATE_STATUS_PATH:-$SCRIPT_DIR/update-status.json}"
NOTICE_PAUSE_SECONDS="${ITS_UPDATE_NOTICE_PAUSE_SECONDS:-2}"

json_escape() {
  printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])' 2>/dev/null || printf '%s' "$1"
}

now_ms() {
  date +%s%3N
}

auth_suffix() {
  if [ -n "$FIREBASE_AUTH" ]; then
    printf '?auth=%s' "$FIREBASE_AUTH"
  fi
}

publish_update_status() {
  local status="$1"
  local stage="$2"
  local message="$3"
  local updated_at
  updated_at="$(now_ms)"
  local update_body
  update_body="$(printf '{"status":"%s","stage":"%s","message":"%s","updatedAt":%s,"source":"systemd-bundle-update"}' \
    "$(json_escape "$status")" \
    "$(json_escape "$stage")" \
    "$(json_escape "$message")" \
    "$updated_at")"

  mkdir -p "$(dirname "$UPDATE_STATUS_FILE")" 2>/dev/null || true
  printf '%s\n' "$update_body" > "$UPDATE_STATUS_FILE" 2>/dev/null || true
  chown "$SERVICE_USER:$SERVICE_GROUP" "$UPDATE_STATUS_FILE" 2>/dev/null || true

  local payload
  payload="$(printf '{"update":%s,"updateStatus":"%s","updateStage":"%s","updateMessage":"%s","updateUpdatedAt":%s,"updateSource":"systemd-bundle-update"}' \
    "$update_body" \
    "$(json_escape "$status")" \
    "$(json_escape "$stage")" \
    "$(json_escape "$message")" \
    "$updated_at")"

  if [ "$PUBLISH_FIREBASE_STATUS" = "true" ] && command -v curl >/dev/null 2>&1 && [ -n "$FIREBASE_URL" ]; then
    curl -fsS -X PATCH \
      -H "Content-Type: application/json" \
      --data "$payload" \
      "${FIREBASE_URL%/}/${DEVICE_ID}.json$(auth_suffix)" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  rm -f "$TMP_FILE" "$TMP_BUNDLE"
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT
trap 'publish_update_status "error" "failed" "Update gagal. Cek journalctl -u its-controller-update.service"; cleanup' ERR

exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || {
    echo "Another controller update is already running."
    publish_update_status "running" "locked" "Update lain sedang berjalan"
    exit 0
  }
fi

is_true() {
  [ "${1,,}" = "true" ] || [ "$1" = "1" ] || [ "${1,,}" = "yes" ]
}

file_looks_like_html() {
  local file="$1"
  head -c 128 "$file" 2>/dev/null | tr '[:upper:]' '[:lower:]' | grep -Eq '<!doctype|<html|<head|<body'
}

download_to() {
  local url="$1"
  local file="$2"
  local label="$3"
  if [ -z "$url" ]; then
    return 1
  fi
  echo "Downloading $label from $url"
  curl -fL --retry 3 --retry-delay 2 --connect-timeout 10 --max-time 120 "$url" -o "$file"
  if [ ! -s "$file" ]; then
    echo "$label download is empty." >&2
    return 1
  fi
  if file_looks_like_html "$file"; then
    echo "$label download returned HTML, not an update artifact." >&2
    return 1
  fi
}

validate_jar() {
  local file="$1"
  if command -v jar >/dev/null 2>&1; then
    jar tf "$file" >/dev/null
  elif command -v unzip >/dev/null 2>&1; then
    unzip -t "$file" >/dev/null
  else
    file "$file" 2>/dev/null | grep -qi 'zip\|jar'
  fi
}

install_bundle_update() {
  if [ -z "$BUNDLE_URL" ]; then
    return 1
  fi

  publish_update_status "running" "downloading-bundle" "Mengunduh bundle controller lengkap"
  if ! download_to "$BUNDLE_URL" "$TMP_BUNDLE" "controller bundle"; then
    publish_update_status "error" "invalid-bundle" "Bundle update tidak valid atau mengarah ke HTML"
    return 1
  fi

  if ! tar -tzf "$TMP_BUNDLE" >/dev/null 2>&1; then
    publish_update_status "error" "invalid-bundle" "Bundle update bukan tar.gz valid"
    return 1
  fi

  if [ -f "$BUNDLE_CACHE" ] && cmp -s "$TMP_BUNDLE" "$BUNDLE_CACHE"; then
    echo "Controller bundle already up to date."
    publish_update_status "complete" "up-to-date" "Bundle controller sudah versi terbaru"
    return 0
  fi

  publish_update_status "running" "extracting-bundle" "Mengekstrak bundle controller lengkap"
  tar -xzf "$TMP_BUNDLE" -C "$TMP_DIR"

  local installer="$TMP_DIR/install-controller-files.sh"
  if [ ! -f "$installer" ]; then
    installer="$(find "$TMP_DIR" -maxdepth 2 -name install-controller-files.sh | head -n 1 || true)"
  fi
  if [ -z "$installer" ] || [ ! -f "$installer" ]; then
    publish_update_status "error" "invalid-bundle" "Bundle tidak berisi install-controller-files.sh"
    return 1
  fi

  chmod +x "$installer"
  publish_update_status "running" "installing-bundle" "Memasang service, script kamera, GPS, LED, dan JAR terbaru"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop "$SERVICE_NAME" camera-stream.service webrtc-camera.service >/dev/null 2>&1 || true
  fi
  ITS_CONTROLLER_TARGET_DIR="$SCRIPT_DIR" \
  ITS_SYSTEMD_DIR="${ITS_SYSTEMD_DIR:-/etc/systemd/system}" \
  ITS_UPDATE_STATUS_FIREBASE_ENABLED="$PUBLISH_FIREBASE_STATUS" \
  "$installer"

  cp -f "$TMP_BUNDLE" "$BUNDLE_CACHE"
  chown "$SERVICE_USER:$SERVICE_GROUP" "$BUNDLE_CACHE" 2>/dev/null || true
  sync "$BUNDLE_CACHE" || true
  publish_update_status "complete" "bundle-installed" "Bundle controller lengkap sudah dipasang dan service direstart"
  return 0
}

install_jar_update() {
  publish_update_status "running" "downloading-jar" "Mengunduh file controller JAR terbaru"
  download_to "$DOWNLOAD_URL" "$TMP_FILE" "controller JAR"

  if ! validate_jar "$TMP_FILE"; then
    publish_update_status "error" "invalid-jar" "File controller bukan JAR valid"
    return 1
  fi

  if [ -f "$JAR_FILE" ] && cmp -s "$TMP_FILE" "$JAR_FILE"; then
    echo "Controller JAR already up to date."
    publish_update_status "complete" "up-to-date" "Controller sudah versi terbaru"
    return 0
  fi

  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop "$SERVICE_NAME" || true
  fi

  publish_update_status "running" "installing-jar" "Menerapkan update JAR controller"
  sleep "$NOTICE_PAUSE_SECONDS" || true
  chmod 0644 "$TMP_FILE"
  if [ -f "$JAR_FILE" ]; then
    cp -f "$JAR_FILE" "$BACKUP_FILE"
  fi
  mv -f "$TMP_FILE" "$JAR_FILE"
  chown "$SERVICE_USER:$SERVICE_GROUP" "$JAR_FILE" 2>/dev/null || true
  sync "$JAR_FILE" || true

  if command -v systemctl >/dev/null 2>&1; then
    if is_true "$REBOOT_AFTER_UPDATE"; then
      publish_update_status "running" "rebooting" "Update JAR berhasil. Raspberry Pi akan restart"
      sleep "$NOTICE_PAUSE_SECONDS" || true
      systemctl reboot
      exit 0
    fi
    systemctl restart "$SERVICE_NAME"
  fi

  publish_update_status "complete" "restarted" "Update JAR berhasil diterapkan dan controller direstart"
  echo "Updated controller JAR and restarted $SERVICE_NAME"
}

if install_bundle_update; then
  exit 0
fi

install_jar_update
