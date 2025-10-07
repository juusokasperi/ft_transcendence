import db from '../db/client.ts';
import {
  listTournamentParticipants,
  updateTournamentParticipant,
} from '../db/queries/tournamentParticipants.ts';
import {
  addTournamentMatchPlayer,
  createTournamentMatch,
  listTournamentMatches,
  listTournamentMatchPlayers,
  getTournamentMatchByRoundAndPosition,
  setTournamentMatchPlayer,
  getTournamentMatchById,
  updateTournamentMatchStatus,
} from '../db/queries/tournamentMatches.ts';
import { markTournamentCompleted, updateTournamentStatus } from '../db/queries/tournaments.ts';
import type { TournamentParticipant } from '../types/types.ts';
import { getMatchById } from '../db/queries/matches.ts';

const REQUIRED_PARTICIPANTS = 4;

export type BracketGenerationSummary = {
  tournamentId: number;
  participantCount: number;
  bracketSize: number;
  totalRounds: number;
  createdMatches: number;
  assignedParticipants: number;
  readyMatches: number[];
  autoAdvancedMatches: number[];
  skippedReason?: 'awaitingParticipants' | 'matchesAlreadyExist';
};

function sortParticipantsForBracket(
  participants: TournamentParticipant[],
): TournamentParticipant[] {
  const withMeta = participants.map((participant, index) => ({
    participant,
    joinOrder: index,
    seed: participant.seed,
  }));

  withMeta.sort((a, b) => {
    const aSeed = a.seed;
    const bSeed = b.seed;

    const aHasSeed = aSeed !== null && aSeed !== undefined;
    const bHasSeed = bSeed !== null && bSeed !== undefined;

    if (aHasSeed && bHasSeed) {
      if (aSeed! !== bSeed!) return aSeed! - bSeed!;
      return a.joinOrder - b.joinOrder;
    }
    if (aHasSeed) return -1;
    if (bHasSeed) return 1;
    return a.joinOrder - b.joinOrder;
  });

  return withMeta.map((item) => item.participant);
}

// Call this after registration closes to lock in the bracket.
export function generateSingleEliminationBracket(tournamentId: number): BracketGenerationSummary {
  const participants = sortParticipantsForBracket(listTournamentParticipants(tournamentId));
  const participantCount = participants.length;

  if (participantCount < REQUIRED_PARTICIPANTS) {
    return {
      tournamentId,
      participantCount,
      bracketSize: REQUIRED_PARTICIPANTS,
      totalRounds: 2,
      createdMatches: 0,
      assignedParticipants: 0,
      readyMatches: [],
      autoAdvancedMatches: [],
      skippedReason: 'awaitingParticipants',
    };
  }

  const existingMatches = listTournamentMatches(tournamentId);
  if (existingMatches.length > 0) {
    return {
      tournamentId,
      participantCount: REQUIRED_PARTICIPANTS,
      bracketSize: REQUIRED_PARTICIPANTS,
      totalRounds: 2,
      createdMatches: 0,
      assignedParticipants: 0,
      readyMatches: [],
      autoAdvancedMatches: [],
      skippedReason: 'matchesAlreadyExist',
    };
  }

  const seeded: Array<TournamentParticipant | undefined> = participants.slice(
    0,
    REQUIRED_PARTICIPANTS,
  );
  while (seeded.length < REQUIRED_PARTICIPANTS) seeded.push(undefined);

  const matchIds: Record<'semifinal1' | 'semifinal2' | 'final' | 'bronze', number> = {
    semifinal1: 0,
    semifinal2: 0,
    final: 0,
    bronze: 0,
  };
  const readyMatches: number[] = [];
  const autoAdvancedMatches: number[] = [];
  let createdMatches = 0;
  let assignedParticipants = 0;

  const result = db.transaction(() => {
    const matchDefinitions = [
      { key: 'semifinal1', roundNumber: 1, roundPosition: 1, slots: [0, 3] as const },
      { key: 'semifinal2', roundNumber: 1, roundPosition: 2, slots: [1, 2] as const },
      { key: 'final', roundNumber: 2, roundPosition: 1, slots: null },
      { key: 'bronze', roundNumber: 2, roundPosition: 2, slots: null },
    ] as const;

    const participantLookup: Record<
      'semifinal1' | 'semifinal2',
      (TournamentParticipant | undefined)[]
    > = {
      semifinal1: [],
      semifinal2: [],
    };

    for (const def of matchDefinitions) {
      const match = createTournamentMatch({
        tournamentId,
        roundNumber: def.roundNumber,
        roundPosition: def.roundPosition,
      });
      if (!match) throw new Error('Failed to create tournament match');
      matchIds[def.key] = match.id;
      createdMatches += 1;

      if (def.slots) {
        def.slots.forEach((slotIndex, teamIdx) => {
          const participant = seeded[slotIndex];
          participantLookup[def.key].push(participant);
          if (!participant) return;
          const assignment = addTournamentMatchPlayer(match.id, participant.id, teamIdx + 1);
          if (!assignment) throw new Error('Failed to assign participant to match slot');
          assignedParticipants += 1;
        });
      }
    }

    const finalizeSemifinal = (key: 'semifinal1' | 'semifinal2', finalTeam: 1 | 2) => {
      const matchId = matchIds[key];
      const players = participantLookup[key];
      const defined = players.filter((p): p is TournamentParticipant => Boolean(p));

      if (defined.length === 2) {
        const updated = updateTournamentMatchStatus(matchId, 'ready');
        if (updated) readyMatches.push(matchId);
      } else if (defined.length === 1) {
        const winner = defined[0]!;
        autoAdvancedMatches.push(matchId);
        updateTournamentMatchStatus(matchId, 'completed', { setCompletedAt: true });
        setTournamentMatchPlayer(matchIds.final, winner.id, finalTeam);
      }
    };

    finalizeSemifinal('semifinal1', 1);
    finalizeSemifinal('semifinal2', 2);

    const finalAssignments = listTournamentMatchPlayers(matchIds.final);
    if (finalAssignments.length === 2) {
      const updated = updateTournamentMatchStatus(matchIds.final, 'ready');
      if (updated) readyMatches.push(matchIds.final);
    }

    const bronzeAssignments = listTournamentMatchPlayers(matchIds.bronze);
    if (bronzeAssignments.length === 2) {
      const updated = updateTournamentMatchStatus(matchIds.bronze, 'ready');
      if (updated) readyMatches.push(matchIds.bronze);
    }

    return {
      tournamentId,
      participantCount: REQUIRED_PARTICIPANTS,
      bracketSize: REQUIRED_PARTICIPANTS,
      totalRounds: 2,
      createdMatches,
      assignedParticipants,
      readyMatches,
      autoAdvancedMatches,
    } satisfies BracketGenerationSummary;
  })();

  return result;
}

export type MatchProgression = {
  readyMatches: number[];
  autoAdvancedMatches: number[];
};

export function processSemifinalResult(
  tournamentMatchId: number,
  options?: {
    autoAdvanceOnDraw?: boolean;
    manualResult?: { winnerParticipantId: number; loserParticipantId: number };
  },
): MatchProgression | undefined {
  const tournamentMatch = getTournamentMatchById(tournamentMatchId);
  if (!tournamentMatch) return undefined;
  if (tournamentMatch.roundNumber !== 1) return { readyMatches: [], autoAdvancedMatches: [] };

  const participants = listTournamentMatchPlayers(tournamentMatchId);
  const team1 = participants.find((p) => p.teamNumber === 1);
  const team2 = participants.find((p) => p.teamNumber === 2);
  if (!team1 || !team2) return undefined;

  let winner: number | undefined;
  let loser: number | undefined;

  if (options?.manualResult) {
    winner = options.manualResult.winnerParticipantId;
    loser = options.manualResult.loserParticipantId;
  } else {
    if (!tournamentMatch.matchId) return { readyMatches: [], autoAdvancedMatches: [] };
    const scores = getMatchById(tournamentMatch.matchId);
    if (!scores) return undefined;

    if (scores.team_1_score > scores.team_2_score) {
      winner = team1.participantId;
      loser = team2.participantId;
    } else if (scores.team_2_score > scores.team_1_score) {
      winner = team2.participantId;
      loser = team1.participantId;
    } else if (options?.autoAdvanceOnDraw) {
      winner = team1.participantId;
      loser = team2.participantId;
    } else {
      return undefined;
    }
  }

  if (!winner || !loser) return undefined;

  const finalMatch = getTournamentMatchByRoundAndPosition(tournamentMatch.tournamentId, 2, 1);
  const bronzeMatch = getTournamentMatchByRoundAndPosition(tournamentMatch.tournamentId, 2, 2);
  if (!finalMatch || !bronzeMatch) return undefined;

  setTournamentMatchPlayer(finalMatch.id, winner, tournamentMatch.roundPosition as 1 | 2);
  setTournamentMatchPlayer(bronzeMatch.id, loser, tournamentMatch.roundPosition as 1 | 2);

  const readyMatches: number[] = [];
  const autoAdvancedMatches: number[] = [];

  const finalPlayers = listTournamentMatchPlayers(finalMatch.id);
  if (finalPlayers.length === 2) {
    const updated = updateTournamentMatchStatus(finalMatch.id, 'ready');
    if (updated) readyMatches.push(finalMatch.id);
  }

  const bronzePlayers = listTournamentMatchPlayers(bronzeMatch.id);
  if (bronzePlayers.length === 2) {
    const updated = updateTournamentMatchStatus(bronzeMatch.id, 'ready');
    if (updated) readyMatches.push(bronzeMatch.id);
  }

  return { readyMatches, autoAdvancedMatches };
}

/**
 * Check if tournament has only one active participant remaining.
 * If so, automatically declare them champion and complete the tournament.
 * Returns the winner participant ID if auto-completion occurred, undefined otherwise.
 */
export function checkAndAutoCompleteTournament(tournamentId: number): number | undefined {
  const participants = listTournamentParticipants(tournamentId);

  // Filter for active participants (not eliminated, forfeited, etc.)
  const activeParticipants = participants.filter(
    (p) =>
      p.status !== 'eliminated' &&
      p.status !== 'forfeited' &&
      p.status !== 'champion' &&
      p.status !== 'silver' &&
      p.status !== 'third_place',
  );

  // If only one active participant remains, make them champion
  if (activeParticipants.length === 1) {
    const winner = activeParticipants[0]!;

    console.log(
      `[TournamentOrchestrator] Auto-completing tournament ${tournamentId}, only one participant remains: ${winner.alias} (ID: ${winner.id})`,
    );

    // Mark winner as champion
    updateTournamentParticipant(winner.id, { status: 'champion' });

    // Mark all incomplete matches as completed
    const matches = listTournamentMatches(tournamentId);
    for (const match of matches) {
      if (match.status !== 'completed') {
        updateTournamentMatchStatus(match.id, 'completed', { setCompletedAt: true });
      }
    }

    // Complete the tournament
    const completed = markTournamentCompleted(tournamentId);
    if (!completed) {
      updateTournamentStatus(tournamentId, 'completed');
    }

    return winner.id;
  }

  return undefined;
}
