import type { FastifyInstance } from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../utils/prisma_client.ts';
import bcrypt from 'bcrypt';

export async function userRoutes(app: FastifyInstance) {
	// Returns all users without the passwordHash field
	app.get('/', async (req: FastifyRequest, res: FastifyReply) => {
		const users = await prisma.user.findMany();
		const safeUsers = users.map(({ passwordHash, ...user }) => user);
		res.send(safeUsers);
	});

	// Returns all users without the passwordHash field
	app.get('/:uuid', async (req: FastifyRequest, res: FastifyReply) => {
		const { uuid } = req.params as { uuid: string };
		const user = await prisma.user.findUnique({
			where: { uuid },
		});
		if (!user)
			return res.status(404).send({ error: 'User not found' });
		const { passwordHash, ...safeUser } = user;
		const total = safeUser.wins + safeUser.losses;
		res.send({ ...safeUser, total });
	});

	// Post a new user
	app.post('/', async (req: FastifyRequest, res: FastifyReply) => {
		const { username, password } = req.body as { username: string; password:string };
		const passwordHash = await bcrypt.hash(password, 10);
		const user = await prisma.user.create({
			data: {
				username,
				passwordHash,
			},
		});
		res.send(user);
	});

	// Increment wins of a user
	app.put('/:uuid/win', async (req: FastifyRequest, res: FastifyReply) => {
		const { uuid } = req.params as { uuid: string };
		const user = await prisma.user.findUnique({
			where: { uuid },
		});
		if (!user)
			return res.status(404).send({ error: 'User not found' });
		const updatedUser = await prisma.user.update({
			where: { uuid },
			data: { wins: { increment: 1 }},
		});
		const total = updatedUser.wins + updatedUser.losses;
		res.send({ ...updatedUser, total });
	})

	// Increment losses of a user
	app.put('/:uuid/loss', async (req: FastifyRequest, res: FastifyReply) => {
		const { uuid } = req.params as { uuid: string };
		const user = await prisma.user.findUnique({
			where: { uuid },
		});
		if (!user)
			return res.status(404).send({ error: 'User not found' });
		const updatedUser = await prisma.user.update({
			where: { uuid },
			data: { losses: { increment: 1 }},
		});
		const total = updatedUser.wins + updatedUser.losses;
		res.send({ ...updatedUser, total });
	});

	// Delete a user from database
	app.delete('/:uuid', async (req: FastifyRequest, res: FastifyReply) => {
		const { uuid } = req.params as { uuid: string };
		const user = await prisma.user.findUnique({ where: { uuid }, });
		if (!user)
			return res.status(404).send({ error: 'User not found' });
		await prisma.user.delete({ where: { uuid }});
		res.status(204).send();
	});
};
