import fastify from 'fastify';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import createProxyServer from 'http-proxy';
import Redis from 'ioredis';
import { REDIS_URL, PORT } from './config';
import { verifyJoinToken } from '@pong/shared/auth/tokenSign';
import { ecsFormat } from '@elastic/ecs-pino-format';

const redis = new Redis(REDIS_URL);

const app = fastify({
  logger: {
    level: 'info', //log this level and all higher levels
    ...ecsFormat(),
  },
});

const proxy = new createProxyServer({ ws: true });

app.server.on('upgrade', async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  app.log.info('[Gateway] Upgrade connection started');
  const match = req.url?.match(/^\/g\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    app.log.info({ url: req.url }, '[Gateway] Invalid url:');
    socket.destroy();
    return;
  }

  const roomId = match[1];
  const protocolHeader = req.headers['sec-websocket-protocol'];

  if (typeof protocolHeader !== 'string') {
    app.log.info({ roomId: roomId }, '[Gateway] Missing Sec-WebSocket-Protocol header for room:');
    socket.write('HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const requestedProtocols = protocolHeader
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const bearerIndex = requestedProtocols.findIndex((p) => p.toLowerCase() === 'bearer');
  const joinToken = bearerIndex !== -1 ? requestedProtocols[bearerIndex + 1] : undefined;

  if (!joinToken) {
    app.log.info({ roomId: roomId }, '[Gateway] No join token provided for room:');
    socket.write('HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const claims = verifyJoinToken(joinToken);
  if (!claims || claims.roomIdentifier !== roomId) {
    app.log.info({ roomId: roomId }, '[Gateway] Invalid join token for room:');
    socket.write('HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  let gameNode: string | null = null;
  try {
    gameNode = await redis.get(`room-to-node:${roomId}`);
  } catch (err) {
    app.log.info({ roomId: roomId }, '[Gateway] No game node found for room:');
    socket.destroy();
    return;
  }

  if (!gameNode) {
    app.log.info('[Gateway] Game node is null');
    socket.destroy();
    return;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(1, (claims.exp ?? nowSec) - nowSec);
  const jtiKey = `join-token:${claims.jti}`;

  try {
    const setResult = await redis.set(jtiKey, roomId, 'EX', ttlSeconds, 'NX');
    if (setResult !== 'OK') {
      app.log.info({ roomId: roomId, jti: claims.jti }, '[Gateway] Join token already consumed');
      socket.write('HTTP/1.1 4403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
  } catch (err) {
    console.error('[Gateway] Failed to persist join token consumption', err);
    socket.write('HTTP/1.1 4500 Internal Server Error\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  proxy.ws(req, socket, head, {
    target: gameNode,
    headers: {
      'sec-websocket-protocol': req.headers['sec-websocket-protocol'] || '',
    },
  });

  app.log.info(`[Gateway] Routed room ${roomId} to ${gameNode}`);
});

app.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`[Gateway] Game gateway listening on port ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
