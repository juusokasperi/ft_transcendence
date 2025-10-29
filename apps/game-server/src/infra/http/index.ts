import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { RoomRegistry } from '../../app/RoomRegistry.ts';
import { registerMetrics } from '@utils/metrics';
import { createFastifyLoggerConfig } from '@utils/logger';

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
  const app = fastify({logger: createFastifyLoggerConfig({service:'game-server'})});
  registerMetrics(app, { labels: { service: 'game-server' } });

  app.after(() => {
    const createDynamicGauge = (
      name: string,
      help: string,
      metric: keyof ReturnType<RoomRegistry['metrics']>,
    ) => {
      new app.metrics.client.Gauge({
        name,
        help,
        collect() {
          this.set(registry.metrics()[metric]);
        },
      });
    };

    createDynamicGauge('game_server_matches', 'Number of matches being played', 'matches');
    createDynamicGauge('game_server_players', 'Number of players connected', 'players');
    createDynamicGauge(
      'game_server_rooms_waiting',
      'Number of rooms waiting for players',
      'roomsWaiting',
    );
    createDynamicGauge('game_server_rooms_ready', 'Number of rooms ready to start', 'roomsReady');
    createDynamicGauge(
      'game_server_rooms_playing',
      'Number of rooms currently playing',
      'roomsPlaying',
    );
  });

  const authPreHandler = (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const secret = request.headers['x-admin-secret'];
    if (!secret || secret !== adminSecret) {
      reply.code(403).send({ error: 'Forbidden' });
      return;
    }
    done();
  };

  app.get('/health', async (_request, reply) => {
    reply.send({ status: 'ok' });
  });

  app.post('/admin/rooms', { preHandler: [authPreHandler] }, async (request, reply) => {
    try {
      const result = await onCreateRoom(request.body);
      reply.send(result ?? { status: 'ok' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      reply.status(400).send({ error: message });
    }
  });

  app.listen({ port, host: '0.0.0.0' }, (err: Error | null) => {
    if (err) {
      app.log.error(err, 'Failed to start HTTP server');
      process.exit(1);
    }
    app.log.info(`HTTP Endpoint listening on http://0.0.0.0:${port}`);
  });

  return app;
}
