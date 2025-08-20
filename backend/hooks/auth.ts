import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SECRET } from '../utils/config.ts';
import { getUserByUuid, getUserStats } from '../db/queries/users.ts';

// Checks that the request came with an authorization (for protected routes)
// and that the token is valid.
export function authPreHandler(req: FastifyRequest, res: FastifyReply, done: Function) {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.toLowerCase().startsWith('bearer '))
		return res.status(401).send({ error: 'Missing or invalid token' });
	const token = authHeader.replace('Bearer ', '');
	try {
		const payload = jwt.verify(token, SECRET);
		req.user = payload;
		done();
	} catch {
		return res.status(401).send({ error: 'Invalid token' });
	}
};

export function tokenUuidCheck(req: FastifyRequest, res: FastifyReply, done: Function) {
	const uuid = req.user?.uuid;
	if (!uuid)
		return res.status(403).send({ error: 'No UUID in token' });
	done();
};
