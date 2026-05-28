#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${ITS_CONTROLLER_TARGET_DIR:-/home/raspberry5its/its-controller}"
SERVICE_DIR="${ITS_SYSTEMD_DIR:-/etc/systemd/system}"
SERVICE_NAME="${ITS_CONTROLLER_SERVICE_NAME:-its-controller.service}"
UPDATE_SERVICE_NAME="${ITS_CONTROLLER_UPDATE_SERVICE_NAME:-its-controller-update.service}"
UPDATE_TIMER_NAME="${ITS_CONTROLLER_UPDATE_TIMER_NAME:-its-controller-update.timer}"
ENABLE_WEBRTC_SERVICE="${ITS_ENABLE_WEBRTC_SERVICE:-false}"
ENABLE_CAMERA_STREAM_SERVICE="${ITS_ENABLE_CAMERA_STREAM_SERVICE:-true}"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

copy_controller_file() {
  local file="$1"
  local mode="${2:-0644}"
  if [ -f "$SCRIPT_DIR/$file" ]; then
    $SUDO install -D -m "$mode" "$SCRIPT_DIR/$file" "$TARGET_DIR/$file"
    normalize_text_file "$TARGET_DIR/$file"
  fi
}

normalize_text_file() {
  local file="$1"
  case "$file" in
    *.sh|*.service|*.timer|*.py|*.scala|*.txt|*.md|*.json)
      $SUDO sed -i 's/\r$//' "$file"
      ;;
  esac
}

install_service_file() {
  local source_file="$1"
  local target_file="$2"
  $SUDO install -D -m 0644 "$SCRIPT_DIR/$source_file" "$target_file"
  normalize_text_file "$target_file"
}

$SUDO mkdir -p "$TARGET_DIR"

copy_controller_file "ItsController.jar" 0644
copy_controller_file "Main.scala" 0644
copy_controller_file "TrafficLight.scala" 0644
copy_controller_file "YoloDetector.scala" 0644
copy_controller_file "build-controller-jar.sh" 0755
copy_controller_file "build-jar.sh" 0755
copy_controller_file "controller-classpath.sh" 0755
copy_controller_file "run-controller.sh" 0755
copy_controller_file "run-controller-public.sh" 0755
copy_controller_file "run-controller-with-updates.sh" 0755
copy_controller_file "update-controller.sh" 0755
copy_controller_file "install-yolo-runtime.sh" 0755
copy_controller_file "test-leds.sh" 0755
copy_controller_file "diagnose-controller.sh" 0755
copy_controller_file "requirements-webrtc.txt" 0644
copy_controller_file "webrtc-camera.py" 0755
copy_controller_file "webrtc-camera.sh" 0755
copy_controller_file "camera-stream.sh" 0755

$SUDO chown -R raspberry5its:raspberry5its "$TARGET_DIR" || true

install_service_file "its-controller.service" "$SERVICE_DIR/$SERVICE_NAME"
install_service_file "its-controller-update.service" "$SERVICE_DIR/$UPDATE_SERVICE_NAME"
install_service_file "its-controller-update.timer" "$SERVICE_DIR/$UPDATE_TIMER_NAME"
install_service_file "webrtc-camera.service" "$SERVICE_DIR/webrtc-camera.service"
install_service_file "camera-stream.service" "$SERVICE_DIR/camera-stream.service"

$SUDO systemctl daemon-reload
$SUDO systemctl enable "$SERVICE_NAME"
$SUDO systemctl enable "$UPDATE_TIMER_NAME"

if [ "${ENABLE_CAMERA_STREAM_SERVICE,,}" = "true" ] || [ "$ENABLE_CAMERA_STREAM_SERVICE" = "1" ]; then
  $SUDO systemctl enable camera-stream.service
  $SUDO systemctl restart camera-stream.service
fi

if [ "${ENABLE_WEBRTC_SERVICE,,}" = "true" ] || [ "$ENABLE_WEBRTC_SERVICE" = "1" ]; then
  $SUDO systemctl enable webrtc-camera.service
  $SUDO systemctl restart webrtc-camera.service
else
  $SUDO systemctl disable webrtc-camera.service >/dev/null 2>&1 || true
  $SUDO systemctl stop webrtc-camera.service >/dev/null 2>&1 || true
fi

$SUDO systemctl restart "$SERVICE_NAME"
$SUDO systemctl restart "$UPDATE_TIMER_NAME"

echo "Installed controller files to $TARGET_DIR"
echo "Controller: sudo systemctl status $SERVICE_NAME"
echo "Camera:     sudo systemctl status camera-stream.service"
echo "Updates:    sudo systemctl status $UPDATE_TIMER_NAME"
