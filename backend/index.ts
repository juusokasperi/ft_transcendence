import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  UPLOAD_DIR,
  BACKEND_HOST,
  BACKEND_PORT,
  FRONTEND_URL,
  NGINX_PORT,
} from './utils/config.ts';
import { userRoutes } from './routes/users.ts';
import { loginRoutes } from './routes/login.ts';
import { logoutRoutes } from './routes/logout.ts';
import { signupRoutes } from './routes/signup.ts';
import { friendsRoutes } from './routes/friends.ts';
import { resetPasswordRoutes } from './routes/resetPassword.ts';
import { runMigrations } from './db/migrations.ts';
import './types/types.ts';

const app = fastify({
  logger: true,
});

await app.register(swagger, {
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
      { name: 'Game', description: 'Game related endpoints' },
      { name: 'Auth', description: 'Authentication related endpoints' },
      { name: 'Friends', description: 'Friends related endpoints' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
});

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

app.register(userRoutes, { prefix: '/api/users' });
app.register(friendsRoutes, { prefix: '/api/friends' });
app.register(loginRoutes, { prefix: '/api/login' });
app.register(logoutRoutes, { prefix: 'api/logout' });
app.register(signupRoutes, { prefix: '/api/signup' });
app.register(resetPasswordRoutes, { prefix: '/api/reset-password' });

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
