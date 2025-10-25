# Matchmaking Integration Plan — Actionable Roadmap

> Goal: Integrate the architecture defined in `docs/to0nsa/matchmaking.md` into this monorepo (frontend, backend, infra), delivering an MVP that pairs players and runs a server‑authoritative Pong room over secure WebSockets, then harden and scale.

---

## Scope & Principles

- Reuse the shared game types and deterministic logic already in `packages/pong/*`.
- Keep the control plane (Matchmaking + Allocator) separate from the data plane (Gateway + Game Node) as in the spec.
- Admission via short‑lived, single‑use tokens verified offline (HMAC/JWT) — no DB on the hot path.
- One origin in dev via nginx. `wss://` only; validate `Origin` at gateway.

---

## Repo Mapping (where things live)

- Frontend SPA: `apps/frontend` (Vite/React)
- API (REST): `apps/backend` (Fastify + SQLite)
- Game logic + render helpers: `packages/pong/*`
- Reverse proxy (dev): `nginx/default.conf`
- Orchestration: `docker-compose.yml` (+ `log-management` optional)

New services (proposed):

- `apps/matchmaking` — WS control plane: queues, pairing, handoff
- `apps/allocator` — HTTP control plane: CreateRoom on a game node; returns join/resume tokens
- `apps/game-node` — WS data plane: authoritative simulation + room FSM
- `redis` — ephemeral store for token single‑use registry and small coordination

---

## Phases & Deliverables

### P0 — Contracts, types, and env

- [ ] Define net protocol types (JOIN_QUEUE/HANDOFF/READY/START/INPUT/SNAPSHOT/END, PING/PONG) in `packages/pong/shared`.
- [ ] Define token claims and signing helper (HMAC SHA‑256, kid rotation) in `apps/allocator` shared module.
- [ ] Add `.env` keys (dev defaults):

```env
# tokens
REALTIME_TOKEN_SECRET=dev-super-secret-change-me
REALTIME_TOKEN_TTL_SEC=45
REALTIME_RESUME_TTL_SEC=20
REALTIME_TOKEN_ISS=mm
REALTIME_TOKEN_AUD=game-node

# services
MM_PORT=4001
ALLOCATOR_PORT=4002
GAME_NODE_PORT=4100
REDIS_URL=redis://redis:6379

# gateway (nginx) allow-list
ALLOWED_ORIGINS=http://localhost:8080,http://localhost:5173
```

- [ ] Add a tiny shared “wire” util for `Sec-WebSocket-Protocol: bearer,<token>` parsing/validation on the node.

Acceptance:

- [ ] TypeScript compiles; shared net types available to FE and game‑node.
- [ ] Unit tests for token encode/decode and single‑use registry logic.

---

### P1 — MVP (single game node, single queue)

Backend/infra

- [ ] Add `redis` service to `docker-compose.yml`.
- [ ] Add `apps/game-node` service (Node 22 + ws or uWebSockets.js). Expose `/g/:roomId` over WS.
- [ ] Extend `nginx/default.conf` with a gateway location:

```nginx
# WS Gateway → game-node (MVP: single node)
location ~ ^/g/(?<roomId>[^/]+)$ {
  set $node http://game-node:4100;
  proxy_pass $node;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  proxy_set_header Host $http_host;
  # Optional belt-and-suspenders: enforce allowed Origin(s)
  if ($http_origin !~* "(localhost:8080|localhost:5173)") { return 403; }
}
```

- [ ] Add `apps/allocator` with `POST /admin/rooms`:
  - Input: `{ mode, region?, ruleset?, players: [{ uuid, name } * 2] }`
  - Action: choose node (MVP: single), `CreateRoom` via in‑proc call or HTTP, mint per‑player join tokens.
  - Output to MM: `{ roomIdentifier, wssUrl, startTick, randomSeed, tokens: { P1, P2 } }`.

- [ ] Add `apps/matchmaking` WS server with a single queue (default mode):
  - Accept `JOIN_QUEUE { siteToken, preferredSide? }` (after auth claims check defers to `apps/backend` if needed).
  - Pair two players, call Allocator, then send `HANDOFF` with `{ wssUrl, roomIdentifier, side, joinToken, randomSeed, simulationStartTick }`.
  - Keep the MM WS open until each client confirms `READY` (or timeout/requeue).

Game Node

- [ ] Implement `CreateRoom` (admin) → allocate room state with deterministic seed and schedule a `START` barrier at `startTick`.
- [ ] WS admission: parse `Sec-WebSocket-Protocol: bearer,<joinToken>`, verify HMAC + single‑use in Redis, bind to room+side.
- [ ] Room FSM: `READY` on both sides → broadcast `START { startTick }`.
- [ ] Tick loop (60 Hz): apply axis input → step physics → emit compact `SNAPSHOT + events` at 20–25 Hz.
- [ ] Graceful disconnect with small resume window using `resumeToken`.

Frontend

- [ ] Wire `apps/frontend/src/game/modes/online.ts` `connectOnline()`:
  1. Open WS to `wss://<origin>/mm`; send `JOIN_QUEUE`.
  2. On `HANDOFF`, open WS to `wss://<origin>/g/${roomIdentifier}` with subprotocol `bearer,<joinToken>`.
  3. Wait for `START { startTick }`, then call `.onSnapshot()` on each server emission; pipe local axis via `.sendLocalAxis()`.
- [ ] Add route `/pong/online` that boots `createOnlineApp()` and shows connection status/errors.

Stats & results

- [ ] On `END`, node calls `apps/backend` REST to persist result and update MMR/elo (out of hot path).

Acceptance:

- [ ] Two browsers can match via MM and complete a full match end‑to‑end on localhost.
- [ ] Single‑use token registry prevents replay; bad tokens rejected.
- [ ] Basic logs show pair → handoff → join → start → snapshots → end.

---

### P2 — Hardening & quality

- [ ] Origin allow‑list at gateway; HSTS (dev only if behind HTTPS terminator).
- [ ] Per‑connection rate limits (token bucket) for `INPUT`/`PING` in game‑node.
- [ ] Backpressure: drop stale snapshots to slow clients; close on queue growth.
- [ ] Observability: structured logs, counters (connections, matches, drops), timings (p50/p95), simple health endpoints.
- [ ] Token rotation support (kid) + short TTLs; Redis TTLs for single‑use and resumes.
- [ ] MM requeue/timeout paths; resuming within grace window.

Acceptance:

- [ ] Load test a few rooms, verify stability and rates; no GC spikes.
- [ ] Traces/logs correlate a match across MM → Allocator → Node.

---

### P3 — Scale out & polish

- [ ] Multiple game nodes behind nginx with consistent hashing by `roomId`.
- [ ] Allocator can pick among nodes based on capacity; optional autoscaling hooks.
- [ ] Multi‑queue/modes (ranked, custom rules) and regions.
- [ ] Frontend UX polish: queue states, cancel/requeue, opponent info.

Acceptance:

- [ ] Room stickiness verified when nodes > 1.
- [ ] End‑to‑end tests cover multi‑mode queues.

---

## Interfaces (short reference)

Tokens (HMAC JWT, `aud=game-node`, `iss=mm`):

```json
{
  "jti": "uuid",
  "exp": 1735689600,
  "roomId": "r-123",
  "side": "P1",
  "startTick": 123456,
  "randomSeed": 424242,
  "mmTicket": "opaque"
}
```

Client ⇄ Matchmaking (WS):

- `JOIN_QUEUE { mode, preferredSide?, auth?: string }`
- `HANDOFF { wssUrl, roomIdentifier, side, joinToken, randomSeed, simulationStartTick }`
- `READY { roomIdentifier }`

Client ⇄ Game Node (WS, subprotocol `bearer,<joinToken>`):

- Server: `START { startTick }`
- Client: `INPUT { axis: number, t?: number }` at tick cadence
- Server: `SNAPSHOT { state: GameState, events: FrameEvents }` at 20–25 Hz
- Both: `PING/PONG { t0, t1 }` for RTT/offset; `END { reason, winner? }`

---

## Code Touchpoints (initial PRs)

- `packages/pong/shared/src` — add `protocol/net.ts` types and export from `index.ts`.
- `apps/frontend/src/game/modes/online.ts` — implement `connectOnline()` to MM + Gateway.
- `nginx/default.conf` — add `/g/` location; optional `/mm` upstream.
- `docker-compose.yml` — add `redis`, `matchmaking`, `allocator`, `game-node` services.
- `apps/backend` — add result/MMR update endpoint; keep off the hot path.

---

## Risks & Mitigations

- Clock sync and jitter → use server `START startTick` barrier + client RTT sampling; small buffer before rendering.
- Token replay/steal → single‑use (Redis `SETNX` + TTL), tiny expirations, strict `Origin`.
- Overload → rate limits per connection; drop stale snapshots; keep MM/Allocator stateless.

---

## Done Definition (MVP)

- Two real browsers can click “Play Online”, get paired, and complete a match.
- Observability shows stable p95s; reconnect within a short grace window works.
- Adding a second node does not break room stickiness (hash by `roomId`).
