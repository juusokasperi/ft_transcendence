import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { badSqlPrepare, badSqlExecute, goodSql } from '../db/queries/debug.ts';
import { getAllUsersSchema } from '../schemas/userSchemas.ts';

export async function debugRoutes(app: FastifyInstance) {
  // debug endpoint to generate successful SQL query
  app.get(
    '/good-sql',
    { schema: getAllUsersSchema },
    async (_req: FastifyRequest, res: FastifyReply) => {
      try {
        goodSql();
        res.status(200).send();
      } catch (error) {
        res.status(500).send({ message: 'Failed to succeed SQL' });
      }
    },
  );

  // debug endpoint to generate failed SQL query (prepare time)
  app.get('/bad-sql-prepare', async (_req, res) => {
    try {
      badSqlPrepare();
      res.status(200).send({ message: 'This should not succeed' });
    } catch (err) {
      res.status(500).send({ message: 'Prepare-time SQL error', error: (err as Error).message });
    }
  });

  // debug endpoint to generate failed SQL query (execute time)
  app.get('/bad-sql-execute', async (_req, res) => {
    try {
      badSqlExecute();
      res.status(200).send({ message: 'This should not succeed' });
    } catch (err) {
      res.status(500).send({ message: 'Execution-time SQL error', error: (err as Error).message });
    }
  });
}
