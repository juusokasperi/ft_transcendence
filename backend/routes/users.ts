import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { getUserStats, deleteUser } from '../db/queries/users.ts';
import authPreHandler from '../hooks/auth.ts';

export async function userRoutes(app: FastifyInstance) {
	app.get('/', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const users = getUserStats();
			res.status(200).send(users);
		} catch (error) {
			res.status(500).send({ error: 'Failed to fetch users' });
		}
	});

	app.get('/:uuid', async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { uuid } = req.params as { uuid: string };
			const user = getUserStats(uuid);
			if (!user)
				return res.status(404).send({ error: 'User not found' });
			res.status(200).send(user);
		} catch (error) {
			res.status(500).send({ error: 'Failed to fetch user' });
		}
	});

	app.delete('/:uuid', { preHandler: [authPreHandler] }, async (req: FastifyRequest, res: FastifyReply) => {
		try {
			const { uuid } = req.params as { uuid: string };
			if (req.user?.uuid !== uuid)
				return res.status(403).send({ error: 'Forbidden' });
			const deleteResult = deleteUser(uuid);
			if (!deleteResult)
				return res.status(500).send({ error: 'User not found' });
			res.status(204).send();
		} catch (error) {
			res.status(500).send({ error: 'Failed to delete user' });
		}
	});
};
