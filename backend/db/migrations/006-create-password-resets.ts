import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
	db.exec(`
	CREATE TABLE IF NOT EXISTS PasswordResets (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	user_uuid TEXT NOT NULL UNIQUE,
	reset_token TEXT NOT NULL UNIQUE,
	expires_at DATETIME NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_uuid) REFERENCES Users(uuid) ON DELETE CASCADE
	);`);

	db.exec(`CREATE INDEX idx_password_resets ON PasswordResets(reset_token)`);
};

export async function down(db: Database) {
	db.exec(`DROP TABLE IF EXISTS PasswordResets;`);
};

