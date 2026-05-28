#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODEL_DIR="${ITS_YOLO_MODEL_DIR:-/home/raspberry5its/models}"
MODEL_NAME="${ITS_YOLO_MODEL_NAME:-yolo26n}"
MODEL_PATH="$MODEL_DIR/$MODEL_NAME.onnx"
MODEL_URL="${ITS_YOLO_MODEL_URL:-https://itstelkom.web.app/artifacts/yolo26n.onnx?v=20260527-1705}"
VENV_DIR="${ITS_YOLO_VENV_DIR:-$SCRIPT_DIR/.venv-yolo}"

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this script as the Raspberry Pi user, not root." >&2
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y python3-venv python3-pip ffmpeg v4l-utils libopencv-java
fi

mkdir -p "$MODEL_DIR"
download_model() {
  local tmp="$MODEL_PATH.tmp"
  rm -f "$tmp"
  echo "Downloading YOLO ONNX model: $MODEL_URL"
  if command -v curl >/dev/null 2>&1; then
    curl -fL "$MODEL_URL" -o "$tmp"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$tmp" "$MODEL_URL"
  else
    python3 - "$MODEL_URL" "$tmp" <<'PY'
import sys
import urllib.request

urllib.request.urlretrieve(sys.argv[1], sys.argv[2])
PY
  fi
  if [ -s "$tmp" ]; then
    mv "$tmp" "$MODEL_PATH"
    return 0
  fi
  rm -f "$tmp"
  return 1
}

if [ ! -f "$MODEL_PATH" ]; then
  if download_model; then
    echo "Downloaded YOLO ONNX model: $MODEL_PATH"
  else
    echo "Direct ONNX download failed, exporting from Ultralytics weights..."
  fi
fi

if [ ! -f "$MODEL_PATH" ]; then
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip wheel setuptools
"$VENV_DIR/bin/python" -m pip install --upgrade ultralytics onnx onnxslim

  "$VENV_DIR/bin/python" - "$MODEL_DIR" "$MODEL_NAME" <<'PY'
import pathlib
import sys
from ultralytics import YOLO

model_dir = pathlib.Path(sys.argv[1])
model_name = sys.argv[2]
model_dir.mkdir(parents=True, exist_ok=True)

model = YOLO(f"{model_name}.pt")
exported = pathlib.Path(model.export(format="onnx", imgsz=640, simplify=True, dynamic=False))
target = model_dir / f"{model_name}.onnx"
target.write_bytes(exported.read_bytes())
print(target)
PY
fi

echo "YOLO ONNX model ready: $MODEL_PATH"
echo "OpenCV Java jars:"
ls -1 /usr/share/java/opencv*.jar 2>/dev/null || true
