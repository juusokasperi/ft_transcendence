import type { Database } from 'better-sqlite3';

// Add an index to speed up lookups by match_id from MatchPlayers.
// This benefits fetching players for a match and stats writes.
export async function up(db: Database) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_matchplayers_match ON MatchPlayers(match_id);`);
}

export async function down(db: Database) {
  db.exec(`DROP INDEX IF EXISTS idx_matchplayers_match;`);
}
