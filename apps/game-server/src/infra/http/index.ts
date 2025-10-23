import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { RoomRegistry } from '../../app/RoomRegistry.ts';

type CreateHttpServerArgs = {
  adminSecret: string;
  port: number;
  registry: RoomRegistry;
  onCreateRoom: (body: unknown) => Promise<unknown>;
};

export function createHttpServer({
  adminSecret,
  port,
  registry,
  onCreateRoom,
}: CreateHttpServerArgs): FastifyInstance {
  const app = fastify();

  const authPreHandler = (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const secret = request.headers['x-admin-secret'];
    if (!secret || secret !== adminSecret) {
      reply.code(403).send({ error: 'Forbidden' });
      return;
    }
    done();
  };

  app.get('/metrics', async (_request, reply) => {
    const metrics = registry.metrics();
    const lines = [
      `game_server_matches ${metrics.matches}`,
      `game_server_players ${metrics.players}`,
      `game_server_rooms_waiting ${metrics.roomsWaiting}`,
      `game_server_rooms_ready ${metrics.roomsReady}`,
      `game_server_rooms_playing ${metrics.roomsPlaying}`,
    ];
    reply.type('text/plain').send(lines.join('\n'));
  });

  app.get('/health', async (_request, reply) => {
    reply.send({ status: 'ok' });
  });

  app.post(
    '/admin/rooms',
    { preHandler: [authPreHandler] },
    async (request, reply) => {
      try {
        const result = await onCreateRoom(request.body);
        reply.send(result ?? { status: 'ok' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        reply.status(400).send({ error: message });
      }
    },
  );

  app.listen({ port, host: '0.0.0.0' }, (err: Error | null) => {
    if (err) {
      app.log.error(err, 'Failed to start HTTP server');
      process.exit(1);
    }
    app.log.info(`HTTP Endpoint listening on http://0.0.0.0:${port}`);
  });

  return app;
}
