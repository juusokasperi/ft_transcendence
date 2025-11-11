import type { FastifyReply, FastifyRequest } from 'fastify';
import { updateLastSeen } from '../db/queries/users.ts';
import { logger } from '@utils/logger';

export function updateLastSeenHandler(req: FastifyRequest, _res: FastifyReply, done: Function) {
  try {
    if (req.user?.uuid) updateLastSeen(req.user.uuid);
  } catch (error) {
    logger.error({ error }, 'Failed to update last_seen:');
  }
  done();
}
