#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/out"
MANIFEST_FILE="$SCRIPT_DIR/manifest.txt"
JAR_FILE="$SCRIPT_DIR/ItsController.jar"

if [ -n "${ITS_CONTROLLER_SOURCES:-}" ]; then
  # shellcheck disable=SC2206
  SCALA_SOURCES=(${ITS_CONTROLLER_SOURCES})
else
  mapfile -t SCALA_SOURCES < <(find "$SCRIPT_DIR" -maxdepth 1 -name "*.scala" ! -name "MainWithGpio.scala" | sort)
fi

if [ "${#SCALA_SOURCES[@]}" -eq 0 ]; then
  echo "No Scala sources found." >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"
rm -rf "$BUILD_DIR"/*
rm -f "$JAR_FILE"

if command -v scala-cli >/dev/null 2>&1; then
  scala-cli --power package "${SCALA_SOURCES[@]}" --server=false --assembly --force --main-class ItsController -o "$JAR_FILE"
else
  scalac -d "$BUILD_DIR" "${SCALA_SOURCES[@]}"
  jar cfm "$JAR_FILE" "$MANIFEST_FILE" -C "$BUILD_DIR" .
fi

echo "Built $JAR_FILE from ${#SCALA_SOURCES[@]} Scala source files"
