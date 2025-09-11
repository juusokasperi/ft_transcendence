import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
  db.exec(`
	CREATE TABLE IF NOT EXISTS UsersForDelete (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_uuid TEXT NOT NULL UNIQUE,
	confirmation_token TEXT NOT NULL UNIQUE,
	expires_at DATETIME NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_uuid) REFERENCES Users(uuid) ON DELETE CASCADE
	);`);

  db.exec(`CREATE INDEX idx_delete_tokens ON UsersForDelete(confirmation_token)`);
}

export async function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS UsersForDelete;`);
}
