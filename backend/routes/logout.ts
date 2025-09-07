import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { updateLastSeen } from '../db/queries/users.ts';
import { authPreHandler, tokenUuidCheck } from '../hooks/auth.ts';

// Sets user's last_seen status back 10 minutes, making them
// appear offline.
export async function logoutRoutes(app: FastifyInstance) {
  app.post(
    '/',
    { preHandler: [authPreHandler, tokenUuidCheck] },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const result = updateLastSeen(uuid, tenMinutesAgo);
        if (!result) res.status(500).send({ message: 'Failed to logout user' });
        res.status(200);
      } catch (error) {
        res.status(500).send({ message: 'Failed to logout user' });
      }
    },
  );
}
