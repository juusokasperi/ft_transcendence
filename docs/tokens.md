# Token Catalog

## Web Authentication

- **Access token (`token` cookie)** - short-lived JWT (~4h) created by `issueTokensForUser` (`apps/backend/utils/authTokens.ts:16`) during login, signup confirmation, or Google OAuth. Stored as an httpOnly cookie and validated in `authPreHandler` (`apps/backend/hooks/auth.ts:8`) on protected REST routes.
- **Refresh token (`refresh_token` cookie)** - long-lived JWT (default 30d) issued alongside the access token. A SHA-256 hash is persisted in the `RefreshTokens` table via `storeRefreshToken` (`apps/backend/db/queries/refreshTokens.ts:30`). The `/api/auth/refresh` endpoint (`apps/backend/routes/refresh.ts:1`) verifies, rotates, and reissues access/refresh pairs; logout, password changes, and 2FA enablement revoke stored hashes.
- **Two-factor pending token** - JWT with purpose `two-factor`, minted by `signTwoFactorToken` when a password login needs TOTP confirmation (`apps/backend/routes/login.ts:32`). `/api/login/tfa` verifies the token and the submitted code before issuing access/refresh cookies.
- **Signup confirmation token** - random hex string saved in `PendingUsers` (`apps/backend/db/queries/unconfirmedUsers.ts`). Sent by email in `/api/signup` and consumed by `/api/signup/validate/:token` prior to promoting the user (`apps/backend/routes/signup.ts:44`).
- **Password reset token** - random hex stored in `PasswordResets` (`apps/backend/db/queries/passwordResets.ts`). Issued via `/api/reset-password` and redeemed at `/api/reset-password/:token` to set a new password (`apps/backend/routes/resetPassword.ts:15`).
- **Account deletion token** - confirmation token recorded in `UsersForDelete` through `markUserForDelete` (`apps/backend/db/queries/userDelete.ts:12`); removed once the delete flow completes.

## Internal Services

- **Match service token** - bearer JWT signed with `MATCH_SECRET`. Internal services include it when calling match routes; `matchAuthPreHandler` validates it (`apps/backend/hooks/auth.ts:65`).

## Real-time Matchmaking

- **Join token**
  - HMAC-signed JWT produced by the allocator (`apps/allocator/index.ts:103`) via `signJoinToken` (`packages/pong/shared/src/auth/tokenSign.ts`).
  - Claims: `iss: 'mm'`, `aud: 'game-node'`, `roomIdentifier`, `sub` (player), `side`, `iat`, `exp`, `jti`.
  - Admission:
    - Client connects to gateway using WebSocket subprotocol `['bearer', <joinToken>]`.
    - Gateway validates signature, room match, and `iss/aud`. If valid, it persists `join-token:<jti>` in Redis with TTL `exp-now` using `SET NX` to prevent reuse, then proxies the upgrade to the game node based on `room-to-node:<roomId>`.
    - Game node rechecks join-token reuse by verifying the Redis key exists before accepting.

- **Resume token**
  - Implemented to allow secure reconnects during an in-match grace window.
  - Issuance: game node mints tokens using `ResumeTokenService` (`apps/game-server/src/app/ResumeTokenService.ts`).
    - Claims: `iss: 'game-server'`, `aud: 'game-server'`, `roomIdentifier`, `sessionIdentifier`, `sub` (player), `iat`, `exp`, `jti`.
    - Persistence: single-use replay protection via Redis key `resume-token:<jti>` stored with `SET NX` and TTL.
    - Fail-closed: if Redis persistence fails, issuance throws and no token is sent to clients.
  - Rotation and TTL guarantees:
    - Let `graceMs` be the server-side reconnect grace (see `apps/game-server/src/app/Config.ts`).
    - Rotation cadence: `rotatePeriod = max(3000ms, floor(graceMs / 3))`.
    - Each issued token TTL: `ttlMs = graceMs + rotatePeriod`.
    - Effect: while connected, clients receive overlapping tokens; upon disconnection, the most recent token remains valid for at least the full grace window (no gaps near rotation boundaries).
  - Delivery: game node sends `{ type: 'RESUME_TOKEN', token }` over the control channel to the player.
  - Reconnect admission:
    - Client reconnects using WebSocket subprotocol `['resume', <resumeToken>]` to the gateway `/g/:roomId` endpoint.
    - Gateway validates signature, room match, and `iss/aud` (`'game-server'/'game-server'`) and proxies to the same game node.
    - Game node consumes the token (verifies signature, `iss/aud`, deletes `resume-token:<jti>`). If valid, it binds the socket back to the player seat and resumes/publishes room state.
  - Close codes (selected): invalid/missing token `4401`, room/session mismatch `4404`, replaced by resume `4403`, server error `1011`.

Client notes

- Frontend stores only the latest token and may decode the JWT payload to read `exp` for scheduling reconnect attempts; signature verification is server-side only.
- Reconnect attempts should use a bounded backoff (e.g., 0.5s → 1s → 2s → 4s) and stop when the token expires or when a match end is received.
