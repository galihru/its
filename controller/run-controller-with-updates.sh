#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$SCRIPT_DIR/out"
MAIN_CLASS="ItsController"
. "$SCRIPT_DIR/controller-classpath.sh"

mkdir -p "$OUT_DIR"

# Exit code 42 means restart needed (update applied)
restart_code=42

while [ $restart_code -eq 42 ]; do
  restart_code=0
  
  # Compile if needed
  needs_compile=false
  if [ ! -f "$OUT_DIR/${MAIN_CLASS}.class" ]; then
    needs_compile=true
  else
    while IFS= read -r source_file; do
      if [ "$source_file" -nt "$OUT_DIR/${MAIN_CLASS}.class" ]; then
        needs_compile=true
        break
      fi
    done < <(find "$SCRIPT_DIR" -maxdepth 1 -name "*.scala" ! -name "MainWithGpio.scala" | sort)
  fi

  if [ "$needs_compile" = true ]; then
    echo "[$(date)] Compiling controller Scala sources..."
    mapfile -t SCALA_SOURCES < <(find "$SCRIPT_DIR" -maxdepth 1 -name "*.scala" ! -name "MainWithGpio.scala" | sort)
    scalac -d "$OUT_DIR" "${SCALA_SOURCES[@]}" || exit 1
    echo "[$(date)] Compilation successful"
  fi

  # Run scala controller
  echo "[$(date)] Starting controller..."
  scala -cp "$OUT_DIR:$(controller_classpath "$SCRIPT_DIR/ItsController.jar")" "$MAIN_CLASS" || restart_code=$?

  if [ $restart_code -eq 42 ]; then
    echo "[$(date)] Update detected, restarting..."
    sleep 2
  elif [ $restart_code -ne 0 ]; then
    echo "[$(date)] Controller exited with code $restart_code"
    exit $restart_code
  fi
done

echo "[$(date)] Controller stopped gracefully"
