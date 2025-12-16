import dotenv from 'dotenv';
import { log } from '@utils/logger';

// Load matchmaking-specific environment variables from .env.
dotenv.config();

/**
 * Required environment variables for the matchmaking service:
 *  - MATCHMAKING_PORT: WS/HTTP port used by the matchmaking Fastify app.
 *  - SECRET: JWT secret for verifying site tokens (same as backend).
 *  - API_URL: base URL for backend HTTP API.
 *  - ALLOCATOR_PORT: port of the allocator service (host is "allocator" in compose).
 *  - REDIS_PORT: port of the shared Redis instance (host "redis").
 *  - MATCH_SECRET: JWT secret used to call backend match/tournament APIs.
 */
const REQUIRED = [
  'MATCHMAKING_PORT',
  'SECRET',
  'API_URL',
  'ALLOCATOR_PORT',
  'REDIS_PORT',
  'MATCH_SECRET',
] as const;
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

/** Port where the matchmaking server listens for WebSocket connections. */
export const PORT = Number(process.env.MATCHMAKING_PORT!);
/** Shared JWT secret for verifying site tokens from the frontend. */
export const SECRET = process.env.SECRET!;
/** Backend API base URL (for user MMR, tournaments, etc.). */
export const API_URL = process.env.API_URL!;
/** Secret used to sign "match service" tokens for backend APIs. */
export const MATCH_SECRET = process.env.MATCH_SECRET!;
/** Allocator HTTP base URL built from Docker service name and port. */
export const ALLOCATOR_URL = `http://allocator:${process.env.ALLOCATOR_PORT!}`;
/** Redis URL used for matchmaking state, rate limiting, and Redis streams. */
export const REDIS_URL = `redis://redis:${process.env.REDIS_PORT!}`;

/** Invite lobby TTL; lobbies older than this are considered stale and are removed. */
export const LOBBY_TTL_MS = 5 * 60 * 1000;
export const LOBBY_SIZE = 2;
/** How long join tokens issued by allocator are considered valid, in seconds. */
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

// If one player is present and the other is absent when a countdown should
// auto-start, give an auto-win to the present player after this delay.
// This avoids tournaments stalling when a player does not show up.
export const TOURNAMENT_ABSENCE_AUTO_WIN_MS = numberFromEnv(
  'TOURNAMENT_ABSENCE_AUTO_WIN_MS',
  10_000,
);
