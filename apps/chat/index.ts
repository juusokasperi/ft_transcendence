import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyRequest } from 'fastify';
import type { WebSocket, RawData } from 'ws';
import { v4 as uuid } from 'uuid';

interface Client {
  id: string;
  socket: WebSocket;
  username?: string;
  channel?: string;
  blocked: Set<string>;
}

const PORT = Number(process.env.CHAT_PORT || 6262);
const HOST = process.env.CHAT_HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
});

const clients = new Map<string, Client>();

function broadcast(data: any, channel: string, excludeId?: string) {
  const msg = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.channel === channel && client.id !== excludeId) {
      client.socket.send(msg);
    }
  });
}

function sendUserList(channel: string) {
  const users = Array.from(clients.values())
    .filter((client) => client.channel === channel && client.username)
    .map((client) => ({
      userId: client.id,
      username: client.username!,
    }));

  clients.forEach((client) => {
    if (client.channel === channel) {
      client.socket.send(JSON.stringify({ type: 'userList', users }));
    }
  });
}

function findClientByUsername(username: string): Client | undefined {
  return Array.from(clients.values()).find((client) => client.username === username);
}

type ChatRequest = FastifyRequest;

function handleConnection(socket: WebSocket, _request: ChatRequest) {
  const id = uuid();
  const client: Client = { id, socket, blocked: new Set() };
  clients.set(id, client);

  fastify.log.info({ clientId: id }, '[CHAT] Client connected');
  socket.send(JSON.stringify({ type: 'connected', clientId: id }));

  socket.on('message', (raw: RawData) => {
    let data: any;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      fastify.log.warn({ clientId: id }, '[CHAT] Invalid message');
      return;
    }

    switch (data.type) {
      case 'setName':
        client.username = data.username;
        fastify.log.info({ clientId: id, username: data.username }, '[CHAT] set username');
        return;
      case 'joinChannel':
        client.channel = data.channel;
        fastify.log.info({ clientId: id, channel: data.channel }, '[CHAT] joined channel');
        broadcast({ type: 'userJoined', userId: id, username: client.username }, data.channel, id);
        socket.send(JSON.stringify({ type: 'channelJoined', channel: data.channel }));
        sendUserList(data.channel);
        return;
      case 'chat':
        if (!client.channel) return;
        fastify.log.debug(
          { channel: client.channel, from: client.username },
          '[CHAT] broadcast message',
        );
        broadcast(
          {
            type: 'chat',
            from: client.username,
            message: data.message,
          },
          client.channel,
        );
        return;
      case 'privateMessage': {
        const targetClient = findClientByUsername(data.to);
        if (!targetClient) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: `User ${data.to} not found.`,
            }),
          );
          return;
        }

        if (targetClient.blocked.has(client.username!)) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: `User ${data.to} has blocked you.`,
            }),
          );
          return;
        }

        const msg = {
          type: 'privateMessage',
          from: client.username,
          message: data.message,
        };

        targetClient.socket.send(JSON.stringify(msg));
        socket.send(JSON.stringify(msg));

        fastify.log.debug({ from: client.username, to: data.to }, '[CHAT] sent private message');
        return;
      }
      case 'blockUser':
        client.blocked.add(data.username);
        socket.send(JSON.stringify({ type: 'userBlocked', username: data.username }));
        return;
      case 'unblockUser':
        client.blocked.delete(data.username);
        socket.send(JSON.stringify({ type: 'userUnblocked', username: data.username }));
        return;
      default:
        fastify.log.warn({ clientId: id, type: data.type }, '[CHAT] Unknown message type');
    }
  });

  socket.on('close', () => {
    fastify.log.info({ clientId: id }, '[CHAT] Client disconnected');
    clients.delete(id);
    if (!client.username || !client.channel) return;

    broadcast(
      {
        type: 'userLeft',
        userId: id,
        username: client.username,
      },
      client.channel,
    );
    sendUserList(client.channel);
  });
}

async function bootstrap() {
  try {
    await fastify.register(websocket);

    fastify.get('/health', async () => ({ status: 'ok' }));
    fastify.get('/chat', { websocket: true }, (connection, request) =>
      handleConnection(connection, request),
    );

    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`[CHAT] WebSocket server listening on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error({ err }, '[CHAT] Failed to start server');
    process.exit(1);
  }
}

void bootstrap();
