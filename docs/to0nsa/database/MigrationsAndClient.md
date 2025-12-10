# Migrations & SQLite Client

This document explains how:

- The SQLite client is configured (`better-sqlite3`).
- Schema changes are managed via TypeScript migrations and Umzug.

It complements:

- `Database.md` – DB overview.
- `SchemaOverview.md` – core tables and relationships.

---

## 1. SQLite client (`better-sqlite3`)

**File:** `apps/backend/db/client.ts`

The backend uses **better‑sqlite3** for synchronous, low‑latency access:

```ts
import Database from 'better-sqlite3';
import { DATABASE_PATH } from '../utils/config.ts';

const db = new Database(DATABASE_PATH);

// Enforce constraints and tune performance
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');      // wait up to 5s on lock
db.pragma('journal_mode = WAL');       // allow reads during writes
db.pragma('synchronous = NORMAL');     // balance durability vs speed
db.pragma('cache_size = -524288');     // ~512MB cache
db.pragma('temp_store = memory');      // temp tables in RAM

export default db;
```

Key behaviors:

- **Foreign keys ON** – ensures referential integrity (e.g., `MatchPlayers.match_id` must point to an existing match).
- **Busy timeout** – avoids immediate “database is locked” errors by retrying for up to 5 seconds.
- **WAL mode** – improves concurrency by allowing concurrent reads during writes.

All query modules import this singleton `db` instance.

---

## 2. Migrations with Umzug

Schema evolution is managed by **Umzug**, a migration tool for Node.

Relevant files:

- `apps/backend/db/migrations/*.ts` – individual migrations.
- `apps/backend/db/umzug.ts` – Umzug configuration.
- `apps/backend/db/migrations.ts` – helper to run migrations at startup.

### 2.1 Migration files

Each migration exports `up` and `down` functions:

Example `001-create-users.ts`:

```ts
import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
  db.exec(`
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
  `);
}

export async function down(db: Database) {
  db.exec('DROP TABLE IF EXISTS Users;');
}
```

Other migrations add:

- Matches, match players, match player stats.
- Friends, blocked users.
- Pending users, password resets, delete confirmations.
- User settings.
- Tournaments and tournament participants/matches.

### 2.2 Migration runner

`apps/backend/db/migrations.ts`:

```ts
import { umzug } from './umzug.ts';

export async function runMigrations() {
  await umzug.up();
}
```

The backend calls this at startup (`apps/backend/index.ts`):

```ts
await runMigrations();
```

- Ensures the DB schema is up‑to‑date before serving requests.
- If migrations fail, the backend fails fast instead of running with a partially applied schema.

### 2.3 Umzug config (high level)

`umzug.ts` sets up:

- The migration directory (`db/migrations`).
- How to load migration files (TypeScript).
- How to log migration events.
- Where to store the migration history (either a table in SQLite or a separate metadata store).

You rarely need to touch `umzug.ts` unless changing how migrations are tracked.

---

## 3. Adding a new migration

When you need to change the schema:

1. **Create a new migration file** under `apps/backend/db/migrations` with the next number:

   ```ts
   // 015-add-some-feature.ts
   import type { Database } from 'better-sqlite3';

   export async function up(db: Database) {
     db.exec(`
       ALTER TABLE SomeTable ADD COLUMN some_new_column TEXT;
     `);
   }

   export async function down(db: Database) {
     db.exec(`
       ALTER TABLE SomeTable DROP COLUMN some_new_column;
     `);
   }
   ```

2. **Update types**:
   - Add corresponding fields to `dbtypes.ts`.
   - Update any query mappers that read/write the new column.

3. **Run migrations**:
   - In dev: restart the backend or run the migration script (if provided).
   - In prod: ensure the backend container runs `runMigrations()` on startup (already wired).

> Note: On older SQLite versions, `DROP COLUMN` is not supported. In those cases, either:
> - Declare the migration irreversible (throw in `down`), or
> - Use the “rebuild table” pattern described in `backend-db-review.md`.

---

## 4. Query modules and mapping

Each domain has a corresponding query module:

- `users.ts` – user CRUD, auth helpers, settings.
- `matches.ts` – match history, user stats, ELO calculations.
- `tournaments.ts` – tournament CRUD and lookups.
- `friends.ts`, `blockedUsers.ts`, etc.

Patterns:

- **Row types** in `dbtypes.ts` reflect raw DB columns.
- Mapper functions convert DB rows into **domain types** used by routes and services.

Example (`users.ts`):

```ts
function mapUserRecord(user: UserDb): User {
  return {
    uuid: user.uuid,
    username: user.username,
    email: user.email,
    passwordHash: user.password_hash,
    tfa: !!user.tfa,
    tfaSecret: user.tfa_secret,
    avatar: user.avatar,
    ranking: user.ranking,
    createdAt: user.created_at,
    googleId: user.google_id,
  };
}
```

This separation makes it easier to:

- Change the DB schema without changing every consumer.
- Keep public types (used by routes and clients) decoupled from SQLite’s exact column names and types.

---

## 5. Summary

- The backend uses **better‑sqlite3** with carefully chosen PRAGMAs for correctness and performance.
- Schema is evolved using **TypeScript migrations and Umzug**, run automatically at backend startup.
- Query modules wrap raw SQL into typed helpers, mapping DB rows into domain types.

Understanding this layer helps you safely modify the schema, add new data, or reason about DB performance and correctness changes.

