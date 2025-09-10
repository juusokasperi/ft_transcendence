import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
  db.exec(`
	CREATE TABLE IF NOT EXISTS PendingUsers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	username TEXT NOT NULL UNIQUE,
	email TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	confirmation_token TEXT NOT NULL UNIQUE,
	expires_at DATETIME NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`);

  db.exec(`CREATE INDEX idx_unconfirmed_users ON PendingUsers(expires_at)`);
}

export async function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS PendingUsers;`);
}
