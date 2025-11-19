import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { deleteRefreshTokensByUser } from '../db/queries/refreshTokens.ts';
import { authPreHandler, tokenUuidCheck } from '../hooks/auth.ts';
import { logoutSchema } from '../schemas/authSchemas.ts';
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from '../utils/config.ts';

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
        deleteRefreshTokensByUser(uuid);
        res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, { path: '/' });
        res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, { path: '/' });
        res.status(200).send({ success: 'Successfully logged out.' });
      } catch (error) {
        res.status(500).send({ message: 'Failed to logout user' });
      }
    },
  );
}
