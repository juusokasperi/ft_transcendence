import fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { PORT } from './utils/config.ts';
import { userRoutes } from './routes/users.ts';
import { loginRoutes } from './routes/login.ts';
import { signupRoutes } from './routes/signup.ts';
import { runMigrations } from './db/migrations.ts';
import './types/types.ts';

const app = fastify({
	logger: true
});

// replace origin: true with origin: ['frontend-address'] !!!!!!
await app.register(cors, {
	origin: true,
	methods: ['GET', 'POST', 'PUT', 'DELETE']
});

app.register(fastifyMultipart, {
	limits: {
		fileSize: 1024 * 1024,
		files: 1
	},
}); // For avatar uploads

app.register(fastifyStatic, {
	root: path.join(process.cwd(), 'uploads'),
	prefix: '/uploads/',
}); // Serving the avatar images to frontend via http://<backend-url>/uploads/<filename>

await runMigrations();

app.register(userRoutes, { prefix: '/api/users' });
app.register(loginRoutes, { prefix: '/api/login' });
app.register(signupRoutes, { prefix: '/api/signup' });

app.listen({ port: PORT }, function(err, address) {
	if (err) {
		app.log.error(err);
		process.exit(1);
	}
});
