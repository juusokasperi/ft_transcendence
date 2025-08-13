import type { FastifyInstance } from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma_client.ts';
import bcrypt from 'bcrypt';
import { SECRET } from '../utils/config.ts';
import jwt from 'jsonwebtoken';

export async function signupRoutes(app: FastifyInstance) {
	// Post a new user and logs them in
	app.post('/', async (req: FastifyRequest, res: FastifyReply) => {
		const { username, password } = req.body as { username: string; password:string };
		const passwordHash = await bcrypt.hash(password, 10);
		const user = await prisma.user.create({
			data: {
				username,
				passwordHash,
			},
		});
		const userForToken = {
			username: user.username,
			uuid: user.uuid
		};
		const token = jwt.sign(userForToken, SECRET, { expiresIn: '1h' });
		res.status(200).send({ token, username: user.username });
	});
};
