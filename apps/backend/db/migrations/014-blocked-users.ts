import type { Database } from 'better-sqlite3';

export async function up(db: Database) {
  db.exec(`
	CREATE TABLE IF NOT EXISTS BlockedUsers (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	blocker_uuid TEXT NOT NULL,
	blocked_uuid TEXT NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (blocker_uuid) REFERENCES Users(uuid) ON DELETE CASCADE,
	FOREIGN KEY (blocked_uuid) REFERENCES Users(uuid) ON DELETE CASCADE,
	CONSTRAINT no_self_block CHECK (blocker_uuid != blocked_uuid),
	UNIQUE (blocker_uuid, blocked_uuid)
	);
  CREATE INDEX IF NOT EXISTS idx_blockedusers_blocker_uuid ON BlockedUsers(blocker_uuid);
  `);
}

export async function down(db: Database) {
  db.exec(`DROP TABLE IF EXISTS BlockedUsers;`);
}
