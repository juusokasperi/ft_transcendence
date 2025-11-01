import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { WebSocket, RawData } from 'ws';
import { v4 as uuid } from 'uuid';
import { PORT, REDIS_URL } from './utils/config.ts';
import type { ClientInfo, PendingMatch, InviteLobby } from './types/types.ts';
import type { MatchmakingClientMessage } from '@pong/shared/protocol/net';
import { extractToken, handleAuth } from './auth/auth.ts';
import {
  handleAcceptMatch,
  handleDeclineMatch,
  handleLeaveQueue,
  tryMatchQueue,
  removeFromQueue,
  clearQueue,
} from './utils/queue.ts';
import {
  handleCreateTournament,
  handleJoinTournament,
  handleLeaveTournament,
  handleForfeitTournament,
  handleAcceptScheduled,
  handleTournamentMatchesReady,
  handleClientDisconnectFromTournament,
  handleTournamentStateUpdated,
  restoreTournamentMembership,
} from './utils/scheduledMatches.ts';
import { handleJoinQueue, createMatch } from './utils/queue.ts';
import Redis from 'ioredis';
import { handleAdmitConfirmed } from './utils/pendingHandoffs.ts';
import { registerMetrics } from '@utils/metrics';
import { log, createFastifyLoggerConfig } from '@utils/logger';
import { inviteRoute } from './utils/invites.ts';

const redisSub = new Redis(REDIS_URL);
const app = Fastify({
  logger: createFastifyLoggerConfig({ service: 'matchmaking' }),
});

registerMetrics(app, { labels: { service: 'matchmaking' } });

redisSub.subscribe('room_ready');
redisSub.subscribe('tournament:matches_ready');
redisSub.subscribe('tournament:state_updated');
redisSub.on('connect', () => {
  log('Redis pub/sub connected');
});
redisSub.on('message', (channel: string, message: string) => {
  log(`[MM] Redis: ${channel}: ${message}`);
  if (channel === 'room_ready') {
    try {
      const { roomIdentifier } = JSON.parse(message);
      handleAdmitConfirmed(roomIdentifier);
    } catch (err) {
      log(
        'Error parsing roomIdentifier from redis',
        { error: err instanceof Error ? err.message : 'Unknown error' },
        'error',
      );
    }
  } else if (channel === 'tournament:matches_ready') {
    try {
      const payload = JSON.parse(message);
      void handleTournamentMatchesReady(payload, clients);
    } catch (err) {
      log(
        'Failed to handle tournament matches ready message',
        { error: err instanceof Error ? err.message : 'Unknown error' },
        'error',
      );
    }
  } else if (channel === 'tournament:state_updated') {
    try {
      const payload = JSON.parse(message) as { tournamentId: number };
      void handleTournamentStateUpdated(payload, clients);
    } catch (err) {
      log(
        'Failed to handle tournament state updated message',
        { error: err instanceof Error ? err.message : 'Unknown error' },
        'error',
      );
    }
  }
});
redisSub.on('error', (err: Error) => {
  log(
    'Redis pub/sub error:',
    { error: err instanceof Error ? err.message : 'Unknown error' },
    'error',
  );
});

await app.register(websocket);

const clients = new Map<string, ClientInfo>();
const pendingMatches = new Map<string, PendingMatch>();
const inviteMatches = new Map<string, InviteLobby>(); // lobbyId -> inviteLobby
const playerToInviteLobby = new Map<string, InviteLobby>(); // playerId -> inviteLobby

const INVITE_TIMEOUT_MS = 15000; // 15s
const LOBBY_TIMEOUT_MS = 15000;

app.register(inviteRoute, { prefix: '/invite-match' });

app.post<{ Body: { player1Uuid: string; player2Uuid: string } }>(
  '/invite-match',
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

async function handleInviteLobbyJoin(client: ClientInfo, lobby: InviteLobby) {
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

const queueTicker = setInterval(() => {
  tryMatchQueue(pendingMatches);
}, 500);

app.get('/health', async () => ({ status: 'ok' }));

app.get('/matchmaking', { websocket: true }, (socket: WebSocket, req) => {
  void handleConnection(socket, req);
});

async function handleConnection(socket: WebSocket, req: FastifyRequest) {
  const token = extractToken(socket, req.raw);
  if (!token) return;

  const id = uuid();
  const client: ClientInfo = {
    id,
    socket,
    ready: false,
    username: 'Unknown user',
    joinedAt: Date.now(),
    uuid: '',
    mmr: 1000,
    authenticated: false,
  };
  log(`Client connected, validating.`, { clientId: client.id });
  const authenticated = await handleAuth(client, token, clients);
  if (!authenticated) return;
  clients.set(id, client);

  socket.send(JSON.stringify({ type: 'CONNECTED', clientId: id }));

  const inviteLobby = playerToInviteLobby.get(client.uuid);
  if (inviteLobby) {
    log('Client joining invite lobby', {
      clientId: client.id,
      uuid: client.uuid,
      lobbyId: inviteLobby.lobbyId,
    });
    await handleInviteLobbyJoin(client, inviteLobby);
    return;
  }

  void restoreTournamentMembership(client, clients);
  // broadcastLobbies(client, lobbies, clients); Maybe for tournament system..
  socket.on('message', (raw: RawData) => {
    let data: MatchmakingClientMessage;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      log(`Invalid message from ${id}:`, { raw: raw.toString() }, 'warn');
      return;
    }
    switch (data.type) {
      case 'JOIN_QUEUE':
        handleJoinQueue(client, data.alias);
        break;
      case 'LEAVE_QUEUE':
        handleLeaveQueue(client);
        break;
      case 'ACCEPT_MATCH':
        handleAcceptMatch(data.matchId, client, pendingMatches);
        break;
      case 'DECLINE_MATCH':
        handleDeclineMatch(data.matchId, client, pendingMatches);
        break;
      case 'CREATE_TOURNAMENT':
        void handleCreateTournament(data, client, clients);
        break;
      case 'JOIN_TOURNAMENT':
        void handleJoinTournament(data, client, clients);
        break;
      case 'LEAVE_TOURNAMENT':
        void handleLeaveTournament(client, clients);
        break;
      case 'FORFEIT_TOURNAMENT':
        void handleForfeitTournament(client, clients);
        break;
      case 'ACCEPT_SCHEDULED':
        void handleAcceptScheduled(data, client, clients);
        break;
      default:
        log('Unknown message', { type: (data as any).type ?? 'UNKNOWN' });
        client.socket.send(
          JSON.stringify({ type: 'ERROR', message: 'Unknown message from client' }),
        );
    }
  });

  socket.on('close', () => {
    log('Client disconnected', { id });

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

    handleClientDisconnectFromTournament(client, clients);
    for (const [matchId, match] of pendingMatches) {
      if (match.a.id === id || match.b.id === id) {
        handleDeclineMatch(matchId, client, pendingMatches);
        break;
      }
    }
    removeFromQueue(id);
    clients.delete(id);
    //removeFromTournamentLobby(id)
    //which broadcasts TOURNAMENT_LOBBY_UPDATE or something similar to clients in lobby
    //waiting for tournament to start
  });
}

app.addHook('onClose', async () => {
  clearInterval(queueTicker);
  clients.forEach((client) => {
    try {
      client.socket.close();
    } catch {
      // ignore close errors during shutdown
    }
  });
  clients.clear();
  clearQueue();
  pendingMatches.forEach((match) => {
    clearTimeout(match.timer);
  });
  pendingMatches.clear();

  inviteMatches.forEach((lobby) => {
    if (lobby.timer) clearTimeout(lobby.timer);
  });
  inviteMatches.clear();
  playerToInviteLobby.clear();

  try {
    await redisSub.quit();
  } catch (err) {
    log(
      'Failed to close redis connection',
      { error: err instanceof Error ? err.message : 'Unknown error' },
      'error',
    );
  }
});

try {
  await app.listen({ host: '0.0.0.0', port: PORT });
  log('Server started', { port: PORT });
} catch (err) {
  log('Server failed to start', { err }, 'error');
  process.exit(1);
}
