# Backend DB: Issues, Rationale, and Fix Recipes

Audience: teammate maintaining `apps/backend/db/*`

This note summarizes concrete issues observed in the DB layer, explains why they matter, links to primary docs, and gives copy‑pasteable fix snippets.

## 1) Correctness: OFFSET without LIMIT in SQLite

- Where: `apps/backend/db/queries/matches.ts` (the pagination CTE)
- Why: In SQLite, `OFFSET` requires `LIMIT`. Using `OFFSET` alone is a syntax error. If `offset` is provided and `count` isn’t, the query throws and the function returns an empty array from the catch.
- Docs: SQLite SELECT syntax (LIMIT/OFFSET) — https://sqlite.org/lang_select.html

Fix pattern: Only include `OFFSET` when `LIMIT` is present, or use `LIMIT -1` when only `offset` is supplied.

Example implementation (safe for all combinations):

```ts
// inside getMatchesWithPlayersForUser(...)
const params: any[] = [uuid];
const includeLimit = typeof count === 'number' && count > 0;
const includeOffset = typeof offset === 'number' && offset > 0;

const limitClause = includeLimit ? 'LIMIT ?' : includeOffset ? 'LIMIT -1' : '';
const offsetClause = includeOffset ? 'OFFSET ?' : '';
if (includeLimit) params.push(count as number);
if (includeOffset) params.push(offset as number);

const rows = db.prepare(`
  WITH UserMatches AS (
    SELECT ...
    WHERE mp.user_uuid = ?
    ORDER BY m.created_at DESC
    ${limitClause}
    ${offsetClause}
  )
  SELECT ...
`).all(...params);
```

## 2) Types vs LEFT JOIN nullability

- Where: `apps/backend/types/dbtypes.ts` in `MatchWithPlayersForUserDb`
- Why: The query uses `LEFT JOIN Users`, so joined columns can be `NULL` (e.g., deleted user rows or `ON DELETE SET NULL`). Current TypeScript types mark these as non‑nullable, which is unsound and can cause downstream assumptions to break.
- Docs: Behavior of `LEFT JOIN` — standard SQL, result columns can be `NULL` if no match.

Fix pattern: Make joined fields nullable.

```ts
export interface MatchWithPlayersForUserDb {
  match_id: number;
  team_1_score: number;
  team_2_score: number;
  tournament_id: number | null;
  tournament_stage: string | null;
  match_created_at: string;
  team_number: number;
  uuid: string | null;            // was string
  username: string | null;        // was string
  avatar: string | null;
  ranking: number | null;         // was number
  user_created_at: string | null; // was string
}
```

Also verify mapping code guards `null` (it already does):

```ts
const player = row.uuid != null ? { ... } : null;
```

If the intent is “never nullable”

If your business rule is that match player user fields must always be present, consider one of these designs so the TypeScript types can remain non‑nullable truthfully:

- Use INNER JOIN and/or NOT NULL FK
  - Change the query to use `INNER JOIN Users u ON mp.user_uuid = u.uuid` so rows without a matching user are excluded. This ensures the selected user fields are never NULL, but you will lose player rows if the user was deleted.
  - Schema option: enforce `MatchPlayers.user_uuid` as `NOT NULL` and use `ON DELETE RESTRICT` on the FK to prevent deleting users that are referenced by matches. This preserves history but blocks hard deletes.

  Example query change:
  ```sql
  SELECT ...
  FROM MatchPlayers mp
  INNER JOIN Users u ON mp.user_uuid = u.uuid
  WHERE mp.match_id = ?
  ORDER BY mp.team_number, mp.id
  ```

- Soft delete users (preferred for history)
  - Add `deleted_at DATETIME NULL` to `Users`, never hard‑delete; set `deleted_at = CURRENT_TIMESTAMP` when “deleting”.
  - Update queries to filter out soft‑deleted users where needed, but retain joins for historical data. User fields stay present and non‑null.

  Migration sketch:
  ```sql
  ALTER TABLE Users ADD COLUMN deleted_at DATETIME;
  -- On delete action: set deleted_at instead of removing the row
  ```

- Snapshot denormalization at insert time
  - Copy the minimal user fields you need to render history into `MatchPlayers` when inserting a match (e.g., `username_at_match`, `avatar_at_match`, `ranking_at_match`).
  - Then build responses from these snapshot columns, not from `Users`. This keeps historical records immutable and non‑null even if the user is later removed or changes their profile.

  Schema and insert sketch:
  ```sql
  -- Migration: add snapshot columns
  ALTER TABLE MatchPlayers ADD COLUMN username_at_match TEXT NOT NULL;
  ALTER TABLE MatchPlayers ADD COLUMN avatar_at_match TEXT;
  ALTER TABLE MatchPlayers ADD COLUMN ranking_at_match INTEGER;
  ```
  ```ts
  // When inserting a MatchPlayers row
  const u = db.prepare('SELECT username, avatar, ranking FROM Users WHERE uuid = ?').get(uuid);
  db.prepare(`
    INSERT INTO MatchPlayers (match_id, user_uuid, team_number, points_awarded,
                              username_at_match, avatar_at_match, ranking_at_match)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(matchId, uuid, team, points, u.username, u.avatar, u.ranking);
  ```

Trade‑offs
- INNER JOIN + RESTRICT preserves non‑null types but prevents hard deletion of users with history.
- Soft delete keeps history and types non‑null, at the cost of more logic and storage.
- Snapshot denormalization is robust for historical rendering and decouples from current user state, at the cost of duplicated data and write‑time complexity.

## 3) Booleans in SQLite (0/1 vs boolean)

- Where: `apps/backend/types/dbtypes.ts` (`UserDb.tfa`, `UserStatsDb.online`)
- Why: SQLite has no native boolean type; it stores 0/1 as integers. Return values from SELECT will be numbers unless coerced. Our Db types label them as `boolean`, which is only safe if we always coerce.
- Docs: SQLite Datatypes — https://sqlite.org/datatype3.html (no separate Boolean storage class)

Two valid strategies (pick one and be consistent):

Option A — Type as numbers in DB layer and coerce in mappers:

```ts
// dbtypes.ts
export interface UserDb { tfa: number /* 0|1 */; /* ... */ }
export interface UserStatsDb { online: number /* 0|1 */; /* ... */ }

// mappers
online: !!dbUser.online,
tfa: !!user.tfa,
```

Option B — Keep boolean types and ALWAYS coerce before returning from query helpers (audit all return sites):

```ts
return {
  // ...
  tfa: !!user.tfa,
  online: !!result.online,
};
```

## 4) Migrations

### 4.1) Down migration uses DROP COLUMN

- Where: `apps/backend/db/migrations/009-tournament-info-to-matches.ts`
- Why: `ALTER TABLE ... DROP COLUMN` requires SQLite ≥ 3.35.0 (2021‑03‑12). Older runtimes will fail on `down`. Even on new SQLite, rolling back after app code starts relying on these columns can break runtime.
- Docs: 3.35.0 release notes — https://sqlite.org/releaselog/3_35_0.html, ALTER TABLE — https://sqlite.org/lang_altertable.html

Options:

1) Declare migration irreversible:

```ts
export async function down() {
  throw new Error('009-tournament-info-to-matches is irreversible');
}
```

2) Rebuild pattern (compatible with older SQLite): create a temp table without the new columns, copy data, drop and rename. Example: https://sqlite.org/lang_altertable.html#making_other_kinds_of_table_schema_changes

### 4.2) Index creation lacks IF NOT EXISTS

- Where: `005-create-pending-users.ts`, `006-create-password-resets.ts`, `007-create-users-delete.ts`
- Why: Umzug runs migrations once, but adding `IF NOT EXISTS` improves idempotency for manual runs or partial resets.
- Docs: CREATE INDEX — https://sqlite.org/lang_createindex.html

Fix pattern:

```sql
CREATE INDEX IF NOT EXISTS idx_unconfirmed_users ON PendingUsers(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_resets ON PasswordResets(reset_token);
CREATE INDEX IF NOT EXISTS idx_delete_tokens ON UsersForDelete(confirmation_token);
```

## 5) Reliability / Performance

### 5.1) Busy timeout for lock handling

- Where: `apps/backend/db/client.ts`
- Why: Concurrent writes can produce "database is locked" errors. Setting a busy timeout makes SQLite wait for a short time before failing.
- Docs: PRAGMA busy_timeout — https://sqlite.org/pragma.html#pragma_busy_timeout

Fix snippet:

```ts
db.pragma('busy_timeout = 5000'); // 5s
```

## 6) Minor / Style

### 6.1) Unused selected fields in stats

- Where: `apps/backend/db/queries/users.ts` (baseQuery)
- Why: `u.email` is selected but not mapped into the return shape. Harmless but noisy.
- Fix: Drop it from the SELECT, or add it to the return type if we intend to expose it.

### 6.2) Safe dynamic UPDATE keys (settings)

- Where: `apps/backend/db/queries/users.ts` (`updateUserSettings`)
- Why: The dynamic field list is fine server‑side, but validate inputs at the route/schema level so only whitelisted keys can be set.
- Docs: Fastify + AJV schema — https://www.fastify.io/docs/latest/Reference/Validation-and-Serialization/

Example route schema:

```ts
// In route handler schema
body: {
  type: 'object',
  additionalProperties: false,
  properties: {
    paddle_color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    color_blind_mode: { type: 'integer', minimum: 0, maximum: 4 },
    photo_sensitive_mode: { type: 'integer', minimum: 0, maximum: 2 },
  },
}
```

---
