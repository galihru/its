#!/usr/bin/env bash
set -euo pipefail

DEVICE="${ITS_CAMERA_DEVICE:-${1:-/dev/video0}}"
PORT="${2:-8080}"
WIDTH="${3:-640}"
HEIGHT="${4:-480}"
FPS="${5:-10}"
QUALITY="${6:-5}"
OUTPUT_URL="http://0.0.0.0:${PORT}/stream.mjpg?listen=1"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg tidak ditemukan. Install ffmpeg di Raspberry Pi dahulu."
  exit 1
fi

echo "Menjalankan kamera dari $DEVICE pada http://0.0.0.0:$PORT/stream.mjpg"
echo "Controller akan men-tunnel URL lokal ini via Cloudflare dan mengirim URL publik ke Firebase."

if [ ! -e "$DEVICE" ]; then
  echo "Device kamera $DEVICE tidak ditemukan."
  echo "Cek kamera dengan: v4l2-ctl --list-devices"
  exit 1
fi

if command -v v4l2-ctl >/dev/null 2>&1; then
  echo "Format kamera yang terdeteksi:"
  v4l2-ctl -d "$DEVICE" --list-formats-ext || true
fi

run_ffmpeg() {
  local label="$1"
  shift
  echo "Mencoba mode kamera: $label"
  ffmpeg -hide_banner -nostdin "$@" -i "$DEVICE" \
    -an \
    -vf "fps=${FPS},scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2" \
    -c:v mjpeg -q:v "$QUALITY" -f mjpeg "$OUTPUT_URL"
}

while true; do
  run_ffmpeg "MJPEG ${WIDTH}x${HEIGHT}@${FPS}" \
    -f v4l2 -input_format mjpeg -framerate "$FPS" -video_size "${WIDTH}x${HEIGHT}" && exit 0 || true
  sleep 1

  run_ffmpeg "YUYV422 ${WIDTH}x${HEIGHT}@${FPS}" \
    -f v4l2 -input_format yuyv422 -framerate "$FPS" -video_size "${WIDTH}x${HEIGHT}" && exit 0 || true
  sleep 1

  run_ffmpeg "V4L2 tanpa format paksa" \
    -f v4l2 && exit 0 || true

  echo "Semua mode kamera gagal. Menunggu 10 detik lalu mencoba lagi."
  echo "Jika tetap gagal, jalankan: v4l2-ctl --list-devices && v4l2-ctl -d $DEVICE --list-formats-ext"
  sleep 10
done
