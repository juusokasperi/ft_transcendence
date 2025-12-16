# Schema Overview – Users, Matches, Tournaments

This document gives a **schema‑level view** of the main tables in the backend SQLite database:

- Users and auth tables.
- Matches and per‑player stats.
- Tournaments and participants.

---

## 1. Users and authentication

### 1.1 `Users`

Created in `apps/backend/db/migrations/001-create-users.ts`:

```sql
CREATE TABLE IF NOT EXISTS Users (
  uuid TEXT PRIMARY KEY NOT NULL UNIQUE,
  username TEXT NOT NULL COLLATE NOCASE,
  email TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT,
  tfa BOOLEAN NOT NULL DEFAULT FALSE,
  tfa_secret TEXT,
  avatar TEXT,
  ranking INTEGER NOT NULL DEFAULT 1000,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  google_id TEXT UNIQUE,
  UNIQUE(username),
  UNIQUE(email),
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);
```

Key points:

- Each user has:
  - `uuid` – stable identifier used across services (matchmaking, tokens, etc.).
  - `username`, `email`, `avatar`, `ranking`.
  - Either a password hash or a Google ID (for social login).
- Constraints:
  - Unique `username` and `email`.
  - Either `password_hash` or `google_id` must be present.

TypeScript row type: `UserDb` in `apps/backend/types/dbtypes.ts`.

### 1.2 Auth‑related tables

- `PendingUsers` – signup confirmation tokens.
- `PasswordResets` – password reset tokens.
- `UsersForDelete` – delete‑confirmation tokens.
- `RefreshTokens` – hashed refresh tokens.

Used by `login`, `signup`, `reset-password`, and `auth` routes.

### 1.3 `UserSettings`

- Stores per‑user game preferences:
  - `paddle_color`, `color_blind_mode`, `photo_sensitive_mode`.
- Queried and updated via `apps/backend/db/queries/users.ts`.

---

## 2. Matches and per‑player stats

### 2.1 `Matches`

Created in `003-create-matches.ts`:

```sql
CREATE TABLE IF NOT EXISTS Matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_1_score INTEGER NOT NULL,
  team_2_score INTEGER NOT NULL,
  tournament_id INTEGER,
  tournament_stage TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Represents a completed match:

- `team_1_score`, `team_2_score` – final scores.
- Optional `tournament_id` / `tournament_stage` to link into tournaments.

### 2.2 `MatchPlayers`

Created in `004-create-matchplayers.ts`:

```sql
CREATE TABLE IF NOT EXISTS MatchPlayers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL,
  user_uuid TEXT,
  ranking_delta INTEGER NOT NULL DEFAULT 0,
  team_number INTEGER NOT NULL CHECK(team_number IN (1, 2)),
  FOREIGN KEY (match_id) REFERENCES Matches(id) ON DELETE CASCADE,
  FOREIGN KEY (user_uuid) REFERENCES Users(uuid) ON DELETE SET NULL
);
```

Represents a **user’s participation** in a match:

- `match_id` – foreign key to `Matches`.
- `user_uuid` – foreign key to `Users` (nullable if user is deleted).
- `team_number` – 1 or 2 for 1v1 Pong.
- `ranking_delta` – change in ELO after the match.

### 2.3 `MatchPlayerStats`

- Stores per‑player stats per match:
  - `points_scored`, `points_conceded`, `games_won`, `games_lost`, `max_point_lead`, etc.
- Joined with `MatchPlayers` in queries such as `getMatchesWithPlayersForUser`.

TypeScript types:

- `MatchDb`, `MatchPlayer`, `MatchWithPlayersForUserDb` in `apps/backend/types/dbtypes.ts`.

---

## 3. Tournaments

Tournament‑related tables are created in later migrations (e.g., `013-create-tournaments.ts` and friends). The types are summarized in `dbtypes.ts`:

### 3.1 `Tournaments`

Represented by `TournamentDb`:

```ts
export interface TournamentDb {
  id: number;
  name: string;
  description: string;
  format: string;
  status: string;
  max_participants: number | null;
  start_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
```

High‑level metadata:

- Name/description and display format.
- Lifecycle `status` (draft, active, completed).
- `max_participants` and scheduled times.

### 3.2 `TournamentParticipants`

`TournamentParticipantDb`:

```ts
export interface TournamentParticipantDb {
  id: number;
  tournament_id: number;
  user_uuid: string | null;
  alias: string;
  seed: number | null;
  status: string;
  joined_at: string;
}
```

- Links users (or guest aliases) to tournaments.
- Keeps seeds and registration status.

### 3.3 `TournamentMatches` and `TournamentMatchPlayers`

`TournamentMatchDb`:

```ts
export interface TournamentMatchDb {
  id: number;
  tournament_id: number;
  round_number: number;
  round_position: number;
  status: string;
  match_id: number | null;
  scheduled_at: string | null;
  completed_at: string | null;
}
```

- Represents bracket slots and their linkage to `Matches`.

`TournamentMatchPlayerDb`:

```ts
export interface TournamentMatchPlayerDb {
  id: number;
  tournament_match_id: number;
  participant_id: number;
  team_number: number;
}
```

- Assigns participants to bracket positions for actual matches.

These tables let the backend:

- Build tournament brackets.
- Track match scheduling and completion.
- Relate tournament state to actual Pong matches.

---

## 4. Friends and blocked users (high level)

While not detailed here, the DB also contains:

- `Friends` – friend relationships between users.
- `BlockedUsers` – used by both backend APIs and chat to prevent unwanted interaction.

Queries live in:

- `apps/backend/db/queries/friends.ts`
- `apps/backend/db/queries/blockedUsers.ts`

---

## 5. How this schema is used

- The **game server** reports results via backend routes (`/api/matches`, `/api/matches/:id/stats`):
  - Backend inserts into `Matches`, `MatchPlayers`, and `MatchPlayerStats`.
  - Updates `Users.ranking` based on ELO changes.
- The **frontend** reads:
  - User profile and stats (`/api/users/me`, `/api/users/me/stats`).
  - Match history (`/api/matches`).
  - Tournament lists and details (`/api/tournaments/...`).

Understanding this schema makes it much easier to follow:

- How match results end up as history and rankings.
- How tournaments are represented and progressed.
- How the backend enforces relationships between users, matches, and tournaments.
