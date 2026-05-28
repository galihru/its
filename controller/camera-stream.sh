#!/usr/bin/env bash
set -euo pipefail

DEVICE="${ITS_CAMERA_DEVICE:-${1:-auto}}"
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

has_usable_v4l2_format() {
  local device="$1"
  command -v v4l2-ctl >/dev/null 2>&1 || return 1
  v4l2-ctl -d "$device" --list-formats-ext 2>/dev/null | grep -q "Pixel Format"
}

find_v4l2_device() {
  local device
  for device in $(ls /dev/video* 2>/dev/null | sort -V); do
    if has_usable_v4l2_format "$device"; then
      printf '%s' "$device"
      return 0
    fi
  done
  return 1
}

print_camera_info() {
  echo "Device video yang tersedia:"
  ls -l /dev/video* 2>/dev/null || true
  if command -v v4l2-ctl >/dev/null 2>&1; then
    echo "Daftar kamera V4L2:"
    v4l2-ctl --list-devices || true
    if [ "$DEVICE" != "auto" ] && [ -e "$DEVICE" ]; then
      echo "Format kamera pada $DEVICE:"
      v4l2-ctl -d "$DEVICE" --list-formats-ext || true
    fi
  fi
}

run_rpicam() {
  local camera_cmd=""
  if command -v rpicam-vid >/dev/null 2>&1; then
    camera_cmd="rpicam-vid"
  elif command -v libcamera-vid >/dev/null 2>&1; then
    camera_cmd="libcamera-vid"
  fi

  [ -n "$camera_cmd" ] || return 1
  echo "Mencoba kamera Raspberry via $camera_cmd"
  "$camera_cmd" -t 0 --codec mjpeg --width "$WIDTH" --height "$HEIGHT" --framerate "$FPS" -o - \
    | ffmpeg -hide_banner -nostdin -f mjpeg -i pipe:0 -an -c:v copy -f mpjpeg "$OUTPUT_URL"
}

if [ "$DEVICE" = "auto" ]; then
  print_camera_info
  if run_rpicam; then
    exit 0
  fi
  DEVICE="$(find_v4l2_device || true)"
  if [ -z "$DEVICE" ]; then
    echo "Tidak menemukan /dev/video* yang punya Pixel Format."
    echo "Jika kamera Raspberry terpasang, cek: rpicam-hello --list-cameras"
    sleep 10
    exec "$0" auto "$PORT" "$WIDTH" "$HEIGHT" "$FPS" "$QUALITY"
  fi
  echo "Auto memilih V4L2 device: $DEVICE"
fi

if [ ! -e "$DEVICE" ]; then
  echo "Device kamera $DEVICE tidak ditemukan."
  echo "Cek kamera dengan: v4l2-ctl --list-devices"
  exit 1
fi

print_camera_info

run_ffmpeg() {
  local label="$1"
  shift
  echo "Mencoba mode kamera: $label"
  ffmpeg -hide_banner -nostdin "$@" -i "$DEVICE" \
    -an \
    -vf "fps=${FPS},scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2" \
    -c:v mjpeg -q:v "$QUALITY" -f mpjpeg "$OUTPUT_URL"
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
  echo "Jika tetap gagal, jalankan: rpicam-hello --list-cameras || libcamera-hello --list-cameras"
  echo "Lalu cek: v4l2-ctl --list-devices && v4l2-ctl -d $DEVICE --list-formats-ext"
  sleep 10
done
