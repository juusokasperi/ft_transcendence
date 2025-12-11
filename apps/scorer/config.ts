import dotenv from 'dotenv';

// Load environment variables for the scorer service.
dotenv.config();

/**
 * Required environment variables for the scorer:
 *  - PROMETHEUS_URL: base URL of the Prometheus HTTP API.
 *  - REDIS_URL: connection URL for Redis (where game-node:scores is written).
 *  - GAME_NODES_AMOUNT: number of game-server nodes to consider.
 *  - GAME_SERVER_PORT: WS port of game-server nodes.
 *  - GAME_SERVER_HTTP: HTTP port of game-server nodes (for /metrics fallback).
 *  - SCORER_PORT: port where the scorer exposes its own HTTP API.
 */
const REQUIRED = [
  'PROMETHEUS_URL',
  'REDIS_URL',
  'GAME_NODES_AMOUNT',
  'GAME_SERVER_PORT',
  'GAME_SERVER_HTTP',
  'SCORER_PORT',
] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

/** Redis connection URL used to store per-node scores in `game-node:scores`. */
export const REDIS_URL = process.env.REDIS_URL!;
/** Base URL of Prometheus used to fetch node metrics via the HTTP API. */
export const PROMETHEUS_URL = process.env.PROMETHEUS_URL!;
/** Base service name used to construct game node hostnames (game-server, game-server-2, ...). */
export const GAME_SERVER_SERVICE = 'game-server';
/** WebSocket port used by game-server nodes. */
export const GAME_SERVER_PORT = process.env.GAME_SERVER_PORT!;
/** HTTP port used by game-server nodes (for /metrics). */
export const GAME_SERVER_HTTP = process.env.GAME_SERVER_HTTP!;
/** Number of game-server nodes the scorer should track. */
export const GAME_NODES_AMOUNT = Number(process.env.GAME_NODES_AMOUNT!);
/** Port where the scorer Fastify app listens (health, metrics). */
export const SCORER_PORT = Number(process.env.SCORER_PORT!);
