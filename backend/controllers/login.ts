import type { FastifyInstance } from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma_client.ts';
import bcrypt from 'bcrypt';
import { SECRET } from '../utils/config.ts';
import jwt from 'jsonwebtoken';

export async function loginRoutes(app: FastifyInstance) {
	// Login user
	app.post('/', async (req: FastifyRequest, res: FastifyReply) => {
		const { username, password } = req.body as { username: string; password:string };
		const user = await prisma.user.findUnique({
			where: { username },
		});
		if (!user)
			return res.status(404).send({ error: 'User not found' });
		const passwordValid = await bcrypt.compare(password, user.passwordHash);
		if (!passwordValid)
			return res.status(403).send({ error: 'Incorrect password' });
		const userForToken = {
			username: user.username,
			uuid: user.uuid
		};
		const token = jwt.sign(userForToken, SECRET, { expiresIn: '1h' });
		res.status(200).send({ token, username: user.username });
	});

};
