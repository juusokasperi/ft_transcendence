import type { Database } from 'better-sqlite3';

// Per-match, per-player statistics captured independently from ELO/ranking updates.
export async function up(db: Database) {
  db.exec(`
	CREATE TABLE IF NOT EXISTS MatchPlayerStats (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		match_player_id INTEGER NOT NULL UNIQUE,
		points_scored INTEGER NOT NULL DEFAULT 0,
		points_conceded INTEGER NOT NULL DEFAULT 0,
		games_won INTEGER NOT NULL DEFAULT 0,
		games_lost INTEGER NOT NULL DEFAULT 0,
		max_point_lead INTEGER NOT NULL DEFAULT 0,
		FOREIGN KEY (match_player_id) REFERENCES MatchPlayers(id) ON DELETE CASCADE
	);
  `);
}

export async function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS MatchPlayerStats;`);
}
