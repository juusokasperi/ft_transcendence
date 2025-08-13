import fastify from 'fastify';
import { PORT } from './utils/config.ts';
import { userRoutes } from './controllers/users.ts';

const app = fastify({
	logger: true
})

app.register(userRoutes, { prefix: '/users' });

app.listen({ port: PORT }, function(err, address) {
	if (err) {
		app.log.error(err);
		process.exit(1);
	}
});
