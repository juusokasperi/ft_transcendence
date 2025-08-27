import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { checkUserExists, addUserToPending, getPendingUserByToken, deleteExpiredUsers, removeFromPending, confirmUser } from '../db/queries/unconfirmedUsers.ts';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { SECRET } from '../utils/config.ts';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { sendConfirmationEmail } from '../utils/nodemailer/index.ts';
import { validatePassword } from '../utils/validation/validateCredentials.ts';

// Add a preValidation hook using 'zod' for username/password validness. TODO
export async function signupRoutes(app: FastifyInstance) {
	// Post a new user and logs them in
	app.post('/', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			deleteExpiredUsers();
			const { username, password, email, googleAuth } =
				req.body as { username: string; password: string | undefined; email: string; googleAuth: string | undefined};
			if (checkUserExists(username, email))
				return res.status(400).send({ error: 'Username or email already taken' });
			if (googleAuth)
			{
				// do google auth stuff,
				// user gets inserted straight to users without first to pending

				// probably needs to call a different function than addUser?
				// like addUserGoogle( that takes in google auth number instead of pass)
			}
			if (!password)
				return res.status(400).send({ error: 'Missing password field' });
			const normalizedPassword = password.normalize("NFKC");
			const passwordNotValid = validatePassword(normalizedPassword);
			if (passwordNotValid)
				return res.status(400).send({ error: passwordNotValid });

			const passwordHash = await bcrypt.hash(normalizedPassword, 10);
			const confirmationToken = crypto.randomBytes(32).toString('hex');
			const result = addUserToPending(username, email, passwordHash,  confirmationToken);
			if (!result)
				return res.status(500).send({ error: 'Failed to create user' });
			const emailSent = await sendConfirmationEmail(email, confirmationToken);
			if (!emailSent) {
				removeFromPending(confirmationToken);
				return res.status(500).send({ error: 'Failed to send confirmation email.' });
			}

			res.status(200).send({ success: 'Confirmation link sent to email.' });
		} catch (error) {
			res.status(500).send({ error: 'Failed adding user to database.' });
		}
	});

	app.post('/validate/:token', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			deleteExpiredUsers();
			const { token } = req.params as { token: string };
			const user = getPendingUserByToken(token);
			if (!user)
				return res.status(400).send({ error: 'Invalid or expired token.' });

			const uuid = uuidv4();
			const result = confirmUser(token, uuid, user);
			if (!result)
			{
				removeFromPending(token);
				return res.status(500).send({ error: 'Failed to add user to database, try signing up again.' });
			}

			const username = user.username;
			const userForToken = { username, uuid };
			const jwtoken = jwt.sign(userForToken, SECRET, { expiresIn: '4h' });

			// Does the front need UUID anymore?
			res.status(200).send({ token: jwtoken, user: { username, uuid } });
		} catch (error) {
			res.status(500).send({ error: 'Failed validating user e-mail.' });
		}
	})
};
