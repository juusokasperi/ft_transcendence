import db from '../db/client.ts';
import { listTournamentParticipants } from '../db/queries/tournamentParticipants.ts';
import {
  addTournamentMatchPlayer,
  createTournamentMatch,
  listTournamentMatches,
} from '../db/queries/tournamentMatches.ts';
import type {
  TournamentParticipant,
  TournamentMatch,
} from '../types/types.ts';

export type BracketGenerationSummary = {
  tournamentId: number;
  participantCount: number;
  bracketSize: number;
  totalRounds: number;
  createdMatches: number;
  assignedParticipants: number;
  skippedReason?: 'insufficientParticipants' | 'matchesAlreadyExist';
};

function sortParticipantsForBracket(participants: TournamentParticipant[]): TournamentParticipant[] {
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

function nextPowerOfTwo(n: number): number {
  if (n <= 0) return 0;
  return 1 << Math.ceil(Math.log2(n));
}

export function generateSingleEliminationBracket(tournamentId: number): BracketGenerationSummary {
  const participants = listTournamentParticipants(tournamentId);
  const participantCount = participants.length;

  if (participantCount < 2) {
    return {
      tournamentId,
      participantCount,
      bracketSize: participantCount,
      totalRounds: 0,
      createdMatches: 0,
      assignedParticipants: 0,
      skippedReason: 'insufficientParticipants',
    };
  }

  const existingMatches = listTournamentMatches(tournamentId);
  if (existingMatches.length > 0) {
    const bracketSize = nextPowerOfTwo(participantCount) || participantCount;
    const totalRounds = Math.max(1, Math.ceil(Math.log2(bracketSize || 1)));
    return {
      tournamentId,
      participantCount,
      bracketSize,
      totalRounds,
      createdMatches: 0,
      assignedParticipants: 0,
      skippedReason: 'matchesAlreadyExist',
    };
  }

  const sortedParticipants = sortParticipantsForBracket(participants);
  const bracketSize = nextPowerOfTwo(sortedParticipants.length);
  const totalRounds = Math.max(1, Math.ceil(Math.log2(bracketSize)));

  const slots: Array<TournamentParticipant | null> = Array(bracketSize).fill(null);
  sortedParticipants.forEach((participant, index) => {
    slots[index] = participant;
  });

  const transaction = db.transaction(() => {
    let createdMatches = 0;
    let assignedParticipants = 0;

    for (let round = 1; round <= totalRounds; round += 1) {
      const matchesInRound = bracketSize / Math.pow(2, round);
      for (let position = 1; position <= matchesInRound; position += 1) {
        const match = createTournamentMatch({
          tournamentId,
          roundNumber: round,
          roundPosition: position,
        });

        if (!match) throw new Error('Failed to create tournament match');
        createdMatches += 1;

        if (round === 1) {
          const slotIndex = (position - 1) * 2;
          const participantA = slots[slotIndex] ?? null;
          const participantB = slots[slotIndex + 1] ?? null;

          if (participantA) {
            const assignment = addTournamentMatchPlayer(match.id, participantA.id, 1);
            if (!assignment) throw new Error('Failed to assign participant to slot 1');
            assignedParticipants += 1;
          }
          if (participantB) {
            const assignment = addTournamentMatchPlayer(match.id, participantB.id, 2);
            if (!assignment) throw new Error('Failed to assign participant to slot 2');
            assignedParticipants += 1;
          }
        }
      }
    }

    return {
      tournamentId,
      participantCount: sortedParticipants.length,
      bracketSize,
      totalRounds,
      createdMatches,
      assignedParticipants,
    } satisfies BracketGenerationSummary;
  });

  return transaction();
}
