import type { FastifyReply, FastifyRequest } from 'fastify';
import { updateLastSeen } from '../db/queries/users.ts';
import { logger } from '../utils/logger.ts';

export function updateLastSeenHandler(req: FastifyRequest, res: FastifyReply, done: Function) {
  try {
    if (req.user?.uuid) updateLastSeen(req.user.uuid);
  } catch (error) {
    logger.error({ error }, 'Failed to update last_seen:');
  }
  done();
}
