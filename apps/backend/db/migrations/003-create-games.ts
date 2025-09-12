import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
  db.exec(`
	CREATE TABLE IF NOT EXISTS Games (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	team_1_score INTEGER NOT NULL,
	team_2_score INTEGER NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`);
}

export async function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS Games;`);
}
