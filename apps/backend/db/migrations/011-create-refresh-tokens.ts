import type { Database } from 'better-sqlite3';

// Track refresh tokens to support rotation and revocation.
export async function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS RefreshTokens (
      token_id TEXT PRIMARY KEY,
      user_uuid TEXT NOT NULL,
      hashed_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_uuid) REFERENCES Users(uuid) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON RefreshTokens(user_uuid);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON RefreshTokens(expires_at);
  `);
}

export async function down(db: Database) {
  db.exec(`
    DROP TABLE IF EXISTS RefreshTokens;
  `);
}
