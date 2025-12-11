# Game Gateway Code Review – `apps/game-gateway`

> Snapshot taken on 2025‑12‑11, based on the current implementation of the game gateway.

This document focuses on observations, risks, and improvement ideas for the game gateway. For a high‑level overview of architecture and behavior, see `overview.md` in the same folder.

---

## 1. Strengths

- **Tight and focused scope**
  - The gateway sticks to one job:
    - authenticate `/g/:roomId` WS upgrades via join/resume tokens,
    - resolve the game node from Redis,
    - proxy the TCP stream with minimal logic.
  - Simulation, scoring, and matchmaking are intentionally kept out of this service.

- **Clear token semantics**
  - Shared helpers from `@pong/shared/auth/tokenSign` are used for both:
    - join tokens (`verifyJoinToken`, `iss: 'mm'`, `aud: 'game-node'`).
    - resume tokens (`verifyResumeToken`, `iss/aud: 'game-server'`).
  - Room binding is enforced (`claims.roomIdentifier === roomId`), preventing cross‑room token abuse.
  - Single‑use join tokens are enforced via Redis `join-token:<jti>` keys with `SET ... NX`.

- **Simple, composable infra**
  - Uses a single Fastify instance + `app.server.on('upgrade')` instead of mixing many plugins.
  - Uses one `http-proxy` instance (`proxy.ws`) for all upgrades.
  - Routing data (`room-to-node:<roomId>`) lives in Redis and is written by other services (allocator/scorer), keeping the gateway stateless beyond routing.

- **Good test coverage for upgrade paths**
  - `gateway.upgrade.test.ts` exercises:
    - invalid URLs, missing headers, invalid tokens, missing `room-to-node` mapping,
    - reused join tokens and Redis failures.
  - `gateway.resume.test.ts` covers:
    - resume token validation (iss/aud, room mismatch),
    - successful proxy when resume token is valid.

---

## 2. Potential issues / things to watch

- **Asymmetric error handling for routing failures**
  - When `room-to-node:<roomId>` is missing or Redis `.get()` throws:
    - The gateway logs and simply `socket.destroy()`s without sending an HTTP status line.
    - For join/auth errors, the gateway is explicit (`4401`, `4403`, `4500`), but routing failures are “silent” to the client.
  - This can make it harder to distinguish “bad token” vs “no game node available” from the browser’s perspective and in logs/metrics.

- **Mixed severity in logging Redis issues**
  - A failure to read routing (`room-to-node`) logs `info`, while failure to persist join token consumption logs `error` and returns `4500`.
  - In practice, both are serious:
    - Routing failure means we can’t connect to any game node.
    - Persist failure means we can’t safely enforce single‑use tokens.
  - Treating routing errors as full “infra failures” (e.g. log at `error` and return `503`) might be more accurate.

- **Strict dependence on `Sec-WebSocket-Protocol` format**
  - The gateway currently requires `Sec-WebSocket-Protocol` to be a **string** and immediately rejects (`4401`) if not:
    - This aligns with how the frontend sets it, but it assumes no intermediary modifies it to an array form (`string[]`).
  - This is acceptable as long as Nginx or any L7 proxy does not alter the header type, but it’s worth keeping in mind if infra changes.

- **Coupling to Redis key semantics**
  - The gateway assumes:
    - `room-to-node:<roomId>` is kept up‑to‑date by external services.
    - `join-token:<jti>` is written only by the gateway (single‑use).
  - If another service started writing to these keys (e.g. for maintenance or migration), it could affect behavior in unexpected ways.
  - This is mitigated by documentation (`GameServerAndGateway.md`), but the coupling is implicit in code.

- **Limited observability on upgrade outcomes**
  - While logs exist for many branches, there are no explicit counters for:
    - total upgrade attempts,
    - auth failures (join/resume invalid),
    - “no node found” cases,
    - join token reuse events.
  - In a high‑traffic environment, metrics for these would help detect attacks or misconfigurations faster than logs alone.

---

## 3. Possible improvements / refactors

- **Make routing failures explicit to clients**
  - For cases where:
    - `room-to-node` is missing,
    - or Redis `.get()` fails,
  - consider writing a clear HTTP response before destroying the socket, e.g.:
    - `503 Service Unavailable` (transient infra issue), or
    - `404`/`4404` style code for “no node for this room” if you want to distinguish it.
  - This would bring routing failures in line with how auth failures are surfaced (`4401`, `4403`, `4500`).

- **Align logging severity with impact**
  - Promote routing failures (Redis errors on `room-to-node:*`) from `info` to `error`:
    - They indicate either a missing mapping or an infra problem that prevents games from starting.
  - Keep join token persistence failures as `error`.
  - This makes it easier to spot production issues by scanning log levels.

- **Add gateway‑specific metrics**
  - Build on `registerMetrics(app, { labels: { service: 'game-gateway' } })` with custom counters, for example:
    - `game_gateway_upgrades_total{outcome="ok|unauthorized|forbidden|no_node|proxy_error"}`.
    - `game_gateway_join_token_reuse_total`.
  - This would give a quick view of:
    - whether the gateway is under attack (many unauthorized),
    - whether room → node mappings are healthy,
    - how often joins fail due to reuse.

- **Lightly modularize `index.ts` without over‑engineering**
  - As the gateway grows, consider extracting small, purpose‑built helpers:
    - `tokens.ts` for `validateJoinForRoom`, `validateResumeForRoom`, and `markJoinTokenConsumed`.
    - A `resolveGameNode(redis, roomId)` helper that encapsulates the `room-to-node:*` lookup and logging.
  - Keep the Fastify/Redis/http-proxy wiring in a single entry file, but push detailed token/routing rules into these helpers so they can be tested in isolation and evolved without bloating the upgrade handler.

- **Slightly relax `Sec-WebSocket-Protocol` handling (defensively)**
  - Without changing current behavior, you could:
    - Accept `string[]` as well as `string` by joining arrays into a single comma‑separated string before passing to `parseProtocols`.
    - This makes the gateway more robust if an upstream proxy ever re‑encodes the header.
  - This is not urgent, but it’s a small hardening improvement.

- **Factor token logic into a small helper module (if it grows)**
  - Right now, `validateJoin`, `validateResume`, and join token persistence are small and readable in `index.ts`.
  - If flows become more complex (e.g., more token types or additional checks), you could extract a `tokens.ts` helper:
    - `validateJoinForRoom(roomId, token)`,
    - `validateResumeForRoom(roomId, token)`,
    - `markJoinTokenConsumed(redis, claims)`.
  - This keeps the `upgrade` handler focused purely on request routing while making token logic easier to test and reuse.

Overall, the gateway is lean and well‑scoped. The main opportunities are around **observability and error signaling**, not correctness: making routing failures more explicit, aligning log severity with impact, and adding a few targeted metrics would make it easier to operate and debug in production, especially under load or during partial outages of game nodes or Redis.
