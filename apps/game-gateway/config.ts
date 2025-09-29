import dotenv from 'dotenv';

dotenv.config();

const REQUIRED = ['REDIS_PORT', 'GATEWAY_PORT'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

export const REDIS_URL = `redis://redis:${process.env.REDIS_PORT!}`;
export const PORT = Number(process.env.GATEWAY_PORT!);
