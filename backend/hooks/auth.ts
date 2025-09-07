import jwt from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SECRET } from '../utils/config.ts';

// Checks that the request came with an authorization (for protected routes)
// and that the token is valid.
export function authPreHandler(req: FastifyRequest, res: FastifyReply, done: Function) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer '))
    return res.status(401).send({ message: 'Missing or invalid token' });
  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    done();
  } catch {
    return res.status(401).send({ message: 'Invalid token' });
  }
}

export function tokenUuidCheck(req: FastifyRequest, res: FastifyReply, done: Function) {
  const uuid = req.user?.uuid;
  if (!uuid) return res.status(403).send({ message: 'No UUID in token' });
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

// Validates request body
export function validationHook(validator) {
  return async function (req: FastifyRequest, res: FastifyReply) {
    const check = validator(req.body);
    if (check !== true)
      return res.status(400).send({ message: 'Validation failed', errors: check });
  };
}
