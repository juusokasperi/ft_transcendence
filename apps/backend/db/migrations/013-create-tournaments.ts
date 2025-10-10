import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      format TEXT NOT NULL DEFAULT 'single_elimination',
      status TEXT NOT NULL DEFAULT 'draft',
      max_participants INTEGER,
      start_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS TournamentParticipants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      user_uuid TEXT,
      alias TEXT NOT NULL,
      seed INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES Tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (user_uuid) REFERENCES Users(uuid) ON DELETE SET NULL,
      UNIQUE (tournament_id, alias)
    );

    CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament
      ON TournamentParticipants(tournament_id);

    CREATE TABLE IF NOT EXISTS TournamentMatches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      round_number INTEGER NOT NULL,
      round_position INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      match_id INTEGER,
      scheduled_at DATETIME,
      completed_at DATETIME,
      FOREIGN KEY (tournament_id) REFERENCES Tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY (match_id) REFERENCES Matches(id) ON DELETE SET NULL,
      UNIQUE (tournament_id, round_number, round_position)
    );

    CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament
      ON TournamentMatches(tournament_id);

    CREATE TABLE IF NOT EXISTS TournamentMatchPlayers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_match_id INTEGER NOT NULL,
      participant_id INTEGER NOT NULL,
      team_number INTEGER NOT NULL CHECK(team_number IN (1, 2)),
      FOREIGN KEY (tournament_match_id) REFERENCES TournamentMatches(id) ON DELETE CASCADE,
      FOREIGN KEY (participant_id) REFERENCES TournamentParticipants(id) ON DELETE CASCADE,
      UNIQUE (tournament_match_id, team_number),
      UNIQUE (tournament_match_id, participant_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tournament_match_players_match
      ON TournamentMatchPlayers(tournament_match_id);
  `);
}

export async function down(db: Database) {
  db.exec(`
    DROP TABLE IF EXISTS TournamentMatchPlayers;
    DROP TABLE IF EXISTS TournamentMatches;
    DROP TABLE IF EXISTS TournamentParticipants;
    DROP TABLE IF EXISTS Tournaments;
  `);
}
