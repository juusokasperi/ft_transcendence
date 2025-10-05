import { createMatch } from './queue.ts';
import type { ClientInfo } from '../types/types.ts';
import type { CreateTournamentRequest, JoinTournamentRequest } from '@pong/shared/protocol/net';
import { log } from './log.ts';

const scheduledTournamentMatches = new Set<number>();

export interface TournamentMatchesReadyMessage {
  tournamentId: number;
  matches: Array<{
    tournamentMatchId: number;
    stage: string;
    participants: Array<{
      userUuid: string;
      alias: string;
      participantId: number;
      teamNumber: number;
    }>;
  }>;
}

function findClientByUuid(clients: Map<string, ClientInfo>, uuid: string) {
  for (const client of clients.values()) {
    if (client.uuid === uuid) return client;
  }
  return undefined;
}

export function handleTournamentMatchesReady(
  payload: TournamentMatchesReadyMessage,
  clients: Map<string, ClientInfo>,
) {
  if (!payload || !Array.isArray(payload.matches)) return;
  for (const match of payload.matches) {
    if (scheduledTournamentMatches.has(match.tournamentMatchId)) continue;
    if (match.participants.length !== 2) continue;

    const p1 = match.participants[0]!;
    const p2 = match.participants[1]!;
    const clientA = findClientByUuid(clients, p1.userUuid);
    const clientB = findClientByUuid(clients, p2.userUuid);

    if (!clientA || !clientB) {
      log('Tournament match ready but player offline', {
        tournamentId: payload.tournamentId,
        matchId: match.tournamentMatchId,
        missingPlayers: [p1.userUuid, p2.userUuid].filter((uuid) => {
          const client = uuid === p1.userUuid ? clientA : clientB;
          return !client;
        }),
      }, 'warn');
      continue;
    }

    if (clientA.tournamentId !== String(payload.tournamentId) || clientB.tournamentId !== String(payload.tournamentId)) {
      log('Tournament match players not assigned to this tournament', {
        tournamentId: payload.tournamentId,
        matchId: match.tournamentMatchId,
      }, 'warn');
      continue;
    }

    scheduledTournamentMatches.add(match.tournamentMatchId);
    log('Scheduling tournament match', {
      tournamentId: payload.tournamentId,
      matchId: match.tournamentMatchId,
      players: [clientA.uuid, clientB.uuid],
    });
    createMatch(clientA, clientB, 'tournament');
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
