import dotenv from 'dotenv';

dotenv.config();

const REQUIRED = ['REDIS_URL', 'GAME_NODES'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

export const REDIS_URL = process.env.REDIS_URL!;
export const GAME_NODES = process.env.GAME_NODES!;
