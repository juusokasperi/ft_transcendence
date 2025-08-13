import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SECRET } from '../utils/config.ts';

// Checks that the request came with an authorization (for protected routes)
// and that the token is valid.
async function authPreHandler(req: FastifyRequest, res: FastifyReply) {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.toLowerCase().startsWith('bearer '))
		return res.status(401).send({ error: 'Missing or invalid token' });
	const token = authHeader.replace('Bearer ', '');
	try {
		const payload = jwt.verify(token, SECRET);
		req.user = payload;
	} catch {
		return res.status(401).send({ error: 'Invalid token' });
	}
};

export default authPreHandler;
