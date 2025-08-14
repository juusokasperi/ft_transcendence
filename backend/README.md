## Backend w/ database

Uses `better-sqlite3` to interact with the SQLite database. Migrations are handled with `Umzug`.

### Usage
1. Create `.env` file (see `.env.example`)
2. Install packages `npm install`
3. Start server: `npm run dev`
	- On startup, server will run migrations automatically.
4. To rollback a migration, `npm run migration:down`
