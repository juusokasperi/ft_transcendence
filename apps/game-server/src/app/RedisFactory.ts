import Redis, { type Redis as RedisClient } from 'ioredis';

export type RedisFactory = {
  create(): RedisClient;
};

export function createRedisFactory(url: string): RedisFactory {
  return {
    create() {
      return new Redis(url);
    },
  };
}
