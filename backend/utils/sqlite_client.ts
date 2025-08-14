import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { DATABASE_URL } from './config.ts';

const db: DatabaseType = new Database(DATABASE_URL);

export default db;
