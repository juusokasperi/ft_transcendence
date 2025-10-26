#!/bin/bash
set -euo pipefail

PROM_FILE="/etc/prometheus/prometheus.yml"
mkdir -p "$(dirname "$PROM_FILE")"

cat > "$PROM_FILE" <<EOF
global:
  scrape_interval: 5s

scrape_configs:

  # All Node.js-based services, including game-server
  - job_name: 'node-backend'
    metrics_path: '/metrics'
    static_configs:
      - targets: [
          "allocator:${ALLOCATOR_PORT}",
          "backend:${BACKEND_PORT}",
          "game-gateway:${GATEWAY_PORT}",
          "matchmaking-service:${MATCHMAKING_PORT}",
          "scorer:${SCORER_PORT}",
          "chat:${CHAT_PORT}",
          "game-server:${GAME_SERVER_HTTP}"
        ]

  # Game servers scraped separately for gameplay-specific metrics
  - job_name: 'game-servers'
    metrics_path: '/metrics'
    static_configs:
      - targets: ["game-server:${GAME_SERVER_HTTP}"]
    relabel_configs:
      # Rewrite instance label to point to its HTTP/game logic port
      - source_labels: [__address__]
        regex: '([^:]+):.*'
        replacement: '\${1}:${GAME_SERVER_PORT}'
        target_label: instance

  # Nginx exporter
  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx-exporter:9113']

  # cAdvisor for container metrics
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']
EOF

echo "Generated Prometheus config at $PROM_FILE"
cat "$PROM_FILE"

