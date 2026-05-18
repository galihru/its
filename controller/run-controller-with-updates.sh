#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/out"
SOURCE_FILE="$SCRIPT_DIR/Main.scala"
MAIN_CLASS="ItsController"

mkdir -p "$OUT_DIR"

# Exit code 42 means restart needed (update applied)
restart_code=42

while [ $restart_code -eq 42 ]; do
  restart_code=0
  
  # Compile if needed
  if [ ! -f "$OUT_DIR/${MAIN_CLASS}.class" ] || [ "$SOURCE_FILE" -nt "$OUT_DIR/${MAIN_CLASS}.class" ]; then
    echo "[$(date)] Compiling Main.scala..."
    scalac -d "$OUT_DIR" "$SOURCE_FILE" || exit 1
    echo "[$(date)] Compilation successful"
  fi

  # Run scala controller
  echo "[$(date)] Starting controller..."
  scala -cp "$OUT_DIR" "$MAIN_CLASS" || restart_code=$?

  if [ $restart_code -eq 42 ]; then
    echo "[$(date)] Update detected, restarting..."
    sleep 2
  elif [ $restart_code -ne 0 ]; then
    echo "[$(date)] Controller exited with code $restart_code"
    exit $restart_code
  fi
done

echo "[$(date)] Controller stopped gracefully"
