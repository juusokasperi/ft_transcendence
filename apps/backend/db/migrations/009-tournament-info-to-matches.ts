import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
  db.exec(`
	ALTER TABLE MatchPlayers ADD COLUMN points_awarded INTEGER DEFAULT 0;
  ALTER TABLE Matches ADD COLUMN tournament_id INTEGER;
  ALTER TABLE Matches ADD COLUMN tournament_stage TEXT;
	`);
}

export async function down(db: Database) {
  db.exec(`
    ALTER TABLE MatchPlayers DROP COLUMN points_awarded;
    ALTER TABLE Matches DROP COLUMN tournament_id;
    ALTER TABLE Matches DROP COLUMN tournament_stage;
    `);
}
