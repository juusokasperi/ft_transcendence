import umzug from './umzug.ts';

export const runMigrations = async () => {
	const migrations = await umzug.up();
	console.log('Migrations up to date', {
		files: migrations.map((mig) => mig.name),
	});
};

export const rollbackMigration = async () => {
	const migrations = await umzug.down();
	if (migrations.length == 0) {
		console.log('No migrations to roll back to.');
	} else {
		migrations.forEach(migration => {
			console.log('Rolled back migration', migration.name);
		});
	}
};
