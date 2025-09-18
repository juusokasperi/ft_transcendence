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

### 5.2) Cache size and temp_store

- Where: `apps/backend/db/client.ts`
- Why: `temp_store = memory` plus a very large cache can create high RAM usage. With `PRAGMA cache_size`, negative values denote kibibytes. `cache_size = 512000` with 4KiB pages is ~2GiB, not ~512MiB.
- Docs: PRAGMA cache_size — https://sqlite.org/pragma.html#pragma_cache_size, PRAGMA temp_store — https://sqlite.org/pragma.html#pragma_temp_store

Fix guidance:

```ts
// Consider starting conservative and tuning with real metrics
db.pragma('cache_size = -131072'); // ~128 MiB
// db.pragma('temp_store = memory'); // only if measured beneficial, otherwise omit
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

## 7) Foreign keys (context)

- Where: `apps/backend/db/client.ts`, tests setup
- Why: SQLite does not enforce foreign keys unless enabled per connection. Cascades and referential checks won’t work without it.
- Docs: PRAGMA foreign_keys — https://sqlite.org/pragma.html#pragma_foreign_keys

Fix snippet (already applied in codebase):

```ts
db.pragma('foreign_keys = ON');
// Also in tests: testDb.pragma('foreign_keys = ON');
```

---

If you want me to apply any of the optional fixes (types, migrations down strategy, tuning pragmas), say the word and I’ll send a focused patch.

