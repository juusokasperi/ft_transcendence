import fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Match } from '../index.ts';

export function createHttpServer({
  ADMIN_SECRET,
  HTTP_PORT,
  matches,
  onCreateRoom,
}: {
  ADMIN_SECRET: string;
  HTTP_PORT: number;
  matches: Map<string, Match>;
  onCreateRoom: (body: any) => Promise<any>;
}) {
  const app = fastify();

  function authPreHandler(req: FastifyRequest, reply: FastifyReply, done: Function): void {
    const authHeader = req.headers['x-admin-secret'];
    if (!authHeader || authHeader !== ADMIN_SECRET) {
      reply.code(403).send({ error: 'Forbidden' });
      return;
    }
    done();
  }

  app.get('/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    const matchCount = matches.size;
    let playerCount = 0;
    for (const match of matches.values()) {
      if (match.players.P1) playerCount++;
      if (match.players.P2) playerCount++;
    }
    const metrics = [
      `game_server_matches ${matchCount}`,
      `game_server_players ${playerCount}`,
    ].join('\n');
    reply.type('text/plain').send(metrics);
  });

  app.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ status: 'ok' });
  });

  app.post(
    '/admin/rooms',
    { preHandler: [authPreHandler] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await onCreateRoom(request.body);
        console.log('[GameServer] /admin/rooms', result);
        reply.send(result ?? { status: 'ok' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        reply.status(400).send({ error: message });
      }
    },
  );

  app.listen({ port: HTTP_PORT, host: '0.0.0.0' }, (err: Error | null, address: string) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`HTTP Endpoint listening on http://localhost:${HTTP_PORT}`);
  });

  return app;
}
