import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import db from '../utils/sqlite_client.ts';
import bcrypt from 'bcrypt';
import { SECRET } from '../utils/config.ts';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

// Add a preValidation hook using 'zod' for username/password validness.
export async function signupRoutes(app: FastifyInstance) {
	// Post a new user and logs them in
	app.post('/', async (req: FastifyRequest, res: FastifyReply) => {
		const { username, password } = req.body as { username: string; password:string };
		const existingUser = db.prepare('SELECT * FROM User WHERE username = ?').get(username);
		if (existingUser)
			return res.status(400).send({ error: 'Username already taken' });

		const passwordHash = await bcrypt.hash(password, 10);
		const uuid = uuidv4();

		const result = db.prepare(`
			INSERT INTO User (uuid, username, passwordHash)
			VALUES (?, ?, ?)
			`).run(uuid, username, passwordHash);
		if (result.changes !== 1)
			return res.status(500).send({ error: 'Failed to create user' });

		const userForToken = { username, uuid };
		const token = jwt.sign(userForToken, SECRET, { expiresIn: '1h' });
		res.status(200).send({ token, username });
	});
};
