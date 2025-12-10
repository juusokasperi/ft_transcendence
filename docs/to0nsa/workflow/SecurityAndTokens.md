# Security & Tokens – End‑to‑End Overview

This document ties together all the **token and auth mechanisms** in the ft_transcendence stack:

- **Site auth** (backend JWTs and cookies)
- **Matchmaking auth** (site token → MMR → client identity)
- **Join tokens** (allocator → gateway → game server)
- **Resume tokens** (game server → client → gateway → game server)
- **Chat auth** (reusing site token for `/chat`)

Use this as the “map” for how identity and authorization flow across services.

You may want to pair it with:

- `BackendAndAPIs.md` – how login/refresh and protected routes work.
- `MatchmakingService.md` – how site tokens are used to authenticate matchmaking clients.
- `AllocatorAndScorer.md` – how join tokens are minted for new rooms.
- `GatewayAndWebSockets.md` – how join/resume tokens are enforced on `/g/:roomId`.
- `GameNode.md` – how resume tokens are issued and consumed by the game server.
- `ChatAndPresence.md` – how the chat service reuses the site token for `/chat`.
- `docs/to0nsa/redis/GameServerAndGateway.md` – Redis backing for join/resume token single‑use enforcement.
 - `OnlinePongReconnect.md` – end‑to‑end reconnect/resume flow (grace windows, reconnector behavior, UX).

---

## 1. Site auth: backend JWTs and cookies

Backend config: `apps/backend/utils/config.ts`.

Important envs:

- `SECRET` – main signing secret for user‑facing JWTs.
- `MATCH_SECRET` – separate secret used for match/service tokens.
- `ACCESS_TOKEN_COOKIE_NAME` – defaults to `'token'`.
- `REFRESH_TOKEN_COOKIE_NAME` – defaults to `'refresh_token'`.

### 1.1 Login, access token, and refresh token

Backend login routes: `apps/backend/routes/login.ts`.

Flow:

1. User submits email/password to `POST /api/login`.
2. Backend:
   - Validates credentials (`getUserByEmail` + bcrypt).
   - Optionally performs 2FA verification (`/api/login/tfa`).
3. If successful, backend calls `issueTokensForUser`:
   - Creates an **access token** (short‑lived JWT with `purpose: 'access'`).
   - Creates a **refresh token** (long‑lived JWT with `purpose: 'refresh'`, `tokenId`).
   - Persists a hash of the refresh token in DB.
4. Tokens are set as HTTP‑only cookies:

```ts
res.setCookie(ACCESS_TOKEN_COOKIE_NAME, issued.accessToken, { httpOnly: true, sameSite: 'strict', secure: prod, path: '/', maxAge: 4h });
res.setCookie(REFRESH_TOKEN_COOKIE_NAME, issued.refreshToken, { httpOnly: true, sameSite: 'strict', secure: prod, path: '/', maxAge: issued.refreshCookieMaxAge });
```

The access token cookie name defaults to `'token'`, which is why chat and matchmaking can read a `token` cookie.

### 1.2 Verifying access tokens on backend

Helper: `apps/backend/utils/jwt.ts`.

Token shapes:

- `AccessTokenPayload = JWTPayload & { purpose: 'access' }`
- `RefreshTokenPayload = JWTPayload & { purpose: 'refresh'; tokenId: string }`

Verification:

```ts
export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
  if (decoded.purpose !== 'access') throw new Error('Invalid token purpose');
  return decoded;
}
```

Hook: `authPreHandler` in `apps/backend/hooks/auth.ts`:

- Looks for:
  - `Authorization: Bearer <token>`, or
  - `ACCESS_TOKEN_COOKIE_NAME` cookie.
- Uses `verifyAccessToken`.
- If valid:
  - Attaches `req.user` (with at least `uuid` and `username`).
- If invalid:
  - Clears cookies, returns `401` with `code: 'token_invalid'` or `'token_expired'`.

This hook protects most user‑specific routes (`/api/users/me`, `/api/friends`, `/api/users/me/stats`, etc.).

---

## 2. Matchmaking auth: site token → MM identity

Matchmaking auth code: `apps/matchmaking/auth/auth.ts`.

Important pieces:

- `SECRET` – imported from backend config to verify site token.
- `verifySiteToken(token)`:

```ts
const payload = jwt.verify(token, SECRET) as { username: string; uuid: string };
return { uuid: payload.uuid, username: payload.username };
```

- `extractToken(socket, req)`:
  - Looks for a `token` cookie in the WS upgrade request.
  - If missing or invalid:
    - Sends `ERROR { code: 'AUTH', message: 'Token missing' | 'Invalid token' }`.
    - Closes the WebSocket.

`handleAuth`:

- Verifies the token → `{ uuid, username }`.
- Fetches MMR from backend via:

```ts
fetchUserMMR(uuid, siteToken);
```

- Calls `GET /api/users/:uuid` with `Authorization: Bearer <siteToken>`.
- Reads `ranking` from the response.

- Ensures **only one** authenticated connection per user:
  - Closes any existing authenticated client with the same `uuid`.

Result:

- A `ClientInfo` in matchmaking has:
  - `uuid`, `username`, `mmr`, `siteToken`, `authenticated: true`.
- This identity is used to:
  - Put players into queues.
  - Pair them into matches.
  - Feed player IDs into the Allocator and join‑token claims.

---

## 3. Join tokens: allocator → gateway → game server

Join tokens are **short‑lived HMAC “JWT‑like” tokens** that let a specific player join a specific room on a game node.

Implementation: `packages/pong/shared/src/auth/tokenSign.ts`.

### 3.1 Join token structure and signing

Sign/verify:

```ts
const SECRET = process.env.REALTIME_TOKEN_SECRET || 'dev-change-me';

export function signJoinToken(claims: JoinTokenClaims): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}
```

`JoinTokenClaims` (from `protocol/net.ts`) include:

- `iss: 'mm'` – issued by matchmaking/allocator.
- `aud: 'game-node'`.
- `roomIdentifier`.
- `sub` – user UUID.
- `side` – `'west'` or `'east'`.
- `simulationStartTick`.
- `exp`, `iat`, `jti` – expiry, issued‑at, unique ID.
- Optional tournament fields.

### 3.2 Token issuance in Allocator

Allocator: `apps/allocator/index.ts`.

After picking a node and registering a room:

```ts
const perPlayerJoinTokens: Record<string, string> = {};
const nowSec = Math.floor(Date.now() / 1000);
const expSec = nowSec + 60;
for (const p of players) {
  const claims: JoinTokenClaims = {
    iss: 'mm',
    aud: 'game-node',
    iat: nowSec,
    exp: expSec,
    jti: uuid(),
    roomIdentifier,
    sub: p.playerIdentifier,
    side: p.side,
    simulationStartTick,
    // tournament fields if applicable
  };
  perPlayerJoinTokens[p.playerIdentifier] = signJoinToken(claims);
}
```

Allocator returns:

- `roomIdentifier`
- `endpointUrl: /g/:roomIdentifier`
- `perPlayerJoinTokens` mapped by player UUID.

Matchmaking converts that into `HANDOFF` messages sent to clients.

### 3.3 Gateway verification and single‑use

Gateway: `apps/game-gateway/index.ts`.

On WebSocket upgrade to `/g/:roomId`:

- Extract `Sec-WebSocket-Protocol` header and split into tokens.
- For **join**:

```ts
const resumeToken = extractToken(protocols, 'resume');
const joinToken = resumeToken ? undefined : extractToken(protocols, 'bearer');

const resumeClaims = resumeToken ? validateResume(resumeToken, roomId) : null;
const joinClaims = !resumeClaims && joinToken ? validateJoin(joinToken, roomId) : null;
```

`validateJoin`:

- Uses `verifyJoinToken`.
- Confirms:
  - `roomIdentifier` matches the `:roomId` in URL.
  - `iss === 'mm'`, `aud === 'game-node'`.
  - `exp` in the future.

Single‑use enforcement:

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

Then:

- Gateway looks up `room-to-node:${roomId}` in Redis.
- Proxies the WebSocket to the chosen game node.

Game server:

- Also knows about `roomIdentifier` & `expectedPlayers` via `RoomRegistry`.
- Uses token claims to attach the connection to the correct seat and user.

---

## 4. Resume tokens: game server → client → gateway → game server

Resume tokens allow players to **reconnect** to an ongoing match if their WebSocket drops.

Implementation: `apps/game-server/src/app/ResumeTokenService.ts` + `WSServer`.

### 4.1 Issuance and rotation

`ResumeTokenService.issue`:

```ts
async issue(params: { roomIdentifier; playerIdentifier; sessionIdentifier; ttlMs; }) {
  const now = Math.floor(Date.now() / 1000);
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
  const setResult = await this.redis.set(key, JSON.stringify({ roomIdentifier: claims.roomIdentifier }), 'EX', ttlSeconds, 'NX');
  if (setResult !== 'OK') throw new Error('resume-token-persist');
  return { resumeToken, claims };
}
```

`WSServer.bindPlayerConnection`:

- For each player seat:
  - Computes a **grace period** (`graceMs`) based on policies (tournament vs casual).
  - Sets `rotatePeriod = max(3000, graceMs / 3)`.
  - Calls `ResumeTokenService.issue` to generate a token with `ttlMs = graceMs + rotatePeriod`.
  - Broadcasts the token via `broadcaster.broadcastResumeToken`.
  - Sets up `player.resumeInterval = setInterval(rotate, rotatePeriod)` to keep issuing overlapping tokens.

Effect:

- While connected, the client regularly receives fresh `RESUME_TOKEN` messages.
- If the connection drops:
  - The latest token remains valid for at least the entire grace window.

### 4.2 Reconnect flow

On the client (Pong host):

- When it receives `RESUME_TOKEN`, it stores the token.
- If the game WS disconnects, it attempts to reconnect to `/g/:roomId` using:

```http
Sec-WebSocket-Protocol: resume,<resumeToken>
```

Gateway:

- Treats this like a **resume** attempt.
- Validates via `validateResume`:
  - `verifyResumeToken`.
  - `roomIdentifier` match.
  - `iss === 'game-server'`, `aud === 'game-server'`.
- Proxies the connection to the same game node.

Game server:

- `ResumeTokenService.consume(token)`:
  - Verifies signature + `iss/aud`.
  - Deletes `resume-token:<jti>` from Redis.
  - If `del` returns 1 → token is valid and unused.
  - Otherwise → replay/mismatch; connection is rejected.
- If valid:
  - Locates the `MatchSession` and seat.
  - Binds the WebSocket to that seat.
  - Cancels disconnect grace timer (`ReconnectManager`).
  - Resumes the match.

If the player never reconnects within grace:

- `ReconnectManager` awards a **forfeit / opponent timeout** and notifies clients (see `GameNode.md` and `ResultsAndRanking.md`).

---

## 5. Chat auth: reuse site token for `/chat`

The chat service (`apps/chat`) uses the **same site JWT** as matchmaking & backend.

`apps/chat/utils/config.ts`:

- Reads `SECRET` (same as backend’s `SECRET`).

`apps/chat/utils/auth.ts`:

```ts
async function verifySiteToken(token: string): Promise<{ username: string; uuid: string }> {
  const payload = jwt.verify(token, SECRET) as { username: string; uuid: string };
  return { uuid: payload.uuid, username: payload.username };
}

export function extractToken(socket, req): string | undefined {
  const cookieHeader = req.headers.cookie;
  const match = cookieHeader?.match(new RegExp('(^|;)\\s*token=([^;]*)'));
  if (!match || !match[2]) {
    socket.send(JSON.stringify({ type: 'ERROR', code: 'AUTH', message: 'Token missing' }));
    socket.close();
    return undefined;
  }
  return match[2];
}
```

`handleAuth`:

- Verifies token → `{ uuid, username }`.
- Ensures only one connection per user (similar to matchmaking).
- Sets `client.uuid` and `client.username`.

So, chat:

- Trusts the **same identity** as the backend (`SECRET`).
- Uses **cookie‑based** `token` (access token) for WS auth.

---

## 6. Token catalogue (where to look for what)

For quick reference (see also `docs/tokens.md` for a compact list):

- **Access token** (`token` cookie):
  - Issued by backend on login/signup.
  - Used by:
    - Backend REST (`authPreHandler`).
    - Matchmaking (`handleAuth` via `SECRET`).
    - Chat (`handleAuth` via `SECRET`).

- **Refresh token** (`refresh_token` cookie):
  - Issued by backend on login/signup.
  - Consumed by `/api/auth/refresh`.
  - Stored as hash in DB.

- **Match service token**:
  - JWT signed with `MATCH_SECRET`.
  - Used by game server when calling backend match routes.
  - Verified by `matchAuthPreHandler`.

- **Join token**:
  - HMAC “JWT” signed with `REALTIME_TOKEN_SECRET`.
  - Issued by **Allocator** for each player in a room.
  - Consumed by:
    - Gateway to admit and route to the right node.
    - Game server to attach players to sessions.

- **Resume token**:
  - HMAC “JWT” signed with `REALTIME_TOKEN_SECRET`.
  - Issued by **Game server** (ResumeTokenService).
  - Used by:
    - Client to reconnect via gateway.
    - Game server to reattach sockets and resume matches.

- **Two‑factor tokens, signup/reset/delete tokens**:
  - Various JWTs and random strings used entirely on the backend.
  - Don’t leave the backend except via email links.

---

## 7. Mental model

You can summarize the token story as:

- **Backend**:
  - Issues **site identity tokens** (`SECRET`) for users.
  - Issues **match service tokens** (`MATCH_SECRET`) for internal services.
  - Stores all persistent user/match data.

- **Matchmaking & Chat**:
  - Trust the **site access token** to know who’s connected and what their MMR is (matchmaking).
  - Provide real‑time functionality (queues, chat, invites) keyed by `uuid`.

- **Allocator & Game nodes**:
  - Use **join tokens** and **resume tokens** (`REALTIME_TOKEN_SECRET`) to control admission to rooms and reconnections.
  - Keep gameplay **server‑authoritative** and resilient to reconnects.

If you know:

- Which secret signs which token (`SECRET`, `MATCH_SECRET`, `REALTIME_TOKEN_SECRET`).
- Which services verify which tokens.
- And how those tokens flow between browser and services.

…then you can confidently debug auth issues, extend the security model, or add new features that rely on identity or room‑level authorization.
