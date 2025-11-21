import type { Tournament, TournamentParticipant } from '../types/types.ts';
import {
  listTournamentParticipants,
  listTournamentParticipantsByUser,
  removeTournamentParticipant,
  updateTournamentParticipant,
} from '../db/queries/tournamentParticipants.ts';
import {
  listTournamentMatchPlayers,
  listTournamentMatches,
} from '../db/queries/tournamentMatches.ts';
import { updateTournamentStatus } from '../db/queries/tournaments.ts';
import {
  checkAndAutoCompleteTournament,
  forfeitParticipantInTournament,
} from './tournamentOrchestrator.ts';
import { notifyMatchesReady, notifyTournamentStateUpdated } from './matchmakingBridge.ts';
import { getTournamentById } from '../db/queries/tournaments.ts';
import { logger } from '@utils/logger';

const TERMINAL_STATUSES = new Set(['champion', 'silver', 'third_place', 'eliminated']);

export type ParticipantDepartureResult =
  | {
      success: true;
      readyMatches: number[];
      action: 'removed' | 'unlinked' | 'forfeited';
      tournamentCancelled: boolean;
    }
  | {
      success: false;
      reason: 'remove_failed' | 'unlink_failed' | 'forfeit_failed';
    };

function computeTournamentCancellationState(
  tournament: Tournament,
  participant: TournamentParticipant,
): { wasOnlyParticipant: boolean; hasCompletedMatches: boolean } {
  const participantsBefore = listTournamentParticipants(tournament.id);
  const wasOnlyParticipant =
    participantsBefore.length === 1 && participantsBefore[0]?.id === participant.id;
  const tournamentMatches = wasOnlyParticipant ? listTournamentMatches(tournament.id) : [];
  const hasCompletedMatches = tournamentMatches.some(
    (match) => match.completedAt !== null || match.status === 'completed',
  );

  return { wasOnlyParticipant, hasCompletedMatches };
}

function participantInOpenMatch(tournamentId: number, participantId: number): boolean {
  const openMatches = listTournamentMatches(tournamentId).filter(
    (match) => match.status !== 'completed',
  );

  return openMatches.some((match) =>
    listTournamentMatchPlayers(match.id).some((player) => player.participantId === participantId),
  );
}

/**
 * Apply the same departure rules used by the participant removal API so that other
 * flows (such as account deletion) can reuse the behavior.
 */
export function processParticipantDeparture(
  tournament: Tournament,
  participant: TournamentParticipant,
): ParticipantDepartureResult {
  const departureState = computeTournamentCancellationState(tournament, participant);
  const readyMatches: number[] = [];
  let action: 'removed' | 'unlinked' | 'forfeited' = 'removed';

  if (tournament.status === 'active' || tournament.status === 'completed') {
    const hasTerminalPlacement = TERMINAL_STATUSES.has(participant.status);
    const involvedInOpenMatch = participantInOpenMatch(tournament.id, participant.id);

    if (hasTerminalPlacement || !involvedInOpenMatch) {
      const unlinked = updateTournamentParticipant(participant.id, { userUuid: null });
      if (!unlinked) return { success: false, reason: 'unlink_failed' };
      action = 'unlinked';
    } else {
      const forfeited = updateTournamentParticipant(participant.id, { status: 'forfeited' });
      if (!forfeited) return { success: false, reason: 'forfeit_failed' };
      const progression = forfeitParticipantInTournament(tournament.id, participant.id);
      readyMatches.push(...progression.readyMatches);
      action = 'forfeited';
    }
  } else {
    const removed = removeTournamentParticipant(participant.id);
    if (!removed) return { success: false, reason: 'remove_failed' };
    action = 'removed';
  }

  let tournamentCancelled = false;
  if (departureState.wasOnlyParticipant && !departureState.hasCompletedMatches) {
    const cancelled = updateTournamentStatus(tournament.id, 'cancelled');
    if (cancelled) tournamentCancelled = true;
  } else {
    checkAndAutoCompleteTournament(tournament.id);
  }

  return { success: true, readyMatches, action, tournamentCancelled };
}

/**
 * When a user permanently deletes their account, ensure any lingering tournament
 * participation is resolved so brackets do not get stuck on ghost participants.
 */
export async function cleanupTournamentParticipationForUser(userUuid: string) {
  const participants = listTournamentParticipantsByUser(userUuid);
  if (!participants.length) return;

  const readyMatchesByTournament = new Map<number, number[]>();
  const tournamentsNeedingState = new Set<number>();

  for (const participant of participants) {
    const tournament = getTournamentById(participant.tournamentId);
    if (!tournament) {
      removeTournamentParticipant(participant.id);
      continue;
    }

    const result = processParticipantDeparture(tournament, participant);
    if (!result.success) {
      logger.error(
        {
          tournamentId: tournament.id,
          participantId: participant.id,
          reason: result.reason,
        },
        '[Tournament] Failed to process participant departure during account deletion',
      );
      continue;
    }

    tournamentsNeedingState.add(tournament.id);
    if (result.readyMatches.length) {
      const existing = readyMatchesByTournament.get(tournament.id) ?? [];
      existing.push(...result.readyMatches);
      readyMatchesByTournament.set(tournament.id, existing);
    }
  }

  for (const [tournamentId, readyMatches] of readyMatchesByTournament) {
    await notifyMatchesReady(tournamentId, readyMatches);
  }

  for (const tournamentId of tournamentsNeedingState) {
    await notifyTournamentStateUpdated(tournamentId);
  }
}
