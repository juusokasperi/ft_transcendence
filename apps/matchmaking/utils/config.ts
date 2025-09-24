import dotenv from 'dotenv';

dotenv.config();

export const PORT = Number(process.env.MATCHMAKING_PORT || 4242);
export const GAME_SERVER_URL = process.env.GAME_SERVER_URL || 'ws://localhost:55553';
export const LOBBY_TTL_MS = 5 * 60 * 1000; // 5 minutes. We need a timeout to avoid stale lobbies.
export const LOBBY_SIZE = 2;
export const JOIN_TOKEN_TTL_SECONDS = 45;
export const SECRET = process.env.SECRET || 'yourSecretForJWTToken';
