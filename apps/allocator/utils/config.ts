import dotenv from 'dotenv';

// Load .env so the allocator can read its port, Redis URL, and admin secret.
dotenv.config();

/**
 * Required environment variables for the allocator service:
 *  - ALLOCATOR_PORT: HTTP port to listen on for allocation requests.
 *  - ADMIN_SECRET: shared secret for authenticating against game nodes (`/admin/rooms`).
 *  - REDIS_URL: connection URL for Redis (used for node scores and idempotency cache).
 */
const REQUIRED = ['ALLOCATOR_PORT', 'ADMIN_SECRET', 'REDIS_URL'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

/** Port where the allocator HTTP API listens for `/allocate` requests. */
export const PORT = Number(process.env.ALLOCATOR_PORT!);
/** Redis connection URL used for node scores and idempotent responses. */
export const REDIS_URL = process.env.REDIS_URL!;
/** Prefix for idempotency cache keys in Redis. */
export const IDEMPOTENCY_PREFIX = 'allocator:idemp:';
/** Admin secret used to call game-node `/admin/rooms` endpoints. */
export const ADMIN_SECRET = process.env.ADMIN_SECRET!;
