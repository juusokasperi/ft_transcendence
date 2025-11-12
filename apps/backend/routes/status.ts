import type { FastifyInstance } from 'fastify';
import { countTournamentsByStatus } from '../db/queries/tournaments.ts';
import { getLiveMatchSnapshot } from '../services/liveStats.ts';

export async function statusRoutes(app: FastifyInstance) {
  app.get('/live', async (req, reply) => {
    try {
      const snapshot = await getLiveMatchSnapshot();
      const tournaments = countTournamentsByStatus('active');

      return reply.status(200).send({
        matches: snapshot.matches,
        source: snapshot.source,
        updatedAt: snapshot.updatedAt,
        tournaments,
      });
    } catch (error) {
      req.log.error({ error }, 'GET /api/status/live failed');
      return reply.status(500).send({ message: 'Failed to fetch live status' });
    }
  });
}
