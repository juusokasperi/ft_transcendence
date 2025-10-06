import axios from 'axios';
import type {
  AcceptScheduledRequest,
  CreateTournamentRequest,
  JoinTournamentRequest,
  MatchmakingMessage,
  TournamentBracketSnapshotMessage,
  TournamentLobbyUpdatedMessage,
  TournamentMatchesReadyMessage,
} from '@pong/shared/protocol/net';
import { createMatch } from './queue.ts';
import type { ClientInfo } from '../types/types.ts';
import { log } from './log.ts';
import { API_URL } from './config.ts';

const scheduledTournamentMatches = new Set<number>();

const TOURNAMENT_REMINDER_DELAY_MS = 5000;
const TOURNAMENT_MAX_REMINDERS = 3;

interface PendingTournamentMatch {
  tournamentId: number;
  match: TournamentMatchesReadyMessage['matches'][number];
  accepted: Set<string>;
  reminder?: NodeJS.Timeout;
  attempts: number;
}

const pendingTournamentMatches = new Map<number, PendingTournamentMatch>();
const tournamentSubscribers = new Map<number, Set<string>>();

function findClientByUuid(clients: Map<string, ClientInfo>, uuid: string) {
  for (const client of clients.values()) {
    if (client.uuid === uuid) return client;
  }
  return undefined;
}

function sendToClient(client: ClientInfo, payload: MatchmakingMessage) {
  try {
    client.socket.send(JSON.stringify(payload));
  } catch (error) {
    log('Failed to send tournament payload to client', { uuid: client.uuid, error }, 'warn');
  }
}

function getSubscriberSet(tournamentId: number) {
  let set = tournamentSubscribers.get(tournamentId);
  if (!set) {
    set = new Set<string>();
    tournamentSubscribers.set(tournamentId, set);
  }
  return set;
}

function subscribeClientToTournament(tournamentId: number, client: ClientInfo) {
  getSubscriberSet(tournamentId).add(client.id);
}

function unsubscribeClientFromTournament(tournamentId: number, clientId: string) {
  const set = tournamentSubscribers.get(tournamentId);
  if (!set) return;
  set.delete(clientId);
  if (!set.size) tournamentSubscribers.delete(tournamentId);
}

function broadcastToTournament(
  tournamentId: number,
  clients: Map<string, ClientInfo>,
  payload: TournamentLobbyUpdatedMessage | TournamentBracketSnapshotMessage | TournamentMatchesReadyMessage,
) {
  const subscribers = tournamentSubscribers.get(tournamentId);
  if (!subscribers || !subscribers.size) return;

  for (const clientId of [...subscribers]) {
    const client = clients.get(clientId);
    if (!client) {
      subscribers.delete(clientId);
      continue;
    }
    sendToClient(client, payload as MatchmakingMessage);
  }
}

function scheduleTournamentReminder(
  match: TournamentMatchesReadyMessage['matches'][number],
  tournamentId: number,
  clients: Map<string, ClientInfo>,
  attempts: number,
) {
  if (attempts >= TOURNAMENT_MAX_REMINDERS) {
    log(
      'Tournament match reminder exhausted',
      { tournamentId, matchId: match.tournamentMatchId },
      'warn',
    );
    const pending = pendingTournamentMatches.get(match.tournamentMatchId);
    if (pending && pending.reminder) {
      clearTimeout(pending.reminder);
      pending.reminder = undefined;
    }
    return;
  }

  const pending = pendingTournamentMatches.get(match.tournamentMatchId);
  if (!pending) return;
  if (pending.reminder) clearTimeout(pending.reminder);

  pending.reminder = setTimeout(() => {
    pending.reminder = undefined;
    handleSingleTournamentMatch(match, tournamentId, clients, attempts + 1);
  }, TOURNAMENT_REMINDER_DELAY_MS);

  pending.attempts = attempts;
  log('Queued tournament match reminder', {
    tournamentId,
    matchId: match.tournamentMatchId,
    attempts: attempts + 1,
  });
}

function handleSingleTournamentMatch(
  match: TournamentMatchesReadyMessage['matches'][number],
  tournamentId: number,
  clients: Map<string, ClientInfo>,
  attempts = 0,
) {
  if (scheduledTournamentMatches.has(match.tournamentMatchId)) return;
  if (match.participants.length !== 2) return;

  let pending = pendingTournamentMatches.get(match.tournamentMatchId);
  if (!pending) {
    pending = {
      tournamentId,
      match,
      accepted: new Set<string>(),
      attempts,
    } satisfies PendingTournamentMatch;
    pendingTournamentMatches.set(match.tournamentMatchId, pending);
  } else {
    pending.tournamentId = tournamentId;
    pending.match = match;
    pending.attempts = attempts;
    for (const acceptedUuid of [...pending.accepted]) {
      if (!match.participants.some((participant) => participant.userUuid === acceptedUuid)) {
        pending.accepted.delete(acceptedUuid);
      }
    }
  }

  const playerClients = match.participants.map((participant) =>
    findClientByUuid(clients, participant.userUuid),
  );

  if (playerClients.some((client) => !client)) {
    const missingPlayers = match.participants
      .map((participant, index) => ({ participant, client: playerClients[index] }))
      .filter((item) => !item.client)
      .map((item) => item.participant.userUuid);

    log(
      'Tournament match ready but player offline',
      { tournamentId, matchId: match.tournamentMatchId, missingPlayers },
      'warn',
    );
    scheduleTournamentReminder(match, tournamentId, clients, attempts);
    return;
  }

  if (playerClients.some((client) => client!.tournamentId !== tournamentId)) {
    log(
      'Tournament match players not assigned to this tournament',
      { tournamentId, matchId: match.tournamentMatchId },
      'warn',
    );
    scheduleTournamentReminder(match, tournamentId, clients, attempts);
    return;
  }

  const notification: TournamentMatchesReadyMessage = {
    type: 'TOURNAMENT_MATCHES_READY',
    tournamentId,
    matches: [match],
  };

  for (const client of playerClients) {
    sendToClient(client!, notification);
  }

  scheduleTournamentReminder(match, tournamentId, clients, attempts);
}

function extractSiteToken(client: ClientInfo) {
  if (!client.siteToken) {
    sendToClient(client, {
      type: 'ERROR',
      code: 'AUTH',
      message: 'Authentication required for tournaments',
    });
    return undefined;
  }
  return client.siteToken;
}

// Check for pending tournament matches for a specific player who just joined
function checkPendingMatchesForPlayer(
  client: ClientInfo, 
  tournamentId: number, 
  clients: Map<string, ClientInfo>
) {
  for (const [matchId, pending] of pendingTournamentMatches) {
    if (pending.tournamentId !== tournamentId) continue;
    
    // Check if this player is part of the pending match
    const isPlayerInMatch = pending.match.participants.some(
      participant => participant.userUuid === client.uuid
    );
    
    if (isPlayerInMatch) {
      log('Resending tournament match invitation to rejoined player', {
        tournamentId,
        matchId,
        playerUuid: client.uuid
      });
      
      // Retry the match with current clients
      handleSingleTournamentMatch(pending.match, tournamentId, clients, pending.attempts);
    }
  }
}

interface TournamentState {
  tournament: {
    id: number;
    status: string;
    maxParticipants: number | null;
  };
  participants: Array<{
    id: number;
    alias: string;
    seed: number | null;
    status: string;
    userUuid: string | null;
  }>;
  matches: TournamentBracketSnapshotMessage['matches'];
}

async function fetchTournamentState(
  tournamentId: number,
  token: string,
): Promise<TournamentState> {
  const headers = { Authorization: `Bearer ${token}` };
  const [tournamentRes, participantsRes, matchesRes] = await Promise.all([
    axios.get(`${API_URL}/api/tournaments/${tournamentId}`, { headers }),
    axios.get(`${API_URL}/api/tournaments/${tournamentId}/participants`, { headers }),
    axios.get(`${API_URL}/api/tournaments/${tournamentId}/matches`, { headers }),
  ]);

  const participants = participantsRes.data as Array<{
    id: number;
    alias: string;
    seed: number | null;
    status: string;
    userUuid: string | null;
  }>;
  const participantMap = new Map(participants.map((participant) => [participant.id, participant]));

  const rawMatches = matchesRes.data as Array<{
    id: number;
    roundNumber: number;
    roundPosition: number;
    status: string;
    scheduledAt: string | null;
    completedAt: string | null;
    matchId: number | null;
  }>;

  const matches = await Promise.all(
    rawMatches.map(async (match) => {
      const playersRes = await axios.get(
        `${API_URL}/api/tournaments/${tournamentId}/matches/${match.id}/players`,
        { headers },
      );
      const players = (playersRes.data as Array<{ participantId: number; teamNumber: number }>).map(
        (player) => {
          const participant = participantMap.get(player.participantId);
          return {
            participantId: player.participantId,
            teamNumber: player.teamNumber,
            alias: participant?.alias ?? 'Unknown',
            status: participant?.status ?? 'pending',
          };
        },
      );
      return {
        tournamentMatchId: match.id,
        roundNumber: match.roundNumber,
        roundPosition: match.roundPosition,
        status: match.status,
        scheduledAt: match.scheduledAt,
        completedAt: match.completedAt,
        matchId: match.matchId,
        players,
      };
    }),
  );

  return {
    tournament: tournamentRes.data as TournamentState['tournament'],
    participants,
    matches,
  };
}

async function syncTournamentState(
  tournamentId: number,
  authClient: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  const token = extractSiteToken(authClient);
  if (!token) return;

  try {
    const state = await fetchTournamentState(tournamentId, token);

    const lobbyMessage: TournamentLobbyUpdatedMessage = {
      type: 'TOURNAMENT_LOBBY_UPDATED',
      tournamentId,
      status: state.tournament.status,
      maxParticipants: state.tournament.maxParticipants,
      participants: state.participants.map((participant) => ({
        participantId: participant.id,
        alias: participant.alias,
        userUuid: participant.userUuid,
        seed: participant.seed,
        status: participant.status,
      })),
    };
    broadcastToTournament(tournamentId, clients, lobbyMessage);

    const bracketMessage: TournamentBracketSnapshotMessage = {
      type: 'TOURNAMENT_BRACKET_SNAPSHOT',
      tournamentId,
      matches: state.matches,
    };
    broadcastToTournament(tournamentId, clients, bracketMessage);
  } catch (error) {
    log(
      'Failed to sync tournament state',
      { tournamentId, error: error instanceof Error ? error.message : 'unknown' },
      'warn',
    );
    sendToClient(authClient, {
      type: 'ERROR',
      code: 'TOURNAMENT_API',
      message: 'Failed to refresh tournament state',
    });
  }
}

function handleTournamentApiError(client: ClientInfo, error: unknown, fallbackMessage: string) {
  const details =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { status?: number; data?: unknown } }).response
      : undefined;
  const serverMessage = (() => {
    const data = details?.data;
    if (!data) return undefined;
    if (typeof data === 'string' && data.trim().length) return data;
    if (typeof data === 'object' && 'message' in (data as Record<string, unknown>)) {
      const value = (data as Record<string, unknown>).message;
      if (typeof value === 'string' && value.trim().length) return value;
    }
    return undefined;
  })();
  log(
    'Tournament API request failed',
    {
      uuid: client.uuid,
      status: details?.status,
      data: details?.data,
      message: error instanceof Error ? error.message : undefined,
    },
    'warn',
  );
  sendToClient(client, {
    type: 'ERROR',
    code: 'TOURNAMENT_API',
    message: serverMessage ?? fallbackMessage,
  });
}

export async function handleTournamentMatchesReady(
  payload: TournamentMatchesReadyMessage,
  clients: Map<string, ClientInfo>,
) {
  if (!payload || !Array.isArray(payload.matches)) return;
  
  log('Handling tournament matches ready', { tournamentId: payload.tournamentId, matchCount: payload.matches.length });
  
  // Handle individual match invitations
  for (const match of payload.matches) {
    handleSingleTournamentMatch(match, payload.tournamentId, clients);
  }
  
  // Sync tournament state to update bracket for all connected players
  // Find any authenticated client for this tournament to use their token
  const tournamentClient = Array.from(clients.values()).find(
    client => client.tournamentId === payload.tournamentId && client.authenticated && client.siteToken
  );
  
  if (tournamentClient) {
    log('Found tournament client for bracket sync', { tournamentId: payload.tournamentId, clientUuid: tournamentClient.uuid });
    try {
      await syncTournamentState(payload.tournamentId, tournamentClient, clients);
      log('Successfully synced tournament state after matches ready', { tournamentId: payload.tournamentId });
    } catch (error) {
      log(
        'Failed to sync tournament state after matches ready',
        { 
          tournamentId: payload.tournamentId, 
          error: error instanceof Error ? error.message : 'unknown' 
        },
        'warn',
      );
    }
  } else {
    log('No tournament clients found for bracket sync', { 
      tournamentId: payload.tournamentId, 
      totalClients: clients.size,
      tournamentClients: Array.from(clients.values()).filter(c => c.tournamentId === payload.tournamentId).length
    });
  }
}

export async function handleCreateTournament(
  data: CreateTournamentRequest,
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!client.authenticated) {
    sendToClient(client, {
      type: 'ERROR',
      code: 'AUTH',
      message: 'You must be signed in to create tournaments',
    });
    return;
  }

  const token = extractSiteToken(client);
  if (!token) return;

  const headers = { Authorization: `Bearer ${token}` };
  const maxParticipants = data.size ?? 4;
  const tournamentName = data.name?.trim().slice(0, 128) || 'Ping Pong Cup';

  try {
    const tournamentRes = await axios.post(
      `${API_URL}/api/tournaments`,
      {
        name: tournamentName,
        maxParticipants,
        format: 'single_elimination',
      },
      { headers },
    );

    const tournamentId = (tournamentRes.data as { id: number }).id;

    const alias = client.username;
    const participantRes = await axios.post(
      `${API_URL}/api/tournaments/${tournamentId}/participants`,
      {
        alias,
        userUuid: client.uuid,
      },
      { headers },
    );

    const participant = (participantRes.data as { participant: { id: number; alias: string } }).participant;

    client.tournamentId = tournamentId;
    client.tournamentParticipantId = participant.id;
    client.tournamentAlias = participant.alias;
    subscribeClientToTournament(tournamentId, client);

    await syncTournamentState(tournamentId, client, clients);
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to create tournament');
  }
}

export async function handleJoinTournament(
  data: JoinTournamentRequest,
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!client.authenticated) {
    sendToClient(client, {
      type: 'ERROR',
      code: 'AUTH',
      message: 'You must be signed in to join tournaments',
    });
    return;
  }

  const tournamentId = Number(data.tournamentId);
  if (!Number.isFinite(tournamentId) || tournamentId <= 0) {
    sendToClient(client, {
      type: 'ERROR',
      code: 'TOURNAMENT_INVALID',
      message: 'Tournament identifier is invalid',
    });
    return;
  }

  const token = extractSiteToken(client);
  if (!token) return;

  const headers = { Authorization: `Bearer ${token}` };
  const alias = (data.alias?.trim() || client.username).slice(0, 64);

  try {
    const response = await axios.post(
      `${API_URL}/api/tournaments/${tournamentId}/participants`,
      {
        alias,
        userUuid: client.uuid,
      },
      { headers },
    );

    const participant = (response.data as { participant: { id: number; alias: string } }).participant;

    client.tournamentId = tournamentId;
    client.tournamentParticipantId = participant.id;
    client.tournamentAlias = participant.alias;
    subscribeClientToTournament(tournamentId, client);

    await syncTournamentState(tournamentId, client, clients);
    
    // Check for any pending matches for this player who just rejoined
    checkPendingMatchesForPlayer(client, tournamentId, clients);
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to register for tournament');
  }
}

export async function handleLeaveTournament(
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!client.tournamentId || !client.tournamentParticipantId) return;

  const tournamentId = client.tournamentId;
  const participantId = client.tournamentParticipantId;
  const token = extractSiteToken(client);
  if (!token) return;

  const headers = { Authorization: `Bearer ${token}` };

  try {
    await axios.delete(
      `${API_URL}/api/tournaments/${tournamentId}/participants/${participantId}`,
      { headers },
    );

    await syncTournamentState(tournamentId, client, clients);

    unsubscribeClientFromTournament(tournamentId, client.id);
    client.tournamentId = undefined;
    client.tournamentParticipantId = undefined;
    client.tournamentAlias = undefined;
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to leave tournament');
  }
}

export async function handleForfeitTournament(
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!client.tournamentId || !client.tournamentParticipantId) return;

  const tournamentId = client.tournamentId;
  const participantId = client.tournamentParticipantId;
  const token = extractSiteToken(client);
  if (!token) return;

  const headers = { Authorization: `Bearer ${token}` };

  try {
    await axios.patch(
      `${API_URL}/api/tournaments/${tournamentId}/participants/${participantId}`,
      { status: 'forfeited' },
      { headers },
    );

    for (const [matchId, pending] of pendingTournamentMatches.entries()) {
      if (pending.match.participants.some((participant) => participant.userUuid === client.uuid)) {
        if (pending.reminder) clearTimeout(pending.reminder);
        pendingTournamentMatches.delete(matchId);
      }
    }

    await syncTournamentState(tournamentId, client, clients);
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to forfeit tournament');
  }
}

export async function handleAcceptScheduled(
  data: AcceptScheduledRequest,
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  const pending = pendingTournamentMatches.get(data.tournamentMatchId);
  if (!pending) {
    log('Accept scheduled ignored: no pending match', {
      tournamentMatchId: data.tournamentMatchId,
      uuid: client.uuid,
    });
    return;
  }

  if (!pending.match.participants.some((participant) => participant.userUuid === client.uuid)) {
    log('Accept scheduled ignored: client not part of match', {
      tournamentMatchId: data.tournamentMatchId,
      uuid: client.uuid,
    });
    return;
  }

  pending.accepted.add(client.uuid);
  log('Tournament player accepted directed match', {
    tournamentMatchId: data.tournamentMatchId,
    uuid: client.uuid,
    acceptedCount: pending.accepted.size,
  });

  if (pending.match.participants.every((participant) => pending.accepted.has(participant.userUuid))) {
    if (pending.reminder) {
      clearTimeout(pending.reminder);
      pending.reminder = undefined;
    }

    const opponents = pending.match.participants.map((participant) =>
      findClientByUuid(clients, participant.userUuid),
    );

    if (opponents.some((opponent) => !opponent)) {
      pending.accepted.clear();
      scheduleTournamentReminder(pending.match, pending.tournamentId, clients, pending.attempts);
      return;
    }

    scheduledTournamentMatches.add(pending.match.tournamentMatchId);
    pendingTournamentMatches.delete(pending.match.tournamentMatchId);

    await createMatch(opponents[0]!, opponents[1]!, 'tournament', {
      tournament: {
        tournamentId: pending.tournamentId,
        tournamentMatchId: pending.match.tournamentMatchId,
        tournamentStage: pending.match.stage,
        participants: pending.match.participants.map((participant) => ({
          participantId: participant.participantId,
          userUuid: participant.userUuid,
          alias: participant.alias,
        })),
      },
    });
  }
}

export function handleClientDisconnectFromTournament(client: ClientInfo) {
  if (client.tournamentId) {
    unsubscribeClientFromTournament(client.tournamentId, client.id);
  }

  for (const pending of pendingTournamentMatches.values()) {
    pending.accepted.delete(client.uuid);
  }
}
