import dotenv from 'dotenv';
import { log } from './log.ts';

dotenv.config();

// We have a script that ensures these are set in CI and production. We can get rid of this check if we want to.
const REQUIRED = ['MATCHMAKING_PORT', 'SECRET', 'API_URL', 'ALLOCATOR_PORT', 'REDIS_PORT'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

function numberFromEnv(name: string, defaultValue: number) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    log(
      `Invalid number for ${name}: ${raw}. Falling back to ${defaultValue}.`,
      { name, raw, defaultValue },
      'warn',
    );
    return defaultValue;
  }
  return parsed;
}

export const PORT = Number(process.env.MATCHMAKING_PORT!);
export const SECRET = process.env.SECRET!;
export const API_URL = process.env.API_URL!;
export const ALLOCATOR_URL = `http://allocator:${process.env.ALLOCATOR_PORT!}`;
export const REDIS_URL = `redis://redis:${process.env.REDIS_PORT!}`;

export const LOBBY_TTL_MS = 5 * 60 * 1000; // 5 minutes. We need a timeout to avoid stale lobbies.
export const LOBBY_SIZE = 2;
export const JOIN_TOKEN_TTL_SECONDS = 60;
export const TOURNAMENT_REMINDER_DELAY_MS = numberFromEnv('TOURNAMENT_REMINDER_DELAY_MS', 5000);
export const TOURNAMENT_MAX_REMINDERS = numberFromEnv('TOURNAMENT_MAX_REMINDERS', 3);
export const TOURNAMENT_MATCH_AUTO_START_DELAY_MS = numberFromEnv(
  'TOURNAMENT_MATCH_AUTO_START_DELAY_MS',
  10_000,
);
export const TOURNAMENT_MATCH_COUNTDOWN_INTERVAL_MS = numberFromEnv(
  'TOURNAMENT_MATCH_COUNTDOWN_INTERVAL_MS',
  1000,
);
