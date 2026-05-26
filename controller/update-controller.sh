#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_FILE="$SCRIPT_DIR/ItsController.jar"
BACKUP_FILE="$SCRIPT_DIR/ItsController.jar.previous"
TMP_FILE="$(mktemp "$SCRIPT_DIR/.ItsController.jar.XXXXXX")"
LOCK_FILE="$SCRIPT_DIR/.update-controller.lock"
DOWNLOAD_URL="${ITS_CONTROLLER_JAR_URL:-https://itstelkom.web.app/artifacts/ItsController.jar}"
SERVICE_NAME="${ITS_CONTROLLER_SERVICE_NAME:-its-controller}"
SERVICE_USER="${ITS_CONTROLLER_SERVICE_USER:-raspberry5its}"
SERVICE_GROUP="${ITS_CONTROLLER_SERVICE_GROUP:-raspberry5its}"
REBOOT_AFTER_UPDATE="${ITS_CONTROLLER_REBOOT_AFTER_UPDATE:-true}"

cleanup() {
  rm -f "$TMP_FILE"
}

trap cleanup EXIT
exec 9>"$LOCK_FILE"
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || {
    echo "Another controller update is already running."
    exit 0
  }
fi

curl -fL --retry 3 --retry-delay 2 --connect-timeout 10 "$DOWNLOAD_URL" -o "$TMP_FILE"

if [ -f "$JAR_FILE" ] && cmp -s "$TMP_FILE" "$JAR_FILE"; then
  echo "Controller JAR already up to date."
  exit 0
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl stop "$SERVICE_NAME" || true
fi

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
    systemctl reboot
    exit 0
  fi

  systemctl restart "$SERVICE_NAME"
fi

echo "Updated controller JAR and restarted $SERVICE_NAME"
