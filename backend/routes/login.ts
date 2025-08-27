import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUserByEmail } from '../db/queries/users.ts';
import bcrypt from 'bcrypt';
import { SECRET } from '../utils/config.ts';
import jwt from 'jsonwebtoken';

// TODO:
// preValidation hook using 'zod' for username/password validness
// Extra checks and route for 2FA

export async function loginRoutes(app: FastifyInstance) {
	app.post('/', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { email, password } = req.body as { email: string; password:string };

			const userInDb = getUserByEmail(email);
			if (!userInDb)
				return (res.status(400).send({ error: 'Invalid credentials' }));
			const normalizedPassword = password.normalize("NFKC");
 			const isValidPassword = await bcrypt.compare(normalizedPassword, userInDb.passwordHash || '');
			if (!isValidPassword)
				return (res.status(400).send({ error: 'Invalid credentials' }));

			const userForToken = {
				username: userInDb.username,
				uuid: userInDb.uuid
			};

			const token = jwt.sign(userForToken, SECRET, { expiresIn: '4h' });

			// Does the front need UUID anymore?
			res.status(200).send({ token, user: { username: userInDb.username, uuid: userInDb.uuid, avatar: userInDb.avatar } });
		} catch (error) {
			res.status(500).send({ error: 'Failed to fetch login info from database.' });
		}
	});
};
