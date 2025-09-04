import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
	db.exec(`
	CREATE TABLE IF NOT EXISTS UserProfileSettings (
	user_uuid TEXT PRIMARY KEY NOT NULL UNIQUE,
	paddle_color TEXT NOT NULL DEFAULT '#ffffff' CHECK(paddle_color LIKE '#______'),
	color_blind_mode INTEGER NOT NULL DEFAULT 0 CHECK(color_blind_mode IN (0, 1, 2, 3, 4)),
	photo_sensitive_mode INTEGER NOT NULL DEFAULT 0 CHECK(photo_sensitive_mode IN (0, 1, 2)),
	FOREIGN KEY (user_uuid) REFERENCES Users(uuid) ON DELETE CASCADE
	);`);
}

export async function down(db: Database) {
	db.exec(`DROP TABLE IF EXISTS UserProfileSettings;`);
}
