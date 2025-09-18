# Backend w/ database

Uses `better-sqlite3` to interact with the SQLite database. Migrations are handled with `Umzug`.

## Usage

1. Install packages `npm install`
2. Run `npm run seed:secret` (creates a secret token for .env)
3. Run `npm run db:seed` for creating some test data in the database.
4. See `.env.example` for what else is needed
5. Start server: `npm run dev`
   - On startup, server will run migrations automatically.
6. To rollback a migration, `npm run migration:down`
7. To clear data from database, run `npm run db:reset`
8. To run tests, `npm run test`

## Routes

- To do at least;
  - Two factor auth routes.

- Swagger generates documentation when server is running, at `http://localhost:{backend_port}/docs`

## Database

### Tables

---

### Users

| Field         | Type | Key     | Nullable | Etc           |
| ------------- | ---- | ------- | -------- | ------------- |
| uuid          | TEXT | Primary | No       | Unique        |
| username      | TEXT |         | No       | Unique        |
| email         | TEXT |         | No       | Unique        |
| password_hash | TEXT |         | Yes      |               |
| tfa           | BOOL |         | No       | Default false |
| avatar        | TEXT |         | Yes      |               |
| ranking       | INT  |         | No       | Default 1000  |
| created_at    | DATE |         | No       |               |
| last_seen     | DATE |         | No       |               |
| google_id     | TEXT |         | Yes      |               |

- Constraints:
  - Either one of password_hash or google_id must not be NULL.

### Friends

| Field         | Type | Key     | Nullable | Etc                             |
| ------------- | ---- | ------- | -------- | ------------------------------- |
| id            | INT  | Primary | No       | Autoincrement                   |
| friend_1_uuid | TEXT | Foreign | No       | On user delete, delete this row |
| friend_2_uuid | TEXT | Foreign | No       | On user delete, delete this row |
| created_at    | DATE |         | No       |                                 |
| accepted      | BOOL |         | No       | Default false                   |

- Constraints:
  - Cannot befriend oneself - friend_1_uuid != friend_2_uuid
- Unique_friendship index makes sure that an entry where the user uuids are (A,B) is treated the same as (B,A), so a friendship cannot be in the table twice.

### Matches

| Field            | Type | Key     | Nullable | Etc                      |
| ---------------- | ---- | ------- | -------- | ------------------------ |
| id               | INT  | Primary | No       | Autoincrement            |
| team_1_score     | INT  |         | No       |                          |
| team_2_score     | INT  |         | No       |                          |
| tournament_id    | INT  |         | Yes      | Null when not tournament |
| tournament_stage | ENUM |         | Yes      | Null when not tournament |
| created_at       | DATE |         | No       |                          |

### MatchPlayers

| Field          | Type | Key     | Nullable | Etc                              |
| -------------- | ---- | ------- | -------- | -------------------------------- |
| id             | INT  | Primary | No       | Autoincrement                    |
| match_id       | INT  | Foreign | No       | On match delete, delete this row |
| user_uuid      | TEXT | Foreign | No       | On user delete, set NULL         |
| team_number    | DATE |         | No       | Must be 1 or 2                   |
| points_awarded | INT  |         | No       |                                  |

### PendingUsers

Users that have signed up, but have not yet confirmed their account by e-mail.

| Field              | Type | Key     | Nullable | Etc            |
| ------------------ | ---- | ------- | -------- | -------------- |
| id                 | INT  | Primary | No       | Autoincrement  |
| username           | TEXT |         | No       | Unique         |
| email              | TEXT |         | No       | Unique         |
| password_hash      | TEXT |         | No       |                |
| confirmation_token | TEXT |         | No       | Unique         |
| expires_at         | DATE |         | No       | Now + 24 hours |
| created_at         | DATE |         | No       |                |

### PasswordResets

Users that have requested password change.

| Field       | Type | Key     | Nullable | Etc                       |
| ----------- | ---- | ------- | -------- | ------------------------- |
| id          | INT  | Primary | No       | Autoincrement             |
| user_uuid   | TEXT | Foreign | No       | Unique, on delete cascade |
| reset_token | TEXT |         | No       | Unique                    |
| expires_at  | DATE |         | No       | Now + 30 minutes          |
| created_at  | DATE |         | No       |                           |

### UsersForDelete

Users that have requested account deletion.

| Field              | Type | Key     | Nullable | Etc                       |
| ------------------ | ---- | ------- | -------- | ------------------------- |
| id                 | INT  | Primary | No       | Autoincrement             |
| user_uuid          | TEXT | Foreign | No       | Unique, on delete cascade |
| confirmation_token | TEXT |         | No       | Unique                    |
| expires_at         | DATE |         | No       | Now + 24 hours            |
| created_at         | DATE |         | No       |                           |

### UserProfileSettings

| Field                | Type | Key     | Nullable          | Etc                          |
| -------------------- | ---- | ------- | ----------------- | ---------------------------- |
| user_uuid            | TEXT | Primary | No                | Unique                       |
| paddle_color         | TEXT |         | No                | RGB value, default '#ffffff' |
| color_blind_mode     | INT  |         | No                | Value between 0-4            |
| photo_sensitive_mode | INT  | No      | Value between 0-2 |

Other stuff on the to-do agenda; - Handle JWT tokens as httpOnly cookies instead of current JSON to localStorage handling. - Under consideration: Split the backend into microservices - f.ex. - PROXY SERVER -> Routes traffic to ROUTES server or CHAT server
