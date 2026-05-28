#!/usr/bin/env bash
# Script to upload Main.scala update to Firebase
# Usage: ./upload-update.sh <firebase-url> <firebase-auth> [version]

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <firebase-url> <firebase-auth> [version]"
  echo "Example: $0 'https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app' 'your-auth-token' '1.0.1'"
  exit 1
fi

FIREBASE_URL="$1"
FIREBASE_AUTH="$2"
VERSION="${3:-1.0.0}"
SOURCE_FILE="${4:-./Main.scala}"

if [ ! -f "$SOURCE_FILE" ]; then
  echo "Error: $SOURCE_FILE not found"
  exit 1
fi

# Read file content
CODE=$(cat "$SOURCE_FILE")

# Compute checksum
CHECKSUM=$(echo -n "$CODE" | md5sum | awk '{print $1}')

# Create JSON payload
TIMESTAMP=$(date +%s)
PAYLOAD=$(cat <<EOF
{
  "code": $(echo "$CODE" | jq -Rs .),
  "version": "$VERSION",
  "checksum": "$CHECKSUM",
  "uploadedAt": $TIMESTAMP,
  "uploadedAtText": "$(date)"
}
EOF
)

# Upload to Firebase
UPDATE_PATH="${FIREBASE_URL}/updates/Main.scala.json?auth=${FIREBASE_AUTH}"

echo "[$(date)] Uploading update to Firebase..."
echo "Path: $UPDATE_PATH"
echo "Version: $VERSION"
echo "Checksum: $CHECKSUM"

RESPONSE=$(curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$UPDATE_PATH")

if echo "$RESPONSE" | grep -q "error"; then
  echo "Error uploading to Firebase:"
  echo "$RESPONSE"
  exit 1
else
  echo "[$(date)] Update uploaded successfully!"
  echo "Controllers will detect and apply this update within $UPDATE_CHECK_SECONDS seconds"
fi
