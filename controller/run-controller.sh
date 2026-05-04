#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/out"
SOURCE_FILE="$SCRIPT_DIR/Main.scala"
MAIN_CLASS="ItsController"

mkdir -p "$OUT_DIR"

if [ ! -f "$OUT_DIR/${MAIN_CLASS}.class" ] || [ "$SOURCE_FILE" -nt "$OUT_DIR/${MAIN_CLASS}.class" ]; then
  scalac -d "$OUT_DIR" "$SOURCE_FILE"
fi

exec scala -cp "$OUT_DIR" "$MAIN_CLASS"
