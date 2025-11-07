import fastify from 'fastify';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import createProxyServer from 'http-proxy';
import Redis from 'ioredis';
import { REDIS_URL, PORT } from './config';
import { verifyJoinToken, verifyResumeToken } from '@pong/shared/auth/tokenSign';
import { registerMetrics } from '@utils/metrics';
import { createFastifyLoggerConfig } from '@utils/logger';

const redis = new Redis(REDIS_URL);

const app = fastify({
  logger: createFastifyLoggerConfig({ service: 'game-gateway' }),
});

registerMetrics(app, { labels: { service: 'game-gateway' } });

const parseProtocols = (header: string | string[] | undefined) =>
  (typeof header === 'string' ? header : '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

const extractToken = (protocols: string[], tag: string) => {
  const idx = protocols.findIndex((p) => p.toLowerCase() === tag);
  return idx !== -1 ? protocols[idx + 1] : undefined;
};

const validateJoin = (token: string | undefined, roomId: string) => {
  if (!token) return null;
  const claims = verifyJoinToken(token);
  return claims && claims.roomIdentifier === roomId ? claims : null;
};

const validateResume = (token: string | undefined, roomId: string) => {
  if (!token) return null;
  const claims = verifyResumeToken(token);
  return claims && claims.roomIdentifier === roomId ? claims : null;
};

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

  const protocols = parseProtocols(protocolHeader);
  const resumeToken = extractToken(protocols, 'resume');
  const joinToken = resumeToken ? undefined : extractToken(protocols, 'bearer');

  const resumeClaims = resumeToken ? validateResume(resumeToken, roomId) : null;
  const joinClaims = !resumeClaims && joinToken ? validateJoin(joinToken, roomId) : null;

  if (!resumeClaims && !joinClaims) {
    app.log.info({ roomId }, '[Gateway] Unauthorized attempt');
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

  if (joinClaims) {
    const nowSec = Math.floor(Date.now() / 1000);
    const ttlSeconds = Math.max(1, (joinClaims.exp ?? nowSec) - nowSec);
    const jtiKey = `join-token:${joinClaims.jti}`;

    try {
      const setResult = await redis.set(jtiKey, roomId, 'EX', ttlSeconds, 'NX');
      if (setResult !== 'OK') {
        app.log.info(
          { roomId: roomId, jti: joinClaims.jti },
          '[Gateway] Join token already consumed',
        );
        socket.write('HTTP/1.1 4403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
    } catch (err) {
      app.log.error({ err }, '[Gateway] Failed to persist join token consumption');
      socket.write('HTTP/1.1 4500 Internal Server Error\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
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
