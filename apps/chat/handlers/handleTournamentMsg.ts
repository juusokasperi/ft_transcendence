import type { FastifyBaseLogger } from 'fastify';
import type { Client } from '../types';

interface TournamentMessagePayload {
  message: string;
  recipients: string[];
}

export function handleTournamentMsg(
  clients: Map<string, Client>,
  client: Client,
  payload: TournamentMessagePayload,
  log: FastifyBaseLogger,
): void {
  const { message, recipients } = payload;
  if (!message) return;

  log.info({ channel: client.channel, msg: message, recipients }, '[CHAT] tournament message');

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
