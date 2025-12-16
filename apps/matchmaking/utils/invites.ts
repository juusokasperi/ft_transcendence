import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';
import { ClientState, type InviteLobby, type ClientInfo } from '../types/types.ts';
import { log } from '@utils/logger';
import { v4 as uuid } from 'uuid';
import { createMatch } from './queue.ts';
import { setClientState } from './state.ts';
import { isUserInTournament } from './tournamentMembershipRegistry.ts';

/**
 * Invite-match flow (chat → /invite-match → matchmaking WS → allocator handoff).
 *
 * This module maintains short‑lived "invite lobbies" for matches initiated via chat:
 *   1. Backend/chat calls POST `/invite-match` to create a lobby between player1 + player2.
 *   2. When each player connects (or reconnects) to matchmaking WS, we detect they are
 *      in a lobby and attach them via `handleInviteLobbyJoin`.
 *   3. Once both players are present, we call `createMatch(..., 'invite')` which
 *      requests allocation and hands both players off to a game node.
 *   4. If either player never shows up, or joins a tournament meanwhile, we cancel the lobby.
 *
 * Lobbies are held purely in memory; they are not persisted in Redis. This is fine because
 * invite matches are best‑effort and short‑lived.
 */

// Active invite lobbies keyed by lobbyId.
const inviteMatches = new Map<string, InviteLobby>(); // lobbyId -> InviteLobby
// Reverse index from player UUID -> lobby, so we can find a lobby on WS connect.
const playerToInviteLobby = new Map<string, InviteLobby>(); // playerId -> InviteLobby

// How long we wait for *any* player to connect after lobby creation.
const INVITE_TIMEOUT_MS = 15000; // 15s
// After first player connects, how long to wait for the second to join.
const LOBBY_TIMEOUT_MS = 15000;
const DEFAULT_INVITE_FAILURE_REASON = 'Opponent did not join in time';
export const TOURNAMENT_INVITE_BLOCK_REASON =
  'Invite cancelled because a player joined a tournament';

type DestroyLobbyOptions = {
  reason?: string;
};

type InviteRouteOptions = FastifyPluginOptions & {
  getClientByUuid: (uuid: string) => ClientInfo | undefined;
};

type InviteRouteRequest = FastifyRequest<{
  Body: { player1Uuid: string; player2Uuid: string };
  Querystring: { validateOnly?: string };
}>;

/**
 * Fastify plugin that registers the `/invite-match` HTTP endpoint.
 *
 * Called from `apps/matchmaking/index.ts` with prefix `/invite-match`.
 *
 * Endpoint:
 *   POST `/invite-match`
 * Body:
 *   { player1Uuid, player2Uuid }
 * Query:
 *   validateOnly=true -> only check availability (no lobby created)
 *
 * The backend/chat service uses this to start invite matches from chat UI.
 */
export async function inviteRoute(app: FastifyInstance, opts: InviteRouteOptions) {
  const getClientByUuid = opts.getClientByUuid ?? (() => undefined);

  // Register POST /invite-match
  app.post<{
    Body: { player1Uuid: string; player2Uuid: string };
    Querystring: { validateOnly?: string };
  }>('/', async (req: InviteRouteRequest, res: FastifyReply) => {
    // Validate basic payload shape.
    const { player1Uuid, player2Uuid } = req.body;
    if (!player1Uuid || !player2Uuid) {
      return res.code(400).send({
        status: 'ERROR',
        message: 'Missing player UUIDs',
      });
    }

    // Check whether both players are eligible for an invite lobby.
    const validationResult = validateInviteRequest(player1Uuid, player2Uuid, getClientByUuid);

    if (validationResult) return res.send(validationResult);

    // Optional dry-run mode for chat UI ("is invite possible?").
    const validateOnly = req.query.validateOnly === 'true';
    if (validateOnly) {
      log('Invite availability check succeeded', { player1Uuid, player2Uuid });
      return res.send({ status: 'SUCCESS' });
    }

    // Create a new lobby record and start its initial timer.
    const lobbyId = uuid();
    const lobby: InviteLobby = {
      lobbyId,
      player1Uuid,
      player2Uuid,
      createdAt: Date.now(),
    };

    // If nobody connects within INVITE_TIMEOUT_MS, the lobby is auto-destroyed.
    lobby.timer = setTimeout(() => {
      log('Invite match timeout, no player connected', { lobbyId });
      destroyInviteLobby(lobbyId);
    }, INVITE_TIMEOUT_MS);

    // Persist lobby in in-memory indexes for later WS joins.
    inviteMatches.set(lobbyId, lobby);
    playerToInviteLobby.set(player1Uuid, lobby);
    playerToInviteLobby.set(player2Uuid, lobby);

    log('Invite match created', { lobbyId, player1Uuid, player2Uuid });

    return res.send({ status: 'SUCCESS', lobbyId });
  });
}

/**
 * Validate whether an invite lobby can be created for two players.
 *
 * Checks:
 *   - neither player is already in another invite lobby
 *   - neither player is in an active tournament (in-memory registry or live WS state)
 *
 * Returns a status/message pair when invalid, otherwise null.
 */
function validateInviteRequest(
  player1Uuid: string,
  player2Uuid: string,
  getClientByUuid: (uuid: string) => ClientInfo | undefined,
): {
  status: 'INVITER_UNAVAILABLE' | 'INVITEE_UNAVAILABLE';
  message: string;
} | null {
  // Reject if inviter already has an active lobby.
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

  // Reject if invitee is already in an active lobby.
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

  // Reject if inviter is tracked as active in a tournament (in-memory snapshot).
  const inviterTournamentMembership = isUserInTournament(player1Uuid);
  if (inviterTournamentMembership) {
    log('Player 1 has active tournament membership during invite', {
      player1Uuid,
      tournamentId: inviterTournamentMembership.tournamentId,
    });
    return {
      status: 'INVITER_UNAVAILABLE',
      message: 'You are currently participating in a tournament',
    };
  }

  // Reject if invitee is tracked as active in a tournament (in-memory snapshot).
  const inviteeTournamentMembership = isUserInTournament(player2Uuid);
  if (inviteeTournamentMembership) {
    log('Player 2 has active tournament membership during invite', {
      player2Uuid,
      tournamentId: inviteeTournamentMembership.tournamentId,
    });
    return {
      status: 'INVITEE_UNAVAILABLE',
      message: 'That player is currently participating in a tournament',
    };
  }

  // Reject if inviter is currently connected and in tournament state.
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

  // Reject if invitee is currently connected and in tournament state.
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

/**
 * Check if a connected matchmaking client belongs to an active invite lobby.
 *
 * Called on WS connect from `index.ts` to decide whether to route the client
 * into the invite flow.
 */
export async function isInLobby(client: ClientInfo): Promise<boolean> {
  return playerToInviteLobby.has(client.uuid);
}

/**
 * Cancel an invite lobby for a given player UUID.
 *
 * Used when a player takes an action that invalidates the lobby
 * (e.g., joining a tournament). Returns true if a lobby was found and destroyed.
 */
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

/**
 * Destroy a lobby and notify any connected clients.
 *
 * This is called when:
 *   - invite timer expires (no one joined),
 *   - lobby timer expires (only one player joined),
 *   - a player joins a tournament while lobby is active,
 *   - or an internal error happens during allocation.
 *
 * It:
 *   - clears timers
 *   - sends INVITE_MATCH_FAILED to any connected lobby members
 *   - restores their matchmaking states (IDLE or previous queue state)
 *   - removes the lobby from both maps
 */
function destroyInviteLobby(lobbyId: string, options?: DestroyLobbyOptions) {
  // Load lobby and decide failure reason.
  const lobby = inviteMatches.get(lobbyId);
  if (!lobby) return;

  const failureReason = options?.reason ?? DEFAULT_INVITE_FAILURE_REASON;

  // Stop any active lobby timer(s).
  if (lobby.timer) clearTimeout(lobby.timer);
  if (lobby.player1Client) {
    // Notify player1 and restore their matchmaking state.
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
    // Notify player2 and restore their matchmaking state.
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

  // Remove lobby from indexes.
  playerToInviteLobby.delete(lobby.player1Uuid);
  playerToInviteLobby.delete(lobby.player2Uuid);
  inviteMatches.delete(lobbyId);
  log('Invite lobby destroyed', { lobbyId, reason: failureReason });
}

/**
 * Attach a matchmaking client to their invite lobby on WS connect/reconnect.
 *
 * Once both players are present, the lobby is turned into a real match by
 * calling `allocateAndHandoffInvite`, which uses createMatch('invite').
 */
export async function handleInviteLobbyJoin(client: ClientInfo) {
  // Find the lobby this client belongs to.
  const lobby = playerToInviteLobby.get(client.uuid);
  if (!lobby) {
    log('Client not found in invite lobby list', { uuid: client.uuid });
    return;
  }

  // Ensure the client is one of the invited players.
  const isPlayer1 = client.uuid === lobby.player1Uuid;
  const isPlayer2 = client.uuid === lobby.player2Uuid;

  if (!isPlayer1 && !isPlayer2) {
    log('Client tried to join wrong invite lobby', {
      clientUuid: client.uuid,
      lobbyId: lobby.lobbyId,
    });
    return;
  }

  // If the client is (now) in a tournament, cancel the invite lobby.
  if (client.state === ClientState.IN_TOURNAMENT || client.tournamentId) {
    log('Client in tournament attempted to join invite lobby', {
      lobbyId: lobby.lobbyId,
      uuid: client.uuid,
      tournamentId: client.tournamentId,
    });
    destroyInviteLobby(lobby.lobbyId, { reason: TOURNAMENT_INVITE_BLOCK_REASON });
    return;
  }

  // Attach the socket to the lobby record and mark state.
  if (isPlayer1) lobby.player1Client = client;
  else lobby.player2Client = client;

  setClientState(client, ClientState.IN_INVITE_LOBBY, 'joined_invite_lobby');

  const bothConnected = lobby.player1Client && lobby.player2Client;

  // Clear the initial "no one joined" timer once someone has connected.
  if (lobby.timer) {
    clearTimeout(lobby.timer);
    lobby.timer = undefined;
  }

  if (!bothConnected) {
    // First player joined: arm the lobby timeout and notify them.
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
    // Second player joined: notify both sides and start allocation + handoff.
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

/**
 * When both players are connected to matchmaking, create an invite match
 * and hand both players off to the game node.
 *
 * This delegates to `createMatch(..., 'invite')`, which calls the allocator
 * and sends HANDOFF messages to both clients.
 */
async function allocateAndHandoffInvite(lobby: InviteLobby) {
  // Ensure both clients are still present.
  if (!lobby.player1Client || !lobby.player2Client) {
    log('Missing client in lobby during handoff', { lobbyId: lobby.lobbyId }, 'error');
    destroyInviteLobby(lobby.lobbyId);
    return;
  }

  // Tournament guard: if either joined a tournament mid-lobby, cancel.
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
    // Create an invite match (allocator + HANDOFF to both clients).
    log('Creating invite match', {
      lobbyId: lobby.lobbyId,
    });

    await createMatch(lobby.player1Client, lobby.player2Client, 'invite');
    // Remove lobby now that handoff succeeded.
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

/**
 * Clean up invite lobbies when a client disconnects from matchmaking.
 *
 * We give a short grace window before destroying the lobby to avoid races:
 * a reconnecting client might establish a new socket while the old socket's
 * 'close' event is still firing.
 */
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

/**
 * Clear all invite lobbies and timers.
 *
 * Called on service shutdown from `index.ts` to avoid leaking timers/sockets.
 */
export function clearInviteLobbies() {
  inviteGraceTimers.forEach((timer) => clearTimeout(timer));
  inviteGraceTimers.clear();
  inviteMatches.forEach((lobby) => {
    if (lobby.timer) clearTimeout(lobby.timer);
  });
  inviteMatches.clear();
  playerToInviteLobby.clear();
}
