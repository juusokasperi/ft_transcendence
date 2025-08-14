## Backend w/ database

Uses `better-sqlite3` to interact with the SQLite database. Migrations are handled with `Umzug`.

### Usage
1. Create `.env` file (see `.env.example`)
2. Start server: `npm run dev`
	- On startup, server will run migrations automatically.
3. To rollback a migration, `npm run migration:down`
