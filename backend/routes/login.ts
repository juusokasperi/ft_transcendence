import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUserByEmail } from '../db/queries/users.ts';
import bcrypt from 'bcrypt';
import { SECRET } from '../utils/config.ts';
import jwt from 'jsonwebtoken';
import { normalizeCredentials } from '../hooks/auth.ts';

// TODO:
// Extra checks and route for 2FA
export async function loginRoutes(app: FastifyInstance) {
  app.post(
    '/',
    { preValidation: [normalizeCredentials] },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { email, password } = req.body as { email: string; password: string };

        const userInDb = getUserByEmail(email);
        if (!userInDb) return res.status(400).send({ message: 'Invalid credentials' });
        const normalizedPassword = password.normalize('NFKC');
        const isValidPassword = await bcrypt.compare(
          normalizedPassword,
          userInDb.passwordHash || '',
        );
        if (!isValidPassword) return res.status(400).send({ message: 'Invalid credentials' });

        const userForToken = {
          username: userInDb.username,
          uuid: userInDb.uuid,
        };

        const token = jwt.sign(userForToken, SECRET, { expiresIn: '4h' });

        // Does the front need UUID anymore?
        res.status(200).send({
          token,
          user: {
            username: userInDb.username,
            uuid: userInDb.uuid,
            avatar: userInDb.avatar,
          },
        });
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch login info from database.' });
      }
    },
  );
}
