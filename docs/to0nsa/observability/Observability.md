# Observability Stack – Overview

This folder explains the **monitoring and logging tools** used in ft_transcendence and how they work together:

- Prometheus + Alertmanager – metrics collection and alerts.
- Grafana – dashboards and visualization.
- ELK (ElasticSearch, Logstash, Kibana) – logs and log search.
- Metrics collectors – cAdvisor, Nginx exporter, and in‑app metrics endpoints.

For the application‑centric view (which signals matter for online Pong), see:

- `docs/to0nsa/workflow/MonitoringAndObservability.md`

This folder focuses on **what each tool is, what it does, and how it is wired in this repo**.

---

## 1. Components at a glance

- `PrometheusAndAlertmanager.md`  
  How Prometheus scrapes metrics from services and how Alertmanager is configured via `prometheus-pre`.

- `Grafana.md`  
  How Grafana is provisioned, where dashboards live, and how it’s exposed via Nginx.

- `LogsAndELK.md`  
  How logs flow from containers → Logstash → ElasticSearch → Kibana.

- `MetricsCollectors.md`  
  How cAdvisor, Nginx Prometheus exporter, and in‑process metrics (`@utils/metrics`) provide data to Prometheus.

---

## 2. How the stack fits together

At runtime (main points):

- Node/Fastify services expose `/metrics` and structured logs.
- cAdvisor and Nginx exporter provide container and Nginx‑level metrics.
- Prometheus scrapes all metrics endpoints and stores time series.
- Alertmanager uses Prometheus alert rules to send notifications (email/webhooks).
- Grafana connects to Prometheus and ElasticSearch to render dashboards.
- Containers log via the GELF driver to Logstash; Logstash writes to ElasticSearch.
- Kibana sits on top of ElasticSearch for log search and analysis.

All of this runs alongside the app via Docker Compose (see `docs/to0nsa/docker/MonitoringStack.md`).
