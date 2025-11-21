import axios from 'axios';
import jwt from 'jsonwebtoken';
import type {
  AcceptScheduledRequest,
  CreateTournamentRequest,
  JoinTournamentRequest,
  MatchmakingMessage,
  TournamentBracketSnapshotMessage,
  TournamentLobbyUpdatedMessage,
  TournamentMatchCountdownMessage,
  TournamentMatchCountdownStatus,
  TournamentMatchesReadyMessage,
} from '@pong/shared/protocol/net';
import { createMatch } from './queue.ts';
import { ClientState, type ClientInfo } from '../types/types.ts';
import { log } from '@utils/logger';
import {
  API_URL,
  MATCH_SECRET,
  TOURNAMENT_MATCH_AUTO_START_DELAY_MS,
  TOURNAMENT_MATCH_COUNTDOWN_INTERVAL_MS,
  TOURNAMENT_MAX_REMINDERS,
  TOURNAMENT_REMINDER_DELAY_MS,
} from './config.ts';
import * as Config from './config.ts';
import { setClientState } from './state.ts';
import {
  clearTournamentMembership,
  setTournamentMembership,
  syncTournamentMembershipSnapshot,
} from './tournamentMembershipRegistry.ts';
import { cancelInviteLobbyForPlayerUuid, TOURNAMENT_INVITE_BLOCK_REASON } from './invites.ts';

// Some tests partially mock the config module and may omit certain exports.
// Safely resolve absence auto-win delay with a sensible default to avoid
// Vitest "missing export" errors when the mock doesn't define it.
const ABSENCE_AUTO_WIN_MS: number =
  'TOURNAMENT_ABSENCE_AUTO_WIN_MS' in Config &&
  typeof (Config as any).TOURNAMENT_ABSENCE_AUTO_WIN_MS === 'number'
    ? (Config as any).TOURNAMENT_ABSENCE_AUTO_WIN_MS
    : 10_000;

const scheduledTournamentMatches = new Set<number>();

interface PendingTournamentMatch {
  tournamentId: number;
  match: TournamentMatchesReadyMessage['matches'][number];
  reminder?: NodeJS.Timeout;
  attempts: number;
  countdown?: {
    interval?: NodeJS.Timeout;
    execution?: NodeJS.Timeout;
    targetStartEpochMs: number;
    lastStatus?: TournamentMatchCountdownStatus;
    lastSecondsRemaining?: number;
  };
  absenceTimeout?: NodeJS.Timeout;
}

const pendingTournamentMatches = new Map<number, PendingTournamentMatch>();
const tournamentSubscribers = new Map<number, Set<string>>();

function createMatchServiceToken() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ service: 'matchmaking', iat: now, exp: now + 60 }, MATCH_SECRET);
}

function findClientByUuid(clients: Map<string, ClientInfo>, uuid: string) {
  for (const client of clients.values()) {
    if (client.uuid === uuid) return client;
  }
  return undefined;
}

function cancelInviteIfNeeded(client: ClientInfo, context: string) {
  if (cancelInviteLobbyForPlayerUuid(client.uuid, { reason: TOURNAMENT_INVITE_BLOCK_REASON })) {
    log('Cancelled invite lobby before tournament action', {
      uuid: client.uuid,
      context,
      tournamentId: client.tournamentId,
    });
  }
}

function trackClientTournamentMembership(client: ClientInfo, tournamentId: number) {
  if (!client.uuid) return;
  setTournamentMembership(client.uuid, {
    tournamentId,
    participantId: client.tournamentParticipantId,
  });
}

function clearClientTournamentMembership(client: ClientInfo) {
  if (!client.uuid) return;
  clearTournamentMembership(client.uuid);
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
  payload:
    | TournamentLobbyUpdatedMessage
    | TournamentBracketSnapshotMessage
    | TournamentMatchesReadyMessage
    | TournamentMatchCountdownMessage,
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
    pendingTournamentMatches.delete(match.tournamentMatchId);
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

function clearTournamentCountdown(pending: PendingTournamentMatch, remove = true) {
  const countdown = pending.countdown;
  if (!countdown) return;
  if (countdown.interval) {
    clearInterval(countdown.interval);
    countdown.interval = undefined;
  }
  if (countdown.execution) {
    clearTimeout(countdown.execution);
    countdown.execution = undefined;
  }
  if (remove) {
    pending.countdown = undefined;
  }
}

function clearAbsenceTimeout(pending: PendingTournamentMatch) {
  if (pending.absenceTimeout) {
    clearTimeout(pending.absenceTimeout);
    pending.absenceTimeout = undefined;
  }
}

async function autoForfeitParticipant(
  tournamentId: number,
  participantId: number,
  clients: Map<string, ClientInfo>,
) {
  const headers = { Authorization: `Bearer ${createMatchServiceToken()}` };
  try {
    log('Auto-forfeit participant due to absence', { tournamentId, participantId });
    await axios.post(
      `${API_URL}/api/tournaments/${tournamentId}/participants/${participantId}/auto-forfeit`,
      {},
      { headers },
    );
    await requestTournamentSync(tournamentId, clients, 'state_updated');
  } catch (error) {
    log(
      'Auto-forfeit API failed',
      { tournamentId, participantId, error: error instanceof Error ? error.message : 'unknown' },
      'warn',
    );
  }
}

function scheduleAbsenceAutoWin(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
  missingUserUuid: string,
) {
  clearAbsenceTimeout(pending);
  pending.absenceTimeout = setTimeout(async () => {
    const availability = evaluatePlayerAvailability(pending, clients);
    if (availability.ready) {
      log('Absence window ended: both players present, skipping auto-win', {
        tournamentId: pending.tournamentId,
        matchId: pending.match.tournamentMatchId,
      });
      return;
    }
    const stillMissing = availability.missing.includes(missingUserUuid);
    const presentCount = availability.clients.length;
    if (!stillMissing || presentCount !== 1) {
      log('Absence window ended: mismatch in presence state, skipping auto-win', {
        tournamentId: pending.tournamentId,
        matchId: pending.match.tournamentMatchId,
        missing: availability.missing,
        present: presentCount,
      });
      return;
    }
    const missingParticipant = pending.match.participants.find(
      (p) => p.userUuid === missingUserUuid,
    );
    if (!missingParticipant) {
      log('Absence window ended: missing participant not found', {
        tournamentId: pending.tournamentId,
        matchId: pending.match.tournamentMatchId,
      });
      return;
    }
    await autoForfeitParticipant(pending.tournamentId, missingParticipant.participantId, clients);
    clearTournamentCountdown(pending);
    clearAbsenceTimeout(pending);
    pendingTournamentMatches.delete(pending.match.tournamentMatchId);
  }, ABSENCE_AUTO_WIN_MS);

  log('Scheduled absence auto-win timer', {
    tournamentId: pending.tournamentId,
    matchId: pending.match.tournamentMatchId,
    delayMs: ABSENCE_AUTO_WIN_MS,
    missingUserUuid,
  });
}

function resolvePlayerClients(
  match: TournamentMatchesReadyMessage['matches'][number],
  clients: Map<string, ClientInfo>,
): Array<ClientInfo | undefined> {
  return match.participants.map((participant) => findClientByUuid(clients, participant.userUuid));
}

function evaluatePlayerAvailability(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
) {
  const resolved = resolvePlayerClients(pending.match, clients);
  const missing: string[] = [];
  const readyClients: ClientInfo[] = [];

  resolved.forEach((client, index) => {
    const participant = pending.match.participants[index]!;
    if (!client || client.tournamentId !== pending.tournamentId) {
      missing.push(participant.userUuid);
      return;
    }
    readyClients.push(client);
  });

  return {
    ready: missing.length === 0,
    missing,
    clients: readyClients,
  };
}

async function isAgainstForfeitedParticipant(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
): Promise<boolean> {
  // Find any authenticated tournament client to use their site token
  const tournamentClient = Array.from(clients.values()).find(
    (client) =>
      client.tournamentId === pending.tournamentId && client.authenticated && client.siteToken,
  );
  if (!tournamentClient) return false;
  const token = extractSiteToken(tournamentClient);
  if (!token) return false;
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const res = await axios.get(`${API_URL}/api/tournaments/${pending.tournamentId}/participants`, {
      headers,
    });
    const statuses = new Map<number, string>(
      (res.data as Array<{ id: number; status: string }>).map((p) => [p.id, p.status]),
    );
    return pending.match.participants.some((p) => statuses.get(p.participantId) === 'forfeited');
  } catch (error) {
    log(
      'Failed to check participant statuses when starting countdown',
      { tournamentId: pending.tournamentId, error },
      'warn',
    );
    return false;
  }
}

function countdownSecondsRemaining(targetStartEpochMs: number) {
  return Math.max(0, Math.ceil((targetStartEpochMs - Date.now()) / 1000));
}

function emitTournamentCountdown(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
  status: TournamentMatchCountdownStatus,
  secondsRemaining: number,
  options: { force?: boolean; reason?: 'offline' | 'forfeited' | 'stopped' } = {},
) {
  const countdown = pending.countdown;
  if (!countdown) return;

  if (!options.force) {
    if (countdown.lastStatus === status && countdown.lastSecondsRemaining === secondsRemaining) {
      return;
    }
  }

  countdown.lastStatus = status;
  countdown.lastSecondsRemaining = secondsRemaining;

  const payload: TournamentMatchCountdownMessage = {
    type: 'TOURNAMENT_MATCH_COUNTDOWN',
    tournamentId: pending.tournamentId,
    tournamentMatchId: pending.match.tournamentMatchId,
    stage: pending.match.stage,
    secondsRemaining,
    targetStartEpochMs: countdown.targetStartEpochMs,
    status,
    reason: options.reason,
  };

  broadcastToTournament(pending.tournamentId, clients, payload);

  const playerClients = resolvePlayerClients(pending.match, clients);
  for (const client of playerClients) {
    if (client) {
      sendToClient(client, payload);
    }
  }
}

function cancelTournamentCountdown(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
  reason: 'offline' | 'forfeited' | 'stopped' = 'offline',
) {
  if (!pending.countdown) return;
  const secondsRemaining = countdownSecondsRemaining(pending.countdown.targetStartEpochMs);
  emitTournamentCountdown(pending, clients, 'cancelled', secondsRemaining, {
    force: true,
    reason,
  });
  clearTournamentCountdown(pending);
  if (reason !== 'offline') clearAbsenceTimeout(pending);
  log('Cancelled tournament match countdown', {
    tournamentId: pending.tournamentId,
    matchId: pending.match.tournamentMatchId,
    reason,
  });
}

async function finalizeTournamentMatchLaunch(
  pending: PendingTournamentMatch,
  playerClients: ClientInfo[],
  clients: Map<string, ClientInfo>,
) {
  emitTournamentCountdown(pending, clients, 'started', 0, { force: true });
  clearTournamentCountdown(pending);
  clearAbsenceTimeout(pending);

  scheduledTournamentMatches.add(pending.match.tournamentMatchId);
  pendingTournamentMatches.delete(pending.match.tournamentMatchId);

  log('Launched tournament match after countdown', {
    tournamentId: pending.tournamentId,
    matchId: pending.match.tournamentMatchId,
  });

  await createMatch(playerClients[0]!, playerClients[1]!, 'tournament', {
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

function startTournamentCountdown(
  pending: PendingTournamentMatch,
  clients: Map<string, ClientInfo>,
) {
  if (pending.countdown) {
    emitTournamentCountdown(
      pending,
      clients,
      pending.countdown.lastStatus ?? 'running',
      pending.countdown.lastSecondsRemaining ??
        countdownSecondsRemaining(pending.countdown.targetStartEpochMs),
      { force: true },
    );
    return;
  }

  const targetStartEpochMs = Date.now() + TOURNAMENT_MATCH_AUTO_START_DELAY_MS;
  pending.countdown = {
    targetStartEpochMs,
    lastStatus: undefined,
    lastSecondsRemaining: undefined,
  };

  log('Started tournament match countdown', {
    tournamentId: pending.tournamentId,
    matchId: pending.match.tournamentMatchId,
    targetStartEpochMs,
  });

  emitTournamentCountdown(
    pending,
    clients,
    'running',
    countdownSecondsRemaining(targetStartEpochMs),
    {
      force: true,
    },
  );

  pending.countdown.interval = setInterval(() => {
    const availability = evaluatePlayerAvailability(pending, clients);
    if (!availability.ready) {
      cancelTournamentCountdown(pending, clients, 'offline');
      if (availability.missing.length === 1 && availability.clients.length === 1) {
        scheduleAbsenceAutoWin(pending, clients, availability.missing[0]!);
      }
      scheduleTournamentReminder(pending.match, pending.tournamentId, clients, pending.attempts);
      return;
    }

    emitTournamentCountdown(
      pending,
      clients,
      'running',
      countdownSecondsRemaining(pending.countdown!.targetStartEpochMs),
    );
  }, TOURNAMENT_MATCH_COUNTDOWN_INTERVAL_MS);

  pending.countdown.execution = setTimeout(async () => {
    const availability = evaluatePlayerAvailability(pending, clients);
    if (!availability.ready) {
      cancelTournamentCountdown(pending, clients, 'offline');
      if (availability.missing.length === 1 && availability.clients.length === 1) {
        scheduleAbsenceAutoWin(pending, clients, availability.missing[0]!);
      }
      scheduleTournamentReminder(pending.match, pending.tournamentId, clients, pending.attempts);
      return;
    }

    try {
      await finalizeTournamentMatchLaunch(pending, availability.clients, clients);
    } catch (error) {
      clearTournamentCountdown(pending);
      log(
        'Failed to launch tournament match after countdown',
        {
          tournamentId: pending.tournamentId,
          matchId: pending.match.tournamentMatchId,
          error: error instanceof Error ? error.message : 'unknown',
        },
        'warn',
      );
      scheduleTournamentReminder(pending.match, pending.tournamentId, clients, pending.attempts);
    }
  }, TOURNAMENT_MATCH_AUTO_START_DELAY_MS);
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
      attempts,
    } satisfies PendingTournamentMatch;
    pendingTournamentMatches.set(match.tournamentMatchId, pending);
  } else {
    pending.tournamentId = tournamentId;
    pending.match = match;
    pending.attempts = attempts;
    clearTournamentCountdown(pending);
  }

  const availability = evaluatePlayerAvailability(pending, clients);
  if (!availability.ready) {
    log(
      'Tournament match ready but player unavailable',
      {
        tournamentId,
        matchId: match.tournamentMatchId,
        missingPlayers: availability.missing,
      },
      'warn',
    );
    cancelTournamentCountdown(pending, clients, 'offline');
    if (availability.missing.length === 1 && availability.clients.length === 1) {
      scheduleAbsenceAutoWin(pending, clients, availability.missing[0]!);
    }
    scheduleTournamentReminder(match, tournamentId, clients, attempts);
    return;
  }

  const notification: TournamentMatchesReadyMessage = {
    type: 'TOURNAMENT_MATCHES_READY',
    tournamentId,
    matches: [match],
  };

  for (const client of availability.clients) {
    sendToClient(client, notification);
  }

  // Start countdown immediately to keep UX snappy; cancel if forfeited
  startTournamentCountdown(pending!, clients);

  // In parallel, check if any participant was forfeited and cancel countdown if so
  void (async () => {
    const hasForfeit = await isAgainstForfeitedParticipant(pending!, clients);
    if (!hasForfeit) return;
    cancelTournamentCountdown(pending!, clients, 'forfeited');
    log(
      'Skipping countdown for match with forfeited participant',
      { tournamentId, matchId: match.tournamentMatchId },
      'info',
    );
    // Ask for a tournament state sync to reflect any auto-resolved outcomes
    await requestTournamentSync(tournamentId, clients, 'state_updated');
  })();
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
  clients: Map<string, ClientInfo>,
) {
  for (const [matchId, pending] of pendingTournamentMatches) {
    if (pending.tournamentId !== tournamentId) continue;

    // Check if this player is part of the pending match
    const isPlayerInMatch = pending.match.participants.some(
      (participant) => participant.userUuid === client.uuid,
    );

    if (isPlayerInMatch) {
      log('Resending tournament match invitation to rejoined player', {
        tournamentId,
        matchId,
        playerUuid: client.uuid,
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

async function fetchTournamentState(tournamentId: number, token: string): Promise<TournamentState> {
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

      // Fetch match result if match is completed
      let team1Score: number | null = null;
      let team2Score: number | null = null;
      if (match.matchId && match.status === 'completed') {
        try {
          const matchRes = await axios.get(`${API_URL}/api/matches/${match.matchId}`, { headers });
          log('Fetched match score from API', { matchId: match.matchId, data: matchRes.data });
          const matchData = matchRes.data as { team1Score: number; team2Score: number };
          team1Score = matchData.team1Score;
          team2Score = matchData.team2Score;
          log('Parsed match scores', { matchId: match.matchId, team1Score, team2Score });
        } catch (error) {
          log('Failed to fetch match score', { matchId: match.matchId, error }, 'warn');
        }
      }

      const players = (playersRes.data as Array<{ participantId: number; teamNumber: number }>).map(
        (player) => {
          const participant = participantMap.get(player.participantId);
          return {
            participantId: player.participantId,
            teamNumber: player.teamNumber,
            alias: participant?.alias ?? 'Unknown',
            status: participant?.status ?? 'pending',
            score: player.teamNumber === 1 ? team1Score : team2Score,
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

    syncTournamentMembershipSnapshot(
      tournamentId,
      state.participants.map((participant) => ({
        userUuid: participant.userUuid,
        participantId: participant.id,
        status: participant.status,
      })),
    );
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

async function requestTournamentSync(
  tournamentId: number,
  clients: Map<string, ClientInfo>,
  reason: 'matches_ready' | 'state_updated',
) {
  const tournamentClient = Array.from(clients.values()).find(
    (client) => client.tournamentId === tournamentId && client.authenticated && client.siteToken,
  );

  if (!tournamentClient) {
    log('No tournament clients found for bracket sync', {
      tournamentId,
      reason,
      totalClients: clients.size,
      tournamentClients: Array.from(clients.values()).filter(
        (client) => client.tournamentId === tournamentId,
      ).length,
    });
    return;
  }

  log('Found tournament client for bracket sync', {
    tournamentId,
    clientUuid: tournamentClient.uuid,
    reason,
  });

  try {
    await syncTournamentState(tournamentId, tournamentClient, clients);
    log('Successfully synced tournament state', { tournamentId, reason });
  } catch (error) {
    log(
      'Failed to sync tournament state',
      {
        tournamentId,
        reason,
        error: error instanceof Error ? error.message : 'unknown',
      },
      'warn',
    );
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

  log('Handling tournament matches ready', {
    tournamentId: payload.tournamentId,
    matchCount: payload.matches.length,
  });

  // Handle individual match invitations
  for (const match of payload.matches) {
    handleSingleTournamentMatch(match, payload.tournamentId, clients);
  }

  // Sync tournament state to update bracket for all connected players
  // Find any authenticated client for this tournament to use their token
  await requestTournamentSync(payload.tournamentId, clients, 'matches_ready');
}

export async function handleTournamentStateUpdated(
  payload: { tournamentId: number },
  clients: Map<string, ClientInfo>,
) {
  if (!payload || typeof payload.tournamentId !== 'number') return;
  await requestTournamentSync(payload.tournamentId, clients, 'state_updated');
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
  const tournamentName = data.name?.trim().slice(0, 128) || 'Pong Tournament';

  cancelInviteIfNeeded(client, 'create_tournament');

  try {
    const activeRes = await axios.get(`${API_URL}/api/tournaments/my/active`, { headers });
    const activePayload = activeRes.data as null | {
      tournament: { id: number };
      participant: { id: number; alias: string };
    };

    if (activePayload) {
      client.tournamentId = activePayload.tournament.id;
      client.tournamentParticipantId = activePayload.participant.id;
      subscribeClientToTournament(activePayload.tournament.id, client);

      sendToClient(client, {
        type: 'ERROR',
        code: 'TOURNAMENT_LIMIT',
        message: 'You already have a tournament in progress',
      });

      await syncTournamentState(activePayload.tournament.id, client, clients);
      return;
    }

    client.tournamentId = undefined;
    client.tournamentParticipantId = undefined;

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

    const alias = client.username.slice(0, 64);
    const participantRes = await axios.post(
      `${API_URL}/api/tournaments/${tournamentId}/participants`,
      {
        alias,
        userUuid: client.uuid,
      },
      { headers },
    );

    const participant = (participantRes.data as { participant: { id: number; alias: string } })
      .participant;

    client.tournamentId = tournamentId;
    client.tournamentParticipantId = participant.id;
    subscribeClientToTournament(tournamentId, client);
    trackClientTournamentMembership(client, tournamentId);

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
  const alias = client.username.slice(0, 64);

  cancelInviteIfNeeded(client, 'join_tournament');

  try {
    const response = await axios.post(
      `${API_URL}/api/tournaments/${tournamentId}/participants`,
      {
        alias,
        userUuid: client.uuid,
      },
      { headers },
    );

    const participant = (response.data as { participant: { id: number; alias: string } })
      .participant;

    client.tournamentId = tournamentId;
    client.tournamentParticipantId = participant.id;
    subscribeClientToTournament(tournamentId, client);
    setClientState(client, ClientState.IN_TOURNAMENT, 'joined_tournament');
    trackClientTournamentMembership(client, tournamentId);

    await syncTournamentState(tournamentId, client, clients);

    // Check for any pending matches for this player who just rejoined
    checkPendingMatchesForPlayer(client, tournamentId, clients);
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to register for tournament');
  }
}

export async function handleLeaveTournament(client: ClientInfo, clients: Map<string, ClientInfo>) {
  if (!client.tournamentId || !client.tournamentParticipantId) {
    log('Leave tournament ignored: no active membership', {
      uuid: client.uuid,
      tournamentId: client.tournamentId,
      participantId: client.tournamentParticipantId,
    });
    return;
  }

  const tournamentId = client.tournamentId;
  const participantId = client.tournamentParticipantId;
  const token = extractSiteToken(client);
  if (!token) return;

  const headers = { Authorization: `Bearer ${token}` };

  try {
    log('Leave tournament requested', {
      uuid: client.uuid,
      tournamentId,
      participantId,
    });
    await axios.delete(`${API_URL}/api/tournaments/${tournamentId}/participants/${participantId}`, {
      headers,
    });

    log('Leave tournament API succeeded', {
      uuid: client.uuid,
      tournamentId,
      participantId,
    });

    // Cancel any pending countdowns involving this player; treat as forfeited for this match context
    for (const [matchId, pending] of pendingTournamentMatches.entries()) {
      if (pending.match.participants.some((p) => p.userUuid === client.uuid)) {
        if (pending.reminder) clearTimeout(pending.reminder);
        cancelTournamentCountdown(pending, clients, 'forfeited');
        pendingTournamentMatches.delete(matchId);
        log('Cancelled pending tournament match after player left tournament', {
          tournamentId,
          matchId,
          uuid: client.uuid,
        });
      }
    }

    await syncTournamentState(tournamentId, client, clients);

    unsubscribeClientFromTournament(tournamentId, client.id);
    client.tournamentId = undefined;
    client.tournamentParticipantId = undefined;
    setClientState(client, ClientState.IDLE, 'left_tournament');
    clearClientTournamentMembership(client);

    log('Tournament membership cleared', {
      uuid: client.uuid,
      tournamentId,
      participantId,
    });
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to leave tournament');
  }
}

export async function handleForfeitTournament(
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!client.tournamentId || !client.tournamentParticipantId) {
    log('Forfeit tournament ignored: no active membership', {
      uuid: client.uuid,
      tournamentId: client.tournamentId,
      participantId: client.tournamentParticipantId,
    });
    return;
  }

  const tournamentId = client.tournamentId;
  const participantId = client.tournamentParticipantId;
  const token = extractSiteToken(client);
  if (!token) return;

  const headers = { Authorization: `Bearer ${token}` };

  try {
    log('Forfeit tournament requested', {
      uuid: client.uuid,
      tournamentId,
      participantId,
    });
    await axios.patch(
      `${API_URL}/api/tournaments/${tournamentId}/participants/${participantId}`,
      { status: 'forfeited' },
      { headers },
    );

    log('Forfeit tournament API succeeded', {
      uuid: client.uuid,
      tournamentId,
      participantId,
    });

    for (const [matchId, pending] of pendingTournamentMatches.entries()) {
      if (pending.match.participants.some((participant) => participant.userUuid === client.uuid)) {
        if (pending.reminder) clearTimeout(pending.reminder);
        cancelTournamentCountdown(pending, clients, 'forfeited');
        pendingTournamentMatches.delete(matchId);
        log('Cancelled pending tournament match after forfeit', {
          tournamentId,
          matchId,
          uuid: client.uuid,
        });
      }
    }

    await syncTournamentState(tournamentId, client, clients);
    unsubscribeClientFromTournament(tournamentId, client.id);
    client.tournamentId = undefined;
    client.tournamentParticipantId = undefined;
    setClientState(client, ClientState.IDLE, 'left_tournament');
    clearClientTournamentMembership(client);
  } catch (error) {
    handleTournamentApiError(client, error, 'Failed to forfeit tournament');
  }
}

export function handleAcceptScheduled(
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

  log('Tournament player requested manual confirmation; countdown flow already active', {
    tournamentMatchId: data.tournamentMatchId,
    uuid: client.uuid,
    countdownActive: Boolean(pending.countdown),
  });

  handleSingleTournamentMatch(pending.match, pending.tournamentId, clients, pending.attempts);
}

export function handleClientDisconnectFromTournament(
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  log('Handling client disconnect from tournament context', {
    uuid: client.uuid,
    tournamentId: client.tournamentId,
    participantId: client.tournamentParticipantId,
  });

  if (client.tournamentId) {
    unsubscribeClientFromTournament(client.tournamentId, client.id);
    log('Unsubscribed client from tournament after disconnect', {
      uuid: client.uuid,
      tournamentId: client.tournamentId,
    });
  }

  for (const pending of pendingTournamentMatches.values()) {
    if (pending.match.participants.some((participant) => participant.userUuid === client.uuid)) {
      cancelTournamentCountdown(pending, clients, 'offline');
      if (pending.reminder) {
        clearTimeout(pending.reminder);
        pending.reminder = undefined;
      }
      scheduleTournamentReminder(pending.match, pending.tournamentId, clients, pending.attempts);
      log('Scheduled reminder after disconnecting tournament player', {
        tournamentId: pending.tournamentId,
        matchId: pending.match.tournamentMatchId,
        uuid: client.uuid,
      });
    }
  }
}

export async function restoreTournamentMembership(
  client: ClientInfo,
  clients: Map<string, ClientInfo>,
) {
  if (!client.authenticated) return;
  const token = extractSiteToken(client);
  if (!token) return;

  try {
    const response = await axios.get(`${API_URL}/api/tournaments/my/active`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const payload = response.data as null | {
      tournament: {
        id: number;
        status: string;
        maxParticipants: number | null;
      };
      participant: {
        id: number;
        alias: string;
        status: string;
      };
    };

    if (!payload) {
      log('Restore tournament membership: no active tournament found', {
        uuid: client.uuid,
      });
      return;
    }

    const { tournament, participant } = payload;

    cancelInviteIfNeeded(client, 'restore_tournament_membership');

    client.tournamentId = tournament.id;
    client.tournamentParticipantId = participant.id;

    setClientState(client, ClientState.IN_TOURNAMENT, 'restored_tournament_membership');
    subscribeClientToTournament(tournament.id, client);
    trackClientTournamentMembership(client, tournament.id);

    log('Restored active tournament membership for client', {
      uuid: client.uuid,
      tournamentId: tournament.id,
      participantId: participant.id,
      status: participant.status,
    });

    await syncTournamentState(tournament.id, client, clients);
    checkPendingMatchesForPlayer(client, tournament.id, clients);
  } catch (error) {
    log(
      'Failed to restore tournament membership',
      { uuid: client.uuid, error: error instanceof Error ? error.message : 'unknown' },
      'warn',
    );
  }
}
