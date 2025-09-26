import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  checkUserExists,
  addUserToPending,
  getPendingUserByToken,
  deleteExpiredUsers,
  removeFromPending,
  confirmUser,
} from '../db/queries/unconfirmedUsers.ts';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { issueTokensForUser } from '../utils/authTokens.ts';
import { v4 as uuidv4 } from 'uuid';
import { sendConfirmationEmail } from '../utils/nodemailer/index.ts';
import { normalizeCredentials } from '../hooks/auth.ts';
import { signupSchema, signupConfirmSchema } from '../schemas/authSchemas.ts';

export async function signupRoutes(app: FastifyInstance) {
  // Post a new user and logs them in
  app.post(
    '/',
    {
      schema: signupSchema,
      preValidation: [normalizeCredentials],
    },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        deleteExpiredUsers();
        const { username, password, email } = req.body as {
          username: string;
          password: string | undefined;
          email: string;
        };
        if (checkUserExists(username, email))
          return res.status(400).send({ message: 'Username or email already taken' });
        if (!password) return res.status(400).send({ message: 'Missing password field' });

        const passwordHash = await bcrypt.hash(password, 10);
        const confirmationToken = crypto.randomBytes(32).toString('hex');
        const result = addUserToPending(username, email, passwordHash, confirmationToken);
        if (!result) return res.status(500).send({ message: 'Failed to create user' });
        const emailSent = await sendConfirmationEmail(email, confirmationToken);
        if (!emailSent) {
          removeFromPending(confirmationToken);
          return res.status(500).send({ message: 'Failed to send confirmation email.' });
        }

        res.status(200).send({ success: 'Confirmation link sent to email.' });
      } catch (error) {
        res.status(500).send({ message: 'Failed adding user to database.' });
      }
    },
  );

  app.post(
    '/validate/:token',
    { schema: signupConfirmSchema },
    async (req: FastifyRequest, res: FastifyReply) => {
      try {
        deleteExpiredUsers();
        const { token } = req.params as { token: string };
        const user = getPendingUserByToken(token);
        if (!user) return res.status(400).send({ message: 'Invalid or expired token.' });

        const uuid = uuidv4();
        const result = confirmUser(token, uuid, user);
        if (!result) {
          removeFromPending(token);
          return res
            .status(500)
            .send({ message: 'Failed to add user to database, try signing up again.' });
        }

        const username = user.username;
        const userForToken = { username, uuid };
        let issued;
        try {
          issued = issueTokensForUser(userForToken);
        } catch {
          return res.status(500).send({ message: 'Failed to issue auth tokens.' });
        }

        res.setCookie('token', issued.accessToken, {
          httpOnly: true,
          sameSite: 'strict',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 4,
        });

        res.setCookie('refresh_token', issued.refreshToken, {
          httpOnly: true,
          sameSite: 'strict',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: issued.refreshCookieMaxAge,
        });

        res.status(200).send({ user: { username, uuid, avatar: null, tfa: false } });
      } catch (error) {
        res.status(500).send({ message: 'Failed validating user e-mail.' });
      }
    },
  );
}
