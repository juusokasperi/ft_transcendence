import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUserByUsername } from '../db/queries/users.ts';
import bcrypt from 'bcrypt';
import { SECRET } from '../utils/config.ts';
import jwt from 'jsonwebtoken';

// TODO Add a preValidation hook using 'zod' for username/password validness
export async function loginRoutes(app: FastifyInstance) {
	app.post('/', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { username, password } = req.body as { username: string; password:string };

			const userInDb = getUserByUsername(username);
			if (!userInDb)
				return (res.status(400).send({ error: 'Invalid username or password' }));
 			const isValidPassword = await bcrypt.compare(password, userInDb.passwordHash || '');
			if (!isValidPassword)
				return (res.status(400).send({ error: 'Invalid username or password' }));

			const userForToken = {
				username: userInDb.username,
				uuid: userInDb.uuid
			};
			const token = jwt.sign(userForToken, SECRET, { expiresIn: '1h' });
			res.status(200).send({ token, user: { username: userInDb.username, uuid: userInDb.uuid } });
		} catch (error) {
			res.status(500).send({ error: 'Failed to fetch login info from database.' });
		}
	});
};
