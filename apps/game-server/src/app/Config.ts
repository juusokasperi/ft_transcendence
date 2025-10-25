import dotenv from 'dotenv';

dotenv.config();

export type ReconnectGraceConfig = {
  casualMs: number;
  tournamentMs: number;
};

export type AppConfig = {
  httpPort: number;
  wsPort: number;
  adminSecret: string;
  redisUrl: string;
  apiUrl: string;
  matchSecret: string;
  tickHz: number;
  minStartDelayMs: number;
  reconnectGraceMs: ReconnectGraceConfig;
};

function parseNumber(value: string | undefined, fallback: number, name: string): number {
  if (typeof value === 'undefined' || value === '') return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric env for ${name}: ${value}`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const redisUrl = env.REDIS_URL || env.REDIS_HOST;
  if (!redisUrl) {
    throw new Error('Missing env: REDIS_URL');
  }

  const httpPort = parseNumber(env.HTTP_PORT, 55554, 'HTTP_PORT');
  const wsPort = parseNumber(env.GAME_SERVER_PORT, 55553, 'GAME_SERVER_PORT');
  const tickHz = parseNumber(env.GAME_SERVER_TICK_HZ, 60, 'GAME_SERVER_TICK_HZ');
  const minStartDelayMs = parseNumber(
    env.GAME_SERVER_MIN_START_DELAY_MS,
    1500,
    'GAME_SERVER_MIN_START_DELAY_MS',
  );
  const tournamentGrace = parseNumber(
    env.GAME_SERVER_TOURNAMENT_GRACE_MS,
    10000,
    'GAME_SERVER_TOURNAMENT_GRACE_MS',
  );
  const casualGrace = parseNumber(
    env.GAME_SERVER_CASUAL_GRACE_MS,
    15000,
    'GAME_SERVER_CASUAL_GRACE_MS',
  );

  return {
    httpPort,
    wsPort,
    adminSecret: env.ADMIN_SECRET || 'fix-this',
    redisUrl,
    apiUrl: env.API_URL || env.BACKEND_URL || 'http://backend:3001',
    matchSecret: env.MATCH_SECRET || 'fix-this',
    tickHz,
    minStartDelayMs,
    reconnectGraceMs: {
      casualMs: casualGrace,
      tournamentMs: tournamentGrace,
    },
  };
}
