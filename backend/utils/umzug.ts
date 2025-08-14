import { Umzug, JSONStorage } from 'umzug';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './sqlite_client.ts';
import type { Database } from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const umzug: Umzug<Database> = new Umzug({
	migrations: {
		glob: path.join(__dirname, '../migrations/*.ts'),
		resolve: ({ name, path: migrationPath }) => {
			if (!migrationPath)
				throw new Error(`Migration path is undefined for migration: ${name}`);
			return {
				name,
				up: async() => {
					const migration = await import(migrationPath);
					return migration.up(db);
				},
				down: async() => {
					const migration = await import(migrationPath);
					return migration.down(db);
				},
			};
		},
	},
	context: db,
	storage: new JSONStorage({ path: path.join(__dirname, '../migrations/.umzug.json') }),
	logger: console,
});

export default umzug;
