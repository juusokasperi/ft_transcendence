import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
  db.exec(`
	ALTER TABLE GamePlayers ADD COLUMN points_awarded INTEGER DEFAULT 0;
  ALTER TABLE Games ADD COLUMN tournament_id INTEGER;
  ALTER TABLE Games ADD COLUMN tournament_stage TEXT;
	`);
}

export async function down(db: Database) {
  db.exec(`
    ALTER TABLE GamePlayers DROP COLUMN points_awarded;
    ALTER TABLE Games DROP COLUMN tournament_id;
    ALTER TABLE Games DROP COLUMN tournament_stage;
    `);
}
