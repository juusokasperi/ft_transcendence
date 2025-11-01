import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { InviteLobby, ClientInfo } from '../types/types.ts';
import { log } from '@utils/logger';
import { v4 as uuid } from 'uuid';
import { createMatch } from './queue.ts';

const inviteMatches = new Map<string, InviteLobby>(); // lobbyId -> inviteLobby
const playerToInviteLobby = new Map<string, InviteLobby>(); // playerId -> inviteLobby

const INVITE_TIMEOUT_MS = 15000; // 15s
const LOBBY_TIMEOUT_MS = 15000;

export async function inviteRoute(app: FastifyInstance) {
  app.post<{ Body: { player1Uuid: string; player2Uuid: string } }>(
    '/',
    async (req: FastifyRequest, res: FastifyReply) => {
      const { player1Uuid, player2Uuid } = req.body as { player1Uuid: string; player2Uuid: string };
      if (!player1Uuid || !player2Uuid) {
        return res.code(400).send({
          status: 'ERROR',
          message: 'Missing player UUIDs',
        });
      }

      if (playerToInviteLobby.has(player1Uuid)) {
        log('Player 1 already in invite match map', { player1Uuid });
        return res.send({
          status: 'INVITER_UNAVAILABLE',
          message: 'Inviter is already scheduled for another match',
        });
      }
      if (playerToInviteLobby.has(player2Uuid)) {
        log('Player 2 already in invite match map', { player1Uuid });
        return res.send({
          status: 'INVITEE_UNAVAILABLE',
          message: 'Invitee is already scheduled for another match',
        });
      }

      const lobbyId = uuid();
      const lobby: InviteLobby = {
        lobbyId,
        player1Uuid,
        player2Uuid,
        createdAt: Date.now(),
      };

      lobby.timer = setTimeout(() => {
        log('Invite match timeout, no player connected', { lobbyId });
        destroyInviteLobby(lobbyId);
      }, INVITE_TIMEOUT_MS);

      inviteMatches.set(lobbyId, lobby);
      playerToInviteLobby.set(player1Uuid, lobby);
      playerToInviteLobby.set(player2Uuid, lobby);

      log('Invite match created', { lobbyId, player1Uuid, player2Uuid });

      return res.send({ status: 'SUCCESS', lobbyId });
    },
  );
}

export async function isInLobby(client: ClientInfo): Promise<boolean> {
  return playerToInviteLobby.has(client.uuid);
}

function destroyInviteLobby(lobbyId: string) {
  const lobby = inviteMatches.get(lobbyId);
  if (!lobby) return;

  if (lobby.timer) clearTimeout(lobby.timer);
  if (lobby.player1Client) {
    try {
      lobby.player1Client.socket.send(
        JSON.stringify({
          type: 'INVITE_MATCH_FAILED',
          reason: 'Opponent did not join in time',
        }),
      );
    } catch (err) {
      log('Failed to notify player1 of invite lobby destruction', { error: err }, 'warn');
    }
  }
  if (lobby.player2Client) {
    try {
      lobby.player2Client.socket.send(
        JSON.stringify({
          type: 'INVITE_MATCH_FAILED',
          reason: 'Opponent did not join in time',
        }),
      );
    } catch (err) {
      log('Failed to notify player2 of invite lobby destruction', { error: err }, 'warn');
    }
  }

  playerToInviteLobby.delete(lobby.player1Uuid);
  playerToInviteLobby.delete(lobby.player2Uuid);
  inviteMatches.delete(lobbyId);
  log('Invite lobby destroyed', { lobbyId });
}

export async function handleInviteLobbyJoin(client: ClientInfo) {
  const lobby = playerToInviteLobby.get(client.uuid);
  if (!lobby) {
    log('Client not found in invite lobby list', { uuid: client.uuid });
    return;
  }

  const isPlayer1 = client.uuid === lobby.player1Uuid;
  const isPlayer2 = client.uuid === lobby.player2Uuid;

  if (!isPlayer1 && !isPlayer2) {
    log('Client tried to join wrong invite lobby', {
      clientUuid: client.uuid,
      lobbyId: lobby.lobbyId,
    });
    return;
  }

  if (isPlayer1) lobby.player1Client = client;
  else lobby.player2Client = client;

  const bothConnected = lobby.player1Client && lobby.player2Client;

  if (lobby.timer) {
    clearTimeout(lobby.timer);
    lobby.timer = undefined;
  }

  if (!bothConnected) {
    lobby.timer = setTimeout(() => {
      log('Invite lobby timeout, second player did not join in time', {
        lobbyId: lobby.lobbyId,
      });
      destroyInviteLobby(lobby.lobbyId);
    }, LOBBY_TIMEOUT_MS);

    client.socket.send(
      JSON.stringify({
        type: 'JOINED_INVITE_LOBBY',
        playersJoined: 1,
        totalPlayers: 2,
      }),
    );

    log('First player joined invite lobby', {
      lobbyId: lobby.lobbyId,
      playerUuid: client.uuid,
    });
  } else {
    if (lobby.timer) {
      clearTimeout(lobby.timer);
      lobby.timer = undefined;
    }

    client.socket.send(
      JSON.stringify({
        type: 'JOINED_INVITE_LOBBY',
        playersJoined: 2,
        totalPlayers: 2,
      }),
    );

    const otherClient = isPlayer1 ? lobby.player2Client : lobby.player1Client;
    if (otherClient) {
      otherClient.socket.send(
        JSON.stringify({
          type: 'PLAYER_JOINED_INVITE_LOBBY',
          playersJoined: 2,
          totalPlayers: 2,
        }),
      );
    }

    log('Both players in invite lobby, allocating and doing handoff', { lobbyId: lobby.lobbyId });

    await allocateAndHandoffInvite(lobby);
  }
}

async function allocateAndHandoffInvite(lobby: InviteLobby) {
  if (!lobby.player1Client || !lobby.player2Client) {
    log('Missing client in lobby during handoff', { lobbyId: lobby.lobbyId }, 'error');
    destroyInviteLobby(lobby.lobbyId);
    return;
  }

  try {
    log('Creating invite match', {
      lobbyId: lobby.lobbyId,
    });

    await createMatch(lobby.player1Client, lobby.player2Client, 'invite');
    playerToInviteLobby.delete(lobby.player1Uuid);
    playerToInviteLobby.delete(lobby.player2Uuid);
    inviteMatches.delete(lobby.lobbyId);

    log('Invite match handoff complete', { lobbyId: lobby.lobbyId });
  } catch (err) {
    log('Error during invite match creation', { error: err, lobbyId: lobby.lobbyId }, 'error');
    destroyInviteLobby(lobby.lobbyId);
  }
}

export function clearLobbiesWithClient(client: ClientInfo) {
  const inviteLobby = playerToInviteLobby.get(client.uuid);
  if (inviteLobby) {
    // Add a small grace period before destroying the lobby.
    // This prevents a race condition where a client reconnecting for the invite
    // causes the old connection's 'close' event to destroy the lobby.
    setTimeout(() => {
      const lobby = inviteMatches.get(inviteLobby.lobbyId);
      // If the lobby still exists and hasn't been joined by both players, destroy it.
      if (lobby && (!lobby.player1Client || !lobby.player2Client)) {
        log('Destroying invite lobby after disconnect and grace period', {
          lobbyId: lobby.lobbyId,
          clientUuid: client.uuid,
        });
        destroyInviteLobby(inviteLobby.lobbyId);
      }
    }, 2000); // 2-second grace period
  }
}

export function clearInviteLobbies() {
  inviteMatches.forEach((lobby) => {
    if (lobby.timer) clearTimeout(lobby.timer);
  });
  inviteMatches.clear();
  playerToInviteLobby.clear();
}
