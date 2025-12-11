import dotenv from 'dotenv';

// Load .env early so loadConfig() can read process.env defaults when running locally.
dotenv.config();

/**
 * Reconnect grace windows (in milliseconds) for different match types.
 *
 * Used by ReconnectManager / Policies.reconnectGraceMs to decide how long a player
 * has to resume before the match is considered a timeout/forfeit.
 */
export type ReconnectGraceConfig = {
  /** Grace period for casual (non‑tournament) matches. */
  casualMs: number;
  /** Grace period for tournament matches (typically longer than casual). */
  tournamentMs: number;
};

/** Resolved configuration for the game server, derived from environment variables. */
export type AppConfig = {
  /** HTTP port for the admin/health API (room registration, /health, etc.). */
  httpPort: number;
  /** WebSocket port for /g/:roomId connections (behind the gateway or direct). */
  wsPort: number;
  /** Shared secret used to protect admin HTTP operations (e.g. room creation). */
  adminSecret: string;
  /** Redis connection URL used for session state and token bookkeeping. */
  redisUrl: string;
  /** Backend API base URL used by ResultReporter to report match results. */
  apiUrl: string;
  /** Secret used to sign match service tokens when calling backend match routes. */
  matchSecret: string;
  /** Simulation tick rate (Hz) for the Pong engine. */
  tickHz: number;
  /** Minimum delay between both players joining and match start (ms). */
  minStartDelayMs: number;
  /** Lag compensation window (ms) used in simulation to soften latency effects. */
  lagCompensationMs: number;
  /** Reconnect grace configuration for casual and tournament matches. */
  reconnectGraceMs: ReconnectGraceConfig;
};

/**
 * Parse a numeric environment variable with a fallback and a clear error message.
 *
 * This is used by loadConfig to:
 *   - provide sensible defaults when envs are unset
 *   - fail fast with a descriptive error when an env is present but not numeric
 */
function parseNumber(value: string | undefined, fallback: number, name: string): number {
  if (typeof value === 'undefined' || value === '') return fallback;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric env for ${name}: ${value}`);
  }
  return parsed;
}

/**
 * Load the game server configuration from process.env.
 *
 * This is called once in GameServer's constructor and the resulting AppConfig is
 * passed into:
 *   - WSServer (for wsPort, redisUrl, reconnect grace)
 *   - Broadcaster / MatchRunner (for tickHz, minStartDelayMs, lagCompensationMs)
 *   - ResultReporter (for apiUrl, matchSecret)
 *   - HTTP admin server (for httpPort, adminSecret)
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // Redis URL is mandatory; allow either REDIS_URL or legacy REDIS_HOST for flexibility.
  const redisUrl = env.REDIS_URL || env.REDIS_HOST;
  if (!redisUrl) {
    throw new Error('Missing env: REDIS_URL');
  }

  // Ports used by HTTP admin server and WebSocket server (see GameServer.ts).
  const httpPort = parseNumber(env.HTTP_PORT, 55554, 'HTTP_PORT');
  const wsPort = parseNumber(env.GAME_SERVER_PORT, 55553, 'GAME_SERVER_PORT');

  // Simulation and timing parameters consumed by MatchRunner and TickEngine.
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
    5000,
    'GAME_SERVER_CASUAL_GRACE_MS',
  );
  const lagCompensationMs = parseNumber(env.GAME_SERVER_LAG_COMP_MS, 30, 'GAME_SERVER_LAG_COMP_MS');

  return {
    httpPort,
    wsPort,
    adminSecret: env.ADMIN_SECRET || 'fix-this',
    redisUrl,
    apiUrl: env.API_URL || env.BACKEND_URL || 'http://backend:3001',
    matchSecret: env.MATCH_SECRET || 'fix-this',
    tickHz,
    minStartDelayMs,
    lagCompensationMs,
    reconnectGraceMs: {
      // Used by reconnectGraceMs(isTournament, cfg) to pick the right window.
      casualMs: casualGrace,
      tournamentMs: tournamentGrace,
    },
  };
}
