import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '../types.ts';

import db from '../utils/sqlite_client.ts';
import authPreHandler from '../hooks/auth.ts';

export async function userRoutes(app: FastifyInstance) {
	// Returns all users without the passwordHash field
	app.get('/', async (req: FastifyRequest, res: FastifyReply) => {
		const users = db.prepare('SELECT * FROM User').all() as User[];
		const safeUsers = users.map(({ passwordHash, ...user }) => user);
		res.status(200).send(safeUsers);
	});

	// Returns all users without the passwordHash field
	app.get('/:uuid', async (req: FastifyRequest, res: FastifyReply) => {
		const { uuid } = req.params as { uuid: string };
		const user = db.prepare('SELECT * FROM User WHERE uuid = ?').get(uuid) as User | undefined;
		if (!user)
			return res.status(404).send({ error: 'User not found' });
		const { passwordHash, ...safeUser } = user;
		const total = safeUser.wins + safeUser.losses;
		res.send({ ...safeUser, total });
	});

	// Increment wins of a user
	app.put('/:uuid/win', { preHandler: [authPreHandler] }, async (req: FastifyRequest, res: FastifyReply) => {
		const { uuid } = req.params as { uuid: string };
		if (req.user?.uuid !== uuid)
			return res.status(403).send({ error: 'Forbidden' });
		const user = db.prepare('SELECT * FROM User WHERE uuid = ?').get(uuid) as User | undefined;
		if (!user)
			return res.status(404).send({ error: 'User not found' });
		const updateResult = db.prepare('UPDATE User SET wins = wins + 1 WHERE uuid = ?').run(uuid);
		if (updateResult.changes !== 1)
			return res.status(500).send({ error: 'Failed to increment user\'s wins' });
		user.wins += 1;
		const total = user.wins + user.losses;
		res.send({ ...user, total });
	});

	// Increment losses of a user
	app.put('/:uuid/loss', { preHandler: [authPreHandler] }, async (req: FastifyRequest, res: FastifyReply) => {
		const { uuid } = req.params as { uuid: string };
		if (req.user?.uuid !== uuid)
			return res.status(403).send({ error: 'Forbidden' });
		const user = db.prepare('SELECT * FROM User WHERE uuid = ?').get(uuid) as User | undefined;
		if (!user)
			return res.status(404).send({ error: 'User not found' });
		const updateResult = db.prepare('UPDATE User SET losses = losses + 1 WHERE uuid = ?').run(uuid);
		if (updateResult.changes !== 1)
			return res.status(500).send({ error: 'Failed to increment user\'s losses' });
		user.losses += 1;
		const total = user.wins + user.losses;
		res.send({ ...user, total });
	});

	// Delete a user from database
	app.delete('/:uuid', { preHandler: [authPreHandler] }, async (req: FastifyRequest, res: FastifyReply) => {
		const { uuid } = req.params as { uuid: string };
		if (req.user?.uuid !== uuid)
			return res.status(403).send({ error: 'Forbidden' });
		const user = db.prepare('SELECT * FROM User where uuid = ?').get(uuid) as User | undefined;
		if (!user)
			return res.status(404).send({ error: 'User not found' });
		const deleteResult = db.prepare('DELETE FROM User WHERE uuid = ?').run(uuid);
		if (deleteResult.changes !== 1)
			return res.status(500).send({ error: 'Failed to delete user' });
		res.status(204).send();
	});
};
