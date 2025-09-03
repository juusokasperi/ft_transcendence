import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import fastifyHealthcheck from '@fastify/healthcheck'
import { UPLOAD_DIR, BACKEND_HOST, BACKEND_PORT, FRONTEND_URL, NGINX_PORT } from './utils/config.ts';
import { userRoutes } from './routes/users.ts';
import { loginRoutes } from './routes/login.ts';
import { signupRoutes } from './routes/signup.ts';
import { friendsRoutes } from './routes/friends.ts';
import { resetPasswordRoutes } from './routes/resetPassword.ts';
import { runMigrations } from './db/migrations.ts';
import './types/types.ts';

const app = fastify({
	logger: true
});

// replace origin: true with origin: ['frontend-address'] !!!!!!
await app.register(cors, {
	origin: (origin, cb) => {
	// Allow direct FE and Nginx FE
	const allowed = [
	  FRONTEND_URL,
	  'http://localhost:' + (NGINX_PORT)
	];
	if (!origin || allowed.includes(origin)) return cb(null, true);
	return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
});

app.register(fastifyMultipart, {
	limits: {
		fileSize: 1024 * 1024,
		files: 1
	},
}); // For avatar uploads

app.register(fastifyStatic, {
	root: UPLOAD_DIR,
	prefix: '/uploads/',
}); // Serving the avatar images to frontend via http://<backend-url>/uploads/<filename>

await app.register(fastifyHealthcheck, {
  healthcheckUrl: '/health'
})

await runMigrations();

app.register(userRoutes, { prefix: '/api/users' });
app.register(friendsRoutes, { prefix: '/api/friends' });
app.register(loginRoutes, { prefix: '/api/login' });
app.register(signupRoutes, { prefix: '/api/signup' });
app.register(resetPasswordRoutes, { prefix: '/api/reset-password'})

app.listen({ host: BACKEND_HOST, port: BACKEND_PORT }, function(err, address) {
	if (err) {
		app.log.error(err);
		process.exit(1);
	}
});
