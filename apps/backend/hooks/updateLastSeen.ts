import type { FastifyReply, FastifyRequest } from 'fastify';
import { updateLastSeen } from '../db/queries/users.ts';
import { getLogger } from '../utils/logger.ts';

export function updateLastSeenHandler(req: FastifyRequest, res: FastifyReply, done: Function) {
  const logger = getLogger();
  try {
    if (req.user?.uuid) updateLastSeen(req.user.uuid);
  } catch (error) {
    logger.error({ error }, 'Failed to update last_seen:');
  }
  done();
}
