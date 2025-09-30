import { register } from 'prom-client';
import { initSqliteMetrics } from './metrics/sqlite-patch.ts';
import { registerMetrics } from './metrics/fastify-metrics.ts';
import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import cookie from '@fastify/cookie';
import googleSign from './routes/googleSign.ts';
import {
  UPLOAD_DIR,
  BACKEND_HOST,
  BACKEND_PORT,
  FRONTEND_URL,
  NGINX_PORT,
  ENABLE_SQLITE_METRICS,
  swaggerConfig,
} from './utils/config.ts';
import { userRoutes } from './routes/users.ts';
import { loginRoutes } from './routes/login.ts';
import { logoutRoutes } from './routes/logout.ts';
import { signupRoutes } from './routes/signup.ts';
import { friendsRoutes } from './routes/friends.ts';
import { matchRoutes } from './routes/matches.ts';
import { debugRoutes } from './routes/debug.ts';
import { resetPasswordRoutes } from './routes/resetPassword.ts';
import { refreshRoutes } from './routes/refresh.ts';
import { purgeExpiredRefreshTokens } from './db/queries/refreshTokens.ts';
import { runMigrations } from './db/migrations.ts';
import { prettierErrorMessages } from './utils/errorHandler.ts';
import './types/types.ts';

if (ENABLE_SQLITE_METRICS === 'true') initSqliteMetrics();

const app = fastify({
  logger: true,
  // trustProxy: true,
  ajv: {
    customOptions: { allErrors: true, removeAdditional: true },
  },
});

register.setDefaultLabels({
  service: 'api',
  env: process.env.NODE_ENV ?? 'dev',
  version: process.env.GIT_SHA ?? 'dev',
});

registerMetrics(app);

app.setErrorHandler(prettierErrorMessages);

await app.register(swagger, swaggerConfig);
await app.register(cookie);
await app.register(googleSign);

await app.register(cors, {
  origin: (origin, cb) => {
    // Allow direct FE and Nginx FE
    const allowed = [FRONTEND_URL, 'http://localhost:' + NGINX_PORT];
    if (!origin || allowed.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
});

app.register(fastifyMultipart, {
  limits: {
    fileSize: 1024 * 1024,
    files: 1,
  },
}); // For avatar uploads

app.register(fastifyStatic, {
  root: UPLOAD_DIR,
  prefix: '/uploads/',
}); // Serving the avatar images to frontend via http://<backend-url>/uploads/<filename>

app.get('/health', async () => ({ status: 'ok' }));

await runMigrations();

// Periodically purge expired refresh tokens to keep table tidy
const REFRESH_PURGE_INTERVAL_MS = 1000 * 60 * 30; // 30 minutes
const refreshPurgeTimer = setInterval(() => {
  try {
    purgeExpiredRefreshTokens(new Date().toISOString());
  } catch (err) {
    app.log.warn({ err }, 'Failed to purge expired refresh tokens');
  }
}, REFRESH_PURGE_INTERVAL_MS);
refreshPurgeTimer.unref();

// Also run a synchronous purge on startup in case of stale records
try {
  purgeExpiredRefreshTokens(new Date().toISOString());
} catch (err) {
  app.log.warn({ err }, 'Initial refresh token purge failed');
}

app.register(userRoutes, { prefix: '/api/users' });
app.register(friendsRoutes, { prefix: '/api/friends' });
app.register(matchRoutes, { prefix: '/api/matches' });
app.register(loginRoutes, { prefix: '/api/login' });
app.register(logoutRoutes, { prefix: '/api/logout' });
app.register(signupRoutes, { prefix: '/api/signup' });
app.register(refreshRoutes, { prefix: '/api/auth' });
app.register(resetPasswordRoutes, { prefix: '/api/reset-password' });
app.register(debugRoutes, { prefix: '/debug' });

app.addHook('onClose', async () => {
  clearInterval(refreshPurgeTimer);
});

await app.register(swaggerUi, {
  routePrefix: '/docs',
});
await app.ready();
app.swagger();

console.log(
  `\x1b[0;33mSwagger API documentation served at http://localhost:${BACKEND_PORT}/docs\x1b[0m`,
);

app.listen({ host: BACKEND_HOST, port: BACKEND_PORT }, function (err, address) {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
