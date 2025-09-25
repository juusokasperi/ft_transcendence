import dotenv from 'dotenv';

dotenv.config();

export const PORT = Number(process.env.ALLOCATOR_PORT || 4000);
export const GAME_SERVER_URL = process.env.GAME_SERVER_URL || 'ws://localhost:55553';
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const IDEMPOTENCY_PREFIX = 'allocator:idemp:';
