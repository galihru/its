#!/usr/bin/env bash
set -euo pipefail

MODEL_PATH="${ITS_YOLO_MODEL_PATH:-/home/raspberry5its/models/yolo26n.onnx}"
CAMERA_SOURCE="${ITS_YOLO_CAMERA_SOURCE:-${ITS_CAMERA_SOURCE:-${ITS_CAMERA_DEVICE:-/dev/video0}}}"
RED_PIN="${ITS_GPIO_RED_PIN:-17}"
YELLOW_PIN="${ITS_GPIO_YELLOW_PIN:-27}"
GREEN_PIN="${ITS_GPIO_GREEN_PIN:-22}"

section() {
  printf '\n== %s ==\n' "$1"
}

run_optional() {
  local label="$1"
  shift
  echo "$ $*"
  if ! "$@"; then
    echo "FAILED: $label"
  fi
}

section "YOLO model"
if [ -f "$MODEL_PATH" ]; then
  ls -lh "$MODEL_PATH"
else
  echo "MISSING: $MODEL_PATH"
  echo "Fix: cd /home/raspberry5its/its-controller && ./install-yolo-runtime.sh"
fi

section "Camera source"
echo "ITS_YOLO_CAMERA_SOURCE=$CAMERA_SOURCE"
if [ -e "$CAMERA_SOURCE" ]; then
  ls -l "$CAMERA_SOURCE"
fi
if command -v v4l2-ctl >/dev/null 2>&1; then
  run_optional "v4l2 devices" v4l2-ctl --list-devices
  if [ -e "$CAMERA_SOURCE" ]; then
    run_optional "v4l2 formats" v4l2-ctl -d "$CAMERA_SOURCE" --list-formats-ext
  fi
else
  echo "v4l2-ctl not found. Install: sudo apt-get install -y v4l-utils"
fi
if command -v fuser >/dev/null 2>&1 && [ -e "$CAMERA_SOURCE" ]; then
  echo "$ fuser -v $CAMERA_SOURCE"
  fuser -v "$CAMERA_SOURCE" || true
fi

section "OpenCV / Java"
run_optional "java version" java -version
ls -1 /usr/share/java/opencv*.jar 2>/dev/null || echo "OpenCV Java jar not found. Install: sudo apt-get install -y libopencv-java"
ldconfig -p 2>/dev/null | grep -E 'libopencv_java|libopencv' | head -20 || true

section "GPIO"
echo "Pins BCM: red=$RED_PIN yellow=$YELLOW_PIN green=$GREEN_PIN"
if command -v pinctrl >/dev/null 2>&1; then
  echo "GPIO command: $(command -v pinctrl)"
  run_optional "pinctrl read red" pinctrl get "$RED_PIN"
  run_optional "pinctrl read yellow" pinctrl get "$YELLOW_PIN"
  run_optional "pinctrl read green" pinctrl get "$GREEN_PIN"
elif command -v raspi-gpio >/dev/null 2>&1; then
  echo "GPIO command: $(command -v raspi-gpio)"
  run_optional "raspi-gpio read red" raspi-gpio get "$RED_PIN"
  run_optional "raspi-gpio read yellow" raspi-gpio get "$YELLOW_PIN"
  run_optional "raspi-gpio read green" raspi-gpio get "$GREEN_PIN"
else
  echo "No pinctrl/raspi-gpio found."
fi
id raspberry5its 2>/dev/null || true

section "Services"
run_optional "controller status" systemctl --no-pager --full status its-controller.service
run_optional "camera status" systemctl --no-pager --full status webrtc-camera.service

section "Recent logs"
run_optional "controller logs" journalctl -u its-controller.service -n 80 --no-pager

section "Next checks"
cat <<'TXT'
1. Jika model MISSING:
   cd /home/raspberry5its/its-controller && ./install-yolo-runtime.sh

2. Jika /dev/video0 dipakai webrtc-camera dan YOLO gagal baca kamera:
   sudo systemctl stop webrtc-camera.service
   sudo systemctl restart its-controller.service

3. Jika LED tidak menyala:
   sudo /home/raspberry5its/its-controller/test-leds.sh
   sudo ITS_GPIO_ACTIVE_LOW=true /home/raspberry5its/its-controller/test-leds.sh
TXT
