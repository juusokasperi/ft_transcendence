import dotenv from 'dotenv';
import { resolve, isAbsolute, dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

dotenv.config();

// fail fast on missing envs (optional)
const REQUIRED = ['FRONTEND_URL','SECRET','DATABASE_PATH','BACKEND_HOST','BACKEND_PORT','UPLOAD_DIR'] as const;
for (const k of REQUIRED) {
  if (!process.env[k]) throw new Error(`Missing env: ${k}`);
}

// Treat the backend working dir as project root
const projectRoot = process.cwd();

// Helper: turn relative env path into absolute
const toAbs = (p: string) => (isAbsolute(p) ? p : resolve(projectRoot, p));

// Resolve paths
export const UPLOAD_DIR   = toAbs(process.env.UPLOAD_DIR!);
const DB_PATH    = toAbs(process.env.DATABASE_PATH!);

// Ensure dirs exist (do this once, early)
await mkdir(UPLOAD_DIR, { recursive: true });
await mkdir(dirname(DB_PATH), { recursive: true });

// Export config
export const DATABASE_PATH = DB_PATH;


export const BACKEND_PORT = Number(process.env.BACKEND_PORT!);
export const BACKEND_HOST = process.env.BACKEND_HOST as string;
export const SECRET = process.env.SECRET as string;
export const FRONTEND_URL = process.env.FRONTEND_URL as string;
export const NGINX_PORT = process.env.NGINX_PORT as string;
