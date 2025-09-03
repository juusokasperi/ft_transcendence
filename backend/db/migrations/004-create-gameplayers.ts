import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
	db.exec(`
	CREATE TABLE IF NOT EXISTS GamePlayers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	game_id INTEGER NOT NULL,
	user_uuid TEXT,
	team_number INTEGER NOT NULL CHECK(team_number IN (1, 2)),
	FOREIGN KEY (game_id) REFERENCES Games(id) ON DELETE CASCADE,
	FOREIGN KEY (user_uuid) REFERENCES Users(uuid) ON DELETE SET NULL
	);`);
}

export async function down(db: Database) {
	db.exec(`DROP TABLE IF EXISTS GamePlayers;`);
}
