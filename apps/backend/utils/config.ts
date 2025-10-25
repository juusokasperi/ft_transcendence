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

const numberFromEnv = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
};

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

export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const BACKEND_PORT = Number(process.env.BACKEND_PORT!);
export const BACKEND_HOST = process.env.BACKEND_HOST as string;
export const SECRET = process.env.SECRET as string;
export const MATCH_SECRET = process.env.MATCH_SECRET as string;
export const FRONTEND_URL = process.env.FRONTEND_URL as string;
export const NGINX_PORT = process.env.NGINX_PORT as string;
export const JWT_ACCESS_TTL = process.env.JWT_ACCESS_TTL || '4h';
export const JWT_REFRESH_TTL = process.env.JWT_REFRESH_TTL || '30d';
export const JWT_2FA_TTL = process.env.JWT_2FA_TTL || '10m';
export const TFA_ISSUER = process.env.TFA_ISSUER || 'Arcade Transcendence';
export const TFA_CODE_DIGITS = Number(process.env.TFA_CODE_DIGITS || '6');
export const ENABLE_SQLITE_METRICS = process.env.ENABLE_SQLITE_METRICS as string;
export const TOURNAMENT_REQUIRED_PARTICIPANTS = numberFromEnv(
  process.env.TOURNAMENT_REQUIRED_PARTICIPANTS,
  4,
);

const accessTokenCookieEnv = process.env.ACCESS_TOKEN_COOKIE_NAME?.trim();
const refreshTokenCookieEnv = process.env.REFRESH_TOKEN_COOKIE_NAME?.trim();
const refreshSecretEnv = process.env.REFRESH_SECRET?.trim();

export const ACCESS_TOKEN_COOKIE_NAME =
  accessTokenCookieEnv && accessTokenCookieEnv.length > 0 ? accessTokenCookieEnv : 'token';
export const REFRESH_TOKEN_COOKIE_NAME =
  refreshTokenCookieEnv && refreshTokenCookieEnv.length > 0
    ? refreshTokenCookieEnv
    : 'refresh_token';
export const REFRESH_SECRET =
  refreshSecretEnv && refreshSecretEnv.length > 0 ? refreshSecretEnv : SECRET;

type MailTransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
};

const MAIL_HOST = process.env.MAIL_HOST;
const MAIL_PORT = process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : undefined;
const MAIL_SECURE_ENV = process.env.MAIL_SECURE;
const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;

const MAIL_SECURE = MAIL_SECURE_ENV ? MAIL_SECURE_ENV !== 'false' : undefined;

export const MAIL_FROM =
  process.env.MAIL_FROM || MAIL_USER || '"No Reply" <no-reply@pong.example@gmail.com>';

export const MAIL_TRANSPORT_CONFIG: MailTransportConfig | null =
  MAIL_HOST && MAIL_USER && MAIL_PASS
    ? {
        host: MAIL_HOST,
        port: MAIL_PORT ?? 465,
        secure: MAIL_SECURE ?? true,
        auth: {
          user: MAIL_USER,
          pass: MAIL_PASS,
        },
      }
    : null;

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
          name: ACCESS_TOKEN_COOKIE_NAME,
          description: `Primary browser auth uses the httpOnly "${ACCESS_TOKEN_COOKIE_NAME}" cookie issued by the backend.`,
        },
      },
    },
  },
};
