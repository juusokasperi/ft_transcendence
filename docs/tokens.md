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

- **Join token** - HMAC-signed JWT produced by the allocator (`apps/allocator/index.ts:103`) using `signJoinToken` (`packages/pong/shared/src/auth/tokenSign.ts:4`). Encodes room metadata (roomId, side, expiration) and is verified offline by the gateway/game nodes for WebSocket admission.
- **Resume token** (planned) - same mechanism targeting reconnects within the grace window, outlined in `docs/dev/matchmaking/blueprint.md`.
