import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getUserByUsername, addUser } from '../db/queries/users.ts';
import bcrypt from 'bcrypt';
import { SECRET } from '../utils/config.ts';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Add a preValidation hook using 'zod' for username/password validness. TODO
export async function signupRoutes(app: FastifyInstance) {
	// Post a new user and logs them in
	app.post('/', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { username, password, email } = req.body as { username: string; password:string; email: string; };
			const existingUser = getUserByUsername(username);
			if (existingUser)
				return res.status(400).send({ error: 'Username already taken' });

			const passwordHash = await bcrypt.hash(password, 10);
			const uuid = uuidv4();

			const result = addUser(uuid, username, passwordHash, email);
			if (!result)
				return res.status(500).send({ error: 'Failed to create user' });

			const userForToken = { username, uuid };
			const token = jwt.sign(userForToken, SECRET, { expiresIn: '1h' });
			res.status(200).send({ token, user: { username, uuid } });
		} catch (error) {
			res.status(500).send({ error: 'Failed adding user to database.' });
		}
	});
};
