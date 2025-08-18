import fastify from 'fastify';
import cors from '@fastify/cors';
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
