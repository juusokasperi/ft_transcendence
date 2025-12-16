# AGENTS – Nginx Configuration

Scope: applies to everything under `nginx/`.

This directory contains the Nginx configurations that sit in front of the app stack in dev and prod. Changes here affect **all HTTP/WS traffic**, so treat them as sensitive.

---

## 1. Files and environments

- `default.conf` – dev / local Nginx config.
- `prod.conf.template` – production template; rendered with environment‑specific values.

Both configs:

- Terminate HTTP(S) and proxy to:
  - Frontend.
  - Backend API.
  - Matchmaking, game‑gateway, chat WebSockets.
  - Monitoring endpoints (Prometheus exporters, Grafana, Kibana).

---

## 2. General rules for editing

- Maintain **parity** between dev and prod:
  - When you add a new route or upstream in one, consider whether the other needs the same change.
  - Keep path structures consistent (e.g. `/api/`, `/matchmaking`, `/g/`, `/chat`, `/grafana/`, `/kibana/`).
- Be explicit:
  - Prefer named upstreams and clear `location` blocks.
  - Keep proxy headers consistent (e.g. `X-Real-IP`, `X-Forwarded-For`, WebSocket upgrade headers).
- Comments:
  - Use short comments to explain non‑obvious decisions (rate limits, custom headers, special paths).
  - Avoid long prose; rely on `docs/to0nsa/nginx` for detailed explanations.

---

## 3. WebSocket and upgrade handling

- For WS routes (`/matchmaking`, `/g/`, `/chat`):
  - Ensure `Upgrade` and `Connection` headers are properly set.
  - Do not strip the `Sec-WebSocket-Protocol` header:
    - Gateway and game nodes rely on subprotocols (e.g. `bearer,<token>`, `resume,<token>`).
- When adding new WS endpoints:
  - Mirror the established pattern from existing WS locations.
  - Confirm timeouts are appropriate for long‑lived connections.

---

## 4. Security, rate limiting, and observability

- Security:
  - Do not disable security headers or loosen restrictions without understanding why (CORS, HSTS, etc.).
  - When exposing internal services under prefixed paths (`/grafana/`, `/kibana/`), ensure auth and path rules still apply as documented.
- Rate limiting:
  - Follow existing token bucket / `limit_req` patterns when adding or changing limits.
  - Document any new rate‑limit behavior in `docs/to0nsa/nginx/*` and, if user‑visible, in `FailureModesAndUX.md`.
- Observability:
  - Preserve existing log formats and Prometheus exporter locations.
  - Coordinate changes with `docs/to0nsa/observability` and monitoring stack configs.

---

## 5. Testing configuration changes

- For dev:
  - Use Docker/Nginx as described in `docs/to0nsa/docker` and `docs/to0nsa/nginx/NginxDevConfig.md`.
  - After changes, verify:
    - Static assets, `/api/`, and all WS routes still work.
    - Monitoring endpoints remain accessible where expected.
- For prod templates:
  - Keep changes minimal and align them with infra/deployment expectations.
  - When adjusting paths or upstreams, ensure any tooling that generates configs (Docker compose, Helm, etc.) is updated as well.
