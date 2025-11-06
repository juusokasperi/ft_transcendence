#!/bin/bash
set -euo pipefail

# Prometheus main config
PROM_FILE="/etc/prometheus/prometheus.yml"
mkdir -p "$(dirname "$PROM_FILE")"

cat > "$PROM_FILE" <<EOF
global:
  scrape_interval: 5s
rule_files:
  - rules.yml
alerting:
  alertmanagers:
   - static_configs:
     - targets:
        - alertmanager:9093

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
          "game-server:${GAME_SERVER_HTTP}",
          "game-server-2:${GAME_SERVER_HTTP}"
        ]

  # Game servers scraped separately for gameplay-specific metrics
  - job_name: 'game-servers'
    metrics_path: '/metrics'
    static_configs:
      - targets: ["game-server:${GAME_SERVER_HTTP}", "game-server-2:${GAME_SERVER_HTTP}"]
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


# Prometheus rules for alerts
RULE_FILE="/etc/prometheus/rules.yml"

cat > "$RULE_FILE" <<EOF
groups:

 # Test alert
 - name: Count greater than 0
   rules:
   - alert: CountGreaterThan0
     expr: nginx_connections_active > 0
     for: 1s

 - name: Nginx Alerts
   rules:
   - alert: NginxDown
     expr: up{job="nginx"} == 0
     for: 1m
     labels:
       severity: critical
     annotations:
       summary: "Nginx is down"
       description: "Nginx instance {{ \$labels.instance }} has been down for more than 1 minute"

   - alert: NginxHighErrorRate
     expr: rate(nginx_http_requests_total{status=~"5.."}[5m]) > 0.05
     for: 5m
     labels:
       severity: warning
     annotations:
       summary: "High 5xx error rate on Nginx"
       description: "Nginx is returning 5xx errors at {{ \$value | humanizePercentage }} for instance {{ \$labels.instance }}"

 - name: Node.js Application Alerts
   rules:
   - alert: NodeJSDown
     expr: up{job="node-backend"} == 0
     for: 2m
     labels:
       severity: critical
     annotations:
       summary: "Node.js service is down"
       description: "Node.js service {{ \$labels.job }} on {{ \$labels.instance }} has been down for more than 2 minutes"

   - alert: HighMemoryUsage
     expr: (process_resident_memory_bytes / nodejs_external_memory_bytes) * 100 > 80
     for: 5m
     labels:
       severity: warning
     annotations:
       summary: "High memory usage detected"
       description: "Memory usage is above 80% on {{ \$labels.instance }} (current: {{ \$value | humanize }}%)"

   - alert: HighCPUUsage
     expr: rate(process_cpu_seconds_total[5m]) * 100 > 80
     for: 5m
     labels:
       severity: warning
     annotations:
       summary: "High CPU usage detected"
       description: "CPU usage is above 80% on {{ \$labels.instance }} (current: {{ \$value | humanize }}%)"
EOF

echo "Generated Prometheus rules at $RULE_FILE"
cat "$RULE_FILE"


# Alertmanager
ALERTMANAGER_FILE="/etc/alertmanager/alertmanager.yml"
mkdir -p "$(dirname "$ALERTMANAGER_FILE")"

cat > "$ALERTMANAGER_FILE" <<EOF

global:
  # The smarthost and SMTP sender used for mail notifications.
  smtp_smarthost: "${MAIL_HOST}:587"
  smtp_from: "${MAIL_FROM_RAW}"
  smtp_auth_username: "${MAIL_USER}"
  smtp_auth_password: "${MAIL_PASS}"

route:
# group_wait default is 30s, indicating the duration to hold off before sending an alert notification.
  group_wait: 1s
  receiver: combined

receivers:
  - name: combined
    webhook_configs:
      - url: "${ALERT_WEBHOOK_URL}"
        send_resolved: false
    email_configs:
      - to: "${ALERT_MAIL_TO}"
EOF
