import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUserByEmail, updateLastSeen } from '../db/queries/users.ts';
import bcrypt from 'bcrypt';
import { normalizeCredentials } from '../hooks/auth.ts';
import { loginSchema } from '../schemas/authSchemas.ts';
import { signAccessToken } from '../utils/jwt.ts';

// TODO:
// Extra checks and route for 2FA
export async function loginRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: loginSchema,
      preValidation: [normalizeCredentials],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { email, password } = req.body as { email: string; password: string };

        const userInDb = getUserByEmail(email);
        if (!userInDb) return res.status(400).send({ message: 'Invalid credentials' });
        const isValidPassword = await bcrypt.compare(password, userInDb.passwordHash || '');
        if (!isValidPassword) return res.status(400).send({ message: 'Invalid credentials' });

        updateLastSeen(userInDb.uuid);
        const userForToken = {
          username: userInDb.username,
          uuid: userInDb.uuid,
        };

        const token = signAccessToken(userForToken);
        // Does the front need UUID anymore?
        res.setCookie('token', token, {
          httpOnly: true,
          sameSite: 'strict',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 4, // 4h
        });
        res.status(200).send({
          user: {
            username: userInDb.username,
            uuid: userInDb.uuid,
            avatar: userInDb.avatar || null,
          },
        });
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch login info from database.' });
      }
    },
  );
}
