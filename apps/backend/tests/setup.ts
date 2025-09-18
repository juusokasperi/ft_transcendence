import Database from 'better-sqlite3';
import { createUmzug } from '../db/umzug.ts';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export async function createTestDb(): Promise<Database.Database> {
  const migrationFile = `./tests/.migrations-${uuidv4()}`;
  const testDb = new Database(':memory:');
  // Enforce foreign keys in tests as well
  testDb.pragma('foreign_keys = ON');
  testDb.pragma('journal_mode = WAL');

  const testUmzug = createUmzug(testDb, migrationFile);
  await testUmzug.up();
  (testDb as any)._migrationFile = migrationFile;

  return testDb;
}

export function cleanupTestDb(db: Database.Database) {
  const migrationFile = (db as any)._migrationFile;
  if (fs.existsSync(migrationFile)) fs.unlinkSync(migrationFile);

  db.close();
}
