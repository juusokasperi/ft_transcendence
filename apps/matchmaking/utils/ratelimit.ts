import type { RedisTokenBucket } from 'packages/utils/rate-limiter/src';
import type { ClientInfo } from '../types/types';
import { log } from '@utils/logger';

export async function isRateLimited(
  client: ClientInfo,
  rateLimiter: RedisTokenBucket,
): Promise<boolean> {
  if (await rateLimiter.consume(client.uuid)) return false;

  let messageSentToUser = false;
  if (client.lastRateLimitNotice < Date.now() - 5000) {
    client.socket.send(
      JSON.stringify({
        type: 'ERROR',
        code: 'RATELIMIT',
        message: 'You are sending messages too fast. Try again soon.',
      }),
    );
    client.lastRateLimitNotice = Date.now();
    messageSentToUser = true;
  }
  log(
    'Throttle matchmaking client',
    { clientId: client.id, clientUuid: client.uuid, messageSentToUser },
    'warn',
  );
  return true;
}
