# Backend & APIs – Source of Truth for Users, Auth, and Stats

This document gives a **backend‑centric view of the stack**, focusing on:

- How the backend API (`apps/backend`) handles **login and JWTs**.
- How matchmaking and the game server use backend‑issued tokens.
- Where **user stats, rankings, and match summaries** are stored and exposed.

It ties together the pieces you see in:

- `OnlinePongNetwork.md`
- `MatchmakingService.md`
- `GameNode.md`
- `ResultsAndRanking.md`

For more on the underlying stack:

- `docs/to0nsa/node/BackendServer.md` – Fastify setup and plugin usage in `apps/backend`.
- `docs/to0nsa/redis/TournamentsAndBackend.md` – how Redis streams are used for tournament coordination.

---

## 1. Backend API overview

Entry: `apps/backend/index.ts`.

The backend is a Fastify server that:

- Owns **users** and authentication.
- Exposes **REST APIs** for:
  - Login, logout, signup, refresh tokens, password reset.
  - Friends and blocked users.
  - Matches and per‑match stats.
  - Tournaments (brackets, membership, results).
  - Status/metrics endpoints.
- Serves avatar uploads via `/uploads/`.
- Provides Swagger docs at `/docs`.

Key registrations:

```ts
app.register(userRoutes, { prefix: '/api/users' });
app.register(friendsRoutes, { prefix: '/api/friends' });
app.register(matchRoutes, { prefix: '/api/matches' });
app.register(tournamentRoutes, { prefix: '/api/tournaments' });
app.register(loginRoutes, { prefix: '/api/login' });
app.register(logoutRoutes, { prefix: '/api/logout' });
app.register(signupRoutes, { prefix: '/api/signup' });
app.register(refreshRoutes, { prefix: '/api/auth' });
app.register(resetPasswordRoutes, { prefix: '/api/reset-password' });
app.register(statusRoutes, { prefix: '/api/status' });
app.register(blockedUsersRoutes, { prefix: '/api/blocked-users' });
```

The backend is the **single source of truth** for:

- User identities and profiles.
- Rankings (ELO).
- Match history and per‑match stats.
- Tournament structure and outcomes.

---

## 2. Login → JWT → authenticated calls

### 2.1 Login and cookies (`/api/login`)

File: `apps/backend/routes/login.ts`.

Login flow:

1. Client POSTs email/password to `/api/login` (or uses 2FA endpoint `/api/login/tfa`).
2. Backend:
   - Validates credentials (`getUserByEmail`, bcrypt).
   - Optionally checks 2FA (`verifyTotpToken`).
   - Calls `issueTokensForUser` to create:
     - Access token (short‑lived JWT).
     - Refresh token (longer‑lived JWT).
3. Tokens are sent to the browser as **HTTP‑only cookies**:

```ts
res.setCookie(ACCESS_TOKEN_COOKIE_NAME, issued.accessToken, { httpOnly: true, sameSite: 'strict', secure: prod, path: '/', maxAge: 4h });
res.setCookie(REFRESH_TOKEN_COOKIE_NAME, issued.refreshToken, { httpOnly: true, sameSite: 'strict', secure: prod, path: '/', maxAge: issued.refreshCookieMaxAge });
```

The response body also includes a serialized user object (username, uuid, avatar, stats summary).

### 2.2 Access token verification (`authPreHandler`)

File: `apps/backend/hooks/auth.ts`.

For protected routes (e.g. `/api/users/me`, `/api/users/me/stats`, `/api/friends`, etc.), the backend uses `authPreHandler`:

```ts
export function authPreHandler(req, res, done) {
  const authHeader = req.headers.authorization;
  let token;
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies?.[ACCESS_TOKEN_COOKIE_NAME]) {
    token = req.cookies[ACCESS_TOKEN_COOKIE_NAME] as string;
  }
  if (!token) { /* clear cookies, 401 */ }
  try {
    const payload = verifyAccessToken(token);
    req.user = payload as any;
    done();
  } catch (err) {
    // clear cookies, 401 with code 'token_expired' or 'token_invalid'
  }
}
```

Important:

- Access token can be provided either:
  - As a `Bearer` header (useful for non‑browser clients).
  - Or via the cookie set at login (normal browser flow).
- If valid, `req.user` is set (contains at least `uuid`, `username`).
- `tokenUuidCheck` is sometimes used to ensure `uuid` is present.

In the **frontend**, `useAppContext` and auth helpers:

- Call `/api/login` and `/api/auth/refresh` as needed.
- Store the current user info in React context.
- Ensure Axios sends cookies and/or Authorization header for protected calls.

### 2.3 Match auth for game server (`matchAuthPreHandler`)

Also in `hooks/auth.ts`:

```ts
export function matchAuthPreHandler(req, res, done) {
  const authHeader = req.headers.authorization;
  let token;
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    token = authHeader.split(' ')[1];
  }
  if (!token) return res.status(401).send({ message: 'Missing match authorization token' });
  try {
    jwt.verify(token, MATCH_SECRET);
    done();
  } catch {
    res.status(401).send({ message: 'Invalid or expired match service token' });
  }
}
```

This is used by:

- `POST /api/matches`
- `POST /api/matches/:matchId/stats`
- Tournament result endpoints

The **game server** signs this token with `MATCH_SECRET` (see `ResultReporter.signToken`) and uses it as `Authorization: Bearer <token>` when calling backend APIs. That way:

- Only trusted game servers can submit match results and stats.

---

## 3. How matchmaking and game results tie into backend

### 3.1 Matchmaking → Allocator → Game server

As described in other docs:

- Matchmaking uses the **site JWT** (access token) to authenticate browser clients.
- When pairing players, it calls **Allocator**; Allocator uses its own admin secret to talk to game servers.

Here, the backend is mostly involved via:

- The initial login and user identity.
- The fact that `playerIdentifier` in join tokens is a **user UUID**, which comes from backend data.

### 3.2 Game server → Backend (results and rankings)

For **casual matches**, `ResultReporter.reportCasual`:

- Calls `POST /api/matches` with:

```ts
{
  team1Players: [east.identifier],
  team2Players: [west.identifier],
  team1Score: eastScore,
  team2Score: westScore
}
```

This hits `apps/backend/routes/matches.ts`:

- Uses `matchAuthPreHandler` to verify the match token (`MATCH_SECRET`).
- Transaction:
  - Reads current ELO for all players (`getUserStats`).
  - Calculates ELO deltas using `calculateEloChange`.
  - Inserts match row (`addMatch`).
  - Updates user rankings (`updateUserRanking`) and inserts `MatchPlayers` rows.
- Returns `{ matchId, eloChanges }`.

Then `ResultReporter` posts per‑player stats to:

- `POST /api/matches/:matchId/stats` with `pointsScored`, `gamesWon`, `maxPointLead`, etc.

On the backend, this route:

- Verifies match exists.
- Maps player UUIDs to `MatchPlayers` IDs.
- `upsertMatchPlayerStats` persists stats in `MatchPlayerStats` table.

For **tournament matches**, `ResultReporter.reportTournament`:

- Calls:

```ts
POST /api/tournaments/:tournamentId/matches/:tournamentMatchId/result
```

with winner/loser participants, user UUIDs, and games history.  
Backend tournament routes:

- Update tournament match records.
- Drive bracket progression (semis/final/bronze).

---

## 4. Where the frontend reads stats and summaries

### 4.1 Current user profile and stats

`apps/backend/routes/users.ts` exposes:

- `GET /api/users/me`:
  - Authenticated via `authPreHandler` and `tokenUuidCheck`.
  - Returns user profile (username, uuid, avatar, email, tfa).
  - Also returns a summary of wins/losses using `getUserStats`.

- `GET /api/users/me/stats`:
  - Returns aggregated stats for current user via `getTotalStatsForUser`.

- `GET /api/users/:uuid/stats`:
  - Returns stats for any user (auth required).

These are used in various frontend views:

- Profile page.
- Stats page.
- Opponent public profile.

### 4.2 Match history

Still in `routes/matches.ts`:

- `GET /api/matches/:matchId`:
  - Auth required (`authPreHandler`).
  - Returns a match with players and their ELO deltas via `getMatchWithPlayers`.

- `GET /api/matches`:
  - Auth + `tokenUuidCheck`.
  - Returns matches for the current user, optionally paginated (`count`, `offset`).

The frontend uses these to:

- Show a list of recent matches with scores and ranking changes.
- Let a user inspect individual match details.

### 4.3 Tournament information

`apps/backend/routes/tournaments.ts` (high level):

- Exposes:
  - Tournament listings (`GET /api/tournaments`).
  - Tournament details and participants.
  - Tournament matches and progression.
  - Endpoints that the game server/allocator interact with via match tokens and internal APIs.

For the frontend:

- These routes feed:
  - Tournament lobby pages.
  - Bracket views.
  - Tournament detail pages in the Pong UI.

---

## 5. Putting it together: backend as source of truth

From a **workflow** perspective:

1. **User logs in**:
   - Backend verifies credentials.
   - Issues access/refresh tokens and sets HTTP‑only cookies.
   - Frontend stores user info and uses it in `AppContext`.

2. **Frontend calls protected APIs**:
   - Cookies (and/or Authorization headers) are sent automatically.
   - `authPreHandler` verifies the access token and attaches `req.user`.
   - User can fetch profile, stats, friends, tournaments, etc.

3. **Online match happens**:
   - Matchmaking and game server use **user UUIDs** from backend as player identifiers.
   - Game server runs the match; on completion, `ResultReporter` calls backend routes with an internal match token (`MATCH_SECRET`).
   - Backend updates rankings and records match stats.

4. **User sees updated stats**:
   - Subsequent calls to `/api/users/me`, `/api/users/me/stats`, `/api/matches`, etc. reflect the updated DB state.
   - UI shows new rankings, win/loss records, and match history.

So the flow is:

> **Backend** issues identity + tokens →  
> **Matchmaking / Game Node** use those IDs/tokens to run matches →  
> **Backend** records results and rankings →  
> **Frontend** reads from backend for all user‑visible stats.

When you think “what is the source of truth for X?”, the answer is:

- User identity → backend DB.
- Auth state → backend‑issued JWTs/cookies.
- Match results/rankings → backend matches + stats tables.
- Tournament state → backend tournament tables and routes.

The rest of the stack (matchmaking, allocator, gateway, game server) is built around this backend source of truth.
