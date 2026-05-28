#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
JAR_FILE="$SCRIPT_DIR/ItsController.jar"
. "$SCRIPT_DIR/controller-classpath.sh"

needs_build=false
if [ ! -f "$JAR_FILE" ]; then
  needs_build=true
else
  while IFS= read -r source_file; do
    if [ "$source_file" -nt "$JAR_FILE" ]; then
      needs_build=true
      break
    fi
  done < <(find "$SCRIPT_DIR" -maxdepth 1 -name "*.scala" ! -name "MainWithGpio.scala" | sort)
fi

if [ "$needs_build" = true ]; then
  if command -v scalac >/dev/null 2>&1 || command -v scala-cli >/dev/null 2>&1; then
    "$SCRIPT_DIR/build-controller-jar.sh"
  else
    echo "ItsController.jar not found and neither scalac nor scala-cli is available." >&2
    exit 1
  fi
fi

controller_java "$JAR_FILE" "$@"
