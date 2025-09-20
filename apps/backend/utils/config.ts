import dotenv from 'dotenv';
import { resolve, isAbsolute, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { SwaggerOptions } from '@fastify/swagger';

dotenv.config();

// fail fast on missing envs (optional)
const REQUIRED = [
  'FRONTEND_URL',
  'SECRET',
  'MATCH_SECRET',
  'DATABASE_PATH',
  'BACKEND_HOST',
  'BACKEND_PORT',
  'UPLOAD_DIR',
] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

// Treat the backend working dir as project root
const projectRoot = process.cwd();

// Helper: turn relative env path into absolute
const toAbs = (p: string) => (isAbsolute(p) ? p : resolve(projectRoot, p));

// Resolve paths
export const UPLOAD_DIR = toAbs(process.env.UPLOAD_DIR!);
const DB_PATH = toAbs(process.env.DATABASE_PATH!);

// Ensure dirs exist (do this once, early)
await mkdir(UPLOAD_DIR, { recursive: true });
await mkdir(dirname(DB_PATH), { recursive: true });

// Export config
export const DATABASE_PATH = DB_PATH;

export const BACKEND_PORT = Number(process.env.BACKEND_PORT!);
export const BACKEND_HOST = process.env.BACKEND_HOST as string;
export const SECRET = process.env.SECRET as string;
export const MATCH_SECRET = process.env.MATCH_SECRET as string;
export const FRONTEND_URL = process.env.FRONTEND_URL as string;
export const NGINX_PORT = process.env.NGINX_PORT as string;
export const JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL || '4h';
export const JWT_2FA_TTL = process.env.JWT_2FA_TTL || '10m';
export const TFA_ISSUER = process.env.TFA_ISSUER || 'BabylonPong';
export const TFA_CODE_DIGITS = Number(process.env.TFA_CODE_DIGITS || '6');
export const ENABLE_SQLITE_METRICS = process.env.ENABLE_SQLITE_METRICS as string;

// Export Swagger config
export const swaggerConfig: SwaggerOptions = {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'PONG APIs',
      version: '1.0.0',
    },
    servers: [
      {
        url: `http://localhost:${BACKEND_PORT}`,
        description: 'Dev backend server',
      },
    ],
    tags: [
      { name: 'User', description: 'User related endpoints' },
      { name: 'Match', description: 'Match related endpoints' },
      { name: 'Auth', description: 'Authentication related endpoints' },
      { name: 'Friends', description: 'Friends related endpoints' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'For Swagger/manual testing you can still supply Authorization: Bearer <token>.',
        },
        tokenAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description:
            'Primary browser auth uses the httpOnly "token" cookie issued by the backend.',
        },
      },
    },
  },
};
