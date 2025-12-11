import dotenv from 'dotenv';

// Load environment variables so the gateway can resolve Redis and its listen port.
dotenv.config();

/**
 * Required environment variables for the game gateway.
 *
 * - REDIS_PORT: internal Redis port (hostname is fixed to "redis" in compose).
 * - GATEWAY_PORT: TCP port the gateway listens on for WebSocket upgrades.
 */
const REQUIRED = ['REDIS_PORT', 'GATEWAY_PORT'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

/** Connection URL for the shared Redis instance. */
export const REDIS_URL = `redis://redis:${process.env.REDIS_PORT!}`;
/** Public listen port for the game gateway HTTP/WS server. */
export const PORT = Number(process.env.GATEWAY_PORT!);
