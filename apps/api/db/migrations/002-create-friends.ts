import type { Database } from 'better-sqlite3';

/*
	If either of the friends is deleted from the Users -table,
	the Friend row will be deleted from this table (ON DELETE CASCADE)

	friend_1_uuid is the sender of friend request
	friend_2_uuid is the receiver (needs to accept)

	Constraints make sure user cannot befriend themselves and that
	all friendships are unique.
*/
export async function up(db: Database) {
  db.exec(`
	CREATE TABLE IF NOT EXISTS Friends (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	friend_1_uuid TEXT NOT NULL,
	friend_2_uuid TEXT NOT NULL,
	created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
	accepted BOOLEAN NOT NULL DEFAULT FALSE,
	FOREIGN KEY (friend_1_uuid) REFERENCES Users(uuid) ON DELETE CASCADE,
	FOREIGN KEY (friend_2_uuid) REFERENCES Users(uuid) ON DELETE CASCADE,
	CONSTRAINT no_self_friend CHECK (friend_1_uuid != friend_2_uuid)
	);`);

  db.exec(`
	CREATE UNIQUE INDEX IF NOT EXISTS unique_friendship
	ON Friends (
		CASE WHEN friend_1_uuid < friend_2_uuid
			THEN friend_1_uuid
			ELSE friend_2_uuid END,
		CASE WHEN friend_1_uuid < friend_2_uuid
			THEN friend_2_uuid
			ELSE friend_1_uuid END
	);`);
}

export async function down(db: Database) {
  db.exec(`DROP INDEX IF EXISTS unique_friendship;`);
  db.exec(`DROP TABLE IF EXISTS Friends;`);
}
