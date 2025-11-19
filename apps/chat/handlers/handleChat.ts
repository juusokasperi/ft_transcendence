import type { FastifyBaseLogger } from 'fastify';
import type { Client } from '../types';
import { broadcast } from '../utils/broadcast';
import { findClientByUsername } from '../utils/helpers.ts';

export function handleChat(
  clients: Map<string, Client>,
  client: Client,
  message: string,
  log: FastifyBaseLogger,
): void {
  if (!client.channel) return;
  log.debug({ channel: client.channel, from: client.username }, '[CHAT] broadcast message');
  broadcast(
    {
      type: 'chat',
      from: client.username,
      fromUuid: client.uuid,
      message,
    },
    client.channel,
    clients,
    undefined,
    client,
  );
}

interface PrivateMessagePayload {
  to: string;
  message: string;
}

export function handlePrivateMessage(
  clients: Map<string, Client>,
  client: Client,
  payload: PrivateMessagePayload,
  log: FastifyBaseLogger,
): void {
  const targetClient = findClientByUsername(clients, payload.to);
  if (!targetClient) {
    client.socket.send(
      JSON.stringify({
        type: 'error',
        message: `User ${payload.to} not found.`,
      }),
    );
    return;
  }

  if (targetClient.blocked.has(client.uuid)) {
    client.socket.send(
      JSON.stringify({
        type: 'error',
        message: `User ${payload.to} has blocked you.`,
      }),
    );
    return;
  }

  const msg = {
    type: 'privateMessage',
    from: client.username,
    fromUuid: client.uuid,
    message: payload.message,
  };

  targetClient.socket.send(JSON.stringify(msg));
  client.socket.send(JSON.stringify(msg));

  log.debug({ from: client.username, to: payload.to }, '[CHAT] sent private message');
}
