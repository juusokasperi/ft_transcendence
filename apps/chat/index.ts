import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { createFastifyLoggerConfig } from '@utils/logger';
import { registerMetrics } from '@utils/metrics';
import type { Client, PendingInvite } from './types.ts';
import { PORT, HOST } from './utils/config.ts';
import { cleanupExpiredInvites } from './utils/invite.ts';
import { handleConnection } from './handlers/handleConnection.ts';

const fastify = Fastify({
  logger: createFastifyLoggerConfig({ service: 'chat' }),
});

registerMetrics(fastify, { labels: { service: 'chat' } });

const clients = new Map<string, Client>();
const pendingInvites = new Map<string, PendingInvite>();

setInterval(() => cleanupExpiredInvites(pendingInvites, clients, fastify.log), 10000);

async function bootstrap() {
  try {
    await fastify.register(websocket);

    fastify.get('/health', async () => ({ status: 'ok' }));
    fastify.get('/chat', { websocket: true }, (connection, request) =>
      handleConnection(connection, request, clients, pendingInvites, fastify),
    );

    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`[CHAT] WebSocket server listening on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error({ err }, '[CHAT] Failed to start server');
    process.exit(1);
  }
}

void bootstrap();
