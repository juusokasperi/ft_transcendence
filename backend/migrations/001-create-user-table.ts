import db from '../utils/sqlite_client.ts';

export async function up() {
	db.exec(`
	CREATE TABLE IF NOT EXISTS User (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	uuid TEXT NOT NULL UNIQUE,
	username TEXT NOT NULL UNIQUE,
	passwordHash TEXT NOT NULL,
	wins INTEGER NOT NULL DEFAULT 0,
	losses INTEGER NOT NULL DEFAULT 0,
	createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`);
}

export async function down() {
	db.exec(`DROP TABLE IF EXISTS User;`);
}
