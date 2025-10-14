import umzug from './umzug.ts';
import { getLogger } from '../utils/logger.ts';

export const runMigrations = async () => {
  const logger = getLogger();
  const migrations = await umzug.up();
  logger.info(
    {
      files: migrations.map((mig) => mig.name),
    },
    'Migrations up to date',
  );
};

export const rollbackMigration = async () => {
  const logger = getLogger();
  const migrations = await umzug.down();
  if (migrations.length == 0) {
    logger.info('No migrations to roll back to.');
  } else {
    migrations.forEach((migration) => {
      logger.info({ migration: migration.name }, 'Rolled back migration');
    });
  }
};
