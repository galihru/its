#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_FILE="$SCRIPT_DIR/ItsController.jar"
BACKUP_FILE="$SCRIPT_DIR/ItsController.jar.previous"
TMP_FILE="$(mktemp "$SCRIPT_DIR/.ItsController.jar.XXXXXX")"
LOCK_FILE="$SCRIPT_DIR/.update-controller.lock"
DOWNLOAD_URL="${ITS_CONTROLLER_JAR_URL:-https://itstelkom.web.app/artifacts/ItsController.jar?v=20260527-1705}"
SERVICE_NAME="${ITS_CONTROLLER_SERVICE_NAME:-its-controller}"
SERVICE_USER="${ITS_CONTROLLER_SERVICE_USER:-raspberry5its}"
SERVICE_GROUP="${ITS_CONTROLLER_SERVICE_GROUP:-raspberry5its}"
REBOOT_AFTER_UPDATE="${ITS_CONTROLLER_REBOOT_AFTER_UPDATE:-true}"
DEVICE_ID="${ITS_DEVICE_ID:-raspberry-its}"
FIREBASE_URL="${ITS_FIREBASE_BASE_URL:-https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices}"
FIREBASE_AUTH="${ITS_FIREBASE_AUTH:-}"
UPDATE_STATUS_FILE="${ITS_UPDATE_STATUS_PATH:-$SCRIPT_DIR/update-status.json}"
NOTICE_PAUSE_SECONDS="${ITS_UPDATE_NOTICE_PAUSE_SECONDS:-5}"

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
  update_body="$(printf '{"status":"%s","stage":"%s","message":"%s","updatedAt":%s,"source":"systemd-update"}' \
    "$(json_escape "$status")" \
    "$(json_escape "$stage")" \
    "$(json_escape "$message")" \
    "$updated_at")"

  mkdir -p "$(dirname "$UPDATE_STATUS_FILE")" 2>/dev/null || true
  printf '%s\n' "$update_body" > "$UPDATE_STATUS_FILE" 2>/dev/null || true
  chown "$SERVICE_USER:$SERVICE_GROUP" "$UPDATE_STATUS_FILE" 2>/dev/null || true

  local payload
  payload="$(printf '{"update":%s,"updateStatus":"%s","updateStage":"%s","updateMessage":"%s","updateUpdatedAt":%s,"updateSource":"systemd-update"}' \
    "$update_body" \
    "$(json_escape "$status")" \
    "$(json_escape "$stage")" \
    "$(json_escape "$message")" \
    "$updated_at")"

  if command -v curl >/dev/null 2>&1 && [ -n "$FIREBASE_URL" ]; then
    curl -fsS -X PATCH \
      -H "Content-Type: application/json" \
      --data "$payload" \
      "${FIREBASE_URL%/}/${DEVICE_ID}.json$(auth_suffix)" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  rm -f "$TMP_FILE"
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

publish_update_status "running" "downloading" "Mengunduh file controller terbaru"
curl -fL --retry 3 --retry-delay 2 --connect-timeout 10 "$DOWNLOAD_URL" -o "$TMP_FILE"

if [ -f "$JAR_FILE" ] && cmp -s "$TMP_FILE" "$JAR_FILE"; then
  echo "Controller JAR already up to date."
  publish_update_status "complete" "up-to-date" "Controller sudah versi terbaru"
  exit 0
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop "$SERVICE_NAME" || true
fi
publish_update_status "running" "downloaded" "File controller terbaru berhasil diunduh"
sleep "$NOTICE_PAUSE_SECONDS" || true
publish_update_status "running" "installing" "Menerapkan update controller dan menghentikan service"

chmod 0644 "$TMP_FILE"
if [ -f "$JAR_FILE" ]; then
  cp -f "$JAR_FILE" "$BACKUP_FILE"
fi
mv -f "$TMP_FILE" "$JAR_FILE"
chown "$SERVICE_USER:$SERVICE_GROUP" "$JAR_FILE"
sync "$JAR_FILE" || true
trap - EXIT

if command -v systemctl >/dev/null 2>&1; then
  if [ "${REBOOT_AFTER_UPDATE,,}" = "true" ] || [ "${REBOOT_AFTER_UPDATE}" = "1" ]; then
    echo "Updated controller JAR. Rebooting Raspberry Pi so $SERVICE_NAME starts cleanly."
    publish_update_status "running" "rebooting" "Update berhasil diterapkan. Raspberry Pi akan restart"
    sleep "$NOTICE_PAUSE_SECONDS" || true
    systemctl reboot
    exit 0
  fi

  systemctl restart "$SERVICE_NAME"
fi

publish_update_status "complete" "restarted" "Update berhasil diterapkan dan controller sudah direstart"
sleep "$NOTICE_PAUSE_SECONDS" || true
echo "Updated controller JAR and restarted $SERVICE_NAME"
