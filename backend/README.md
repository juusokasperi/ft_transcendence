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
