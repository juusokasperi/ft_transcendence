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
import { tournamentRoutes } from './routes/tournaments.ts';
import { debugRoutes } from './routes/debug.ts';
import { resetPasswordRoutes } from './routes/resetPassword.ts';
import { refreshRoutes } from './routes/refresh.ts';
import { setupPurgeSchedulers } from './maintenance/purgeSchedulers.ts';
import { runMigrations } from './db/migrations.ts';
import { prettierErrorMessages } from './utils/errorHandler.ts';
import './types/types.ts';
import { ecsFormat } from '@elastic/ecs-pino-format';
import { setLogger } from './utils/logger.ts';

if (ENABLE_SQLITE_METRICS === 'true') initSqliteMetrics();

const isDev = process.env.NODE_ENV === 'development';

function createLoggerOptions(isDev: boolean) {
  if (isDev) {
    return {
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return {
    level: 'info',
    base: { service: 'scorer' },
    ...ecsFormat(),
  };
}

const app = fastify({
  logger: createLoggerOptions(isDev),
  // trustProxy: true,
  ajv: {
    customOptions: { allErrors: true, removeAdditional: true },
  },
});

setLogger(app.log);

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

const teardownPurgeSchedulers = setupPurgeSchedulers(app);

app.register(userRoutes, { prefix: '/api/users' });
app.register(friendsRoutes, { prefix: '/api/friends' });
app.register(matchRoutes, { prefix: '/api/matches' });
app.register(tournamentRoutes, { prefix: '/api/tournaments' });
app.register(loginRoutes, { prefix: '/api/login' });
app.register(logoutRoutes, { prefix: '/api/logout' });
app.register(signupRoutes, { prefix: '/api/signup' });
app.register(refreshRoutes, { prefix: '/api/auth' });
app.register(resetPasswordRoutes, { prefix: '/api/reset-password' });
if (isDev) {
  app.register(debugRoutes, { prefix: '/debug' });
}

app.addHook('onClose', async () => {
  teardownPurgeSchedulers();
});

await app.register(swaggerUi, {
  routePrefix: '/docs',
});
await app.ready();
app.swagger();

app.log.info(
  `\x1b[0;33mSwagger API documentation served at http://localhost:${BACKEND_PORT}/docs\x1b[0m`,
);

app.listen({ host: BACKEND_HOST, port: BACKEND_PORT }, function (err, address) {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
