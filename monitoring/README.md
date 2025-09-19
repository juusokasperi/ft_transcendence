# Monitoring with Prometheus and Grafana

## How to use

1. `make mon-detached`
2. Go with browser to localhost:3002

## Components:

### Getting data into Prometheus

#### Nginx with nginx-prometheus-exporter

- We have 4 different panels now. Having more would require VTS plugin for nginx

#### Node, including SQLite

- fastify-metrics for Node,js
- prom-client directly, to wrap database calls and get SQL query metrics

#### Container resource usage

- cadvisor

#### OS and hardware

- Forget about this because we will not have root when deploying?
- Node exporter https://github.com/prometheus/node_exporter

### Grafana

- Premade dashboards are provisioned and available in the left side under 'Dashboards'
