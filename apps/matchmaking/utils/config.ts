import dotenv from 'dotenv';

dotenv.config();

const REQUIRED = ['MATCHMAKING_PORT', 'SECRET', 'API_URL', 'ALLOCATOR_PORT'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}
export const PORT = Number(process.env.MATCHMAKING_PORT!);
export const SECRET = process.env.SECRET!;
export const API_URL = process.env.API_URL!;
export const ALLOCATOR_URL = `http://allocator:${process.env.ALLOCATOR_PORT!}`;

export const LOBBY_TTL_MS = 5 * 60 * 1000; // 5 minutes. We need a timeout to avoid stale lobbies.
export const LOBBY_SIZE = 2;
export const JOIN_TOKEN_TTL_SECONDS = 60;
