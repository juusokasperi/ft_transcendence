# AGENTS – Game Gateway (`apps/game-gateway`)

Scope: applies to everything under `apps/game-gateway/`.

The game gateway terminates external WebSocket connections for `/g/:roomId` and forwards them to the correct game node (game-server instance). It is security‑sensitive: it validates join/resume tokens and enforces single‑use join tokens via Redis. Treat changes here with the same care as auth code.

---

## 1. Role and responsibilities

- This service is a **thin WS reverse proxy**, not a game server:
  - It does **not** run the Pong simulation.
  - It authenticates `/g/:roomId` upgrades using:
    - join tokens from the allocator/matchmaking.
    - resume tokens from game nodes.
  - It routes traffic to a game node determined by Redis (`room-to-node:<roomId>`).
- Keep it focused:
  - Do not add game logic, scoring, or matchmaking decisions here.
  - If you need new behavior, first consider whether it belongs in:
    - the game server (`apps/game-server`),
    - the gateway’s security/routing path,
    - or the matchmaking/allocator.

---

## 2. Configuration, Redis, and routing

- Config:
  - All configuration should flow through `config.ts` (`REDIS_URL`, `PORT`, etc.).
  - If you need new env vars, add them there and document them in:
    - `docs/to0nsa/docker/ProdCompose.md` or relevant deployment docs.
- Redis:
  - Use a **single Redis client** instantiated in `index.ts`; do not create extra clients elsewhere.
  - Keys the gateway is responsible for:
    - `room-to-node:<roomId>` – mapping from room id to game node address (read‑only here).
    - `join-token:<jti>` – single‑use join token registry (written here with `SET ... NX`).
  - If you introduce new keys, update:
    - `docs/to0nsa/redis/GameServerAndGateway.md`
    - and any workflow docs that describe routing or token behavior.

---

## 3. Tokens, protocols, and security

- Token verification:
  - Use shared helpers from `@pong/shared/auth/tokenSign`:
    - `verifyJoinToken` for allocator‑minted join tokens.
    - `verifyResumeToken` for game‑server‑minted resume tokens.
  - Enforce:
    - `roomIdentifier` matches the URL.
    - Correct `iss`/`aud`:
      - join: `iss === 'mm'`, `aud === 'game-node'`.
      - resume: `iss === 'game-server'`, `aud === 'game-server'`.
- Single‑use semantics:
  - Preserve the current single‑use join token behavior:
    - On a successful join upgrade, write `join-token:<jti>` with `SET ... NX` and an expiry based on `exp`.
    - Treat a failed `NX` set as a hard “token already consumed” error.
  - Do not bypass this check or add alternate paths that admit players without join/resume tokens.
- WebSocket protocols:
  - Respect `Sec-WebSocket-Protocol` and *do not* strip it:
    - The gateway must forward `bearer,<token>` or `resume,<token>` to the game server intact.
  - When changing how tokens are encoded in subprotocols, update:
    - `docs/to0nsa/workflow/GatewayAndWebSockets.md`
    - `docs/to0nsa/workflow/ProtocolReference.md`.

---

## 4. Proxying and error handling

- Use the existing `proxyWithRetry` helper when proxying to game nodes:
  - It already handles basic retry with exponential backoff for ECONNREFUSED/ECONNRESET.
  - It preserves `Sec-WebSocket-Protocol` so the downstream game server sees the same tokens.
- On error:
  - Prefer returning explicit HTTP status lines on the raw socket (as done today) for:
    - `4401 Unauthorized` (missing/invalid token),
    - `4403 Forbidden` (join token reused),
    - `4500 Internal Server Error` (Redis failure),
    - `502` / `503` for backend issues.
  - Log enough context (roomId, target node, JTI) without leaking tokens.
- Do not add heavy logic inside the upgrade handler:
  - Keep it to validation, routing lookup, and proxying.

---

## 5. Testing and changes

- Tests live under `apps/game-gateway/tests` and cover:
  - Upgrade behavior (`gateway.upgrade.test.ts`).
  - Resume flows and routing (`gateway.resume.test.ts`).
- When changing:
  - token validation rules,
  - Redis key shapes or semantics,
  - error/close codes,
  update or add tests that exercise both success and failure paths.
- Use Vitest with the existing mocking patterns (Fastify, Redis, http-proxy).

---

## 6. Documentation expectations

- Gateway behavior is documented under:
  - `docs/to0nsa/workflow/GatewayAndWebSockets.md`
  - `docs/to0nsa/redis/GameServerAndGateway.md`
  - `docs/to0nsa/workflow/ProtocolReference.md` (for message types and close codes).
- When you change routing, token flows, or close codes:
  - Update the relevant docs so they stay in sync with the implementation.
  - Coordinate with game‑server and frontend docs so the end‑to‑end story remains coherent.
