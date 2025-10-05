import { createMatch } from './queue.ts';
import type { ClientInfo } from '../types/types.ts';
import type {
  CreateTournamentRequest,
  JoinTournamentRequest,
  TournamentMatchesReadyMessage,
} from '@pong/shared/protocol/net';
import { log } from './log.ts';

const scheduledTournamentMatches = new Set<number>();
const pendingTournamentReminders = new Map<number, { attempts: number; timeout: NodeJS.Timeout }>();
const TOURNAMENT_REMINDER_DELAY_MS = 5000;
const TOURNAMENT_MAX_REMINDERS = 3;

function findClientByUuid(clients: Map<string, ClientInfo>, uuid: string) {
  for (const client of clients.values()) {
    if (client.uuid === uuid) return client;
  }
  return undefined;
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
    return;
  }

  const existing = pendingTournamentReminders.get(match.tournamentMatchId);
  if (existing) clearTimeout(existing.timeout);

  const timeout = setTimeout(() => {
    pendingTournamentReminders.delete(match.tournamentMatchId);
    handleSingleTournamentMatch(match, tournamentId, clients, attempts + 1);
  }, TOURNAMENT_REMINDER_DELAY_MS);

  pendingTournamentReminders.set(match.tournamentMatchId, { attempts: attempts + 1, timeout });
  log(
    'Queued tournament match reminder',
    { tournamentId, matchId: match.tournamentMatchId, attempts: attempts + 1 },
  );
}

function handleSingleTournamentMatch(
  match: TournamentMatchesReadyMessage['matches'][number],
  tournamentId: number,
  clients: Map<string, ClientInfo>,
  attempts = 0,
) {
  if (scheduledTournamentMatches.has(match.tournamentMatchId)) return;
  if (match.participants.length !== 2) return;

  const p1 = match.participants[0]!;
  const p2 = match.participants[1]!;
  const clientA = findClientByUuid(clients, p1.userUuid);
  const clientB = findClientByUuid(clients, p2.userUuid);

  if (!clientA || !clientB) {
    log(
      'Tournament match ready but player offline',
      {
        tournamentId,
        matchId: match.tournamentMatchId,
        missingPlayers: [p1.userUuid, p2.userUuid].filter((uuid) => {
          const client = uuid === p1.userUuid ? clientA : clientB;
          return !client;
        }),
      },
      'warn',
    );
    scheduleTournamentReminder(match, tournamentId, clients, attempts);
    return;
  }

  if (
    clientA.tournamentId !== String(tournamentId) ||
    clientB.tournamentId !== String(tournamentId)
  ) {
    log(
      'Tournament match players not assigned to this tournament',
      { tournamentId, matchId: match.tournamentMatchId },
      'warn',
    );
    scheduleTournamentReminder(match, tournamentId, clients, attempts);
    return;
  }

  const pending = pendingTournamentReminders.get(match.tournamentMatchId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingTournamentReminders.delete(match.tournamentMatchId);
  }

  scheduledTournamentMatches.add(match.tournamentMatchId);
  log('Scheduling tournament match', {
    tournamentId,
    matchId: match.tournamentMatchId,
    players: [clientA.uuid, clientB.uuid],
  });
  createMatch(clientA, clientB, 'tournament', {
    tournament: {
      tournamentId,
      tournamentMatchId: match.tournamentMatchId,
      tournamentStage: match.stage,
    },
  });
}

export function handleTournamentMatchesReady(
  payload: TournamentMatchesReadyMessage,
  clients: Map<string, ClientInfo>,
) {
  if (!payload || !Array.isArray(payload.matches)) return;
  for (const match of payload.matches) {
    handleSingleTournamentMatch(match, payload.tournamentId, clients);
  }
}

export async function handleCreateTournament(data: CreateTournamentRequest, client: ClientInfo) {
  // TODO: integrate with backend when tournament creation is exposed
  log('CREATE_TOURNAMENT not implemented yet', { client: client.uuid, data }, 'warn');
}

export async function handleJoinTournament(data: JoinTournamentRequest, client: ClientInfo) {
  client.tournamentId = data.tournamentId;
  log('Client joined tournament lobby', { tournamentId: data.tournamentId, uuid: client.uuid });
}

export async function handleLeaveTournament(client: ClientInfo) {
  if (!client.tournamentId) return;
  log('Client left tournament lobby', { tournamentId: client.tournamentId, uuid: client.uuid });
  client.tournamentId = undefined;
}

export async function handleForfeitTournament(client: ClientInfo) {
  if (!client.tournamentId) return;
  log('Client forfeited tournament', { tournamentId: client.tournamentId, uuid: client.uuid }, 'warn');
  client.tournamentId = undefined;
}

export async function handleAcceptScheduled(client: ClientInfo) {
  // TODO: implement accept flow for scheduled matches
  log('ACCEPT_SCHEDULED not implemented yet', { uuid: client.uuid }, 'warn');
}
