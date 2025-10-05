#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_VARS = [
  'GAME_SERVER_PORT',
  'GAME_SERVER_HTTP',
  'MATCHMAKING_PORT',
  'FRONTEND_PORT',
  'BACKEND_PORT',
  'NGINX_PORT',
  'GATEWAY_PORT',
  'REDIS_PORT',
  'ALLOCATOR_PORT',
  'VITE_FRONTEND_HOST',
  'VITE_FRONTEND_PORT',
  'VITE_DEV_API_PROXY_TARGET',
  'VITE_MATCHMAKING_PROXY_TARGET',
  'VITE_GAME_WS_PROXY_TARGET',
  'VITE_PUBLIC_DEV_PORT',
  'BACKEND_HOST',
  'DATABASE_PATH',
  'SECRET',
  'REFRESH_SECRET',
  'MATCH_SECRET',
  'FRONTEND_URL',
  'UPLOAD_DIR',
  'JWT_ACCESS_TTL',
  'JWT_REFRESH_TTL',
  'JWT_2FA_TTL',
  'ACCESS_TOKEN_COOKIE_NAME',
  'REFRESH_TOKEN_COOKIE_NAME',
  'TFA_ISSUER',
  'TFA_CODE_DIGITS',
  'NODE_ENV',
  'GOOGLE_OAUTH_REDIRECT_PATH',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'ENABLE_SQLITE_METRICS',
  'MAIL_HOST',
  'MAIL_PORT',
  'MAIL_SECURE',
  'MAIL_USER',
  'MAIL_PASS',
  'MAIL_FROM',
  'ADMIN_SECRET',
  'REDIS_URL',
  'API_URL',
  'GAME_NODES_AMOUNT',
  'REDIS_URL',
];

const help =
  `Usage: check-env.mjs [--file <path>] [--print-exports] [--quiet]\n\n` +
  `Checks that all required environment variables exist in the specified .env file.\n` +
  `Arguments:\n` +
  `  --file <path>       Path to the .env file (default: repo/.env)\n` +
  `  --print-exports     Emit \'export KEY=value\' lines for the loaded variables\n` +
  `  --quiet             Suppress success output\n` +
  `  --help              Show this help message\n`;

function parseArgs(argv) {
  const args = { file: '.env', printExports: false, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    switch (current) {
      case '--file':
      case '-f':
        if (argv[i + 1] == null) {
          throw new Error('Missing value for --file');
        }
        args.file = argv[i + 1];
        i += 1;
        break;
      case '--print-exports':
        args.printExports = true;
        break;
      case '--':
        continue;
      case '--quiet':
      case '-q':
        args.quiet = true;
        break;
      case '--help':
      case '-h':
        console.log(help.trimEnd());
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${current}`);
    }
  }
  return args;
}

function shellEscape(value) {
  if (value === '') return "''";
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function decodeValue(raw) {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const doubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  const singleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");

  if (doubleQuoted) {
    const inner = trimmed
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\$/g, '$')
      .replace(/\\\\/g, '\\');
    return inner;
  }

  if (singleQuoted) {
    return trimmed.slice(1, -1);
  }

  return trimmed.replace(/\s+#.*$/, '').trimEnd();
}

function parseEnv(content) {
  const env = new Map();
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!line) return;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w.-]*)\s*=\s*(.*)$/);
    if (!match) {
      throw new Error(`Invalid line ${index + 1}: ${line}`);
    }

    const key = match[1];
    const value = decodeValue(match[2] ?? '');
    env.set(key, value);
  });

  return env;
}

function ensureRequired(env, file) {
  const missing = [];
  for (const key of REQUIRED_VARS) {
    const value = env.get(key);
    if (value == null || value === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    const lines = missing.map((key) => `  - ${key}`).join('\n');
    throw new Error(`Missing required environment variables in ${file}:\n${lines}`);
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.log(help.trimEnd());
    process.exit(2);
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, '..');
  const envPath = isAbsolute(args.file) ? args.file : resolve(repoRoot, args.file);

  let raw;
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch (error) {
    console.error(`Environment file not found: ${envPath}`);
    process.exit(1);
  }

  let env;
  try {
    env = parseEnv(raw);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  try {
    ensureRequired(env, envPath);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  if (args.printExports) {
    for (const key of REQUIRED_VARS) {
      const value = env.get(key) ?? '';
      console.log(`export ${key}=${shellEscape(value)}`);
    }
    return;
  }

  if (!args.quiet) {
    console.log(`All required environment variables are present in ${envPath}.`);
  }
}

main();
