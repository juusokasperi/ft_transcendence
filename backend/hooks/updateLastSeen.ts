import type { FastifyReply, FastifyRequest } from 'fastify';
import { updateLastSeen } from '../db/queries/users.ts';

export function updateLastSeenHandler(req: FastifyRequest, res: FastifyReply, done: Function) {
	try {
		if (req.user?.uuid)
			updateLastSeen(req.user.uuid);
	} catch (error) {
		console.error('Failed to update last_seen:', error);
	}
	done();
};
