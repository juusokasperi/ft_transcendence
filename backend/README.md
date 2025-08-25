# Backend w/ database

Uses `better-sqlite3` to interact with the SQLite database. Migrations are handled with `Umzug`.

## Usage
1. Create `.env` file (see `.env.example`)
2. Install packages `npm install`
3. Start server: `npm run dev`
	- On startup, server will run migrations automatically.
4. To rollback a migration, `npm run migration:down`

## Routes

- To do at least;
	- Game routes.
	- Two factor auth routes.
	- Username, password and email validation (with `zod`).

### Auth
| Method | Address (/api/)          | Function                             | Token required | Request body                 | Returns token |
|--------|--------------------------|--------------------------------------|----------------|------------------------------|---------------|
| POST   | signup                   | Signup as a new user                 |  No            | username, password, email    | Yes           |
| POST   | login                    | Login as an user                     |  No            | email, password              | Yes           |

### Users
| Method | Address (/api/)          | Function                             | Token required | Request body                 |
|--------|--------------------------|--------------------------------------|----------------|------------------------------|
| PATCH  | users                    | Get all users                        |  No            |                              |
|  GET   | users/`:uuid`            | Get single user                      |  No            |                              |
| PATCH  | users/me                 | Change username                      |  Yes           | newUsername                  |
| DELETE | users/me                 | Delete user                          |  Yes           |                              |
| PATCH  | users/me/password        | Change password                      |  Yes           | currentPassword, oldPassword |
| PATCH  | users/me/avatar          | Change avatar                        |  Yes           | avatar (multipart form)      |
| DELETE | users/me/avatar          | Delete avatar                        |  Yes           |                              |
### Friends

| Method | Address (/api/)          | Function                             | Token required | Request body                 |
|--------|--------------------------|--------------------------------------|----------------|------------------------------|
| GET    | friends                  | Get friends                          |  Yes           |                              |
| GET    | friends/pending/received | Get received pending friend requests |  Yes           |                              |
| GET    | friends/pending/sent     | Get sent pending friend requests     |  Yes           |                              |
| PATCH  | friends/`:uuid`/respond  | Respond to a friend request          |  Yes           | accept (boolean)             |
| POST   | friends/`:userIdentifier`          | Send a friend request (API accepts UUID, username or e-mail)                |  Yes           |                              |
| DELETE | friends/`:uuid`          | Delete a friend                      |  Yes           |                              |

## Database

### Tables
---

### Users
| Field         | Type | Key     | Nullable | Etc    |
|---------------|------|---------|----------|--------|
| uuid          | TEXT | Primary | No       | Unique |
| username      | TEXT |         | No       | Unique |
| email         | TEXT |         | No       | Unique |
| password_hash | TEXT |         | Yes      |        |
| tfa           | BOOL |         | No       | Default false |
| avatar        | TEXT |         | Yes      |               |
| ranking       | INT  |         | No       | Default 1000  |
| created_at    | DATE |         | No       |               |
| google_id     | TEXT |         | Yes      |               |

- Constraints:
	- Either one of password_hash or google_id must not be NULL.

### Friends

| Field         | Type | Key     | Nullable | Etc    |
|---------------|------|---------|----------|--------|
| id            | INT  | Primary | No       | Autoincrement |
| friend_1_uuid | TEXT | Foreign | No       | On user delete, delete this row |
| friend_2_uuid | TEXT | Foreign | No       | On user delete, delete this row |
| created_at    | DATE |         | No       |               |
| accepted      | BOOL |         | No       | Default false |

- Constraints:
	- Cannot befriend oneself - friend_1_uuid != friend_2_uuid
- Unique_friendship index makes sure that an entry where the user uuids are (A,B) is treated the same as (B,A), so a friendship cannot be in the table twice.

### Games

| Field         | Type | Key     | Nullable | Etc    |
|---------------|------|---------|----------|--------|
| id            | INT  | Primary | No       | Autoincrement |
| team_1_score  | INT  |         | No       | On user delete, delete this row |
| team_2_score  | INT  |         | No       | On user delete, delete this row |
| created_at    | DATE |         | No       |               |

### GamePlayers

| Field         | Type | Key     | Nullable | Etc    |
|---------------|------|---------|----------|--------|
| id            | INT  | Primary | No       | Autoincrement |
| game_id       | INT  | Foreign | No       | On game delete, delete this row |
| user_uuid     | TEXT | Foreign | No       | On user delete, set NULL |
| team_number   | DATE |         | No       | Must be 1 or 2          |

Other stuff on the to-do agenda;
	- Split the backend into microservices - f.ex.
		PROXY SERVER -> Routes traffic to ROUTES server or CHAT server
	- Handle JWT tokens as httpOnly cookies instead of current JSON to localStorage handling.
