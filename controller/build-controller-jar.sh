#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_FILE="${ITS_CONTROLLER_SOURCE_FILE:-$SCRIPT_DIR/Main.scala}"
BUILD_DIR="$SCRIPT_DIR/out"
MANIFEST_FILE="$SCRIPT_DIR/manifest.txt"
JAR_FILE="$SCRIPT_DIR/ItsController.jar"

if [ ! -f "$SOURCE_FILE" ]; then
  echo "Source file not found: $SOURCE_FILE" >&2
  exit 1
fi

mkdir -p "$BUILD_DIR"
rm -rf "$BUILD_DIR"/*
rm -f "$JAR_FILE"

if command -v scala-cli >/dev/null 2>&1; then
  scala-cli package "$SOURCE_FILE" --assembly --force --main-class ItsController -o "$JAR_FILE"
else
  scalac -d "$BUILD_DIR" "$SOURCE_FILE"
  jar cfm "$JAR_FILE" "$MANIFEST_FILE" -C "$BUILD_DIR" .
fi

echo "Built $JAR_FILE from $(basename "$SOURCE_FILE")"