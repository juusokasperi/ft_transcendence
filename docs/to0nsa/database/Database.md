# Database in ft_transcendence – Overview

This folder explains how the **backend persistence layer** works:

- Which database technology is used.
- How the schema is organized (users, matches, tournaments, etc.).
- How TypeScript code interacts with the DB.

For API‑level behavior (login, matches, stats), see:

- `docs/to0nsa/workflow/BackendAndAPIs.md`
- `docs/to0nsa/workflow/ResultsAndRanking.md`

This folder focuses on **what the DB is, what it stores, and how it’s accessed**.

---

## 1. What database is used

The backend uses:

- **SQLite** as the database engine.
- **better‑sqlite3** as the Node.js driver (`apps/backend/db/client.ts`).

Characteristics:

- Embedded database – lives in a local file on disk, no separate DB server.
- Well‑suited for:
  - Single‑node deployments.
  - Low‑latency reads.
  - Simple operational model (no DB server to manage).

Configuration (`client.ts`):

```ts
const db = new Database(DATABASE_PATH);
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');      // wait up to 5s on lock
db.pragma('journal_mode = WAL');       // allow reads during writes
db.pragma('synchronous = NORMAL');     // balance durability vs speed
db.pragma('cache_size = -524288');     // ~512MB cache
db.pragma('temp_store = memory');      // temp tables/sorts in RAM
```

This setup:

- Enforces foreign keys.
- Reduces “database is locked” errors under concurrent access.
- Optimizes for the read‑heavy, write‑light profile of this app.

---

## 2. What data lives in the DB

The SQLite DB under `apps/backend/data/sqlite` (mounted into Docker) stores:

- **Users and auth:**
  - `Users` – identities (uuid, username, email, password hash or Google ID, ranking).
  - `RefreshTokens` – hashed refresh tokens.
  - `PendingUsers` – signup confirmation tokens.
  - `PasswordResets` – reset tokens.
  - `UsersForDelete` – delete‑confirmation tokens.
  - `UserSettings` – per‑user game settings (paddle color, accessibility).

- **Friends and social:**
  - `Friends` – friend relationships.
  - `BlockedUsers` – who blocked whom (used by chat and backend).

- **Matches and stats:**
  - `Matches` – match‑level results (scores, tournament context).
  - `MatchPlayers` – which users played in each match and ranking deltas.
  - `MatchPlayerStats` – per‑player stats (points scored, games won/lost, etc.).

- **Tournaments:**
  - `Tournaments` – tournament metadata (name, status, max participants).
  - `TournamentParticipants` – players/aliases registered for a tournament.
  - `TournamentMatches` – bracket slots.
  - `TournamentMatchPlayers` – which participants sit in each match slot.

These tables are created and evolved via TypeScript migrations in `apps/backend/db/migrations`.

---

## 3. How application code talks to the DB

The DB layer is mostly **hand‑written SQL** using `better-sqlite3`, wrapped in query helpers:

- DB client:

  ```ts
  // apps/backend/db/client.ts
  import Database from 'better-sqlite3';
  const db = new Database(DATABASE_PATH);
  export default db;
  ```

- Query modules:
  - `apps/backend/db/queries/users.ts`
  - `apps/backend/db/queries/matches.ts`
  - `apps/backend/db/queries/tournaments.ts`
  - and others (`friends.ts`, `blockedUsers.ts`, etc.).

Example pattern (`users.ts`):

```ts
const user = db.prepare('SELECT * FROM Users WHERE uuid = ?').get(uuid) as UserDb | null;
if (!user) return undefined;
return mapUserRecord(user);
```

Typed row interfaces live in:

- `apps/backend/types/dbtypes.ts`

Mapper functions (e.g., `mapUserRecord`) convert DB rows into domain types used by routes and services.

Migrations are managed with:

- `apps/backend/db/migrations/*.ts`
- `apps/backend/db/umzug.ts` – Umzug migration runner.

---

## 4. Where to go next

- `SchemaOverview.md` – schema and relationships for core tables (users, matches, tournaments).
- `MigrationsAndClient.md` – how migrations and the SQLite client are structured.
- `QueriesAndPatterns.md` – common query patterns and mapping approaches in the backend.

These docs build on this overview to give you a clear mental map of the backend database design.

