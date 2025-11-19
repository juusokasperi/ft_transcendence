import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyRequest } from 'fastify';
import { v4 as uuid } from 'uuid';
import { ecsFormat } from '@elastic/ecs-pino-format';
import type { ChatSocket, Client, PendingInvite } from './types.ts';
import { handleAuth, extractToken } from './utils/auth.ts';
import { fetchBlockedUuids, findClientByUsername, findClientByUuid } from './utils/helpers.ts';
import {
  MM_SERVICE_URL,
  PORT,
  HOST,
  isDev,
} from './utils/config.ts';
import { broadcast } from './utils/broadcast.ts';

const INVITE_TIMEOUT_MS = 60000; // 1 minute

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

function sendUserList(channel: string) {
  const users = Array.from(clients.values())
    .filter((client) => client.channel === channel && client.username)
    .map((client) => ({
      userId: client.id,
      userUuid: client.uuid,
      username: client.username!,
    }));

  clients.forEach((client) => {
    if (client.channel === channel) {
      client.socket.send(JSON.stringify({ type: 'userList', users }));
    }
  });
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

async function checkInviteAvailability(
  player1Uuid: string,
  player2Uuid: string,
): Promise<{
  status: 'SUCCESS' | 'INVITER_UNAVAILABLE' | 'INVITEE_UNAVAILABLE' | 'ERROR';
  message?: string;
}> {
  try {
    const response = await fetch(`${MM_SERVICE_URL}/invite-match?validateOnly=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player1Uuid, player2Uuid }),
    });

    if (!response.ok) {
      fastify.log.error({ status: response.status }, '[CHAT] Invite availability check failed');
      return { status: 'ERROR', message: 'Matchmaking service error' };
    }

    return await response.json();
  } catch (err) {
    fastify.log.error({ err }, '[CHAT] Failed to check invite availability with MM service');
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
      const fromClient = findClientByUuid(clients, invite.fromUserUuid);
      const toClient = findClientByUuid(clients, invite.toUserUuid);

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
      const blockedUuids = await fetchBlockedUuids(token);
      client.blocked = new Set(blockedUuids);
      fastify.log.debug(
        { clientId: id, blockedCount: blockedUuids.length },
        '[CHAT] Hydrated blocked users from API',
      );

      socket.send(
        JSON.stringify({
          type: 'blockedList',
          uuids: blockedUuids,
        }),
      );
    } catch (err) {
      fastify.log.error({ err, clientId: id }, '[CHAT] Failed to hydrate blocked users');
    }
  })();

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
        socket.send(
          JSON.stringify({
            type: 'error',
            message: 'Message too long. Maximum length is 250 characters.',
          }),
        );
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
        broadcast({ type: 'userJoined', userId: id, username: client.username }, data.channel, clients, id);
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
            fromUuid: client.uuid,
            message: data.message,
          },
          client.channel,
          clients,
          undefined,
          client,
        );
        return;
      case 'privateMessage': {
        const targetClient = findClientByUsername(clients, data.to);
        if (!targetClient) {
          socket.send(
            JSON.stringify({
              type: 'error',
              message: `User ${data.to} not found.`,
            }),
          );
          return;
        }

        if (targetClient.blocked.has(client.uuid!)) {
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
          fromUuid: client.uuid,
          message: data.message,
        };

        targetClient.socket.send(JSON.stringify(msg));
        socket.send(JSON.stringify(msg));

        fastify.log.debug({ from: client.username, to: data.to }, '[CHAT] sent private message');
        return;
      }
      case 'blockUser': {
        const targetClient = findClientByUsername(clients, data.username);
        if (!targetClient) return;
        client.blocked.add(targetClient.uuid);
        socket.send(JSON.stringify({ type: 'userBlocked', username: data.username, uuid: targetClient.uuid }));
        return;
      }
      case 'unblockUser': {
        const targetClient = findClientByUsername(clients, data.username);
        if (!targetClient) return;
        client.blocked.delete(targetClient.uuid);
        socket.send(JSON.stringify({ type: 'userUnblocked', username: data.username, uuid: targetClient.uuid }));
        return;
      }

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
        const targetClient = findClientByUsername(clients, data.username);
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
        if (targetClient.blocked.has(client.uuid)) {
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

        const availability = await checkInviteAvailability(client.uuid, targetClient.uuid);
        if (availability.status !== 'SUCCESS') {
          let errorMessage = availability.message ?? 'Could not send invite.';
          if (availability.status === 'INVITER_UNAVAILABLE' && !availability.message) {
            errorMessage = 'You are not available for invites right now.';
          } else if (availability.status === 'INVITEE_UNAVAILABLE' && !availability.message) {
            errorMessage = `${targetClient.username} is not available for invites.`;
          }
          socket.send(JSON.stringify({ type: 'error', message: errorMessage }));
          fastify.log.info(
            {
              invitee: targetClient.username,
              inviter: client.username,
              status: availability.status,
            },
            '[CHAT] Invite blocked by matchmaking availability',
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
          // Silently ignore; this invite may have been cancelled already.
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

        const inviter = findClientByUuid(clients, invite.fromUserUuid);
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

          // Cancel any other pending invites from this inviter since they are now busy.
          const cancelled: string[] = [];
          pendingInvites.forEach((otherInvite, otherInviteId) => {
            if (otherInviteId === data.inviteId) return;
            if (otherInvite.fromUserUuid === invite.fromUserUuid) {
              const otherClient = findClientByUuid(clients, otherInvite.toUserUuid);
              if (otherClient) {
                otherClient.socket.send(
                  JSON.stringify({
                    type: 'inviteCancelled',
                    reason: `${invite.fromUsername} started another match.`,
                  }),
                );
              }
              cancelled.push(otherInviteId);
            }
          });
          cancelled.forEach((inviteIdToRemove) => pendingInvites.delete(inviteIdToRemove));
        } else {
          let errorMessage = 'Could not create match.';
          if (result.status === 'INVITER_UNAVAILABLE') {
            errorMessage = `${invite.fromUsername} is no longer available.`;
          } else if (result.status === 'INVITEE_UNAVAILABLE') {
            errorMessage = 'You are already in another match/tournament.';
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

        const inviter = findClientByUuid(clients, invite.fromUserUuid);
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
          const otherClient = findClientByUuid(clients, otherUserId);
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
      clients,
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
