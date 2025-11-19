import type { FastifyBaseLogger } from "fastify";
import type { Client, PendingInvite } from "../types";
import { findClientByUuid, findClientByUsername } from "../utils/helpers";
import { createInviteMatch, checkInviteAvailability } from "../utils/invite";
import { v4 as uuid } from 'uuid';

export async function handleInviteUser(
  clients: Map<string, Client>,
  client: Client,
  pendingInvites: Map<string, PendingInvite>,
  targetUser: string,
  log: FastifyBaseLogger
): Promise<void> {
        if (!client.username) {
          client.socket.send(JSON.stringify({ type: 'error', message: 'You must set a username first' }));
          return;
        }

        const targetClient = findClientByUsername(clients, targetUser);
        if (!targetClient || !targetClient.username) {
          client.socket.send(
            JSON.stringify({ type: 'error', message: `User ${targetUser} not found` }),
          );
          return;
        }
        if (targetClient.id === client.id) {
          client.socket.send(JSON.stringify({ type: 'error', message: 'You cannot invite yourself' }));
          return;
        }
        if (targetClient.blocked.has(client.uuid)) {
          client.socket.send(
            JSON.stringify({
              type: 'error',
              message: `User ${targetUser} has blocked you.`,
            }),
          );
          return;
        }

        const alreadyPending = Array.from(pendingInvites.values()).some(
          (invite) =>
            invite.fromUserUuid === client.uuid && invite.toUserUuid === targetClient.uuid,
        );

        if (alreadyPending) {
          client.socket.send(
            JSON.stringify({
              type: 'error',
              message: `You already have a pending invite with ${targetClient.username}.`,
            }),
          );
          return;
        }

        const availability = await checkInviteAvailability(client.uuid, targetClient.uuid, log);
        if (availability.status !== 'SUCCESS') {
          let errorMessage = availability.message ?? 'Could not send invite.';
          if (availability.status === 'INVITER_UNAVAILABLE' && !availability.message) {
            errorMessage = 'You are not available for invites right now.';
          } else if (availability.status === 'INVITEE_UNAVAILABLE' && !availability.message) {
            errorMessage = `${targetClient.username} is not available for invites.`;
          }
          client.socket.send(JSON.stringify({ type: 'error', message: errorMessage }));
          log.info(
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

        client.socket.send(
          JSON.stringify({
            type: 'inviteSent',
            to: targetClient.username,
            inviteId,
          }),
        );

        log.info(
          { from: client.username, to: targetClient.username, inviteId },
          '[CHAT] Game invite sent',
        );
}


export async function handleAcceptInvite(
  clients: Map<string, Client>,
  client: Client,
  pendingInvites: Map<string, PendingInvite>,
  inviteId: string,
  log: FastifyBaseLogger,
): Promise<void>
{
  const invite = pendingInvites.get(inviteId);
  if (!invite) {
    // Silently ignore; this invite may have been cancelled already.
    return;
  }

  if (invite.toUserUuid !== client.uuid) {
    client.socket.send(
      JSON.stringify({
        type: 'error',
        message: 'This invite is not for you.',
      }),
    );
    return;
  }

  const inviter = findClientByUuid(clients, invite.fromUserUuid);
  if (!inviter) {
    client.socket.send(
      JSON.stringify({
        type: 'error',
        message: 'Inviter is no longer in the chat.',
      }),
    );
    pendingInvites.delete(inviteId);
    return;
  }

  log.info(
    { inviteId: inviteId, from: invite.fromUsername, to: invite.toUsername },
    '[CHAT] Invite accepted, contacting MM service',
  );

  const result = await createInviteMatch(invite.fromUserUuid, invite.toUserUuid, log);

  if (result.status === 'SUCCESS') {
    inviter.socket.send(JSON.stringify({ type: 'inviteAccepted' }));
    client.socket.send(JSON.stringify({ type: 'inviteAccepted' }));

    log.info({ inviteId: inviteId }, '[CHAT] Match created successfully');
    pendingInvites.delete(inviteId);

    // Cancel any other pending invites from this inviter since they are now busy.
    const cancelled: string[] = [];
    pendingInvites.forEach((otherInvite, otherInviteId) => {
      if (otherInviteId === inviteId) return;
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

    client.socket.send(JSON.stringify({ type: 'error', message: errorMessage }));
    log.warn(
      { inviteId: inviteId, status: result.status },
      '[CHAT] Failed to create match',
    );
    pendingInvites.delete(inviteId);
  }
  return;
}

export function handleDeclineInvite(
  clients: Map<string, Client>,
  client: Client,
  pendingInvites: Map<string, PendingInvite>,
  inviteId: string,
  log: FastifyBaseLogger,
): void
{
  const invite = pendingInvites.get(inviteId);
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

  client.socket.send(
    JSON.stringify({
      type: 'inviteDeclined',
      from: invite.fromUsername,
      to: invite.toUsername,
    }),
  );

  pendingInvites.delete(inviteId);
  log.info({ inviteId }, '[CHAT] Invite declined');
}

