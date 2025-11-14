import { Redis } from 'ioredis';

/**
 * Refreshing the token bucket with a LUA script guarantees atomicity and
 * a single roundtrip to the redis instance.
 *
 * Reads the UUID specific bucket with HMGET
 *  - treats missing values as full capacity
 *  - computes elapsed time since last
 *  - refills tokens
 *  - updates last to now
 *  - checks if there are enough tokens in the bucket for the consume operation to succeed
 *    - if not, writes the current state, sets PEXPIRE and returns 0
 *    - if yes, removes requested tokens, persists the state with PEXPIRE, returns 1
 */
const LUA_CONSUME = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_ms = tonumber(ARGV[2])
local tokens = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local expiration = math.min(refill_ms * 60, 5000 * 60)

local bucket = redis.call("HMGET", key, "tokens", "last")
local current_tokens = tonumber(bucket[1]) or capacity
local last = tonumber(bucket[2]) or now

local elapsed = now - last
if elapsed > 0 then
  local refill = (elapsed / refill_ms) * capacity
  current_tokens = math.min(capacity, current_tokens + refill)
  last = now
end

if current_tokens < tokens then
  redis.call("HMSET", key, "tokens", current_tokens, "last", last)
  redis.call("PEXPIRE", key, expiration)
  return 0
end

current_tokens = current_tokens - tokens
redis.call("HMSET", key, "tokens", current_tokens, "last", last)
redis.call("PEXPIRE", key, expiration)
return 1
`;

const LUA_COMMAND = 'token_bucket_consume';

export class RedisTokenBucket {
  constructor(
    private readonly redis: Redis,
    private readonly keyPrefix: string,
    private readonly capacity = 10,
    private readonly refillMs = 1000,
  ) {
    this.redis.defineCommand(LUA_COMMAND, {
      numberOfKeys: 1,
      lua: LUA_CONSUME,
    });
  }

  private key(id: string) {
    return `${this.keyPrefix}:${id}`;
  }

  /**
   *
   * @param id: client uuid
   * @param tokens: how many tokens to consume
   * @returns boolean whether the operation was successful
   */
  async consume(id: string, tokens = 1): Promise<boolean> {
    const now = Date.now();
    const result = (await (this.redis as any)[LUA_COMMAND](
      this.key(id),
      this.capacity,
      this.refillMs,
      tokens,
      now,
    )) as number;
    return result === 1;
  }

  /**
   *
   * @param id: client uuid
   * @brief clears single user's entry from database. not really needed as
   *        pexpire takes care of cleanup when entries expire
   */
  async clear(id: string): Promise<void> {
    await this.redis.del(this.key(id));
  }

  /**
   * @brief Scans keys in batches to avoid blocking server
   */
  async clearAll(): Promise<void> {
    let cursor = '1';
    const match = `${this.keyPrefix}:*`;
    const count = 100;

    while (cursor !== '0') {
      const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', match, 'COUNT', count);
      if (keys.length) await this.redis.del(...keys);
      cursor = newCursor;
    }
  }
}
