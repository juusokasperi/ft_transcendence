import type { FastifyBaseLogger } from "fastify";
import { MM_SERVICE_URL, INVITE_TIMEOUT_MS } from "./config";
import type { Client, PendingInvite } from "../types";
import { findClientByUuid } from "./helpers";

export async function createInviteMatch(
  player1Uuid: string,
  player2Uuid: string,
  log: FastifyBaseLogger
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
      log.error({ status: response.status }, '[CHAT] MM service request failed');
      return { status: 'ERROR', message: 'Matchmaking service error' };
    }

    return await response.json();
  } catch (err) {
    log.error({ err }, '[CHAT] Failed to contact MM service');
    return { status: 'ERROR', message: 'Could not contact matchmaking service' };
  }
}

export async function checkInviteAvailability(
  player1Uuid: string,
  player2Uuid: string,
  log: FastifyBaseLogger,
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
      log.error({ status: response.status }, '[CHAT] Invite availability check failed');
      return { status: 'ERROR', message: 'Matchmaking service error' };
    }

    return await response.json();
  } catch (err) {
    log.error({ err }, '[CHAT] Failed to check invite availability with MM service');
    return { status: 'ERROR', message: 'Could not contact matchmaking service' };
  }
}

export function cleanupExpiredInvites(
  pendingInvites: Map<string, PendingInvite>,
  clients: Map<string, Client>,
  log: FastifyBaseLogger,
)
 {
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
      log.debug({ inviteId }, '[CHAT] Invite expired');
    }
  });
}
