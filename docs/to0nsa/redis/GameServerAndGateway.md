# Redis in Game Server and Gateway

This document explains how **Redis is used by the data‑plane services** that actually run matches and route WebSockets:

- Game server (`apps/game-server`)
- Game gateway (`apps/game-gateway`)

Read this together with:

- `docs/to0nsa/workflow/GameNode.md`
- `docs/to0nsa/workflow/GatewayAndWebSockets.md`
- `docs/to0nsa/workflow/SecurityAndTokens.md`

---

## 1. Room routing: `room-to-node:*`

When the **allocator** creates a room, it writes:

```ts
await redis.set(`room-to-node:${roomIdentifier}`, wsNodeUrl, 'EX', 900);
```

- `roomIdentifier` – room ID (e.g., `r-uuid`).
- `wsNodeUrl` – WebSocket URL of the game server node (e.g., `ws://game-server:55553`).
- TTL: ~15 minutes.

The **game gateway** (`apps/game-gateway/index.ts`) then uses this key in its upgrade handler:

```ts
const gameNode = await redis.get(`room-to-node:${roomId}`);
```

If:

- The key is present → gateway proxies `/g/:roomId` WebSocket connections to that node.
- The key is missing → gateway closes the connection (room expired or never existed).

This decouples gateway routing from the allocator and game server implementations: the gateway only needs Redis to know where to send traffic.

---

## 2. Join token single‑use registry: `join-token:*`

### 2.1 Gateway enforcement

Join tokens are signed by the allocator and embedded in WebSocket subprotocols. The gateway validates them and then enforces **single use** using Redis.

In `apps/game-gateway/index.ts`:

```ts
if (joinClaims) {
  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(1, (joinClaims.exp ?? nowSec) - nowSec);
  const jtiKey = `join-token:${joinClaims.jti}`;

  const setResult = await redis.set(jtiKey, roomId, 'EX', ttlSeconds, 'NX');
  if (setResult !== 'OK') {
    // token already consumed
    socket.write('HTTP/1.1 4403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
}
```

Key properties:

- Key name: `join-token:<jti>` where `<jti>` is the token’s unique ID.
- Value: room identifier (for debugging).
- TTL: same as the token’s expiration (seconds).
- `NX` → only set if the key does not already exist.

Behavior:

- First connection with a given join token:
  - Key is written; request is allowed (assuming other checks pass).
- Subsequent attempts with the same token:
  - `SET NX` fails; gateway rejects the connection with a 4403 (forbidden) style response during the HTTP upgrade.

This prevents **token replay**: if someone steals or reuses a join token, Redis ensures only the first use succeeds.

### 2.2 Game server checks

On the game server side, `WSServer` also checks join tokens:

- It verifies the token signature and room, and then checks that the `join-token:<jti>` key exists before proceeding.
- If the key is missing (e.g., token wasn’t validated by the gateway, or TTL expired), it closes the connection with an appropriate close code.

This is defense in depth: even if the gateway is misconfigured or bypassed, the game server still refuses reused or unknown tokens based on the Redis key.

---

## 3. Resume tokens: `resume-token:*`

`ResumeTokenService` in `apps/game-server/src/app/ResumeTokenService.ts` uses Redis to implement **single‑use resume tokens** for reconnecting to matches.

### 3.1 Issuing tokens

When a player is connected and eligible for resume, the game server periodically calls:

```ts
const ttlSeconds = Math.max(1, Math.ceil(params.ttlMs / 1000));
const claims: ResumeTokenClaims = {
  iss: 'game-server',
  aud: 'game-server',
  iat: now,
  exp: now + ttlSeconds,
  jti: uuid(),
  roomIdentifier: params.roomIdentifier,
  sub: params.playerIdentifier,
  sessionIdentifier: params.sessionIdentifier,
};
const resumeToken = signResumeToken(claims);
const key = `resume-token:${claims.jti}`;
const setResult = await this.redis.set(
  key,
  JSON.stringify({ roomIdentifier: claims.roomIdentifier }),
  'EX',
  ttlSeconds,
  'NX',
);
```

Key properties:

- Key: `resume-token:<jti>`
- Value: JSON `{ roomIdentifier }`
- TTL: a bit longer than the reconnect grace window.
- `NX`: ensures each token ID is only stored once.

The token is sent to the client via a `RESUME_TOKEN` message over the game WebSocket.

### 3.2 Consuming tokens

When a client reconnects via `/g/:roomId` using a resume token, the gateway:

- Validates the token via `verifyResumeToken`.
- Proxies the connection to the game server.

On the game server, `ResumeTokenService.consume` does:

```ts
const claims = verifyResumeToken(token);
// Validate iss/aud...
const key = `resume-token:${claims.jti}`;
const consumed = await this.redis.del(key);
if (consumed !== 1) {
  // Replay/mismatch
  return null;
}
return claims;
```

Behavior:

- First consume:
  - `DEL` returns 1; token is valid.
- Subsequent attempts:
  - `DEL` returns 0; token is considered replayed or expired; connection is rejected.

This ensures **single‑use resume tokens** with a bounded lifetime stored in Redis.

---

## 4. Rate limiting player input: `gs:rl`

The game server uses the same `RedisTokenBucket` helper as matchmaking for **per‑player input rate limiting**.

In `apps/game-server/src/infra/ws/WSServer.ts`:

```ts
this.rateLimiter = args.rateLimiter ?? new RedisTokenBucket(this.redis, 'gs:rl', 30, 1000);
```

- Prefix: `gs:rl`
- Limit: 30 “tokens” per 1000ms (values taken from constructor).

`isRateLimited`:

```ts
if (await this.rateLimiter.consume(playerId)) return false;
// else, log throttling and drop input
```

Effect:

- Each player gets a token bucket keyed in Redis.
- Excessive input (e.g., spamming axis changes) is dropped server‑side.
- Using Redis means the rate limit persists across WS reconnects within a short window, and multiple game server instances can share the same limits if needed.

---

## 5. Game server Redis factory

**File:** `apps/game-server/src/app/RedisFactory.ts`

The game server uses a small factory to create Redis clients:

```ts
export function createRedisFactory(url: string): RedisFactory {
  return {
    create() {
      return new Redis(url);
    },
  };
}
```

`GameServer`:

```ts
const redisFactory = createRedisFactory(this.config.redisUrl);
this.redis = redisFactory.create();
```

This keeps configuration centralized and makes testing easier by allowing injection of a fake Redis factory if needed.

---

## 6. Summary

Redis in the **data plane** is used for:

- **Routing:** `room-to-node:*` keys tell the gateway where to send `/g/:roomId` WebSockets.
- **Security:** `join-token:*` and `resume-token:*` enforce single‑use tokens for join and reconnect.
- **Rate limiting:** `gs:rl` buckets throttle player input to protect the game server.

Combined with the control‑plane usage described in `MatchmakingAndAllocator.md`, Redis provides a fast, centralized coordination layer that keeps online Pong safe, scalable, and resilient to replay and abuse.

