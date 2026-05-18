#!/usr/bin/env bash
# Script to upload ItsController.jar to Firebase
# Usage: ./upload-jar.sh <firebase-url> <firebase-auth> [version]

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <firebase-url> <firebase-auth> [version]"
  echo "Example: $0 'https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app' 'your-auth-token' '1.0.1'"
  exit 1
fi

FIREBASE_URL="$1"
FIREBASE_AUTH="$2"
VERSION="${3:-1.0.0}"
JAR_FILE="${4:-./ItsController.jar}"

if [ ! -f "$JAR_FILE" ]; then
  echo "Error: $JAR_FILE not found"
  exit 1
fi

# Read JAR content and base64 encode
JAR_CONTENT=$(base64 -w 0 "$JAR_FILE")

# Compute checksum
CHECKSUM=$(md5sum "$JAR_FILE" | awk '{print $1}')

# Create JSON payload
TIMESTAMP=$(date +%s)
PAYLOAD=$(cat <<EOF
{
  "jar": "$JAR_CONTENT",
  "version": "$VERSION",
  "checksum": "$CHECKSUM",
  "uploadedAt": $TIMESTAMP,
  "uploadedAtText": "$(date)"
}
EOF
)

# Upload to Firebase
UPDATE_PATH="${FIREBASE_URL}/artifacts/ItsController.jar.json?auth=${FIREBASE_AUTH}"

echo "[$(date)] Uploading JAR to Firebase..."
echo "Path: $UPDATE_PATH"
echo "Version: $VERSION"
echo "Checksum: $CHECKSUM"

RESPONSE=$(curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$UPDATE_PATH")

if [ $? -eq 0 ]; then
  echo "Upload successful"
  echo "Response: $RESPONSE"
else
  echo "Upload failed"
  exit 1
fi