## Getting data into Prometheus

### Nginx

- nginx-prometheus-exporter

### Node, including SQLite

- easier with fastify-metrics OR
- prom-client directly, could also wrap database calls for more data...

### Container resource usage

- cadvisor

### OS and hardware

- Forget about this because we will not have root when deploying?
- Node exporter https://github.com/prometheus/node_exporter

## Grafana

- TODO: set password
- TODO: add premade dashboards
