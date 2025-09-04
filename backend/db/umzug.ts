import { Umzug, JSONStorage } from 'umzug';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './client.ts';
import type { Database } from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
};

export function createUmzug(database: Database = db, migrationFile?: string): Umzug<any> {
  return new Umzug({
    migrations: {
      glob: path.join(__dirname, './migrations/*.ts'),
      resolve: ({ name, path: migrationPath }) => {
        if (!migrationPath) throw new Error(`Migration path is undefined for migration: ${name}`);
        return {
          name,
          up: async () => {
            const migration = await import(migrationPath);
            return migration.up(database);
          },
          down: async () => {
            const migration = await import(migrationPath);
            return migration.down(database);
          },
        };
      },
    },
    context: database,
    storage: new JSONStorage({
      path: migrationFile
        ? path.join(process.cwd(), migrationFile)
        : path.join(__dirname, '../data/.umzug.json'),
    }),
    logger: database === db ? console : silentLogger,
  });
}

const umzug = createUmzug();

export default umzug;
