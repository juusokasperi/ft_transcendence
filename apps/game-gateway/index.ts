import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';
import http from 'http';
import createProxyServer from 'http-proxy';
import { REDIS_URL, PORT } from './config';
import { verifyJoinToken } from '@pong/shared/auth/tokenSign';

const redis = new Redis(REDIS_URL);
const proxy = new createProxyServer({ ws: true });

const server = http.createServer();

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage, targetUrl: string) => {
  console.log('[Gateway] Proxying connection to target', targetUrl);
});

server.on('upgrade', async (req: http.IncomingMessage, socket: any, head: Buffer) => {
  console.log('[Gateway] Upgrade connection started');
  const match = req.url?.match(/^\/g\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    console.log('[Gateway] Invalid url:', req.url);
    socket.destroy();
    return;
  }
  const roomId = match[1];

  const protocolHeader = req.headers['sec-websocket-protocol'];
  if (typeof protocolHeader !== 'string') {
    console.log('[Gateway] Missing Sec-WebSocket-Protocol header for room:', roomId);
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
    console.log('[Gateway] No join token provided for room:', roomId);
    socket.write('HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  const claims = verifyJoinToken(joinToken);
  if (!claims) {
    console.log('[Gateway] Invalid join token for room:', roomId);
    socket.write('HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  if (claims.roomIdentifier !== roomId) {
    console.log('[Gateway] Token room mismatch', {
      requested: roomId,
      tokenRoom: claims.roomIdentifier,
    });
    socket.write('HTTP/1.1 4401 Unauthorized\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  let gameNode: string | null = null;
  try {
    gameNode = await redis.get(`room-to-node:${roomId}`);
  } catch (err) {
    console.log('[Gateway] No game node found for room:', roomId);
    socket.destroy();
    return;
  }
  if (!gameNode) {
    console.log('[Gateway] Game node is null');
    socket.destroy();
    return;
  }

  console.log(gameNode);

  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(1, (claims.exp ?? nowSec) - nowSec);
  const jtiKey = `join-token:${claims.jti}`;
  try {
    const setResult = await redis.set(jtiKey, roomId, 'EX', ttlSeconds, 'NX');
    if (setResult !== 'OK') {
      console.log('[Gateway] Join token already consumed', {
        roomId,
        jti: claims.jti,
      });
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
  console.log(`[Gateway] Routed room ${roomId} to ${gameNode}`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Gateway] Game gateway listening on port ${PORT}`);
});
