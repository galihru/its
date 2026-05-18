#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEVICE="${1:-/dev/video0}"
PORT="${2:-8080}"
WIDTH="${3:-640}"
HEIGHT="${4:-480}"
FPS="${5:-10}"
QUALITY="${6:-5}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg tidak ditemukan. Install ffmpeg di Raspberry Pi dahulu."
  exit 1
fi

echo "Menjalankan kamera dari $DEVICE pada http://0.0.0.0:$PORT/stream.mjpg"

echo "Gunakan browser atau aplikasi web untuk membuka http://<raspi-ip>:$PORT/stream.mjpg"

exec ffmpeg -f v4l2 -framerate "$FPS" -video_size "${WIDTH}x${HEIGHT}" -i "$DEVICE" \
  -c:v mjpeg -q:v "$QUALITY" -f mjpeg "http://0.0.0.0:${PORT}/stream.mjpg?listen=1"
