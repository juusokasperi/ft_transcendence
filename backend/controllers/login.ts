import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import db from '../utils/sqlite_client.ts';
import bcrypt from 'bcrypt';
import { SECRET } from '../utils/config.ts';
import jwt from 'jsonwebtoken';
import type { User } from '../types.ts';

// Add a preValidation hook using 'zod' for username/password validness
export async function loginRoutes(app: FastifyInstance) {
	// Login user
	app.post('/', async (req: FastifyRequest, res: FastifyReply) => {
		const { username, password } = req.body as { username: string; password:string };
		const userInDb = db.prepare('SELECT * FROM User WHERE username = ?').get(username) as User | undefined;
		if (!userInDb || !(await bcrypt.compare(password, userInDb.passwordHash)))
			return (res.status(400).send({ error: 'Invalid username or password' }));
		const userForToken = {
			username: userInDb.username,
			uuid: userInDb.uuid
		};
		const token = jwt.sign(userForToken, SECRET, { expiresIn: '1h' });
		res.status(200).send({ token, username: userInDb.username });
	});
};
