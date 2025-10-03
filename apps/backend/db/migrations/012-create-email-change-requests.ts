import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
  db.exec(`
	CREATE TABLE IF NOT EXISTS EmailChangeRequests (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_uuid TEXT NOT NULL,
	email_change_token TEXT NOT NULL,
	email_change_new_email TEXT NOT NULL COLLATE NOCASE,
	email_change_expires DATETIME NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_uuid) REFERENCES Users(uuid) ON DELETE CASCADE,
	UNIQUE(email_change_token)
	);

	CREATE INDEX IF NOT EXISTS EmailChangeRequests_user_uuid_idx ON EmailChangeRequests(user_uuid);
	CREATE INDEX IF NOT EXISTS EmailChangeRequests_email_change_expires_idx ON EmailChangeRequests(email_change_expires);
	`);
}

export async function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS EmailChangeRequests;`);
}
