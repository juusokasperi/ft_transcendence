import type { RedisTokenBucket } from 'packages/utils/rate-limiter/src';
import type { ClientInfo } from '../types/types';
import { log } from '@utils/logger';

/**
 * Check whether a matchmaking client is currently rate-limited.
 *
 * Uses a Redis-backed token bucket keyed by client UUID to throttle spammy
 * clients. When over limit:
 *   - returns true,
 *   - logs a warning,
 *   - and, at most once every 5s per client, sends an ERROR message describing
 *     the rate limit.
 */
export async function isRateLimited(
  client: ClientInfo,
  rateLimiter: RedisTokenBucket,
): Promise<boolean> {
  // If consume() succeeds, the client is allowed to proceed.
  if (await rateLimiter.consume(client.uuid)) return false;

  // Otherwise, the client is rate-limited.
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
