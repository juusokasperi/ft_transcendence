import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { DATABASE_PATH } from '../utils/config.ts';

const db: DatabaseType = new Database(DATABASE_PATH);

db.pragma('journal_mode = WAL');		// Write-Ahead Logging Mode, allows reads while writes happen
db.pragma('synchronous = NORMAL');		// Doesn't wait for OS confirm about writes
db.pragma('cache_size = 512000');		// Uses 512MB cache for memory instead of default 2MB
db.pragma('temp_store = memory');		// Temporary tables/sorts happen in RAM instead of disk.

export default db;
