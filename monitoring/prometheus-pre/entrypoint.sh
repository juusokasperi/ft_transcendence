#!/bin/bash
set -euo pipefail

TARGET_FILE="/etc/prometheus/targets/targets.json"

mkdir -p "$(dirname "$TARGET_FILE")"

cat > "$TARGET_FILE" <<EOF
[
  {
    "targets": [
      "allocator:${ALLOCATOR_PORT}",
      "backend:${BACKEND_PORT}",
      "game-gateway:${GATEWAY_PORT}",
      "matchmaking-service:${MATCHMAKING_PORT}",
      "scorer:${SCORER_PORT}"
    ],
    "labels": {
      "job": "node-backend"
    }
  }
]
EOF

echo "Generated $TARGET_FILE:"
cat "$TARGET_FILE"

