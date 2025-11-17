import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyRequest } from 'fastify';
import { v4 as uuid } from 'uuid';
import { ecsFormat } from '@elastic/ecs-pino-format';
import type { ChatSocket, Client, PendingInvite } from './types.ts';
import { handleAuth, extractToken } from './auth.ts';

const MATCHMAKING_PORT = process.env.MATCHMAKING_PORT;
const MM_SERVICE_URL = MATCHMAKING_PORT
  ? `http://matchmaking-service:${MATCHMAKING_PORT}`
  : 'http://matchmaking-service:4242';
const INVITE_TIMEOUT_MS = 60000; // 1 minute
const PORT = Number(process.env.CHAT_PORT || 6262);
const HOST = process.env.CHAT_HOST || '0.0.0.0';
const isDev = process.env.NODE_ENV === 'development';
const API_PORT = process.env.BACKEND_PORT;
const API_SERVICE_URL = API_PORT ? `http://backend:${API_PORT}` : 'http://backend:3001';

async function fetchBlockedUsernames(token: string): Promise<string[]> {
  try {
    const res = await fetch(`${API_SERVICE_URL}/api/blocked-users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as string[];
    if (!Array.isArray(data)) return [];
    return data;
  } catch {
    return [];
  }
}

function createLoggerOptions(isDev: boolean) {
  if (isDev) {
    return {
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return {
    level: 'info',
    base: { service: 'chat-service' },
    ...ecsFormat(),
  };
}

const fastify = Fastify({
  logger: createLoggerOptions(isDev),
});

const clients = new Map<string, Client>();
const pendingInvites = new Map<string, PendingInvite>();

function broadcast(data: any, channel: string, excludeId?: string, sender?: Client) {
  const msg = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.channel === channel && client.id !== excludeId) {
      if (data.type === 'chat' && sender) {
        const senderName = sender.username;
        const targetName = client.username;

        if (senderName && targetName) {
          if (sender.blocked.has(targetName)) {
            return;
          }
          if (client.blocked.has(senderName)) {
            return;
          }
        }
      }
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

function findClientById(userId: string): Client | undefined {
  return Array.from(clients.values()).find((client) => client.uuid === userId);
}

async function createInviteMatch(
  player1Uuid: string,
  player2Uuid: string,
): Promise<{
  status: 'SUCCESS' | 'INVITER_UNAVAILABLE' | 'INVITEE_UNAVAILABLE' | 'ERROR';
  message?: string;
}> {
  try {
    const response = await fetch(`${MM_SERVICE_URL}/invite-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1Uuid, player2Uuid }),
    });

    if (!response.ok) {
      fastify.log.error({ status: response.status }, '[CHAT] MM service request failed');
      return { status: 'ERROR', message: 'Matchmaking service error' };
    }

    return await response.json();
  } catch (err) {
    fastify.log.error({ err }, '[CHAT] Failed to contact MM service');
    return { status: 'ERROR', message: 'Could not contact matchmaking service' };
  }
}

function cleanupExpiredInvites() {
  const now = Date.now();
  const expired: string[] = [];

  pendingInvites.forEach((invite, inviteId) => {
    if (now - invite.createdAt > INVITE_TIMEOUT_MS) {
      expired.push(inviteId);
    }
  });

  expired.forEach((inviteId) => {
    const invite = pendingInvites.get(inviteId);
    if (invite) {
      const fromClient = findClientById(invite.fromUserUuid);
      const toClient = findClientById(invite.toUserUuid);

      if (fromClient) {
        fromClient.socket.send(
          JSON.stringify({
            type: 'inviteExpired',
            username: invite.toUsername,
          }),
        );
      }

      if (toClient) {
        toClient.socket.send(
          JSON.stringify({
            type: 'inviteExpired',
            username: invite.fromUsername,
          }),
        );
      }

      pendingInvites.delete(inviteId);
      fastify.log.debug({ inviteId }, '[CHAT] Invite expired');
    }
  });
}

setInterval(cleanupExpiredInvites, 10000);

type ChatRequest = FastifyRequest;
type SocketRawData = { toString(): string };

async function handleConnection(socket: ChatSocket, _request: ChatRequest) {
  const token = extractToken(socket, _request.raw);
  if (!token) return;

  const id = uuid();
  const client: Client = { id, uuid: '', socket, blocked: new Set() };
  const authenticated = await handleAuth(client, token, clients);
  if (!authenticated) return;
  clients.set(id, client);

  fastify.log.info({ clientId: id }, '[CHAT] Client connected');
  socket.send(JSON.stringify({ type: 'connected', clientId: id }));

  // blocked list from backend for this user
  void (async () => {
  try {
    const blockedUsernames = await fetchBlockedUsernames(token);
    client.blocked = new Set(blockedUsernames);
    fastify.log.debug(
      { clientId: id, blockedCount: blockedUsernames.length },
      '[CHAT] Hydrated blocked users from API',
    );

    socket.send(
      JSON.stringify({
        type: 'blockedList',
        usernames: blockedUsernames,
      }),
    );
  } catch (err) {
    fastify.log.error({ err, clientId: id }, '[CHAT] Failed to hydrate blocked users');
  }})();


  socket.on('message', async (raw: SocketRawData) => {
    let data: any;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      fastify.log.warn({ clientId: id }, '[CHAT] Invalid message');
      return;
    }

    const messageTypes = new Set(['chat', 'privateMessage', 'tournamentMsg']);
    if (messageTypes.has(data.type)) {
      const msg = data.message;
      if (msg.length > 250) {
        socket.send(JSON.stringify({ type: 'error', message: 'Message too long. Maximum length is 250 characters.' }));
        return;
      }
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
          undefined,
          client,
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

      case 'tournamentMsg': {
        const { message, recipients } = data;
        if (!message) return;

        fastify.log.info(
          { channel: client.channel, msg: message, recipients },
          '[CHAT] tournament message',
        );

        // If recipients list is provided, send ONLY to those users
        if (Array.isArray(recipients) && recipients.length > 0) {
          const msg = JSON.stringify({
            type: 'tournamentMsg',
            message,
          });

          clients.forEach((c) => {
            if (!c.uuid) return;
            if (recipients.includes(c.uuid)) {
              c.socket.send(msg);
            }
          });
          return;
        }
        return;
      }

      case 'inviteUser':
        if (!client.username) {
          socket.send(JSON.stringify({ type: 'error', message: 'You must set a username first' }));
          return;
        }
        const targetClient = findClientByUsername(data.username);
        if (!targetClient || !targetClient.username) {
          socket.send(
            JSON.stringify({ type: 'error', message: `User ${data.username} not found` }),
          );
          return;
        }
        if (targetClient.id === client.id) {
          socket.send(JSON.stringify({ type: 'error', message: 'You cannot invite yourself' }));
          return;
        }
        if (targetClient.blocked.has(client.username)) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: `User ${data.username} has blocked you.`,
            }),
          );
          return;
        }

        const alreadyPending = Array.from(pendingInvites.values()).some(
          (invite) =>
            invite.fromUserUuid === client.uuid && invite.toUserUuid === targetClient.uuid,
        );

        if (alreadyPending) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: `You already have a pending invite with ${targetClient.username}.`,
            }),
          );
          return;
        }
        const inviteId = uuid();
        const invite: PendingInvite = {
          fromUserUuid: client.uuid,
          fromUsername: client.username,
          toUserUuid: targetClient.uuid,
          toUsername: targetClient.username,
          createdAt: Date.now(),
        };

        pendingInvites.set(inviteId, invite);

        targetClient.socket.send(
          JSON.stringify({
            type: 'inviteGame',
            inviteId,
            from: client.username,
            fromUserUuid: client.uuid,
          }),
        );

        socket.send(
          JSON.stringify({
            type: 'inviteSent',
            to: targetClient.username,
            inviteId,
          }),
        );

        fastify.log.info(
          { from: client.username, to: targetClient.username, inviteId },
          '[CHAT] Game invite sent',
        );
        return;
      case 'acceptInvite': {
        const invite = pendingInvites.get(data.inviteId);
        if (!invite) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: 'Invite not found or expired.',
            }),
          );
          return;
        }

        if (invite.toUserUuid !== client.uuid) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: 'This invite is not for you.',
            }),
          );
          return;
        }

        const inviter = findClientById(invite.fromUserUuid);
        if (!inviter) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: 'Inviter is no longer in the chat.',
            }),
          );
          pendingInvites.delete(data.inviteId);
          return;
        }

        fastify.log.info(
          { inviteId: data.inviteId, from: invite.fromUsername, to: invite.toUsername },
          '[CHAT] Invite accepted, contacting MM service',
        );

        const result = await createInviteMatch(invite.fromUserUuid, invite.toUserUuid);

        if (result.status === 'SUCCESS') {
          inviter.socket.send(JSON.stringify({ type: 'inviteAccepted' }));
          socket.send(JSON.stringify({ type: 'inviteAccepted' }));

          fastify.log.info({ inviteId: data.inviteId }, '[CHAT] Match created successfully');
          pendingInvites.delete(data.inviteId);
        } else {
          let errorMessage = 'Could not create match.';
          if (result.status === 'INVITER_UNAVAILABLE') {
            errorMessage = `${invite.fromUsername} is no longer available.`;
          } else if (result.status === 'INVITEE_UNAVAILABLE') {
            errorMessage = 'You are already in another match.';
          } else if (result.message) {
            errorMessage = result.message;
          }

          socket.send(JSON.stringify({ type: 'error', message: errorMessage }));
          fastify.log.warn(
            { inviteId: data.inviteId, status: result.status },
            '[CHAT] Failed to create match',
          );
          pendingInvites.delete(data.inviteId);
        }
        return;
      }
      case 'declineInvite': {
        const invite = pendingInvites.get(data.inviteId);
        if (!invite) return;

        if (invite.toUserUuid !== client.uuid) return;

        const inviter = findClientById(invite.fromUserUuid);
        if (inviter) {
          inviter.socket.send(
            JSON.stringify({
              type: 'inviteDeclined',
              from: invite.fromUsername,
              to: invite.toUsername,
            }),
          );
        }

        socket.send(
          JSON.stringify({
            type: 'inviteDeclined',
            from: invite.fromUsername,
            to: invite.toUsername,
          }),
        );

        pendingInvites.delete(data.inviteId);
        fastify.log.info({ inviteId: data.inviteId }, '[CHAT] Invite declined');
        return;
      }
      default:
        fastify.log.warn({ clientId: id, type: data.type }, '[CHAT] Unknown message type');
    }
  });

  socket.on('close', () => {
    fastify.log.info({ clientId: id }, '[CHAT] Client disconnected');
    if (client && client.uuid) {
      const toDelete: string[] = [];
      pendingInvites.forEach((invite, inviteId) => {
        if (invite.fromUserUuid === client.uuid || invite.toUserUuid === client.uuid) {
          toDelete.push(inviteId);

          const otherUserId =
            invite.fromUserUuid === client.uuid ? invite.toUserUuid : invite.fromUserUuid;
          const otherClient = findClientById(otherUserId);
          if (otherClient) {
            otherClient.socket.send(
              JSON.stringify({ type: 'inviteCancelled', username: client.username }),
            );
          }
        }
      });
      toDelete.forEach((inviteId) => pendingInvites.delete(inviteId));
    }

    if (!client || !client.username || !client.channel) return;

    broadcast(
      {
        type: 'userLeft',
        userId: id,
        username: client.username,
      },
      client.channel,
    );
    clients.delete(id);
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
