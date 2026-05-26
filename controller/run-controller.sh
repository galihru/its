#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_FILE="$SCRIPT_DIR/ItsController.jar"
SOURCE_FILE="${ITS_CONTROLLER_SOURCE_FILE:-$SCRIPT_DIR/Main.scala}"

if [ ! -f "$JAR_FILE" ] || [ "$SOURCE_FILE" -nt "$JAR_FILE" ]; then
  if command -v scalac >/dev/null 2>&1; then
    "$SCRIPT_DIR/build-controller-jar.sh"
  else
    echo "ItsController.jar not found and scalac is unavailable." >&2
    exit 1
  fi
fi

exec java -jar "$JAR_FILE" "$@"
