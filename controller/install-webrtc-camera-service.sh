#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="webrtc-camera.service"
VENV_DIR="$SCRIPT_DIR/.venv-webrtc"

if [ "$(id -u)" -eq 0 ]; then
  echo "Jalankan script ini sebagai user Raspberry biasa, bukan root."
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y \
    python3-venv python3-pip ffmpeg v4l-utils \
    libavdevice-dev libavfilter-dev libopus-dev libvpx-dev pkg-config
fi

python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip wheel setuptools
"$VENV_DIR/bin/python" -m pip install -r "$SCRIPT_DIR/requirements-webrtc.txt"

chmod +x "$SCRIPT_DIR/webrtc-camera.sh" "$SCRIPT_DIR/webrtc-camera.py"

sudo cp "$SCRIPT_DIR/$SERVICE_NAME" "/etc/systemd/system/$SERVICE_NAME"
sudo systemctl daemon-reload
if systemctl list-unit-files camera-stream.service >/dev/null 2>&1; then
  sudo systemctl disable --now camera-stream.service || true
fi
sudo systemctl enable "$SERVICE_NAME"
sudo systemctl restart "$SERVICE_NAME"

echo "Service $SERVICE_NAME aktif."
echo "Cek status: sudo systemctl status $SERVICE_NAME"
echo "Cek log:    journalctl -u $SERVICE_NAME -f"
