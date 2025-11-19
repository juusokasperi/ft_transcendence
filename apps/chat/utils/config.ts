import dotenv from 'dotenv';

dotenv.config();

const REQUIRED = ['MATCHMAKING_PORT', 'CHAT_PORT', 'BACKEND_PORT', 'SECRET'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

export const PORT = Number(process.env.CHAT_PORT!);
export const HOST = process.env.CHAT_HOST || '0.0.0.0';
export const MATCHMAKING_PORT = Number(process.env.MATCHMAKING_PORT!);
export const MM_SERVICE_URL = `http://matchmaking-service:${MATCHMAKING_PORT}`
export const API_PORT = Number(process.env.BACKEND_PORT!);
export const API_SERVICE_URL = `http://backend:${API_PORT}`;
export const isDev = process.env.NODE_ENV === 'development';
export const SECRET = process.env.SECRET!;
