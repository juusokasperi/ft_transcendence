import fastify from 'fastify';
import cors from '@fastify/cors';
import { PORT } from './utils/config.ts';
import { userRoutes } from './controllers/users.ts';
import { loginRoutes } from './controllers/login.ts';
import { signupRoutes } from './controllers/signup.ts';
import { runMigrations } from './utils/migrations.ts';
import './types.ts';

const app = fastify({
	logger: true
});

await app.register(cors, {
	origin: true
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
