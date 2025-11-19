import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  FastifyPluginOptions,
} from 'fastify';
import { ClientState, type InviteLobby, type ClientInfo } from '../types/types.ts';
import { log } from '@utils/logger';
import { v4 as uuid } from 'uuid';
import { createMatch } from './queue.ts';
import { setClientState } from './state.ts';

const inviteMatches = new Map<string, InviteLobby>(); // lobbyId -> inviteLobby
const playerToInviteLobby = new Map<string, InviteLobby>(); // playerId -> inviteLobby

const INVITE_TIMEOUT_MS = 15000; // 15s
const LOBBY_TIMEOUT_MS = 15000;
const DEFAULT_INVITE_FAILURE_REASON = 'Opponent did not join in time';
export const TOURNAMENT_INVITE_BLOCK_REASON = 'Invite cancelled because a player joined a tournament';

type DestroyLobbyOptions = {
  reason?: string;
};

type InviteRouteOptions = FastifyPluginOptions & {
  getClientByUuid: (uuid: string) => ClientInfo | undefined;
};

export async function inviteRoute(app: FastifyInstance, opts: InviteRouteOptions) {
  const getClientByUuid = opts.getClientByUuid ?? (() => undefined);

  app.post<{
    Body: { player1Uuid: string; player2Uuid: string };
    Querystring?: { validateOnly?: string };
  }>(
    '/',
    async (req: FastifyRequest, res: FastifyReply) => {
      const { player1Uuid, player2Uuid } = req.body as { player1Uuid: string; player2Uuid: string };
      if (!player1Uuid || !player2Uuid) {
        return res.code(400).send({
          status: 'ERROR',
          message: 'Missing player UUIDs',
        });
      }

      const validationResult = validateInviteRequest(player1Uuid, player2Uuid, getClientByUuid);

      if (validationResult) return res.send(validationResult);

      const validateOnly =
        typeof req.query?.validateOnly === 'string' && req.query.validateOnly === 'true';
      if (validateOnly) {
        log('Invite availability check succeeded', { player1Uuid, player2Uuid });
        return res.send({ status: 'SUCCESS' });
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

function validateInviteRequest(
  player1Uuid: string,
  player2Uuid: string,
  getClientByUuid: (uuid: string) => ClientInfo | undefined,
):
  | {
      status: 'INVITER_UNAVAILABLE' | 'INVITEE_UNAVAILABLE';
      message: string;
    }
  | null {
  const inviterLobby = playerToInviteLobby.get(player1Uuid);
  if (inviterLobby) {
    log('Player 1 already in invite match map', {
      player1Uuid,
      inviterUsername: inviterLobby.player1Client?.username ?? inviterLobby.player2Client?.username,
    });
    return {
      status: 'INVITER_UNAVAILABLE',
      message: 'You already have a pending invite match',
    };
  }

  const inviteeLobby = playerToInviteLobby.get(player2Uuid);
  if (inviteeLobby) {
    const inviteeLobbyName =
      inviteeLobby.player1Client?.username ?? inviteeLobby.player2Client?.username ?? 'That player';
    log('Player 2 already in invite match map', {
      player2Uuid,
      inviteeUsername: inviteeLobby.player1Client?.username ?? inviteeLobby.player2Client?.username,
    });
    return {
      status: 'INVITEE_UNAVAILABLE',
      message: `${inviteeLobbyName} is already scheduled for another match`,
    };
  }

  const inviter = getClientByUuid(player1Uuid);
  if (inviter && inviter.state === ClientState.IN_TOURNAMENT) {
    log('Player 1 attempted invite while in tournament', {
      player1Uuid,
      tournamentId: inviter.tournamentId,
      inviterUsername: inviter.username,
    });
    return {
      status: 'INVITER_UNAVAILABLE',
      message: 'You are currently participating in a tournament',
    };
  }

  const invitee = getClientByUuid(player2Uuid);
  const inviteeName = invitee?.username ?? 'That player';
  if (invitee && invitee.state === ClientState.IN_TOURNAMENT) {
    log('Player 2 attempted invite while in tournament', {
      player2Uuid,
      tournamentId: invitee.tournamentId,
      inviteeUsername: invitee.username,
    });
    return {
      status: 'INVITEE_UNAVAILABLE',
      message:
        inviteeName === 'That player'
          ? 'That player is currently participating in a tournament'
          : `${inviteeName} is currently participating in a tournament`,
    };
  }

  return null;
}

export async function isInLobby(client: ClientInfo): Promise<boolean> {
  return playerToInviteLobby.has(client.uuid);
}

export function cancelInviteLobbyForPlayerUuid(
  playerUuid: string,
  options?: DestroyLobbyOptions,
): boolean {
  const lobby = playerToInviteLobby.get(playerUuid);
  if (!lobby) return false;
  destroyInviteLobby(lobby.lobbyId, options);
  log('Cancelled invite lobby for player UUID', { playerUuid, lobbyId: lobby.lobbyId });
  return true;
}

function destroyInviteLobby(lobbyId: string, options?: DestroyLobbyOptions) {
  const lobby = inviteMatches.get(lobbyId);
  if (!lobby) return;

  const failureReason = options?.reason ?? DEFAULT_INVITE_FAILURE_REASON;

  if (lobby.timer) clearTimeout(lobby.timer);
  if (lobby.player1Client) {
    const client = lobby.player1Client;
    try {
      if (client.state === ClientState.IN_QUEUE) client.previousState = undefined;
      else setClientState(client, ClientState.IDLE, 'invite_lobby_destroyed');
      client.socket.send(
        JSON.stringify({
          type: 'INVITE_MATCH_FAILED',
          reason: failureReason,
        }),
      );
    } catch (err) {
      log('Failed to notify player1 of invite lobby destruction', { error: err }, 'warn');
    }
  }
  if (lobby.player2Client) {
    const client = lobby.player2Client;
    try {
      if (client.state === ClientState.IN_QUEUE) client.previousState = undefined;
      else setClientState(client, ClientState.IDLE, 'invite_lobby_destroyed');
      client.socket.send(
        JSON.stringify({
          type: 'INVITE_MATCH_FAILED',
          reason: failureReason,
        }),
      );
    } catch (err) {
      log('Failed to notify player2 of invite lobby destruction', { error: err }, 'warn');
    }
  }

  playerToInviteLobby.delete(lobby.player1Uuid);
  playerToInviteLobby.delete(lobby.player2Uuid);
  inviteMatches.delete(lobbyId);
  log('Invite lobby destroyed', { lobbyId, reason: failureReason });
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

  if (client.state === ClientState.IN_TOURNAMENT || client.tournamentId) {
    log('Client in tournament attempted to join invite lobby', {
      lobbyId: lobby.lobbyId,
      uuid: client.uuid,
      tournamentId: client.tournamentId,
    });
    destroyInviteLobby(lobby.lobbyId, { reason: TOURNAMENT_INVITE_BLOCK_REASON });
    return;
  }

  if (isPlayer1) lobby.player1Client = client;
  else lobby.player2Client = client;

  setClientState(client, ClientState.IN_INVITE_LOBBY, 'joined_invite_lobby');

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

  if (lobby.player1Client.tournamentId || lobby.player2Client.tournamentId) {
    log('Cancelling invite lobby because participant is in a tournament', {
      lobbyId: lobby.lobbyId,
      player1Uuid: lobby.player1Client.uuid,
      player2Uuid: lobby.player2Client.uuid,
      player1TournamentId: lobby.player1Client.tournamentId,
      player2TournamentId: lobby.player2Client.tournamentId,
    });
    destroyInviteLobby(lobby.lobbyId, { reason: TOURNAMENT_INVITE_BLOCK_REASON });
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

const inviteGraceTimers = new Map<string, NodeJS.Timeout>();

export function clearLobbiesWithClient(client: ClientInfo) {
  const inviteLobby = playerToInviteLobby.get(client.uuid);
  if (inviteLobby) {
    // Add a small grace period before destroying the lobby.
    // This prevents a race condition where a client reconnecting for the invite
    // causes the old connection's 'close' event to destroy the lobby.
    const timer = setTimeout(() => {
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
    inviteGraceTimers.set(inviteLobby.lobbyId, timer);
  }
}

export function clearInviteLobbies() {
  inviteGraceTimers.forEach((timer) => clearTimeout(timer));
  inviteGraceTimers.clear();
  inviteMatches.forEach((lobby) => {
    if (lobby.timer) clearTimeout(lobby.timer);
  });
  inviteMatches.clear();
  playerToInviteLobby.clear();
}
