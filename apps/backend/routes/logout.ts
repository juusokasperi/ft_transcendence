import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { updateLastSeen } from '../db/queries/users.ts';
import { deleteRefreshTokensByUser } from '../db/queries/refreshTokens.ts';
import { authPreHandler, tokenUuidCheck } from '../hooks/auth.ts';
import { logoutSchema } from '../schemas/authSchemas.ts';

// Sets user's last_seen status back 10 minutes, making them
// appear offline.
export async function logoutRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: logoutSchema,
      preHandler: [authPreHandler, tokenUuidCheck],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const uuid = req.user!.uuid;
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const result = updateLastSeen(uuid, tenMinutesAgo);
        if (!result) {
          res.status(500).send({ message: 'Failed to logout user' });
          return;
        }
        deleteRefreshTokensByUser(uuid);
        res.clearCookie('token', { path: '/' });
        res.clearCookie('refresh_token', { path: '/' });
        res.status(200).send({ success: 'Successfully logged out.' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to logout user' });
      }
    },
  );
}
