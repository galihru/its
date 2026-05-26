#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_FILE="$SCRIPT_DIR/ItsController.jar"
TMP_FILE="$(mktemp "$SCRIPT_DIR/.ItsController.jar.XXXXXX")"
DOWNLOAD_URL="${ITS_CONTROLLER_JAR_URL:-https://itstelkom.web.app/artifacts/ItsController.jar}"
SERVICE_NAME="${ITS_CONTROLLER_SERVICE_NAME:-its-controller}"

cleanup() {
  rm -f "$TMP_FILE"
}

trap cleanup EXIT

curl -fL --retry 3 --retry-delay 2 --connect-timeout 10 "$DOWNLOAD_URL" -o "$TMP_FILE"

if [ -f "$JAR_FILE" ] && cmp -s "$TMP_FILE" "$JAR_FILE"; then
  echo "Controller JAR already up to date."
  exit 0
fi

chmod 0644 "$TMP_FILE"
mv "$TMP_FILE" "$JAR_FILE"
chown raspberry5its:raspberry5its "$JAR_FILE"
trap - EXIT

if command -v systemctl >/dev/null 2>&1; then
  systemctl restart "$SERVICE_NAME"
fi

echo "Updated controller JAR and restarted $SERVICE_NAME"