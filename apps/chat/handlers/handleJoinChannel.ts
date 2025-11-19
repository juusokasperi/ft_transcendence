import type { FastifyBaseLogger } from 'fastify';
import type { Client } from '../types';
import { broadcast } from '../utils/broadcast';
import { sendUserList } from '../utils/broadcast';

export function handleJoinChannel(
  clients: Map<string, Client>,
  client: Client,
  channel: string,
  log: FastifyBaseLogger,
): void {
  client.channel = channel;
  log.info({ clientId: client.id, channel: channel }, '[CHAT] joined channel');
  broadcast(
    { type: 'userJoined', userId: client.id, username: client.username },
    channel,
    clients,
    client.id,
  );
  client.socket.send(JSON.stringify({ type: 'channelJoined', channel: channel }));
  sendUserList(channel, clients);
}
