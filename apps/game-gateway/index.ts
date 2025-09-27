import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';
import http from 'http';
import createProxyServer from 'http-proxy';
import { REDIS_URL, PORT } from './config';

const redis = new Redis(REDIS_URL);
const proxy = new createProxyServer({ ws: true });

const server = http.createServer();

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws: WebSocket, req: http.IncomingMessage, targetUrl: string) => {
  console.log('[Gateway] Connection established');
  //
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
