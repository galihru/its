#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_VENV="$SCRIPT_DIR/.venv-webrtc/bin/python"

if [ -z "${ITS_WEBRTC_PYTHON:-}" ] && [ -x "$DEFAULT_VENV" ]; then
  PYTHON_BIN="$DEFAULT_VENV"
else
  PYTHON_BIN="${ITS_WEBRTC_PYTHON:-python3}"
fi

exec "$PYTHON_BIN" "$SCRIPT_DIR/webrtc-camera.py"
