# Backend w/ database

Uses `better-sqlite3` to interact with the SQLite database. Migrations are handled with `Umzug`.

## Usage

1. Install packages `npm install`
2. Run `npm run seed:secret`
3. Add `FRONTEND_URL` to `.env.` (see `.env.example`)
4. Start server: `npm run dev`
   - On startup, server will run migrations automatically.
5. To rollback a migration, `npm run migration:down`
6. To clear data from database, run `npm run db:reset`
7. To run tests, `npm run test`

## Routes

- To do at least;
  - Game routes.
  - Two factor auth routes.
  - Username, password and email validation (with `zod`).

### Auth

| Method | Address (/api/)              | Function                      | Token required | Request body              | Returns token | Etc                        |
| ------ | ---------------------------- | ----------------------------- | -------------- | ------------------------- | ------------- | -------------------------- |
| POST   | signup                       | Signup as a new user          | No             | username, password, email | No            | Sends a confirmation email |
| POST   | signup/validate/`:token`     | Confirm user signup           | No             |                           | Yes           | Uses the token from email  |
| POST   | login                        | Login as an user              | No             | email, password           | Yes           |                            |
| POST   | reset-password               | Reset user password (pt. 1/2) | No             | email                     | No            | Sends a confirmation email |
| POST   | reset-password/`:resetToken` | Reset user password (pt. 2/2) | No             | newPassword               | No            |                            |

### Users

| Method | Address (/api/)                  | Function              | Token required | Request body                 | Etc                        |
| ------ | -------------------------------- | --------------------- | -------------- | ---------------------------- | -------------------------- |
| PATCH  | users                            | Get all users         | No             |                              |                            |
| GET    | users/`:uuid`                    | Get single user       | No             |                              |                            |
| PATCH  | users/me                         | Change username       | Yes            | newUsername                  |                            |
| PATCH  | users/me/password                | Change password       | Yes            | currentPassword, oldPassword |                            |
| PATCH  | users/me/avatar                  | Change avatar         | Yes            | avatar (multipart form)      |                            |
| DELETE | users/me/avatar                  | Delete avatar         | Yes            |                              |                            |
| DELETE | users/me                         | Delete user (pt. 1/2) | Yes            |                              | Sends a confirmation email |
| DELETE | users/me/confirm-delete/`:token` | Delete user (pt. 2/2) | Yes            |                              | Uses the token from email  |

### Friends

| Method | Address (/api/)           | Function                                                     | Token required | Request body     |
| ------ | ------------------------- | ------------------------------------------------------------ | -------------- | ---------------- |
| GET    | friends                   | Get friends                                                  | Yes            |                  |
| GET    | friends/pending/received  | Get received pending friend requests                         | Yes            |                  |
| GET    | friends/pending/sent      | Get sent pending friend requests                             | Yes            |                  |
| PATCH  | friends/`:uuid`/respond   | Respond to a friend request                                  | Yes            | accept (boolean) |
| POST   | friends/`:userIdentifier` | Send a friend request (API accepts UUID, username or e-mail) | Yes            |                  |
| DELETE | friends/`:uuid`           | Delete a friend                                              | Yes            |                  |

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

### Games

| Field        | Type | Key     | Nullable | Etc                             |
| ------------ | ---- | ------- | -------- | ------------------------------- |
| id           | INT  | Primary | No       | Autoincrement                   |
| team_1_score | INT  |         | No       | On user delete, delete this row |
| team_2_score | INT  |         | No       | On user delete, delete this row |
| created_at   | DATE |         | No       |                                 |

### GamePlayers

| Field       | Type | Key     | Nullable | Etc                             |
| ----------- | ---- | ------- | -------- | ------------------------------- |
| id          | INT  | Primary | No       | Autoincrement                   |
| game_id     | INT  | Foreign | No       | On game delete, delete this row |
| user_uuid   | TEXT | Foreign | No       | On user delete, set NULL        |
| team_number | DATE |         | No       | Must be 1 or 2                  |

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

### User validation

To-Do: E-mail address, username, password validation

Other stuff on the to-do agenda; - Handle JWT tokens as httpOnly cookies instead of current JSON to localStorage handling. - Under consideration: Split the backend into microservices - f.ex. - PROXY SERVER -> Routes traffic to ROUTES server or CHAT server
