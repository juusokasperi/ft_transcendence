import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUserByEmail, updateLastSeen, getUserByUuid } from '../db/queries/users.ts';
import bcrypt from 'bcrypt';
import { normalizeCredentials } from '../hooks/auth.ts';
import { loginSchema, loginTwoFactorSchema } from '../schemas/authSchemas.ts';
import { signAccessToken, signTwoFactorToken, verifyTwoFactorToken } from '../utils/jwt.ts';
import { verifyTotpToken } from '../utils/twoFactor.ts';

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

        const userForToken = {
          username: userInDb.username,
          uuid: userInDb.uuid,
        };

        if (userInDb.tfa && userInDb.tfaSecret) {
          const pendingToken = signTwoFactorToken(userForToken);
          res.status(200).send({
            twoFactorRequired: true,
            pendingToken,
            method: 'totp',
          });
          return;
        }

        updateLastSeen(userInDb.uuid);

        const token = signAccessToken(userForToken);
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
            tfa: !!userInDb.tfa,
          },
        });
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch login info from database.' });
      }
    },
  );

  app.post(
    '/tfa',
    {
      schema: loginTwoFactorSchema,
      preValidation: [normalizeCredentials],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        const { token, code } = req.body as { token: string; code: string };
        if (!token || !code) {
          res.status(400).send({ message: 'Missing token or code' });
          return;
        }

        let payload;
        try {
          payload = verifyTwoFactorToken(token);
        } catch {
          res.status(401).send({ message: 'Invalid or expired token' });
          return;
        }

        const user = getUserByUuid(payload.uuid);
        if (!user || !user.tfa || !user.tfaSecret) {
          res.status(400).send({ message: 'Two-factor authentication not enabled' });
          return;
        }

        const isValid = verifyTotpToken(user.tfaSecret, code);
        if (!isValid) {
          res.status(400).send({ message: 'Invalid authentication code' });
          return;
        }

        updateLastSeen(user.uuid);
        const accessToken = signAccessToken({ username: user.username, uuid: user.uuid });
        res.setCookie('token', accessToken, {
          httpOnly: true,
          sameSite: 'strict',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 4,
        });

        res.status(200).send({
          user: {
            username: user.username,
            uuid: user.uuid,
            avatar: user.avatar || null,
            tfa: true,
          },
        });
      } catch (error) {
        res.status(500).send({ message: 'Failed to verify two-factor code.' });
      }
    },
  );
}
