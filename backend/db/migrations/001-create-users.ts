import type { Database } from 'better-sqlite3';

/*
	Instead of TEXT we could use VARCHAR(length), but SQLite treats
	VARCHAR's as TEXT anyway and just ignores the max length

	google_id is needed only for Google Sign-In. If we end up not
	implemeting it, we can also add NOT NULL to password_hash.
*/
export async function up(db: Database) {
  db.exec(`
	CREATE TABLE IF NOT EXISTS Users (
	uuid TEXT PRIMARY KEY NOT NULL UNIQUE,
	username TEXT NOT NULL COLLATE NOCASE,
	email TEXT NOT NULL COLLATE NOCASE,
	password_hash TEXT,
	tfa	BOOLEAN NOT NULL DEFAULT FALSE,
	avatar TEXT,
	ranking INTEGER NOT NULL DEFAULT 1000,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	google_id TEXT UNIQUE,
	UNIQUE(username),
	UNIQUE(email),
	CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
	);`);
}

export async function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS Users;`);
}
