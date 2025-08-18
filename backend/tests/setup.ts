import Database from 'better-sqlite3';
import { createUmzug } from '../db/umzug.ts';
import fs from 'fs';

export async function createTestDb(): Promise<Database.Database> {
	const testDb = new Database(':memory:');
	testDb.pragma('journal_mode = WAL');

	const testUmzug = createUmzug(testDb);
	await testUmzug.up();
	return testDb;
}

export function cleanupTestDb(db: Database.Database) {
	db.close();
	const migrationFile = './tests/.migrations';
	if (fs.existsSync(migrationFile))
		fs.unlinkSync(migrationFile);
}
