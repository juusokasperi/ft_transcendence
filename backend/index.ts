import fastify from 'fastify';
import { PORT } from './utils/config.ts';
import { userRoutes } from './controllers/users.ts';
import { loginRoutes } from './controllers/login.ts';
import { signupRoutes } from './controllers/signup.ts';
import './types.ts';

const app = fastify({
	logger: true
})

app.register(userRoutes, { prefix: '/api/users' });
app.register(loginRoutes, { prefix: '/api/login' });
app.register(signupRoutes, { prefix: '/api/signup' });

app.listen({ port: PORT }, function(err, address) {
	if (err) {
		app.log.error(err);
		process.exit(1);
	}
});
