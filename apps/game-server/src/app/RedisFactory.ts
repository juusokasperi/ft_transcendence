import Redis, { type Redis as RedisClient } from 'ioredis';

/**
 * Small factory abstraction around ioredis to make it easy to:
 *   - inject a Redis creator into GameServer (and tests)
 *   - centralize how Redis connections are constructed from a URL
 */
export type RedisFactory = {
  /** Create a new Redis client instance. */
  create(): RedisClient;
};

/**
 * Build a RedisFactory bound to a specific connection URL.
 *
 * In production, GameServer uses this to create its Redis client. In tests,
 * a custom factory can be provided to inject mocks or alternate connections.
 */
export function createRedisFactory(url: string): RedisFactory {
  return {
    create() {
      return new Redis(url);
    },
  };
}
