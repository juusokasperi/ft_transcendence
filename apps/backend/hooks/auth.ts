import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SECRET } from '../utils/config.ts';

// Checks that the request came with an authorization (for protected routes)
// and that the token is valid.
export function authPreHandler(req: FastifyRequest, res: FastifyReply, done: Function): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    res.status(401).send({ message: 'Missing or invalid token' });
    return;
  }
  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, SECRET); // (optionally: as any as JWTPayload)
    req.user = payload as any; // keep minimal; or type-narrow with your JWTPayload
    done();
  } catch {
    res.status(401).send({ message: 'Invalid token' });
  }
}

export function tokenUuidCheck(req: FastifyRequest, res: FastifyReply, done: Function): void {
  const uuid = req.user?.uuid;
  if (!uuid) {
    res.status(403).send({ message: 'No UUID in token' });
    return;
  }
  done();
}

// Normalizes credentials if present in request
export function normalizeCredentials(req: FastifyRequest, res: FastifyReply, done: Function) {
  if (typeof req.body !== 'object' || req.body === null) done();

  const body = req.body as Record<string, unknown>;
  const normalize = (key: string) => {
    const val = body[key];
    if (typeof val === 'string') {
      const normalizedVal = val.normalize('NFKC');
      body[key] = normalizedVal.length > 0 ? normalizedVal : undefined;
    }
  };
  normalize('username');
  normalize('newUsername');
  normalize('password');
  normalize('newPassword');
  normalize('currentPassword');
  normalize('email');
  done();
}
