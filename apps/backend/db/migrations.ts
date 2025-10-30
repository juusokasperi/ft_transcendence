import umzug from './umzug.ts';
import { logger } from '@utils/logger';

export const runMigrations = async () => {
  const migrations = await umzug.up();
  logger.info(
    {
      files: migrations.map((mig) => mig.name),
    },
    'Migrations up to date',
  );
};

export const rollbackMigration = async () => {
  const migrations = await umzug.down();
  if (migrations.length == 0) {
    logger.info('No migrations to roll back to.');
  } else {
    migrations.forEach((migration) => {
      logger.info({ migration: migration.name }, 'Rolled back migration');
    });
  }
};
