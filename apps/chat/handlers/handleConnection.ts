import type { FastifyInstance, FastifyRequest } from 'fastify';
import { v4 as uuid } from 'uuid';
import type { ChatSocket, Client, PendingInvite } from '../types.ts';
import { handleAuth, extractToken } from '../utils/auth.ts';
import { findClientByUuid } from '../utils/helpers.ts';
import { handleJoinChannel } from './handleJoinChannel.ts';
import { handleChat, handlePrivateMessage } from './handleChat.ts';
import { handleBlockUser, handleUnblockUser, getBlocked } from './handleBlock.ts';
import { broadcast, sendUserList } from '../utils/broadcast.ts';
import { handleInviteUser, handleAcceptInvite, handleDeclineInvite } from './handleInvite.ts';
import { handleTournamentMsg } from './handleTournamentMsg.ts';

type ChatRequest = FastifyRequest;
type SocketRawData = { toString(): string };

export async function handleConnection(
  socket: ChatSocket,
  request: ChatRequest,
  clients: Map<string, Client>,
  pendingInvites: Map<string, PendingInvite>,
  fastify: FastifyInstance,
) {
  const token = extractToken(socket, request.raw);
  if (!token) return;

  const id = uuid();
  const client: Client = { id, uuid: '', socket, blocked: new Set() };
  const authenticated = await handleAuth(client, token, clients);
  if (!authenticated) return;
  clients.set(id, client);

  fastify.log.info({ clientId: id }, '[CHAT] Client connected');
  socket.send(JSON.stringify({ type: 'connected', clientId: id }));

  // blocked list from backend for this user
  await getBlocked(client, token, fastify.log);

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
        handleJoinChannel(clients, client, data.channel, fastify.log);
        return;
      case 'chat':
        handleChat(clients, client, data.message, fastify.log);
        return;
      case 'privateMessage':
        handlePrivateMessage(clients, client, data, fastify.log);
        return;
      case 'blockUser':
        handleBlockUser(clients, client, data.username);
        return;
      case 'unblockUser':
        handleUnblockUser(clients, client, data.username);
        return;
      case 'tournamentMsg':
        handleTournamentMsg(clients, client, data, fastify.log);
        return;
      case 'inviteUser':
        await handleInviteUser(clients, client, pendingInvites, data.username, fastify.log);
        return;
      case 'acceptInvite':
        await handleAcceptInvite(clients, client, pendingInvites, data.inviteId, fastify.log);
        return;
      case 'declineInvite':
        handleDeclineInvite(clients, client, pendingInvites, data.inviteId, fastify.log);
        return;
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

    clients.delete(id);

    if (!client.username || !client.channel) return;

    broadcast({ type: 'userLeft', userId: id, username: client.username }, client.channel, clients);
    sendUserList(client.channel, clients);
  });
}
