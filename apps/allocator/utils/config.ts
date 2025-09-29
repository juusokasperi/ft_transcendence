import dotenv from 'dotenv';

dotenv.config();

const REQUIRED = ['ALLOCATOR_PORT', 'ADMIN_SECRET', 'REDIS_URL'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

export const PORT = Number(process.env.ALLOCATOR_PORT!);
export const REDIS_URL = process.env.REDIS_URL!;
export const IDEMPOTENCY_PREFIX = 'allocator:idemp:';
export const ADMIN_SECRET = process.env.ADMIN_SECRET!;
