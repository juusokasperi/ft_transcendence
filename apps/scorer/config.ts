import dotenv from 'dotenv';

dotenv.config();

const REQUIRED = ['REDIS_URL', 'GAME_NODES_AMOUNT', 'GAME_SERVER_PORT', 'GAME_SERVER_HTTP'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

export const REDIS_URL = process.env.REDIS_URL!;
export const GAME_SERVER_SERVICE = 'game-server';
export const GAME_SERVER_PORT = process.env.GAME_SERVER_PORT!;
export const GAME_SERVER_HTTP = process.env.GAME_SERVER_HTTP!;
export const GAME_NODES_AMOUNT = Number(process.env.GAME_NODES_AMOUNT!);
